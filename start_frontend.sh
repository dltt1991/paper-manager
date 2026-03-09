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

# 获取服务器 IP（优先使用用户指定的 IP）
if [ -n "$SERVER_IP" ]; then
    echo "使用环境变量指定的 IP: $SERVER_IP"
else
    # 尝试多种方式获取本机 IP
    # macOS
    SERVER_IP=$(ifconfig 2>/dev/null | grep "inet " | grep -v "127.0.0.1" | head -1 | awk '{print $2}')
    # Linux
    if [ -z "$SERVER_IP" ]; then
        SERVER_IP=$(ip addr 2>/dev/null | grep "inet " | grep -v "127.0.0.1" | head -1 | awk '{print $2}' | cut -d/ -f1)
    fi
    # fallback
    if [ -z "$SERVER_IP" ]; then
        SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    # 最终 fallback 到 localhost
    if [ -z "$SERVER_IP" ]; then
        SERVER_IP="localhost"
    fi
    echo "自动检测到的 IP: $SERVER_IP"
fi

# 显示所有可用的 IP 地址（方便用户确认）
echo ""
echo "本机所有可用 IP 地址："
if command -v ifconfig &> /dev/null; then
    ifconfig 2>/dev/null | grep "inet " | grep -v "127.0.0.1" | awk '{print "  - " $2}'
elif command -v ip &> /dev/null; then
    ip addr 2>/dev/null | grep "inet " | grep -v "127.0.0.1" | awk '{print "  - " $2}' | cut -d/ -f1
fi
echo "  - 127.0.0.1 (本地)"
echo ""
echo "提示: 如需指定特定 IP，请设置环境变量 SERVER_IP，例如:"
echo "  export SERVER_IP=192.168.1.100 && ./start_frontend.sh"
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
