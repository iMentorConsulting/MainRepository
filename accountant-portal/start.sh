#!/bin/sh
set -e

echo ">>> Running pre-migration script (enum/data fixes)..."
node scripts/pre-migrate.js || echo "Pre-migration skipped (non-fatal)"

echo ">>> Running prisma db push..."
npx prisma db push --accept-data-loss

echo ">>> Running prisma db seed (admin password sync)..."
npx prisma db seed || echo "Seed failed (non-fatal)"

echo ">>> Starting Next.js server on port ${PORT:-3000}..."
exec npx next start -p ${PORT:-3000}
