#!/usr/bin/env python3
"""
Copy Studio 统一后端服务
================================================
把散在浏览器里的敏感能力收拢到服务端：
  1. /api/llm/chat    —— LLM 流式/非流式代理（Key 只存服务端，不落地浏览器）
  2. /api/llm/vision  —— LLM 视觉分析代理（运营计划识图）
  3. /api/extract     —— 视频文案提取（复用 video-extract.py 的 extract()）
  4. /extract         —— 兼容旧前端的提取端点（同 /api/extract）
  5. 静态托管 index.html / css / js（单端口同源，本地/云端一致）

安全：
  - 静态托管为显式白名单：只公开 index.html / standalone.html / css/ / js/
    server/、.git/、.env、数据库、脚本、文档一律不可通过 HTTP 访问
  - X-API-Key 鉴权：设置 API_KEYS / TENANT_KEYS 后强制校验
  - fail closed：REQUIRE_AUTH=true、监听非回环地址、或配置了非回环 CORS 来源时，
    未配置访问密钥则拒绝启动
  - 默认不信任 Origin: null（file:// 页面），需显式 CORS_ALLOW_NULL=true 且已配置密钥
  - 服务端限流：per-IP / per-Key 内存滑动窗口（rewrite/plan/extract 三档），重启清零
  - 上游错误只回传稳定错误码与脱敏文案，原始响应正文进脱敏日志

启动：
  uvicorn app:app --host 127.0.0.1 --port 8765
  # 或
  python app.py
"""

import hashlib
import importlib.util
import ipaddress
import json
import os
import re
import socket
import sqlite3
import tempfile
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse
from contextlib import asynccontextmanager, closing

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

# ===== 路径配置 =====
SCRIPT_DIR = Path(__file__).parent
WWW_ROOT = SCRIPT_DIR.parent

# 统一 .env 解析实现（与 start-local.sh 共用，避免重复实现导致状态不一致）
import envconfig  # server/envconfig.py：同目录直 import（运行时为脚本目录，测试已注入 sys.path）


# 配置加载开关：默认「环境变量优先」，设 COPY_STUDIO_DOTENV_OVERRIDE=1 反转为「.env 优先」
_DOTENV_OVERRIDE = os.environ.get("COPY_STUDIO_DOTENV_OVERRIDE", "").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
_DOTENV_KEYS = set()      # .env 中出现的键名（仅键名，绝不存值）
_DOTENV_CONFLICTS = []    # 与环境变量同名但值不同的键名（仅键名）


def _parse_dotenv(path):
    """兼容旧测试与内部调用：委托 envconfig.parse_env_file。"""
    return envconfig.parse_env_file(Path(path))


def _load_dotenv(path, override=None):
    """兼容旧测试与内部调用：委托 envconfig.load_env_file，并把结果写入模块级全局。

    默认沿用 _DOTENV_OVERRIDE；override=True 时反转为「.env 优先」。
    真实解析逻辑已下沉到 server/envconfig.py（与 start-local.sh 共用）。
    """
    if override is None:
        override = _DOTENV_OVERRIDE
    file_keys, conflicts = envconfig.load_env_file(Path(path), os.environ, override=override)
    _DOTENV_KEYS.update(file_keys)
    _DOTENV_CONFLICTS.extend(conflicts)
    return file_keys, conflicts


_load_dotenv(SCRIPT_DIR / ".env")

# ===== 运行时安全策略（fail closed）=====
HOST = os.environ.get("HOST", "127.0.0.1")

# 远程视频 URL 提取开关：
#   auto（默认）—— 仅回环本机开放模式可用；非回环或要求鉴权时自动关闭
#   true        —— 强制开启（ yt-dlp 后续重定向与媒体子请求无法逐跳校验，仅在可信网络使用）
#   false       —— 强制关闭，只接受网页上传文件
ALLOW_REMOTE_URL = os.environ.get("ALLOW_REMOTE_URL", "auto").strip().lower()

# 视频域名白名单（逗号分隔）；留空表示不限制域名，仍受公网地址校验约束
MEDIA_HOST_ALLOWLIST = [
    h.strip().lower().rstrip(".")
    for h in os.environ.get("MEDIA_HOST_ALLOWLIST", "").split(",")
    if h.strip()
]

# 是否允许 http 明文上游（本地 mock 联调用；默认关闭）
ALLOW_INSECURE_LLM_HTTP = os.environ.get("ALLOW_INSECURE_LLM_HTTP", "false").lower() in {
    "1", "true", "yes", "on",
}

# 是否允许 file:// 页面（Origin: null）调用本机接口；默认关闭
CORS_ALLOW_NULL = os.environ.get("CORS_ALLOW_NULL", "false").lower() in {
    "1", "true", "yes", "on",
}

# 云厂商元数据地址与内网域名（除 IP 段判断外再按名字拦一道）
_METADATA_HOSTS = {
    "metadata.google.internal", "metadata.goog", "169.254.169.254",
    "100.100.100.200", "metadata.azure.com", "nova.clouds.archive.ubuntu.com",
}
_INTERNAL_HOST_SUFFIXES = (".localhost", ".local", ".internal", ".localdomain", ".home.arpa")

# 日志脱敏：抹掉一切形似密钥/令牌的内容
_SECRET_PATTERN = re.compile(
    r"(sk-[A-Za-z0-9_\-]{6,}|nvapi-[A-Za-z0-9_\-]{6,}|Bearer\s+\S+|[A-Za-z0-9_\-]{32,})"
)


def _redact(value) -> str:
    """把可能含密钥/长令牌的文本脱敏后再写入日志。"""
    return _SECRET_PATTERN.sub("[REDACTED]", str(value)[:500])


def _log_upstream_error(status, body):
    """上游错误明细只进日志（脱敏），绝不回传浏览器。"""
    print(
        f"[copy-studio] upstream error status={status} detail={_redact(body)}",
        flush=True,
    )


def _llm_provider_mismatch_response():
    """密钥前缀暗示的厂商与上游 Base 主机暗示的厂商不一致：混合厂商调用必 401。

    明确拦截并返回 503，保留离线功能，绝不拿 A 厂密钥打 B 厂端点。
    """
    cfg = envconfig.resolve_llm_config(os.environ, _DOTENV_KEYS)
    key_provider = cfg.get("key_provider", "unknown")
    base_provider = cfg.get("base_provider", "unknown")
    key_label = _PROVIDER_LABELS.get(key_provider, "未知厂商")
    base_label = _PROVIDER_LABELS.get(base_provider, "未知厂商")
    detail = (
        f"在线 AI 凭证组厂商不一致：密钥疑似 {key_label}，但上游地址指向 {base_label}。"
        "混合厂商调用会返回 401。请统一 LLM_API_KEY/SENSENOVA_API_KEY 与 "
        "LLM_API_BASE/LLM_MODEL 的厂商来源后再发起请求。"
    )
    print(
        f"[copy-studio] LLM provider mismatch: key={key_label} base={base_label}",
        flush=True,
    )
    return JSONResponse(
        {
            "ok": False,
            "error": detail,
            "error_code": E_LLM_PROVIDER_MISMATCH,
            "key_provider": key_provider,
            "base_provider": base_provider,
        },
        status_code=503,
    )


def _is_non_loopback_host(host: str) -> bool:
    """0.0.0.0、::、其他域名、空值一律视为非回环（保守）。"""
    value = (host or "").strip().lower()
    if not value or value in {"0.0.0.0", "::", "[::]", "*"}:
        return True
    # localhost 及其子域按 RFC 6761 保留为回环
    if value == "localhost" or value.endswith(".localhost"):
        return False
    try:
        return not ipaddress.ip_address(value.strip("[]")).is_loopback
    except ValueError:
        return True


def _local_open_mode() -> bool:
    """回环 + 未配置密钥 + 未要求鉴权 = 本机开放模式（仅个人开发用）。"""
    return (not API_KEYS) and (not REQUIRE_AUTH) and not _is_non_loopback_host(HOST)


def _remote_url_allowed() -> bool:
    if ALLOW_REMOTE_URL == "true":
        return True
    if ALLOW_REMOTE_URL == "false":
        return False
    return _local_open_mode()


def _cors_has_non_loopback(origins) -> bool:
    for origin in origins:
        if origin == "null":
            return True
        try:
            hostname = (urlparse(origin).hostname or "").lower()
        except ValueError:
            return True
        if hostname not in {"localhost", "127.0.0.1", "::1"}:
            return True
    return False


def _startup_guard(host: str = None) -> None:
    """fail closed：任何“对外暴露”的组合，在没有访问密钥时都必须拒绝启动。"""
    host = HOST if host is None else host
    if REQUIRE_AUTH and not API_KEYS:
        raise RuntimeError(
            "REQUIRE_AUTH=true 但未配置 TENANT_KEYS/API_KEYS，拒绝启动（fail closed）"
        )
    if _is_non_loopback_host(host) and not API_KEYS:
        raise RuntimeError(
            f"监听非回环地址 {host!r} 时必须配置 TENANT_KEYS/API_KEYS，拒绝启动（fail closed）"
        )
    if _cors_has_non_loopback(CORS_ORIGINS) and not API_KEYS:
        raise RuntimeError(
            "CORS_ORIGINS 含非回环来源时必须配置 TENANT_KEYS/API_KEYS，拒绝启动（fail closed）"
        )


# ===== LLM 配置（服务端环境变量，客户端不可覆盖） =====
LLM_API_KEY = os.environ.get("LLM_API_KEY") or os.environ.get("SENSENOVA_API_KEY") or ""
LLM_API_BASE = (os.environ.get("LLM_API_BASE") or "https://token.sensenova.cn/v1").rstrip("/")
LLM_MODEL = os.environ.get("LLM_MODEL") or "deepseek-v4-flash"

# ===== 鉴权与租户映射 =====
# 推荐格式：TENANT_KEYS=store-shanghai:secret-a,store-suzhou:secret-b
# 兼容旧格式 API_KEYS=secret-a,secret-b；此时租户名使用不可逆哈希，不把密钥写入数据库。
_TENANT_KEYS = {}
for _entry in os.environ.get("TENANT_KEYS", "").split(","):
    _tenant, _sep, _key = _entry.partition(":")
    if _sep and _tenant.strip() and _key.strip():
        _TENANT_KEYS[_key.strip()] = _tenant.strip()[:80]
API_KEYS = [k.strip() for k in os.environ.get("API_KEYS", "").split(",") if k.strip()]
API_KEYS = list(dict.fromkeys(API_KEYS + list(_TENANT_KEYS.keys())))
REQUIRE_AUTH = os.environ.get("REQUIRE_AUTH", "false").lower() in {"1", "true", "yes", "on"}


def _tenant_for_key(key):
    if not API_KEYS or not key or key not in API_KEYS:
        return None
    if key in _TENANT_KEYS:
        return _TENANT_KEYS[key]
    return "tenant-" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]


# ===== 持久化存储 =====
DATA_DIR = Path(os.environ.get("DATA_DIR", str(SCRIPT_DIR / ".data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = Path(os.environ.get("DB_PATH", str(DATA_DIR / "copy-studio.sqlite3")))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
DB_MAX_PAYLOAD_BYTES = int(os.environ.get("DB_MAX_PAYLOAD_BYTES", 8 * 1024 * 1024))
LLM_MAX_BODY_BYTES = int(os.environ.get("LLM_MAX_BODY_BYTES", 12 * 1024 * 1024))
EXTRACT_MAX_BODY_BYTES = int(os.environ.get("EXTRACT_MAX_BODY_BYTES", 300 * 1024 * 1024))


def _db_connect():
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _init_db():
    with closing(_db_connect()) as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS records (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_records_tenant_kind_time ON records(tenant_id, kind, created_at DESC)")
        conn.commit()


_init_db()

# ===== 限流（内存滑动窗口） =====
# 与前端 guard.js 保持一致的额度；服务端强制，无法靠清缓存绕过。
RATE_RULES = {
    "rewrite": {"hour": 60, "day": 200},
    "plan": {"hour": 30, "day": 100},
    "extract": {"hour": 30, "day": 100},
}
_limit_lock = threading.Lock()
_limits = {}  # ident -> {"rewrite": [ts...], "rewrite_day": [ts...], ...}

# ===== 限流后端（默认内存，可选 Redis）=====
# 默认：单进程有效。多 worker / 多 host 部署时配额按 worker 数叠加 →
# 通过 RATE_LIMIT_URL=redis://... 切到 Redis 后端，集中配额、跨进程一致。
# 边界声明见 server/README.md「## 限流」。
RATE_LIMIT_REDIS_URL = os.environ.get("RATE_LIMIT_URL", "").strip()
_redis_rate_client = None
if RATE_LIMIT_REDIS_URL:
    try:
        import redis as _redis_lib  # 可选依赖，未安装即忽略
        _redis_rate_client = _redis_lib.Redis.from_url(
            RATE_LIMIT_REDIS_URL, decode_responses=True, socket_timeout=2
        )
        _redis_rate_client.ping()
    except Exception as _rate_init_err:
        import sys as _sys
        print(
            f"[copy-studio] Redis 限流后端初始化失败，回退到内存：{_rate_init_err}",
            file=_sys.stderr,
            flush=True,
        )
        _redis_rate_client = None

# Sliding window via Redis sorted set + Lua 保证原子性；member 带随机后缀防同毫秒碰撞
_REDIS_SLIDING_LUA = """
local h = KEYS[1]
local d = KEYS[2]
local now = tonumber(ARGV[1])
local member = ARGV[2]
local hm = tonumber(ARGV[3])
local dm = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', h, '-inf', now - 3600)
redis.call('ZREMRANGEBYSCORE', d, '-inf', now - 86400)
local hc = redis.call('ZCARD', h)
local dc = redis.call('ZCARD', d)
if dc >= dm then return {0, 1, dc} end
if hc >= hm then return {0, 2, hc} end
redis.call('ZADD', h, now, member)
redis.call('ZADD', d, now, member)
redis.call('EXPIRE', h, 3700)
redis.call('EXPIRE', d, 86500)
return {1, 0, 0}
"""
_redis_sliding_script = None
if _redis_rate_client is not None:
    try:
        _redis_sliding_script = _redis_rate_client.register_script(_REDIS_SLIDING_LUA)
    except Exception:
        _redis_sliding_script = None


def _check_rate_redis(ident: str, action: str, rule: dict):
    """Redis 后端的滑动窗口；脚本加载或调用失败时降级为 allow（fail open）。"""
    if _redis_sliding_script is None:
        return True, None
    now = time.time()
    member = f"{now}:{uuid.uuid4().hex[:8]}"
    hour_key = f"rl:{ident}:{action}:h"
    day_key = f"rl:{ident}:{action}:d"
    try:
        ok_flag, deny_kind, used = _redis_sliding_script(
            keys=[hour_key, day_key],
            args=[now, member, rule["hour"], rule["day"]],
        )
    except Exception as _e:
        import sys as _sys
        print(f"[copy-studio] Redis 限流调用失败，降级为 allow：{_e}", file=_sys.stderr, flush=True)
        return True, None
    if int(ok_flag) == 1:
        return True, None
    if int(deny_kind) == 1:
        return False, {"daily": True, "dayUsed": int(used), "dayMax": rule["day"]}
    return False, {"daily": False, "hourUsed": int(used), "hourMax": rule["hour"]}


def _check_rate(ident: str, action: str):
    """返回 (ok, detail)；ok=False 时 detail 为拦截原因。内存/Redis 自动派发。"""
    rule = RATE_RULES.get(action)
    if not rule:
        return True, None
    if _redis_rate_client is not None:
        return _check_rate_redis(ident, action, rule)
    now = time.time()
    with _limit_lock:
        bucket = _limits.setdefault(ident, {})
        hour_arr = [t for t in bucket.get(action, []) if now - t < 3600]
        day_arr = [t for t in bucket.get(action + "_d", []) if now - t < 86400]
        if len(day_arr) >= rule["day"]:
            return False, {"daily": True, "dayUsed": len(day_arr), "dayMax": rule["day"]}
        if len(hour_arr) >= rule["hour"]:
            return False, {"daily": False, "hourUsed": len(hour_arr), "hourMax": rule["hour"]}
        hour_arr.append(now)
        day_arr.append(now)
        bucket[action] = hour_arr
        bucket[action + "_d"] = day_arr
        return True, None


def _request_key(request: Request):
    return request.headers.get("X-API-Key") or request.headers.get("x-api-key")


def _trusted_local_request(request: Request):
    """本机开放模式的可信判断。

    - 客户端必须是回环地址；
    - 无 Origin：同源请求（浏览器对本源 GET 不携带 Origin）或本机 curl，放行；
    - Origin: null：file:// 页面发起的请求，明确拒绝（除非显式开启 CORS_ALLOW_NULL
      且已配置访问密钥，此时由鉴权分支处理，本机开放模式不再兜底）。
    """
    try:
        client_host = request.client.host if request.client else ""
        if not ipaddress.ip_address(client_host).is_loopback:
            return False
    except ValueError:
        return False

    origin = request.headers.get("origin")
    if not origin:
        return True
    if origin.strip().lower() == "null":
        return False
    try:
        origin_host = (urlparse(origin).hostname or "").lower()
        return origin_host in {"localhost", "127.0.0.1", "::1"}
    except ValueError:
        return False


def _tenant_id(request: Request):
    """根据服务端访问密钥确定租户；未强制鉴权时仅允许本机同源请求。"""
    tenant = _tenant_for_key(_request_key(request))
    if tenant:
        return tenant
    if not API_KEYS and not REQUIRE_AUTH and _trusted_local_request(request):
        return "local"
    return None


def _client_ident(request: Request) -> str:
    """限流标识只使用租户或 IP 摘要，不把 API Key 原文放进内存。"""
    tenant = _tenant_id(request)
    if tenant:
        return "tenant:" + tenant
    host = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        host = forwarded.split(",")[0].strip() or host
    return "ip:" + hashlib.sha256(host.encode("utf-8")).hexdigest()[:16]


def _authorized(request: Request) -> bool:
    return _tenant_id(request) is not None


def _json_size(value) -> int:
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def _record_history(tenant_id: str, kind: str, title: str, payload):
    allowed = {"generation", "rewrite", "extract", "plan", "collector"}
    if kind not in allowed:
        raise ValueError("不支持的历史类型")
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > DB_MAX_PAYLOAD_BYTES:
        raise ValueError(f"历史数据过大（上限 {DB_MAX_PAYLOAD_BYTES} 字节）")
    record_id = uuid.uuid4().hex
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with closing(_db_connect()) as conn:
        conn.execute(
            "INSERT INTO records(id, tenant_id, kind, title, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (record_id, tenant_id, kind, str(title or "")[:200], encoded, created_at),
        )
        conn.commit()
    return {"id": record_id, "kind": kind, "title": str(title or "")[:200], "created_at": created_at}


def _list_history(tenant_id: str, kind, limit: int):
    limit = max(1, min(int(limit or 20), 100))
    query = "SELECT id, kind, title, payload, created_at FROM records WHERE tenant_id = ?"
    args = [tenant_id]
    if kind:
        query += " AND kind = ?"
        args.append(kind)
    query += " ORDER BY created_at DESC LIMIT ?"
    args.append(limit)
    with closing(_db_connect()) as conn:
        rows = conn.execute(query, args).fetchall()
    out = []
    for row in rows:
        try:
            payload = json.loads(row["payload"])
        except (TypeError, json.JSONDecodeError):
            payload = None
        out.append({
            "id": row["id"], "kind": row["kind"], "title": row["title"],
            "payload": payload, "created_at": row["created_at"],
        })
    return out


def _delete_history(tenant_id: str, kind=None):
    with closing(_db_connect()) as conn:
        if kind:
            cur = conn.execute("DELETE FROM records WHERE tenant_id = ? AND kind = ?", (tenant_id, kind))
        else:
            cur = conn.execute("DELETE FROM records WHERE tenant_id = ?", (tenant_id,))
        conn.commit()
        return cur.rowcount


def _authorized_response(request: Request):
    if _authorized(request):
        return None
    return JSONResponse({"ok": False, "error": "未授权：缺少合法的 X-API-Key"}, status_code=401)


async def _read_json(request: Request, max_bytes: int = DB_MAX_PAYLOAD_BYTES):
    raw = await request.body()
    if len(raw) > max_bytes:
        raise ValueError(f"请求体过大（上限 {max_bytes} 字节）")
    return json.loads(raw)


def _safe_backend_url():
    parsed = urlparse(LLM_API_BASE)
    if not parsed.hostname:
        return False
    if parsed.scheme == "https":
        return True
    # 仅本地 mock 联调可显式开启明文 http
    return ALLOW_INSECURE_LLM_HTTP and parsed.scheme == "http"


# 上游失败只回传稳定错误码与脱敏文案，原始正文进日志
UPSTREAM_ERROR_CODE = "E_UPSTREAM"
UPSTREAM_ERROR_MESSAGE = "上游模型服务调用失败，请稍后重试"

# 厂商不匹配：密钥前缀暗示的厂商与 Base 主机暗示的厂商不一致，必 401，明确拦截
E_LLM_PROVIDER_MISMATCH = "E_LLM_PROVIDER_MISMATCH"
_PROVIDER_LABELS = {
    "nvidia": "NVIDIA",
    "sensenova": "商汤 SenseNova",
    "unknown": "未知厂商",
}


def _host_resolves_to_public_ip(host: str, port: int) -> bool:
    """解析并断言该主机所有地址都是公网地址。"""
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, OSError, ValueError, UnicodeError):
        return False
    addresses = {info[4][0] for info in infos}
    if not addresses:
        return False
    for address in addresses:
        try:
            ip = ipaddress.ip_address(address.split("%")[0])
        except ValueError:
            return False
        # is_global 一并覆盖回环/私网/链路本地/多播/保留/未指定/CGNAT(100.64.0.0/10)
        if not ip.is_global:
            return False
    return True


def _validate_public_media_url(value):
    """限制视频下载到公网 HTTP(S)。

    诚实边界：这里只校验调用方提交的初始 URL。yt-dlp 后续的重定向与媒体子请求
    由 yt-dlp 自行发起，本服务无法逐跳校验。因此远程 URL 提取在非本机开放模式下
    默认关闭（见 _remote_url_allowed），云端只保留文件上传。
    """
    if not isinstance(value, str) or not value or len(value) > 4096:
        return False
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    if parsed.username or parsed.password:
        return False
    host = parsed.hostname.lower().rstrip(".")
    if not host:
        return False
    if host in _METADATA_HOSTS or host.endswith(_INTERNAL_HOST_SUFFIXES):
        return False
    if MEDIA_HOST_ALLOWLIST:
        if not any(host == d or host.endswith("." + d) for d in MEDIA_HOST_ALLOWLIST):
            return False
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError:
        return False
    if port not in {80, 443, 8080, 8443}:
        return False
    return _host_resolves_to_public_ip(host, port)


def _check_rate(ident: str, action: str):
    """返回 (ok, detail)；ok=False 时 detail 为拦截原因"""
    rule = RATE_RULES.get(action)
    if not rule:
        return True, None
    now = time.time()
    with _limit_lock:
        bucket = _limits.setdefault(ident, {})
        hour_arr = [t for t in bucket.get(action, []) if now - t < 3600]
        day_arr = [t for t in bucket.get(action + "_d", []) if now - t < 86400]
        if len(day_arr) >= rule["day"]:
            return False, {"daily": True, "dayUsed": len(day_arr), "dayMax": rule["day"]}
        if len(hour_arr) >= rule["hour"]:
            return False, {"daily": False, "hourUsed": len(hour_arr), "hourMax": rule["hour"]}
        hour_arr.append(now)
        day_arr.append(now)
        bucket[action] = hour_arr
        bucket[action + "_d"] = day_arr
        return True, None


# ===== 加载 video-extract.py 的 extract()（同步阻塞，在线程池中运行） =====
_ve_module = None


def _load_extract_engine():
    global _ve_module
    if _ve_module is not None:
        return _ve_module
    spec = importlib.util.spec_from_file_location(
        "video_extract", str(SCRIPT_DIR / "video-extract.py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    _ve_module = mod
    return mod


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    # uvicorn app:app 也必须 fail closed，不能绕过启动守卫
    _startup_guard()
    yield


app = FastAPI(title="Copy Studio 后端", docs_url=None, redoc_url=None, lifespan=_lifespan)

# 跨域来源默认只允许本机回环。
# 默认不再包含 "null"：任何本地 file:// 页面都不应调用本机后端。
# 需要 GitHub Pages 等远端来源时用 CORS_ORIGINS 追加，此时启动守卫会强制要求访问密钥。
_default_origins = [
    "http://127.0.0.1:8765",
    "http://localhost:8765",
]
CORS_ORIGINS = [x.strip().rstrip("/") for x in os.environ.get("CORS_ORIGINS", "").split(",") if x.strip()] or list(_default_origins)
# Origin: null 需显式开启；开启后由 _startup_guard 强制要求访问密钥
if CORS_ALLOW_NULL and "null" not in CORS_ORIGINS:
    CORS_ORIGINS.append("null")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)


# ============================================================
# 安全响应头中间件
# ============================================================
# 路径感知 CSP：
#   - index.html / 其它静态资源 走严格策略（script-src 'self'，禁止内联）
#   - standalone.html 单文件构建含内联脚本，需放行 'unsafe-inline'
# 统一附加 nosniff / X-Frame-Options / Referrer-Policy / Permissions-Policy，
# 并将框架默认 Server 头重写为业务标识，避免泄漏 uvicorn 版本。
_CSP_BASE = (
    "default-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'"
)
_CSP_STRICT = _CSP_BASE + "; script-src 'self'"
_CSP_INPLACE = _CSP_BASE + "; script-src 'self' 'unsafe-inline'"

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
}


@app.middleware("http")
async def _security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    path = (request.url.path or "").lower()
    csp = _CSP_INPLACE if "standalone.html" in path else _CSP_STRICT
    response.headers.setdefault("Content-Security-Policy", csp)
    for key, value in SECURITY_HEADERS.items():
        response.headers.setdefault(key, value)
    # 伪造 Server 头：MutableHeaders 不提供 pop()，使用 del+赋值保证唯一
    try:
        del response.headers["Server"]
    except KeyError:
        pass
    response.headers["Server"] = "CopyStudio"
    return response


# ============================================================
# LLM 代理：流式 / 非流式
# ============================================================
def _validate_messages(messages, allow_images=False):
    if not isinstance(messages, list) or not 1 <= len(messages) <= 64:
        raise ValueError("messages 必须是 1-64 条数组")
    for message in messages:
        if not isinstance(message, dict) or message.get("role") not in {"system", "user", "assistant"}:
            raise ValueError("message 格式无效")
        content = message.get("content")
        if isinstance(content, str):
            continue
        if not allow_images or not isinstance(content, list):
            raise ValueError("message content 格式无效")
        for part in content:
            if not isinstance(part, dict) or part.get("type") not in {"text", "image_url"}:
                raise ValueError("多模态内容格式无效")
            if part.get("type") == "text" and not isinstance(part.get("text"), str):
                raise ValueError("文本内容格式无效")
            if part.get("type") == "image_url":
                image_url = part.get("image_url") or {}
                value = image_url.get("url") if isinstance(image_url, dict) else None
                if not isinstance(value, str) or not (value.startswith("data:image/") or value.startswith("https://")):
                    raise ValueError("图片地址只允许 data:image 或 HTTPS")
    return messages


def _build_chat_payload(body: dict) -> dict:
    system = body.get("system", "")
    user = body.get("user", "")
    if not isinstance(system, str) or not isinstance(user, str):
        raise ValueError("system/user 必须是字符串")
    messages = body.get("messages")
    if messages is None:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": user})
    _validate_messages(messages)
    payload = {
        # 模型和上游地址只读服务端配置，客户端不能切换或覆盖。
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": min(max(float(body.get("temperature", 0.6)), 0), 1.5),
        "top_p": min(max(float(body.get("top_p", 0.9)), 0), 1),
        "max_tokens": min(max(int(body.get("max_tokens", 2048)), 1), 4096),
        "stream": bool(body.get("stream", True)),
    }
    # Nemotron 默认可能把推理过程写进 content；业务生成关闭 thinking，直接返回成品。
    if LLM_MODEL.startswith("nvidia/nemotron"):
        payload["chat_template_kwargs"] = {"thinking": False}
    return payload


@app.post("/api/llm/chat")
async def llm_chat(request: Request):
    if not _authorized(request):
        return JSONResponse({"ok": False, "error": "未授权：缺少合法的 X-API-Key"}, status_code=401)
    if not LLM_API_KEY or not _safe_backend_url():
        # 明确区分「未配置」与「上游故障」，前端据此显示「在线 AI 未配置」
        return JSONResponse(
            {
                "ok": False,
                "error": "在线 AI 未配置：服务端未设置 LLM_API_KEY / SENSENOVA_API_KEY",
                "error_code": "E_LLM_NOT_CONFIGURED",
            },
            status_code=503,
        )
    # 密钥格式与上游厂商不一致：混合厂商调用必 401，明确拦截并保留离线功能
    if envconfig.resolve_llm_config(os.environ, _DOTENV_KEYS)["provider_mismatch"]:
        return _llm_provider_mismatch_response()

    ident = _client_ident(request)
    ok, detail = _check_rate(ident, "rewrite")
    if not ok:
        return JSONResponse({"ok": False, "error": "限流", "limit": detail}, status_code=429)

    try:
        body = await _read_json(request, LLM_MAX_BODY_BYTES)
        if not isinstance(body, dict):
            raise ValueError("请求必须是 JSON 对象")
        payload = _build_chat_payload(body)
    except (ValueError, TypeError, json.JSONDecodeError):
        return JSONResponse({"ok": False, "error": "请求格式无效"}, status_code=400)
    upstream = LLM_API_BASE + "/chat/completions"
    headers = {"Authorization": "Bearer " + LLM_API_KEY, "Content-Type": "application/json"}

    try:
        if payload["stream"]:
            async def _stream():
                try:
                    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
                        async with client.stream("POST", upstream, json=payload, headers=headers) as r:
                            if r.status_code != 200:
                                raw = (await r.aread()).decode("utf-8", "replace")
                                _log_upstream_error(r.status_code, raw)
                                # 不回传上游原始正文，避免泄露上游实现细节
                                yield f"data: {json.dumps({'error': {'message': UPSTREAM_ERROR_MESSAGE, 'code': UPSTREAM_ERROR_CODE, 'status': r.status_code}}, ensure_ascii=False)}\n\n"
                                yield "data: [DONE]\n\n"
                                return
                            async for chunk in r.aiter_bytes():
                                yield chunk
                except httpx.HTTPError as e:
                    _log_upstream_error("stream", e)
                    yield f"data: {json.dumps({'error': {'message': UPSTREAM_ERROR_MESSAGE, 'code': UPSTREAM_ERROR_CODE}}, ensure_ascii=False)}\n\n"
                    yield "data: [DONE]\n\n"
            return StreamingResponse(_stream(), media_type="text/event-stream")

        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
            r = await client.post(upstream, json=payload, headers=headers)
            if r.status_code != 200:
                _log_upstream_error(r.status_code, r.text)
                return JSONResponse(
                    {
                        "ok": False,
                        "error": UPSTREAM_ERROR_MESSAGE,
                        "error_code": UPSTREAM_ERROR_CODE,
                        "status": r.status_code,
                    },
                    status_code=502,
                )
            data = r.json()
            content = (
                (data.get("choices") or [{}])[0]
                .get("message", {})
                .get("content")
            )
            return JSONResponse({"ok": True, "content": content})
    except httpx.HTTPError as e:
        _log_upstream_error("chat", e)
        return JSONResponse(
            {"ok": False, "error": UPSTREAM_ERROR_MESSAGE, "error_code": UPSTREAM_ERROR_CODE},
            status_code=502,
        )


# ============================================================
# LLM 视觉分析代理（运营计划识图 / 文档分析）
# ============================================================
@app.post("/api/llm/vision")
async def llm_vision(request: Request):
    if not _authorized(request):
        return JSONResponse({"ok": False, "error": "未授权：缺少合法的 X-API-Key"}, status_code=401)
    if not LLM_API_KEY or not _safe_backend_url():
        # 明确区分「未配置」与「上游故障」，前端据此显示「在线 AI 未配置」
        return JSONResponse(
            {
                "ok": False,
                "error": "在线 AI 未配置：服务端未设置 LLM_API_KEY / SENSENOVA_API_KEY",
                "error_code": "E_LLM_NOT_CONFIGURED",
            },
            status_code=503,
        )
    # 密钥格式与上游厂商不一致：混合厂商调用必 401，明确拦截并保留离线功能
    if envconfig.resolve_llm_config(os.environ, _DOTENV_KEYS)["provider_mismatch"]:
        return _llm_provider_mismatch_response()

    ident = _client_ident(request)
    ok, detail = _check_rate(ident, "plan")
    if not ok:
        return JSONResponse({"ok": False, "error": "限流", "limit": detail}, status_code=429)

    try:
        body = await _read_json(request, LLM_MAX_BODY_BYTES)
        if not isinstance(body, dict):
            raise ValueError("请求必须是 JSON 对象")
    except (ValueError, TypeError, json.JSONDecodeError):
        return JSONResponse({"ok": False, "error": "请求格式无效"}, status_code=400)

    messages = body.get("messages")
    if messages is None:
        messages = [
            {"role": "system", "content": body.get("system", "")},
            {"role": "user", "content": body.get("user", "")},
        ]
    try:
        _validate_messages(messages, allow_images=True)
        payload = {
            # 模型和上游地址只读服务端配置，客户端不能切换或覆盖。
            "model": LLM_MODEL,
            "messages": messages,
            "temperature": min(max(float(body.get("temperature", 0.4)), 0), 1.5),
            "max_tokens": min(max(int(body.get("max_tokens", 3000)), 1), 4096),
        }
    except (ValueError, TypeError) as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
    if LLM_MODEL.startswith("nvidia/nemotron"):
        payload["chat_template_kwargs"] = {"thinking": False}
    upstream = LLM_API_BASE + "/chat/completions"
    headers = {"Authorization": "Bearer " + LLM_API_KEY, "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=10.0)) as client:
            r = await client.post(upstream, json=payload, headers=headers)
            if r.status_code != 200:
                _log_upstream_error(r.status_code, r.text)
                return JSONResponse(
                    {
                        "ok": False,
                        "error": UPSTREAM_ERROR_MESSAGE,
                        "error_code": UPSTREAM_ERROR_CODE,
                        "status": r.status_code,
                    },
                    status_code=502,
                )
            data = r.json()
            content = (
                (data.get("choices") or [{}])[0]
                .get("message", {})
                .get("content")
            )
            return JSONResponse({"ok": True, "content": content})
    except httpx.HTTPError as e:
        _log_upstream_error("vision", e)
        return JSONResponse(
            {"ok": False, "error": UPSTREAM_ERROR_MESSAGE, "error_code": UPSTREAM_ERROR_CODE},
            status_code=502,
        )


# ============================================================
# 历史记录与采集数据（SQLite，按租户隔离）
# ============================================================
@app.get("/api/history")
async def history_list(request: Request):
    unauthorized = _authorized_response(request)
    if unauthorized:
        return unauthorized
    kind = request.query_params.get("kind") or None
    if kind and kind not in {"generation", "rewrite", "extract", "plan", "collector"}:
        return JSONResponse({"ok": False, "error": "不支持的历史类型"}, status_code=400)
    try:
        limit = int(request.query_params.get("limit", "20"))
    except ValueError:
        limit = 20
    return {"ok": True, "records": _list_history(_tenant_id(request), kind, limit)}


@app.post("/api/history")
async def history_create(request: Request):
    unauthorized = _authorized_response(request)
    if unauthorized:
        return unauthorized
    try:
        body = await _read_json(request)
        kind = body.get("kind")
        title = body.get("title", "")
        payload = body.get("payload")
        if kind not in {"generation", "rewrite", "extract", "plan", "collector"}:
            return JSONResponse({"ok": False, "error": "不支持的历史类型"}, status_code=400)
        if payload is None:
            return JSONResponse({"ok": False, "error": "缺少 payload"}, status_code=400)
        record = _record_history(_tenant_id(request), kind, title, payload)
        return {"ok": True, "record": record}
    except ValueError as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=413 if "过大" in str(e) else 400)
    except (TypeError, json.JSONDecodeError):
        return JSONResponse({"ok": False, "error": "JSON 解析失败"}, status_code=400)


@app.delete("/api/history")
async def history_clear(request: Request):
    unauthorized = _authorized_response(request)
    if unauthorized:
        return unauthorized
    kind = request.query_params.get("kind") or None
    if kind and kind not in {"generation", "rewrite", "extract", "plan", "collector"}:
        return JSONResponse({"ok": False, "error": "不支持的历史类型"}, status_code=400)
    return {"ok": True, "deleted": _delete_history(_tenant_id(request), kind)}


@app.delete("/api/history/{record_id}")
async def history_delete(request: Request, record_id: str):
    unauthorized = _authorized_response(request)
    if unauthorized:
        return unauthorized
    with closing(_db_connect()) as conn:
        cur = conn.execute("DELETE FROM records WHERE tenant_id = ? AND id = ?", (_tenant_id(request), record_id))
        conn.commit()
    return {"ok": True, "deleted": cur.rowcount}


@app.get("/api/collector")
async def collector_list(request: Request):
    unauthorized = _authorized_response(request)
    if unauthorized:
        return unauthorized
    try:
        limit = int(request.query_params.get("limit", "10"))
    except ValueError:
        limit = 10
    records = _list_history(_tenant_id(request), "collector", limit)
    return {"ok": True, "records": records, "latest": records[0]["payload"] if records else None}


@app.post("/api/collector")
async def collector_create(request: Request):
    unauthorized = _authorized_response(request)
    if unauthorized:
        return unauthorized
    try:
        body = await _read_json(request, max_bytes=max(DB_MAX_PAYLOAD_BYTES, 12 * 1024 * 1024))
        if not isinstance(body, dict) or (not body.get("blobs") and not body.get("tables")):
            return JSONResponse({"ok": False, "error": "采集数据为空"}, status_code=400)
        title = str(body.get("pageUrl") or body.get("source") or "抖音来客采集数据")[:200]
        record = _record_history(_tenant_id(request), "collector", title, body)
        return {"ok": True, "record": record}
    except ValueError as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=413 if "过大" in str(e) else 400)
    except (TypeError, json.JSONDecodeError):
        return JSONResponse({"ok": False, "error": "JSON 解析失败"}, status_code=400)


# ============================================================
# 视频提取（复用 video-extract.extract，线程池中运行）
# ============================================================
def _run_extract_sync(params: dict) -> dict:
    try:
        ve = _load_extract_engine()
        # 服务端 LLM Key 兜底（提取的 LLM 后处理纠偏）
        params.setdefault("api_key", LLM_API_KEY or None)
        params.setdefault("api_base", LLM_API_BASE)
        params.setdefault("llm_model", LLM_MODEL)
        return ve.extract(**params)
    except Exception as e:
        return {"ok": False, "error": str(e)[:500], "error_code": "E999"}


async def _extract_handler(request: Request):
    if not _authorized(request):
        return JSONResponse({"ok": False, "error": "未授权：缺少合法的 X-API-Key"}, status_code=401)

    ident = _client_ident(request)
    ok, detail = _check_rate(ident, "extract")
    if not ok:
        return JSONResponse({"ok": False, "error": "限流", "limit": detail}, status_code=429)

    try:
        body = await _read_json(request, EXTRACT_MAX_BODY_BYTES)
        if not isinstance(body, dict):
            raise ValueError("请求必须是 JSON 对象")
    except (ValueError, TypeError, json.JSONDecodeError):
        return JSONResponse({"ok": False, "error": "请求格式无效"}, status_code=400)

    url = body.get("url")
    file_path = body.get("file_path")
    if not url and not file_path:
        return JSONResponse({"ok": False, "error": "请提供 url 或 file_path"}, status_code=400)
    if url and file_path:
        return JSONResponse({"ok": False, "error": "url 与 file_path 只能提供一个"}, status_code=400)
    if url and not _remote_url_allowed():
        return JSONResponse(
            {
                "ok": False,
                "error": "当前配置已关闭远程 URL 提取，请改用文件上传；"
                         "确认网络可信时可设置 ALLOW_REMOTE_URL=true 强制开启",
                "error_code": "E_REMOTE_URL_DISABLED",
            },
            status_code=403,
        )
    if url and not _validate_public_media_url(url):
        return JSONResponse({"ok": False, "error": "视频链接必须是可访问的公网 HTTP(S) 地址"}, status_code=400)
    if file_path and (not isinstance(file_path, str) or not file_path.startswith("base64:")):
        return JSONResponse({"ok": False, "error": "HTTP 接口只接受网页上传的 base64 文件，不接受服务器本地路径"}, status_code=400)

    # 前端上传文件走 base64 内联（与旧 video-extract HTTP 服务一致），这里解码到临时文件
    decoded_temp = None
    if file_path:
        import base64 as _b64
        try:
            rest = file_path[len("base64:"):]
            ext = ""
            if ".ext:" in rest:
                rest, ext = rest.split(".ext:", 1)
            ext = ext.lower().strip()
            if ext and (not re.fullmatch(r"[a-z0-9]{1,8}", ext) or ext not in {"mp4", "mov", "mkv", "avi", "webm", "m4a", "mp3", "wav", "aac", "flac", "ogg"}):
                raise ValueError("不支持的文件扩展名")
            if rest.startswith("data:"):
                rest = rest.split(",", 1)[1]
            b64_clean = rest.strip().replace(" ", "").replace("\n", "")
            b64_clean += "=" * ((-len(b64_clean)) % 4)
            raw_bytes = _b64.b64decode(b64_clean, validate=True)
            if not raw_bytes:
                raise ValueError("文件为空")
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=("." + ext) if ext else ".tmp")
            tmp.write(raw_bytes)
            tmp.close()
            file_path = tmp.name
            decoded_temp = tmp.name
        except Exception as e:
            return JSONResponse({"ok": False, "error": f"base64 文件解码失败: {e}"}, status_code=400)

    engine = body.get("engine", "auto")
    language = body.get("language", "zh")
    hotwords = body.get("hotwords")
    brand_name = body.get("brand_name")
    area_name = body.get("area_name")
    skip_llm = body.get("skip_llm", False)
    if engine not in {"auto", "funasr", "faster-whisper", "whisper"} or language not in {"zh", "en", "auto"}:
        return JSONResponse({"ok": False, "error": "engine 或 language 参数无效"}, status_code=400)
    if not isinstance(skip_llm, bool):
        return JSONResponse({"ok": False, "error": "skip_llm 必须是布尔值"}, status_code=400)
    for value, label, limit in ((hotwords, "hotwords", 1000), (brand_name, "brand_name", 200), (area_name, "area_name", 200)):
        if value is not None and (not isinstance(value, str) or len(value) > limit):
            return JSONResponse({"ok": False, "error": f"{label} 参数无效"}, status_code=400)

    params = {
        "url": url,
        "file_path": file_path,
        "engine": engine,
        "language": language,
        "hotwords": hotwords,
        "brand_name": brand_name,
        "area_name": area_name,
        # LLM 凭据、上游地址和模型只取服务端配置，忽略客户端同名字段。
        "api_key": LLM_API_KEY or None,
        "api_base": LLM_API_BASE,
        "llm_model": LLM_MODEL,
        "skip_llm": skip_llm,
    }

    import asyncio
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(None, _run_extract_sync, params)
    finally:
        if decoded_temp and os.path.exists(decoded_temp):
            try:
                os.remove(decoded_temp)
            except Exception:
                pass
    return JSONResponse(result)


@app.post("/api/extract")
async def api_extract(request: Request):
    return await _extract_handler(request)


@app.post("/extract")
async def legacy_extract(request: Request):
    return await _extract_handler(request)


# ============================================================
# 状态探测（兼容前端 checkServer）
# ============================================================
@app.get("/api/extract")
@app.get("/extract")
async def extract_status(request: Request):
    try:
        ffmpeg_ok = bool(_load_extract_engine()._ffmpeg_available())
    except Exception:
        ffmpeg_ok = False
    _llm_status = envconfig.resolve_llm_config(os.environ, _DOTENV_KEYS)
    return {
        "ok": True,
        "status": "running",
        "ffmpeg_ok": ffmpeg_ok,
        "llm_configured": bool(LLM_API_KEY and _safe_backend_url()),
        "llm_mixed_source": _llm_status["mixed_source"],
        "llm_provider_mismatch": _llm_status["provider_mismatch"],
        "auth_enabled": bool(API_KEYS),
        "auth_required": REQUIRE_AUTH,
    }


@app.get("/api/health")
async def health():
    _llm_status = envconfig.resolve_llm_config(os.environ, _DOTENV_KEYS)
    return {
        "ok": True,
        "status": "running",
        "llm_configured": bool(LLM_API_KEY and _safe_backend_url()),
        "llm_mixed_source": _llm_status["mixed_source"],
        "llm_provider_mismatch": _llm_status["provider_mismatch"],
        "auth_enabled": bool(API_KEYS),
        "auth_required": REQUIRE_AUTH,
        "storage": "sqlite",
    }


# ============================================================
# 静态托管（显式白名单）
# 只公开 index.html / standalone.html / css/ / js/。
# server/、.git/、.env、数据库、脚本、文档、备份一律不可通过 HTTP 访问。
# ============================================================
PUBLIC_PAGES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/standalone.html": "standalone.html",
}
PUBLIC_DIRS = {"css": WWW_ROOT / "css", "js": WWW_ROOT / "js"}


