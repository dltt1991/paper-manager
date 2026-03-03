# 快速启动指南

## 问题诊断

你遇到的 `ERR_CONNECTION_REFUSED` 错误是因为**后端服务没有运行**。

## 解决步骤

### 第 1 步：启动后端（终端 1）

```bash
cd /home/taoguo/work/0.projects/paper-reading/paper-manager
./start_backend.sh
```

或者手动启动：
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**验证后端启动成功：**
```bash
curl http://localhost:8000/health
# 应该返回: {"status":"ok"}
```

### 第 2 步：启动前端（终端 2）

```bash
cd /home/taoguo/work/0.projects/paper-reading/paper-manager
./start_frontend.sh
```

或者手动启动：
```bash
cd frontend
npm run dev
```

### 第 3 步：访问应用

打开浏览器访问：**http://localhost:5173**

## 常见错误排查

### 错误 1: "Backend NOT running on port 8000"

**原因**: 后端服务没有启动

**解决**: 按照第 1 步启动后端

### 错误 2: "Connection refused"

**原因**: 
1. 后端启动了但端口不对
2. 后端启动后崩溃了
3. 后端被防火墙拦截

**解决**:
```bash
# 检查端口占用
lsof -i :8000

# 检查后端进程
ps aux | grep uvicorn

# 重新启动后端
pkill -f uvicorn  # 先停止旧进程
cd backend && source .venv/bin/activate && uvicorn main:app --port 8000
```

### 错误 3: 后端启动后立即崩溃

**查看错误日志**:
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --port 8000
# 查看控制台输出的错误信息
```

## 一键启动脚本

你也可以使用以下命令同时启动前后端（需要两个终端）：

**终端 1:**
```bash
cd /home/taoguo/work/0.projects/paper-reading/paper-manager/backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**终端 2:**
```bash
cd /home/taoguo/work/0.projects/paper-reading/paper-manager/frontend
npm run dev
```

## 验证步骤

1. **后端健康检查**: 访问 http://localhost:8000/health
2. **API 文档**: 访问 http://localhost:8000/docs
3. **前端页面**: 访问 http://localhost:5173

## 网络请求流程

```
浏览器: http://localhost:5173 (前端页面)
    ↓
前端JS: http://localhost:8000/papers (直接调用后端API)
    ↓
后端: http://localhost:8000 (FastAPI服务)
```

**注意**: 现在前端直接连接后端，不经过 Vite 代理。

## 需要同时运行的服务

| 服务 | 端口 | 启动命令 |
|-----|------|---------|
| 后端 API | 8000 | `uvicorn main:app --port 8000` |
| 前端页面 | 5173 | `npm run dev` |

**两个服务都必须同时运行！**
