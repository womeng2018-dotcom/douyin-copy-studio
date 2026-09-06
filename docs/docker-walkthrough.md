# Docker 化走查报告

> 走查时间：2026-09-06
> 分支：`codex/usability-fixes`
> 结论：Docker 资产已重写并静态验证通过；**本机无 Docker 守护进程，实际 `docker build/run` 未能执行**，运行时行为已用等价本地进程验证。

---

## 一、走查发现的三个结构性问题

### 1.1 Dockerfile 构建的是「被废弃的旧服务」（严重）

| 项 | 修复前 | 事实 |
|---|---|---|
| 启动入口 | `python video-extract.py --serve` | 统一后端是 `server/app.py` |
| `/api/health` | 不存在 | `app.py` 第 1013 行提供 |
| LLM 密钥缺失时 | 无 503 语义 | `app.py` 第 623/700 行返回 **503** |
| 敏感路径 404 | 无静态白名单 | `app.py` 静态白名单 + `catch_all` 兜底 404 |

`video-extract.py` 经检查**不含** FastAPI app、`/api/health` 或 503 语义，无法满足验收标准（health 200 / 敏感路径 404 / 无 Key 时 LLM 503）。同时 P0/P1 的全部安全加固都在 `app.py` 上，构建旧服务等于把这些加固全部绕过。

**处置**：Dockerfile 重写为构建 `server/app.py`。

### 1.2 `server/requirements.txt` 缺 Web 运行时依赖（严重）

原文件只声明 ML / 视频栈，**未声明 `fastapi` / `uvicorn` / `httpx`**，而 `app.py` 第 44-48 行直接 import 这三者在内的模块。按此文件安装的镜像启动 `app.py` 会 `ImportError`。

**处置**：在 `requirements.txt` 顶部补齐 Web 运行时三件套。

### 1.3 构建上下文与 `.dockerignore` 缺失（中）

- `render.yaml` 声明 `rootDir: .` + `dockerfilePath: ./server/Dockerfile` → **构建上下文是仓库根**
- 但 `docker-compose.yml` 写的是 `context: ./server` → 两处冲突，且根下**没有 `.dockerignore`**
- 后果：`.git/`、`.env`、`tests/`、`node_modules/` 全部进入构建上下文；若 `server/.env` 存在，密钥会随上下文发送到 daemon

**处置**：统一为「上下文 = 仓库根」，新增根 `.dockerignore`。

---

## 二、修复后的 Docker 资产

### 2.1 `server/Dockerfile`（多阶段 + 非 root + healthcheck）

| 阶段 | 内容 |
|---|---|
| **builder** (`python:3.12-slim`) | 装 `build-essential gcc`，创建 `/opt/venv`，`pip install -r requirements.txt`（torch 走 CPU 索引） |
| **runtime** (`python:3.12-slim`) | 只装 `ffmpeg curl ca-certificates`；从 builder 取 `/opt/venv`；**不含编译工具链** |

关键设计：

- **非 root**：`groupadd --system appuser` + `useradd --system`，末尾 `USER appuser`
- **目录布局**：代码放 `/app/server/`，静态资源放 `/app/`。因为 `app.py` 内 `WWW_ROOT = SCRIPT_DIR.parent`，必须保持 `server/` 子目录结构，否则静态资源解析到 `/` 而全部 404
- **健康检查**：`curl -f http://127.0.0.1:${PORT}/api/health`（真实存活端点，非首页）
- **数据卷**：`VOLUME ["/app/server/.data"]`
- **启动方式**：`CMD ["python", "server/app.py"]` —— 走 `__main__` 以确保 `HOST`/`PORT` 启动守卫完整执行

### 2.2 `.dockerignore`（仓库根，新建）

排除项按优先级：

1. **密钥**：`.env`、`*.env`、`.env.*`、`**/.env`（`!.env.example` 例外保留）
2. `.git/`、`.github/`
3. `tests/`、`test_*.py`、`.pytest_cache/`
4. `__pycache__/`、`.venv/`、`node_modules/`
5. `server/.data/`、`*.db`、`*.sqlite*`（含租户数据，禁止进镜像）
6. 部署脚本、文档、前端构建与压测工具

### 2.3 `docker-compose.yml`（鉴权 + 数据卷）

| 配置项 | 值 | 理由 |
|---|---|---|
| `build.context` | `.`（仓库根） | 与 `render.yaml` 一致 |
| `REQUIRE_AUTH` | `true` | 云端必须鉴权 |
| `TENANT_KEYS` | `default:${COPY_STUDIO_ACCESS_KEY:?...}` | 变量未设置时 compose 直接报错，避免"忘了配密钥就上线" |
| `env_file` | `server/.env`（`required: false`） | LLM 密钥不进镜像层、不进 compose 明文 |
| `volumes` | `copy-studio-data:/app/server/.data` | 租户历史持久化 |
| `ports` | `127.0.0.1:8765:8765` | 默认只本机，对外需反代 + TLS |
| `security_opt` / `cap_drop` | `no-new-privileges:true` / `ALL` | 纵深防御 |

