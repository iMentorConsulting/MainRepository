#!/bin/sh
set -e

echo ">>> Running pre-migration script (enum/data fixes)..."
node scripts/pre-migrate.js || echo "Pre-migration skipped (non-fatal)"

echo ">>> Running prisma db push..."
npx prisma db push --accept-data-loss

echo ">>> Resetting admin credentials..."
node scripts/reset-admin.js || echo "Admin reset failed (non-fatal)"

echo ">>> Starting Next.js server on port ${PORT:-3000}..."
exec npx next start -p ${PORT:-3000}
