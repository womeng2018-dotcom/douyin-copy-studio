"""LLM 代理测试：客户端不可覆盖上游配置、错误脱敏、流式 SSE、限流。

所有上游请求都被 MockTransport 拦截，绝不调用真实大模型。
"""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from conftest import mock_upstream

LOOPBACK = ("127.0.0.1", 50004)


def _sse(chunks):
    body = "".join(f"data: {json.dumps(c, ensure_ascii=False)}\n\n" for c in chunks)
    return body + "data: [DONE]\n\n"


@pytest.fixture()
def client(app_module):
    with TestClient(app_module.app, client=LOOPBACK) as c:
        yield c


# ------------------------------------------------------------------
# 客户端不能覆盖上游地址 / 模型 / 密钥
# ------------------------------------------------------------------
def test_client_cannot_override_model(app_module, monkeypatch):
    captured = {}

    async def handler(request):
        captured["payload"] = json.loads(request.content)
        captured["auth"] = request.headers.get("authorization")
        captured["url"] = str(request.url)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(app_module.httpx, "AsyncClient", mock_upstream(handler))

    with TestClient(app_module.app, client=LOOPBACK) as client:
        response = client.post("/api/llm/chat", json={
            "user": "写一句文案",
            "model": "attacker-chosen-model",
            "stream": False,
        })
    assert response.status_code == 200
    assert captured["payload"]["model"] == app_module.LLM_MODEL
    assert captured["payload"]["model"] != "attacker-chosen-model"


