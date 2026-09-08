"""server/.env 加载契约测试（全离线：不联网、不读取真实密钥）。

覆盖：
  - 纯 Python 解析：注释 / 空行 / 无等号行 / 引号 / 值内含等号
  - 默认「环境变量优先」：已有值不被 .env 覆盖（保护 CI 与测试注入，防止真实上游被调用）
  - COPY_STUDIO_DOTENV_OVERRIDE=1 反转为「.env 优先」
  - 冲突只记录键名，绝不记录值（避免密钥进日志）
  - 密钥文件权限收紧为仅当前用户可读写（600）
  - 未配置密钥时 LLM_API_KEY 为空，对应「在线 AI 未配置」
"""

import os

import pytest


def write_env(tmp_path, text, mode=0o600):
    path = tmp_path / ".env"
    path.write_text(text, encoding="utf-8")
    path.chmod(mode)
    return path


def test_parse_dotenv_handles_comments_quotes_and_equals(app_module, tmp_path):
    path = write_env(
        tmp_path,
        "\n".join(
            [
                "# 这是注释",
                "",
                "NOEQUALS_LINE",
                'QUOTED="v1"',
                "SINGLE='v2'",
                "URL=https://a/b?x=1&y=2",
                "SPACED = spaced-value ",
            ]
        ),
    )
    values = app_module._parse_dotenv(path)

    assert "NOEQUALS_LINE" not in values
    assert values["QUOTED"] == "v1"
    assert values["SINGLE"] == "v2"
    # 只按第一个等号切分，值里的 = 与 & 必须保留
    assert values["URL"] == "https://a/b?x=1&y=2"
    assert values["SPACED"] == "spaced-value"
    # 注释键不得出现
    assert not [k for k in values if k.startswith("#")]


def test_default_mode_env_var_wins_over_dotenv(app_module, tmp_path, monkeypatch):
    """默认环境变量优先：.env 的值不得覆盖已有环境变量。"""
    monkeypatch.setenv("DCS_TEST_KEY", "from-env")
    path = write_env(tmp_path, "DCS_TEST_KEY=from-file\n")

    app_module._load_dotenv(path)

    assert os.environ["DCS_TEST_KEY"] == "from-env"


def test_default_mode_dotenv_supplies_missing_keys(app_module, tmp_path, monkeypatch):
    """环境变量里没有的键，.env 应当补上。"""
    monkeypatch.delenv("DCS_ONLY_IN_FILE", raising=False)
    path = write_env(tmp_path, "DCS_ONLY_IN_FILE=from-file\n")

    app_module._load_dotenv(path)

    assert os.environ["DCS_ONLY_IN_FILE"] == "from-file"


def test_override_mode_dotenv_wins(app_factory, tmp_path, monkeypatch):
    """COPY_STUDIO_DOTENV_OVERRIDE=1 时反转为 .env 优先。"""
    module = app_factory(env={"COPY_STUDIO_DOTENV_OVERRIDE": "1"})
    monkeypatch.setenv("DCS_TEST_KEY", "from-env")
    path = write_env(tmp_path, "DCS_TEST_KEY=from-file\n")

    module._load_dotenv(path)

    assert os.environ["DCS_TEST_KEY"] == "from-file"


def test_conflict_records_key_name_only(app_factory, tmp_path, monkeypatch):
    """冲突只记键名；任何一侧的值都不得进入冲突列表（防密钥泄漏到日志）。"""
    module = app_factory()
    env_value = "env-secret-AAA"
    file_value = "file-secret-BBB"
    monkeypatch.setenv("DCS_SECRET", env_value)
    path = write_env(tmp_path, f"DCS_SECRET={file_value}\n")

    module._load_dotenv(path)

    assert "DCS_SECRET" in module._DOTENV_CONFLICTS
    rendered = repr(module._DOTENV_CONFLICTS)
    assert env_value not in rendered
    assert file_value not in rendered


def test_dotenv_keys_recorded_for_credential_group(app_factory, tmp_path, monkeypatch):
    """LLM 凭证组（Key/Base/Model）来源可被判定，用于「不得把凭证发错服务」的核验。"""
    module = app_factory()
    monkeypatch.delenv("DCS_GROUP_A", raising=False)
    path = write_env(tmp_path, "DCS_GROUP_A=1\nDCS_GROUP_B=2\n")

    module._load_dotenv(path)

    assert {"DCS_GROUP_A", "DCS_GROUP_B"} <= module._DOTENV_KEYS


def test_missing_dotenv_is_noop(app_module, tmp_path):
    """.env 不存在时必须静默跳过，不得抛异常。"""
    app_module._load_dotenv(tmp_path / "does-not-exist.env")


def test_secret_file_permission_tightened_to_600(app_module, tmp_path, monkeypatch):
    """密钥文件权限必须收紧为仅当前用户可读写。"""
    monkeypatch.delenv("DCS_PERM", raising=False)
    path = write_env(tmp_path, "DCS_PERM=1\n", mode=0o644)

    app_module._load_dotenv(path)

    assert path.stat().st_mode & 0o777 == 0o600


def test_empty_key_means_online_ai_unconfigured(app_factory):
    """未配置密钥时 LLM_API_KEY 为空，对应「在线 AI 未配置」状态。"""
    module = app_factory(env={"LLM_API_KEY": "", "SENSENOVA_API_KEY": ""})
    assert module.LLM_API_KEY == ""


@pytest.mark.parametrize("missing", ["LLM_API_KEY"])
def test_placeholder_key_still_present_in_tests(app_factory, missing):
    """测试进程内的密钥必须是占位值，不得是真实凭证。"""
    module = app_factory()
    assert module.LLM_API_KEY
    assert not module.LLM_API_KEY.startswith("sk-")
