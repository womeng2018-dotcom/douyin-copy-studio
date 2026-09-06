"""远程 URL / SSRF 边界测试。

诚实边界：本服务只校验调用方提交的初始 URL。yt-dlp 后续的重定向与媒体子请求
由 yt-dlp 自行发起，无法逐跳校验，因此远程 URL 在云端默认关闭、仅本机开放模式可用。
本文件锁死"初始 URL 校验"与"云端默认关闭"两件事。
"""

import socket

import pytest
from fastapi.testclient import TestClient

LOOPBACK = ("127.0.0.1", 50007)
REMOTE = ("203.0.113.9", 50008)

BLOCKED_URLS = [
    "http://127.0.0.1/x.mp4",
    "http://127.0.0.1:8765/x.mp4",
    "http://localhost/x.mp4",
    "http://10.0.0.5/a.mp4",
    "http://172.16.0.1/a.mp4",
    "http://192.168.1.1/a.mp4",
    "http://169.254.169.254/latest/meta-data",          # AWS/GCP 元数据
    "http://100.100.100.200/latest/meta-data",          # 阿里云元数据
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://metadata.azure.com/metadata/instance",
    "http://[::1]/a.mp4",
    "http://[fd00::1]/a.mp4",
    "http://[fe80::1]/a.mp4",
    "http://foo.local/a.mp4",
    "http://foo.localhost/a.mp4",
    "http://foo.internal/a.mp4",
    "https://user:pass@example.com/a.mp4",              # 凭据内嵌
    "ftp://example.com/a.mp4",
    "file:///etc/passwd",
    "http://example.com:22/a.mp4",                      # 非 HTTP 端口
    "http://example.com:6379/a.mp4",
    "",
    "not-a-url",
    "http://",
]


@pytest.fixture()
def client(app_module):
    with TestClient(app_module.app, client=LOOPBACK) as c:
        yield c


@pytest.mark.parametrize("url", BLOCKED_URLS)
def test_validate_public_media_url_blocks(app_module, url):
    assert app_module._validate_public_media_url(url) is False


def test_validate_rejects_oversized_url(app_module):
    assert app_module._validate_public_media_url("https://example.com/" + "a" * 5000) is False


def test_validate_rejects_non_string(app_module):
    for value in (None, 123, {}, [], True):
        assert app_module._validate_public_media_url(value) is False


def _patch_dns(monkeypatch, addresses):
    """伪造 DNS 解析结果，避免测试真的发起网络请求。"""
    def fake_getaddrinfo(host, port, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (addr, port)) for addr in addresses]
    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


def test_dns_returning_loopback_is_blocked(app_module, monkeypatch):
    """域名解析到 127.0.0.1 → 拦截（防 DNS 指向内网）。"""
    _patch_dns(monkeypatch, ["127.0.0.1"])
    assert app_module._validate_public_media_url("https://cdn.example.com/a.mp4") is False


def test_dns_returning_private_is_blocked(app_module, monkeypatch):
    _patch_dns(monkeypatch, ["10.1.2.3"])
    assert app_module._validate_public_media_url("https://cdn.example.com/a.mp4") is False


def test_dns_returning_cgnat_is_blocked(app_module, monkeypatch):
    """100.64.0.0/10 运营商级 NAT 段也必须拦截。"""
    _patch_dns(monkeypatch, ["100.64.0.1"])
    assert app_module._validate_public_media_url("https://cdn.example.com/a.mp4") is False


def test_mixed_public_and_private_answers_blocked(app_module, monkeypatch):
    """任何一个解析结果落在内网，整体拒绝（不能挑一个公网地址放行）。"""
    _patch_dns(monkeypatch, ["93.184.216.34", "192.168.0.10"])
    assert app_module._validate_public_media_url("https://cdn.example.com/a.mp4") is False


def test_dns_failure_is_blocked(app_module, monkeypatch):
    def boom(*_args, **_kwargs):
        raise socket.gaierror("dns failure")
    monkeypatch.setattr(socket, "getaddrinfo", boom)
    assert app_module._validate_public_media_url("https://cdn.example.com/a.mp4") is False


