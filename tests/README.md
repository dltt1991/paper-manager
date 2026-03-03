# 论文管理系统 - 测试部署和运行指南

本文档说明如何搭建测试环境、运行测试以及启动完整系统。

---

## 目录

1. [环境要求](#1-环境要求)
2. [快速开始](#2-快速开始)
3. [详细安装步骤](#3-详细安装步骤)
4. [运行测试](#4-运行测试)
5. [启动完整系统](#5-启动完整系统)
6. [测试数据准备](#6-测试数据准备)
7. [常见问题](#7-常见问题)
8. [CI/CD集成](#8-cicd集成)

---

## 1. 环境要求

### 1.1 硬件要求

| 项目 | 最低配置 | 推荐配置 |
|-----|---------|---------|
| CPU | 2核 | 4核 |
| 内存 | 4GB | 8GB |
| 磁盘空间 | 2GB | 5GB |
| 网络 | 可访问互联网 | 可访问互联网 |

### 1.2 软件要求

| 软件 | 版本 | 用途 |
|-----|------|-----|
| Python | 3.11+ | 后端运行和测试 |
| Node.js | 18+ | 前端运行 |
| npm/pnpm | 9+ | 前端包管理 |
| Git | 2.x | 代码管理 |
| SQLite | 3.x | 数据库（内置） |

### 1.3 操作系统支持

- ✅ Linux (Ubuntu 20.04+, CentOS 8+)
- ✅ macOS (12+)
- ✅ Windows (WSL2推荐)

---

## 2. 快速开始

### 2.1 一键启动（推荐）

```bash
# 1. 进入项目目录
cd /home/taoguo/work/0.projects/paper-reading/paper-manager

# 2. 运行完整测试
./tests/scripts/run_all_tests.sh

# 3. 启动完整系统
./tests/scripts/start_system.sh
```

### 2.2 手动步骤

如果你需要更细粒度的控制，请按照下面的详细步骤操作。

---

## 3. 详细安装步骤

### 3.1 克隆项目（如需要）

```bash
cd /home/taoguo/work/0.projects/paper-reading
git clone <repository-url> paper-manager  # 如果项目未克隆
cd paper-manager
```

### 3.2 后端环境配置

```bash
# 1. 进入后端目录
cd backend

# 2. 创建虚拟环境（使用uv或venv）
# 方式一：使用uv（推荐，速度快）
uv venv
source .venv/bin/activate  # Linux/Mac
# 或 .venv\Scripts\activate  # Windows

# 方式二：使用标准venv
python -m venv .venv
source .venv/bin/activate

# 3. 安装依赖
# 方式一：使用uv
uv pip install -r requirements.txt

# 方式二：使用pip
pip install -r requirements.txt

# 4. 安装测试依赖
pip install pytest pytest-asyncio httpx pytest-cov

# 5. 配置环境变量（可选）
cp .env.example .env
# 编辑 .env 文件配置Kimi API等（如需测试AI摘要）
```

### 3.3 前端环境配置

```bash
# 1. 进入前端目录
cd frontend

# 2. 安装依赖（使用pnpm或npm）
# 方式一：使用pnpm（推荐）
pnpm install

# 方式二：使用npm
npm install

# 3. 验证安装
pnpm dev  # 或 npm run dev
```

---

## 4. 运行测试

### 4.1 运行所有测试

```bash
# 进入项目根目录
cd /home/taoguo/work/0.projects/paper-reading/paper-manager

# 进入后端目录
backend/.venv/bin/python -m pytest tests/test_api.py -v
```

### 4.2 运行特定测试

```bash
# 运行特定测试类
backend/.venv/bin/python -m pytest tests/test_api.py::TestPaperUpload -v

# 运行特定测试方法
backend/.venv/bin/python -m pytest tests/test_api.py::TestPaperUpload::test_upload_valid_pdf -v

# 按关键词过滤
backend/.venv/bin/python -m pytest tests/test_api.py -k "upload" -v
```

### 4.3 生成测试报告

```bash
# 生成HTML覆盖率报告
backend/.venv/bin/python -m pytest tests/test_api.py --cov=backend/app --cov-report=html --cov-report=term

# 报告位置：htmlcov/index.html
```

### 4.4 测试标记说明

```bash
# 跳过慢测试
backend/.venv/bin/python -m pytest tests/test_api.py -v -m "not slow"

# 只运行集成测试
backend/.venv/bin/python -m pytest tests/test_api.py -v -m "integration"

# 只运行单元测试
backend/.venv/bin/python -m pytest tests/test_api.py -v -m "unit"
```

### 4.5 测试输出解读

```bash
# 详细输出
backend/.venv/bin/python -m pytest tests/test_api.py -v --tb=short

# 显示打印输出
backend/.venv/bin/python -m pytest tests/test_api.py -v -s

# 失败时立即停止
backend/.venv/bin/python -m pytest tests/test_api.py -v -x
```

---

## 5. 启动完整系统

### 5.1 启动后端服务

```bash
# 方式一：使用uvicorn（推荐）
cd backend
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 方式二：使用start.sh脚本
./start.sh
```

后端服务启动后访问：
- API文档: http://localhost:8000/docs
- 备用文档: http://localhost:8000/redoc
- 健康检查: http://localhost:8000/health

### 5.2 启动前端服务

```bash
# 在另一个终端窗口
cd frontend

# 方式一：使用pnpm
pnpm dev

# 方式二：使用npm
npm run dev
```

前端服务启动后访问：
- 应用: http://localhost:5173

### 5.3 验证系统启动

```bash
# 检查后端健康状态
curl http://localhost:8000/health
# 预期输出: {"status":"ok"}

# 检查API文档
curl http://localhost:8000/docs
# 应该返回HTML页面
```

### 5.4 生产环境部署

```bash
# 后端生产模式
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

# 前端生产构建
cd frontend
pnpm build
# 部署 dist/ 目录到静态服务器
```

---

## 6. 测试数据准备

### 6.1 测试PDF文件

项目已包含测试用的PDF文件：

| 文件 | 路径 | 说明 |
|-----|------|-----|
| sample.pdf | tests/fixtures/sample.pdf | 正常PDF文件 |
| empty.pdf | 动态生成 | 0字节文件 |
| corrupted.pdf | 动态生成 | 损坏的PDF |

### 6.2 生成测试数据

```bash
# 运行测试时会自动生成
# 如需手动生成，可运行：
backend/.venv/bin/python tests/scripts/generate_fixtures.py
```

### 6.3 清理测试数据

```bash
# 测试完成后自动清理
# 如需手动清理：
rm -rf backend/uploads/*
rm -f backend/papers.db
```

---

## 7. 常见问题

### 7.1 后端问题

#### Q: ImportError: cannot import name 'xxx'

```bash
# 确保在backend目录下激活虚拟环境
cd backend
source .venv/bin/activate

# 检查Python路径
python -c "import sys; print(sys.path)"

# 重新安装依赖
pip install -r requirements.txt
```

#### Q: 数据库连接错误

```bash
# 检查数据库目录权限
ls -la backend/

# 删除旧数据库重新初始化
rm backend/papers.db

# 重启服务，会自动创建新数据库
```

#### Q: 测试中出现"Module not found"

```bash
# 确保测试路径正确
cd /home/taoguo/work/0.projects/paper-reading/paper-manager

# 检查conftest.py路径
cat tests/conftest.py | head -20
```

### 7.2 前端问题

#### Q: npm install 失败

```bash
# 清除缓存重试
npm cache clean --force
rm -rf node_modules
npm install

# 或使用pnpm
pnpm install
```

#### Q: 开发服务器无法启动

```bash
# 检查端口占用
lsof -i :5173

# 使用其他端口
npm run dev -- --port 3000
```

### 7.3 测试问题

#### Q: 测试随机失败

```bash
# 检查数据库隔离
# 确保使用了正确的fixture

# 单个运行失败的测试
pytest tests/test_api.py::TestXXX::test_xxx -v

# 增加超时时间
pytest tests/test_api.py --timeout=60
```

#### Q: 覆盖率报告生成失败

```bash
# 安装覆盖率工具
pip install pytest-cov

# 确保有源代码
ls backend/app/

# 生成报告
pytest tests/test_api.py --cov=backend/app --cov-report=html
```

---

## 8. CI/CD集成

### 8.1 GitHub Actions 示例

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'
    
    - name: Install dependencies
      run: |
        cd backend
        pip install -r requirements.txt
        pip install pytest pytest-asyncio httpx pytest-cov
    
    - name: Run tests
      run: |
        cd /home/taoguo/work/0.projects/paper-reading/paper-manager
        pytest tests/test_api.py -v --cov=backend/app --cov-report=xml
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml
```

### 8.2 预提交钩子

```bash
# 安装pre-commit
pip install pre-commit

# 创建 .pre-commit-config.yaml
cat > .pre-commit-config.yaml << 'EOF'
repos:
  - repo: local
    hooks:
      - id: pytest
        name: pytest
        entry: pytest tests/test_api.py -v
        language: system
        types: [python]
        pass_filenames: false
        always_run: true
EOF

# 安装钩子
pre-commit install
```

---

## 附录

### A. 项目结构

```
paper-manager/
├── backend/              # 后端代码
│   ├── app/
│   │   ├── routers/      # API路由
│   │   ├── services/     # 业务逻辑
│   │   ├── models/       # 数据库模型
│   │   └── ...
│   ├── uploads/          # 上传文件目录
│   ├── requirements.txt
│   └── main.py
├── frontend/             # 前端代码
│   ├── src/
│   │   ├── pages/        # 页面组件
│   │   ├── components/   # 通用组件
│   │   └── ...
│   └── package.json
├── tests/                # 测试代码
│   ├── test_api.py       # API测试
│   ├── conftest.py       # pytest配置
│   ├── fixtures/         # 测试数据
│   ├── TEST_PLAN.md      # 测试计划
│   ├── test_cases.md     # 测试用例
│   └── TEST_REPORT.md    # 测试报告
└── docs/                 # 文档
    └── PRD.md            # 产品需求文档
```

### B. 常用命令速查

```bash
# ========== 后端命令 ==========
# 启动开发服务器
cd backend && uvicorn main:app --reload

# 安装依赖
cd backend && pip install -r requirements.txt

# 运行测试
pytest tests/test_api.py -v

# ========== 前端命令 ==========
# 启动开发服务器
cd frontend && pnpm dev

# 安装依赖
cd frontend && pnpm install

# 构建生产版本
cd frontend && pnpm build

# ========== 测试命令 ==========
# 运行所有测试
pytest tests/test_api.py -v

# 运行带覆盖率
pytest tests/test_api.py --cov=backend/app --cov-report=html

# 运行特定测试
pytest tests/test_api.py::TestPaperUpload -v
```

### C. 联系方式

如有问题，请联系：
- 项目负责人: [待填写]
- 测试工程师: [待填写]
- 开发团队: [待填写]

---

**最后更新**: 2026-02-26
