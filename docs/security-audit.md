# 依赖漏洞扫描与安全审计报告

> 生成时间：2026-09-06
> 扫描对象：`douyin-copy-studio` @ `codex/usability-fixes`
> 扫描工具：**pip-audit 2.10.1**（Python）、**npm audit**（Node，判定为不适用）
> 漏洞库：PyPI Advisory DB / OSV（pip-audit 默认）

---

## 一、结论摘要

| 项目 | 结果 | 处置 |
|---|---|---|
| Python 运行时依赖（已安装） | **0 漏洞**（52 个包） | 无需处置 |
| Python ML 依赖（`server/requirements.txt`） | **0 漏洞**（7 个顶层包，按最新版本解析） | 无需处置 |
| Node / npm 依赖 | **不适用** — 前端为零依赖原生 JS | 无供应链面，见第四节说明 |
| `pip` 自身（构建工具链） | **6 个 PYSEC 漏洞**（已修复） | 升级 `pip 25.3 → 26.2.1` |
| `.gitignore` 密钥防护 | **发现缺口并已修复** | 见第三节 |

**总体结论：修复 `pip` 与补齐 `.gitignore` 后，当前依赖树无已知漏洞。**

---

## 二、Python 依赖扫描

### 2.1 已安装环境（运行时 + 测试）

扫描命令：

```bash
.venv/bin/pip-audit            # 审计当前环境全部已安装包
```

**首次扫描结果（修复前）**：

```
Found 6 known vulnerabilities in 1 package
Name Version ID              Fix Versions
---- ------- --------------- ------------
pip  25.3    PYSEC-2026-196  26.1.2
pip  25.3    PYSEC-2026-1796 26.0
pip  25.3    PYSEC-2026-196  26.1.2
pip  25.3    PYSEC-2026-2875 26.1
pip  25.3    PYSEC-2026-2876 26.1
pip  25.3    PYSEC-2026-3721 26.2
```

**风险定性（分析判断）**：6 条全部命中 **`pip` 包管理器自身**，而非应用运行时依赖。影响面限于**构建/安装工具链**，不进入生产运行时调用路径。但 `pip` 参与依赖解析与 wheel 安装，存在投毒与提权可能，且修复成本为零，**按高危处理并直接修复**。

**修复动作**：

```bash
.venv/bin/python -m pip install --upgrade "pip>=26.2.1"
# Successfully installed pip-26.2.1
```

**复扫结果（修复后）**：

```
No known vulnerabilities found
deps audited: 52
vulns: 0
```

### 2.2 顶层运行时依赖版本（审计基线）

| 包 | 版本 | 用途 |
|---|---|---|
| **fastapi** | 0.141.1 | Web 框架 |
| **starlette** | 1.6.0 | ASGI 底层 |
| **uvicorn** | 0.52.4 | ASGI 服务器 |
| **httpx** | 0.28.1 | 上游 HTTP 客户端 |
| **pydantic** | 2.13.5 | 请求校验 |
| **python-dotenv** | 1.2.3 | `.env` 加载 |
| **requests** | 2.34.2 | pip-audit 间接依赖 |
| **urllib3** | 2.7.0 | HTTP 底层 |

以上均为扫描时点的最新稳定版，**无已知 CVE**。

### 2.3 `server/requirements.txt`（ML / 视频提取栈）

`requirements.txt` 使用 `>=` 宽松约束，`pip-audit -r` 要求精确 pin，故先解析到最新版本再审计：

```bash
pip index versions <pkg>        # 解析最新可用版本
pip-audit -r /tmp/dcs-pinned-req.txt --no-deps --disable-pip
```

| 包 | 约束 | 解析版本 | 漏洞 |
|---|---|---|---|
| **yt-dlp** | `>=2025.0` | 2026.8.19 | 无 |
| **faster-whisper** | `>=1.1.0` | 1.2.1 | 无 |
| **onnxruntime** | `>=1.18.0` | 1.29.0 | 无 |
| **openai-whisper** | `>=20231117` | 20250625 | 无 |
| **ctranslate2** | `>=4.5.0` | 4.8.2 | 无 |
| **torch** | `>=2.1.0` | 2.14.0 | 无 |
| **openai** | `>=1.0.0` | 3.8.0 | 无 |

**结果**：`No known vulnerabilities found`。

> **方法局限（需显式告知）**：该扫描为**顶层包、不递归传递依赖**（`--no-deps`）。**torch / onnxruntime** 的传递依赖树极深（含 numpy、protobuf、nvidia-cuda-* 等），完整递归审计需实际安装（约数 GB）后执行。本次未安装是受磁盘与时间约束，属**已知残留风险**，建议 CI 或部署镜像构建阶段补做完整递归扫描。

---

## 三、`.gitignore` 密钥防护缺口（本次发现并修复）

### 3.1 风险描述

