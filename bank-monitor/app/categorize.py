"""Rule-based automatic categorization (keyword match, accent/case-insensitive).

Edit RULES (or drop a categories.json next to the DB in DATA_DIR) to tune it.
First matching rule wins. Manual edits in the UI are never overwritten.
"""
import json
from pathlib import Path

from .parsers import norm

RULES: list[tuple[str, list[str]]] = [
    ("Φόροι / ΑΑΔΕ", ["ΑΑΔΕ", "ΔΟΥ", "ΦΠΑ", "ΦΜΥ", "ΕΝΦΙΑ", "ΤΑΧΙΣ", "ΦΟΡΟΣ ΕΙΣΟΔΗΜΑΤΟΣ", "ΠΑΡΑΚΡΑΤΗΣΗ"]),
    ("Ασφαλιστικές εισφορές", ["ΕΦΚΑ", "E-EFKA", "ΙΚΑ", "ΟΑΕΕ", "ΕΤΑΑ", "ΤΣΜΕΔΕ", "ΑΣΦΑΛΙΣΤΙΚ"]),
    ("Μισθοδοσία", ["ΜΙΣΘΟΔΟΣΙΑ", "ΜΙΣΘΟΣ", "ΑΠΟΔΟΧΕΣ", "PAYROLL", "SALARY"]),
    ("Ενοίκιο", ["ΕΝΟΙΚΙΟ", "ΜΙΣΘΩΜΑ", "RENT"]),
    ("Λογαριασμοί (ΔΕΗ/νερό/τηλ.)", ["ΔΕΗ", "PPC", "HELLENiQ ENERGY", "ΕΥΔΑΠ", "ΕΥΑΘ", "COSMOTE", "VODAFONE", "WIND", "NOVA", "ΟΤΕ", "ΦΥΣΙΚΟ ΑΕΡΙΟ", "ΗΡΩΝ", "PROTERGIA", "ΜΥΤΙΛΗΝΑΙΟΣ"]),
    ("Τραπεζικά έξοδα / τόκοι", ["ΕΞΟΔΑ", "ΕΜΒΑΣΜΑ", "ΠΡΟΜΗΘΕΙΑ ΤΡΑΠΕΖ", "ΤΟΚΟΙ", "ΕΠΙΤΟΚΙ", "ΔΟΣΗ ΔΑΝΕΙΟΥ", "ΔΑΝΕΙΟ", "COMMISSION", "FEES", "FEE "]),
    ("Λογιστικά / Νομικά", ["ΛΟΓΙΣΤ", "ΔΙΚΗΓΟΡ", "ΣΥΜΒΟΛΑΙΟΓΡ"]),
    ("Καύσιμα / Μεταφορές", ["ΚΑΥΣΙΜΑ", "SHELL", "BP ", "EKO", "AVIN", "ΟΔΙΚΑ", "ΔΙΟΔΙΑ", "ΕΓΝΑΤΙΑ", "ΟΛΥΜΠΙΑ ΟΔΟΣ"]),
    ("Λογισμικό / Συνδρομές", ["GOOGLE", "MICROSOFT", "ADOBE", "ZOOM", "ANTHROPIC", "OPENAI", "META ", "FACEBK", "AMAZON WEB", "MOOSEND"]),
]


def load_rules(data_dir: Path | None = None) -> list[tuple[str, list[str]]]:
    if data_dir:
        f = Path(data_dir) / "categories.json"
        if f.exists():
            raw = json.loads(f.read_text(encoding="utf-8"))
            return [(name, list(kws)) for name, kws in raw.items()]
    return RULES


def categorize(description: str, counterparty: str = "", rules=None) -> str:
    haystack = " " + norm(f"{counterparty} {description}") + " "
    for name, keywords in rules or RULES:
        for kw in keywords:
            if norm(kw) in haystack:
                return name
    return ""
