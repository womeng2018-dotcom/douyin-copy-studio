#!/bin/bash
# ============================================================
# Render 自动部署脚本 — 用 API Key 全自动完成
# 用法: bash deploy-render.sh <RENDER_API_KEY>
# ============================================================
set -e
API_KEY="$1"
if [ -z "$API_KEY" ]; then
  echo "❌ 用法: bash deploy-render.sh <RENDER_API_KEY>"
  exit 1
fi

BASE="https://api.render.com/v1"
AUTH="Authorization: Bearer $API_KEY"

echo "=== 1. 验证 API Key ==="
ACCOUNT=$(curl -s -H "$AUTH" "$BASE/account")
if echo "$ACCOUNT" | grep -q '"email"'; then
  EMAIL=$(echo "$ACCOUNT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('email',''))")
  echo "✅ 验证通过: $EMAIL"
else
  echo "❌ API Key 无效: $ACCOUNT" | head -c 300
  exit 1
fi

echo ""
echo "=== 2. 检查是否已有同名服务 ==="
SERVICES=$(curl -s -H "$AUTH" "$BASE/services?name=video-extract")
EXISTING_ID=$(echo "$SERVICES" | python3 -c "
import json,sys
try:
    data = json.load(sys.stdin)
    svcs = data if isinstance(data, list) else data.get('data', [])
    for s in svcs:
        if s.get('service',{}).get('name') == 'video-extract':
            print(s['service']['id']); break
except Exception: pass
")

if [ -n "$EXISTING_ID" ]; then
  echo "✅ 已存在服务 ID: $EXISTING_ID（跳过创建）"
else
  echo "=== 3. 创建 Docker Web Service ==="
  CREATE=$(curl -s -X POST "$BASE/services" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d '{
      "type": "web",
      "name": "video-extract",
      "env": "docker",
      "repo": "https://github.com/womeng2018-dotcom/douyin-copy-studio",
      "branch": "main",
      "rootDir": "server",
      "plan": "free",
      "dockerContext": "./server",
      "dockerfilePath": "./server/Dockerfile",
      "envVars": [
        {"key": "PORT", "value": "8765"},
        {"key": "PYTHONUNBUFFERED", "value": "1"}
      ],
      "healthCheckPath": "/",
      "autoDeploy": true,
      "pullRequestPreviewsEnabled": false
    }')

  NEW_ID=$(echo "$CREATE" | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
    print(d.get('id',''))
except Exception: pass
")
  if [ -n "$NEW_ID" ]; then
    echo "✅ 服务创建成功 ID: $NEW_ID"
    EXISTING_ID="$NEW_ID"
  else
    echo "❌ 创建失败: $CREATE" | head -c 500
    exit 1
  fi
fi

echo ""
echo "=== 4. 触发部署 ==="
DEPLOY=$(curl -s -X POST "$BASE/services/$EXISTING_ID/deploys" \
  -H "$AUTH" -H "Content-Type: application/json" -d '{}')
DEPLOY_ID=$(echo "$DEPLOY" | python3 -c "
import json,sys
try: print(json.load(sys.stdin).get('id',''))
except Exception: pass
")
if [ -n "$DEPLOY_ID" ]; then
  echo "✅ 部署已触发 ID: $DEPLOY_ID"
else
  echo "❌ 触发失败: $DEPLOY" | head -c 300
  exit 1
fi

echo ""
echo "=== 5. 等待构建（每 30s 轮询，最多 40 分钟）==="
for i in $(seq 1 80); do
  sleep 30
  STATUS=$(curl -s -H "$AUTH" "$BASE/services/$EXISTING_ID/deploys/$DEPLOY_ID" | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
    print(d.get('status',''))
except Exception: pass
")
  echo "  [$(date +%H:%M:%S)] 部署状态: ${STATUS:-unknown} (第 ${i} 次检查)"
  if [ "$STATUS" = "live" ]; then
    echo "✅ 部署成功！"
    break
  elif [ "$STATUS" = "build_failed" ] || [ "$STATUS" = "canceled" ]; then
    echo "❌ 部署失败，获取日志..."
    curl -s -H "$AUTH" "$BASE/services/$EXISTING_ID/deploys/$DEPLOY_ID" | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('失败原因:', d.get('statusText', ''))"
    exit 1
  fi
done

echo ""
echo "=== 6. 获取服务 URL ==="
URL=$(curl -s -H "$AUTH" "$BASE/services/$EXISTING_ID" | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
    print(d.get('serviceDetails',{}).get('url',''))
except Exception: pass
")
if [ -n "$URL" ]; then
  echo "🎉 服务地址: $URL"
  echo "SERVICE_URL=$URL" > /tmp/render_url.txt
  echo "SERVICE_ID=$EXISTING_ID" >> /tmp/render_url.txt
else
  echo "⚠️ 服务状态: $(curl -s -H "$AUTH" "$BASE/services/$EXISTING_ID" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('service',{}).get('state',''))")"
  echo "无法获取 URL，请到 Dashboard 查看"
fi