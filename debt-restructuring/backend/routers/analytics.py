from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
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
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get real statistics for Sales Pipeline:
    - % Κλεισίματος: Έκλεισε / (Έκλεισε + Δεν Ενδιαφέρεται) — success rate within closed cases
    - % Αποδοχής Ρύθμισης: status='completed' / (status='completed' + status='cancelled') — settlement acceptance rate

    Excludes draft cases (contact_stage = 'Νέα Ανάλυση').

    Per-employee breakdown if employee param provided.
    Optional date_from and date_to filters (YYYY-MM-DD format).
    """
    from datetime import datetime, timedelta

    # Build base query: exclude draft cases
    query = db.query(Case).filter(
        Case.contact_stage != 'Νέα Ανάλυση'
    )

    if employee:
        query = query.filter(Case.employee == employee)

    # Apply date filtering if provided (YYYY-MM-DD format)
    if date_from:
        try:
            from_date = datetime.strptime(date_from, '%Y-%m-%d').date()
            query = query.filter(Case.created_at >= from_date)
            logger.info(f"Applied date_from filter: {from_date}")
        except ValueError:
            logger.warning(f"Invalid date_from format: {date_from}")

    if date_to:
        try:
            to_date = datetime.strptime(date_to, '%Y-%m-%d').date()
            # Include entire end date by filtering up to next day
            to_date_end = to_date + timedelta(days=1)
            query = query.filter(Case.created_at < to_date_end)
            logger.info(f"Applied date_to filter: {to_date}")
        except ValueError:
            logger.warning(f"Invalid date_to format: {date_to}")

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
    # Acceptance rate based on contact_stage field
    accepted_count = query.filter(
        Case.contact_stage == 'Αποδοχή Ρύθμισης'
    ).count()

    rejected_count = query.filter(
        Case.contact_stage == 'Απόρριψη Ρύθμισης'
    ).count()

    total_settlement = accepted_count + rejected_count
    settlement_percentage = round((accepted_count / total_settlement * 100), 1) if total_settlement > 0 else 0

    # Count pipeline stages (draft cases already excluded from query)
    nea_analusi_count = query.filter(Case.contact_stage == 'Νέα Ανάλυση').count()
    thetiki_antapokrosi_count = query.filter(Case.contact_stage == 'Θετική Ανταπόκριση').count()
    se_diapragmateusi_count = query.filter(Case.contact_stage == 'Σε Διαπραγμάτευση').count()

    logger.info(f"Pipeline stats - emp: {employee or 'all'}, total: {total_cases}, closed: {closed_count}, "
                f"not_int: {not_interested_count}, accepted: {accepted_count}, rejected: {rejected_count} | "
                f"closure_count: {total_closure}, nea: {nea_analusi_count}, thetiki: {thetiki_antapokrosi_count}, se_diaprag: {se_diapragmateusi_count}")

    # ══ Calculate collected revenue ══
    first_payment_collected = 0  # Application fee
    second_payment_collected = 0  # Success fee
    completed_status_count = 0  # Cases with status='completed' (for 2η πληρωμή)
    earliest_date = None
    latest_date = None

    for case in query:
        offer = case.commercial_offer or {}
        app_fee = float(offer.get('application_fee') or 0)
        suc_fee = float(offer.get('success_fee') or 0)

        # Track date range
        if case.created_at:
            if earliest_date is None or case.created_at < earliest_date:
                earliest_date = case.created_at
            if latest_date is None or case.created_at > latest_date:
                latest_date = case.created_at

        # First payment (1η πληρωμή): collected when contact_stage = Έκλεισε
        if case.contact_stage == 'Έκλεισε':
            first_payment_collected += app_fee

        # Second payment (2η πληρωμή): collected ONLY at Αποδοχή Ρύθμισης (not at Πρόταση Ρύθμισης)
        if case.contact_stage == 'Αποδοχή Ρύθμισης':
            second_payment_collected += suc_fee
            completed_status_count += 1

    # Validation: ensure stage counts sum to total
    stage_sum = thetiki_antapokrosi_count + se_diapragmateusi_count + closed_count + not_interested_count
    if stage_sum != total_cases:
        logger.warning(f"Stage count mismatch for {employee or 'all'}: stages={stage_sum}, total={total_cases}")

    return {
        "employee": employee or "all",
        "total_cases": total_cases,
        "closure_percentage": closure_percentage,
        "settlement_acceptance_percentage": settlement_percentage,
        "closed_count": closed_count,
        "closure_count": total_closure,
        "closure_details": {
            "closed": closed_count,
            "not_interested": not_interested_count
        },
        "settlement_count": total_settlement,
        "settlement_details": {
            "accepted": accepted_count,
            "rejected": rejected_count
        },
        "stage_breakdown": {
            "θετική_ανταπόκριση": thetiki_antapokrosi_count,
            "σε_διαπραγμάτευση": se_diapragmateusi_count,
            "έκλεισε": closed_count,
            "δεν_ενδιαφέρεται": not_interested_count
        },
        "settlement_breakdown": {
            "αποδοχή_ρύθμισης": accepted_count,
            "απόρριψη_ρύθμισης": rejected_count
        },
        "collected_revenue": {
            "first_payment": round(first_payment_collected),
            "second_payment": round(second_payment_collected),
            "second_payment_completed_count": completed_status_count,
            "total": round(first_payment_collected + second_payment_collected)
        },
        "date_range": {
            "earliest": earliest_date.isoformat() if earliest_date else None,
            "latest": latest_date.isoformat() if latest_date else None
        }
    }


@router.get("/pipeline-stats-details")
def get_pipeline_stats_details(
    employee: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get detailed list of cases for a specific stage/employee combo.
    Useful for verifying the statistics calculations.

    stage options: 'έκλεισε', 'δεν_ενδιαφέρεται', 'αποδοχή_ρύθμισης', 'απόρριψη_ρύθμισης'
    """
    query = db.query(Case).filter(Case.contact_stage != 'Νέα Ανάλυση')

    if employee:
        query = query.filter(Case.employee == employee)

    stage_map = {
        'έκλεισε': 'Έκλεισε',
        'δεν_ενδιαφέρεται': 'Δεν Ενδιαφέρεται',
        'αποδοχή_ρύθμισης': 'Αποδοχή Ρύθμισης',
        'απόρριψη_ρύθμισης': 'Απόρριψη Ρύθμισης'
    }

    if stage and stage in stage_map:
        query = query.filter(Case.contact_stage == stage_map[stage])

    cases = query.all()
    return {
        "stage": stage or "all",
        "employee": employee or "all",
        "count": len(cases),
        "cases": [
            {
                "id": c.id,
                "debtor_name": c.debtor_name,
                "employee": c.employee,
                "contact_stage": c.contact_stage,
                "status": c.status,
                "created_at": c.created_at.isoformat() if c.created_at else None
            }
            for c in cases
        ]
    }


