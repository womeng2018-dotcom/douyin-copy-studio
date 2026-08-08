# ===== 视频提取服务 Docker 镜像 =====
FROM python:3.12-slim

# 安装 ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/server

# 先复制依赖清单，利用 Docker 层缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制源码
COPY video-extract.py .

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://127.0.0.1:8765/ || exit 1

EXPOSE 8765

# 默认启动 HTTP 服务
CMD ["python", "video-extract.py", "--serve", "--port", "8765"]