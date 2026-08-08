# ===== 视频提取服务 Docker 镜像（云端精简版） =====
FROM python:3.12-slim

# 安装 ffmpeg + curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 仅安装云端可运行的轻量依赖（无 FunASR）
RUN pip install --no-cache-dir \
    yt-dlp \
    faster-whisper \
    onnxruntime \
    openai-whisper \
    ctranslate2 \
    torch --index-url https://download.pytorch.org/whl/cpu

# 复制源码（render.yaml rootDir=. 时，build context 为仓库根，需带 server/ 前缀；rootDir=server 时直接 COPY）
COPY server/video-extract.py .
COPY server/requirements.txt .

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT:-8765}/ || exit 1

EXPOSE ${PORT:-8765}

CMD python video-extract.py --serve --port ${PORT:-8765}