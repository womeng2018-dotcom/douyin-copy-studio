# HANDOFF — douyin-copy-studio 安全收尾 + 上线部署（自包含续跑档案）

> 本文件为**跨会话 / 跨 AI 自包含档案**。任何接续者（codex、新 WorkBuddy 会话、人工）读完此文件 + 下列命令前缀，即可在不依赖本会话上下文的前提下继续。
> 最后更新：**2026-09-07**（本地时间），数据以 `git` + `gh` 权威通道当场核实。

---

## 0. 一图看懂当前状态

| 维度 | 状态 | 证据 |
|---|---|---|
| 代码侧 10 项优先级（P0→P3） | ✅ 全完成 | `docs/final-verification.md` 第 9 行「10/10」 |
| 分支错位隐患（🔴 历史） | ✅ 已根除 | PR 已合并，codex 是 main 的祖先；两者 SHA 不相同 |
| PR #2 | ✅ **MERGED** | `mergedAt=2026-09-06T16:44:56Z`、`mergeCommit=4607574` |
| CI（python + node 双 job） | ✅ 全绿 | 最近 3 次 run 均 `conclusion=success` |
| 测试 | ✅ 不破坏 | pytest **231 passed**、Node 792/792、pip-audit 0 漏洞 |
| 本地备份回滚点 | ✅ 存在 | `backup/round2-df98ef5`（`df98ef5`） |
| **Docker 真跑（本机）** | 🔴 阻塞 | 本机无 Docker 守护进程（见 §6 坑 5） |
| **服务器部署（③④⑤）** | 🟡 待 3 项输入 | 缺输入按 SOP 原地停（见 §4） |
| **旧 NVIDIA Key 撤销** | 🟡 待人工确认 | 此前本地审计已发现凭证暴露路径及旧对话中的真实 Key；是否被第三方读取未知，撤销仍须用户确认 |

**结论**：历史报告记录 10 项工作完成，远端 CI 已通过；这不等于容器与生产验收通过。Docker 实际构建、完整依赖审计、服务器持久化及外部访问仍待验证。三项输入是部署前置条件，不能保证到齐即可上线。

---

## 1. 绝对路径与命令前缀（接续者必读）

```bash
# 仓库本地路径（所有 git 操作在此执行）
REPO_DIR="/Volumes/1T硬盘/ai软件/home/Workbuddy/2026-09-05-14-24-01/dcs-repo"
cd "$REPO_DIR"

# gh CLI：本机装在 /Users/wangkaer/.local/bin/gh，不在非交互 shell 默认 PATH
#   —— 直接打 `gh` 会 command not found，必须绝对路径或先 export PATH
export PATH="/Users/wangkaer/.local/bin:$PATH"
GH="/Users/wangkaer/.local/bin/gh"
REPO="womeng2018-dotcom/douyin-copy-studio"

# pytest：必须用受管 venv + 显式 --basetemp（sandbox 默认 tmp 被 broker 拒绝）
VENV_PY="/Users/wangkaer/WorkBuddy/2026-09-05-14-24-01/.venv/bin/python"
"$VENV_PY" -m pytest --basetemp=/tmp/dcs-pytest-tmp

# Node 自测（前端零 npm 依赖，直接 node 跑）
node stress-test.js && node test-engine.js && node build-single.js --check
```

**GitHub 核实通道**：使用 `gh pr view` / `gh run list` / `gh api` 读取远端状态，不使用 `git ls-remote`。网络失败不代表本地提交有误，不 reset 到可能过期的 origin ref。没有发布授权不 push；不能因 push 失败自动改为 Contents API 逐文件上传，这会改变提交与 CI 对应关系。

---

## 2. 提交链（merge 时刻 `main=4607574`）

```
4607574  Merge pull request #2 from womeng2018-dotcom/codex/usability-fixes   ← origin/main HEAD
7d04437  fix(ci): 移除 node job 的 cache: npm（前端零依赖无 lockfile 致 setup-node 报错）
df98ef5  docs: 安全收尾最终验收报告（P0 → P3 全 10 项汇总）
590e502  fix(git): 新增 git-safe.sh 自动清理 stale .git/index.lock
28e66e2  ci: 新增 GitHub Actions 工作流（pytest + pip-audit + node 三件套）
e37423e  fix: 重新生成 standalone.html 以与模块源同步
1d690a4  perf(rate-limit): 边界声明 + 可选 Redis 后端（Sorted Set + Lua）
e59f8aa  audit: Playwright 桌面端控制台全量捕获 + CSP 兼容性验证
293a201  docker: 重写为多阶段非 root 镜像并构建统一后端 app.py
e84fd37  security: 依赖漏洞扫描 + 修复 .env 未纳入 gitignore 的密钥入库缺口
00c2539  security: 注入安全响应头中间件(CSP/nosniff/DENY/no-referrer/Server伪造)
a3067b5  frontend: 移除file://回退 + 重建standalone + 文档校正(移除免费/Render承诺+SSRF精确描述)  ← 上轮 P0
```

