"""安全响应头中间件契约测试。

覆盖：
  - 静态页面（index.html / standalone.html / 静态资源）必须携带 CSP/nosniff/DENY/no-referrer/Permissions-Policy
  - API 响应同样必须携带以上头
  - 敏感路径 404 也必须携带（防止中间件被异常路径绕过）
  - index.html 走严格策略：script-src 'self'，不允许 'unsafe-inline'
  - standalone.html 放行 'unsafe-inline'
  - Server 头必须被改写为业务标识 CopyStudio，且在任意响应中只出现一次
"""

import pytest


SECURITY_HEADER_KEYS = {
    "content-security-policy",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
}


def _assert_security_headers_present(headers):
    lower = {k.lower(): v for k, v in headers.items()}
    missing = [k for k in SECURITY_HEADER_KEYS if k not in lower]
    assert not missing, f"缺少安全响应头: {missing}"
    assert lower["x-content-type-options"] == "nosniff"
    assert lower["x-frame-options"] == "DENY"
    assert lower["referrer-policy"] == "no-referrer"
    # Permissions-Policy 应至少禁用地理/麦克风/摄像头/支付
    pp = lower["permissions-policy"]
    for token in ("geolocation", "microphone", "camera", "payment"):
        assert f"{token}=()" in pp, f"Permissions-Policy 缺少 {token}=(): {pp}"


def _assert_server_header_sanitized(headers):
    values = [v for k, v in headers.items() if k.lower() == "server"]
    assert values == ["CopyStudio"], (
        f"Server 头应为唯一伪造值，实际 {values}"
    )


def test_static_page_has_security_headers(app_module):
    from fastapi.testclient import TestClient

    client = TestClient(app_module.app)
    response = client.get("/")
    assert response.status_code == 200
    _assert_security_headers_present(response.headers)
    _assert_server_header_sanitized(response.headers)


def test_api_response_has_security_headers(app_module):
    from fastapi.testclient import TestClient

    client = TestClient(app_module.app)
    # /api/health 不需要鉴权，是最稳的公共端点
    response = client.get("/api/health")
    assert response.status_code == 200
    _assert_security_headers_present(response.headers)
    _assert_server_header_sanitized(response.headers)


def test_sensitive_404_still_has_security_headers(app_module):
    from fastapi.testclient import TestClient

    client = TestClient(app_module.app)
    response = client.get("/.env")
    assert response.status_code == 404
    _assert_security_headers_present(response.headers)
    _assert_server_header_sanitized(response.headers)


def test_csp_strict_on_index_no_unsafe_inline_script(app_module):
    from fastapi.testclient import TestClient

    client = TestClient(app_module.app)
    response = client.get("/")
    csp = response.headers["Content-Security-Policy"]
    assert "script-src 'self'" in csp, f"index CSP 应包含 script-src 'self'，实际：{csp}"
    assert "'unsafe-inline'" not in csp.split("script-src")[1].split(";")[0], (
        f"index 不应在 script-src 中放行 unsafe-inline，实际：{csp}"
    )
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp


def test_csp_inplace_on_standalone_allows_unsafe_inline_script(app_module):
    from fastapi.testclient import TestClient

    client = TestClient(app_module.app)
    response = client.get("/standalone.html")
    assert response.status_code == 200
    csp = response.headers["Content-Security-Policy"]
    script_src_part = csp.split("script-src")[1].split(";")[0]
    assert "'unsafe-inline'" in script_src_part, (
        f"standalone 应在 script-src 中放行 unsafe-inline，实际：{csp}"
    )
    assert "'self'" in script_src_part