"""限流后端边界测试（P2.8）。

覆盖：
  - 默认（无 RATE_LIMIT_URL）走内存后端
  - 设置 RATE_LIMIT_URL 但 redis 模块不可用时优雅回退内存，不抛异常
  - RATE_LIMIT_URL 已设置且 Redis 可用时切换到 Redis 后端
  - Redis 后端的滑动窗口逻辑：超出日配额拒绝
"""

import pytest


def test_default_backend_is_memory(app_module):
    """无 RATE_LIMIT_URL 时 _redis_rate_client 必须为 None，限流走内存。"""
    assert app_module._redis_rate_client is None
    assert app_module._redis_sliding_script is None


def test_check_rate_dispatches_to_memory_by_default(app_module):
    """默认内存路径：超过日配额应被拒绝。"""
    import time
    rule = app_module.RATE_RULES["rewrite"]
    ok, _ = app_module._check_rate("test-ident", "rewrite")
    assert ok is True
    # 直接把内存桶塞满到 day 上限（时间戳必须落在 86400s 窗口内）
    now = time.time()
    app_module._limits["test-ident"]["rewrite_d"] = [now] * (rule["day"] + 10)
    ok, detail = app_module._check_rate("test-ident", "rewrite")
    assert ok is False
    assert detail["daily"] is True
    assert detail["dayUsed"] >= rule["day"]


def test_missing_redis_module_falls_back_gracefully(monkeypatch, tmp_path):
    """设置 RATE_LIMIT_URL 但 redis 模块不可用时，必须打印 WARNING 并回退内存。"""
    # 隐藏 redis 模块
    monkeypatch.setitem(__import__("sys").modules, "redis", None)

    import importlib
    import sys
    import os

    # 强制以含 RATE_LIMIT_URL 的环境 reload app
    monkeypatch.setenv("RATE_LIMIT_URL", "redis://127.0.0.1:6379/0")
    if "app" in sys.modules:
        module = importlib.reload(sys.modules["app"])
    else:
        module = importlib.import_module("app")

    # 模块不可用 → _redis_rate_client 保持 None，自动走内存
    assert module._redis_rate_client is None
    assert module._redis_sliding_script is None
    # 限流仍可用（内存）
    ok, _ = module._check_rate("fallback-ident", "rewrite")
    assert ok is True


def test_redis_backend_used_when_url_set_and_module_available(monkeypatch):
    """RATE_LIMIT_URL + 可用 redis 模块 + 可达 Redis：应建立客户端与 Lua 脚本。"""
    # 用一个假 redis 模块满足 import；底层 ping 返回 1 即视为探活成功
    class _FakeRedis:
        def __init__(self, *a, **kw):
            pass

        @classmethod
        def from_url(cls, _url, **kw):
            return cls()

        def ping(self):
            return True

        def register_script(self, _lua):
            return lambda *a, **kw: [1, 0, 0]

    import sys
    fake_module = type(sys)("redis")
    fake_module.Redis = _FakeRedis
    monkeypatch.setitem(sys.modules, "redis", fake_module)

    monkeypatch.setenv("RATE_LIMIT_URL", "redis://fake-host:6379/0")

    import importlib
    if "app" in sys.modules:
        module = importlib.reload(sys.modules["app"])
    else:
        module = importlib.import_module("app")

    assert module._redis_rate_client is not None
    assert module._redis_sliding_script is not None


def test_redis_daily_quota_blocks(app_module, monkeypatch):
    """Redis 后端：返回 (0, 1, used) 应被映射为日配额拒绝。"""
    monkeypatch.setattr(app_module, "_redis_rate_client", object())
    monkeypatch.setattr(app_module, "_redis_sliding_script", lambda *a, **kw: [0, 1, 200])

    ok, detail = app_module._check_rate_redis(
        "test-ident", "rewrite", {"hour": 60, "day": 200}
    )
    assert ok is False
    assert detail["daily"] is True
    assert detail["dayUsed"] == 200


def test_redis_hourly_quota_blocks(app_module, monkeypatch):
    """Redis 后端：返回 (0, 2, used) 应被映射为小时配额拒绝。"""
    monkeypatch.setattr(app_module, "_redis_rate_client", object())
    monkeypatch.setattr(app_module, "_redis_sliding_script", lambda *a, **kw: [0, 2, 60])

    ok, detail = app_module._check_rate_redis(
        "test-ident", "rewrite", {"hour": 60, "day": 200}
    )
    assert ok is False
    assert detail["daily"] is False
    assert detail["hourUsed"] == 60


def test_redis_call_failure_fails_open(app_module, monkeypatch):
    """Redis 调用失败时降级为 allow（fail open），保证 Redis 抖动不阻塞合法用户。"""

    def _boom(*a, **kw):
        raise ConnectionError("redis down")

    monkeypatch.setattr(app_module, "_redis_rate_client", object())
    monkeypatch.setattr(app_module, "_redis_sliding_script", _boom)

    ok, _ = app_module._check_rate_redis(
        "test-ident", "rewrite", {"hour": 60, "day": 200}
    )
    assert ok is True  # 失败时不阻断请求