def test_upstream_url_is_server_configured(app_module, monkeypatch):
    captured = {}

    async def handler(request):
        captured["url"] = str(request.url)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(app_module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(app_module.app, client=LOOPBACK) as client:
        client.post("/api/llm/chat", json={"user": "hi", "stream": False})

    assert captured["url"] == app_module.LLM_API_BASE + "/chat/completions"


def test_authorization_header_uses_server_key_only(app_module, monkeypatch):
    """客户端传入的任何 key 字段都不能改变 Authorization 头。"""
    captured = {}

    async def handler(request):
        captured["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(app_module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(app_module.app, client=LOOPBACK) as client:
        client.post("/api/llm/chat", json={
            "user": "hi", "stream": False,
            "api_key": "attacker-key", "api_base": "https://evil.example/v1",
        })

    assert captured["auth"] == "Bearer " + app_module.LLM_API_KEY
    assert "attacker-key" not in captured["auth"]


def test_sampling_params_are_clamped(app_module, monkeypatch):
    captured = {}

    async def handler(request):
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(app_module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(app_module.app, client=LOOPBACK) as client:
        client.post("/api/llm/chat", json={
            "user": "hi", "stream": False,
            "temperature": 99, "top_p": -5, "max_tokens": 999999,
        })

    payload = captured["payload"]
    assert 0 <= payload["temperature"] <= 1.5
    assert 0 <= payload["top_p"] <= 1
    assert 1 <= payload["max_tokens"] <= 4096


def test_nemotron_disables_thinking(app_factory, monkeypatch):
    """Nemotron 必须带 chat_template_kwargs={'thinking': False}。"""
    module = app_factory({"LLM_MODEL": "nvidia/nemotron-test"})
    captured = {}

    async def handler(request):
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(module.app, client=LOOPBACK) as client:
        client.post("/api/llm/chat", json={"user": "hi", "stream": False})

    assert captured["payload"].get("chat_template_kwargs") == {"thinking": False}


def test_non_nemotron_has_no_thinking_kwarg(app_module, monkeypatch):
    captured = {}

    async def handler(request):
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(app_module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(app_module.app, client=LOOPBACK) as client:
        client.post("/api/llm/chat", json={"user": "hi", "stream": False})

    assert "chat_template_kwargs" not in captured["payload"]


# ------------------------------------------------------------------
# 错误脱敏：上游原始正文绝不回传浏览器
# ------------------------------------------------------------------
def test_upstream_error_body_is_not_returned(app_module, monkeypatch):
    secret_body = '{"error":"invalid api key CANARY-UPSTREAM-SECRET-7f3a91 for model deepseek"}'

    async def handler(request):
        return httpx.Response(500, text=secret_body)

    monkeypatch.setattr(app_module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(app_module.app, client=LOOPBACK) as client:
        response = client.post("/api/llm/chat", json={"user": "hi", "stream": False})

    assert response.status_code == 502
    body = response.text
    assert "CANARY-UPSTREAM-SECRET-7f3a91" not in body
    assert "invalid api key" not in body
    assert response.json()["error_code"] == "E_UPSTREAM"
    assert response.json()["error"] == app_module.UPSTREAM_ERROR_MESSAGE


def test_upstream_error_not_returned_on_vision(app_module, monkeypatch):
    async def handler(request):
        return httpx.Response(403, text="forbidden: key CANARY-VISION-SECRET-2b8c04")

    monkeypatch.setattr(app_module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(app_module.app, client=LOOPBACK) as client:
        response = client.post("/api/llm/vision", json={"user": "看图"})

    assert response.status_code == 502
    assert "CANARY-VISION-SECRET-2b8c04" not in response.text
    assert response.json()["error_code"] == "E_UPSTREAM"


def test_upstream_error_not_returned_on_stream(app_module, monkeypatch):
    async def handler(request):
        return httpx.Response(500, text="upstream blew up CANARY-STREAM-SECRET-5d1e77")

    monkeypatch.setattr(app_module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(app_module.app, client=LOOPBACK) as client:
        response = client.post("/api/llm/chat", json={"user": "hi", "stream": True})

    assert "CANARY-STREAM-SECRET-5d1e77" not in response.text
    assert "E_UPSTREAM" in response.text
    assert response.text.rstrip().endswith("data: [DONE]")


def test_stream_transport_failure_is_sanitized(app_module, monkeypatch):
    async def handler(request):
        raise httpx.ConnectError("connection refused to https://integrate.api.nvidia.com")

    monkeypatch.setattr(app_module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(app_module.app, client=LOOPBACK) as client:
        response = client.post("/api/llm/chat", json={"user": "hi", "stream": True})

    assert "connection refused" not in response.text
    assert "E_UPSTREAM" in response.text


def test_non_stream_transport_failure_is_sanitized(app_module, monkeypatch):
    async def handler(request):
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(app_module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(app_module.app, client=LOOPBACK) as client:
        response = client.post("/api/llm/chat", json={"user": "hi", "stream": False})

    assert response.status_code == 502
    assert "boom" not in response.text
    assert response.json()["error_code"] == "E_UPSTREAM"


# ------------------------------------------------------------------
# 流式 SSE 正常路径
# ------------------------------------------------------------------
def test_stream_passthrough(app_module, monkeypatch):
    async def handler(request):
        # 必须是异步可迭代对象，否则 httpx 会构造同步流，AsyncClient 会拒绝
        async def body():
            yield b'data: {"choices":[{"delta":{"content":"\xe4\xbd\xa0"}}]}\n\n'
            yield b'data: {"choices":[{"delta":{"content":"\xe5\xa5\xbd"}}]}\n\n'
            yield b"data: [DONE]\n\n"

        return httpx.Response(
            200,
            content=body(),
            headers={"content-type": "text/event-stream"},
        )

    monkeypatch.setattr(app_module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(app_module.app, client=LOOPBACK) as client:
        response = client.post("/api/llm/chat", json={"user": "hi", "stream": True})

    assert response.status_code == 200
    # SSE 分片是逐块透传的，两个字分别位于不同的 data 事件里
    assert '"content":"你"' in response.text
    assert '"content":"好"' in response.text
    assert response.text.count("data:") == 3
    assert response.text.rstrip().endswith("data: [DONE]")


def test_non_stream_returns_content(app_module, monkeypatch):
    async def handler(request):
        return httpx.Response(200, json={"choices": [{"message": {"content": "生成结果"}}]})

    monkeypatch.setattr(app_module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(app_module.app, client=LOOPBACK) as client:
        response = client.post("/api/llm/chat", json={"user": "hi", "stream": False})

    assert response.json() == {"ok": True, "content": "生成结果"}


# ------------------------------------------------------------------
# 鉴权 / 配置 / 参数校验 / 限流
# ------------------------------------------------------------------
def test_llm_requires_auth_when_keys_configured(app_factory):
    module = app_factory({"TENANT_KEYS": "shop-a:key-a"})
    with TestClient(module.app, client=("203.0.113.9", 50005)) as client:
        assert client.post("/api/llm/chat", json={"user": "hi"}).status_code == 401
        assert client.post("/api/llm/vision", json={"user": "hi"}).status_code == 401


def test_llm_returns_503_when_upstream_not_configured(app_factory):
    module = app_factory({"LLM_API_KEY": ""})
    with TestClient(module.app, client=LOOPBACK) as client:
        assert client.post("/api/llm/chat", json={"user": "hi"}).status_code == 503
        assert client.post("/api/llm/vision", json={"user": "hi"}).status_code == 503


# ------------------------------------------------------------------
# 厂商不匹配拦截：密钥前缀暗示的厂商与上游 Base 主机暗示的厂商不一致时，
# 必须 503 拦截，且绝不向任何上游发起请求（避免拿 A 厂密钥打 B 厂端点）。
# ------------------------------------------------------------------
def test_provider_mismatch_blocks_chat_without_upstream_call(app_factory, monkeypatch):
    module = app_factory({
        "LLM_API_KEY": "nvapi-FAKEtestonlyNOTreal",
        "LLM_API_BASE": "https://token.sensenova.cn/v1",
    })
    called = {"n": 0}

    async def handler(request):
        called["n"] += 1
        return httpx.Response(200, json={"choices": [{"message": {"content": "leak"}}]})

    monkeypatch.setattr(module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(module.app, client=LOOPBACK) as client:
        response = client.post("/api/llm/chat", json={"user": "hi", "stream": False})

    assert response.status_code == 503
    assert response.json()["error_code"] == "E_LLM_PROVIDER_MISMATCH"
    assert response.json().get("key_provider") == "nvidia"
    assert response.json().get("base_provider") == "sensenova"
    assert called["n"] == 0  # 拦截在发起上游调用之前


def test_provider_mismatch_blocks_vision_without_upstream_call(app_factory, monkeypatch):
    module = app_factory({
        "LLM_API_KEY": "nvapi-FAKEtestonlyNOTreal",
        "LLM_API_BASE": "https://token.sensenova.cn/v1",
    })
    called = {"n": 0}

    async def handler(request):
        called["n"] += 1
        return httpx.Response(200, json={"choices": [{"message": {"content": "leak"}}]})

    monkeypatch.setattr(module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(module.app, client=LOOPBACK) as client:
        response = client.post("/api/llm/vision", json={
            "messages": [{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": "https://cdn.example.com/a.png"}},
            ]}],
        })

    assert response.status_code == 503
    assert response.json()["error_code"] == "E_LLM_PROVIDER_MISMATCH"
    assert called["n"] == 0


def test_health_reports_provider_mismatch(app_factory):
    module = app_factory({
        "LLM_API_KEY": "nvapi-FAKEtestonlyNOTreal",
        "LLM_API_BASE": "https://token.sensenova.cn/v1",
    })
    with TestClient(module.app, client=LOOPBACK) as client:
        health = client.get("/api/health").json()
    assert health["llm_configured"] is True
    assert health["llm_provider_mismatch"] is True



@pytest.mark.parametrize("bad", [
    {"messages": []},
    {"messages": [{"role": "hacker", "content": "x"}]},
    {"messages": "not-a-list"},
    {"user": 123},
])
def test_invalid_messages_rejected(client, bad):
    assert client.post("/api/llm/chat", json=bad).status_code == 400


def test_vision_rejects_non_image_url(client):
    response = client.post("/api/llm/vision", json={
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": "http://169.254.169.254/x.png"}},
        ]}],
    })
    assert response.status_code == 400


def test_vision_accepts_https_and_data_url(app_module, monkeypatch):
    captured = {}

    async def handler(request):
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(app_module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(app_module.app, client=LOOPBACK) as client:
        response = client.post("/api/llm/vision", json={
            "messages": [{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": "https://cdn.example.com/a.png"}},
                {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAA"}},
            ]}],
        })
    assert response.status_code == 200


def test_rate_limit_returns_429(app_factory, monkeypatch):
    module = app_factory()
    module.RATE_RULES["rewrite"] = {"hour": 2, "day": 1000}

    async def handler(request):
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(module.app, client=LOOPBACK) as client:
        codes = [
            client.post("/api/llm/chat", json={"user": "hi", "stream": False}).status_code
            for _ in range(3)
        ]
    assert codes == [200, 200, 429]


def test_rate_limit_is_per_tenant(app_factory, monkeypatch):
    module = app_factory({"TENANT_KEYS": "shop-a:key-a,shop-b:key-b"})
    module.RATE_RULES["rewrite"] = {"hour": 1, "day": 1000}

    async def handler(request):
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(module.httpx, "AsyncClient", mock_upstream(handler))
    with TestClient(module.app, client=("203.0.113.9", 50006)) as client:
        first = client.post("/api/llm/chat", json={"user": "hi", "stream": False},
                            headers={"X-API-Key": "key-a"}).status_code
        second_a = client.post("/api/llm/chat", json={"user": "hi", "stream": False},
                               headers={"X-API-Key": "key-a"}).status_code
        first_b = client.post("/api/llm/chat", json={"user": "hi", "stream": False},
                              headers={"X-API-Key": "key-b"}).status_code

    assert (first, second_a, first_b) == (200, 429, 200)