@router.get("/pipeline-stats-by-employee")
def get_pipeline_stats_by_employee(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get statistics breakdown by each employee (excluding HARIS admin).
    Returns dict with employee names as keys.
    Settlement acceptance based on status field (completed vs cancelled).
    Optional date_from and date_to filters (YYYY-MM-DD format).
    """
    from datetime import datetime, timedelta

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

        # Apply date filtering if provided (YYYY-MM-DD format)
        if date_from:
            try:
                from_date = datetime.strptime(date_from, '%Y-%m-%d').date()
                query = query.filter(Case.created_at >= from_date)
            except ValueError:
                logger.warning(f"Invalid date_from format: {date_from}")

        if date_to:
            try:
                to_date = datetime.strptime(date_to, '%Y-%m-%d').date()
                to_date_end = to_date + timedelta(days=1)
                query = query.filter(Case.created_at < to_date_end)
            except ValueError:
                logger.warning(f"Invalid date_to format: {date_to}")

        total = query.count()

        if total == 0:
            result[emp] = {
                "total_cases": 0,
                "closure_percentage": 0,
                "settlement_acceptance_percentage": 0
            }
            continue

        # Pipeline stage breakdown (draft cases already excluded from query)
        thetiki_antapokrosi = query.filter(Case.contact_stage == 'Θετική Ανταπόκριση').count()
        se_diapragmateusi = query.filter(Case.contact_stage == 'Σε Διαπραγμάτευση').count()

        # Active cases (Εν Εξελίξει): Άντληση Στοιχείων + Οριστικοποίηση Αίτησης + Πρόταση Ρύθμισης
        active_stages = ['Άντληση Στοιχείων', 'Οριστικοποίηση Αίτησης', 'Πρόταση Ρύθμισης']
        active_cases = query.filter(Case.contact_stage.in_(active_stages)).count()

        # Closure stats (Pipeline: Έκλεισε vs Δεν Ενδιαφέρεται)
        closed = query.filter(Case.contact_stage == 'Έκλεισε').count()
        not_interested = query.filter(Case.contact_stage == 'Δεν Ενδιαφέρεται').count()
        total_closed = closed + not_interested
        # Success rate = closed / (closed + not_interested)
        closure_pct = round((closed / total_closed * 100), 1) if total_closed > 0 else 0

        # Settlement stats (contact_stage: Αποδοχή Ρύθμισης = accepted, Απόρριψη Ρύθμισης = rejected)
        accepted = query.filter(Case.contact_stage == 'Αποδοχή Ρύθμισης').count()
        rejected = query.filter(Case.contact_stage == 'Απόρριψη Ρύθμισης').count()
        total_settlement = accepted + rejected
        settlement_pct = round((accepted / total_settlement * 100), 1) if total_settlement > 0 else 0

        logger.info(f"Per-emp stats - {emp}: total={total}, active={active_cases}, closed={closed}, not_int={not_interested}, "
                    f"accepted={accepted}, rejected={rejected}")

        # Collected revenue for this employee
        first_payment = 0
        second_payment = 0
        completed_count = 0
        earliest = None
        latest = None

        for case in query:
            offer = case.commercial_offer or {}
            app_fee = float(offer.get('application_fee') or 0)
            suc_fee = float(offer.get('success_fee') or 0)

            # Track date range
            if case.created_at:
                if earliest is None or case.created_at < earliest:
                    earliest = case.created_at
                if latest is None or case.created_at > latest:
                    latest = case.created_at

            # First payment (1η πληρωμή): collected when contact_stage = Έκλεισε
            if case.contact_stage == 'Έκλεισε':
                first_payment += app_fee
            # Second payment (2η πληρωμή): collected ONLY at Αποδοχή Ρύθμισης (not at Πρόταση Ρύθμισης)
            if case.contact_stage == 'Αποδοχή Ρύθμισης':
                second_payment += suc_fee
                completed_count += 1

        result[emp] = {
            "total_cases": total,
            "active_cases_count": active_cases,
            "closure_percentage": closure_pct,
            "closure_count": total_closed,
            "settlement_acceptance_percentage": settlement_pct,
            "settlement_count": total_settlement,
            "stage_breakdown": {
                "θετική_ανταπόκριση": thetiki_antapokrosi,
                "σε_διαπραγμάτευση": se_diapragmateusi,
                "έκλεισε": closed,
                "δεν_ενδιαφέρεται": not_interested
            },
            "settlement_breakdown": {
                "αποδοχή_ρύθμισης": accepted,
                "απόρριψη_ρύθμισης": rejected
            },
            "closed_count": closed,
            "not_interested_count": not_interested,
            "accepted_count": accepted,
            "rejected_count": rejected,
            "collected_revenue": {
                "first_payment": round(first_payment),
                "second_payment": round(second_payment),
                "second_payment_completed_count": completed_count,
                "total": round(first_payment + second_payment)
            },
            "date_range": {
                "earliest": earliest.isoformat() if earliest else None,
                "latest": latest.isoformat() if latest else None
            }
        }

    return result
