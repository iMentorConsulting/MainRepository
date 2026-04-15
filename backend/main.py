import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from database import Base, engine
from routes import units, bookings, customers, reports, ai_advisor

load_dotenv()

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Σύστημα Διαχείρισης Κρατήσεων",
    description="API διαχείρισης κρατήσεων τουριστικών καταλυμάτων",
    version="1.0.0",
)

frontend_url = os.getenv("FRONTEND_URL", "")
origins = ["http://localhost:5173", "http://localhost:3000"]
if frontend_url:
    origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if frontend_url else ["*"],
    allow_credentials=True,
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
