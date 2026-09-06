"""鉴权与租户隔离测试。

覆盖：
  - 本机开放模式只在回环地址生效
  - Origin: null（file:// 页面）不再被默认信任
  - 配置了访问密钥后强制校验
  - 租户之间数据隔离，密钥原文不入库
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

LOOPBACK = ("127.0.0.1", 50001)
REMOTE = ("203.0.113.9", 50002)


def _client(module, addr=LOOPBACK):
    return TestClient(module.app, client=addr)


def test_local_open_mode_allows_loopback_without_key(app_module):
    with _client(app_module, LOOPBACK) as client:
        assert client.get("/api/history").status_code == 200


def test_local_open_mode_rejects_non_loopback(app_module):
    with _client(app_module, REMOTE) as client:
        assert client.get("/api/history").status_code == 401


def test_origin_null_is_not_trusted(app_module):
    """file:// 页面（Origin: null）不能调用本机后端。"""
    with _client(app_module, LOOPBACK) as client:
        response = client.get("/api/history", headers={"Origin": "null"})
        assert response.status_code == 401


def test_origin_null_rejected_even_on_write_endpoints(app_module):
    with _client(app_module, LOOPBACK) as client:
        response = client.post("/api/history", json={"kind": "rewrite", "payload": {"a": 1}},
                               headers={"Origin": "null"})
        assert response.status_code == 401


def test_local_open_mode_accepts_loopback_origin(app_module):
    with _client(app_module, LOOPBACK) as client:
        response = client.get("/api/history", headers={"Origin": "http://127.0.0.1:8765"})
        assert response.status_code == 200


def test_local_open_mode_rejects_foreign_origin(app_module):
    with _client(app_module, LOOPBACK) as client:
        response = client.get("/api/history", headers={"Origin": "https://evil.example.com"})
        assert response.status_code == 401


@pytest.fixture()
def authed_app(app_factory):
    return app_factory({"TENANT_KEYS": "shop-a:key-a,shop-b:key-b", "HOST": "127.0.0.1"})


def test_valid_key_allowed(authed_app):
    with _client(authed_app, REMOTE) as client:
        assert client.get("/api/history", headers={"X-API-Key": "key-a"}).status_code == 200


def test_invalid_key_rejected(authed_app):
    with _client(authed_app, REMOTE) as client:
        assert client.get("/api/history", headers={"X-API-Key": "wrong"}).status_code == 401


def test_missing_key_rejected(authed_app):
    with _client(authed_app, REMOTE) as client:
        assert client.get("/api/history").status_code == 401


def test_require_auth_forces_key_even_on_loopback(app_factory):
    module = app_factory({"TENANT_KEYS": "shop-a:key-a", "REQUIRE_AUTH": "true", "HOST": "127.0.0.1"})
    with _client(module, LOOPBACK) as client:
        assert client.get("/api/history").status_code == 401
        assert client.get("/api/history", headers={"X-API-Key": "key-a"}).status_code == 200


def test_tenant_isolation(app_factory):
    """租户 A 的记录不能被租户 B 看到或删除。"""
    module = app_factory({"TENANT_KEYS": "shop-a:key-a,shop-b:key-b"})
    with _client(module, REMOTE) as client:
        created = client.post(
            "/api/history",
            json={"kind": "rewrite", "title": "A 的文案", "payload": {"text": "shop-a-secret-copy"}},
            headers={"X-API-Key": "key-a"},
        )
        assert created.status_code == 200
        record_id = created.json()["record"]["id"]

        list_a = client.get("/api/history", headers={"X-API-Key": "key-a"}).json()
        list_b = client.get("/api/history", headers={"X-API-Key": "key-b"}).json()

        assert len(list_a["records"]) == 1
        assert list_b["records"] == []

        # B 尝试删 A 的记录：影响行数为 0
        deleted = client.delete(f"/api/history/{record_id}", headers={"X-API-Key": "key-b"})
        assert deleted.json()["deleted"] == 0

        # A 仍能看到
        assert len(client.get("/api/history", headers={"X-API-Key": "key-a"}).json()["records"]) == 1


def test_api_keys_are_not_stored_in_database(app_factory):
    """数据库里不能出现访问密钥原文。"""
    module = app_factory({"API_KEYS": "secret-key-xyz"})
    with _client(module, REMOTE) as client:
        client.post("/api/history", json={"kind": "rewrite", "title": "t", "payload": {"x": 1}},
                   headers={"X-API-Key": "secret-key-xyz"})

    data_dir = Path(str(module.DB_PATH).replace(module.DB_PATH.name, ""))
    hits = [
        path.name
        for path in data_dir.rglob("*")
        if path.is_file() and b"secret-key-xyz" in path.read_bytes()
    ]
    assert hits == [], f"访问密钥原文出现在数据文件: {hits}"


def test_tenant_name_is_hashed_for_plain_api_keys(app_factory):
    """无租户名时使用不可逆哈希，不把密钥写入租户标识。"""
    module = app_factory({"API_KEYS": "secret-key-xyz"})
    tenant = module._tenant_for_key("secret-key-xyz")
    assert tenant is not None
    assert "secret-key-xyz" not in tenant
    assert tenant.startswith("tenant-")
