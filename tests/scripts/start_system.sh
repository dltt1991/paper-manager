#!/bin/bash
# 启动论文管理系统完整环境

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")/../"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "$SCRIPT_DIR"
echo "$PROJECT_DIR"
echo "$BACKEND_DIR"
echo "$FRONTEND_DIR"

echo "========================================="
echo "   论文管理系统 - 启动脚本"
echo "========================================="
echo ""

# 检查目录
if [ ! -d "$BACKEND_DIR" ]; then
    echo "错误: 找不到后端目录 $BACKEND_DIR"
    exit 1
fi

if [ ! -d "$FRONTEND_DIR" ]; then
    echo "错误: 找不到前端目录 $FRONTEND_DIR"
    exit 1
fi

# 检查端口占用
check_port() {
    if lsof -i :$1 &> /dev/null; then
        echo "错误: 端口 $1 已被占用"
        return 1
    fi
    return 0
}

echo "[1/3] 检查端口..."
check_port 8000 || exit 1
check_port 5173 || exit 1

echo "[2/3] 启动后端服务..."
cd "$BACKEND_DIR"
source .venv/bin/activate

# 后台启动后端
nohup uvicorn main:app --reload --host 0.0.0.0 --port 8000 > "$PROJECT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "后端PID: $BACKEND_PID"

# 等待后端启动
sleep 3

# 检查后端是否启动成功
if curl -s http://localhost:8000/health > /dev/null; then
    echo "✅ 后端服务已启动: http://localhost:8000"
    echo "   API文档: http://localhost:8000/docs"
else
    echo "❌ 后端启动失败，查看日志: $PROJECT_DIR/backend.log"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

echo ""
echo "[3/3] 启动前端服务..."
cd "$FRONTEND_DIR"

# 检查node_modules
if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    if command -v pnpm &> /dev/null; then
        pnpm install
    else
        npm install
    fi
fi

# 后台启动前端
nohup npm run dev > "$PROJECT_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "前端PID: $FRONTEND_PID"

# 等待前端启动
sleep 5

echo ""
echo "========================================="
echo "   ✅ 系统启动成功！"
echo "========================================="
echo ""
echo "访问地址:"
echo "  - 前端应用: http://localhost:5173"
echo "  - 后端API:  http://localhost:8000"
echo "  - API文档:  http://localhost:8000/docs"
echo ""
echo "日志文件:"
echo "  - 后端日志: $PROJECT_DIR/backend.log"
echo "  - 前端日志: $PROJECT_DIR/frontend.log"
echo ""
echo "停止服务:"
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo ""

# 保存PID到文件
echo "$BACKEND_PID" > "$PROJECT_DIR/.backend.pid"
echo "$FRONTEND_PID" > "$PROJECT_DIR/.frontend.pid"

# 捕获Ctrl+C
trap 'echo ""; echo "正在停止服务..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0' INT

# 保持脚本运行
wait
