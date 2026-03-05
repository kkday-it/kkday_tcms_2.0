#!/bin/bash
# start.sh - Start both backend and frontend services for TCMS 1.5

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "Starting TCMS Backend Server..."
cd "$BACKEND_DIR"
# Assuming the user has a virtual environment. Use it if exists.
if [ -d ".venv" ]; then
    source .venv/bin/activate
elif [ -d ".test_venv" ]; then
    source .test_venv/bin/activate
fi
nohup uvicorn main:app --host 0.0.0.0 --port 19425 --reload > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend started with PID $BACKEND_PID"

echo "Starting TCMS Frontend Development Server..."
cd "$FRONTEND_DIR"
nohup npm run dev > ../logs/vite_server.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend started with PID $FRONTEND_PID"

echo "TCMS services are starting..."
echo "Backend PID: $BACKEND_PID (Logs in logs/backend.log)"
echo "Frontend PID: $FRONTEND_PID (Logs in logs/vite_server.log)"
echo "Please wait a few seconds for services to fully initialize up."
