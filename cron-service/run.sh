#!/bin/sh
echo ">>> Calling process-gemi-emails..."
curl -s -X POST https://logistis.i-mentor.gr/api/cron/process-gemi-emails \
  -H "Authorization: Bearer $CRON_SECRET"
echo ""
echo ">>> Done."
