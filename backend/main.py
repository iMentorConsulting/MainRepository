import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from database import Base, engine
from routes import units, bookings, customers, reports, ai_advisor

load_dotenv()

# Create all tables
Base.metadata.create_all(bind=engine)

# Safe migration: add is_billed column if not exists
from sqlalchemy import text as _text
with engine.connect() as _conn:
    try:
        _conn.execute(_text("ALTER TABLE bookings ADD COLUMN is_billed BOOLEAN DEFAULT 0"))
        _conn.commit()
    except Exception:
        pass

app = FastAPI(
    title="Σύστημα Διαχείρισης Κρατήσεων",
    description="API διαχείρισης κρατήσεων τουριστικών καταλυμάτων",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(units.router)
app.include_router(bookings.router)
app.include_router(customers.router)
app.include_router(reports.router)
app.include_router(ai_advisor.router)


@app.get("/")
def root():
    return {"message": "Σύστημα Διαχείρισης Κρατήσεων API v1.0"}


@app.get("/health")
def health():
    return {"status": "ok"}