本地 ref 当场核实（2026-09-07）：
- 核实前本地 `main` → `639c6c4`（含首版 HANDOFF）；远端合并提交为 `4607574`。本次文档修订提交号以 `git log -1` 为准，避免文件自引用。
- `codex/usability-fixes` → `7d04437`（`origin/codex/usability-fixes`）
- `backup/round2-df98ef5` → `df98ef5`（回滚点）
- working tree：`git status --porcelain` 为空 → **clean**

---

## 3. 10 项优先级完成表（来自 `docs/final-verification.md`）

| ID | 优先级 | 任务 | Commit | 状态 |
|---|---|---|---|---|
| P0.1 | 泄漏闭环 | Git 历史密钥扫描 | （推送前） | ✅ |
| P0.2 | 泄漏闭环 | 真实 LLM 冒烟测试 | （推送前） | ✅ |
| P0.3 | 泄漏闭环 | 推送分支 + PR | `a3067b5`（PR #2） | ✅ |
| P1.4 | 安全硬化 | 安全响应头中间件 | `00c2539` | ✅ |
| P1.5 | 安全硬化 | 依赖漏洞扫描 | `e84fd37` | ✅ |
| P2.6 | 部署可观测 | Docker 化走查 | `293a201` | ✅ |
| P2.7 | 部署可观测 | 浏览器控制台审计 | `e59f8aa` | ✅ |
| P2.8 | 部署可观测 | 限流边界说明 | `1d690a4` | ✅ |
| P3.9 | 工程化 | CI workflow | `28e66e2` | ✅ |
| P3.10 | 工程化 | git lock 防护 | `590e502` | ✅ |

**CI 首次运行修复**：node job 原 `actions/setup-node@v4` 设 `cache: npm`，但前端零 npm 依赖、无 lockfile → setup-node 报 `Dependencies lock file is not found` 退出（run 34046066805 30s 失败）。改为 `cache: ""` 后（commit `7d04437`）双 job 全绿。

---

## 4. 部署 SOP（③ 服务器 docker build / ④ compose up / ⑤ 上线冒烟）

**SOP 权威原文**：`/Users/wangkaer/Documents/kimi/tasks/2026-09-05/07-13-28-e534f00d/workbuddy-deploy-prompt.md`（v2，2538 字节，已读、准确）。核心纪律三句话：

1. **先收齐 3 项输入，拿不到就停，不瞎跑**：
   - ① 服务器 `user@host`（+ 端口）
   - ② 线上域名 / 公网 IP（或明确「仅内网可达」）
   - ③ 旧 NVIDIA Key 已在 NVIDIA 控制台撤销确认（没撤就先去撤，再回）
2. **服务器上一条链路走完**：`clone → build（顺带验证 .env 不进镜像）→ compose up → 五项冒烟全过才算成`。
3. **冒烟任何一项不过立即 `docker compose down` 回滚并只报告**。

**执行链路（在服务器上）**：
```bash
# 在本地执行；使用已通过 CI 的固定提交，不从可变 main 取码。
# archive 包含该提交的全部跟踪文件（包括 tests），不会按 .gitignore 自动过滤。
# .git 不在归档内；构建排除由 .dockerignore 控制。
# 上传前核验归档清单无真实凭证；远端目标必须为新的版本目录，避免覆盖旧版本。
git archive 460757492ebbf25c3478c5e8e1a2829db4e10002 | ssh <user@host> "mkdir -p dcs/releases/4607574 && cd dcs/releases/4607574 && tar -x"

# 以下命令在服务器该版本目录执行。

# 验证 .env 不进镜像（构建上下文应无真实密钥）
docker build -f server/Dockerfile -t copy-studio:latest . --no-cache
docker run --rm --entrypoint sh copy-studio:latest -c 'find /app -type f -name "*.env"'
# 期望无输出；本项只检查最终文件系统，不能证明历史层无密钥。
# 还须核对 .dockerignore、Dockerfile COPY 范围和构建上下文；禁止通过 ARG/ENV 写入真实密钥。

# 服务器建运行时密钥（从模板复制，填 LLM_API_KEY）—— 此文件不进仓库、不落本地
cp server/.env.example server/.env && $EDITOR server/.env   # 仅填 LLM_API_KEY

# 启动：缺 COPY_STUDIO_ACCESS_KEY 会 fail-closed 不起
COPY_STUDIO_ACCESS_KEY="<强随机>" docker compose up -d

# 五项冒烟（compose 端口 127.0.0.1:8765，仅绑本机，外部需反代+TLS）
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/api/health          # 期望 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/api/llm/chat -X POST     # 期望 401（未带密钥）
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/nonexistent         # 期望 404
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/secret/path         # 期望 404（静态白名单外）
# 数据卷持久化 + 最小 LLM 调用（带正确密钥，验证 LLM_API_KEY 生效、非 503）
```

