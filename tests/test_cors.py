"""CORS 测试：默认不信任 Origin: null，也不默认信任远端来源。"""

import pytest
from fastapi.testclient import TestClient

LOOPBACK = ("127.0.0.1", 50009)
GITHUB_PAGES = "https://womeng2018-dotcom.github.io"


def test_default_origins_exclude_null(app_module):
    assert "null" not in app_module.CORS_ORIGINS


def test_default_origins_are_loopback_only(app_module):
    for origin in app_module.CORS_ORIGINS:
        assert origin.startswith("http://127.0.0.1") or origin.startswith("http://localhost")


def test_preflight_from_null_gets_no_allow_origin(app_module):
    with TestClient(app_module.app, client=LOOPBACK) as client:
        response = client.options(
            "/api/history",
            headers={"Origin": "null", "Access-Control-Request-Method": "GET"},
        )
    assert "access-control-allow-origin" not in response.headers


def test_preflight_from_loopback_is_allowed(app_module):
    with TestClient(app_module.app, client=LOOPBACK) as client:
        response = client.options(
            "/api/history",
            headers={"Origin": "http://127.0.0.1:8765", "Access-Control-Request-Method": "GET"},
        )
    assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:8765"


def test_preflight_from_github_pages_denied_by_default(app_module):
    with TestClient(app_module.app, client=LOOPBACK) as client:
        response = client.options(
            "/api/history",
            headers={"Origin": GITHUB_PAGES, "Access-Control-Request-Method": "GET"},
        )
    assert response.headers.get("access-control-allow-origin") != GITHUB_PAGES


def test_github_pages_can_be_opted_in_with_keys(app_factory):
    module = app_factory({
        "CORS_ORIGINS": GITHUB_PAGES,
        "TENANT_KEYS": "shop-a:key-a",
        "HOST": "127.0.0.1",
    })
    with TestClient(module.app, client=("203.0.113.9", 50011)) as client:
        response = client.options(
            "/api/history",
            headers={"Origin": GITHUB_PAGES, "Access-Control-Request-Method": "GET"},
        )
    assert response.headers.get("access-control-allow-origin") == GITHUB_PAGES


def test_cors_allow_null_requires_keys_and_then_works(app_factory):
    """显式开启 CORS_ALLOW_NULL 时必须已配置密钥，否则启动守卫拦截。"""
    module = app_factory({"CORS_ALLOW_NULL": "true", "TENANT_KEYS": "shop-a:key-a"})
    assert "null" in module.CORS_ORIGINS
    with TestClient(module.app, client=("203.0.113.9", 50012)) as client:
        response = client.options(
            "/api/history",
            headers={"Origin": "null", "Access-Control-Request-Method": "GET"},
        )
    assert response.headers.get("access-control-allow-origin") == "null"


def test_cors_allow_null_without_keys_blocked_by_guard(app_factory):
    module = app_factory({"CORS_ALLOW_NULL": "true"})
    with pytest.raises(RuntimeError):
        module._startup_guard()


def test_health_reports_auth_state(app_module):
    with TestClient(app_module.app, client=LOOPBACK) as client:
        body = client.get("/api/health").json()
    assert body["ok"] is True
    assert body["status"] == "running"
    assert body["auth_enabled"] is False
    assert body["auth_required"] is False


def test_health_does_not_leak_key(app_module):
    with TestClient(app_module.app, client=LOOPBACK) as client:
        body = client.get("/api/health").text
    assert app_module.LLM_API_KEY not in body or app_module.LLM_API_KEY == ""
