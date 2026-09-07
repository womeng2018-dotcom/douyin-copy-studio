# HANDOFF — douyin-copy-studio 安全收尾 + 上线部署（自包含续跑档案）

> 本文件为**跨会话 / 跨 AI 自包含档案**。任何接续者（codex、新 WorkBuddy 会话、人工）读完此文件 + 下列命令前缀，即可在不依赖本会话上下文的前提下继续。
> 最后更新：**2026-09-07**（本地时间），数据以 `git` + `gh` 权威通道当场核实。

---

## 0. 一图看懂当前状态

| 维度 | 状态 | 证据 |
|---|---|---|
| 代码侧 10 项优先级（P0→P3） | ✅ 全完成 | `docs/final-verification.md` 第 9 行「10/10」 |
| 分支错位隐患（🔴 历史） | ✅ 已根除 | `main` 与 `codex/usability-fixes` 已 fast-forward 对齐 |
| PR #2 | ✅ **MERGED** | `mergedAt=2026-09-06T16:44:56Z`、`mergeCommit=4607574` |
| CI（python + node 双 job） | ✅ 全绿 | 最近 3 次 run 均 `conclusion=success` |
| 测试 | ✅ 不破坏 | pytest **231 passed**、Node 792/792、pip-audit 0 漏洞 |
| 本地备份回滚点 | ✅ 存在 | `backup/round2-df98ef5`（`df98ef5`） |
| **Docker 真跑（本机）** | 🔴 阻塞 | 本机无 Docker 守护进程（见 §6 坑 5） |
| **服务器部署（③④⑤）** | 🟡 待 3 项输入 | 缺输入按 SOP 原地停（见 §4） |
| **旧 NVIDIA Key 撤销** | 🟡 待人工确认 | 无真实密钥泄漏证据，但需用户在 NVIDIA 控制台确认已撤 |

**结论**：代码侧已 100% 闭环，唯一真阻塞是「服务器部署所需的 3 项输入未到齐」。代码不会动、测试不退化，等输入即可上服务器跑完 ③④⑤。

---

## 1. 绝对路径与命令前缀（接续者必读）

```bash
# 仓库本地路径（所有 git 操作在此执行）
REPO_DIR="/Users/wangkaer/WorkBuddy/2026-09-05-14-24-01/dcs-repo"
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

**GitHub 网络通道铁律**：`git push`/`git fetch` 经本机代理常 `502`，但 `gh api` 通道稳定。推送失败一律改用 `gh api` Contents API 逐文件上传（取 sha → `gh api -X PUT` base64）；**严禁在 `git fetch` 失败后 `git reset --hard origin/main`**（origin 引用是旧的，会回滚本地新提交）。

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
- `main` → `4607574`（`HEAD -> main, origin/main`）
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
# 取码：git archive 自动排除 .env / .git / tests，且不带 GitHub 令牌
git archive main | ssh <user@host> "mkdir -p dcs && cd dcs && tar -x"

# 验证 .env 不进镜像（构建上下文应无真实密钥）
docker build -t copy-studio . --no-cache
docker run --rm copy-studio find / -name '*.env' -not -path '*/env.example' 2>/dev/null   # 期望仅 .env.example

# 服务器建运行时密钥（从模板复制，填 LLM_API_KEY）—— 此文件不进仓库、不落本地
cp server/.env.example server/.env && $EDITOR server/.env   # 仅填 LLM_API_KEY

# 启动：缺 COPY_STUDIO_ACCESS_KEY 会 fail-closed 不起
COPY_STUDIO_ACCESS_KEY="<强随机>" docker compose up -d

# 五项冒烟（compose 端口 127.0.0.1:8765，仅绑本机，外部需反代+TLS）
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/api/health          # 期望 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/api/llm -X POST     # 期望 401（未带密钥）
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/nonexistent         # 期望 404
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/secret/path         # 期望 404（静态白名单外）
# 数据卷持久化 + 最小 LLM 调用（带正确密钥，验证 LLM_API_KEY 生效、非 503）
```

