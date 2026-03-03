# 论文管理系统后端 API

基于 FastAPI + SQLAlchemy + SQLite 的论文管理系统后端。

## 项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── config.py           # 配置文件
│   ├── database.py         # 数据库连接
│   ├── models/             # 数据库模型
│   │   ├── paper.py        # 论文表
│   │   └── annotation.py   # 批注表
│   ├── schemas/            # Pydantic模型
│   │   ├── paper.py
│   │   └── annotation.py
│   ├── services/           # 业务逻辑层
│   │   ├── paper_service.py
│   │   ├── annotation_service.py
│   │   └── kimi_service.py
│   ├── routers/            # API路由
│   │   ├── papers.py
│   │   ├── annotations.py
│   │   └── summarize.py
│   └── utils/              # 工具函数
│       └── logging_config.py
├── uploads/                # 文件上传目录
├── main.py                 # 应用入口
├── requirements.txt        # 依赖列表
├── .env.example            # 环境变量示例
└── README.md
```

## 安装依赖

```bash
# 使用 uv（推荐）
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt

# 或使用 pip
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，配置以下变量：
# - KIMI_API_KEY: Kimi API密钥（用于生成摘要）
# - DATABASE_URL: 数据库连接URL
# - UPLOAD_DIR: 文件上传目录
```

## 启动服务

```bash
# 开发模式（热重载）
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 生产模式
uvicorn main:app --host 0.0.0.0 --port 8000
```

## API 文档

启动服务后访问：
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API 接口列表

### 论文管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/papers` | 上传论文文件 |
| POST | `/api/papers/url` | 通过URL添加论文 |
| GET | `/api/papers` | 获取论文列表 |
| GET | `/api/papers/{id}` | 获取论文详情 |
| DELETE | `/api/papers/{id}` | 删除论文 |
| GET | `/api/papers/{id}/file` | 获取PDF文件 |

### 批注管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/papers/{id}/annotations` | 添加批注 |
| GET | `/api/papers/{id}/annotations` | 获取批注列表 |
| DELETE | `/api/annotations/{id}` | 删除批注 |

### AI摘要

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/papers/{id}/summarize` | 调用Kimi API生成论文摘要 |

## 环境变量说明

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| DATABASE_URL | sqlite:///./papers.db | 数据库连接URL |
| UPLOAD_DIR | ./uploads | 文件上传目录 |
| MAX_FILE_SIZE | 52428800 | 最大文件大小（字节）|
| KIMI_API_KEY | - | Kimi API密钥 |
| KIMI_BASE_URL | https://api.moonshot.cn/v1 | Kimi API基础URL |
| KIMI_MODEL | moonshot-v1-8k | Kimi模型名称 |
| CORS_ORIGINS | http://localhost:3000,... | 允许的CORS来源 |

## 技术栈

- **FastAPI**: Web框架
- **SQLAlchemy**: ORM
- **SQLite**: 数据库
- **python-multipart**: 文件上传支持
- **openai**: Kimi API客户端
- **httpx**: 异步HTTP客户端