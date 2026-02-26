#!/bin/bash
# restart.sh - Restart both backend and frontend services for TCMS 1.5

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"

echo "Restarting TCMS 1.5 Services..."

# Run stop script
bash "$PROJECT_DIR/stop.sh"

# Small delay to ensure ports are freed
sleep 2

# Run start script
bash "$PROJECT_DIR/start.sh"

echo "Restart process completed."
