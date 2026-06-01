import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from database import Base, engine
from routes import units, bookings, customers, reports, ai_advisor
from routes import auth, cleaning, ical, guest, portal_admin

load_dotenv()

# Create all tables (idempotent — new tables are created, existing ones untouched)
Base.metadata.create_all(bind=engine)

# Safe migrations for columns added after initial schema
from sqlalchemy import text as _text
with engine.connect() as _conn:
    try:
        _conn.execute(_text("ALTER TABLE bookings ADD COLUMN is_billed BOOLEAN DEFAULT 0"))
        _conn.commit()
    except Exception:
        pass
    for _table in ['units', 'customers', 'bookings']:
        try:
            _conn.execute(_text(f"ALTER TABLE {_table} ADD COLUMN tenant VARCHAR(50) DEFAULT 'evaivoni'"))
            _conn.commit()
        except Exception:
            pass
    try:
        for _table in ['units', 'customers', 'bookings']:
            _conn.execute(_text(f"UPDATE {_table} SET tenant='evaivoni' WHERE tenant IS NULL OR tenant=''"))
        _conn.commit()
    except Exception:
        pass
    try:
        _conn.execute(_text("ALTER TABLE units ADD COLUMN ical_url VARCHAR(500)"))
        _conn.commit()
    except Exception:
        pass
    try:
        _conn.execute(_text("ALTER TABLE bookings ADD COLUMN ical_uid VARCHAR(200)"))
        _conn.commit()
    except Exception:
        pass
    for _col, _type in [
        ('smtp_host', 'VARCHAR(200)'), ('smtp_port', 'INTEGER DEFAULT 587'),
        ('smtp_user', 'VARCHAR(200)'), ('smtp_pass', 'VARCHAR(200)'),
        ('notification_email', 'VARCHAR(200)'),
    ]:
        try:
            _conn.execute(_text(f"ALTER TABLE guest_portal_settings ADD COLUMN {_col} {_type}"))
            _conn.commit()
        except Exception:
            pass

# Clean up guest photo uploads for bookings that checked out yesterday+
try:
    from routes.portal_admin import cleanup_expired_uploads
    from database import SessionLocal
    _cleanup_db = SessionLocal()
    try:
        cleanup_expired_uploads(_cleanup_db)
    finally:
        _cleanup_db.close()
except Exception:
    pass

# Seed Vie Verde Villas demo data (idempotent — skips if already present)
try:
    from seed_vieverde import seed_vieverde
    from database import SessionLocal as _SL2
    _seed_db = _SL2()
    try:
        seed_vieverde(_seed_db)
    finally:
        _seed_db.close()
except Exception:
    pass

# Generate license keys for all tenants (idempotent)
try:
    from license_manager import get_or_create_license
    from auth_utils import TENANTS
    from database import SessionLocal as _SL3
    _lic_db = _SL3()
    try:
        for _t in TENANTS:
            get_or_create_license(_t, _lic_db)
    finally:
        _lic_db.close()
except Exception:
    pass

app = FastAPI(
    title="Σύστημα Διαχείρισης Κρατήσεων",
    description="API διαχείρισης κρατήσεων τουριστικών καταλυμάτων",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(units.router, prefix="/api")
app.include_router(bookings.router, prefix="/api")
app.include_router(customers.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(ai_advisor.router, prefix="/api")
app.include_router(cleaning.router, prefix="/api")
app.include_router(ical.router, prefix="/api")
app.include_router(guest.router, prefix="/api")
app.include_router(portal_admin.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


# Serve uploaded guest photos
_uploads = os.getenv("UPLOAD_DIR", "/data/uploads")
if os.path.exists(_uploads):
    app.mount("/uploads", StaticFiles(directory=_uploads), name="uploads")

# Serve React frontend — must be last so API routes take priority
_static = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(_static):
    _assets = os.path.join(_static, "assets")
    if os.path.exists(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        return FileResponse(os.path.join(_static, "index.html"))
