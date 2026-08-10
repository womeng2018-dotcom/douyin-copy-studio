#!/usr/bin/env bash
# ============================================================
# Copy Studio 本地一键启动
# 单端口同源模式：http://127.0.0.1:8765
#   页面（index.html/css/js）与提取 API 均由 video-extract.py 托管
#   解决 GitHub Pages(HTTPS) 无法访问本地 HTTP 服务的浏览器拦截问题
# ============================================================
set -e
cd "$(dirname "$0")"

PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  echo "❌ 未找到 python3/python，请先安装 Python 3.9+"
  exit 1
fi

echo "🔄 检查依赖（openai / yt-dlp / funasr 等，缺失时自动安装）..."
"$PY" -c "import openai" 2>/dev/null || "$PY" -m pip install -q openai
"$PY" -c "import yt_dlp" 2>/dev/null || "$PY" -m pip install -q yt-dlp

PORT="${PORT:-8765}"
echo "🚀 启动 Copy Studio 本地服务: http://127.0.0.1:${PORT}"
echo "   （页面与提取 API 同源，LLM 纠偏走商汤免费 Key）"
echo "   Ctrl+C 停止"

# 延迟打开浏览器（等服务起来）
( sleep 2
  if command -v open >/dev/null 2>&1; then open "http://127.0.0.1:${PORT}"; fi
) &

exec "$PY" server/video-extract.py --serve --port "$PORT"
