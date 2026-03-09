#!/bin/bash
#==========================================
#   论文管理系统 - 自动化环境配置脚本
#==========================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_header() {
    echo ""
    echo "=========================================="
    echo "   $1"
    echo "=========================================="
    echo ""
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 检测操作系统
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        echo "windows"
    else
        echo "unknown"
    fi
}

OS=$(detect_os)

# 检查 Python 版本
check_python() {
    print_header "检查 Python 环境"
    
    if command_exists python3; then
        PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
        print_success "找到 Python: $PYTHON_VERSION"
        
        # 检查版本号 >= 3.9
        PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
        PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)
        
        if [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -ge 9 ] || [ "$PYTHON_MAJOR" -gt 3 ]; then
            if [ "$PYTHON_MINOR" -ge 11 ]; then
                print_success "Python 版本符合推荐要求 (>= 3.11)"
            else
                print_warning "Python $PYTHON_VERSION 可以使用，但推荐 >= 3.11 以获得更好性能"
            fi
        else
            print_error "Python 版本过低 (需要 >= 3.9)"
            print_info "请升级 Python: https://www.python.org/downloads/"
            exit 1
        fi
    else
        print_error "未找到 Python3"
        print_info "请安装 Python 3.11+: https://www.python.org/downloads/"
        exit 1
    fi
}

# 检查 Node.js 版本
check_nodejs() {
    print_header "检查 Node.js 环境"
    
    if command_exists node; then
        NODE_VERSION=$(node --version | sed 's/v//')
        print_success "找到 Node.js: $NODE_VERSION"
        
        # 检查版本号 >= 18
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
        if [ "$NODE_MAJOR" -ge 18 ]; then
            print_success "Node.js 版本符合要求 (>= 18)"
        else
            print_warning "Node.js 版本过低 (需要 >= 18)"
            print_info "请升级 Node.js: https://nodejs.org/"
            exit 1
        fi
    else
        print_error "未找到 Node.js"
        print_info "请安装 Node.js 18+: https://nodejs.org/"
        exit 1
    fi
    
    # 检查 npm
    if command_exists npm; then
        NPM_VERSION=$(npm --version)
        print_success "找到 npm: $NPM_VERSION"
    else
        print_error "未找到 npm"
        print_info "请重新安装 Node.js"
        exit 1
    fi
}

# 安装 Python 虚拟环境
setup_python_venv() {
    print_header "配置 Python 虚拟环境"
    
    cd "$BACKEND_DIR"
    
    if [ -d ".venv" ]; then
        print_warning "虚拟环境已存在"
        read -p "是否重新创建? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf .venv
            print_info "重新创建虚拟环境..."
            python3 -m venv .venv
            print_success "虚拟环境创建完成"
        else
            print_info "使用现有虚拟环境"
        fi
    else
        print_info "创建虚拟环境..."
        python3 -m venv .venv
        print_success "虚拟环境创建完成"
    fi
}

# 安装后端依赖
install_backend_deps() {
    print_header "安装后端依赖"
    
    cd "$BACKEND_DIR"
    
    # 激活虚拟环境
    source .venv/bin/activate
    print_success "虚拟环境已激活"
    
    # 升级 pip
    print_info "升级 pip..."
    pip install --upgrade pip
    
    # 检查是否使用 uv
    if command_exists uv; then
        print_info "检测到 uv，使用 uv 安装依赖..."
        uv pip install -r requirements.txt
    else
        print_info "使用 pip 安装依赖..."
        pip install -r requirements.txt
    fi
    
    print_success "后端依赖安装完成"
}

# 配置后端环境变量
setup_backend_env() {
    print_header "配置后端环境变量"
    
    cd "$BACKEND_DIR"
    
    if [ -f ".env" ]; then
        print_warning ".env 文件已存在"
        read -p "是否覆盖? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "保留现有 .env 文件"
            return
        fi
    fi
    
    # 复制示例文件
    cp .env.example .env
    
    # 生成随机密钥
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
    
    # 更新 SECRET_KEY
    if grep -q "SECRET_KEY=" .env; then
        sed -i.bak "s/SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY/" .env && rm -f .env.bak
    else
        echo "SECRET_KEY=$SECRET_KEY" >> .env
    fi
    
    print_success ".env 文件配置完成"
    print_info "生成的 SECRET_KEY: $SECRET_KEY"
    print_warning "提示: 如需配置 Kimi API，请编辑 backend/.env 文件"
}

# 安装前端依赖
install_frontend_deps() {
    print_header "安装前端依赖"
    
    cd "$FRONTEND_DIR"
    
    # 检查 node_modules 是否存在
    if [ -d "node_modules" ]; then
        print_warning "node_modules 已存在"
        read -p "是否重新安装? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf node_modules package-lock.json
            print_info "重新安装依赖..."
        else
            print_info "跳过前端依赖安装"
            return
        fi
    fi
    
    # 使用 pnpm 或 npm
    if command_exists pnpm; then
        print_info "使用 pnpm 安装依赖..."
        pnpm install
    else
        print_info "使用 npm 安装依赖..."
        npm install
    fi
    
    print_success "前端依赖安装完成"
}

