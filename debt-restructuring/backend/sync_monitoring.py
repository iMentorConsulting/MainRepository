"""
Sync monitoring - detect and alert on data integrity issues
"""
import logging
from datetime import datetime, timedelta
from database import SessionLocal
from models import Lead
from sqlalchemy import func

logger = logging.getLogger(__name__)

def check_sync_health():
    """Periodically check for missing/corrupted data"""
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
            logger.warning(f"SYNC ALERT: {len(missing)} rows missing from DB (first 10): {sorted(list(missing))[:10]}")
            return False

        # Check for duplicates in last 24 hours
        yesterday = datetime.now() - timedelta(days=1)
        recent_dups = db.query(Lead.sheet_row_num, func.count().label('cnt')).filter(
            Lead.sheet_row_num != None,
            Lead.created_at >= yesterday
        ).group_by(Lead.sheet_row_num).having(func.count() > 1).count()

        if recent_dups > 0:
            logger.warning(f"SYNC ALERT: {recent_dups} rows have duplicates created in last 24 hours")
            return False

        logger.info(f"Sync health check OK: {len(db_rows)} rows synced, no issues detected")
        return True

    except Exception as e:
        logger.error(f"Sync health check failed: {e}")
        return False
    finally:
        db.close()
