#!/bin/bash
# =============================================================================
# TCMS 1.5 - Ubuntu 自動安裝腳本
# =============================================================================
# 使用方式：chmod +x setup_ubuntu.sh && sudo ./setup_ubuntu.sh
# =============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_success() { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "請以 root 或 sudo 執行此腳本：sudo ./setup_ubuntu.sh"
    fi
}

# =============================================================================
# 1. 系統套件更新
# =============================================================================
install_system_packages() {
    log_info "更新 apt 套件索引..."
    apt-get update -qq

    log_info "安裝基礎系統工具..."
    apt-get install -y -qq \
        curl \
        wget \
        git \
        build-essential \
        software-properties-common \
        ca-certificates \
        gnupg \
        lsb-release \
        unzip

    log_success "基礎系統工具安裝完成"
}

# =============================================================================
# 2. Python 3.11
# =============================================================================
install_python() {
    log_info "檢查 Python 版本..."

    if command -v python3.11 &> /dev/null; then
        log_success "Python 3.11 已安裝：$(python3.11 --version)"
        return
    fi

    log_info "安裝 Python 3.11..."
    add-apt-repository -y ppa:deadsnakes/ppa > /dev/null 2>&1
    apt-get update -qq
    apt-get install -y -qq \
        python3.11 \
        python3.11-venv \
        python3.11-dev \
        python3-pip

    # 建立 python3 / python 的替代連結（若尚未存在）
    if ! command -v python3 &> /dev/null; then
        update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1
    fi

    log_success "Python 安裝完成：$(python3.11 --version)"
}

# =============================================================================
# 3. Node.js 20
# =============================================================================
install_nodejs() {
    log_info "檢查 Node.js 版本..."

    NODE_MAJOR=20

    if command -v node &> /dev/null; then
        CURRENT_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
        if [ "$CURRENT_MAJOR" -ge "$NODE_MAJOR" ]; then
            log_success "Node.js 已安裝：$(node --version)"
            return
        fi
        log_warn "Node.js 版本過舊 ($(node --version))，將升級至 v${NODE_MAJOR}.x"
    fi

    log_info "安裝 Node.js ${NODE_MAJOR}.x..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs

    log_success "Node.js 安裝完成：$(node --version)  /  npm $(npm --version)"
}

# =============================================================================
# 4. Backend - Python 虛擬環境 + 相依套件
# =============================================================================
setup_backend() {
    log_info "設定 Backend (Python / FastAPI)..."

    cd "$BACKEND_DIR"

    if [ ! -d ".venv" ]; then
        log_info "建立 Python 虛擬環境 .venv ..."
        python3.11 -m venv .venv
    else
        log_warn ".venv 已存在，跳過建立"
    fi

    log_info "安裝 Python 套件（requirements.txt）..."
    .venv/bin/pip install --upgrade pip -q
    .venv/bin/pip install -r requirements.txt -q

    log_info "執行 Alembic 資料庫 migration..."
    mkdir -p "$BACKEND_DIR/data"
    if [ -f "alembic.ini" ]; then
        .venv/bin/alembic upgrade head 2>/dev/null || log_warn "Alembic migration 跳過（可能已是最新）"
    fi

    log_success "Backend 環境設定完成"
    cd "$PROJECT_DIR"
}

# =============================================================================
# 5. Frontend - npm install
# =============================================================================
setup_frontend() {
    log_info "設定 Frontend (React / Vite)..."

    cd "$FRONTEND_DIR"

    log_info "安裝 npm 套件..."
    npm install --silent

    if [ ! -f ".env" ]; then
        log_info "產生 frontend/.env ..."
        cat > .env <<'EOF'
VITE_API_URL=/api/v1
EOF
    else
        log_warn "frontend/.env 已存在，跳過產生"
    fi

    log_success "Frontend 環境設定完成"
    cd "$PROJECT_DIR"
}

# =============================================================================
# 6. 建立 uploads 資料夾
# =============================================================================
setup_directories() {
    log_info "建立必要資料夾..."
    mkdir -p "$BACKEND_DIR/data"
    mkdir -p "$BACKEND_DIR/uploads"
    log_success "資料夾建立完成"
}

# =============================================================================
# 7. 印出完成摘要
# =============================================================================
print_summary() {
    echo ""
    echo -e "${GREEN}============================================================${NC}"
    echo -e "${GREEN}  TCMS 1.5 安裝完成！${NC}"
    echo -e "${GREEN}============================================================${NC}"
    echo ""
    echo -e "  已安裝套件："
    echo -e "    • Python 3.11 + venv"
    echo -e "    • FastAPI / Uvicorn / SQLAlchemy / Alembic / Pydantic"
    echo -e "    • Node.js 20 + npm"
    echo -e "    • React / Vite / TailwindCSS 及所有前端相依套件"
    echo ""
    echo -e "  啟動服務："
    echo -e "    ${YELLOW}cd $PROJECT_DIR${NC}"
    echo -e "    ${YELLOW}./start.sh${NC}"
    echo ""
    echo -e "  服務位址："
    echo -e "    Backend  → http://localhost:19425"
    echo -e "    Frontend → http://localhost:8085"
    echo ""
    echo -e "  若需使用 Docker Compose 啟動："
    echo -e "    ${YELLOW}docker compose up -d${NC}  (與本機模式使用相同 Port)"
    echo ""
}

# =============================================================================
# 主流程
# =============================================================================
main() {
    echo ""
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}  TCMS 1.5 Ubuntu 自動安裝腳本${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo ""

    check_root
    install_system_packages
    install_python
    install_nodejs
    setup_directories
    setup_backend
    setup_frontend
    print_summary
}

main "$@"
