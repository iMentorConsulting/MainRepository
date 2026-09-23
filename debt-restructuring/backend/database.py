from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import json
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./debt_cases.db")

# Railway (and some Heroku-derived services) emit postgres:// but SQLAlchemy
# requires postgresql:// for the psycopg2 driver.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# ensure_ascii=False keeps Greek (and other non-ASCII) text as literal UTF-8
# characters in JSON columns instead of \uXXXX escapes — otherwise substring
# search (ILIKE) on JSON-stored text (e.g. lead comments) never matches.
engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    json_serializer=lambda obj: json.dumps(obj, ensure_ascii=False),
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