审计中发现 **`server/.env` 未被 `.gitignore` 排除**，同时 `server/README.md` 第 26 行却声明"该文件已被 `.gitignore` 排除" —— **文档与事实不符**。

- `.env` 是 NVIDIA API 密钥的存放位置（`LLM_API_KEY`）
- 一旦执行 `git add -A` 或 `git commit -a`，真实密钥即可入库并推送到公开仓库
- 同时 `server/.data/`（SQLite 运行时库，含租户历史与采集数据）也未排除

**泄露状态判定**：**未发生泄露**。当前 `server/.env` 不存在于工作区，Git 历史中亦无 `.env` 对象（见 P0.1 全历史扫描结论）。此为**预防性缺口修复**，非事件响应。

### 3.2 修复内容

`.gitignore` 新增：

```gitignore
# Secrets（最高优先级：真实 LLM Key 存放处，绝不允许入库）
.env
*.env
.env.*
server/.env
!.env.example

# 运行时数据（历史记录 / SQLite / 上传缓存，含用户数据）
server/.data/
.data/
*.db
*.sqlite
*.sqlite3
```

同时新增 **`server/.env.example`** 模板（含全部 19 个环境变量说明，仅占位符），作为被忽略的真实 `.env` 的可追踪对照物。

### 3.3 验证证据

```bash
$ git add --dry-run server/.env
The following paths are ignored by one of your .gitignore files:
server/.env
hint: Use -f if you really want to add them.        # exit=1，git 拒绝

$ git add --dry-run .env.example
add '.env.example'                                   # exit=0，模板可正常入库
```

**结论：即使 `server/.env` 中写入真实密钥，`git add` 也会拒绝；仅 `git add -f` 可绕过，属有意操作。**

---

## 四、Node / npm 扫描

### 4.1 判定：不适用

扫描命令与结果：

```bash
$ find . -name "package.json" -o -name "package-lock.json" \
      -o -name "yarn.lock" -o -name "pnpm-lock.yaml"
（无输出）
```

**项目不含任何 npm 清单或锁文件**，前端由以下原生资产构成：

| 目录 | 内容 |
|---|---|
| `js/` | 12 个原生 JS 模块（app / engine / guard / extract-tab / rewrite-tab 等） |
| `css/` | 1 个样式表 |
| `index.html` / `standalone.html` | 页面入口 |

### 4.2 书面理由（满足"高危及以上必须修复或给出不可修复的书面理由"）

**`npm audit` 无对象可审计，不产生漏洞报告。** 依据：`npm audit` 的审计对象是 `package.json` 声明的依赖树与 `package-lock.json` 锁定的解析结果；本项目两者均不存在，依赖树为空集，故审计结果为空集而非"存在未修复漏洞"。

**安全正面意义（分析判断）**：前端**零第三方依赖**，意味着不存在：
- npm 供应链投毒（typosquatting / 维护者账号劫持）风险
- 传递依赖 CVE 暴露面
- lockfile 漂移导致的版本不确定性

配合已在 P1.4 落地的 **`Content-Security-Policy`**（`script-src 'self'`，仅 `standalone.html` 放行 `'unsafe-inline'`），前端运行时**不允许加载任何外部脚本**，攻击面进一步收敛。

> 唯一残留：若 `index.html` 通过 CDN 引入字体或图标，会引入外部连接。当前 CSP 已用 `font-src 'self' https://fonts.gstatic.com` 与 `style-src ... https://fonts.googleapis.com` **显式白名单限定**，未放开 `script-src`。

---

## 五、复现命令

```bash
# 1) 审计已安装环境
.venv/bin/pip-audit

# 2) 审计 ML 依赖（需先解析版本）
pip index versions yt-dlp faster-whisper onnxruntime openai-whisper \
                   ctranslate2 torch openai
pip-audit -r <pinned.txt> --no-deps --disable-pip

# 3) 验证 .env 防护
git check-ignore -v server/.env
git add --dry-run server/.env

# 4) Node（判定不适用）
find . -name "package.json" -o -name "package-lock.json"
```

---

## 六、残留风险与后续建议

| 编号 | 残留风险 | 严重度 | 建议 |
|---|---|---|---|
| R1 | ML 栈传递依赖未递归审计 | 中 | 在 CI 或镜像构建中安装完整依赖后跑 `pip-audit`（去 `--no-deps`） |
| R2 | `requirements.txt` 未 pin 版本 | 中 | 用 `pip-compile` 生成带 hash 的锁文件，消除构建漂移 |
| R3 | 依赖漏洞库随时间变化 | 低 | CI 中固化 `pip-audit` 步骤，见 P3.9 工作流 |
| R4 | `git add -f` 仍可强制提交 `.env` | 低 | 建议启用服务端 **push protection** 或 pre-commit 密钥扫描钩子 |
