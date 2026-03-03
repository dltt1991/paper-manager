#!/bin/bash
# 启动脚本

# 激活虚拟环境
if [ -d ".venv" ]; then
    source .venv/bin/activate
elif [ -d "venv" ]; then
    source venv/bin/activate
fi

# 确保上传目录存在
mkdir -p uploads

# 启动服务
echo "Starting Paper Manager API server..."
uvicorn main:app --reload --host 0.0.0.0 --port 8000