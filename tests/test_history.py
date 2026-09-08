"""历史记录 CRUD、参数校验与体积上限测试。"""

import pytest
from fastapi.testclient import TestClient

LOOPBACK = ("127.0.0.1", 50003)


@pytest.fixture()
def client(app_module):
    with TestClient(app_module.app, client=LOOPBACK) as c:
        yield c


def test_create_and_list(client):
    created = client.post("/api/history", json={
        "kind": "rewrite", "title": "测试文案", "payload": {"text": "body"},
    })
    assert created.status_code == 200
    assert created.json()["record"]["kind"] == "rewrite"

    listed = client.get("/api/history").json()
    assert listed["ok"] is True
    assert len(listed["records"]) == 1
    assert listed["records"][0]["payload"] == {"text": "body"}


def test_list_filter_by_kind(client):
    client.post("/api/history", json={"kind": "rewrite", "title": "r", "payload": {"a": 1}})
    client.post("/api/history", json={"kind": "plan", "title": "p", "payload": {"a": 2}})

    assert len(client.get("/api/history?kind=rewrite").json()["records"]) == 1
    assert len(client.get("/api/history?kind=plan").json()["records"]) == 1
    assert len(client.get("/api/history").json()["records"]) == 2


def test_invalid_kind_rejected(client):
    assert client.post("/api/history", json={"kind": "evil", "payload": {}}).status_code == 400
    assert client.get("/api/history?kind=evil").status_code == 400


def test_missing_payload_rejected(client):
    assert client.post("/api/history", json={"kind": "rewrite"}).status_code == 400


def test_delete_single_record(client):
    created = client.post("/api/history", json={"kind": "plan", "title": "p", "payload": {}})
    record_id = created.json()["record"]["id"]

    deleted = client.delete(f"/api/history/{record_id}").json()
    assert deleted["deleted"] == 1
    assert client.get("/api/history").json()["records"] == []


def test_delete_by_kind_and_clear_all(client):
    client.post("/api/history", json={"kind": "rewrite", "title": "r", "payload": {}})
    client.post("/api/history", json={"kind": "plan", "title": "p", "payload": {}})

    assert client.delete("/api/history?kind=rewrite").json()["deleted"] == 1
    assert len(client.get("/api/history").json()["records"]) == 1

    assert client.delete("/api/history").json()["deleted"] == 1
    assert client.get("/api/history").json()["records"] == []


def test_limit_is_clamped(client):
    for index in range(3):
        client.post("/api/history", json={"kind": "rewrite", "title": f"t{index}", "payload": {}})
    assert len(client.get("/api/history?limit=2").json()["records"]) == 2
    # 越界的 limit 回落到合理区间，不应报错或返回全部
    assert len(client.get("/api/history?limit=100000").json()["records"]) == 3
    assert len(client.get("/api/history?limit=0").json()["records"]) >= 1


def test_oversized_payload_returns_413(app_factory):
    module = app_factory({"DB_MAX_PAYLOAD_BYTES": "1024"})
    with TestClient(module.app, client=LOOPBACK) as client:
        response = client.post("/api/history", json={
            "kind": "rewrite", "title": "big", "payload": {"text": "x" * 5000},
        })
        assert response.status_code == 413


def test_malformed_json_returns_400(client):
    response = client.post(
        "/api/history",
        content=b"{not json",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 400


def test_collector_accepts_blobs(app_factory):
    module = app_factory()
    with TestClient(module.app, client=LOOPBACK) as client:
        response = client.post("/api/collector", json={
            "pageUrl": "https://example.com/page",
            "blobs": [{"text": "门店数据"}],
        })
        assert response.status_code == 200

        listed = client.get("/api/collector").json()
        assert listed["ok"] is True
        assert listed["latest"]["blobs"][0]["text"] == "门店数据"


def test_collector_rejects_empty(app_factory):
    module = app_factory()
    with TestClient(module.app, client=LOOPBACK) as client:
        assert client.post("/api/collector", json={"nothing": True}).status_code == 400


def test_duplicate_save_is_idempotent(client):
    """C3 防重复入库：相同租户/类型/内容再次保存应命中已有记录，库内仍只有一条。"""
    body = {"kind": "rewrite", "title": "dup", "payload": {"text": "same"}}
    first = client.post("/api/history", json=body)
    second = client.post("/api/history", json=body)
    assert first.json()["record"]["duplicate"] is False
    assert second.json()["record"]["duplicate"] is True
    assert second.json()["record"]["id"] == first.json()["record"]["id"]
    assert len(client.get("/api/history").json()["records"]) == 1


def test_different_payload_not_deduped(client):
    client.post("/api/history", json={"kind": "rewrite", "title": "a", "payload": {"x": 1}})
    client.post("/api/history", json={"kind": "rewrite", "title": "a", "payload": {"x": 2}})
    assert len(client.get("/api/history").json()["records"]) == 2
