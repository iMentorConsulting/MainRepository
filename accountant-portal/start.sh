#!/bin/sh
set -e

echo ">>> Copying static files for standalone..."
cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true

echo ">>> Running prisma db push..."
npx prisma db push --accept-data-loss

echo ">>> Starting Next.js server..."
exec node .next/standalone/server.js
