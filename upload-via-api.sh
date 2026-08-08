#!/bin/bash
# 通过 GitHub Contents API 上传变更文件（git push 代理不通时的备用通道）
set -u
REPO="womeng2018-dotcom/douyin-copy-studio"
BRANCH="main"
MSG="视觉升级：莫兰迪低饱和度蓝+米白配色，Claude风格字体与极简设计语言"

FILES="css/app.css index.html js/app.js js/data-category.js js/data-compliance.js js/data-lines.js js/engine.js standalone.html stress-test.js upload-via-api.sh"

for f in $FILES; do
  if [ ! -f "$f" ]; then echo "跳过（不存在）：$f"; continue; fi

  # 取远端已有文件的 sha（不存在则为空 = 新建）
  SHA=$(gh api "/repos/$REPO/contents/$f?ref=$BRANCH" --jq '.sha' 2>/dev/null)

  B64=$(base64 -i "$f" | tr -d '\n')

  if [ -n "$SHA" ] && [ "$SHA" != "null" ]; then
    RES=$(gh api -X PUT "/repos/$REPO/contents/$f" \
      -f message="$MSG" -f content="$B64" -f branch="$BRANCH" -f sha="$SHA" \
      --jq '.commit.sha' 2>&1)
  else
    RES=$(gh api -X PUT "/repos/$REPO/contents/$f" \
      -f message="$MSG" -f content="$B64" -f branch="$BRANCH" \
      --jq '.commit.sha' 2>&1)
  fi

  if echo "$RES" | grep -qE '^[0-9a-f]{7,40}$'; then
    echo "✅ $f -> ${RES:0:7}"
  else
    echo "❌ $f -> $RES"
  fi
done
