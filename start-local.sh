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
# 在线 AI 是否已配置：环境变量优先，其次 server/.env。
# .env 由 app.py 在 Python 层解析加载，shell 看不到，故此处纯文本读取判断
# （用 Python 解析，绝不 source/eval 执行文件内容；只判断有无值，不输出值）。
_ai_configured=""
if [ -n "${LLM_API_KEY:-}" ] || [ -n "${SENSENOVA_API_KEY:-}" ]; then
  _ai_configured="yes"
else
  # 只判断「有没有值」，不输出值；Python 解析而非 source/eval 执行文件内容
  _env_has_key=$("$PY" -c 'from pathlib import Path
p = Path("server/.env")
if not p.exists():
    raise SystemExit(0)
for line in p.read_text(encoding="utf-8").splitlines():
    s = line.strip()
    if s.startswith("#") or "=" not in s:
        continue
    k, _, v = s.partition("=")
    if k.strip() in ("LLM_API_KEY", "SENSENOVA_API_KEY"):
        if v.strip():
            print("yes")
        break
' 2>/dev/null || true)
  [ "$_env_has_key" = "yes" ] && _ai_configured="yes"
fi
if [ -n "$_ai_configured" ]; then
  echo "   在线 AI：已配置（模型与上游地址取自 server/.env 或环境变量）"
else
  echo "   在线 AI 未配置；离线文案、合规检查和本地功能仍可使用"
fi
echo "   Ctrl+C 停止"

# 延迟打开浏览器（等服务起来）
( sleep 2
  if command -v open >/dev/null 2>&1; then open "http://127.0.0.1:${PORT}"; fi
) &

exec "$PY" server/app.py
