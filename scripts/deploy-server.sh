#!/usr/bin/env bash
# deploy-server.sh —— Copy Studio 服务器部署脚本（GitHub CD 自动 / 手动通用）
#
# 运行位置：git archive 解包后的仓库根目录（服务器约定 /opt/copy-studio）。
#   bash scripts/deploy-server.sh
#
# CD 可选：从 stdin 读取 key=value 环境注入（避免密钥出现在命令行 argv、
# Actions 日志或服务器 ps 输出里）：
#   printf 'COPY_STUDIO_ACCESS_KEY=%s\nLLM_API_KEY=%s\n' "$AK" "$LK" \
#     | ssh <user>@<host> 'cd /opt/copy-studio && bash scripts/deploy-server.sh'
# 手动运行时直接以环境变量提供即可（stdin 留空，不会误读）。
#
# 环境变量：
#   COPY_STUDIO_ACCESS_KEY   应用鉴权密钥（compose 必填，缺则 fail-closed）
#   LLM_API_KEY              商汤 SenseNova 密钥；仅当服务器尚无 server/.env 时
#                            用于首次生成（LLM_MODEL 沿用模板 deepseek-v4-flash），
#                            chmod 600。已有 server/.env 则跳过、绝不覆盖。
#
# 退出码：0 = 构建 / 启动 / 五项冒烟全过；
#         非 0 = 部署失败。compose up 之后的任何失败会自动
#         docker compose down（不带 -v，保留数据卷）回滚 → job 标红，绝不上架带病版本；
#         compose up 之前的失败（缺 docker / 缺密钥 / 构建失败等）只报错退出，
#         不触碰仍在运行的上一个版本。
set -euo pipefail

# ---- 定位仓库根目录（本脚本位于 <root>/scripts/）----
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ---- 从 stdin 收 key=value 注入（仅白名单键；已存在的环境变量不覆盖）----
while IFS='=' read -r _k _v; do
  case "$_k" in
    COPY_STUDIO_ACCESS_KEY | LLM_API_KEY)
      if [ -z "${!_k:-}" ]; then
        export "$_k=$_v"
      fi
      ;;
  esac
done

# compose up 之后失败才允许 down 回滚；up 之前的失败只报错（见头部说明）
rollback() {
  echo "→ 回滚：docker compose down（保留数据卷，不带 -v）"
  docker compose down >/dev/null 2>&1 || true
  exit 1
}
die() {
  echo "❌ $1"
  exit 1
}

# ---- 0. 前置检查 ----
command -v docker >/dev/null 2>&1 || die "无 docker（请先在服务器安装 Docker）"
docker info >/dev/null 2>&1 || die "docker 守护进程未运行"
[ -n "${COPY_STUDIO_ACCESS_KEY:-}" ] || die "缺 COPY_STUDIO_ACCESS_KEY（compose fail-closed 必填；见 README「服务器部署与 CD 自动上线」）"

# ---- 1. 构建（-q 只打镜像 ID，日志不含密钥）----
echo "== 1/6 docker build -t copy-studio:latest =="
docker build -q -t copy-studio:latest -f server/Dockerfile . || die "镜像构建失败（未触碰在跑服务；请人工核查 build 输出）"

# ---- 2. 验证 .env 不进镜像（泄漏 = 红线，立即停）----
echo "== 2/6 验证 .env 不进镜像 =="
if docker run --rm --entrypoint sh copy-studio:latest -c 'ls /app/server/.env' 2>&1 | grep -q "No such file"; then
  echo "✅ .env 不在镜像内"
else
  die "❌ .env 泄漏进镜像！立即停止并人工核查 Dockerfile / .dockerignore"
fi

# ---- 3. server/.env（已有则保留，绝不覆盖）----
echo "== 3/6 server/.env =="
if [ ! -f server/.env ]; then
  cp server/.env.example server/.env
  if [ -n "${LLM_API_KEY:-}" ]; then
    # 模板里 LLM_API_KEY= 为空行（空值按 envconfig 语义不生效）；追加一行真实值
    printf 'LLM_API_KEY=%s\n' "$LLM_API_KEY" >> server/.env
    echo "✅ 首次部署：已用 Secret LLM_API_KEY 生成 server/.env（LLM_MODEL 沿用模板 deepseek-v4-flash）"
  else
    echo "⚠️ 首次部署但未提供 LLM_API_KEY：已生成模板，LLM 接口将 503（health/鉴权/静态不受影响）"
  fi
  chmod 600 server/.env
else
  chmod 600 server/.env
  echo "✅ server/.env 已存在，跳过生成（不覆盖既有配置）"
fi

# ---- 4. 启动 ----
echo "== 4/6 compose up =="
docker compose up -d || rollback "compose up 失败"
sleep 3

# ---- 5. 服务就绪探测（最多 15s）----
echo "== 5/6 服务就绪探测 =="
ready=0
for i in 1 2 3 4 5; do
  if curl -fs http://127.0.0.1:8765/api/health >/dev/null 2>&1; then ready=1; break; fi
  sleep 3
done
[ "$ready" -eq 1 ] || rollback "服务 15s 内未就绪"

# ---- 6. 五项冒烟（任一不过 → 自动 down 回滚，job 标红）----
echo "== 6/6 五项冒烟 =="
curl -fs http://127.0.0.1:8765/api/health >/dev/null || rollback "① /api/health 非 200"
echo "✅ ① /api/health 200"
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/api/history -H "X-Api-Key: wrong-key-smoke" | grep -q 401 \
  || rollback "② 错误 X-API-Key 未返回 401"
echo "✅ ② 错误密钥 401"
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/server/.env | grep -q 404 \
  || rollback "③ 敏感路径 /server/.env 未 404"
echo "✅ ③ 敏感路径 404"
curl -s -o /dev/null -w '%{http_code}' --path-as-is http://127.0.0.1:8765/../../../etc/passwd | grep -q 404 \
  || rollback "④ 目录穿越未 404"
echo "✅ ④ 目录穿越 404"
docker compose exec -T copy-studio sh -c 'f=/app/server/.data/.cdsmoke; touch "$f" && rm "$f"' >/dev/null 2>&1 \
  && echo "✅ ⑤ 数据卷可写" || rollback "⑤ 数据卷不可写"

echo ""
echo "🎉 五项冒烟全过，本次部署完成（对外可达仍须按 server/README 配反代 + TLS，并用域名复验 ① ②）。"
echo "残留动作（可选项，不在 CD 内自动执行以免每次消耗配额）：真实 LLM 最小调用一次，并确认日志无密钥原文。"
