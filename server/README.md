# Copy Studio 统一后端

统一处理 **LLM 代理（默认商汤 SenseNova 的 OpenAI 兼容端点，模型由服务端固定）、视频文案提取、服务端限流、按租户隔离的历史记录和抖音来客采集数据**。LLM 密钥只从服务端环境变量读取，不写入响应体返回给浏览器；静态文件托管采用显式白名单（仅 `/`、`/index.html`、`/standalone.html` 及 `css/`、`js/` 目录内的文件可访问），`.env`、源码等内部路径一律返回 404。

## 快速启动

推荐从项目根目录运行：

```bash
bash start-local.sh
# 浏览器打开 http://127.0.0.1:8765
```

启动脚本不会在每次运行时安装或升级依赖。首次安装需按下方命令创建项目虚拟环境并安装依赖。

也可手动启动：

```bash
python3 -m venv .venv
.venv/bin/pip install fastapi 'uvicorn[standard]' httpx openai yt-dlp faster-whisper
.venv/bin/python server/app.py
```

## 服务端配置

在 `server/.env` 中配置；该文件已被 `.gitignore` 排除，并应保持仅当前用户可读。

```dotenv
LLM_API_KEY=sk-<商汤密钥>                     # 或 SENSENOVA_API_KEY；NVIDIA 用 nvapi- 前缀密钥
LLM_API_BASE=https://token.sensenova.cn/v1    # 代码默认值，可省略
LLM_MODEL=deepseek-v4-flash                   # 生产默认；可选 sensenova-6.8-flash-lite（权衡见下）
```

| 环境变量 | 默认值 | 用途 |
|---|---|---|
| `LLM_API_KEY` | 空 | 上游模型密钥（商汤 `sk-` 或 NVIDIA `nvapi-`），仅在服务端使用 |
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

> `X-API-Key` 是 Copy Studio 的访问密钥，不是上游模型密钥。前者可以交给门店使用，后者不得进入浏览器。

## 模型选择与 LLM 失败语义

### 模型权衡表（`LLM_MODEL`）

生产默认 **`deepseek-v4-flash`**（非推理对话模型，命中率高、低延迟，无需 reasoning 预算保护）。商汤 `sensenova-6.8-flash-lite` 保留为**可选**，适合需要更强推理 / 多模态的场景，但必须接受其成功率与延迟代价（已由服务端 4096 兜底 + 有界重试 + `reasoning_effort=low` 三层缓解）。

| 模型（`LLM_MODEL`） | 类型 | 单次成功率（实测） | 延迟（实测） | 配额 | 建议场景 |
|---|---|---|---|---|---|
| `deepseek-v4-flash`（默认） | 非推理对话模型 | 2026-09-08 本机 3/3 非空 | ~2.5–3.2 s（同批实测） | 社区文档记 150 次/5h；HANDOFF 曾记 500，**以平台控制台为准** | 生产默认：文案改写 / 运营计划等高频业务 |
| `sensenova-6.8-flash-lite`（可选） | 推理模型（`reasoning_effort` 控制） | 20–40%（2026-09-08 n=5：同提示词 5 次中 1–2 次拿到 content） | ~4–37 s（典型 ~36 s） | 1500 次/5h（社区文档） | 需要更强推理质量、可接受偶发空内容重试的场景 |

### `reasoning_effort`（推理预算参数）结论 —— 已验证支持并注入

2026-09-08 官方文档检索 + 直连实测（模型 `sensenova-6.8-flash-lite`）：

- **接受 `reasoning_effort`**：属商汤 OpenAI 兼容网关官方参数表；直连 `reasoning_effort=low` / `high` 均 **200 不拒收**（3.1 s / 2.9 s）。
- **拒绝 `thinking` / `enable_thinking` / `reasoning`**：不在官方参数表，一律被网关拒收（无法用它们关闭推理）。
- 因此服务端对 `sensenova-*` 自动注入 `reasoning_effort="low"`（`server/app.py:_apply_model_defaults`），从源头压低 reasoning 预算占用 —— **比重试更优**；非 sensenova 模型（含默认 deepseek）**不注入**（参数不在其 schema，硬发会被拒）。

### `LLM_EMPTY_RETRIES`（200+空内容有界重试）

- **语义**：仅针对「HTTP 200 但 `content` 为空」的有界重试 —— 推理模型偶发把全部 token 预算烧在内部 reasoning 上导致 content 为空，生成幂等、可安全重试。**非 200 / 超时 / 传输错误一律不重试**（避免把坏上游打爆）；200+非 JSON 归一化为 502 `E_UPSTREAM`。
- **默认值**：`2`（总尝试次数 = 1 + 2 = 3）。为代码常量（`server/app.py`），不可经 `.env` 覆盖。
- **配额影响**：**空内容尝试同样消耗一次上游调用配额**，最坏路径配额消耗 ×（`LLM_EMPTY_RETRIES`+1）= ×3。
- **覆盖范围**：`/api/llm/chat` 非流式与 `/api/llm/vision` 共享同一实现（`_post_nonstream_with_empty_retry`）；耗尽返回 502 + `E_UPSTREAM_EMPTY`，绝不回「伪 `ok:true`」。
- 附加保护：`sensenova-*` 强制 `max_tokens>=4096`（`_effective_max_tokens`），避免 reasoning 把 content 截断到空。

### 流式伪流式说明（重要）

`/api/llm/chat` 流式按尝试**整体缓冲**：只有出现 `content` 的那次尝试的字节会透传给客户端。对 `sensenova-*` 系推理模型（或其它长延迟上游），流式在观感上**退化为伪流式**：

1. 缓冲等待期间（最长 3 次尝试 × ~36 s ≈ 108 s 的量级），服务端每 **8 s** 下推一条 SSE 注释心跳 `: ping`（`SSE_HEARTBEAT_INTERVAL_SECONDS`，5–10 s 区间），保活浏览器 / 网关连接；
2. 出现 `content` 后停止心跳；成功尝试的完整字节整体吐出（剥掉上游尾随 `data: [DONE]`）；
3. 本函数统一追加一次 `data: [DONE]`。

前端 SSE pump 只认 `data:` 开头的行、自动跳过注释行（`js/rewrite-tab.js`），因此心跳不影响 `done` / `[DONE]` 语义。

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
- 不保存上游 LLM 密钥、浏览器访问密钥或上传的视频原文件。
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
