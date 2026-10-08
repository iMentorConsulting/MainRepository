import json
import os
import re
import statistics
import threading
import uuid
from datetime import date, datetime, timedelta
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import get_tenant
from database import get_db
from models import Booking, ListingRecommendation, ListingSnapshot, TenantSettings, Unit

router = APIRouter(prefix="/listing-optimizer", tags=["listing-optimizer"])

CONFIG_KEY = "listing_optimizer"
APIFY_BASE = "https://api.apify.com/v2/acts"
# Overridable in case a different Apify actor is preferred
AIRBNB_ACTOR = os.getenv("APIFY_AIRBNB_ACTOR", "tri_angle~airbnb-scraper")
BOOKING_ACTOR = os.getenv("APIFY_BOOKING_ACTOR", "voyager~booking-scraper")
CLAUDE_MODEL = os.getenv("LISTING_OPTIMIZER_MODEL", "claude-opus-5-5")

DEFAULT_CONFIG = {
    "enabled": True,
    "search_location": "",
    "adults": 2,
    "platforms": ["airbnb", "booking"],
    "max_periods": 2,      # free periods searched per run — keeps Apify free-tier usage low
    "max_results": 40,     # listings fetched per search
    "lookahead_days": 60,
    "units": {},           # unit_id -> {airbnb_url, booking_url, title, description, highlights}
}

_run_state: dict = {}  # tenant -> {running, started_at, finished_at, error, log[]}


# ── Config ──────────────────────────────────────────────────────────────

def _load_config(db: Session, tenant: str) -> dict:
    row = db.query(TenantSettings).filter(
        TenantSettings.tenant == tenant, TenantSettings.key == CONFIG_KEY
    ).first()
    cfg = dict(DEFAULT_CONFIG)
    if row and row.value:
        try:
            cfg.update(json.loads(row.value))
        except ValueError:
            pass
    return cfg


def _save_config(db: Session, tenant: str, cfg: dict):
    row = db.query(TenantSettings).filter(
        TenantSettings.tenant == tenant, TenantSettings.key == CONFIG_KEY
    ).first()
    if not row:
        row = TenantSettings(tenant=tenant, key=CONFIG_KEY)
        db.add(row)
    row.value = json.dumps(cfg, ensure_ascii=False)
    db.commit()


# ── Free periods ────────────────────────────────────────────────────────

def _free_periods(db: Session, tenant: str, unit_id: int, lookahead: int) -> list:
    """Return [(check_in, check_out)] gaps of ≥2 nights in the next `lookahead` days."""
    start = date.today() + timedelta(days=1)
    end = start + timedelta(days=lookahead)
    bookings = db.query(Booking).filter(
        Booking.tenant == tenant,
        Booking.unit_id == unit_id,
        Booking.status != "cancelled",
        Booking.check_out > start,
        Booking.check_in < end,
    ).order_by(Booking.check_in).all()

    gaps, cur = [], start
    for b in bookings:
        if b.check_in > cur and (b.check_in - cur).days >= 2:
            gaps.append((cur, b.check_in))
        cur = max(cur, b.check_out)
    if (end - cur).days >= 2:
        gaps.append((cur, end))
    # Search at most a week per gap — that is what guests typically search for
    return [(a, min(b, a + timedelta(days=7))) for a, b in gaps]


# ── Apify ───────────────────────────────────────────────────────────────

def _apify_search(platform: str, location: str, check_in: date, check_out: date,
                  adults: int, max_results: int) -> list:
    token = os.getenv("APIFY_TOKEN", "")
    if not token:
        raise RuntimeError("APIFY_TOKEN δεν έχει οριστεί")
    if platform == "airbnb":
        actor = AIRBNB_ACTOR
        payload = {
            "locationQueries": [location],
            "checkIn": check_in.isoformat(),
            "checkOut": check_out.isoformat(),
            "adults": adults,
            "currency": "EUR",
            "locale": "en-US",
            "maxListings": max_results,
        }
    else:
        actor = BOOKING_ACTOR
        payload = {
            "search": location,
            "checkIn": check_in.isoformat(),
            "checkOut": check_out.isoformat(),
            "adults": adults,
            "rooms": 1,
            "currency": "EUR",
            "language": "en-gb",
            "maxItems": max_results,
        }
    resp = requests.post(
        f"{APIFY_BASE}/{actor}/run-sync-get-dataset-items",
        params={"token": token, "timeout": 280},
        json=payload,
        timeout=300,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Apify {platform} {resp.status_code}: {resp.text[:300]}")
    items = resp.json()
    return items[:max_results] if isinstance(items, list) else []


def _num(v) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, dict):
        for k in ("total", "price", "amount", "value", "discountedPrice", "originalPrice", "label"):
            n = _num(v.get(k))
            if n is not None:
                return n
        return None
    m = re.search(r"\d[\d.,]*", str(v))
    if not m:
        return None
    s = m.group(0)
    # Handle both 1,234.56 and 1.234,56
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s or "." in s:
        sep = "," if "," in s else "."
        groups = s.split(sep)
        # Every group after the first being 3 digits means a thousands separator (1.050 / 1,050)
        s = s.replace(sep, "") if all(len(g) == 3 for g in groups[1:]) else s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _normalize(item: dict, platform: str) -> dict:
    rating = item.get("rating")
    reviews = item.get("reviews") or item.get("reviewsCount") or item.get("numberOfReviews")
    if isinstance(rating, dict):
        reviews = reviews or rating.get("reviewsCount")
        rating = rating.get("guestSatisfaction") or rating.get("value") or rating.get("score")
    if isinstance(reviews, list):
        reviews = len(reviews)
    return {
        "url": item.get("url") or item.get("link") or "",
        "name": item.get("name") or item.get("title") or "",
        "price": _num(item.get("price") or item.get("pricing")),
        "rating": _num(rating),
        "reviews": int(_num(reviews) or 0),
        "type": item.get("type") or item.get("roomType") or item.get("propertyType") or "",
        "description": (item.get("description") or "")[:400] if isinstance(item.get("description"), str) else "",
    }


def _listing_key(url: str, platform: str) -> Optional[str]:
    if not url:
        return None
    if platform == "airbnb":
        m = re.search(r"/rooms/(?:plus/)?(\d+)", url)
    else:
        m = re.search(r"/hotel/[a-z]{2}/([^./?]+)", url)
    return m.group(1).lower() if m else None


# ── Claude advice ───────────────────────────────────────────────────────

def _claude_recommendations(unit: Unit, unit_cfg: dict, snapshots: list, location: str) -> list:
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY δεν έχει οριστεί")
    import anthropic

    blocks = []
    for s in snapshots:
        comps = json.loads(s.competitors or "[]")
        rank_txt = f"#{s.rank} από {s.total_results}" if s.rank else f"ΔΕΝ εμφανίζεται στα πρώτα {s.total_results}"
        above = comps[: (s.rank - 1) if s.rank else 8][:8]
        prices = [c["price"] for c in comps if c.get("price")]
        median = round(statistics.median(prices)) if prices else None
        blocks.append(
            f"### {s.platform.upper()} · {s.check_in:%d/%m}–{s.check_out:%d/%m/%Y} "
            f"({(s.check_out - s.check_in).days} νύχτες, {s.adults} ενήλικες)\n"
            f"Θέση μας: {rank_txt}. Δική μας τιμή διαμονής: {s.my_price or 'άγνωστη'} €. "
            f"Διάμεση τιμή αγοράς: {median or 'άγνωστη'} €.\n"
            f"Listings πάνω από εμάς:\n"
            + "\n".join(
                f"- {c['name']} | {c.get('type','')} | τιμή {c.get('price') or '?'}€ | "
                f"βαθμ. {c.get('rating') or '?'} ({c.get('reviews', 0)} κριτικές)"
                + (f" | {c['description'][:160]}" if c.get("description") else "")
                for c in above
            )
        )

    prompt = f"""Είσαι ειδικός σε revenue management και SEO για Airbnb και Booking.com.
Περιοχή αναζήτησης: {location}

ΤΟ ΔΙΚΟ ΜΑΣ LISTING: "{unit.name}" ({unit.type}, έως {unit.capacity} άτομα, βασική τιμή {unit.base_price}€/νύχτα)
Τρέχων τίτλος: {unit_cfg.get('title') or '(δεν δόθηκε)'}
Τρέχουσα περιγραφή: {unit_cfg.get('description') or '(δεν δόθηκε)'}
Δυνατά σημεία / παροχές: {unit_cfg.get('highlights') or '(δεν δόθηκαν)'}

ΔΕΔΟΜΕΝΑ ΑΝΑΖΗΤΗΣΕΩΝ ΓΙΑ ΤΙΣ ΚΕΝΕΣ ΠΕΡΙΟΔΟΥΣ ΜΑΣ:
{chr(10).join(blocks)}

Δώσε 4–8 ΣΥΓΚΕΚΡΙΜΕΝΕΣ ενέργειες για να ανέβουμε στην 1η θέση και να γεμίσουμε αυτές τις ημερομηνίες.
Κάθε ενέργεια πρέπει να αναφέρεται σε συγκεκριμένη πλατφόρμα/ημερομηνίες/αριθμούς από τα δεδομένα
(π.χ. "έκπτωση 12% για 14–19/10 ώστε η τιμή να πέσει στα 640€, κάτω από τη διάμεση 690€").
ΟΧΙ γενικές συμβουλές τύπου "βάλε καλές φωτογραφίες". Όπου προτείνεις νέο τίτλο ή περιγραφή, γράψε
το έτοιμο κείμενο (στα Αγγλικά, όπως εμφανίζεται στους ξένους επισκέπτες) στο suggested_text.

Απάντησε ΜΟΝΟ με JSON array, χωρίς άλλο κείμενο:
[{{"platform":"airbnb|booking|both","check_in":"YYYY-MM-DD ή null","check_out":"YYYY-MM-DD ή null",
"priority":"high|medium|low","category":"price|offer|title|description|photos|amenities|policy|availability|other",
"title":"σύντομος τίτλος στα Ελληνικά","action":"τι ακριβώς να γίνει και γιατί, στα Ελληνικά",
"suggested_text":"έτοιμο κείμενο ή null"}}]"""

    client = anthropic.Anthropic(api_key=api_key)
    msg = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    start, end = text.find("["), text.rfind("]")
    if start < 0 or end < 0:
        raise RuntimeError("Η απάντηση του AI δεν ήταν έγκυρο JSON")
    return json.loads(text[start : end + 1])


def _parse_date(v) -> Optional[date]:
    try:
        return date.fromisoformat(v) if v else None
    except (TypeError, ValueError):
        return None


# ── Run ─────────────────────────────────────────────────────────────────

def run_optimizer(db_factory, tenant: str):
    state = {"running": True, "started_at": datetime.utcnow().isoformat(), "finished_at": None,
             "error": None, "log": []}
    _run_state[tenant] = state
    log = state["log"].append
    db = db_factory()
    try:
        cfg = _load_config(db, tenant)
        location = (cfg.get("search_location") or "").strip()
        if not location:
            raise RuntimeError("Ορίστε περιοχή αναζήτησης στις ρυθμίσεις")
        unit_cfgs = cfg.get("units", {})
        units = [u for u in db.query(Unit).filter(Unit.tenant == tenant, Unit.is_active == True).all()
                 if any(unit_cfgs.get(str(u.id), {}).get(f"{p}_url") for p in cfg["platforms"])]
        if not units:
            raise RuntimeError("Προσθέστε τουλάχιστον ένα link Airbnb/Booking σε μονάδα")

        # Pick the earliest free periods across units, capped to protect the free tier
        periods = {}
        for u in units:
            for p in _free_periods(db, tenant, u.id, int(cfg.get("lookahead_days", 60))):
                periods.setdefault(p, []).append(u)
        chosen = sorted(periods.keys())[: int(cfg.get("max_periods", 2))]
        if not chosen:
            log("Καμία κενή περίοδος ≥2 νυχτών — όλα κλεισμένα!")
            return

        run_id = datetime.utcnow().strftime("%Y%m%d%H%M%S") + "-" + uuid.uuid4().hex[:6]
        snaps_by_unit: dict = {}
        for (ci, co) in chosen:
            for platform in cfg["platforms"]:
                log(f"Αναζήτηση {platform} {ci:%d/%m}–{co:%d/%m}…")
                try:
                    raw = _apify_search(platform, location, ci, co, int(cfg.get("adults", 2)),
                                        int(cfg.get("max_results", 40)))
                    listings = [_normalize(i, platform) for i in raw]
                    err = None
                except Exception as e:
                    listings, err = [], str(e)
                    log(f"  ✗ {e}")

                for u in periods[(ci, co)]:
                    my_url = unit_cfgs.get(str(u.id), {}).get(f"{platform}_url")
                    if not my_url:
                        continue
                    my_key = _listing_key(my_url, platform)
                    rank, mine = None, None
                    for idx, l in enumerate(listings):
                        if my_key and _listing_key(l["url"], platform) == my_key:
                            rank, mine = idx + 1, l
                            break
                    snap = ListingSnapshot(
                        tenant=tenant, run_id=run_id, unit_id=u.id, platform=platform,
                        check_in=ci, check_out=co, search_location=location,
                        adults=int(cfg.get("adults", 2)), rank=rank, total_results=len(listings),
                        my_price=mine["price"] if mine else None,
                        my_rating=mine["rating"] if mine else None,
                        competitors=json.dumps([l for l in listings if l is not mine][:15], ensure_ascii=False),
                        error=err,
                    )
                    db.add(snap)
                    if not err:
                        snaps_by_unit.setdefault(u.id, []).append(snap)
                    log(f"  {u.name}: " + (f"θέση #{rank}/{len(listings)}" if rank else f"εκτός top {len(listings)}"))
        db.commit()

        for u in units:
            snaps = snaps_by_unit.get(u.id)
            if not snaps:
                continue
            log(f"AI ανάλυση για {u.name}…")
            try:
                recs = _claude_recommendations(u, unit_cfgs.get(str(u.id), {}), snaps, location)
            except Exception as e:
                log(f"  ✗ {e}")
                continue
            for r in recs:
                db.add(ListingRecommendation(
                    tenant=tenant, run_id=run_id, unit_id=u.id,
                    platform=r.get("platform"), check_in=_parse_date(r.get("check_in")),
                    check_out=_parse_date(r.get("check_out")),
                    priority=r.get("priority", "medium"), category=r.get("category", "other"),
                    title=(r.get("title") or "Πρόταση")[:300], action=r.get("action"),
                    suggested_text=r.get("suggested_text") or None,
                ))
            db.commit()
            log(f"  ✓ {len(recs)} προτάσεις")
        log("Ολοκληρώθηκε")
    except Exception as e:
        state["error"] = str(e)
        log(f"Σφάλμα: {e}")
    finally:
        state["running"] = False
        state["finished_at"] = datetime.utcnow().isoformat()
        db.close()


def run_all_tenants(db_factory):
    from models import TenantRecord
    db = db_factory()
    try:
        tenants = [t.id for t in db.query(TenantRecord).filter_by(is_active=True).all()]
        active = [t for t in tenants if _load_config(db, t).get("enabled") and _load_config(db, t).get("search_location")]
    finally:
        db.close()
    for t in active:
        print(f"[listing-optimizer] running for {t}")
        run_optimizer(db_factory, t)


# ── API ─────────────────────────────────────────────────────────────────

class ConfigIn(BaseModel):
    enabled: bool = True
    search_location: str = ""
    adults: int = 2
    platforms: list = ["airbnb", "booking"]
    max_periods: int = 2
    max_results: int = 40
    lookahead_days: int = 60
    units: dict = {}