**运行时必填 / 常见坑**：
- `COPY_STUDIO_ACCESS_KEY` → 注入 `TENANT_KEYS`（compose 写 `default:${COPY_STUDIO_ACCESS_KEY:?...}`）。缺则 `_startup_guard` fail closed，服务不起。
- `LLM_API_KEY` 经服务器 `server/.env` 注入（env_file）。**未建该文件或为空 → 上游调用返回 503**。deploy-prompt v2 已补「第 3 步建 .env」。
- 镜像 `PORT=8765`、`EXPOSE 8765`；compose 映射 `127.0.0.1:8765:8765`（**仅绑本机**）。对外可达需前置反代 + TLS，；不得仅靠修改绑定和 CORS 代替 TLS、鉴权及防火墙。

---

## 5. 残留风险（来自 `docs/final-verification.md` 第七节，状态更新）

| 编号 | 风险 | 严重度 | 当前状态 |
|---|---|---|---|
| R1 | 本机无 Docker 守护进程，实际 `docker build/run` 未执行 | 中 | 🟡 已决定在服务器一次做完（③④⑤ 合并） |
| R2 | ML 栈传递依赖未递归审计（仅顶层 0 漏洞） | 中 | 🟡 CI 仅安装轻量运行/测试依赖；ML 顶层仍使用 `--no-deps --disable-pip`，解析失败还会跳过。完整镜像依赖审计未完成 |
| R3 | `requirements.txt` 未 pin | 低 | ⚪ 可选：`pip-compile` 生成带 hash 锁文件 |
| R4 | compose 端口绑 `127.0.0.1`，LAN 访问须改 + 配 `CORS_ORIGINS` | 低 | ⚪ 部署文档已提示 |
| R5 | `git add -f` 仍可绕过 `.gitignore` 强制入库 | 低 | ⚪ 建议服务端 push protection / pre-commit |
| R6 | CI 首次运行本会话内未执行 | — | ✅ 已解决：push 后 GitHub 触发，双 job 全绿 |

---

## 6. 本机环境坑清单（接续者避坑）

1. **直连 github.com:443 被防火墙阻**，git clone 经代理常 502 → 完整仓库用 `https://codeload.github.com/<repo>/tar.gz/<branch>` 拉 tarball。
2. **全局代理** `HTTP_PROXY=127.0.0.1:<port>` 会拦截 ima/COS 等 → 脚本顶部注入 `no_proxy=ima.qq.com,myqcloud.com`。
3. **`gh api` 通道稳定**，只读核实优先走 gh；发布需授权并保持提交原子性。
4. **sandbox tmp**：pytest 默认 `--basetemp` 被 broker 拒绝 → 必须显式 `--basetemp=/tmp/dcs-pytest-tmp`。
5. **本机无 Docker 守护进程**（无 `docker`/OrbStack/colima/brew）→ P2.6 用容器等价环境变量直接跑 `server/app.py` 验证；真 `docker build` 只能上服务器。
6. **MutableHeaders 无 `.pop()`** → 中间件改写头用 `del` + 赋值。
7. **uvicorn 自带 `Server: uvicorn`** → `__main__` 加 `server_header=False`，再由中间件注入 `Server: CopyStudio`，最终唯一。

---

## 7. 铁律（全程不可违反）

- **不破坏现有测试**：任何改动后必跑 §1 的 pytest / Node 自测；231 passed 是红线。
- **发现泄漏立即停止只报告**：任何真实密钥出现在日志/镜像/仓库 → 停手、报告、等指令，不自行扩散。
- **密钥仅在授权的服务器运行时配置落盘 / 不进仓库**：`server/.env`、`*.env` 已被 gitignore 排除；`.env.example` 可追踪但**不含真实值**。服务器 `.env` 仅在服务器本地建，不回传本机。
- **缺 3 项部署输入原地停**（§4 输入闸门）：不探测、不 build、不 compose。
- **冒烟不过即 `docker compose down` 回滚**：只报告，不就地改代码救火。

---

## 8. 接续者下一步（按序）

1. **【阻塞中】等用户给齐 3 项输入**（§4 ① 服务器 SSH ② 域名/IP ③ 旧 NVIDIA Key 已撤确认）。到齐前不执行服务器变更；允许本地只读核实及交接文档修订。
2. 到齐后按 §4 链路在**服务器**执行 ③④⑤；本机不再碰 Docker。
3. 五项冒烟全过 → 向用户交付「上线报告」（health 200 / 401 / 404×2 / 数据卷+最小 LLM 调用 五证 + 端口绑定说明 + 反代建议）。
4. 任一不过 → `docker compose down` 回滚，只报告失败项与现象，等指令。
5. 可选收尾：R3 `pip-compile` 锁文件、R5 服务端 push protection。

---

## 9. 相关文件索引

