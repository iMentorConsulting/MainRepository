#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Starting Debt Restructuring Calculator..."

# Backend
cd backend
pip install -r requirements.txt -q
uvicorn main:app --host 0.0.0.0 --port 8001 --reload &
BACKEND_PID=$!
echo "Backend started on http://localhost:8001 (PID $BACKEND_PID)"

# Frontend
cd ../frontend
npm install --silent
npm run dev &
FRONTEND_PID=$!
echo "Frontend started on http://localhost:5174 (PID $FRONTEND_PID)"

trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

wait