---

## 三、验证证据

### 3.1 静态验证（已执行）

**compose YAML 结构解析**：

```
YAML OK
  build.context   : .
  build.dockerfile: server/Dockerfile
  REQUIRE_AUTH    : true
  DATA_DIR        : /app/server/.data
  volumes         : ['copy-studio-data:/app/server/.data']
  env_file        : [{'path': 'server/.env', 'required': False}]
  healthcheck     : ['CMD', 'curl', '-f', 'http://127.0.0.1:8765/api/health']
  cap_drop        : ['ALL']
```

**COPY 源路径存在性 + 密钥排除**：

```
  OK   server/app.py
  OK   server/video-extract.py
  OK   server/requirements.txt
  OK   index.html
  OK   standalone.html
  OK   css
  OK   js

  IGNORED (good)  server/.env
  IGNORED (good)  .env
  NOT ignored (good)  server/.env.example
```

### 3.2 运行时行为验证（本地等价进程，已执行）

以容器等价环境变量启动 `server/app.py`
（`HOST=127.0.0.1`、`REQUIRE_AUTH=true`、`TENANT_KEYS=default:…`、未配置 `LLM_API_KEY`）：

| 验收项 | 期望 | 实测 | 结论 |
|---|---|---|---|
| `GET /api/health` | 200 | **200** | 通过 |
| `GET /.env` | 404 | **404** | 通过 |
| `GET /server/app.py` | 404 | **404** | 通过 |
| `GET /tests/` | 404 | **404** | 通过 |
| `GET /docker-compose.yml` | 404 | **404** | 通过 |
| `GET /requirements.txt` | 404 | **404** | 通过 |
| `GET /docs/` | 404 | **404** | 通过 |
| `GET /api/history`（无 Key） | 401 | **401** | 通过 |
| LLM 未配置 Key | 503 | 见下 | 通过 |

**fail closed 守卫**（`HOST=0.0.0.0` 且无访问密钥）：

```
returncode: 2
[copy-studio] 启动中止：监听非回环地址 '0.0.0.0' 时必须配置 TENANT_KEYS/API_KEYS，拒绝启动（fail closed）
```

**「无 Key 时 LLM 503」与鉴权**：由项目既有测试套件覆盖，执行

```bash
pytest tests/ -k "auth or 503 or upstream or key"
# 41 passed, 176 deselected
```

---

## 四、未能执行的部分与原因

| 步骤 | 状态 | 原因 |
|---|---|---|
| `docker build` | **未执行** | 本机无 `docker` 二进制，无 Docker Desktop / OrbStack / colima，无 `brew` 可安装 |
| `docker run` | **未执行** | 同上，无守护进程 |
| 容器内 curl | **未执行** | 同上 |

**替代方案**：以容器等价环境变量直接运行 `server/app.py`（同一份代码、同一套环境变量），上表实测结果即为容器内的预期行为。差异仅在于进程是否运行在 namespace 内，不影响 HTTP 语义。

**在有 Docker 的机器上补跑**：

```bash
export COPY_STUDIO_ACCESS_KEY="$(openssl rand -hex 32)"
cp server/.env.example server/.env   # 填入真实 LLM_API_KEY

docker build -t copy-studio:latest -f server/Dockerfile .
docker compose up -d

curl -i http://127.0.0.1:8765/api/health      # 期望 200
curl -i http://127.0.0.1:8765/.env            # 期望 404
curl -i http://127.0.0.1:8765/server/app.py   # 期望 404

# 非 root 校验
docker exec copy-studio id                    # 期望 uid=... (appuser)，非 root

# 镜像层无密钥校验
docker history copy-studio:latest
docker run --rm copy-studio:latest sh -c 'ls -la /app/server/.env 2>&1'  # 期望 No such file
```

---

## 五、残留风险

| 编号 | 风险 | 建议 |
|---|---|---|
| D1 | 未实际构建镜像，多阶段/非 root 未经运行时验证 | 在具备 Docker 的环境执行第四节命令补验 |
| D2 | `torch` 走 CPU 索引仍约 2 GB+，镜像体积大 | 若不需要视频提取，可拆出 `requirements-web.txt` 构建精简镜像 |
| D3 | `env_file: required: false` 时无 `server/.env` 也能启动，此时 LLM 返回 503 | 可接受（fail closed 语义正确），但部署文档应提示 |
| D4 | compose 端口绑 `127.0.0.1`，若需 LAN 访问会改动 | 改动时务必同时配置 `CORS_ORIGINS`，否则启动守卫拒绝启动 |
