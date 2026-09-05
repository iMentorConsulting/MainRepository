#!/bin/bash
set -e

# Party Rooms – Local Development Setup
# Usage: ./start.sh

BACKEND_DIR="$(cd "$(dirname "$0")/backend" && pwd)"
FRONTEND_DIR="$(cd "$(dirname "$0")/frontend" && pwd)"

echo "🎉 Party Rooms – Starting local dev..."

# ── Backend setup ──────────────────────────────────────────────────────────
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo ""
  echo "⚠️  Backend .env not found. Creating from .env.example..."
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  echo "   → Edit party-rooms/backend/.env and set DATABASE_URL + JWT_SECRET"
  echo "   → Then run this script again."
  exit 1
fi

# ── Frontend setup ─────────────────────────────────────────────────────────
if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
  echo "📝 Creating frontend .env.local..."
  echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > "$FRONTEND_DIR/.env.local"
fi

# ── Install dependencies ───────────────────────────────────────────────────
echo ""
echo "📦 Installing backend dependencies..."
cd "$BACKEND_DIR" && npm install

echo "📦 Installing frontend dependencies..."
cd "$FRONTEND_DIR" && npm install

# ── DB Migrate + Generate ──────────────────────────────────────────────────
echo ""
echo "🗄️  Running Prisma migrations..."
cd "$BACKEND_DIR" && npm run db:generate && npm run db:push

# ── Start both in parallel ─────────────────────────────────────────────────
echo ""
echo "🚀 Starting servers..."
echo "   Backend  → http://localhost:4000"
echo "   Frontend → http://localhost:3000"
echo ""

trap 'kill $(jobs -p) 2>/dev/null' EXIT

cd "$BACKEND_DIR" && npm run dev &
cd "$FRONTEND_DIR" && npm run dev &

wait