def _not_found():
    return JSONResponse({"ok": False, "error": "资源不存在"}, status_code=404)


@app.get("/")
@app.get("/index.html")
@app.get("/standalone.html")
async def serve_public_page(request: Request):
    """白名单页面：未列出的路径一律 404。"""
    name = PUBLIC_PAGES.get(request.url.path)
    if not name:
        return _not_found()
    path = WWW_ROOT / name
    if not path.is_file():
        return _not_found()
    return FileResponse(str(path), headers={"Cache-Control": "no-cache"})


for _mount_name, _mount_dir in PUBLIC_DIRS.items():
    if _mount_dir.is_dir():
        app.mount(
            "/" + _mount_name,
            StaticFiles(directory=str(_mount_dir), html=False),
            name=_mount_name,
        )


@app.api_route(
    "/{full_path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    include_in_schema=False,
)
async def catch_all(full_path: str):
    """兜底 404：避免任何未显式公开的仓库文件被静态服务命中。"""
    return _not_found()


# ============================================================
# CLI 入口（python app.py）
# ============================================================
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8765))
    host = os.environ.get("HOST", "127.0.0.1")

    # fail closed：不安全的组合直接拒绝启动，而不是带病运行
    try:
        _startup_guard(host)
    except RuntimeError as e:
        print(f"[copy-studio] 启动中止：{e}", flush=True)
        raise SystemExit(2)

    print(f"[copy-studio] 统一后端启动: http://{host}:{port}", flush=True)

    # 配置来源提示：只报键名与来源，绝不打印值
    if _DOTENV_CONFLICTS:
        mode = ".env 优先" if _DOTENV_OVERRIDE else "环境变量优先"
        print(
            "[copy-studio] ⚠️ 配置冲突（当前" + mode + "，以下键的 server/.env 值未生效）："
            + ", ".join(sorted(set(_DOTENV_CONFLICTS))),
            flush=True,
        )
        print(
            "[copy-studio]    让 .env 生效的方式：unset 同名环境变量，或启动时设 COPY_STUDIO_DOTENV_OVERRIDE=1",
            flush=True,
        )
    _llm = envconfig.resolve_llm_config(os.environ, _DOTENV_KEYS)
    if _llm["mixed_source"]:
        print(
            "[copy-studio] ⚠️ LLM 凭证组来源混杂（" + ", ".join(_llm["sources"]) + "）："
            "密钥、Base、模型必须作为一组配置，否则可能把凭证发错服务。",
            flush=True,
        )
    if not LLM_API_KEY:
        print(
            "[copy-studio] 在线 AI 未配置：未设置 LLM_API_KEY/SENSENOVA_API_KEY，"
            "在线生成与改写不可用；离线文案、合规检查与本地功能不受影响",
            flush=True,
        )

    print(f"[copy-studio] LLM: {LLM_API_BASE} / {LLM_MODEL} ({'已配置 Key' if LLM_API_KEY else '未配置 Key'})", flush=True)
    auth_state = "已启用租户鉴权" if API_KEYS else ("要求鉴权但未配置密钥" if REQUIRE_AUTH else "本机开放模式")
    print(f"[copy-studio] 鉴权: {auth_state}", flush=True)
    print(f"[copy-studio] 远程 URL 提取: {'开启' if _remote_url_allowed() else '关闭'}", flush=True)
    print(f"[copy-studio] CORS 来源: {', '.join(CORS_ORIGINS)}", flush=True)
    uvicorn.run(app, host=host, port=port, log_level="info", server_header=False)
