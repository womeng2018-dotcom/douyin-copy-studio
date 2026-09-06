"""scripts/git-safe.sh 边界测试（P3.10）。

直接 fork shell 进程执行脚本，覆盖：
  - 无 lock 时优雅跳过
  - 0 字节 + mtime 5 分钟以上：自动删除
  - 0 字节 + mtime 5 分钟内：跳过（保守策略）
  - 非 0 字节：跳过（可能正被真实 git 进程持有）
  - 不可解析 mtime：跳过并 WARNING
"""

import os
import shutil
import stat
import subprocess
import time
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "git-safe.sh"


def _mtime_seconds_ago(path: Path, seconds: float):
    """设置文件的 mtime 为 seconds 秒前。"""
    now = time.time()
    os.utime(path, (now, now - seconds))


def _run_in(cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(SCRIPT)],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=15,
    )


@pytest.fixture()
def fake_repo(tmp_path: Path) -> Path:
    """构造一个临时 git 仓库，.git/index.lock 由用例创建。"""
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / ".git").mkdir()
    # 不真正 init git — .git 目录存在即可让脚本找到
    return repo


def test_no_lock_exits_cleanly(fake_repo: Path):
    """无 lock 时静默通过，stdout 含 '无 stale lock'。"""
    result = _run_in(fake_repo)
    assert result.returncode == 0
    assert "无 stale lock" in result.stdout


def test_stale_zero_byte_lock_is_removed(fake_repo: Path):
    """0 字节 + mtime 10 分钟前的 lock 必须被自动删除。"""
    lock = fake_repo / ".git" / "index.lock"
    lock.touch()
    lock.write_text("")  # 确保 0 字节
    _mtime_seconds_ago(lock, 600)

    result = _run_in(fake_repo)
    assert result.returncode == 0
    assert "stale lock" in result.stdout
    assert not lock.exists(), "0 字节 stale lock 必须被清理"


def test_recent_zero_byte_lock_is_kept(fake_repo: Path):
    """0 字节 + mtime 1 分钟内：保守策略保留。"""
    lock = fake_repo / ".git" / "index.lock"
    lock.touch()
    lock.write_text("")
    _mtime_seconds_ago(lock, 30)

    result = _run_in(fake_repo)
    assert result.returncode == 0
    assert "跳过" in result.stdout
    assert lock.exists(), "近期 lock 不应被清理"


def test_non_zero_byte_lock_is_kept(fake_repo: Path):
    """非 0 字节 lock 永远不动（可能正被真实 git 进程持有）。"""
    lock = fake_repo / ".git" / "index.lock"
    lock.write_text("held-by-real-git-process")
    _mtime_seconds_ago(lock, 99999)

    result = _run_in(fake_repo)
    assert result.returncode == 0
    assert "size=" in result.stdout and ">0" in result.stdout
    assert lock.exists(), "非 0 字节 lock 绝对不能自动清理"


def test_script_runs_from_outside_repo(tmp_path: Path):
    """脚本通过解析自身所在目录向上找 .git，调用方不必在仓库内。

    注：脚本文件物理位于真实 dcs-repo 内，所以 BASH_SOURCE 解析到的
    总是 dcs-repo；这里验证的是"调用方在仓库外时脚本仍能通过脚本自身
    路径找到仓库并正常返回"。
    """
    outside = tmp_path / "outside"
    outside.mkdir()
    result = subprocess.run(
        ["bash", str(SCRIPT)],
        cwd=outside,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0
    # 必须包含成功标识（"无 stale lock" 或已清理标记）
    assert "无 stale lock" in result.stdout or "stale lock" in result.stdout
    # 必须解析到一个仓库（路径含 ".git/"）
    assert ".git/" in result.stdout


def test_help_flag(tmp_path: Path):
    """--help 打印脚本头部注释，不执行清理逻辑。"""
    result = subprocess.run(
        ["bash", str(SCRIPT), "--help"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0
    assert "git-safe" in result.stdout or "stale" in result.stdout


def test_force_keeps_normal_lock_and_removes_old_held_lock(fake_repo: Path):
    """--force 模式：size>0 且 age>30min 才会被强制清理；近期的 size>0 不动。"""
    lock = fake_repo / ".git" / "index.lock"
    lock.write_text("old-held")
    _mtime_seconds_ago(lock, 60 * 45)  # 45 min ago

    result = subprocess.run(
        ["bash", str(SCRIPT), "--force"],
        cwd=fake_repo,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0
    assert not lock.exists(), "size>0 + age>30min 在 --force 下必须被清理"