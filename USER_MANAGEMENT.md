# 用户管理功能说明

## 功能概述

论文管理系统现已添加完整的用户管理功能，支持：

- ✅ 用户账号注册、登录
- ✅ JWT Token认证
- ✅ 每个用户的论文独立管理
- ✅ 管理员后台管理用户

## 后端API

### 认证相关

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/auth/register` | 用户注册 |
| POST | `/auth/login` | 用户登录（OAuth2表单）|
| POST | `/auth/login/json` | 用户登录（JSON格式）|
| GET | `/auth/me` | 获取当前用户信息 |
| PUT | `/auth/me` | 更新当前用户信息 |
| POST | `/auth/me/password` | 修改密码 |
| POST | `/auth/refresh` | 刷新Token |

### 管理员API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/admin/users` | 获取用户列表 |
| GET | `/admin/users/{id}` | 获取指定用户 |
| PUT | `/admin/users/{id}` | 更新用户信息 |
| DELETE | `/admin/users/{id}` | 删除用户 |
| POST | `/admin/users/{id}/reset-password` | 重置用户密码 |
| GET | `/admin/stats` | 获取系统统计 |

### 论文API（已更新）

所有论文API现在需要认证，用户只能访问自己的论文。管理员可以访问所有论文。

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/papers/` | 获取当前用户的论文列表 |
| GET | `/papers/all` | 获取所有论文（管理员）|
| GET | `/papers/search` | 搜索论文 |
| POST | `/papers/` | 上传论文 |
| GET | `/papers/{id}` | 获取论文详情 |
| DELETE | `/papers/{id}` | 删除论文 |

## 默认管理员账号

系统初始化时会自动创建一个管理员账号：

- **用户名**: `admin`
- **密码**: `admin123`
- **邮箱**: `admin@example.com`

## 前端页面

- `/login` - 登录/注册页面
- `/profile` - 个人中心
- `/admin` - 管理员后台（仅管理员可访问）

## 启动方式

### 后端

```bash
cd backend
.venv/bin/python init_admin.py  # 初始化数据库和管理员（首次运行）
.venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 前端

```bash
cd frontend
npm run dev
```

## 技术栈

- **后端**: FastAPI + SQLAlchemy + JWT + bcrypt
- **前端**: React + TypeScript + Ant Design

## 安全特性

- 密码使用bcrypt加密存储
- JWT Token认证，有效期24小时
- 每个用户只能访问自己的论文数据
- 管理员可以管理所有用户数据
