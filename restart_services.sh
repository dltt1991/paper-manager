#!/bin/bash

#==========================================
#   重启论文管理系统服务
#==========================================

# 切换到脚本所在目录
cd "$(dirname "$0")"

# 获取服务器 IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo "=========================================="
echo "   重启论文管理系统服务"
echo "=========================================="
echo ""
echo "服务器 IP: $SERVER_IP"
echo ""

# 先停止服务
echo "步骤 1/3: 停止现有服务..."
./stop_services.sh > /dev/null 2>&1
sleep 1

# 启动后端
echo ""
echo "步骤 2/3: 启动后端服务..."

# 检查虚拟环境是否存在
if [ ! -f "backend/.venv/bin/activate" ]; then
    echo "  ✗ 后端虚拟环境不存在，请先创建"
    exit 1
fi

cd backend
source .venv/bin/activate
nohup uvicorn main:app --host 0.0.0.0 --port 8000 --reload > backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../.backend.pid
sleep 3

# 检查后端是否启动成功
if curl -s http://localhost:8000/docs > /dev/null 2>&1; then
    echo "  ✓ 后端服务启动成功 (http://localhost:8000)"
else
    echo "  ✗ 后端服务启动失败，请检查日志"
    exit 1
fi

# 启动前端
echo ""
echo "步骤 3/3: 启动前端服务..."
cd ../frontend

# 检查 node_modules 是否存在
if [ ! -d "node_modules" ]; then
    echo "  ! node_modules 不存在，正在安装依赖..."
    npm install
fi

# 设置后端地址（支持跨机器访问）
export VITE_API_BASE_URL="http://$SERVER_IP:8000"
echo "  后端 API 地址: $VITE_API_BASE_URL"

nohup npm run dev -- --host 0.0.0.0 > frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > ../.frontend.pid
sleep 5

# 检查前端是否启动成功
if curl -s http://localhost:5173/ > /dev/null 2>&1; then
    echo "  ✓ 前端服务启动成功 (http://localhost:5173)"
else
    echo "  ✗ 前端服务启动失败，请检查日志"
    exit 1
fi

echo ""
echo "=========================================="
echo "   服务重启完成"
echo "=========================================="
echo ""
echo "访问地址:"
echo "  - 前端本地: http://localhost:5173"
echo "  - 前端远程: http://$SERVER_IP:5173"
echo "  - 后端本地: http://localhost:8000"
echo "  - 后端远程: http://$SERVER_IP:8000"
echo "  - API文档: http://$SERVER_IP:8000/docs"
echo ""
echo "查看日志:"
echo "  - 后端: tail -f backend/backend.log"
echo "  - 前端: tail -f frontend/frontend.log"
echo ""