# 初始化数据库
init_database() {
    print_header "初始化数据库"
    
    cd "$BACKEND_DIR"
    source .venv/bin/activate
    
    # 运行数据库迁移
    if [ -f "migrate_db.py" ]; then
        print_info "运行数据库迁移..."
        python migrate_db.py
    fi
    
    # 初始化管理员
    if [ -f "init_admin.py" ]; then
        print_info "初始化管理员账号..."
        python init_admin.py || true
    fi
    
    print_success "数据库初始化完成"
}

# 检查端口占用
check_ports() {
    print_header "检查端口占用"
    
    PORTS=("8000" "5173")
    for PORT in "${PORTS[@]}"; do
        if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_warning "端口 $PORT 已被占用"
            print_info "请关闭占用该端口的程序，或使用其他端口"
        else
            print_success "端口 $PORT 可用"
        fi
    done
}

# 显示完成信息
show_completion() {
    print_header "🎉 配置完成！"
    
    echo "项目已配置完成，可以使用以下命令启动服务:"
    echo ""
    echo "  方式 1 - 分别启动（推荐开发使用）:"
    echo "    终端 1: ./start_backend.sh"
    echo "    终端 2: ./start_frontend.sh"
    echo ""
    echo "  方式 2 - 后台启动:"
    echo "    ./restart_services.sh"
    echo ""
    echo "  方式 3 - 手动启动:"
    echo "    后端: cd backend && source .venv/bin/activate && uvicorn main:app --reload"
    echo "    前端: cd frontend && npm run dev"
    echo ""
    echo "访问地址:"
    echo "  - 前端界面: http://localhost:5173"
    echo "  - 后端 API: http://localhost:8000"
    echo "  - API 文档: http://localhost:8000/docs"
    echo ""
    echo "如需配置远程访问，请设置环境变量 SERVER_IP:"
    echo "  export SERVER_IP=192.168.x.x && ./restart_services.sh"
    echo ""
}

# 快速模式（无交互）
quick_setup() {
    print_header "🚀 快速配置模式"
    
    check_python
    check_nodejs
    
    # Python 环境
    cd "$BACKEND_DIR"
    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
        print_success "虚拟环境创建完成"
    fi
    
    source .venv/bin/activate
    pip install --upgrade pip -q
    
    if command_exists uv; then
        uv pip install -r requirements.txt -q
    else
        pip install -r requirements.txt -q
    fi
    print_success "后端依赖安装完成"
    
    # 环境变量
    if [ ! -f ".env" ]; then
        cp .env.example .env
        SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
        if grep -q "SECRET_KEY=" .env 2>/dev/null; then
            sed -i.bak "s/SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY/" .env && rm -f .env.bak
        else
            echo "SECRET_KEY=$SECRET_KEY" >> .env
        fi
        print_success ".env 配置完成"
    fi
    
    # 前端
    cd "$FRONTEND_DIR"
    if [ ! -d "node_modules" ]; then
        if command_exists pnpm; then
            pnpm install
        else
            npm install
        fi
        print_success "前端依赖安装完成"
    fi
    
    check_ports
    show_completion
}

# 主菜单
show_menu() {
    clear
    echo "=========================================="
    echo "   论文管理系统 - 环境配置脚本"
    echo "=========================================="
    echo ""
    echo "  1) 🚀 快速配置 (推荐)"
    echo "  2) 🔧 完整配置 (交互式)"
    echo "  3) 📦 仅安装后端依赖"
    echo "  4) 🎨 仅安装前端依赖"
    echo "  5) 🔄 重新配置环境变量"
    echo "  6) 🗄️  初始化数据库"
    echo "  0) ❌ 退出"
    echo ""
    echo "=========================================="
}

# 完整配置（交互式）
full_setup() {
    print_header "🔧 完整配置模式"
    
    check_python
    check_nodejs
    check_ports
    
    setup_python_venv
    install_backend_deps
    setup_backend_env
    install_frontend_deps
    init_database
    
    show_completion
}

# 主函数
main() {
    cd "$PROJECT_DIR"
    
    # 如果带参数 --quick 或 -q，直接快速配置
    if [[ "$1" == "--quick" ]] || [[ "$1" == "-q" ]]; then
        quick_setup
        exit 0
    fi
    
    # 交互式菜单
    while true; do
        show_menu
        read -p "请选择操作 [0-6]: " choice
        
        case $choice in
            1)
                quick_setup
                read -p "按回车键继续..."
                ;;
            2)
                full_setup
                read -p "按回车键继续..."
                ;;
            3)
                check_python
                setup_python_venv
                install_backend_deps
                setup_backend_env
                read -p "按回车键继续..."
                ;;
            4)
                check_nodejs
                install_frontend_deps
                read -p "按回车键继续..."
                ;;
            5)
                setup_backend_env
                read -p "按回车键继续..."
                ;;
            6)
                init_database
                read -p "按回车键继续..."
                ;;
            0)
                echo "再见!"
                exit 0
                ;;
            *)
                print_error "无效选项，请重新选择"
                sleep 1
                ;;
        esac
    done
}

# 执行主函数
main "$@"
