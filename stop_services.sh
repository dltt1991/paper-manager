#!/bin/bash

#==========================================
#   停止论文管理系统服务
#==========================================

echo "=========================================="
echo "   停止论文管理系统服务"
echo "=========================================="
echo ""

# 停止占用端口8000的进程（解决"Address already in use"问题）
echo -n "正在检查端口 8000 占用情况... "
PORT_PIDS=$(lsof -t -i :8000 2>/dev/null || netstat -tlnp 2>/dev/null | grep ':8000' | awk '{print $7}' | cut -d'/' -f1 | grep -oP '\d+' | sort -u)
if [ -n "$PORT_PIDS" ]; then
    echo ""
    echo "  发现占用端口 8000 的进程:"
    for PID in $PORT_PIDS; do
        if kill -0 "$PID" 2>/dev/null; then
            CMD=$(ps -p "$PID" -o comm= 2>/dev/null || echo "unknown")
            echo "    - $CMD (PID: $PID)"
            kill -9 "$PID" 2>/dev/null
        fi
    done
    echo "  ✓ 已终止占用进程"
else
    echo "无"
fi

# 切换到脚本所在目录
cd "$(dirname "$0")"

# 从PID文件停止后端服务
if [ -f ".backend.pid" ]; then
    BACKEND_PID=$(cat .backend.pid)
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo -n "正在停止后端服务 (PID: $BACKEND_PID)... "
        kill -9 "$BACKEND_PID" 2>/dev/null
        echo "✓"
    fi
    rm -f .backend.pid
fi

# 从PID文件停止前端服务
if [ -f ".frontend.pid" ]; then
    FRONTEND_PID=$(cat .frontend.pid)
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo -n "正在停止前端服务 (PID: $FRONTEND_PID)... "
        kill -9 "$FRONTEND_PID" 2>/dev/null
        echo "✓"
    fi
    rm -f .frontend.pid
fi

# 停止后端服务 (uvicorn)
echo -n "正在停止后端服务 (uvicorn)... "
UVICORN_PIDS=$(pgrep -f "uvicorn main:app" 2>/dev/null)
if [ -n "$UVICORN_PIDS" ]; then
    echo "$UVICORN_PIDS" | xargs kill -9 2>/dev/null
    echo "✓"
else
    echo "未运行"
fi

# 停止前端服务 (vite)
echo -n "正在停止前端服务 (vite)... "
VITE_PIDS=$(pgrep -f "vite" 2>/dev/null)
if [ -n "$VITE_PIDS" ]; then
    echo "$VITE_PIDS" | xargs kill -9 2>/dev/null
    echo "✓"
else
    echo "未运行"
fi

# 停止 node 进程 (如果有)
echo -n "正在检查其他 node 进程... "
NODE_PIDS=$(pgrep -f "node.*paper-manager" 2>/dev/null)
if [ -n "$NODE_PIDS" ]; then
    echo "$NODE_PIDS" | xargs kill -9 2>/dev/null
    echo "✓"
else
    echo "无"
fi

echo ""
echo "=========================================="
echo "   服务停止完成"
echo "=========================================="

# 显示当前状态
echo ""
echo "当前运行状态:"
RUNNING=$(ps aux | grep -E "(uvicorn|vite)" | grep -v grep | wc -l)
PORT_CHECK=$(lsof -i :8000 2>/dev/null | grep -v COMMAND | wc -l)

if [ "$RUNNING" -eq 0 ] && [ "$PORT_CHECK" -eq 0 ]; then
    echo "  ✓ 所有服务已停止"
    echo "  ✓ 端口 8000 已释放"
else
    if [ "$RUNNING" -gt 0 ]; then
        echo "  ! 仍有 $RUNNING 个进程在运行"
        ps aux | grep -E "(uvicorn|vite)" | grep -v grep | awk '{print "    - " $11 " (PID: " $2 ")"}'
    fi
    if [ "$PORT_CHECK" -gt 0 ]; then
        echo "  ! 端口 8000 仍被占用"
        lsof -i :8000 2>/dev/null | grep -v COMMAND | awk '{print "    - " $1 " (PID: " $2 ")"}'
    fi
fi

echo ""
