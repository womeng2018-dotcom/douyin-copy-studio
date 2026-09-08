#!/usr/bin/env bash
# ============================================================
# Copy Studio 本地一键启动
# 单端口同源模式：http://127.0.0.1:8765
#   页面、LLM 代理、历史记录与提取 API 均由统一后端 app.py 托管
#   解决 GitHub Pages(HTTPS) 无法访问本地 HTTP 服务的浏览器拦截问题
# ============================================================
set -e
cd "$(dirname "$0")"

# 自动清理 stale 的 .git/index.lock（被 sandbox / 容器崩溃 / kill -9 中断残留时）
# 见 scripts/git-safe.sh 的安全策略；只清理 0 字节且 mtime > 5 分钟的 lock
# shellcheck source=scripts/git-safe.sh
if [ -f scripts/git-safe.sh ]; then
  # shellcheck disable=SC1091
  source scripts/git-safe.sh
  git_safe_check || true
fi

PY=""
for candidate in ".venv/bin/python" "../.venv/bin/python"; do
  if [ -x "$candidate" ]; then PY="$candidate"; break; fi
done
if [ -z "$PY" ] && command -v python3 >/dev/null 2>&1; then
  PY="python3"
fi
if [ -z "$PY" ]; then
  echo "❌ 未找到可用的 Python 3"
  exit 1
fi

if ! "$PY" -c "import fastapi, uvicorn, httpx" 2>/dev/null; then
  echo "❌ 当前 Python 缺少运行依赖。请先按 server/README.md 完成首次安装。"
  echo "   检测到的 Python: $PY"
  exit 1
fi

export HOST="127.0.0.1"
export PORT="${PORT:-8765}"
export REQUIRE_AUTH="false"
export CORS_ALLOW_NULL="false"
export ALLOW_REMOTE_URL="false"

# ============================================================
# A7 本机安全配置入口：server/.env 不存在则生成 600 模板（绝不覆盖已有文件）
#   密钥只进 server/.env（.gitignore 已排除），请勿发到聊天或提交入仓。
# ============================================================
if [ ! -f server/.env ]; then
  echo "ℹ️ 未检测到 server/.env，生成配置模板（权限 600，不覆盖已有文件）..."
  "$PY" -c '
import sys
sys.path.insert(0, "server")
from pathlib import Path
p = Path("server/.env")
ex = Path("server/.env.example")
p.write_text(ex.read_text(encoding="utf-8") if ex.exists() else "", encoding="utf-8")
p.chmod(0o600)
print("[copy-studio] 已生成 server/.env：请本地编辑填入商汤 LLM_API_KEY，切勿发到聊天或提交入仓")
'
  echo "   填好密钥后重新运行本脚本即可启用在线 AI；不填也能以离线模式使用本地功能。"
fi

# ============================================================
# A4 重复启动检测：已运行本项目实例则仅打开页面；端口被未知进程占用则提示，绝不 kill
# ============================================================
_HEALTH_RAW=$(curl -s -m 2 --noproxy 127.0.0.1,localhost "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || true)
if [ -n "$_HEALTH_RAW" ] && echo "$_HEALTH_RAW" | "$PY" -c '
import sys, json
try:
    d = json.load(sys.stdin)
    sys.exit(0 if (d.get("ok") and d.get("storage") == "sqlite") else 1)
except Exception:
    sys.exit(1)
'; then
  echo "✅ 检测到 Copy Studio 已在运行（http://127.0.0.1:${PORT}），直接打开页面，不重复启动。"
  if command -v open >/dev/null 2>&1; then open "http://127.0.0.1:${PORT}"; fi
  exit 0
fi
# 端口被占用但响应不是本项目健康态：提示用户手动处理，绝不 kill 未知进程
if curl -s -m 2 -o /dev/null --noproxy 127.0.0.1,localhost "http://127.0.0.1:${PORT}/" 2>/dev/null; then
  _pid=$(lsof -ti "${PORT}" 2>/dev/null | head -1 || true)
  echo "⚠️ 端口 ${PORT} 已被占用（PID ${_pid:-未知}），且该服务不是 Copy Studio 实例。" >&2
  echo "   为避免打开错误的服务，已停止启动。请先停止占用进程（PID ${_pid:-未知}）后重试。" >&2
  exit 1
fi

echo "🚀 启动 Copy Studio 本地服务: http://127.0.0.1:${PORT}"

# ============================================================
# 在线 AI 配置状态：调用 server/envconfig.py 统一解析
#   环境变量优先，其次 server/.env；只判断有无值与来源，绝不输出密钥值。
# ============================================================
_AI_LINE=$("$PY" -c '
import sys, os
sys.path.insert(0, "server")
import envconfig
from pathlib import Path
environ = dict(os.environ)
keys, _ = envconfig.load_env_file(Path("server/.env"), environ, override=False)
cfg = envconfig.resolve_llm_config(environ, keys)
if not cfg["key_configured"]:
    print("NOT_CONFIGURED")
elif cfg["mixed_source"]:
    print("MIXED:" + ",".join(cfg["sources"]))
else:
    print("CONFIGURED:" + cfg["base"] + ":" + cfg["model"])
' 2>/dev/null || true)
case "$_AI_LINE" in
  CONFIGURED:*)
    IFS=':' read -r _ _base _model <<< "$_AI_LINE"
    echo "   在线 AI：已配置（上游 ${_base} / 模型 ${_model}）"
    ;;
  MIXED:*)
    _src="${_AI_LINE#MIXED:}"
    echo "   在线 AI：已配置，但凭证组来源混杂（${_src}），存在发错服务风险，请统一来源后重启"
    ;;
  *)
    echo "   在线 AI 未配置；离线文案、合规检查和本地功能仍可使用"
    ;;
esac
echo "   Ctrl+C 停止"

# 延迟打开浏览器（等服务起来）
( sleep 2
  if command -v open >/dev/null 2>&1; then open "http://127.0.0.1:${PORT}"; fi
) &

exec "$PY" server/app.py
