# Copy Studio 统一后端

统一处理 **NVIDIA LLM 代理、视频文案提取、服务端限流、按租户隔离的历史记录和抖音来客采集数据**。LLM 密钥只从服务端环境变量读取，不写入响应体返回给浏览器；静态文件托管采用显式白名单（仅 `/`、`/index.html`、`/standalone.html` 及 `css/`、`js/` 目录内的文件可访问），`.env`、源码等内部路径一律返回 404。

## 快速启动

推荐从项目根目录运行：

```bash
bash start-local.sh
# 浏览器打开 http://127.0.0.1:8765
```

首次启动会创建项目独立的 `.venv`，并安装 FastAPI、yt-dlp 与 faster-whisper 等依赖。

也可手动启动：

```bash
python3 -m venv .venv
.venv/bin/pip install fastapi 'uvicorn[standard]' httpx openai yt-dlp faster-whisper
.venv/bin/python server/app.py
```

## 服务端配置

在 `server/.env` 中配置；该文件已被 `.gitignore` 排除，并应保持仅当前用户可读。

```dotenv
LLM_API_KEY=<NVIDIA_API_KEY>
LLM_API_BASE=https://integrate.api.nvidia.com/v1
LLM_MODEL=nvidia/nemotron-3-super-120b-a12b
```

| 环境变量 | 默认值 | 用途 |
|---|---|---|
| `LLM_API_KEY` | 空 | NVIDIA API 密钥，仅在服务端使用 |
| `LLM_API_BASE` | SenseNova 兼容地址 | OpenAI 兼容上游地址 |
| `LLM_MODEL` | `deepseek-v4-flash` | 服务端固定模型；客户端不能覆盖 |
| `HOST` | `127.0.0.1` | 本地监听地址 |
| `PORT` | `8765` | 服务端口 |
| `REQUIRE_AUTH` | `false` | 云端部署应设为 `true` |
| `TENANT_KEYS` | 空 | 多租户映射，格式 `门店:访问密钥,门店:访问密钥` |
| `API_KEYS` | 空 | 兼容的访问密钥列表，逗号分隔 |
| `DATA_DIR` | `server/.data` | SQLite 数据目录 |
| `CORS_ORIGINS` | 本机及项目 GitHub Pages | 允许访问后端的前端来源，逗号分隔 |
| `ASR_MAX_CONCURRENCY` | `1` | 同进程并发 ASR 数，避免内存过载 |

> `X-API-Key` 是 Copy Studio 的访问密钥，不是 NVIDIA API 密钥。前者可以交给门店使用，后者不得进入浏览器。

## API

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/api/health` | 服务状态 |
| `POST` | `/api/llm/chat` | LLM 流式或非流式代理 |
| `POST` | `/api/llm/vision` | 运营计划视觉/文档分析 |
| `GET/POST` | `/api/extract` | 视频提取状态/任务 |
| `GET/POST/DELETE` | `/api/history` | 当前租户历史记录 |
| `GET/POST` | `/api/collector` | 当前租户抖音来客采集数据 |

启用鉴权后，除健康检查与静态页面外，请求需携带：

```http
X-API-Key: <COPY_STUDIO_ACCESS_KEY>
```

### 文案改写

```bash
curl -X POST http://127.0.0.1:8765/api/llm/chat \
  -H 'Content-Type: application/json' \
  -d '{"system":"你是短视频文案编辑","user":"改写这段文案","stream":false}'
```

### 视频提取

```bash
curl -X POST http://127.0.0.1:8765/api/extract \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://公开视频链接","engine":"auto","language":"zh"}'
```

HTTP 接口不接受服务器本地文件路径；网页上传文件会编码为受大小限制的 base64。下载链接仅允许公网 HTTP(S) 地址，服务端通过 IP 范围校验（`ip.is_global`）、端口白名单（80/443/8080/8443）、云元数据地址拦截与内网域名黑名单限制对内网资源的访问。

## 数据与安全

- SQLite 默认位于 `server/.data/copy-studio.sqlite3`，已排除出 Git。
- 历史、改写、提取结果、运营计划和采集数据均按 `TENANT_KEYS` 对应的租户隔离。
- 不保存 NVIDIA API 密钥、浏览器访问密钥或上传的视频原文件。
- ASR 模型进程内单例加载；每次任务使用独立临时目录并在完成后清理。
- 云端部署必须设置 `REQUIRE_AUTH=true` 和 `TENANT_KEYS`，并挂载持久化数据卷。

## 限流（边界声明）

### 当前实现（默认内存后端）

| 维度 | 行为 |
|---|---|
| 存储位置 | 进程内 `_limits` dict（`server/app.py`） |
| 并发保护 | `_limit_lock = threading.Lock()`（同一进程内多线程互斥） |
| 算法 | 滑动窗口：每个 `(ident, action)` 保留 1 小时 / 1 天两个时间戳列表 |
| 配额 | 与前端 `guard.js` 一致：`rewrite` 60/h 200/d，`plan` 30/h 100/d，`extract` 30/h 100/d |
| 持久化 | **无**，进程重启 / 崩溃即清空 |

### 已知边界

| 场景 | 实际配额 | 风险定性 |
|---|---|---|
| 单进程 | 严格按 `RATE_RULES` 执行 | 正确 |
| `uvicorn --workers N` 多 worker | **N × `RATE_RULES`**（每 worker 独立 dict 累加） | 配额放大 N 倍 |
| 多 host 部署（Render + 其它） | **host 数 × `RATE_RULES`** | 同上 |
| 进程重启 | `_limits` 清零 → 用户获得满额 | 攻击者如能定时触发重启可放大额度（**需 restart 权限**，普通用户不可达） |

### 何时需要 Redis 后端

满足任一即建议切换：

- `uvicorn --workers > 1`
- 部署到 ≥ 2 个实例（多 host / 多 Pod）
- 要求配额在重启后保持

### 启用 Redis 后端（可选）

```bash
pip install 'redis>=5.0'           # 默认不安装，避免本地开发强依赖
export RATE_LIMIT_URL='redis://:password@your-redis:6379/0'
python server/app.py
```

启动日志会显示 `Redis 限流后端初始化成功`（实现：`server/app.py:_redis_rate_client.ping()` 探活）。
若 redis 不可达 / 模块未装，仅打 WARNING 自动回退内存，**不会阻断启动**（fail open 取舍：限流是 best-effort 控制，Redis 抖动不应让合法用户掉单）。

### Redis 实现要点

- 滑动窗口用 **Redis Sorted Set + Lua** 保证读 / 写原子性（race-free）
- Key 设计：`rl:{ident}:{action}:{h|d}`，member 带 `uuid.uuid4().hex[:8]` 后缀防同毫秒碰撞
- EXPIRE 3700s / 86500s（比窗口略长，防边界抖动丢数据）
- Lua 脚本通过 `register_script` 缓存，多次调用走 SCRIPT LOAD 一次

### 不建议的折中

| 做法 | 不建议的理由 |
|---|---|
| SQLite 存滑动窗口 | 高并发写锁竞争剧烈，会让 `/api/llm/chat` 主路径变慢 |
| 用 uvicorn `--workers 1` + Redis | 单进程本来就不需要 Redis，多一层依赖 |
| 把配额配置放数据库 | 静态配置无必要动态化；改 `RATE_RULES` 重启即可 |
