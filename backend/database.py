from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./booking.db")
# Auto-fix bare file paths (e.g. "/data/booking.db" → "sqlite:////data/booking.db")
if DATABASE_URL and "://" not in DATABASE_URL:
    DATABASE_URL = f"sqlite:///{DATABASE_URL}"

# Ensure the directory exists for file-based SQLite paths
if DATABASE_URL.startswith("sqlite:///") and not DATABASE_URL.startswith("sqlite:////"):
    db_path = DATABASE_URL[len("sqlite:///"):]
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
elif DATABASE_URL.startswith("sqlite:////"):
    db_path = DATABASE_URL[len("sqlite:///"):]
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
