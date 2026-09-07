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
