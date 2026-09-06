# 浏览器控制台全量审计报告

> 审计时间：2026-09-06
> 对象：Copy Studio 前端 @ `codex/usability-fixes`
> 工具：**Playwright（Chromium headless）**，桌面视口 1440×900
> 后端：`server/app.py`（含 P1.4 安全响应头中间件）

---

## 一、结论

| 页面 | 操作 | console error | console warning | pageerror | 网络失败 | CSP 违规 |
|---|---|---|---|---|---|---|
| `/`（index.html） | 加载 + 点击全部 7 个 tab | **0** | **0** | **0** | **0** | **0** |
| `/standalone.html` | 加载 + 点击 tab | **0** | **0** | **0** | **0** | **0** |

**总计 9 个事件，全部为 info 级（导航与 tab 访问记录），无任何 error / warning。**

---

## 二、审计方法

捕获四类信号，脚本位于 `/tmp/dcs-console-audit.js`：

| 信号 | Playwright API |
|---|---|
| console.*（全级别） | `page.on('console')` |
| 未捕获 JS 异常 | `page.on('pageerror')` |
| 网络请求失败 | `page.on('requestfailed')` |
| HTTP ≥ 400 | `page.on('response')` |

走查路径：

1. `GET /`（index.html）
2. 依次点击 7 个 tab：`brief` / `check` / `data` / `extract` / `gen` / `history` / `rewrite`
3. `GET /standalone.html`（单文件构建版）

分类器按关键字标记 `CSP` / `MIXED-CONTENT` / `DEPRECATION` / `FAVICON` / `OTHER`。

---

## 三、关键验证：新 CSP 未阻断应用脚本

P1.4 刚落地了 **`Content-Security-Policy`**，其中 `index.html` 走严格策略 `script-src 'self'`（禁止内联）。本次审计专门验证了该策略**没有**把应用自身脚本挡掉：

```
scripts count      : 12          ← 12 个外部脚本全部加载（同源，'self' 放行）
app.js present     : true
tab class before   : {"cls":"tab","sel":null}
tab class after    : {"cls":"tab active","sel":null,"panelVisible":true}
tab state CHANGED  : true        ← 事件绑定生效，JS 正常执行
console err/warn   : NONE
```

**判定依据（分析判断）**：若 CSP 误伤，Chrome 会在 console 报 `Refused to execute inline script ... violates Content Security Policy`，且 tab 的 `active` class 不会变化（事件监听器未注册）。实测 class 由 `tab` 变为 `tab active`、面板 `display` 变为可见，证明 **JS 已正常执行、CSP 未阻断**。

截图证据：`/tmp/dcs-index.png` —— "文案改写" tab 处于选中态，Humanizer-zh / ai-copywriter / CopyGPT 三引擎 UI 完整渲染，无布局破损。

---

## 四、逐条处理记录

**无需处理项**：审计未发现任何 error / warning，故无逐条豁免或修复记录。

**对照豁免清单（历史上常见但本次未出现的信号）**：

| 信号 | 是否出现 | 说明 |
|---|---|---|
| favicon 404 | 未出现 | `catch_all` 兜底 404 会返回，但浏览器对 favicon 的请求未触发 console error（headless 下不请求） |
| CSP 违规 | 未出现 | 见第三节 |
| 混合内容 | 未出现 | 页面全部同源资源 |
| 弃用 API 警告 | 未出现 | — |
| 未捕获 Promise 异常 | 未出现 | — |

> **局限（需显式告知）**：headless Chromium **不请求 favicon**，也无法覆盖浏览器扩展、真实字体渲染等场景。若需覆盖 favicon，建议在 `<head>` 显式加 `<link rel="icon" href="data:,">` 以彻底消除该潜在信号（本次未加，因实测未触发）。

---

## 五、复现命令

```bash
# 1) 启动后端
PORT=8803 HOST=127.0.0.1 DATA_DIR=/tmp/dcs-browser-data \
  .venv/bin/python server/app.py &

# 2) 运行控制台审计
NODE_PATH=<node_modules> node /tmp/dcs-console-audit.js
# 期望输出：totalProblems: 0, errors: 0, warnings: 0

# 3) 验证 CSP 未阻断 JS
NODE_PATH=<node_modules> node /tmp/dcs-csp-check.js
# 期望：tab state CHANGED: true, console err/warn: NONE
```

---

## 六、与 P1.4 的联动确认

| 检查项 | 结果 |
|---|---|
| `index.html` 在 `script-src 'self'` 下 12 个脚本全部加载 | 通过 |
| tab 交互（事件绑定）正常 | 通过 |
| `/standalone.html` 在 `'unsafe-inline'` 放行下正常 | 通过 |
| 全程无 CSP 违规上报 | 通过 |

**结论：安全响应头中间件与前端功能完全兼容，无回归。**
