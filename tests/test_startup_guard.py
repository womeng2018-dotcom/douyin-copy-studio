"""fail closed 启动守卫测试。

规则：任何"对外暴露"的组合，在没有访问密钥时都必须拒绝启动，
而不是降级成免鉴权运行。
"""

import pytest

from conftest import reload_app


def _guard_raises(env, host=None):
    module = reload_app(env)
    with pytest.raises(RuntimeError) as excinfo:
        module._startup_guard(host)
    return str(excinfo.value)


def _guard_passes(env, host=None):
    module = reload_app(env)
    module._startup_guard(host)  # 不抛异常即通过


def test_require_auth_without_keys_refuses_to_start():
    message = _guard_raises({"REQUIRE_AUTH": "true"})
    assert "REQUIRE_AUTH" in message


def test_require_auth_with_keys_starts():
    _guard_passes({"REQUIRE_AUTH": "true", "TENANT_KEYS": "shop-a:key-a"})


def test_non_loopback_host_without_keys_refuses_to_start():
    message = _guard_raises({"HOST": "0.0.0.0"})
    assert "非回环" in message


def test_non_loopback_host_with_keys_starts():
    _guard_passes({"HOST": "0.0.0.0", "TENANT_KEYS": "shop-a:key-a"})


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "0:0:0:0:0:0:0:0", "192.168.1.10", "example.com", ""])
def test_non_loopback_variants_all_refuse_without_keys(host):
    _guard_raises({"HOST": host})


@pytest.mark.parametrize("host", ["127.0.0.1", "::1", "localhost", "127.0.0.2"])
def test_loopback_hosts_start_in_local_open_mode(host):
    _guard_passes({"HOST": host})


def test_remote_cors_origin_requires_keys():
    message = _guard_raises({"CORS_ORIGINS": "https://womeng2018-dotcom.github.io"})
    assert "CORS" in message


def test_remote_cors_origin_with_keys_starts():
    _guard_passes({"CORS_ORIGINS": "https://womeng2018-dotcom.github.io", "TENANT_KEYS": "shop-a:key-a"})


def test_cors_allow_null_requires_keys():
    """Origin: null 只有在配了访问密钥时才允许开启。"""
    _guard_raises({"CORS_ALLOW_NULL": "true"})


def test_cors_allow_null_with_keys_starts():
    _guard_passes({"CORS_ALLOW_NULL": "true", "TENANT_KEYS": "shop-a:key-a"})


def test_lifespan_enforces_guard_when_run_by_uvicorn():
    """uvicorn app:app 走 lifespan，也必须 fail closed。"""
    from fastapi.testclient import TestClient

    module = reload_app({"REQUIRE_AUTH": "true"})
    with pytest.raises(Exception) as excinfo:
        with TestClient(module.app):
            pass
    assert "REQUIRE_AUTH" in str(excinfo.value) or "拒绝启动" in str(excinfo.value)


def test_lifespan_allows_local_open_mode():
    from fastapi.testclient import TestClient

    module = reload_app()
    with TestClient(module.app, client=("127.0.0.1", 50010)) as client:
        assert client.get("/api/health").status_code == 200
