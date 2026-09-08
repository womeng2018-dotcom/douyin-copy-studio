"""统一 .env 配置解析（server/app.py 与 start-local.sh 共用）。

设计约束：
  1. 纯 Python 解析，**绝不使用 shell source/eval 执行文件内容**。
  2. 只对外暴露「键名 / 来源 / 是否已配置」，值默认不返回，调用方不得打印或回传浏览器。
  3. 密钥、Base、模型视为**一组凭证**：来源混杂意味着可能把凭证发错服务，必须能被识别并阻止。
"""

from pathlib import Path

# 构成一组 LLM 凭证的键（缺一即不完整）
LLM_KEY_VARS = ("LLM_API_KEY", "SENSENOVA_API_KEY")
LLM_BASE_VAR = "LLM_API_BASE"
LLM_MODEL_VAR = "LLM_MODEL"
LLM_GROUP_VARS = LLM_KEY_VARS + (LLM_BASE_VAR, LLM_MODEL_VAR)

DEFAULT_BASE = "https://token.sensenova.cn/v1"
DEFAULT_MODEL = "deepseek-v4-flash"

SOURCE_ENV = "env"        # 进程环境变量（CI / compose / shell 注入）
SOURCE_FILE = "file"      # server/.env
SOURCE_DEFAULT = "default"  # 代码内置默认值


def parse_env_file(path):
    """解析 .env 为 dict。注释、空行、无等号行跳过；值去空白与配对引号。"""
    path = Path(path)
    values = {}
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return values
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value
    return values


def load_env_file(path, environ, override=False):
    """把 .env 载入 environ。

    Args:
        path: .env 路径
        environ: 目标环境字典（通常是 os.environ）
        override: True 时 .env 覆盖已有环境变量；False（默认）时环境变量优先。

    Returns:
        (file_keys, conflicts) —— file_keys 为 .env 中出现的键名集合；
        conflicts 为同名但值不同的键名列表（**只含键名，绝不含值**）。
    """
    path = Path(path)
    if not path.exists():
        return set(), []
    try:
        if path.stat().st_mode & 0o077:
            path.chmod(0o600)
    except OSError:
        pass

    file_keys = set()
    conflicts = []
    for key, value in parse_env_file(path).items():
        if value == "":
            # 空值视为「未设置」：不注入 environ、不记入文件键，避免空串覆盖代码默认值
            # （例如 .env.example 模板里的 DB_MAX_PAYLOAD_BYTES= 之类占位行会导致 int("") 崩溃）
            continue
        file_keys.add(key)
        if key in environ:
            if environ[key] != value:
                conflicts.append(key)
            if not override:
                continue
        environ[key] = value
    return file_keys, conflicts


def _source_of(var, environ, file_keys, default):
    """判定某个变量的取值来源。"""
    if var in file_keys:
        return SOURCE_FILE
    if environ.get(var):
        return SOURCE_ENV
    if default is not None:
        return SOURCE_DEFAULT
    return None


def resolve_llm_config(environ, file_keys):
    """解析 LLM 凭证组：密钥 / Base / 模型的取值来源与一致性。

    Returns:
        dict: {
            key_configured, key_var, key_source, key_provider,
            base, base_source, base_provider, model, model_source,
            group_complete, mixed_source, provider_mismatch, sources,
        }
        mixed_source=True 表示密钥与 Base/模型来自不同来源，
        存在「凭证发错服务」风险，调用方应阻止在线请求。
        provider_mismatch=True 表示密钥前缀暗示的厂商与 Base 主机暗示的厂商不一致
        （如 NVIDIA 的 nvapi- Key 打向商汤端点），必须阻止在线请求，否则必 401。
    """
    key_var = None
    key_value = ""
    key_source = None
    for var in LLM_KEY_VARS:
        value = environ.get(var) or ""
        if value:
            key_var, key_value = var, value
            key_source = _source_of(var, environ, file_keys, None)
            break

    base = (environ.get(LLM_BASE_VAR) or DEFAULT_BASE).rstrip("/")
    base_source = _source_of(LLM_BASE_VAR, environ, file_keys, DEFAULT_BASE)
    model = environ.get(LLM_MODEL_VAR) or DEFAULT_MODEL
    model_source = _source_of(LLM_MODEL_VAR, environ, file_keys, DEFAULT_MODEL)

    sources = {s for s in (key_source, base_source, model_source) if s}
    # 去掉 default 后仍有多个来源，才算真正的混杂
    real_sources = {s for s in sources if s != SOURCE_DEFAULT}
    mixed_source = len(real_sources) > 1

    key_provider = _infer_provider_from_key(key_value)
    base_provider = _infer_provider_from_base(base)
    # 仅当两侧都能明确判定为不同厂商时才算 mismatch（unknown 一侧不参与判定，避免误杀）
    provider_mismatch = (
        key_provider != "unknown"
        and base_provider != "unknown"
        and key_provider != base_provider
    )

    return {
        "key_configured": bool(key_value),
        "key_var": key_var,
        "key_source": key_source,
        "key_provider": key_provider,
        "base": base,
        "base_source": base_source,
        "base_provider": base_provider,
        "model": model,
        "model_source": model_source,
        "group_complete": bool(key_value) and bool(base) and bool(model),
        "mixed_source": mixed_source,
        "provider_mismatch": provider_mismatch,
        "sources": sorted(sources),
    }


def _infer_provider_from_key(key: str) -> str:
    """从密钥前缀推断厂商（启发式）。无法判定返回 unknown。"""
    if not key:
        return "unknown"
    if key.startswith("nvapi-"):
        return "nvidia"
    if key.startswith("sk-"):
        return "sensenova"
    return "unknown"


def _infer_provider_from_base(base: str) -> str:
    """从上游 Base 主机推断厂商（启发式）。无法判定返回 unknown。"""
    if not base:
        return "unknown"
    b = base.lower()
    if "sensenova" in b or "sensecore" in b:
        return "sensenova"
    if "nvidia" in b:
        return "nvidia"
    return "unknown"


def mask_key(value):
    """掩码展示密钥：只保留前 3 位与后 4 位，绝不回传完整值。"""
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return value[:3] + "*" * (len(value) - 7) + value[-4:]
