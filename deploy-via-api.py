#!/usr/bin/env python3
"""通过 GitHub git data API 推送改动到 main 分支（github.com git 传输不稳定时的备用通道）
用法: python3 deploy-via-api.py
前提: macOS keychain 中已保存 womeng2018-dotcom 的 GitHub 凭据（git credential fill 可取出）
"""
import base64, json, subprocess, sys, urllib.request

REPO = "womeng2018-dotcom/douyin-copy-studio"
BRANCH = "main"
API = "https://api.github.com"

def get_token():
    # 从 keychain 取 token
    p = subprocess.run(["git", "credential", "fill"], input=b"protocol=https\nhost=github.com\n\n",
                       capture_output=True)
    for line in p.stdout.decode().splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1]
    raise SystemExit("无法从 keychain 获取 GitHub 凭据")

TOKEN = get_token()

def api(method, path, payload=None, expect=200):
    url = API + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data: req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read()
            return r.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        print(f"  [HTTP {e.code}] {method} {path}: {e.read().decode()[:300]}")
        raise SystemExit(1)

CHANGED = ["index.html", "css/app.css", "js/app.js", "js/data-compliance.js",
           "js/extract-tab.js", "build-single.js", "standalone.html", "README.md"]
NEW_FILES = ["deploy-via-api.py"]  # 远程不存在的新文件

# 1. 当前 main 引用与完整 tree
_, ref = api("GET", f"/repos/{REPO}/git/ref/heads/{BRANCH}")
parent = ref["object"]["sha"]
print(f"当前 main: {parent}")

_, tree = api("GET", f"/repos/{REPO}/git/trees/{parent}?recursive=1")
entries = tree["tree"]
print(f"远程 tree 条目数: {len(entries)}")

# 2. 为改动的文件创建 blob
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
blob_sha = {}
for f in CHANGED + NEW_FILES:
    path = os.path.join(ROOT, f)
    content = open(path, "rb").read()
    _, b = api("POST", f"/repos/{REPO}/git/blobs",
               {"content": base64.b64encode(content).decode(), "encoding": "base64"})
    blob_sha[f] = b["sha"]
    print(f"blob {f}: {b['sha'][:10]} ({len(content)} bytes)")

# 3. 重建 tree：替换改动的条目 + 追加新文件
new_entries = []
for e in entries:
    if e["type"] == "blob" and e["path"] in blob_sha:
        e = dict(e); e["sha"] = blob_sha[e["path"]]
    new_entries.append(e)
for f in NEW_FILES:
    new_entries.append({"path": f, "mode": "100644", "type": "blob", "sha": blob_sha[f]})

_, new_tree = api("POST", f"/repos/{REPO}/git/trees",
                  {"base_tree": parent, "tree": [
                      {"path": e["path"], "mode": e.get("mode", "100644"),
                       "type": e["type"], "sha": e["sha"]}
                      for e in new_entries if e["type"] == "blob" or e["type"] == "tree"
                  ]})
print(f"新 tree: {new_tree['sha'][:10]}")

# 4. 创建 commit
MSG = ("fix: 修复多项功能问题并优化视频提取部署引导\n\n"
       "- 修复提取 Tab showToast 未定义导致的点击报错\n"
       "- 修复 CSS 花括号错位导致桌面端文案生成单列、移动端页签溢出\n"
       "- 修复方言口播风格 chip 显示 undefined\n"
       "- 新增 --text-3/--border CSS 变量，修复数据分析板块样式\n"
       "- 修复 favicon 404\n"
       "- 视频提取 Tab：新增本地/Render 云端部署三步引导、连接测试、更清晰错误提示\n"
       "- 红线词库补充 SPA 高频翻车词（疏通经络/改善睡眠/补肾/壮阳等）及替换词\n"
       "- 同步更新 standalone.html 单文件版与 README")
_, commit = api("POST", f"/repos/{REPO}/git/commits",
                {"message": MSG, "tree": new_tree["sha"], "parents": [parent]})
print(f"新 commit: {commit['sha']}")

# 5. 更新 ref（fast-forward）
_, upd = api("PATCH", f"/repos/{REPO}/git/refs/heads/{BRANCH}",
             {"sha": commit["sha"], "force": False})
print(f"✅ 已推送 main → {commit['sha']}")
