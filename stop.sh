#!/bin/bash
# stop.sh - Stop both backend and frontend services for TCMS 1.5

echo "Stopping TCMS Frontend Development Server (vite)..."
pkill -f "vite" 2>/dev/null && echo "Frontend stopped." || echo "No frontend server running."

echo "Stopping TCMS Backend Server (uvicorn)..."
pkill -f "uvicorn main:app" 2>/dev/null && echo "Backend stopped." || echo "No backend server running."

echo "Releasing ports 19425 and 8085..."
for port in 19425 8085; do
    pid=$(lsof -ti :$port 2>/dev/null)
    if [ -n "$pid" ]; then
        kill -9 $pid 2>/dev/null && echo "Killed PID $pid on port $port"
    fi
done

echo "All TCMS services stopped. Ports cleared."
