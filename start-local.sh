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
echo "🚀 启动 Copy Studio 本地服务: http://127.0.0.1:${PORT}"
if [ -z "${LLM_API_KEY:-}" ]; then
  echo "   AI 在线生成未配置；离线文案、合规检查和本地功能仍可使用"
fi
echo "   Ctrl+C 停止"

# 延迟打开浏览器（等服务起来）
( sleep 2
  if command -v open >/dev/null 2>&1; then open "http://127.0.0.1:${PORT}"; fi
) &

exec "$PY" server/app.py