**运行时必填 / 常见坑**：
- `COPY_STUDIO_ACCESS_KEY` → 注入 `TENANT_KEYS`（compose 写 `default:${COPY_STUDIO_ACCESS_KEY:?...}`）。缺则 `_startup_guard` fail closed，服务不起。
- `LLM_API_KEY` 经服务器 `server/.env` 注入（env_file）。**未建该文件或为空 → 上游调用返回 503**。deploy-prompt v2 已补「第 3 步建 .env」。
- 镜像 `PORT=8765`、`EXPOSE 8765`；compose 映射 `127.0.0.1:8765:8765`（**仅绑本机**）。对外可达需前置反代 + TLS，或改绑 `0.0.0.0`（并配 `CORS_ORIGINS`）。

---

## 5. 残留风险（来自 `docs/final-verification.md` 第七节，状态更新）

| 编号 | 风险 | 严重度 | 当前状态 |
|---|---|---|---|
| R1 | 本机无 Docker 守护进程，实际 `docker build/run` 未执行 | 中 | 🟡 已决定在服务器一次做完（③④⑤ 合并） |
| R2 | ML 栈传递依赖未递归审计（仅顶层 0 漏洞） | 中 | 🟡 CI 已装全量后跑 `pip-audit`（去 `--no-deps`），结果待部署时复核 |
| R3 | `requirements.txt` 未 pin | 低 | ⚪ 可选：`pip-compile` 生成带 hash 锁文件 |
| R4 | compose 端口绑 `127.0.0.1`，LAN 访问须改 + 配 `CORS_ORIGINS` | 低 | ⚪ 部署文档已提示 |
| R5 | `git add -f` 仍可绕过 `.gitignore` 强制入库 | 低 | ⚪ 建议服务端 push protection / pre-commit |
| R6 | CI 首次运行本会话内未执行 | — | ✅ 已解决：push 后 GitHub 触发，双 job 全绿 |

---

## 6. 本机环境坑清单（接续者避坑）

1. **直连 github.com:443 被防火墙阻**，git clone 经代理常 502 → 完整仓库用 `https://codeload.github.com/<repo>/tar.gz/<branch>` 拉 tarball。
2. **全局代理** `HTTP_PROXY=127.0.0.1:<port>` 会拦截 ima/COS 等 → 脚本顶部注入 `no_proxy=ima.qq.com,myqcloud.com`。
3. **`gh api` 通道稳定**，`push` 走 `gh api` Contents API（`git push` 常 502）。
4. **sandbox tmp**：pytest 默认 `--basetemp` 被 broker 拒绝 → 必须显式 `--basetemp=/tmp/dcs-pytest-tmp`。
5. **本机无 Docker 守护进程**（无 `docker`/OrbStack/colima/brew）→ P2.6 用容器等价环境变量直接跑 `server/app.py` 验证；真 `docker build` 只能上服务器。
6. **MutableHeaders 无 `.pop()`** → 中间件改写头用 `del` + 赋值。
7. **uvicorn 自带 `Server: uvicorn`** → `__main__` 加 `server_header=False`，再由中间件注入 `Server: CopyStudio`，最终唯一。

---

## 7. 铁律（全程不可违反）

- **不破坏现有测试**：任何改动后必跑 §1 的 pytest / Node 自测；231 passed 是红线。
- **发现泄漏立即停止只报告**：任何真实密钥出现在日志/镜像/仓库 → 停手、报告、等指令，不自行扩散。
- **密钥不落盘 / 不进仓库**：`server/.env`、`*.env` 已被 gitignore 排除；`.env.example` 可追踪但**不含真实值**。服务器 `.env` 仅在服务器本地建，不回传本机。
- **缺 3 项部署输入原地停**（§4 输入闸门）：不探测、不 build、不 compose。
- **冒烟不过即 `docker compose down` 回滚**：只报告，不就地改代码救火。

---

## 8. 接续者下一步（按序）

1. **【阻塞中】等用户给齐 3 项输入**（§4 ① 服务器 SSH ② 域名/IP ③ 旧 NVIDIA Key 已撤确认）。到齐前什么都别做。
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
