"""P0 回归：静态托管必须只公开白名单资源。

历史漏洞：server/app.py 曾把仓库根目录整体挂成 StaticFiles(directory=WWW_ROOT)，
导致 GET /server/.env、/server/app.py、/.git/config 全部返回 200。
本文件锁死"这些路径永远不能被服务出来"。
"""

import pytest
from fastapi.testclient import TestClient

# 必须公开的页面与资源
PUBLIC_PATHS = [
    "/",
    "/index.html",
    "/standalone.html",
    "/css/app.css",
    "/js/app.js",
    "/js/guard.js",
    "/js/engine.js",
    "/js/data-analysis.js",
    "/js/plan-generator.js",
    "/js/rewrite-tab.js",
    "/js/extract-tab.js",
]

# 一律不可访问：密钥、源码、仓库元数据、部署配置、数据库、脚本、文档
FORBIDDEN_PATHS = [
    "/server/.env",
    "/server/app.py",
    "/server/video-extract.py",
    "/server/requirements.txt",
    "/server/Dockerfile",
    "/server/README.md",
    "/server/.dockerignore",
    "/.env",
    "/.git/config",
    "/.git/HEAD",
    "/.gitignore",
    "/README.md",
    "/SAMPLES.md",
    "/docker-compose.yml",
    "/render.yaml",
    "/render-service-payload.json",
    "/start-local.sh",
    "/deploy-render.sh",
    "/deploy-via-api.py",
    "/upload-via-api.sh",
    "/build-single.js",
    "/export-samples.js",
    "/test-engine.js",
    "/stress-test.js",
    "/docs/growth-os.md",
    "/docs/material-models.md",
    "/docs/refund-prevention.md",
    "/Brief速查-规则数据融合版.md",
    "/userscript/douyin-laike-collector.user.js",
    "/server/.data/copy-studio.sqlite3",
    "/server/.data/copy-studio.sqlite3-wal",
    "/.venv/pyvenv.cfg",
]

# 目录穿越 / 编码穿越尝试
TRAVERSAL_PATHS = [
    "/css/../server/.env",
    "/js/../server/app.py",
    "/css/..%2fserver%2f.env",
    "/css/%2e%2e%2f%2eenv",
    "/js/../../server/.env",
    "/css/./../server/.env",
    "/server/",
    "/server",
    "/.git/",
]

# 这些字符串一旦出现在响应里，说明发生了泄漏
LEAK_MARKERS = ["LLM_API_KEY", "nvapi-", "sk-", "[core]", "PRAGMA", "sqlite"]


def _is_served(response) -> bool:
    """200 视为被服务出来；3xx 也不视为泄漏，但这里统一按非 200 处理。"""
    return response.status_code == 200


@pytest.fixture()
def client(app_module):
    with TestClient(app_module.app, client=("127.0.0.1", 50000)) as c:
        yield c


def test_public_resources_are_served(client):
    for path in PUBLIC_PATHS:
        response = client.get(path, follow_redirects=False)
        assert response.status_code == 200, f"公开资源不可访问: {path} -> {response.status_code}"


def test_index_html_is_real_page(client):
    body = client.get("/").text
    assert "<!DOCTYPE html>" in body or "<html" in body
    assert "Copy Studio" in body or "文案" in body or "投流" in body


@pytest.mark.parametrize("path", FORBIDDEN_PATHS)
def test_forbidden_paths_never_served(client, path):
    response = client.get(path, follow_redirects=False)
    assert not _is_served(response), f"敏感/内部路径被服务出来: {path} -> {response.status_code}"


@pytest.mark.parametrize("path", TRAVERSAL_PATHS)
def test_traversal_paths_never_served(client, path):
    response = client.get(path, follow_redirects=False)
    assert not _is_served(response), f"目录穿越成功: {path} -> {response.status_code}"


@pytest.mark.parametrize("path", FORBIDDEN_PATHS + TRAVERSAL_PATHS)
def test_no_leak_markers_in_body(client, path):
    response = client.get(path, follow_redirects=False)
    body = response.text or ""
    for marker in LEAK_MARKERS:
        assert marker not in body, f"响应体出现泄漏标记 {marker!r}: {path}"


def test_unknown_path_is_json_404(client):
    response = client.get("/definitely/not/here", follow_redirects=False)
    assert response.status_code == 404


def test_non_get_verbs_do_not_list_files(client):
    for method in ("post", "put", "delete", "patch"):
        response = getattr(client, method)("/server/", follow_redirects=False)
        assert response.status_code == 404, f"{method.upper()} /server/ -> {response.status_code}"


def test_static_mount_is_not_directory_listing(client):
    """css/ 与 js/ 只服务目录内文件，不允许列出或跳出。"""
    response = client.get("/css/", follow_redirects=False)
    assert response.status_code != 200 or "<html" not in response.text.lower()
    response = client.get("/js/../server/.env", follow_redirects=False)
    assert response.status_code != 200
