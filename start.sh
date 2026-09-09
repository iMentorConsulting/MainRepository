#!/bin/bash
# iMentor Consulting - Case Management App
# Local development startup

set -e

echo "► iMentor Consulting Case Management - Local Dev"

# Backend
echo "► Εγκατάσταση Python dependencies..."
cd backend
pip install -r requirements.txt -q

echo "► Εκκίνηση FastAPI backend (port 8000)..."
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

cd ..

# Frontend
echo "► Εγκατάσταση Node dependencies..."
cd frontend
npm install --silent

echo "► Εκκίνηση React frontend (port 5173)..."
npm run dev &
FRONTEND_PID=$!

cd ..

echo ""
echo "✅ Εκκινήθηκε!"
echo "   App:     http://localhost:5173"
echo "   API:     http://localhost:8000"
echo "   Docs:    http://localhost:8000/docs"
echo ""
echo "Ctrl+C για τερματισμό."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait
