"""
Weighted distribution of NEW leads between consultants.

Admin sets a weight per consultant (AppConfig key `lead_weights`):
    {"enabled": true, "weights": {"STELLA": 40, "VALLIA": 30, "SOFIA": 30},
     "counts": {"STELLA": 0, ...}, "updated_at": "...", "updated_by": "HARIS"}

Weight 0 = the consultant receives no new leads. Weights are relative (40/30/30 == 4/3/3).
The next lead goes to the consultant who is furthest BELOW their share
(lowest counts/weight); ties follow the order STELLA, VALLIA, SOFIA.
`counts` start at 0 every time the admin saves new weights, so a change takes
effect immediately and fairly. Existing leads are never reassigned.

When not configured / disabled, callers keep the previous behaviour.
"""
import json
from datetime import datetime
from typing import Optional

CONSULTANTS = ["STELLA", "VALLIA", "SOFIA"]
KEY = "lead_weights"


def _load(db) -> dict:
    from models import AppConfig
    row = db.query(AppConfig).filter(AppConfig.key == KEY).first()
    if row and row.value:
        try:
            return json.loads(row.value)
        except Exception:
            pass
    return {}


def get_config(db) -> dict:
    cfg = _load(db)
    weights = {c: float((cfg.get("weights") or {}).get(c, 0) or 0) for c in CONSULTANTS}
    counts = {c: int((cfg.get("counts") or {}).get(c, 0) or 0) for c in CONSULTANTS}
    return {
        "enabled": bool(cfg.get("enabled")),
        "weights": weights,
        "counts": counts,
        "updated_at": cfg.get("updated_at"),
        "updated_by": cfg.get("updated_by"),
    }


def save_config(db, enabled: bool, weights: dict, updated_by: str) -> dict:
    from models import AppConfig
    clean = {}
    for c in CONSULTANTS:
        try:
            w = float((weights or {}).get(c, 0) or 0)
        except (TypeError, ValueError):
            raise ValueError(f"Μη έγκυρο βάρος για {c}")
        if w < 0 or w > 100000:
            raise ValueError(f"Μη έγκυρο βάρος για {c}")
        clean[c] = w
    if enabled and sum(clean.values()) <= 0:
        raise ValueError("Τουλάχιστον ένας σύμβουλος πρέπει να έχει βάρος > 0")
    cfg = {
        "enabled": bool(enabled),
        "weights": clean,
        "counts": {c: 0 for c in CONSULTANTS},   # restart the cycle with the new weights
        "updated_at": datetime.utcnow().isoformat(),
        "updated_by": updated_by,
    }
    row = db.query(AppConfig).filter(AppConfig.key == KEY).first()
    if row:
        row.value = json.dumps(cfg)
    else:
        db.add(AppConfig(key=KEY, value=json.dumps(cfg)))
    db.commit()
    return get_config(db)


def pick_next(db) -> Optional[str]:
    """Return the consultant for the next new lead and record it, or None when the feature is off."""
    from models import AppConfig
    cfg = get_config(db)
    if not cfg["enabled"]:
        return None
    eligible = [c for c in CONSULTANTS if cfg["weights"][c] > 0]
    if not eligible:
        return None
    chosen = min(eligible, key=lambda c: (cfg["counts"][c] / cfg["weights"][c], CONSULTANTS.index(c)))
    cfg["counts"][chosen] += 1
    raw = _load(db)
    raw["counts"] = cfg["counts"]
    row = db.query(AppConfig).filter(AppConfig.key == KEY).first()
    row.value = json.dumps(raw)
    db.flush()
    return chosen
