#!/usr/bin/env bash
# ============================================================
# git-safe.sh — 自动清理 stale 的 .git/index.lock
# ============================================================
#
# 触发场景：git 进程被 kill -9、容器崩溃、Sandbox 断连等中断时，
# .git/index.lock 可能残留并阻塞后续 git 操作（"fatal: Unable to create
# '.../.git/index.lock': File exists."）。
#
# 安全策略（保守）：
#   - 只清理「0 字节 且 修改时间超过 5 分钟」的 lock 文件
#   - 非 0 字节的 lock（正常 git 进程产物）一律不动
#   - 5 分钟内的 0 字节 lock（瞬态或并发保护期）一律不动
#   - 不可解析 mtime 时一律不动并提示人工介入
#
# 用法：
#   bash scripts/git-safe.sh               # 清理当前 / 脚本所在仓库的 stale lock
#   bash scripts/git-safe.sh --force       # 清理 size>0 且 mtime>30min 的 lock（高风险）
#   source scripts/git-safe.sh && git_safe_check   # 在启动器中 source 后调用
#
# 兼容：macOS（BSD stat -f）和 Linux（GNU stat -c）。

set -e

# 端口兼容的 stat 探测
_stat_size_and_mtime() {
    local file="$1"
    if stat -c '%s %Y' "$file" >/dev/null 2>&1; then
        stat -c '%s %Y' "$file"        # GNU coreutils
    elif stat -f '%z %m' "$file" >/dev/null 2>&1; then
        stat -f '%z %m' "$file"        # BSD / macOS
    else
        return 1
    fi
}

# 找 .git 目录：先看 PWD，再看脚本所在目录的父级
_repo_root() {
    local dir="${1:-$PWD}"
    for _ in 1 2 3 4 5 6 7 8; do
        if [ -d "$dir/.git" ]; then
            echo "$dir"
            return 0
        fi
        local parent
        parent=$(dirname "$dir")
        [ "$parent" = "$dir" ] && return 1
        dir="$parent"
    done
    return 1
}

# 主入口（封装函数，可被 source 后调用）
git_safe_check() {
    local force="${1:-}"
    local root
    # 优先 PWD，回退到脚本所在目录的 ../
    local script_dir
    script_dir=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")
    root=$(_repo_root "$PWD") || root=$(_repo_root "$script_dir/..") || {
        echo "[git-safe] 未找到 .git 目录，跳过"
        return 0
    }

    local lock="$root/.git/index.lock"
    if [ ! -e "$lock" ]; then
        echo "[git-safe] 无 stale lock: $root/.git/"
        return 0
    fi

    local size_mtime
    if ! size_mtime=$(_stat_size_and_mtime "$lock" 2>/dev/null); then
        echo "[git-safe] 警告：无法读取 lock 元数据，请人工检查：$lock" >&2
        return 0
    fi
    local size=${size_mtime%% *}
    local mtime=${size_mtime##* }
    local now; now=$(date +%s)
    local age=$(( now - mtime ))
    local age_min=$(( age / 60 ))

    if [ "$size" -eq 0 ] && [ "$age" -gt 300 ]; then
        echo "[git-safe] 发现 stale lock：$lock"
        echo "          size=0 字节，age=${age_min} 分钟（阈值 5 分钟），自动清理"
        rm -f "$lock"
        echo "[git-safe] 已删除 $lock"
        return 0
    fi

    if [ "$size" -ne 0 ]; then
        echo "[git-safe] 警告：$lock size=${size} 字节（>0），可能正被真实 git 进程持有"
        echo "          age=${age_min} 分钟。自动跳过；如确认无活动 git 进程，请用 --force"
        return 0
    fi

    echo "[git-safe] $lock size=0 字节但 age 仅 ${age_min} 分钟（< 5 分钟阈值），跳过"
    return 0
}

# --force 模式：清理 size>0 且 mtime>30min 的 lock（高风险，仅人工确认时使用）
git_safe_force() {
    local root
    local script_dir
    script_dir=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")
    root=$(_repo_root "$PWD") || root=$(_repo_root "$script_dir/..") || return 0
    local lock="$root/.git/index.lock"
    [ -e "$lock" ] || return 0
    local size_mtime
    size_mtime=$(_stat_size_and_mtime "$lock" 2>/dev/null) || return 0
    local size=${size_mtime%% *}
    local mtime=${size_mtime##* }
    local now; now=$(date +%s)
    local age=$(( now - mtime ))
    if [ "$size" -gt 0 ] && [ "$age" -gt 1800 ]; then
        echo "[git-safe] --force 清理：$lock (size=$size, age=$((age/60)) 分钟)"
        rm -f "$lock"
    fi
}

# 脚本直接调用（非被 source）
if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ]; then
    case "${1:-}" in
        --force)
            git_safe_force
            ;;
        --help|-h)
            sed -n '2,26p' "$0"
            ;;
        *)
            git_safe_check "$@"
            ;;
    esac
fi