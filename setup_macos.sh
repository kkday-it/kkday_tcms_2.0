#!/bin/bash
# =============================================================================
# TCMS 1.5 - macOS 自動安裝腳本（Homebrew）
# =============================================================================
# 使用方式：chmod +x setup_macos.sh && ./setup_macos.sh
# 注意：不需要 sudo
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

# =============================================================================
# 1. Homebrew
# =============================================================================
check_homebrew() {
    if command -v brew &> /dev/null; then
        log_success "Homebrew 已安裝：$(brew --version | head -1)"
    else
        log_info "安裝 Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        log_success "Homebrew 安裝完成"
    fi
}

# =============================================================================
# 2. Python 3.11+
# =============================================================================
check_python() {
    PYTHON_BIN=""

    for cmd in python3.11 python3.12 python3.13 python3; do
        if command -v "$cmd" &> /dev/null; then
            VER=$("$cmd" -c "import sys; print(sys.version_info.minor)" 2>/dev/null)
            MAJOR=$("$cmd" -c "import sys; print(sys.version_info.major)" 2>/dev/null)
            if [ "$MAJOR" -eq 3 ] && [ "$VER" -ge 11 ]; then
                PYTHON_BIN="$cmd"
                break
            fi
        fi
    done

    if [ -n "$PYTHON_BIN" ]; then
        log_success "Python 已符合需求：$($PYTHON_BIN --version)（使用 $PYTHON_BIN）"
    else
        log_info "安裝 Python 3.11 via Homebrew..."
        brew install python@3.11
        PYTHON_BIN="python3.11"
        log_success "Python 安裝完成：$($PYTHON_BIN --version)"
    fi

    export TCMS_PYTHON="$PYTHON_BIN"
}

# =============================================================================
# 3. Node.js 20+
# =============================================================================
check_nodejs() {
    if command -v node &> /dev/null; then
        NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
        if [ "$NODE_MAJOR" -ge 20 ]; then
            log_success "Node.js 已符合需求：$(node --version)  /  npm $(npm --version)"
            return
        fi
        log_warn "Node.js 版本過舊 ($(node --version))，建議升級至 v20+"
    fi

    log_info "安裝 Node.js 20 via Homebrew..."
    brew install node@20
    brew link node@20 --force --overwrite
    log_success "Node.js 安裝完成：$(node --version)"
}

# =============================================================================
# 4. Backend - Python 虛擬環境 + 相依套件
# =============================================================================
setup_backend() {
    log_info "設定 Backend (Python / FastAPI)..."

    cd "$BACKEND_DIR"

    if [ ! -d ".venv" ]; then
        log_info "建立 Python 虛擬環境 .venv ..."
        "$TCMS_PYTHON" -m venv .venv
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
# 5. Frontend - npm install + .env
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
# 6. 建立必要資料夾
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
    echo -e "  已設定："
    echo -e "    • Python venv + FastAPI / Uvicorn / SQLAlchemy / Alembic"
    echo -e "    • Node.js npm 套件（React / Vite / TailwindCSS）"
    echo -e "    • frontend/.env（VITE_API_URL=/api/v1）"
    echo ""
    echo -e "  啟動服務："
    echo -e "    ${YELLOW}cd $PROJECT_DIR${NC}"
    echo -e "    ${YELLOW}./start.sh${NC}"
    echo ""
    echo -e "  服務位址："
    echo -e "    Backend  → http://localhost:19425"
    echo -e "    Frontend → http://localhost:8085"
    echo ""
}

# =============================================================================
# 主流程
# =============================================================================
main() {
    echo ""
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}  TCMS 1.5 macOS 自動安裝腳本${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo ""

    check_homebrew
    check_python
    check_nodejs
    setup_directories
    setup_backend
    setup_frontend
    print_summary
}

main "$@"