| 文件 | 角色 |
|---|---|
| `docs/HANDOFF.md`（本文件） | 跨会话续跑主档案 |
| `docs/final-verification.md` | 10 项优先级完整验收报告 |
| `docs/security-audit.md` | 依赖漏洞扫描 + gitignore 修复证据 |
| `docs/docker-walkthrough.md` | Docker 化走查（静态验证 + 运行时等价模拟） |
| `docs/console-audit.md` | 浏览器控制台审计 + CSP 兼容性证据 |
| `.github/workflows/ci.yml` | CI 工作流（python + node 双 job） |
| `scripts/git-safe.sh` | stale lock 自动清理 |
| `server/Dockerfile` / `docker-compose.yml` / `server/.env.example` | 部署三件套 |
| `/Users/wangkaer/Documents/kimi/tasks/2026-09-05/07-13-28-e534f00d/workbuddy-deploy-prompt.md` | **部署 SOP 权威原文（v2）** |
| 项目记忆：`/Users/wangkaer/WorkBuddy/2026-09-05-14-24-01/.workbuddy/memory/MEMORY.md` 与 `2026-09-07.md` | 当前进度主档案 |
| 用户级记忆：`~/.workbuddy/MEMORY.md` | 跨项目偏好与 `gh` 路径等坑 |


## 10. 本次独立复核与验收补充（2026-09-07）

- 通过 gh 实时确认 PR #2 为 MERGED，合并时间 2026-09-06T16:44:56Z。
- CI run 34046435516、34046434539（4607574）及 34046354103（7d04437）均 success。链接格式：https://github.com/womeng2018-dotcom/douyin-copy-studio/actions/runs/<ID>。
- 本次仅核对源码、配置、文件路径、本地 refs 和远端 CI；没有重跑 pytest、真实 LLM、Docker，也没有验证密钥撤销。231/792 为既有报告及 CI 对应的证据，不是本轮执行计数。
- docs/final-verification.md 是历史快照，其中未推送及首次 CI 未执行等内容已经过期；当前状态以上述 gh 核实为准。
- 三项部署输入之外，实际执行还需可用 SSH 认证、新 LLM 凭证及访问密钥的安全注入。不得要求用户在聊天粘贴密钥。服务器 env 文件权限设为 600；访问密钥须稳定保存以便重启，禁止记录进命令日志。
- 最小 LLM 请求用 POST /api/llm/chat、X-API-Key 认证及 messages 正文（stream=false）。必须验证非空有效回答及成功状态，不能把“不是 503”当成成功；真实调用需在已授权费用范围内。
- 持久化验证：通过 POST /api/history 写入独立测试记录（kind=generation，title 为唯一验收标记，payload 为测试对象）；记录返回 ID，重建容器后用 GET /api/history 查证同一 ID 与内容，再只删除该测试记录。禁止清空历史。
- 泄漏回归至少检查 /server/.env、/.git/config、/server/app.py 均不可下载；任意不存在路径 404 不能替代此检查。
- 公网交付必须从外部验证 HTTPS、页面加载、鉴权及真实 API；仅服务器 localhost 冒烟不能证明公网可用。
- docker compose down 只是停止本次服务，不等于恢复旧部署。首次部署失败可 down（禁止 -v）；升级须先保留旧镜像/配置及一致性数据备份，按可恢复计划回到旧版本。未识别既有服务前不得覆盖或停止它。
- 外部 SOP 文件是辅助参考，缺失时以本档的明确步骤和用户授权为限；不能按其未提供内容推断新权限。

---

## 11. 本机交付（2026-09-08，WorkBuddy 执行；Codex 负责规划与独立复核）

### 11.1 当前采用方案

**本机一键启动闭环，暂不做服务器部署。** 未迁移为其它技术栈，仍是 HTML/CSS/JS + FastAPI。

```
双击 start.command → start-local.sh → server/app.py（统一后端，单端口 http://127.0.0.1:8765）
```

启动约束（已核实并保持）：`HOST=127.0.0.1`、`REQUIRE_AUTH=false`、`CORS_ALLOW_NULL=false`、
`ALLOW_REMOTE_URL=false`；启动脚本只检测依赖、缺失即提示退出，**不自动安装/升级依赖**。
`git_safe_check` 为既有 P3.10 交付，仅清理 0 字节且 mtime>5min 的 stale lock，本次未改动其行为。

### 11.2 本次提交（6 个，均在 `main`，**未 push**）

