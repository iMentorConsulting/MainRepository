#!/bin/sh
set -e

# If CRON_MODE=1, just call the email processing endpoint and exit
if [ "$CRON_MODE" = "1" ]; then
  echo ">>> CRON MODE: calling process-gemi-emails..."
  echo ">>> CRON_SECRET set: $([ -n "$CRON_SECRET" ] && echo YES || echo NO)"
  curl -sv -X POST https://logistis.i-mentor.gr/api/cron/process-gemi-emails \
    -H "Authorization: Bearer $CRON_SECRET"
  echo ">>> curl exit: $?"
fi

echo ">>> Running pre-migration script (enum/data fixes)..."
node scripts/pre-migrate.js || echo "Pre-migration skipped (non-fatal)"

echo ">>> Running prisma db push..."
npx prisma db push --accept-data-loss

echo ">>> Resetting admin credentials..."
node scripts/reset-admin.js || echo "Admin reset failed (non-fatal)"

echo ">>> Seeding GEMI email templates..."
node scripts/seed-gemi-templates.js || echo "GEMI template seed skipped (non-fatal)"

echo ">>> Starting Next.js server on port ${PORT:-3000}..."
exec npx next start -p ${PORT:-3000}