def test_public_address_is_allowed(app_module, monkeypatch):
    _patch_dns(monkeypatch, ["93.184.216.34"])
    assert app_module._validate_public_media_url("https://cdn.example.com/a.mp4") is True


def test_host_allowlist_restricts_domains(app_factory, monkeypatch):
    module = app_factory({"MEDIA_HOST_ALLOWLIST": "douyin.com"})
    _patch_dns(monkeypatch, ["93.184.216.34"])
    assert module._validate_public_media_url("https://www.douyin.com/v.mp4") is True
    assert module._validate_public_media_url("https://evil.example.com/v.mp4") is False


def test_extract_rejects_blocked_url_via_api(client):
    response = client.post("/api/extract", json={"url": "http://169.254.169.254/latest/meta-data"})
    assert response.status_code == 400


def test_extract_rejects_when_both_url_and_file(client):
    response = client.post("/api/extract", json={
        "url": "https://cdn.example.com/a.mp4", "file_path": "base64:AAAA",
    })
    assert response.status_code == 400


def test_extract_rejects_local_server_path(client):
    """不允许通过 HTTP 接口让服务器读取自己的本地文件。"""
    response = client.post("/api/extract", json={"file_path": "/etc/passwd"})
    assert response.status_code == 400


def test_extract_rejects_unknown_extension(client):
    response = client.post("/api/extract", json={"file_path": "base64:AAAA.ext:exe"})
    assert response.status_code == 400


def test_extract_rejects_bad_engine(client):
    response = client.post("/api/extract", json={"file_path": "base64:AAAA", "engine": "evil"})
    assert response.status_code == 400


def test_extract_rejects_bad_skip_llm(client):
    response = client.post("/api/extract", json={"file_path": "base64:AAAA", "skip_llm": "yes"})
    assert response.status_code == 400


def test_extract_requires_url_or_file(client):
    assert client.post("/api/extract", json={}).status_code == 400


def test_extract_requires_auth_when_keys_configured(app_factory):
    module = app_factory({"TENANT_KEYS": "shop-a:key-a"})
    with TestClient(module.app, client=REMOTE) as client:
        assert client.post("/api/extract", json={"url": "https://cdn.example.com/a.mp4"}).status_code == 401


# ------------------------------------------------------------------
# 远程 URL 开关：云端 / 要求鉴权时默认关闭
# ------------------------------------------------------------------
def test_remote_url_allowed_in_local_open_mode(app_module):
    assert app_module._local_open_mode() is True
    assert app_module._remote_url_allowed() is True


def test_remote_url_disabled_when_auth_required(app_factory):
    module = app_factory({"TENANT_KEYS": "shop-a:key-a", "REQUIRE_AUTH": "true", "HOST": "127.0.0.1"})
    assert module._remote_url_allowed() is False


def test_remote_url_disabled_on_non_loopback(app_factory):
    module = app_factory({"TENANT_KEYS": "shop-a:key-a", "HOST": "0.0.0.0"})
    assert module._remote_url_allowed() is False


def test_remote_url_force_disabled(app_factory):
    module = app_factory({"ALLOW_REMOTE_URL": "false"})
    assert module._remote_url_allowed() is False


def test_remote_url_force_enabled(app_factory):
    module = app_factory({"ALLOW_REMOTE_URL": "true"})
    assert module._remote_url_allowed() is True


def test_disabled_remote_url_returns_403(app_factory, monkeypatch):
    """云端配置下远程 URL 提取必须被拒，而不是悄悄放行。"""
    module = app_factory({"ALLOW_REMOTE_URL": "false"})
    _patch_dns(monkeypatch, ["93.184.216.34"])
    with TestClient(module.app, client=LOOPBACK) as client:
        response = client.post("/api/extract", json={"url": "https://cdn.example.com/a.mp4"})

    assert response.status_code == 403
    assert response.json()["error_code"] == "E_REMOTE_URL_DISABLED"


def test_extract_status_endpoint_reports_capability(app_module):
    with TestClient(app_module.app, client=LOOPBACK) as client:
        body = client.get("/api/extract").json()
    assert body["ok"] is True
    assert body["status"] == "running"
    assert "ffmpeg_ok" in body
