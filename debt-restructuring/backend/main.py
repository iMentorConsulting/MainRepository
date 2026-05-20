from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
import os
from dotenv import load_dotenv

from database import engine, Base
from models import Case, AppConfig
from routers import cases, statistics, public, config

load_dotenv()

app = FastAPI(title="Debt Restructuring API", version="1.0.0")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5174")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables
Base.metadata.create_all(bind=engine)

# Safe migration: add columns if missing
def run_migrations():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN submitted_at DATETIME"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN completed_at DATETIME"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN client_vat VARCHAR"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN portal_active INTEGER DEFAULT 1"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN contact_stage VARCHAR DEFAULT 'Νέα Ανάλυση'"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN last_contacted_at DATETIME"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN reminder_count INTEGER DEFAULT 0"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN commercial_offer TEXT DEFAULT '{}'"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN portal_visit_count INTEGER DEFAULT 0"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN portal_visits TEXT DEFAULT '[]'"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE cases ADD COLUMN stage_changed_at DATETIME"))
            conn.commit()
        except Exception:
            pass

run_migrations()

app.include_router(cases.router)
app.include_router(statistics.router)
app.include_router(public.router)
app.include_router(config.router)


@app.get("/")
def root():
    return {"status": "ok", "app": "Debt Restructuring API"}


@app.get("/health")
def health():
    from database import get_db
    from sqlalchemy import text
    db_ok = False
    case_count = 0
    db_url = os.getenv("DATABASE_URL", "sqlite:///./debt_cases.db")
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM cases"))
            case_count = result.scalar() or 0
            db_ok = True
    except Exception as e:
        pass
    return {
        "status": "healthy" if db_ok else "degraded",
        "db": "ok" if db_ok else "error",
        "case_count": case_count,
        "db_type": "postgres" if db_url.startswith("postgres") else "sqlite",
    }