| 提交 | 内容 |
|---|---|
| `ae4827f` | **A4–A8 收口**：补齐 `/api/llm/chat` 厂商不匹配拦截（此前缺失，会拿 A 厂密钥真实打 B 厂端点致 CHAT_FAIL/401）；新增 `E_LLM_PROVIDER_MISMATCH` 与 `_llm_provider_mismatch_response`；`/api/health` 暴露 `llm_mixed_source`/`llm_provider_mismatch`；`start-local.sh` A4 健康探测补 `--noproxy`；前端 A8 状态分层（未配置/厂商不一致已拦截/来源混杂/已填写配置尚未实测/本次生成成功已实测连通，杜绝笼统「已连接」）；新增 3 个回归测试 |
| `6c64d13` | `.env` 加载：明确优先级 + 冲突告警 + 权限收紧 600 + LLM 凭证组来源核验；新增 10 个离线契约测试 |
| `f9e0fd1` | 未配置密钥时明确提示「在线 AI 未配置」（后端 `E_LLM_NOT_CONFIGURED` + 前端区分文案并保留输入）；重建 standalone |
| `6ed2ac6` | `start-local.sh` 依据 `server/.env` 准确显示在线 AI 配置状态（纯解析读取，不执行文件内容） |
| `f6d62c6` | 模板中未经确认的退款承诺 / 门店事实加「待确认」标记（10 处，不改文案）；重建 standalone |
| `f43ee10` | **D 商汤真实调用收口**：`_effective_max_tokens` 兜底 `sensenova-*` 到 4096；非流式 200+空内容有界重试 + `E_UPSTREAM_EMPTY`；流式整体缓冲 + 透传成功尝试 + 剥掉上游 `[DONE]`；新增 7 个测试（253 passed）；真实调用成功（content 非空、3.8–36.6s） + SQLite 保存 + 重启找回 |

基线 HEAD `3f6e063`；当时 HEAD `f43ee10`；working tree clean（前端改动已 `node build-single.js` 重建 standalone 并入同一提交）。此后 HEAD 推进见 §11.9。

### 11.3 配置方法（商汤 SenseNova）

```bash
cd /Users/wangkaer/WorkBuddy/2026-09-05-14-24-01/dcs-repo
cp server/.env.example server/.env
chmod 600 server/.env
# 用本地编辑器填写（不要把 Key 发到聊天）：
#   LLM_API_KEY=sk-你的商汤密钥      ← 或 SENSENOVA_API_KEY
#   LLM_API_BASE  默认 https://token.sensenova.cn/v1（代码默认值，可省略）
#   LLM_MODEL     默认 deepseek-v4-flash；高频场景可改 sensenova-6.8-flash-lite
```

**配置加载语义（已明确，不静默）**：
- 默认**环境变量优先**，`server/.env` 不覆盖已有环境变量。保留此语义是必要的：`tests/conftest.py`
  靠它确保「测试绝不读取真实 .env」，若反转优先级，配好 Key 后跑 pytest 会让测试打到真实上游并产生费用。
- 需要 `.env` 优先时，启动时设 `COPY_STUDIO_DOTENV_OVERRIDE=1`。
- 同名不同值一律记录**键名**（绝不记录值）并在启动日志醒目提示，附修正方式。
- 密钥、Base、Model 作为**一组**核验；来源混杂时告警，防止把凭证发错服务。
- `.env` 权限自动收紧为 600；启动日志不打印密钥、认证头或带密钥的异常。

**实测生效证据**：占位 `.env` 下启动日志为
`LLM: https://token.sensenova.cn/v1 / sensenova-6.8-flash-lite (已配置 Key)`；
占位文件已删除，`git status` 无任何 `.env` 踪迹。

### 11.4 商汤接口（来源：platform.sensenova.cn 官方文档，2026-09-08 检索）

| 项 | 官方值 |
|---|---|
| Base URL | `https://token.sensenova.cn/v1`（OpenAI 兼容） |
| 认证 | `Authorization: Bearer $SENSENOVA_API_KEY`，Key 以 `sk-` 开头 |
| 文本对话模型 | `deepseek-v4-flash`（默认名，平台提供）、`sensenova-6.8-flash-lite`、`glm-5.2`、`kimi-k3`、`deepseek-v4-pro` |
| 非对话模型 | `sensenova-u1-fast` / `sensenova-u1.5-lite` 为图像生成专用（`/v1/images/generations`），**不可作对话模型** |
| 必填参数 | `model`、`messages`；`stream` 默认 false |

**费用：未能确认。** 官方 Token Plan 页同时存在「公测期完全免费开放、付费档位即将上线」与
「2026-08-28 启用新的积分规则（通用积分）」两种表述，当前是否产生费用无法从文档确证。
**因此真实调用前已停止，等待用户授权**（见 §11.7）。

### 11.5 已验证证据

