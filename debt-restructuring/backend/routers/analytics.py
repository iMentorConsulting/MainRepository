from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import Case
from typing import Optional, Dict
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])

# Stage definitions for calculations
# Pipeline stages (contact_stage field)
FINAL_CLOSURE_STAGES = {'Έκλεισε', 'Δεν Ενδιαφέρεται'}
# Settlement decision stages (status field)
SETTLEMENT_ACCEPTED = 'completed'      # Maps to "Αποδοχή Ρύθμισης" in UI
SETTLEMENT_REJECTED = 'cancelled'      # Maps to "Απορρίψη Ρύθμισης" in UI


@router.get("/pipeline-stats")
def get_pipeline_stats(
    employee: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get real statistics for Sales Pipeline:
    - % Κλεισίματος: Έκλεισε / (Έκλεισε + Δεν Ενδιαφέρεται) — success rate within closed cases
    - % Αποδοχής Ρύθμισης: status='completed' / (status='completed' + status='cancelled') — settlement acceptance rate

    Excludes draft cases (contact_stage = 'Νέα Ανάλυση').

    Per-employee breakdown if employee param provided.
    """

    # Build base query: exclude draft cases
    query = db.query(Case).filter(
        Case.contact_stage != 'Νέα Ανάλυση'
    )

    if employee:
        query = query.filter(Case.employee == employee)

    # Count all non-draft cases
    total_cases = query.count()

    if total_cases == 0:
        return {
            "employee": employee or "all",
            "total_cases": 0,
            "closure_percentage": 0,
            "settlement_acceptance_percentage": 0,
            "closure_count": 0,
            "closure_details": {"closed": 0, "not_interested": 0},
            "settlement_count": 0,
            "settlement_details": {"accepted": 0, "rejected": 0}
        }

    # ══ Calculate % Κλεισίματος (Pipeline success rate) ══
    # Success rate = Έκλεισε / (Έκλεισε + Δεν Ενδιαφέρεται)
    closed_count = query.filter(
        Case.contact_stage == 'Έκλεισε'
    ).count()

    not_interested_count = query.filter(
        Case.contact_stage == 'Δεν Ενδιαφέρεται'
    ).count()

    total_closure = closed_count + not_interested_count
    # Success rate within closed cases only
    closure_percentage = round((closed_count / total_closure * 100), 1) if total_closure > 0 else 0

    # ══ Calculate % Αποδοχής Ρύθμισης (Settlement acceptance rate) ══
    # Acceptance rate = status='completed' / (status='completed' + status='cancelled')
    # Maps to: "Αποδοχή Ρύθμισης" / ("Αποδοχή Ρύθμισης" + "Απόρριψη Ρύθμισης")
    accepted_count = query.filter(
        Case.status == SETTLEMENT_ACCEPTED
    ).count()

    rejected_count = query.filter(
        Case.status == SETTLEMENT_REJECTED
    ).count()

    total_settlement = accepted_count + rejected_count
    settlement_percentage = round((accepted_count / total_settlement * 100), 1) if total_settlement > 0 else 0

    logger.info(f"Pipeline stats - emp: {employee or 'all'}, total: {total_cases}, closed: {closed_count}, "
                f"not_int: {not_interested_count}, accepted: {accepted_count}, rejected: {rejected_count}")

    return {
        "employee": employee or "all",
        "total_cases": total_cases,
        "closure_percentage": closure_percentage,
        "settlement_acceptance_percentage": settlement_percentage,
        "closure_count": total_closure,
        "closure_details": {
            "closed": closed_count,
            "not_interested": not_interested_count
        },
        "settlement_count": total_settlement,
        "settlement_details": {
            "accepted": accepted_count,
            "rejected": rejected_count
        }
    }


@router.get("/pipeline-stats-by-employee")
def get_pipeline_stats_by_employee(db: Session = Depends(get_db)):
    """
    Get statistics breakdown by each employee (excluding HARIS admin).
    Returns dict with employee names as keys.
    Settlement acceptance based on status field (completed vs cancelled).
    """

    # Get all unique employees, excluding HARIS (admin only)
    employees = db.query(Case.employee).distinct().filter(
        Case.employee != None,
        Case.employee != '',
        Case.employee != 'HARIS'
    ).all()

    result = {}

    for (emp,) in employees:
        if not emp:
            continue

        # Get stats for this employee (exclude draft cases)
        query = db.query(Case).filter(
            Case.employee == emp,
            Case.contact_stage != 'Νέα Ανάλυση'
        )

        total = query.count()

        if total == 0:
            result[emp] = {
                "total_cases": 0,
                "closure_percentage": 0,
                "settlement_acceptance_percentage": 0
            }
            continue

        # Closure stats (Pipeline: Έκλεισε vs Δεν Ενδιαφέρεται)
        closed = query.filter(Case.contact_stage == 'Έκλεισε').count()
        not_interested = query.filter(Case.contact_stage == 'Δεν Ενδιαφέρεται').count()
        total_closed = closed + not_interested
        # Success rate = closed / (closed + not_interested)
        closure_pct = round((closed / total_closed * 100), 1) if total_closed > 0 else 0

        # Settlement stats (status: 'completed' = accepted, 'cancelled' = rejected)
        accepted = query.filter(Case.status == SETTLEMENT_ACCEPTED).count()
        rejected = query.filter(Case.status == SETTLEMENT_REJECTED).count()
        total_settlement = accepted + rejected
        settlement_pct = round((accepted / total_settlement * 100), 1) if total_settlement > 0 else 0

        logger.info(f"Per-emp stats - {emp}: total={total}, closed={closed}, not_int={not_interested}, "
                    f"accepted={accepted}, rejected={rejected}")

        result[emp] = {
            "total_cases": total,
            "closure_percentage": closure_pct,
            "closure_count": total_closed,
            "settlement_acceptance_percentage": settlement_pct,
            "settlement_count": total_settlement,
            "closed_count": closed,
            "not_interested_count": not_interested,
            "accepted_count": accepted,
            "rejected_count": rejected
        }

    return result
