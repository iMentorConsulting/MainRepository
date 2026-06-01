import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from database import Base, engine
from routes import units, bookings, customers, reports, ai_advisor
from routes import auth, cleaning, ical

load_dotenv()

# Create all tables
Base.metadata.create_all(bind=engine)

# Safe migrations
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

app.include_router(auth.router)
app.include_router(units.router)
app.include_router(bookings.router)
app.include_router(customers.router)
app.include_router(reports.router)
app.include_router(ai_advisor.router)
app.include_router(cleaning.router)
app.include_router(ical.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Serve React frontend — must be last so API routes take priority
_static = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(_static):
    _assets = os.path.join(_static, "assets")
    if os.path.exists(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        return FileResponse(os.path.join(_static, "index.html"))