| 项 | 结果 |
|---|---|
| `start.command` 双击链路 | ✅ 实际启动后端并自动打开页面（浏览器加载全部前端资源） |
| 健康与页面 | ✅ `/api/health` 200、`/` 200、`/standalone.html` 200 |
| 泄漏回归 | ✅ `/server/.env`、`/.env`、`/.git/config`、`/server/app.py`、`/app.py`、`/scripts/git-safe.sh` 全部 **404**；非"任意路径 404"替代 |
| 未配置提示（接口） | ✅ `POST /api/llm/chat` → 503 + `error_code=E_LLM_NOT_CONFIGURED` |
| 未配置提示（浏览器） | ✅ 页面显示「在线 AI 未配置…你输入的原文已保留」；输入 34 字符前后一致；控制台仅预期 503 |
| 离线功能 | ✅ `Humanizer-zh` 为纯本地规则引擎，无 Key 也能改写出结果 |
| SQLite 历史（后端） | ✅ 写入唯一标记记录 → **杀进程重启** → 同一 `id`/`title`/`payload` 找回；随后**只删该条**，未清空历史 |
| 浏览器历史（前端） | ✅ 生成后 localStorage `dycs_history` 2 条；**刷新页面**后条数与首条 brand/cat/time 完全一致 |
| 后端测试 | ✅ pytest **244 passed**（231 基线 + 10 离线契约 + 3 厂商不匹配回归） |
| 前端测试 | ✅ stress-test **792/792**、test-engine 通过 |
| standalone 一致性 | ✅ `node build-single.js` 重建 `standalone.html`，内联 12 个脚本、零残留外链、`build-single.js --check` 通过 |
| **A4 重复启动检测** | ✅ 真实起一个本项目实例占 8765 后，`bash start-local.sh` 命中「已在运行」分支、`exit 0`、**不启动第二个进程**、仅 `open` 页面；端口被未知进程占用时只提示绝不 `kill` |
| **A5 统一配置解析** | ✅ `server/envconfig.py` 被 `app.py` 与 `start-local.sh` 共用；空值不注入 `os.environ`（修复 `int("")` 崩溃）；`resolve_llm_config` 返回 `key_provider`/`base_provider`/`provider_mismatch` |
| **A6 来源混杂 + 厂商不匹配拦截** | ✅ 假 `nvapi-` 密钥 + 商汤 Base → `/api/llm/chat` 与 `/api/llm/vision` 均返回 **503 `E_LLM_PROVIDER_MISMATCH`**，且**实测未发起任何上游请求**（回归测试 `called["n"]==0` 断言）；`/api/health` 同步暴露 `llm_provider_mismatch:true` |
| **A7 安全配置入口** | ✅ 缺失 `server/.env` 时生成 600 模板（不覆盖已有）；`conftest.py` 将真实 `.env` 临时 stash 再还原，测试绝不读取真实密钥；241→244 全绿 |
| **A8 前端状态分层** | ✅ `rwLlmStatus` 不再笼统「已连接」：`/api/health` 驱动「未配置 / 凭证厂商不一致(已拦截) / 来源混杂 / 已填写配置(尚未实测)」；仅真实生成成功才翻为「本次在线生成成功（已实测连通）」；厂商不一致时回退提示词模式并保留用户输入 |

**历史存储是两套，不可混称**：浏览器历史 = localStorage `dycs_history`（仅记录「文案生成」tab，
上限 20 条，随浏览器配置文件走）；SQLite 历史 = 后端 `/api/history`（服务端持久化）。
**前端页面历史 tab 不调用 `/api/history`**，两者尚未打通。

### 11.6 内容可用性缺陷（已记录，未擅自改文案）

`js/data-category.js` 的模板会直接输出**未经确认的退款承诺与门店事实**，而 `js/data-compliance.js`
已把「随时退/过期退」列为 P2 承诺类并提示"须与后台套餐规则及门店实际一致"——即生成端与校验端口径不一致。

涉及：`团购未核销随时退`、`未核销随时退`、`团购随时退`、`做完不满意可以调`、
`连锁门店、平台担保，跑不了`、`{storeCount}家连锁同一套服务标准` 等共 **10 处**。

处理：已在源码对应行加 `// 待确认：…` 标记（**不改动文案本身**，避免擅自变更业务内容）。
是否改为生成结果上的可见提示、或调整为可配置开关，属产品决策，交由 Codex/用户裁定。
合规扫描通过**不等于**事实已核验或保证平台过审。

### 11.7 剩余事项与停止点

- **A 部分（A4 重复启动 / A5 统一配置 / A6 来源混杂+厂商不匹配拦截 / A7 安全配置入口 / A8 前端状态分层）已全部完成并本地提交（`ae4827f`），244 测试全绿。**
- **B 文案事实（1–8）已完成并本地提交（`974e1db`）**：10 处静默 `// 待确认` 注释转为生成文案内可见的 `【待确认：具体事项】` 标注（共 11 处短语），价格数字保持原值、未臆造价格差；新增 `test-data-category.js` 回归测试。
- **C 保存闭环（1–9）部分完成并本地提交（`c8b1d2b`）**：
  - ✅ C2 保存成功/失败提示（`saveRewriteHistory` 增加 toast）
  - ✅ C3 防重复入库（后端 `content_hash` + 部分唯一索引，幂等保存）
  - ✅ C5 不存密钥（payload 仅含 mode/original/rewritten，无密钥）
  - ✅ C9 人工提示词降级分支不记生成成功（已验证 fallback 路径不调用 save）
  - 🟡 仍待办（产品/大改，未启动）：C1 前端历史 tab 仍用 localStorage、未统一到后端 SQLite；C4 后端历史的查看/搜索/重开 UI；C6 旧 localStorage 迁移标记；C7 三种恢复形式化验证；C8 离线可用性（localStorage 已离线可用，属已部分满足）
