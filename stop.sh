#!/bin/bash
# stop.sh - Stop both backend and frontend services for TCMS 1.5

echo "Stopping TCMS Frontend Development Server (vite)..."
# Find and kill the vite processes (frontend)
pkill -f "vite"
if [ $? -eq 0 ]; then
    echo "Frontend server stopped."
else
    echo "No frontend server running."
fi

echo "Stopping TCMS Backend Server (uvicorn)..."
# Find and kill the uvicorn processes (backend)
pkill -f "uvicorn main:app"
if [ $? -eq 0 ]; then
    echo "Backend server stopped."
else
    echo "No backend server running."
fi

echo "All TCMS services stopped."
