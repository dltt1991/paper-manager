# 📚 论文管理系统

一个基于 FastAPI + React 的论文管理应用，支持 PDF 上传、在线阅读、高亮批注、AI 摘要生成和翻译功能。

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19+-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ✨ 功能特性

### 核心功能
- 📄 **PDF 管理** - 支持本地上传或 URL 下载论文
- 📖 **在线阅读** - 浏览器内直接阅读 PDF，无需下载
- 🖍️ **高亮批注** - 8 种颜色高亮，支持文本批注
- 🤖 **AI 摘要** - 集成 Kimi AI 自动生成论文摘要
- 🌐 **文本翻译** - 支持有道/MyMemory 翻译引擎
- 🏷️ **标签管理** - 按标签筛选和分类论文

### 用户系统
- 🔐 **JWT 认证** - 安全的登录认证机制
- 👤 **用户管理** - 支持多用户，管理员可管理用户
- ⚙️ **个人设置** - 配置个人 API 密钥和偏好
- 🔒 **权限控制** - 普通用户/管理员角色分离

---

## 🚀 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+
- SQLite（内置，无需额外安装）

### 1. 克隆项目

```bash
git clone <repository-url>
cd paper-manager
```

### 2. 配置后端

```bash
cd backend

# 创建虚拟环境
python3 -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate   # Windows

# 安装依赖（使用 uv 更快）
uv pip install -r requirements.txt
# 或使用 pip
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置以下关键项：
# - DATABASE_URL: 数据库路径
# - SECRET_KEY: JWT 密钥（生产环境必须修改）
# - KIMI_API_KEY: Kimi API 密钥（可选，用于 AI 摘要）
```

### 3. 配置前端

```bash
cd frontend

# 安装依赖（使用 pnpm 或 npm）
pnpm install
# 或 npm install

# 配置环境变量
cp .env.example .env.local
# 默认 API 地址为 http://localhost:8000，一般无需修改
```

### 4. 启动服务

**方式一：使用启动脚本（推荐）**

```bash
# 在项目根目录执行
./start_backend.sh   # 终端 1 - 启动后端
./start_frontend.sh  # 终端 2 - 启动前端
```

**方式二：手动启动**

```bash
# 终端 1 - 后端
cd backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 终端 2 - 前端
cd frontend
pnpm dev
```

### 5. 访问应用

- 🌐 前端界面: http://localhost:5173
- 🔧 后端 API: http://localhost:8000
- 📚 API 文档: http://localhost:8000/docs

---

## 📖 使用说明

### 首次使用

1. **注册账号** - 访问 http://localhost:5173/register
2. **登录系统** - 使用注册的用户名/密码登录
3. **上传论文** - 点击「上传论文」按钮，选择 PDF 或输入 URL
4. **阅读批注** - 在论文详情页阅读 PDF，选中文本进行高亮或批注
5. **AI 摘要** - 点击「生成摘要」按钮自动生成论文摘要

### 管理员操作

1. **设置管理员** - 第一个注册的用户自动成为管理员
2. **用户管理** - 访问「管理面板」查看和管理所有用户
3. **系统监控** - 查看用户数量、论文数量等统计信息

### API 配置（可选）

#### 配置 Kimi AI 摘要

1. 访问 [Kimi 开放平台](https://platform.moonshot.cn/) 获取 API Key
2. 在个人设置页配置 Kimi API Key
3. 或使用系统默认配置（需管理员在 backend/.env 配置）

#### 配置有道翻译

1. 访问 [有道智云](https://ai.youdao.com/) 创建应用
2. 获取应用 ID 和密钥
3. 在个人设置页配置有道翻译

更多详情查看 [KIMI_API_SETUP.md](KIMI_API_SETUP.md)

---

## 🏗️ 项目结构

```
paper-manager/
├── 📁 backend/               # 后端服务
│   ├── 📁 app/              # 应用代码
│   │   ├── 📁 models/       # 数据库模型
│   │   ├── 📁 routers/      # API 路由
│   │   ├── 📁 schemas/      # Pydantic 模型
│   │   ├── 📁 services/     # 业务逻辑
│   │   ├── config.py        # 配置管理
│   │   ├── database.py      # 数据库连接
│   │   └── main.py          # 应用入口
│   ├── 📁 uploads/          # 上传文件存储
│   ├── .env                 # 环境变量
│   └── requirements.txt     # Python 依赖
│
├── 📁 frontend/              # 前端应用
│   ├── 📁 src/
│   │   ├── 📁 components/   # 通用组件
│   │   ├── 📁 contexts/     # React Context
│   │   ├── 📁 pages/        # 页面组件
│   │   ├── api.ts           # API 封装
│   │   ├── App.tsx          # 应用根组件
│   │   └── types.ts         # TypeScript 类型
│   └── package.json         # Node.js 依赖
│
├── 📁 docs/                  # 文档
│   └── PRD.md               # 产品需求文档
│
├── 📄 papers.db              # SQLite 数据库
├── 📄 README.md              # 本文档
├── 📄 KIMI_API_SETUP.md      # Kimi API 配置指南
├── 📄 QUICK_START.md         # 快速入门
├── 📄 USER_MANAGEMENT.md     # 用户管理说明
└── 📄 *.sh                   # 启动脚本
```

---

## 🛠️ 部署说明

### 生产环境部署

#### 1. 环境准备

```bash
# 服务器要求
- Linux 服务器（Ubuntu 20.04+ / CentOS 8+）
- Python 3.11+
- Node.js 18+
- Nginx（反向代理）
- Systemd（服务管理）
```

#### 2. 后端部署

```bash
cd backend

# 创建生产环境配置
export ENVIRONMENT=production
export SECRET_KEY="your-super-secret-key-here"
export DATABASE_URL="sqlite:///./papers.db"

# 安装依赖
uv pip install -r requirements.txt

# 使用 Gunicorn 启动
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

#### 3. 前端构建

```bash
cd frontend

# 安装依赖
pnpm install

# 构建生产版本
pnpm build

# 构建结果在 dist/ 目录
```

#### 4. Nginx 配置

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/paper-manager/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### 5. Systemd 服务配置

```ini
# /etc/systemd/system/paper-manager.service
[Unit]
Description=Paper Manager Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/paper-manager/backend
Environment="ENVIRONMENT=production"
Environment="SECRET_KEY=your-secret-key"
ExecStart=/path/to/paper-manager/backend/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# 启动服务
sudo systemctl enable paper-manager
sudo systemctl start paper-manager
```

---

## 🔧 常用脚本

| 脚本 | 说明 |
|-----|------|
| `./start_backend.sh` | 启动后端服务 |
| `./start_frontend.sh` | 启动前端开发服务器 |
| `./stop_services.sh` | 停止所有服务 |
| `./restart_services.sh` | 重启所有服务 |

---

## 🤝 贡献指南

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的改动 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

---

## 📄 许可证

本项目基于 [MIT](LICENSE) 许可证开源。

---

## 🙏 致谢

- [FastAPI](https://fastapi.tiangolo.com/) - 高性能 Python Web 框架
- [React](https://react.dev/) - 用户界面库
- [Ant Design](https://ant.design/) - UI 组件库
- [Kimi](https://platform.moonshot.cn/) - AI 大模型服务
- [PDF.js](https://mozilla.github.io/pdf.js/) - PDF 渲染引擎

---

## 📞 支持与反馈

如有问题或建议，欢迎：
- 提交 [Issue](https://github.com/your-repo/issues)
- 发送邮件至 dltt1991@163.com

---

**最新更新**: 2026-03-03
