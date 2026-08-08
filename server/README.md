# 视频文案提取后端

## 快速启动

```bash
# 方式一：直接运行（需要安装 Python 依赖）
pip install -r requirements.txt
python video-extract.py --serve --port 8765

# 方式二：Docker（推荐，零依赖）
cd ..
docker compose up --build
```

## API 接口

### 提取视频文案

**POST** `/`

```json
{
  "url": "https://v.douyin.com/xxx",
  "engine": "auto",
  "language": "zh",
  "hotwords": "品牌名,套餐名",
  "brand_name": "星悦造型",
  "area_name": "静安大悦城",
  "api_key": "sk-...",
  "skip_llm": false
}
```

响应：

```json
{
  "ok": true,
  "text": "提取后的文案...",
  "full_text": "...",
  "source": "subtitle (manual-zh) 或 asr (funasr)",
  "subtitle_items": [{"seq": 1, "time": "00:00:00,000 --> 00:00:02,000", "text": "..."}],
  "post_process": [{"layer": 1, "name": "VAD静音过滤", "ok": true}, ...],
  "meta": {"extraction_method": "subtitle|asr", "asr_engine": "funasr", ...}
}
```

### 服务状态

**GET** `/`

```json
{"ok": true, "status": "running", "ffmpeg_ok": true}
```

## 本地测试

```bash
# 从链接提取（需网络）
python video-extract.py --url "https://www.youtube.com/watch?v=xxx"

# 从本地文件提取
python video-extract.py --file /path/to/video.mp4 --verbose

# 带热词 + LLM 后处理
python video-extract.py --url "https://..." \
  --hotwords "星悦造型,护理套餐" \
  --brand "星悦造型" \
  --api-key "sk-..."
```

## 云端部署

### Railway（推荐，免费额度 $5/月）

1. https://railway.app → Login with GitHub
2. New Project → Deploy from GitHub repo → 选 `douyin-copy-studio`
3. 配置：
   - Root Directory: `server`
   - Start Command: `python video-extract.py --serve --port 8765`
   - Add Variable: `PORT = 8765`
4. 部署完成后获取 URL（如 `https://xxx.railway.app`）
5. 回到文案工作台 → 视频提取 Tab → 提取服务配置 → 填入 API 地址

### 腾讯云 CloudBase Serverless

```bash
# 安装 CLI
npm install -g @cloudbase/cli

# 登录
cloudbase login

# 初始化
cloudbase init
# 选择 "Serverless Framework 函数"

# 部署
cd server
cloudbase framework:deploy
```

### Docker 部署（任意服务器）

```bash
cd server
docker build -t video-extract .
docker run -d -p 8765:8765 --name video-extract video-extract
```

## 注意事项

- ASR 模型首次运行会自动下载（FunASR ~700MB, faster-whisper ~244MB）
- 需要至少 2GB 内存运行 FunASR
- Playwright 浏览器仅用于兜底下载，不影响主要功能