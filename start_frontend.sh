#!/bin/bash
# 启动前端服务

# 切换到脚本所在目录
cd "$(dirname "$0")"
cd frontend

echo "=========================================="
echo "   启动论文管理系统前端"
echo "=========================================="
echo ""

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "✗ node_modules 不存在，正在安装依赖..."
    npm install
fi

echo "✓ 依赖检查完成"
echo ""

# 获取服务器 IP
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "服务器 IP: $SERVER_IP"
echo ""

# 设置后端地址
export VITE_API_BASE_URL="http://$SERVER_IP:8000"
echo "后端 API 地址: $VITE_API_BASE_URL"
echo ""

echo "启动服务..."
echo "本地访问: http://localhost:5173"
echo "远程访问: http://$SERVER_IP:5173"
echo ""

# 启动服务（--host 0.0.0.0 允许外部访问）
npm run dev -- --host 0.0.0.0
