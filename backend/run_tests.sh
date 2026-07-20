#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# run_tests.sh
# 一鍵執行 pytest 並產生 / 開啟 Allure Report
#
# 用法：
#   ./run_tests.sh              # 執行全部測試並開啟 report
#   ./run_tests.sh --no-open    # 執行測試但不自動開啟瀏覽器
#   ./run_tests.sh -k "Runs"   # 只跑名稱含 "Runs" 的測試
# ──────────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

VENV=".test_venv"
RESULTS_DIR="allure-results"
REPORT_DIR="allure-report"
OPEN_REPORT=true
EXTRA_ARGS=()

# 解析參數
for arg in "$@"; do
    if [ "$arg" = "--no-open" ]; then
        OPEN_REPORT=false
    else
        EXTRA_ARGS+=("$arg")
    fi
done

# 確認虛擬環境存在
if [ ! -d "$VENV" ]; then
    echo "❌ 找不到 $VENV，請先執行："
    echo "   python3 -m venv $VENV && $VENV/bin/pip install -r requirements.txt pytest pytest-asyncio allure-pytest"
    exit 1
fi

# 確認 Allure CLI 存在
if ! command -v allure &> /dev/null; then
    echo "❌ 找不到 allure CLI，請先安裝："
    echo "   brew install allure"
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🧪  kkday_tcms_2.0 — Unit Test + Allure Report"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 清除舊結果
echo "🗑️  清除舊結果..."
rm -rf "$RESULTS_DIR" "$REPORT_DIR"

# 執行測試
echo "▶  執行 pytest..."
"$VENV/bin/pytest" tests/ -v "${EXTRA_ARGS[@]}" || {
    echo ""
    echo "⚠️  有測試失敗，仍繼續產生 Report..."
}

# 產生 HTML Report
echo ""
echo "📊  產生 Allure Report..."
allure generate "$RESULTS_DIR" -o "$REPORT_DIR" --clean -q

echo ""
echo "✅  Report 已產生：$(pwd)/$REPORT_DIR/index.html"

if [ "$OPEN_REPORT" = true ]; then
    echo "🌐  開啟瀏覽器..."
    allure open "$REPORT_DIR"
else
    echo "💡  手動開啟：allure open $REPORT_DIR"
fi
