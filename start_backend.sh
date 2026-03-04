#!/bin/bash
# 启动后端服务

# 切换到脚本所在目录
cd "$(dirname "$0")"
cd backend

echo "=========================================="
echo "   启动论文管理系统后端"
echo "=========================================="
echo ""

# 激活虚拟环境
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
    echo "✓ 虚拟环境已激活"
else
    echo "✗ 虚拟环境不存在，请先创建"
    exit 1
fi

# 检查依赖
if ! python -c "import fastapi" 2>/dev/null; then
    echo "✗ 依赖未安装，正在安装..."
    pip install -r requirements.txt
fi

echo "✓ 依赖检查完成"
echo ""

# 获取服务器 IP
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "服务器 IP: $SERVER_IP"
echo ""

echo "启动服务..."
echo "本地访问: http://localhost:8000"
echo "远程访问: http://$SERVER_IP:8000"
echo "API 文档: http://$SERVER_IP:8000/docs"
echo ""

# 启动服务（绑定到 0.0.0.0 允许外部访问）
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
