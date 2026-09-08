"""后端测试公用装配。

安全约束（务必保持）：
  1. 测试绝不读取真实 server/.env —— 导入 app 之前先用占位值占住 LLM_API_KEY，
     _load_dotenv 不会覆盖已存在的环境变量，因此真实密钥不会进入测试进程。
  2. 每个用例使用独立临时 DATA_DIR，不触碰真实数据库。
  3. 所有上游 LLM / 视频下载都用 MockTransport，不发起真实网络请求。
"""

import atexit
import importlib
import os
import sys
import tempfile
from pathlib import Path

import httpx
import pytest

SERVER_DIR = Path(__file__).resolve().parents[1] / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

# 测试隔离：临时移走真实 server/.env，避免 app.py 在导入期加载它，
# 破坏「测试绝不读取真实 server/.env」的契约；会话结束（atexit）还原。
_REAL_ENV = SERVER_DIR / ".env"
_STASH_ENV = SERVER_DIR / ".env.test-stash"
if _REAL_ENV.exists() and not _STASH_ENV.exists():
    try:
        _REAL_ENV.rename(_STASH_ENV)
    except OSError:
        pass


def _restore_real_env():
    if _STASH_ENV.exists():
        try:
            _STASH_ENV.rename(_REAL_ENV)
        except OSError:
            pass


atexit.register(_restore_real_env)

# 占位值：真实密钥永不进入测试进程
PLACEHOLDER_KEY = "test-key-not-real"

BASE_ENV = {
    "LLM_API_KEY": PLACEHOLDER_KEY,
    "LLM_API_BASE": "https://upstream.invalid/v1",
    "LLM_MODEL": "test-model",
    "ALLOW_INSECURE_LLM_HTTP": "true",
    "HOST": "127.0.0.1",
}

# 每次 reload 前清掉的开关，保证用例之间互不污染
VOLATILE_KEYS = [
    "TENANT_KEYS", "API_KEYS", "REQUIRE_AUTH", "CORS_ORIGINS",
    "CORS_ALLOW_NULL", "ALLOW_REMOTE_URL", "MEDIA_HOST_ALLOWLIST",
    "HOST", "DATA_DIR", "DB_PATH", "PORT",
    "DB_MAX_PAYLOAD_BYTES", "LLM_MAX_BODY_BYTES", "EXTRACT_MAX_BODY_BYTES",
    "LLM_MODEL", "RATE_LIMIT_URL",
]


# 必须在任何 monkeypatch 之前抓到真实的 AsyncClient，
# 否则 mock 工厂会调用到自己造成无限递归。
REAL_ASYNC_CLIENT = httpx.AsyncClient


def mock_upstream(handler):
    """返回一个 httpx.AsyncClient 工厂，用 MockTransport 拦截所有上游请求。"""
    def _factory(*_args, **kwargs):
        kwargs.pop("timeout", None)
        return REAL_ASYNC_CLIENT(transport=httpx.MockTransport(handler), **kwargs)
    return _factory


def reload_app(env=None, data_dir=None):
    """用指定环境变量重新加载 server/app.py，返回模块对象。"""
    for key in VOLATILE_KEYS:
        os.environ.pop(key, None)
    os.environ.update(BASE_ENV)
    os.environ["DATA_DIR"] = data_dir or tempfile.mkdtemp(prefix="dcs-test-")
    if env:
        os.environ.update({k: v for k, v in env.items() if v is not None})

    if "app" in sys.modules:
        module = importlib.reload(sys.modules["app"])
    else:
        module = importlib.import_module("app")
    module._limits.clear()
    return module


@pytest.fixture()
def app_module(tmp_path):
    """默认本机开放模式（回环、无密钥、不要求鉴权）。"""
    module = reload_app(data_dir=str(tmp_path / "data"))
    yield module
    module._limits.clear()


@pytest.fixture()
def app_factory(tmp_path):
    """需要不同鉴权配置时用：app_factory(env={...}) -> module"""
    counter = {"n": 0}

    def _make(env=None):
        counter["n"] += 1
        directory = tmp_path / f"data{counter['n']}"
        directory.mkdir(parents=True, exist_ok=True)
        module = reload_app(env=env, data_dir=str(directory))
        return module

    yield _make
