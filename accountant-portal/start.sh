#!/bin/sh
set -e

echo ">>> Running prisma db push..."
npx prisma db push --accept-data-loss

echo ">>> Starting Next.js server..."
exec node .next/standalone/server.js
