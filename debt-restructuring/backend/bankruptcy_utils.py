"""Bankruptcy (ΠΤΩΧΕΥΣΗ, ν. 4738/2020 — professionals & legal entities) service helpers."""
from datetime import date, datetime

SERVICE_EXODIKASTIKOS = "ΕΞΩΔΙΚΑΣΤΙΚΟΣ"
SERVICE_BANKRUPTCY = "ΠΤΩΧΕΥΣΗ"

# Operational stages, in order
BANKRUPTCY_STAGES = [
    "Άντληση Στοιχείων",
    "Συγκέντρωση Δικαιολογητικών",
    "Εγγραφή στο Μητρώο Φερεγγυότητας",
    "Κατάθεση σε Δικαστήριο — Αναμονή Απόφασης",
    "Έκδοση Απόφασης",
    "Αναμονή Τριετίας για Απαλλαγή",
]

# Success fee is paid in equal installments every 3 months from the court filing date
SUCCESS_FEE_INSTALLMENTS = 4
SUCCESS_FEE_INTERVAL_MONTHS = 3

DEFAULT_DOCUMENTS = [
    "Φορολογικές δηλώσεις (Ε1, Ε2, Ε3)",
    "Εκκαθαριστικά ΑΑΔΕ",
    "Ε9 (κατάσταση ακινήτων)",
    "Βεβαίωση οφειλών ΑΑΔΕ",
    "Βεβαίωση οφειλών ΕΦΚΑ",
    "Βεβαιώσεις οφειλών τραπεζών / πιστωτών",
    "Αντίγραφα εξοφλητικών / λογαριασμών καταθέσεων",
    "Ταυτότητα / ΑΦΜ",
    "Καταστατικό & ΓΕΜΗ (νομικά πρόσωπα)",
    "Ισολογισμοί / βιβλία (νομικά πρόσωπα)",
]


def default_bankruptcy_data(source_case_id=None) -> dict:
    return {
        "stage": BANKRUPTCY_STAGES[0],
        "stage_changed_at": datetime.utcnow().isoformat(),
        "lawyer": "",
        "court": "",
        "filing_number": "",
        "registry_date": None,      # εγγραφή στο Μητρώο Φερεγγυότητας
        "filing_date": None,        # κατάθεση σε δικαστήριο (YYYY-MM-DD)
        "hearing_dates": [],        # [{date, note}]
        "decision_date": None,      # έκδοση απόφασης (YYYY-MM-DD)
        "decision_type": "",        # "installments" (δόσεις 3ετίας) | "none" | ""
        "primary_home": "",         # κύρια κατοικία / περιουσία — σημειώσεις
        "fee_office": 0,            # αμοιβή γραφείου (εσωτερικό)
        "fee_lawyer": 0,            # αμοιβή δικηγόρου (εσωτερικό)
        "success_fee": 0,
        "documents": [{"label": d, "done": False} for d in DEFAULT_DOCUMENTS],
        "source_case_id": source_case_id,
    }


def add_months(d: date, months: int) -> date:
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    # clamp the day to the length of the target month
    import calendar
    day = min(d.day, calendar.monthrange(y, m)[1])
    return date(y, m, day)


def success_fee_schedule(success_fee, filing_date) -> list:
    """4 equal installments, one every 3 months starting 3 months after the court filing date."""
    if not filing_date or not success_fee:
        return []
    try:
        fd = date.fromisoformat(str(filing_date)[:10])
    except ValueError:
        return []
    total = float(success_fee)
    each = round(total / SUCCESS_FEE_INSTALLMENTS, 2)
    out = []
    for i in range(1, SUCCESS_FEE_INSTALLMENTS + 1):
        amount = each if i < SUCCESS_FEE_INSTALLMENTS else round(total - each * (SUCCESS_FEE_INSTALLMENTS - 1), 2)
        out.append({"n": i, "due": add_months(fd, SUCCESS_FEE_INTERVAL_MONTHS * i).isoformat(), "amount": amount})
    return out


def three_year_end(decision_date) -> str | None:
    """End of the 3-year waiting period, counted from the decision date."""
    if not decision_date:
        return None
    try:
        return add_months(date.fromisoformat(str(decision_date)[:10]), 36).isoformat()
    except ValueError:
        return None
