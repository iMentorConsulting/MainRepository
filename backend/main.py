import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from database import Base, engine
from routes import units, bookings, customers, reports, ai_advisor
from routes import auth

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


@app.get("/")
def root():
    return {"message": "Σύστημα Διαχείρισης Κρατήσεων API v2.0"}


@app.get("/health")
def health():
    return {"status": "ok"}
