# ===== Copy Studio 统一后端（server/app.py）=====
#
# 构建上下文必须是「仓库根目录」：
#   docker build -f server/Dockerfile .
# 原因：app.py 内 WWW_ROOT = SCRIPT_DIR.parent，即静态资源（index.html /
# standalone.html / css / js）必须位于 server/ 的上一级，与仓库布局一致。
#
# 安全基线：
#   - 多阶段构建：编译工具链不进入运行镜像
#   - 非 root 运行：appuser（uid/gid 由系统在 1000+ 分配）
#   - HEALTHCHECK：命中 /api/health（真实存活探针，非首页）
#   - .dockerignore 排除 .env / tests / .git，密钥不会进入镜像层

# ============================================================
# Stage 1：builder —— 构建依赖，产物为 /opt/venv
# ============================================================
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 编译期依赖（部分 ML wheel 需要 gcc）
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# 先单独拷 requirements，最大化 Docker 层缓存命中
COPY server/requirements.txt .

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
# torch 走 CPU 索引，避免拉入数 GB 的 CUDA 运行时
RUN pip install --upgrade pip \
    && pip install --extra-index-url https://download.pytorch.org/whl/cpu \
        -r requirements.txt

# ============================================================
# Stage 2：runtime —— 仅含运行所需
# ============================================================
FROM python:3.12-slim AS runtime

# ffmpeg（视频提取）/ curl（HEALTHCHECK）/ CA 证书
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 非 root 用户
RUN groupadd --system appuser \
    && useradd --system --gid appuser --create-home --home-dir /home/appuser appuser

WORKDIR /app

# 从 builder 取依赖，运行镜像不含 gcc / build-essential
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8765 \
    HOST=0.0.0.0

# 后端代码：保持 server/ 子目录结构，使 WWW_ROOT 解析到 /app
COPY --chown=appuser:appuser server/app.py server/video-extract.py /app/server/

# 静态资源（app.py 白名单仅开放这些）
COPY --chown=appuser:appuser index.html standalone.html /app/
COPY --chown=appuser:appuser css/ /app/css/
COPY --chown=appuser:appuser js/ /app/js/

# 运行时数据目录（SQLite 落盘处，对应 docker-compose 的挂载卷）
RUN mkdir -p /app/server/.data \
    && chown -R appuser:appuser /app
ENV DATA_DIR=/app/server/.data

# 声明数据卷：租户历史 / 采集数据持久化
VOLUME ["/app/server/.data"]

USER appuser

EXPOSE 8765

# 健康检查：命中真实存活端点（app.py 的 /api/health）
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f "http://127.0.0.1:${PORT:-8765}/api/health" || exit 1

# 走 __main__ 而非 uvicorn app:app，确保 HOST/PORT 启动守卫完整执行。
# --no-server-header 抑制框架版本头；业务标识 Server 由 app.py 中间件写入。
CMD ["python", "server/app.py"]
