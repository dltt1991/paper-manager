# 论文管理系统 - 产品需求文档 (PRD)

**版本**: v2.0  
**日期**: 2026-03-03  
**作者**: 产品经理  
**状态**: 已完成

---

## 目录

1. [产品概述](#1-产品概述)
2. [用户故事](#2-用户故事)
3. [功能模块详细设计](#3-功能模块详细设计)
4. [数据库设计](#4-数据库设计)
5. [API接口设计](#5-api接口设计)
6. [页面原型设计](#6-页面原型设计)
7. [非功能性需求](#7-非功能性需求)
8. [项目结构](#8-项目结构)

---

## 1. 产品概述

### 1.1 产品背景

随着学术研究的深入，研究人员和学生们需要管理大量的学术论文。传统的文件管理方式效率低下，难以快速检索、批注和总结论文内容。本产品旨在提供一个集中化的论文管理解决方案，结合AI技术提升学术研究效率。

### 1.2 产品目标

- 提供便捷的论文上传和管理功能
- 支持在线PDF阅读和批注
- 利用AI技术自动生成论文摘要
- 支持多用户管理和权限控制
- 提供翻译功能辅助阅读外文论文
- 构建可搜索、可管理的个人/团队论文知识库

### 1.3 目标用户

| 用户类型 | 描述 | 核心需求 |
|---------|------|---------|
| 学术研究人员 | 从事科研工作的学者 | 论文分类管理、快速检索、批注记录 |
| 研究生/博士生 | 需要阅读大量文献的学生 | 论文摘要、重点标注、笔记整理 |
| 技术从业者 | 跟踪技术发展趋势的工程师 | 快速浏览、AI总结、知识沉淀 |
| 团队管理员 | 管理研究团队的管理员 | 用户管理、权限控制、系统配置 |

### 1.4 技术栈

| 层级 | 技术选型 | 说明 |
|-----|---------|------|
| 后端 | Python FastAPI + SQLite | 轻量级、高性能RESTful API |
| 前端 | React 19 + TypeScript + Ant Design 6 | 类型安全、组件丰富 |
| AI服务 | Kimi API (moonshot) | 中文理解能力强、长文本支持 |
| 翻译 | MyMemory / 有道翻译 | 免费翻译API |
| 存储 | 本地文件系统 | 存储PDF文件 |
| 认证 | JWT Token | 无状态认证 |

---

## 2. 用户故事

### US-001: 上传论文
> 作为一名研究人员，我希望上传PDF论文文件，以便系统帮我管理和归档。

**验收标准**:
- 支持拖拽上传或点击选择PDF文件
- 自动提取PDF元数据（标题、作者等，如可用）
- 上传后自动跳转至论文详情页

### US-002: 通过URL添加论文
> 作为一名用户，我可以通过输入arXiv或其他论文链接来添加论文，省去下载再上传的步骤。

**验收标准**:
- 支持输入论文URL（支持arXiv链接）
- 系统自动下载PDF并保存
- 下载完成后展示论文内容

### US-003: 查看论文列表
> 作为一名用户，我想看到所有已上传论文的概览，快速了解每篇论文的基本信息。

**验收标准**:
- 列表展示：标题、作者、上传时间、AI摘要状态
- 支持按标题、作者、关键词搜索
- 支持按上传时间、标题排序
- 支持按标签筛选
- 支持分页展示

### US-004: 在线阅读论文
> 作为一名用户，我希望能在线阅读PDF论文，无需下载到本地。

**验收标准**:
- 支持PDF在线渲染和浏览
- 支持缩放、翻页等基础操作
- 支持全屏阅读模式
- 支持侧边栏折叠展开

### US-005: 添加高亮批注
> 作为一名研究人员，我需要在论文中高亮重要内容，并添加文字批注。

**验收标准**:
- 支持选中文本添加高亮（8种颜色可选）
- 支持在指定位置添加文本批注
- 批注可在PDF上直观展示
- 点击批注可定位到对应位置
- 支持删除批注

### US-006: AI生成论文摘要
> 作为一名忙碌的研究生，我希望AI能帮我生成论文摘要，快速了解论文核心内容。

**验收标准**:
- 支持一键触发AI摘要生成
- 展示生成状态和进度
- 摘要包含：研究背景、方法、结果、结论
- 支持重新生成摘要

### US-007: 翻译论文内容
> 作为一名研究人员，我希望翻译外文论文的段落，帮助理解内容。

**验收标准**:
- 支持选中文本翻译
- 支持多种翻译引擎（有道、MyMemory）
- 显示翻译结果和翻译引擎来源
- 支持一键复制翻译结果

### US-008: 用户注册和登录
> 作为一名用户，我需要注册账号并登录，保护我的论文数据。

**验收标准**:
- 支持用户注册（用户名、邮箱、密码）
- 支持用户登录（用户名/邮箱 + 密码）
- 支持JWT Token认证
- 登录状态保持7天

### US-009: 用户管理（管理员）
> 作为系统管理员，我需要管理所有用户，控制访问权限。

**验收标准**:
- 支持查看所有用户列表
- 支持启用/禁用用户账号
- 支持设置用户为管理员
- 支持查看用户统计信息

### US-010: 个人设置
> 作为一名用户，我希望配置自己的API密钥和偏好设置。

**验收标准**:
- 支持修改个人信息（昵称、邮箱、头像）
- 支持配置个人Kimi API密钥
- 支持修改密码
- 支持配置翻译API（有道）

---

## 3. 功能模块详细设计

### 3.1 用户管理模块

#### 3.1.1 功能描述

负责用户的注册、登录、权限管理和个人设置。

#### 3.1.2 功能清单

| 功能点 | 优先级 | 描述 |
|-------|-------|------|
| 用户注册 | P0 | 用户名/邮箱/密码注册 |
| 用户登录 | P0 | JWT Token认证登录 |
| 用户列表 | P1 | 管理员查看所有用户 |
| 用户状态管理 | P1 | 启用/禁用用户 |
| 权限管理 | P1 | 设置管理员/普通用户 |
| 个人设置 | P1 | 修改个人信息和密码 |
| API配置 | P2 | 配置个人Kimi/有道API密钥 |

#### 3.1.3 用户角色

| 角色 | 权限 |
|-----|------|
| 管理员 | 所有权限 + 用户管理 |
| 普通用户 | 管理自己的论文、批注、设置 |

### 3.2 论文管理模块

#### 3.2.1 功能描述

核心功能模块，负责论文的增删改查操作。

#### 3.2.2 功能清单

| 功能点 | 优先级 | 描述 |
|-------|-------|------|
| 上传PDF | P0 | 支持本地PDF文件上传 |
| URL添加 | P1 | 通过URL下载PDF |
| 编辑元数据 | P1 | 修改论文标题、作者、标签等 |
| 删除论文 | P1 | 删除论文及相关数据 |
| 搜索过滤 | P1 | 按标题、作者、关键词搜索 |
| 标签筛选 | P1 | 按标签筛选论文 |

#### 3.2.3 业务流程

```
上传论文流程:
1. 用户选择上传方式（文件/URL）
2. 系统接收并保存PDF到存储
3. 系统提取PDF元数据（可选AI提取）
4. 创建论文记录
5. 返回论文详情
```

### 3.3 论文查看模块

#### 3.3.1 功能描述

提供PDF在线预览和阅读功能。

#### 3.3.2 功能清单

| 功能点 | 优先级 | 描述 |
|-------|-------|------|
| PDF渲染 | P0 | 在线渲染PDF内容 |
| 页面导航 | P0 | 翻页、跳转指定页 |
| 缩放控制 | P1 | 放大、缩小、适应宽度 |
| 全屏模式 | P2 | 沉浸式阅读体验 |
| 侧边栏折叠 | P1 | 可拖拽调整侧边栏宽度 |

#### 3.3.3 技术方案

- 使用 `react-pdf` + `PDF.js` 进行PDF渲染
- 后端提供PDF文件流式传输接口
- 支持虚拟滚动优化大文件体验

### 3.4 批注模块

#### 3.4.1 功能描述

支持在PDF上添加高亮和文本批注。

#### 3.4.2 功能清单

| 功能点 | 优先级 | 描述 |
|-------|-------|------|
| 文本高亮 | P0 | 选中文本添加高亮标记 |
| 高亮颜色 | P1 | 支持8种颜色 |
| 文本批注 | P0 | 在指定位置添加文字注释 |
| 批注展示 | P1 | PDF上直观展示批注 |
| 删除批注 | P1 | 删除已添加的批注 |
| 批量清除 | P2 | 按类型批量清除批注 |

#### 3.4.3 数据模型

```typescript
interface Annotation {
  id: number;
  paper_id: number;
  page_number: number;
  type: 'highlight' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  content?: string;
  created_at: string;
  updated_at: string;
}
```

### 3.5 AI摘要模块

#### 3.5.1 功能描述

调用Kimi API对论文进行自动化摘要生成。

#### 3.5.2 功能清单

| 功能点 | 优先级 | 描述 |
|-------|-------|------|
| 触发摘要 | P0 | 手动触发AI摘要生成 |
| 摘要展示 | P0 | 结构化展示摘要内容 |
| 重新生成 | P1 | 支持重新生成摘要 |
| 个人API配置 | P2 | 使用个人Kimi API密钥 |

#### 3.5.3 Kimi API集成方案

```
API端点: https://api.moonshot.cn/v1/chat/completions
模型: moonshot-v1-8k / moonshot-v1-32k / moonshot-v1-128k

Prompt设计:
"请阅读以下论文内容，并生成一份结构化的摘要，包括以下内容：
1. 研究背景与问题
2. 主要贡献
3. 方法概述
4. 主要结果
5. 结论与展望

论文标题：{title}
作者：{authors}

论文内容：{content}

请用中文回答，格式清晰。"
```

### 3.6 翻译模块

#### 3.6.1 功能描述

提供论文内容的翻译功能。

#### 3.6.2 功能清单

| 功能点 | 优先级 | 描述 |
|-------|-------|------|
| 选中文本翻译 | P0 | 选中PDF文本翻译 |
| 多引擎支持 | P1 | 有道翻译、MyMemory |
| 自动选择 | P2 | 优先使用有道，未配置则使用MyMemory |
| 翻译结果展示 | P1 | 弹窗展示原文和译文 |

### 3.7 论文列表模块

#### 3.7.1 功能描述

展示所有论文的概览信息，支持搜索和筛选。

#### 3.7.2 功能清单

| 功能点 | 优先级 | 描述 |
|-------|-------|------|
| 列表展示 | P0 | 表格形式展示论文信息 |
| 搜索功能 | P1 | 按标题、作者、摘要搜索 |
| 排序功能 | P1 | 按创建时间、标题、发表日期排序 |
| 分页加载 | P1 | 支持分页 |
| 标签筛选 | P1 | 左侧边栏标签云筛选 |

---

## 4. 数据库设计

### 4.1 E-R图

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
|    User     |<──────│   Paper     │──────>│ Annotation  │
├─────────────┤  1:N  ├─────────────┤  1:N  ├─────────────┤
│ id          │       │ id          │       │ id          │
│ username    │       │ user_id     │       │ paper_id    │
│ email       │       │ title       │       │ type        │
│ password    │       │ authors     │       │ page_number │
│ is_admin    │       │ file_path   │       │ x, y        │
│ is_active   │       │ keywords    │       │ content     │
│ created_at  │       │ created_at  │       │ created_at  │
└─────────────┘       └─────────────┘       └─────────────┘
```

### 4.2 表结构设计

#### 4.2.1 users 表

```sql
CREATE TABLE users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        VARCHAR(50) NOT NULL UNIQUE,
    email           VARCHAR(100) NOT NULL UNIQUE,
    password        VARCHAR(255) NOT NULL,
    nickname        VARCHAR(100),
    avatar          VARCHAR(500),
    is_active       BOOLEAN DEFAULT 1,
    is_admin        BOOLEAN DEFAULT 0,
    kimi_api_key    VARCHAR(255),
    kimi_base_url   VARCHAR(255),
    kimi_model      VARCHAR(50),
    youdao_app_key  VARCHAR(100),
    youdao_app_secret VARCHAR(100),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 4.2.2 papers 表

```sql
CREATE TABLE papers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    title           VARCHAR(500) NOT NULL,
    authors         VARCHAR(500),
    abstract        TEXT,
    keywords        VARCHAR(500),
    publication_date VARCHAR(50),
    doi             VARCHAR(100),
    url             VARCHAR(1000),
    file_path       VARCHAR(500) NOT NULL,
    file_name       VARCHAR(255),
    file_size       INTEGER,
    page_count      INTEGER,
    ai_summary      TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 4.2.3 annotations 表

```sql
CREATE TABLE annotations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id        INTEGER NOT NULL,
    page_number     INTEGER NOT NULL,
    type            VARCHAR(20) NOT NULL,
    x               REAL NOT NULL,
    y               REAL NOT NULL,
    width           REAL,
    height          REAL,
    color           VARCHAR(20),
    content         TEXT,
    selected_text   TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);
```

---

## 5. API接口设计

### 5.1 接口概览

| 方法 | 路径 | 说明 |
|-----|------|------|
| POST | /auth/register | 用户注册 |
| POST | /auth/login | 用户登录 |
| GET | /auth/me | 获取当前用户信息 |
| GET | /users | 获取用户列表（管理员）|
| PUT | /users/{id} | 更新用户信息 |
| DELETE | /users/{id} | 删除用户 |
| GET | /papers | 获取论文列表 |
| POST | /papers | 上传PDF文件 |
| POST | /papers/url | 通过URL添加论文 |
| GET | /papers/{id} | 获取论文详情 |
| PUT | /papers/{id} | 更新论文信息 |
| DELETE | /papers/{id} | 删除论文 |
| GET | /papers/{id}/pdf | 获取PDF文件 |
| POST | /papers/{id}/summarize | 触发AI摘要 |
| GET | /papers/{id}/annotations | 获取批注列表 |
| POST | /papers/{id}/annotations | 创建批注 |
| DELETE | /annotations/{id} | 删除批注 |
| POST | /translate | 翻译文本 |

### 5.2 认证接口

#### 5.2.1 用户注册

```yaml
POST /auth/register

Request Body:
  {
    "username": "zhangsan",
    "email": "zhangsan@example.com",
    "password": "secure_password"
  }

Response 201:
  {
    "id": 1,
    "username": "zhangsan",
    "email": "zhangsan@example.com",
    "created_at": "2026-03-03T10:00:00Z"
  }
```

#### 5.2.2 用户登录

```yaml
POST /auth/login

Request Body:
  {
    "username": "zhangsan",
    "password": "secure_password"
  }

Response 200:
  {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "bearer",
    "expires_in": 604800,
    "user": {
      "id": 1,
      "username": "zhangsan",
      "email": "zhangsan@example.com",
      "is_admin": false
    }
  }
```

### 5.3 翻译接口

#### 5.3.1 翻译文本

```yaml
POST /translate

Request Body:
  {
    "text": "Hello world",
    "target_lang": "zh",
    "provider": "auto"  // auto, youdao, mymemory
  }

Response 200:
  {
    "translated_text": "你好，世界",
    "provider": "youdao",
    "source_lang": "en"
  }
```

---

## 6. 页面原型设计

### 6.1 页面结构

```
Layout
├── Header (顶部导航)
│   ├── Logo
│   ├── 搜索框
│   ├── 上传按钮
│   └── 用户菜单
├── Main Content
│   ├── / (首页/论文列表)
│   ├── /papers/:id (论文详情)
│   ├── /profile (个人设置)
│   ├── /admin (管理员面板)
│   └── /login (登录页)
└── Footer (可选)
```

### 6.2 论文列表页

**整体布局**: 左侧边栏 + 主内容区
- 左侧边栏 (240px): 标签筛选
- 主内容区 (flex-1): 论文列表表格

**功能**:
- 搜索框：实时搜索标题、作者、摘要
- 排序：创建时间、标题、发表日期
- 标签筛选：按论文标签筛选
- 分页：每页10条

### 6.3 论文详情页

**整体布局**: 可拖拽调整三栏布局
- 左侧 (可折叠, 400px): 论文信息 + AI摘要
- 中央 (flex-1): PDF阅读器
- 分隔条：可拖拽调整宽度

**PDF阅读器功能**:
- 工具栏：缩放控制、页码显示
- 选中文本弹出工具框：翻译、高亮、批注
- 颜色选择器：8种颜色
- 批注渲染：高亮区域、下划线批注

### 6.4 登录/注册页

- 登录表单：用户名/密码
- 注册表单：用户名/邮箱/密码/确认密码
- 表单验证：实时验证

### 6.5 个人设置页

- 基本信息：昵称、邮箱、头像
- 安全设置：修改密码
- API配置：Kimi API密钥、有道翻译配置

### 6.6 管理员面板

- 用户列表：用户名、邮箱、状态、角色
- 用户操作：启用/禁用、设置管理员
- 系统统计：用户数量、论文数量、批注数量

---

## 7. 非功能性需求

### 7.1 性能要求

| 指标 | 目标值 | 说明 |
|-----|-------|------|
| 首屏加载 | < 2s | 列表页首次加载 |
| PDF首屏渲染 | < 3s | 首页PDF渲染完成 |
| 搜索响应 | < 300ms | 输入后结果更新 |
| AI摘要 | < 30s | 单篇论文摘要生成 |
| 翻译响应 | < 3s | 翻译API响应时间 |

### 7.2 安全要求

- 用户密码使用bcrypt加密存储
- JWT Token 7天有效期
- PDF文件类型严格校验
- 文件大小限制（最大50MB）
- API密钥加密存储

### 7.3 兼容性要求

| 浏览器 | 支持版本 |
|-------|---------|
| Chrome | >= 90 |
| Firefox | >= 88 |
| Safari | >= 14 |
| Edge | >= 90 |

---

## 8. 项目结构

```
paper-manager/
├── docs/
│   └── PRD.md
├── backend/
│   ├── app/
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── models/
│   │   ├── routers/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── utils/
│   ├── uploads/
│   ├── .env
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── pages/
│   │   └── types.ts
│   └── package.json
├── papers.db
├── start_backend.sh
├── start_frontend.sh
├── stop_services.sh
├── restart_services.sh
└── README.md
```

---

## 附录

### A. 术语表

| 术语 | 说明 |
|-----|------|
| PDF | Portable Document Format |
| JWT | JSON Web Token |
| API | Application Programming Interface |
| AI | Artificial Intelligence |
| LLM | Large Language Model |
| OCR | Optical Character Recognition |

### B. 参考资源

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)
- [Ant Design](https://ant.design/)
- [Kimi API](https://platform.moonshot.cn/)

---

**文档修订历史**

| 版本 | 日期 | 修改人 | 修改内容 |
|-----|------|-------|---------|
| v1.0 | 2026-02-26 | PM | 初始版本 |
| v2.0 | 2026-03-03 | PM | 增加用户系统、翻译功能、管理面板 |
