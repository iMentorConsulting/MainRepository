from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import Case
from typing import Optional, Dict

router = APIRouter(prefix="/analytics", tags=["analytics"])

# Stage definitions for calculations
FINAL_CLOSURE_STAGES = {'Έκλεισε', 'Δεν Ενδιαφέρεται'}
SETTLEMENT_STAGES = {'Αποδοχή Ρύθμισης', 'Απόρριψη Ρύθμισης'}
DRAFT_STAGES = {'Νέα Ανάλυση'}  # Exclude recent/draft entries


@router.get("/pipeline-stats")
def get_pipeline_stats(
    employee: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get real statistics for Sales Pipeline:
    - % Κλεισίματος: (Έκλεισε + Δεν Ενδιαφέρεται) / Total finalized
    - % Αποδοχής Ρύθμισης: Αποδοχή Ρύθμισης / (Αποδοχή + Απόρριψη)

    Excludes draft cases (Νέα Ανάλυση).

    Per-employee breakdown if employee param provided.
    Optional date_from and date_to filters (YYYY-MM-DD format).
    """
    from datetime import datetime

    # Build base query: exclude draft cases
    query = db.query(Case).filter(
        Case.contact_stage != 'Νέα Ανάλυση'
    )

    if employee:
        query = query.filter(Case.employee == employee)

    # Date filtering
    if date_from:
        try:
            df = datetime.fromisoformat(date_from)
            query = query.filter(Case.created_at >= df)
        except:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to)
            query = query.filter(Case.created_at <= dt)
        except:
            pass

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

    # ══ Calculate % Κλεισίματος ══
    # Count cases in final closure stages
    closed_count = query.filter(
        Case.contact_stage == 'Έκλεισε'
    ).count()

    not_interested_count = query.filter(
        Case.contact_stage == 'Δεν Ενδιαφέρεται'
    ).count()

    total_closure = closed_count + not_interested_count
    # % Κλεισίματος = success rate within closed cases (Έκλεισε / (Έκλεισε + Δεν Ενδιαφέρεται))
    closure_percentage = round((closed_count / total_closure * 100), 1) if total_closure > 0 else 0

    # ══ Calculate % Αποδοχής Ρύθμισης ══
    # Count cases with settlement decision
    accepted_count = query.filter(
        Case.contact_stage == 'Αποδοχή Ρύθμισης'
    ).count()

    rejected_count = query.filter(
        Case.contact_stage == 'Απόρριψη Ρύθμισης'
    ).count()

    total_settlement = accepted_count + rejected_count
    settlement_percentage = round((accepted_count / total_settlement * 100), 1) if total_settlement > 0 else 0

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

        # First payment: collected when contact_stage is Έκλεισε or higher
        if case.contact_stage in ['Έκλεισε', 'Αποδοχή Ρύθμισης', 'Απόρριψη Ρύθμισης']:
            first_payment_collected += app_fee

        # Second payment: collected only when Αποδοχή Ρύθμισης (settlement accepted)
        if case.contact_stage == 'Αποδοχή Ρύθμισης':
            second_payment_collected += suc_fee
            completed_status_count += 1

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
        },
        "stage_breakdown": {
            "έκλεισε": closed_count,
            "δεν_ενδιαφέρεται": not_interested_count,
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
    Get statistics breakdown by each employee.
    Returns dict with employee names as keys.
    Optional date_from and date_to filters (YYYY-MM-DD format).
    """
    from datetime import datetime

    # Get all unique employees (exclude HARIS as he's admin)
    employees = db.query(Case.employee).distinct().filter(
        Case.employee != None,
        Case.employee != '',
        Case.employee != 'HARIS'
    ).all()

    result = {}

    for (emp,) in employees:
        if not emp:
            continue

        # Get stats for this employee
        query = db.query(Case).filter(
            Case.employee == emp,
            Case.contact_stage != 'Νέα Ανάλυση'
        )

        # Apply date filtering
        if date_from:
            try:
                df = datetime.fromisoformat(date_from)
                query = query.filter(Case.created_at >= df)
            except:
                pass
        if date_to:
            try:
                dt = datetime.fromisoformat(date_to)
                query = query.filter(Case.created_at <= dt)
            except:
                pass

        total = query.count()

        if total == 0:
            result[emp] = {
                "total_cases": 0,
                "closure_percentage": 0,
                "settlement_acceptance_percentage": 0
            }
            continue

        # Closure stats - success rate within closed cases
        closed = query.filter(Case.contact_stage == 'Έκλεισε').count()
        not_interested = query.filter(Case.contact_stage == 'Δεν Ενδιαφέρεται').count()
        total_closed = closed + not_interested
        closure_pct = round((closed / total_closed * 100), 1) if total_closed > 0 else 0

        # Settlement stats
        accepted = query.filter(Case.contact_stage == 'Αποδοχή Ρύθμισης').count()
        rejected = query.filter(Case.contact_stage == 'Απόρριψη Ρύθμισης').count()
        settlement_pct = round((accepted / (accepted + rejected) * 100), 1) if (accepted + rejected) > 0 else 0

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

            if case.contact_stage in ['Έκλεισε', 'Αποδοχή Ρύθμισης', 'Απόρριψη Ρύθμισης']:
                first_payment += app_fee
            if case.contact_stage == 'Αποδοχή Ρύθμισης':
                second_payment += suc_fee
                completed_count += 1

        result[emp] = {
            "total_cases": total,
            "closure_percentage": closure_pct,
            "settlement_acceptance_percentage": settlement_pct,
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
