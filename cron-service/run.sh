#!/bin/sh
echo ">>> Calling process-gemi-emails..."
curl -s -X POST https://logistis.i-mentor.gr/api/cron/process-gemi-emails \
  -H "Authorization: Bearer $CRON_SECRET"
echo ""
echo ">>> Calling onboarding-emails..."
curl -s -X POST https://logistis.i-mentor.gr/api/cron/onboarding-emails \
  -H "Authorization: Bearer $CRON_SECRET"
echo ""
echo ">>> Calling ermis-reminders..."
curl -s https://logistis.i-mentor.gr/api/cron/ermis-reminders \
  -H "Authorization: Bearer $CRON_SECRET"
echo ""
echo ">>> Calling nightly backup (auto mode — no-op if a fresh backup exists)..."
curl -s -X POST "https://logistis.i-mentor.gr/api/cron/backup?auto=1" \
  -H "Authorization: Bearer $CRON_SECRET" \
  --max-time 290
echo ""
echo ">>> Done."