1. **D 商汤真实调用：已完成最小验证并本地提交**（见本次新增 commit `f43ee10`）：
  1. 用户提供 `LLM_API_KEY`（sk- 开头，商汤 SenseNova），模型 `sensenova-6.8-flash-lite`。
  2. 写入 `server/.env`（600 权限、gitignore 排除，不入仓）。
  3. `/api/health` 三态：`llm_configured:true`、`llm_mixed_source:false`、`llm_provider_mismatch:false`。
  4. 真实 `POST /api/llm/chat`（非流式 + 流式各一次）：`content` 非空，耗时 3.8–36.6s。
  5. `POST /api/history` 保存：首次 `duplicate:false`，重复 `duplicate:true` 同 id。
  6. 重启 server → `GET /api/history` 找回同一 id 记录（SQLite 持久化）。
  7. **关键发现**：`sensenova-6.8-flash-lite` 是**深度推理模型**——
     - 上游返回体多 `message.reasoning` 与 `usage.completion_tokens_details.reasoning_tokens`。
     - `max_tokens<4096` 时 reasoning 几乎 100% 把 `content` 截断到空（1500/2048/3000 全空，4096 才有合理命中率）。
     - 通用参数（`thinking:false` / `enable_thinking:false` / `reasoning:false`）**均无法关掉推理**。
     - 单次调用非确定性：同一 `max_tokens=4096`、同一提示词 5 次中 1–2 次拿到 content。
  8. **代码与产品保护**（已提交）：
     - `_effective_max_tokens`：`LLM_MODEL` 以 `sensenova-` 开头时强制 `max_tokens>=4096`。
     - 非流式 200+空内容 → 最多重试 2 次（共 3 次）后 502 + `E_UPSTREAM_EMPTY`；5xx / 超时不重试。
     - 流式整体缓冲 + 透传成功尝试 + 剥掉上游尾随 `[DONE]`、由本函数统一追加一次；空流耗尽 → 发 `E_UPSTREAM_EMPTY` + `[DONE]`，客户端不会在空尝试的 `[DONE]` 上提前 finish。
     - 视觉契约保留：前端 `rewrite-tab.js` 已有的「返回内容为空」降级（L726）继续生效；本次新增的 `E_UPSTREAM_EMPTY` 走 `j.error` 通道更精准。
  9. **测试**：`tests/test_llm_proxy.py` 新增 7 个用例，全量 **253 passed**（246 旧 + 7 新）。
  10. **生产建议（给汪判断）**：若在意单次成功率与延迟，**优先 `deepseek-v4-flash`（默认 500 次/5h，非推理模型，命中率高、低延迟）**；保留 `sensenova-6.8-flash-lite` 适合需要更高质量、且接受 ~36s 延迟与偶发空流重试的场景（1500 次/5h，量大价低）。
2. **页面内真实改写未验证**——目前页面级验证只到「未配置降级」「厂商不匹配拦截」与「生成成功状态翻牌」路径，真实改写需 Key 后补做。
3. **两套历史未打通**（§11.5）：浏览器 localStorage `dycs_history` 与后端 SQLite `/api/history` 并存，前端历史 tab 不调用后端；是否统一属产品决策。
4. **NVIDIA 旧 Key 撤销状态：未确认。** 换用商汤**不消除**旧 Key 的历史风险；
   需账户本人在 NVIDIA 控制台自行登录确认与撤销。未识别到具体旧 Key 前，不得批量撤销其它密钥。
5. ~~**`/api/llm/vision` 暂未同步 D 保护**~~（本次只改了 chat 路由）—— ✅ 已由 `dbb0554` 修复：`_effective_max_tokens` 兜底 + 共享非流式空内容有界重试 + 200+非 JSON 归一化 502（见 §11.9）。

> 本机交付全部改动已由 2026-09-08 第二轮 push 至远端（`5bafa5e..a30d937` → `origin/main`，见 §11.9）；本轮新增提交同样即时 push，不留未推送提交。

### 11.8 用户如何启动

双击仓库根目录 `start.command`（或终端 `bash start-local.sh`），浏览器会自动打开
`http://127.0.0.1:8765`；`Ctrl+C` 停止。未配置 Key 时在线改写不可用，其余功能正常。

### 11.9 遗留项修复（2026-09-08 第二轮 —— D 收口审核意见执行记录）

审核方（Codex）对 D 收口（`f43ee10` + `a30d937`）的遗留项按 P0/P1/P2 执行完毕，全部已 push。

**P0 远端备份（不再有本地孤立提交）**：本轮开头先把上一轮 19 个本地提交（`5bafa5e..a30d937`）push
至 `origin/main`（`4607574..a30d937`）；此后铁律：每笔提交后立即 push。

