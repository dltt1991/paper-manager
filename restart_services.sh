#!/bin/bash

#==========================================
#   重启论文管理系统服务
#==========================================

echo "=========================================="
echo "   重启论文管理系统服务"
echo "=========================================="
echo ""

# 先停止服务
echo "步骤 1/3: 停止现有服务..."
./stop_services.sh > /dev/null 2>&1
sleep 1

# 启动后端
echo ""
echo "步骤 2/3: 启动后端服务..."
cd backend
source .venv/bin/activate
nohup uvicorn main:app --host 0.0.0.0 --port 8000 --reload > backend.log 2>&1 &
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
nohup npm run dev -- --host 0.0.0.0 > frontend.log 2>&1 &
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
echo "  - 前端: http://localhost:5173"
echo "  - 后端: http://localhost:8000"
echo "  - API文档: http://localhost:8000/docs"
echo ""
echo "查看日志:"
echo "  - 后端: tail -f backend/backend.log"
echo "  - 前端: tail -f frontend/frontend.log"
echo ""
