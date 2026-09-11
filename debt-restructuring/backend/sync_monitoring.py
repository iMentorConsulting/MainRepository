"""
Sync monitoring - detect and alert on data integrity issues
"""
import logging
import os
from datetime import datetime, timedelta
from database import SessionLocal
from models import Lead
from sqlalchemy import func

logger = logging.getLogger(__name__)

def _send_alert_email(subject: str, message: str):
    """Send alert email to admin"""
    try:
        from routers.leads import _send_gmail
        admin_email = os.getenv("ADMIN_EMAIL", "info@i-mentor.gr")
        ok, err = _send_gmail(admin_email, subject, message)
        if not ok:
            logger.error(f"Failed to send alert email: {err}")
        return ok
    except Exception as e:
        logger.error(f"Error sending alert email: {e}")
        return False

def check_sync_health():
    """Periodically check for missing/corrupted data and send email alerts"""
    db = SessionLocal()
    try:
        from sheets_sync import fetch_sheet_rows

        # Get sheet rows
        sheet_rows = set(r['_row_num'] for r in fetch_sheet_rows())

        # Get DB rows
        db_rows = set(
            r[0] for r in db.query(Lead.sheet_row_num)
            .filter(Lead.sheet_row_num != None)
            .distinct()
            .all()
        )

        missing = sheet_rows - db_rows

        if missing:
            missing_list = sorted(list(missing))
            alert_subject = f"🚨 SYNC ALERT: {len(missing)} Missing Leads in Database"
            alert_body = f"""
Data Integrity Alert - Missing Google Sheet Rows

{len(missing)} rows from Google Sheet are NOT in the database:
{missing_list}

First 10: {missing_list[:10]}

Action: The system will automatically re-sync these rows on Sunday at 3am Athens time.
Or manually trigger: POST /leads/cleanup-duplicates

Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S Athens')}
            """
            logger.warning(f"SYNC ALERT: {len(missing)} rows missing from DB")
            _send_alert_email(alert_subject, alert_body)
            return False

        # Check for duplicates in last 24 hours
        yesterday = datetime.now() - timedelta(days=1)
        recent_dups = db.query(Lead.sheet_row_num, func.count().label('cnt')).filter(
            Lead.sheet_row_num != None,
            Lead.created_at >= yesterday
        ).group_by(Lead.sheet_row_num).having(func.count() > 1).count()

        if recent_dups > 0:
            alert_subject = f"🚨 SYNC ALERT: {recent_dups} Duplicate Leads Detected"
            alert_body = f"""
Data Integrity Alert - Duplicate Entries Found

{recent_dups} Google Sheet rows have multiple copies in the database created in the last 24 hours.

This usually indicates a webhook sync race condition.

The system will be monitored closely. You can manually clean duplicates via:
POST /leads/cleanup-duplicates

Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S Athens')}
            """
            logger.warning(f"SYNC ALERT: {recent_dups} rows have duplicates created in last 24 hours")
            _send_alert_email(alert_subject, alert_body)
            return False

        logger.info(f"Sync health check OK: {len(db_rows)} rows synced, no issues detected")
        return True

    except Exception as e:
        logger.error(f"Sync health check failed: {e}")
        alert_subject = "🚨 SYNC ALERT: Health Check Failed"
        alert_body = f"Sync health check encountered an error:\n\n{str(e)}\n\nTime: {datetime.now().strftime('%Y-%m-%d %H:%M:%S Athens')}"
        _send_alert_email(alert_subject, alert_body)
        return False
    finally:
        db.close()