@router.get("/config")
def get_config(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    return {
        **_load_config(db, tenant),
        "apify_configured": bool(os.getenv("APIFY_TOKEN")),
        "ai_configured": bool(os.getenv("ANTHROPIC_API_KEY")),
    }


@router.put("/config")
def put_config(data: ConfigIn, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    cfg = data.model_dump()
    cfg["max_periods"] = max(1, min(cfg["max_periods"], 6))
    cfg["max_results"] = max(10, min(cfg["max_results"], 100))
    cfg["platforms"] = [p for p in cfg["platforms"] if p in ("airbnb", "booking")]
    _save_config(db, tenant, cfg)
    return {"ok": True}


@router.post("/run")
def trigger_run(tenant: str = Depends(get_tenant)):
    if _run_state.get(tenant, {}).get("running"):
        raise HTTPException(status_code=409, detail="Η ανάλυση τρέχει ήδη")
    from database import SessionLocal
    threading.Thread(target=run_optimizer, args=(SessionLocal, tenant), daemon=True).start()
    return {"ok": True}


@router.get("/status")
def run_status(tenant: str = Depends(get_tenant)):
    return _run_state.get(tenant, {"running": False})


def _snap_dict(s: ListingSnapshot) -> dict:
    comps = json.loads(s.competitors or "[]")
    prices = [c["price"] for c in comps if c.get("price")]
    return {
        "id": s.id, "run_id": s.run_id, "unit_id": s.unit_id, "platform": s.platform,
        "check_in": s.check_in.isoformat(), "check_out": s.check_out.isoformat(),
        "rank": s.rank, "total_results": s.total_results, "my_price": s.my_price,
        "my_rating": s.my_rating, "median_price": round(statistics.median(prices)) if prices else None,
        "competitors": comps[:5], "error": s.error, "created_at": s.created_at.isoformat(),
    }


@router.get("/latest")
def latest(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    last = db.query(ListingSnapshot).filter(ListingSnapshot.tenant == tenant) \
        .order_by(ListingSnapshot.id.desc()).first()
    if not last:
        return {"run_id": None, "snapshots": []}
    snaps = db.query(ListingSnapshot).filter(
        ListingSnapshot.tenant == tenant, ListingSnapshot.run_id == last.run_id
    ).all()
    return {"run_id": last.run_id, "created_at": last.created_at.isoformat(),
            "snapshots": [_snap_dict(s) for s in snaps]}


@router.get("/history")
def history(db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    since = datetime.utcnow() - timedelta(days=180)
    rows = db.query(ListingSnapshot).filter(
        ListingSnapshot.tenant == tenant, ListingSnapshot.created_at >= since,
        ListingSnapshot.error.is_(None),
    ).order_by(ListingSnapshot.created_at).all()
    return [{"unit_id": s.unit_id, "platform": s.platform, "rank": s.rank,
             "total_results": s.total_results, "date": s.created_at.date().isoformat()} for s in rows]


@router.get("/recommendations")
def recommendations(status: Optional[str] = None, db: Session = Depends(get_db),
                    tenant: str = Depends(get_tenant)):
    q = db.query(ListingRecommendation).filter(ListingRecommendation.tenant == tenant)
    if status:
        q = q.filter(ListingRecommendation.status == status)
    order = {"high": 0, "medium": 1, "low": 2}
    rows = q.order_by(ListingRecommendation.id.desc()).limit(200).all()
    rows.sort(key=lambda r: (r.status != "open", -int(r.run_id[:14] or 0), order.get(r.priority, 3)))
    return [{
        "id": r.id, "run_id": r.run_id, "unit_id": r.unit_id, "platform": r.platform,
        "check_in": r.check_in.isoformat() if r.check_in else None,
        "check_out": r.check_out.isoformat() if r.check_out else None,
        "priority": r.priority, "category": r.category, "title": r.title, "action": r.action,
        "suggested_text": r.suggested_text, "status": r.status, "created_at": r.created_at.isoformat(),
    } for r in rows]


class StatusIn(BaseModel):
    status: str


@router.patch("/recommendations/{rec_id}")
def set_rec_status(rec_id: int, data: StatusIn, db: Session = Depends(get_db),
                   tenant: str = Depends(get_tenant)):
    if data.status not in ("open", "done", "ignored"):
        raise HTTPException(status_code=400, detail="Μη έγκυρη κατάσταση")
    r = db.query(ListingRecommendation).filter(
        ListingRecommendation.id == rec_id, ListingRecommendation.tenant == tenant
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Δεν βρέθηκε")
    r.status = data.status
    db.commit()
    return {"ok": True}
