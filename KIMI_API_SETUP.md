# Kimi API 配置指南

## 问题
生成摘要时报错：`"Kimi API未配置"`

## 原因
Kimi API 需要 API Key 才能使用。如果没有配置，系统会返回此错误。

## 解决方案

### 步骤 1：获取 Kimi API Key

1. 访问 [Kimi 开放平台](https://platform.moonshot.cn/)
2. 注册/登录账号
3. 进入「API Key 管理」页面
4. 创建新的 API Key

### 步骤 2：配置后端

**方法 A：通过环境变量（推荐）**

```bash
# 临时设置（当前终端有效）
export KIMI_API_KEY="your-api-key-here"

# 然后启动后端
cd backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

**方法 B：通过 .env 文件**

编辑 `backend/.env` 文件：
```bash
# backend/.env
DATABASE_URL=sqlite:///./papers.db
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
CORS_ORIGINS=["*"]

# 添加你的 Kimi API Key
KIMI_API_KEY=your-api-key-here
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=moonshot-v1-8k

LOG_LEVEL=INFO
```

然后重启后端：
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 步骤 3：验证配置

启动后端时，如果配置正确，你会看到日志：
```
Kimi客户端初始化成功
```

如果没有配置，会看到：
```
KIMI_API_KEY未设置
```

## 测试摘要功能

1. 确保后端已配置 API Key 并启动
2. 上传一篇 PDF 论文
3. 点击论文进入详情页
4. 点击「生成 AI 摘要」按钮
5. 等待几秒钟，摘要应该自动生成

## 注意事项

### 1. API 费用
- Kimi API 是收费服务
- 请查看 [Kimi 定价页面](https://platform.moonshot.cn/docs/pricing) 了解费用详情
- 新用户通常有免费试用额度

### 2. 网络要求
- 服务器需要能访问 `https://api.moonshot.cn`
- 如果在内网环境，可能需要配置代理

### 3. 模型选择
可以在 `.env` 中配置不同模型：
```bash
# 轻量级模型，速度快，成本低
KIMI_MODEL=moonshot-v1-8k

# 标准模型
KIMI_MODEL=moonshot-v1-32k

# 长文本模型，适合长论文
KIMI_MODEL=moonshot-v1-128k
```

## 不使用 Kimi 的替代方案

如果你不想使用 Kimi API，可以考虑：

### 方案 1：手动填写摘要
- 在上传论文时手动填写摘要
- 或在编辑页面手动添加摘要

### 方案 2：接入其他 AI 服务
修改 `backend/app/services/kimi_service.py`，接入其他 AI 服务：
- OpenAI GPT
- Claude
- 文心一言
- 通义千问

### 方案 3：本地部署开源模型
使用本地部署的开源模型（如 Llama、ChatGLM 等）生成摘要。

## 安全提示

⚠️ **切勿将 API Key 提交到代码仓库！**

- 使用 `.env` 文件并添加到 `.gitignore`
- 或者使用环境变量
- 生产环境建议使用密钥管理服务
