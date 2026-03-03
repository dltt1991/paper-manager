#!/bin/bash
# 运行所有测试脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_DIR/backend"

echo "========================================="
echo "   论文管理系统 - 自动化测试运行脚本"
echo "========================================="
echo ""

# 检查后端目录
if [ ! -d "$BACKEND_DIR" ]; then
    echo "错误: 找不到后端目录 $BACKEND_DIR"
    exit 1
fi

# 检查虚拟环境
if [ ! -d "$BACKEND_DIR/.venv" ]; then
    echo "警告: 虚拟环境不存在，尝试创建..."
    cd "$BACKEND_DIR"
    if command -v uv &> /dev/null; then
        uv venv
    else
        python3 -m venv .venv
    fi
fi

# 激活虚拟环境
echo "[1/4] 激活虚拟环境..."
source "$BACKEND_DIR/.venv/bin/activate"

# 安装依赖
echo "[2/4] 检查并安装依赖..."
cd "$BACKEND_DIR"
pip install -q -r requirements.txt 2>/dev/null || true
pip install -q pytest pytest-asyncio httpx pytest-cov 2>/dev/null || true

# 运行测试
echo "[3/4] 运行自动化测试..."
echo ""
cd "$PROJECT_DIR"

# 运行测试并捕获输出
if python -m pytest tests/test_api.py -v --tb=short --color=yes 2>&1; then
    echo ""
    echo "========================================="
    echo "   ✅ 所有测试通过！"
    echo "========================================="
else
    echo ""
    echo "========================================="
    echo "   ❌ 部分测试失败"
    echo "========================================="
    exit 1
fi

# 生成覆盖率报告（可选）
echo ""
echo "[4/4] 生成覆盖率报告..."
python -m pytest tests/test_api.py --cov=backend/app --cov-report=term --cov-report=html --cov-fail-under=70 2>/dev/null || true

echo ""
echo "测试完成！"
echo "- 详细报告: $PROJECT_DIR/tests/TEST_REPORT.md"
echo "- 覆盖率报告: $PROJECT_DIR/htmlcov/index.html"
