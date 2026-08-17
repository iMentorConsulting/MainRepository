#!/bin/sh
exec curl -sf -X POST https://logistis.i-mentor.gr/api/cron/process-gemi-emails \
  -H "Authorization: Bearer $CRON_SECRET"