| 提交 | 内容 | 测试 |
|---|---|---|
| `dbb0554` | **vision 同步 D 保护 + 流式缓冲期心跳**：`_post_nonstream_with_empty_retry` 单一共享实现（chat 非流式 + vision 共用，禁止两份复制）；vision 改走 `_effective_max_tokens`（sensenova-* 兜底 4096，同源 bug）；vision 200+非 JSON 由 500 崩溃归一化为 502 `E_UPSTREAM`；流式缓冲期每 8 s 下推 `: ping` 心跳（content 出现后停发） | +8 |
| `584f14e` | **reasoning_effort 注入**：`_apply_model_defaults` 共享单一实现（chat/vision 共用）；`sensenova-*` 注入 `reasoning_effort="low"`；非 sensenova 不注入 | +3 |
| （docs） | 本档 §11.9 + server/README.md 权衡表/失败语义（本提交，`git log -1` 核对） | — |

**reasoning_effort 实测结论（P1 顺带项 —— 支持，已注入）**：
- 文档侧：商汤 OpenAI 兼容网关官方参数表含 `reasoning_effort`（community doc 转引 platform.sensenova.cn）；
- 直连实测（模型 `sensenova-6.8-flash-lite`，2026-09-08）：`reasoning_effort=low` → **200**（3.1 s、content 101 字）；
  `high` → **200**（2.9 s）；无参对照 → 200。`thinking` / `enable_thinking` / `reasoning` 均被网关拒收（不在参数表）。
- 落地：`sensenova-*` 请求注入 `reasoning_effort="low"`，从源头压低 reasoning 预算占用（比重试更优）；
  4096 兜底 + 空内容有界重试保留作兜底。详见 server/README.md「模型选择与 LLM 失败语义」。

**生产默认模型切换（P1）**：`server/.env` 改 `LLM_MODEL=deepseek-v4-flash`（一行；`.env` 不入仓）。
理由：sensenova 单次成功率仅 20–40%、延迟 ~36 s，重试兜底后残余失败率仍有两三成；deepseek 非推理、命中率高、低延迟。
sensenova 保留可选，权衡表在 server/README.md。

**真实调用验收**（`deepseek-v4-flash`，8791 端口真实起服务，2026-09-08）：

| 调用 | 结果 | 耗时 |
|---|---|---|
| `POST /api/llm/chat` 非流式 | 200、`ok:true`、content 39 字（非空） | 2.48 s |
| `POST /api/llm/chat` 流式 | 200、content 43 字、恰好 1×`data: [DONE]` 收尾 | 3.19 s |
| `POST /api/llm/vision` | 200、`ok:true`、content 63 字（非空） | 2.55 s |

`/api/health`：`llm_configured:true`、`llm_provider_mismatch:false`、启动日志 `LLM: https://token.sensenova.cn/v1 / deepseek-v4-flash`。

**前端超时时长结论（P2，实测/代码核对）**：
- 前端**不存在可调空闲超时阈值**：`js/rewrite-tab.js` `streamLLMViaBackend` 的 `AbortController`
  只处理用户手动中止（无 idle/data 超时定时器）；`js/plan-generator.js` 的 fetch 同样无超时。
  本地直连（`start-local.sh`）无网关 → 无超时风险。→ **结论：无需调大前端超时（没有该阈值可调）**。
- 最坏路径 3 次尝试 × ~36 s ≈ **108 s** 的静默真正触发的是**公网网关**空闲超时
  （Nginx `proxy_read_timeout` 默认 60 s；Render/Railway 常见 ≤60 s）与用户死屏观感
  → 由 `dbb0554` 的 8 s SSE 心跳保活解决（8 s 远小于任何常见网关阈值）。若自建网关设了 <8 s 的空闲阈值
  （现实中不会这么小），才需要调网关而非代码。
- 心跳不破坏语义：SSE 注释行被前端 pump 自动跳过（`rewrite-tab.js` 只认 `data:` 行）；
  测试断言心跳帧先于内容帧、`[DONE]` 仍恰好 1 次且位于末尾。

**LLM_EMPTY_RETRIES / 配额 / 200+非 JSON 测试（P2）**：
- server/README.md 已文档化：语义（仅「200 但 content 空」重试；非 200 / 超时 / 传输错误不重试）、
  默认值 2、配额影响（**空尝试也消耗配额，最坏 ×3**）。
- 「200+非 JSON → 502 `E_UPSTREAM`」归一化补了对应测试：chat 非流式 + vision 各 1 条
  （上一轮只提了代码没提测试 —— 本轮补齐）。

**测试总量**：`tests/test_llm_proxy.py` 本轮 +11（8 vision/心跳 + 3 reasoning_effort）；
全量 pytest **264 passed**（253 基线 + 11），无回归。

**本轮不在范围（保持原状）**：服务器部署（等 3 项输入：SSH / 域名或仅内网 / 旧 NVIDIA Key 撤销确认）；
C1/C4/C6/C7/C8 产品大改。NVIDIA 旧 Key 撤销仍待用户在控制台确认。
