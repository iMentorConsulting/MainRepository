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
from models import (AvailabilityRule, Booking, ChannelRate, ListingRecommendation, ListingSnapshot,
                    SeasonalRate, TenantSettings, Unit)

router = APIRouter(prefix="/listing-optimizer", tags=["listing-optimizer"])

CONFIG_KEY = "listing_optimizer"
APIFY_BASE = "https://api.apify.com/v2/acts"
# Overridable in case a different Apify actor is preferred
# Airbnb: a scraper that walks the search-result pages of a given URL, so output order = ranking
AIRBNB_ACTOR = os.getenv("APIFY_AIRBNB_ACTOR", "cirkit~airbnb-search-scraper")
BOOKING_ACTOR = os.getenv("APIFY_BOOKING_ACTOR", "voyager~booking-scraper")
CLAUDE_MODEL = os.getenv("LISTING_OPTIMIZER_MODEL", "claude-opus-5-5")
APIFY_API = "https://api.apify.com/v2"
APIFY_MEMORY_MB = int(os.getenv("APIFY_MEMORY_MB", "1024"))
APIFY_TERMINAL = {"SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"}

DEFAULT_CONFIG = {
    "enabled": True,
    "search_location": "",
    "adults": 2,
    "platforms": ["airbnb", "booking"],
    "max_periods": 1,      # free periods searched per run — keeps Apify usage low
    "max_results": 30,     # listings fetched per search
    "max_usd_per_search": 0.30,  # hard Apify spend cap per search
    "max_usd_per_run": 1.00,     # stop launching searches once a run has spent this much
    "run_timeout_sec": 180,      # Apify kills the scraper after this, keeping what it found
    "lookahead_days": 60,
    "luxury_min_nightly": 200,  # €/night: Airbnb min-price filter (× nights) and luxury-segment floor
    "airbnb_filters": {         # mirrors the Airbnb search filters a luxury guest would apply
        "entire_place": True, "min_bedrooms": 3, "min_beds": 3, "min_bathrooms": 3,
        "pool": True, "house": True,
    },
    "airbnb_actor": "",    # empty = AIRBNB_ACTOR default
    "booking_actor": "",
    "units": {},           # unit_id -> {airbnb_url, booking_url, guests, title, description, highlights}
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
            stored = json.loads(row.value)
            if "max_usd_per_search" not in stored:
                # Configs saved before cost caps existed: drop to the safer search volume
                stored.pop("max_periods", None)
                stored.pop("max_results", None)
            if not stored.get("luxury_min_nightly"):
                stored.pop("luxury_min_nightly", None)  # empty/0 from older configs → €200/night default
            cfg.update(stored)
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

def _free_gaps(db: Session, tenant: str, unit_id: int, lookahead: int) -> list:
    """[(start, end)] unbooked stretches in the next `lookahead` days; stop-sales days count as blocked."""
    start = date.today() + timedelta(days=1)
    end = start + timedelta(days=lookahead)
    blocked = []
    for b in db.query(Booking).filter(
        Booking.tenant == tenant, Booking.unit_id == unit_id, Booking.status != "cancelled",
        Booking.check_out > start, Booking.check_in < end,
    ):
        blocked.append((b.check_in, b.check_out))
    for r in db.query(AvailabilityRule).filter(
        AvailabilityRule.tenant == tenant, AvailabilityRule.unit_id == unit_id,
        AvailabilityRule.status == "stop_sales", AvailabilityRule.date >= start, AvailabilityRule.date < end,
    ):
        blocked.append((r.date, r.date + timedelta(days=1)))
    gaps, cur = [], start
    for a, b in sorted(blocked):
        if a > cur:
            gaps.append((cur, a))
        cur = max(cur, b)
    if end > cur:
        gaps.append((cur, end))
    return gaps


def _period_min_stay(ucfg: dict, platform: str, day: date) -> Optional[int]:
    """Min stay from the villa's own platform periods: the shortest matching period wins
    (an exception beats its season); on equal length the later row wins."""
    best = None
    for idx, p in enumerate(ucfg.get("min_stay_periods") or []):
        if p.get("platform", "both") not in ("both", platform) or not p.get("nights"):
            continue
        try:
            start, end = date.fromisoformat(p["from"]), date.fromisoformat(p["to"])
        except (KeyError, TypeError, ValueError):
            continue
        if start <= day <= end:
            key = ((end - start).days, -idx)
            if best is None or key < best[0]:
                best = (key, int(p["nights"]))
    return best[1] if best else None


def _stay_rules(db: Session, tenant: str, unit: Unit, platform: str, day: date, ucfg: dict):
    """(min_stay, checkin_allowed) for a check-in on `day`, as the platform would enforce it."""
    rule = db.query(AvailabilityRule).filter(
        AvailabilityRule.tenant == tenant, AvailabilityRule.unit_id == unit.id, AvailabilityRule.date == day
    ).first()
    checkin_ok = not (rule and rule.checkin_restriction in ("no_checkin", "no_checkinout"))
    override = _period_min_stay(ucfg, platform, day) or ucfg.get(f"{platform}_min_stay")
    if override:
        return int(override), checkin_ok
    if rule and rule.min_stay:
        return int(rule.min_stay), checkin_ok
    vals = [1]
    for sr in db.query(SeasonalRate).filter(
        SeasonalRate.tenant == tenant, SeasonalRate.date_from <= day, SeasonalRate.date_to >= day,
    ):
        if sr.unit_id == unit.id or (sr.unit_id is None and sr.unit_type in (None, "", unit.type)):
            vals.append(sr.min_stay or 1)
    cr = db.query(ChannelRate).filter(
        ChannelRate.tenant == tenant, ChannelRate.unit_id == unit.id,
        ChannelRate.channel == platform, ChannelRate.is_active == True,
    ).first()
    if cr:
        vals.append(cr.min_stay or 1)
    return max(vals), checkin_ok


def _bookable_windows(db: Session, tenant: str, unit: Unit, platform: str, lookahead: int, ucfg: dict):
    """
    Split free gaps into searchable windows (the villa can really appear for them) and gaps that are
    invisible because they are shorter than the minimum stay. Returns (windows, too_short).
    """
    windows, too_short = [], []
    for a, b in _free_gaps(db, tenant, unit.id, lookahead):
        found = None
        s = a
        while (b - s).days >= 1:
            ms, ok = _stay_rules(db, tenant, unit, platform, s, ucfg)
            if ok and (b - s).days >= ms:
                # Typical guest search: up to a week, never shorter than the minimum stay
                n = min((b - s).days, max(ms, 7))
                found = (s, s + timedelta(days=n))
                break
            s += timedelta(days=1)
        if found:
            windows.append(found)
        else:
            too_short.append((a, b, _stay_rules(db, tenant, unit, platform, a, ucfg)[0]))
    return windows, too_short


# ── Apify ───────────────────────────────────────────────────────────────

def _search_url(platform: str, location: str, check_in: date, check_out: date, guests: int,
                cfg: Optional[dict] = None) -> str:
    """The exact search a guest would run — sent to the scraper and shown for manual checking."""
    from urllib.parse import quote, urlencode
    cfg = cfg or {}
    if platform == "airbnb":
        slug = "--".join(part.strip().replace(" ", "-") for part in location.split(","))
        nights = (check_out - check_in).days
        f = {**DEFAULT_CONFIG["airbnb_filters"], **(cfg.get("airbnb_filters") or {})}
        q = [("checkin", check_in.isoformat()), ("checkout", check_out.isoformat()),
             ("adults", guests), ("query", location), ("currency", "EUR"), ("locale", "en")]
        if f.get("entire_place"):
            q.append(("room_types[]", "Entire home/apt"))
        min_nightly = float(cfg.get("luxury_min_nightly") or 0)
        if min_nightly:
            # Airbnb's price filter is the total trip price, so the floor scales with the stay length
            q += [("price_min", int(min_nightly * nights)), ("price_filter_input_type", 2),
                  ("price_filter_num_nights", nights)]
        for key in ("min_bedrooms", "min_beds", "min_bathrooms"):
            if f.get(key):
                q.append((key, int(f[key])))
        if f.get("pool"):
            q.append(("amenities[]", 7))            # Airbnb amenity id: Pool
        if f.get("house"):
            q.append(("l2_property_type_ids[]", 1))  # Airbnb property type id: House
        return f"https://www.airbnb.com/s/{quote(slug)}/homes?" + urlencode(q)
    return "https://www.booking.com/searchresults.en-gb.html?" + urlencode({
        "ss": location, "checkin": check_in.isoformat(), "checkout": check_out.isoformat(),
        "group_adults": guests, "no_rooms": 1, "group_children": 0,
        "selected_currency": "EUR", "order": "popularity",
    })


def _apify_search(platform: str, location: str, check_in: date, check_out: date,
                  adults: int, max_results: int, max_usd: float, timeout_sec: int, actor: str = "",
                  cfg: Optional[dict] = None):
    """Run an Apify actor with hard time/memory/spend caps. Returns (items, cost_usd)."""
    import time
    token = os.getenv("APIFY_TOKEN", "")
    if not token:
        raise RuntimeError("APIFY_TOKEN δεν έχει οριστεί")
    url = _search_url(platform, location, check_in, check_out, adults, cfg)
    if platform == "airbnb":
        actor = actor or AIRBNB_ACTOR
        # Search-URL scrapers name this field differently; unknown keys are ignored by Apify actors
        payload = {
            "startUrls": [{"url": url}],
            "searchUrls": [url],
            "urls": [url],
            "searchUrl": url,
            "checkIn": check_in.isoformat(),
            "checkOut": check_out.isoformat(),
            "adults": adults,
            "currency": "EUR",
            "maxItems": max_results,
            "maxListings": max_results,
            "maxResults": max_results,
        }
    else:
        actor = actor or BOOKING_ACTOR
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
    # Caps enforced by Apify itself, regardless of what the actor's own input honours
    params = {
        "token": token,
        "timeout": timeout_sec,
        "memory": APIFY_MEMORY_MB,
        "maxItems": max_results,
        "maxTotalChargeUsd": max_usd,
        "waitForFinish": 60,
    }
    resp = requests.post(f"{APIFY_API}/acts/{actor}/runs", params=params, json=payload, timeout=90)
    if resp.status_code >= 400:
        raise RuntimeError(f"Apify {platform} {resp.status_code}: {resp.text[:300]}")
    run = resp.json()["data"]
    deadline = time.time() + timeout_sec + 120
    while run.get("status") not in APIFY_TERMINAL and time.time() < deadline:
        r = requests.get(f"{APIFY_API}/actor-runs/{run['id']}",
                         params={"token": token, "waitForFinish": 60}, timeout=90)
        r.raise_for_status()
        run = r.json()["data"]
    if run.get("status") not in APIFY_TERMINAL:
        # Safety net: never leave a scraper running on the account
        requests.post(f"{APIFY_API}/actor-runs/{run['id']}/abort", params={"token": token}, timeout=30)
    items = requests.get(f"{APIFY_API}/datasets/{run['defaultDatasetId']}/items",
                         params={"token": token, "clean": "true", "limit": max_results, "format": "json"},
                         timeout=90).json()
    cost = float(run.get("usageTotalUsd") or 0)
    if not isinstance(items, list) or (not items and run.get("status") != "SUCCEEDED"):
        raise RuntimeError(f"Apify {platform}: {run.get('status')} χωρίς αποτελέσματα (κόστος ${cost:.2f})")
    return items[:max_results], cost


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


LUX_SIGNALS = {
    "private pool": ("private pool", "ιδιωτική πισίνα", "piscina privata"),
    "pool": ("pool", "πισίνα"),
    "heated pool": ("heated",),
    "infinity pool": ("infinity",),
    "sea view": ("sea view", "seaview", "ocean view", "θέα θάλασσα"),
    "beachfront": ("beachfront", "beach front", "on the beach", "παραλία"),
    "jacuzzi": ("jacuzzi", "hot tub", "whirlpool"),
    "chef": ("chef",),
    "spa/sauna": ("spa", "sauna", "hammam"),
    "gym": ("gym", "fitness"),
    "luxury": ("luxury", "luxurious", "πολυτελ"),
    "villa": ("villa", "βίλα"),
}
SIMILAR_MARGIN = 5  # score points within which a listing counts as comparable


def _flatten_text(v) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        return " ".join(_flatten_text(x) for x in v.values())
    if isinstance(v, (list, tuple)):
        return " ".join(_flatten_text(x) for x in v)
    return str(v)


def _word_match(word: str, text: str) -> bool:
    # Latin words need whole-word matching ("village" must not count as "villa"); Greek stems match as prefixes
    if word.isascii():
        return re.search(rf"\b{re.escape(word)}(s|es)?\b", text) is not None
    return word in text


def _signals(text: str) -> list:
    t = text.lower()
    return [k for k, words in LUX_SIGNALS.items() if any(_word_match(w, t) for w in words)]


def _quality(l: dict) -> int:
    """Holistic 0–100 quality score: rating, review volume, luxury features, host/property status."""
    import math
    r = l.get("rating")
    rating_n = (r / 5 if r <= 5 else r / 10) if r else 0.85
    reviews_n = min(1.0, math.log10((l.get("reviews") or 0) + 1) / 2.3)
    sig = set(l.get("signals") or [])
    feature_n = min(1.0, len(sig - {"villa", "luxury"}) / 4 + (0.15 if "villa" in sig else 0) + (0.1 if "luxury" in sig else 0))
    status_n = 1.0 if l.get("superhost") or (l.get("stars") or 0) >= 4 else 0.0
    return round(40 * rating_n + 15 * reviews_n + 30 * feature_n + 15 * status_n)


def _normalize(item: dict, platform: str) -> dict:
    rating = item.get("rating")
    reviews = item.get("reviews") or item.get("reviewsCount") or item.get("numberOfReviews")
    if isinstance(rating, dict):
        reviews = reviews or rating.get("reviewsCount")
        rating = rating.get("guestSatisfaction") or rating.get("value") or rating.get("score")
    if isinstance(reviews, list):
        reviews = len(reviews)
    host = item.get("host") if isinstance(item.get("host"), dict) else {}
    feature_text = " ".join(_flatten_text(item.get(k)) for k in (
        "name", "title", "subDescription", "description", "amenities", "facilities",
        "highlights", "roomType", "propertyType", "type"))
    photos = item.get("images") or item.get("photos")
    out = {
        "url": item.get("url") or item.get("link") or "",
        "name": item.get("name") or item.get("title") or "",
        "price": _num(item.get("price") or item.get("pricing")),
        "rating": _num(rating),
        "reviews": int(_num(reviews) or 0),
        "type": item.get("type") or item.get("roomType") or item.get("propertyType") or "",
        "description": (item.get("description") or "")[:400] if isinstance(item.get("description"), str) else "",
        "signals": _signals(feature_text),
        "superhost": bool(item.get("isSuperHost") or item.get("isSuperhost") or host.get("isSuperHost")
                          or item.get("isGuestFavorite") or item.get("guestFavorite")),
        "stars": _num(item.get("stars")),
        "capacity": _num(item.get("personCapacity") or item.get("maxGuests") or item.get("persons")),
        "photos": len(photos) if isinstance(photos, list) else None,
        "search_position": _num(item.get("position") or item.get("rank") or item.get("searchPosition")
                                or item.get("searchRank") or item.get("order")),
    }
    out["score"] = _quality(out)
    return out


def _order_listings(listings: list, platform: str) -> list:
    """Search order: the scraper's explicit position when it reports one, else output order; drop duplicates."""
    if any(l.get("search_position") for l in listings):
        listings = sorted(listings, key=lambda l: l.get("search_position") or 10 ** 6)
    seen, out = set(), []
    for l in listings:
        k = _listing_key(l.get("url", ""), platform) or l.get("url") or l.get("name")
        if k in seen:
            continue
        seen.add(k)
        out.append(l)
    return out


def _listing_key(url: str, platform: str) -> Optional[str]:
    if not url:
        return None
    if platform == "airbnb":
        m = re.search(r"/rooms/(?:plus/)?(\d+)", url)
    else:
        m = re.search(r"/hotel/[a-z]{2}/([^./?]+)", url)
    return m.group(1).lower() if m else None


def _tier(score: int, mine: int) -> str:
    if score >= mine + SIMILAR_MARGIN:
        return "superior"
    if score >= mine - SIMILAR_MARGIN:
        return "comparable"
    return "inferior"


def _better_cheaper(comps: list, my_rank: Optional[int]) -> list:
    """Comparable-or-better listings that rank above us AND are cheaper — the only case a price cut is justified."""
    me = next((c for c in comps if c.get("mine")), None)
    if not me:
        return []
    my_price = me.get("price") or me.get("est_price")
    if not my_price:
        return []
    return [c for c in comps if not c.get("mine") and c.get("price") and c["price"] < my_price
            and _tier(c.get("score", 0), me.get("score", 0)) != "inferior"
            and (my_rank is None or (c.get("position") or 999) < my_rank)]


def _segment_rank(comps: list, nights: int, min_nightly: float, my_price: Optional[float]):
    """Rank among comparable luxury listings only (price ≥ floor). Returns (rank, total) or (None, None)."""
    if not comps or not any(c.get("mine") and c.get("position") for c in comps):
        return None, None
    floor = (min_nightly * nights) if min_nightly else (my_price * 0.6 if my_price else None)
    if not floor:
        return None, None
    seg = [c for c in comps if c.get("mine") or (c.get("price") or 0) >= floor]
    rank = next(i + 1 for i, c in enumerate(seg) if c.get("mine"))
    return rank, len(seg)


# ── Claude advice ───────────────────────────────────────────────────────

def _claude_recommendations(unit: Unit, unit_cfg: dict, snapshots: list, location: str,
                            min_nightly: float = 0) -> list:
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY δεν έχει οριστεί")
    import anthropic

    blocks = []
    for s in snapshots:
        comps = json.loads(s.competitors or "[]")
        nights = (s.check_out - s.check_in).days
        rank_txt = f"#{s.rank} από {s.total_results}" if s.rank else f"ΔΕΝ εμφανίζεται στα πρώτα {s.total_results}"
        lux_rank, lux_total = _segment_rank(comps, nights, min_nightly, s.my_price)
        others = [c for c in comps if not c.get("mine")]
        me = next((c for c in comps if c.get("mine")), {})
        my_score = me.get("score", 0)
        above = [c for c in others if s.rank and (c.get("position") or 999) < s.rank][:10] or others[:8]
        bc = _better_cheaper(comps, s.rank)
        my_total = s.my_price or me.get("est_price")
        blocks.append(
            f"### {s.platform.upper()} · {s.check_in:%d/%m}–{s.check_out:%d/%m/%Y} "
            f"({nights} νύχτες, {s.adults} ενήλικες)\n"
            f"Θέση μας: {rank_txt}"
            + (f" · στα luxury listings: #{lux_rank} από {lux_total}" if lux_rank else "")
            + f". Δική μας τιμή διαμονής: {my_total or 'άγνωστη'} €. Δικό μας quality score: {my_score}/100 "
            f"(χαρακτηριστικά: {', '.join(me.get('signals') or []) or '—'}).\n"
            + (f"ΙΣΑΞΙΑ/ΑΝΩΤΕΡΑ ΚΑΙ ΦΘΗΝΟΤΕΡΑ ΠΟΥ ΜΑΣ ΞΕΠΕΡΝΟΥΝ: "
               + "; ".join(f"#{c.get('position')} {c['name']} {round(c['price'])}€ (score {c.get('score')})" for c in bc)
               + "\n" if bc else "Κανένα ισάξιο/ανώτερο φθηνότερο listing δεν μας ξεπερνά → ΟΧΙ μείωση τιμής.\n")
            + f"Listings πάνω από εμάς (με τη σειρά της αναζήτησης):\n"
            + "\n".join(
                f"- #{c.get('position', '?')} {c['name']} | {_tier(c.get('score', 0), my_score).upper()} "
                f"(score {c.get('score')}) | {c.get('type','')} | τιμή {c.get('price') or '?'}€ | "
                f"βαθμ. {c.get('rating') or '?'} ({c.get('reviews', 0)} κριτικές) | "
                f"{', '.join(c.get('signals') or []) or '—'}"
                + (" | Superhost/Guest fav." if c.get("superhost") else "")
                + (f" | {c['description'][:160]}" if c.get("description") else "")
                for c in above
            )
        )

    prompt = f"""Είσαι ειδικός στον αλγόριθμο κατάταξης του Airbnb και του Booking.com για LUXURY καταλύματα.
Περιοχή αναζήτησης: {location}

ΤΟ ΔΙΚΟ ΜΑΣ LISTING: "{unit.name}" ({unit.type}, έως {unit.capacity} άτομα, βασική τιμή {unit.base_price}€/νύχτα)
Τρέχων τίτλος: {unit_cfg.get('title') or '(δεν δόθηκε)'}
Τρέχουσα περιγραφή: {unit_cfg.get('description') or '(δεν δόθηκε)'}
Δυνατά σημεία / παροχές: {unit_cfg.get('highlights') or '(δεν δόθηκαν)'}

ΔΕΔΟΜΕΝΑ ΑΝΑΖΗΤΗΣΕΩΝ ΓΙΑ ΤΙΣ ΚΕΝΕΣ ΠΕΡΙΟΔΟΥΣ ΜΑΣ:
{chr(10).join(blocks)}

ΣΤΟΧΟΣ: να ανέβει η ΘΕΣΗ ΚΑΤΑΤΑΞΗΣ μας (ιδανικά #1) σε αυτές τις αναζητήσεις.
Είμαστε luxury. Κρίνε κάθε ανταγωνιστή ΣΥΝΟΛΙΚΑ (βαθμολογία, κριτικές, παροχές, τύπος, status) — το
quality score και η ετικέτα SUPERIOR / COMPARABLE / INFERIOR σε βοηθούν, αλλά χρησιμοποίησε και την κρίση σου
από ονόματα/περιγραφές.

ΚΑΝΟΝΑΣ ΤΙΜΗΣ:
- Πρότεινε μείωση τιμής ΜΟΝΟ όταν ισάξιο ή ανώτερο listing είναι φθηνότερο ΚΑΙ μας ξεπερνά στην κατάταξη.
  Τότε η μείωση να φέρνει την τιμή μας κοντά σε αυτό το listing (όχι χαμηλότερα), με συγκεκριμένο ποσό/% και ημερομηνίες.
- Φθηνότερα INFERIOR listings (απλά σπίτια, διαμερίσματα χωρίς πισίνα κλπ.) τα ΑΓΝΟΟΥΜΕ για την τιμή.
- Η τιμή είναι δευτερεύων μοχλός· προτεραιότητα έχουν οι παρακάτω.

Μοχλοί κατάταξης χωρίς αλλαγή τιμής, π.χ.:
- τίτλος/περιγραφή με τις λέξεις που έχουν οι πρώτοι (pool, sea view, private chef, κλπ.)
- προσφορές προστιθέμενης αξίας αντί έκπτωσης (welcome hamper, δωρεάν transfer, late check-out, chef night)
- ρυθμίσεις που ευνοεί ο αλγόριθμος: Instant Book, ευέλικτη πολιτική ακύρωσης, ελάχιστη διαμονή,
  διαθεσιμότητα ημερολογίου, χρόνος απάντησης, Preferred Partner / Genius / Guest Favourite
- παροχές και φωτογραφίες που έχουν οι πρώτοι και λείπουν από εμάς
- κριτικές: πώς να αυξηθεί ο αριθμός/βαθμολογία σε σχέση με αυτούς που προηγούνται

Δώσε 4–8 ΣΥΓΚΕΚΡΙΜΕΝΕΣ ενέργειες. Κάθε μία να αναφέρεται σε συγκεκριμένη πλατφόρμα, ημερομηνίες και
συγκεκριμένα listings που μας ξεπερνούν (π.χ. "Στο Airbnb 18–25/10 τα #1 και #2 έχουν 'heated pool' στον
τίτλο και 140+ κριτικές· προσθέστε το στον τίτλο και ενεργοποιήστε Instant Book").
ΟΧΙ γενικές συμβουλές. Όπου προτείνεις νέο τίτλο ή περιγραφή, γράψε
το έτοιμο κείμενο (στα Αγγλικά, όπως εμφανίζεται στους ξένους επισκέπτες) στο suggested_text.

Απάντησε ΜΟΝΟ με JSON array, χωρίς άλλο κείμενο:
[{{"platform":"airbnb|booking|both","check_in":"YYYY-MM-DD ή null","check_out":"YYYY-MM-DD ή null",
"priority":"high|medium|low","category":"price|offer|title|description|photos|amenities|policy|availability|reviews|other",
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

        run_id = datetime.utcnow().strftime("%Y%m%d%H%M%S") + "-" + uuid.uuid4().hex[:6]
        snaps_by_unit: dict = {}
        spent, budget = 0.0, float(cfg.get("max_usd_per_run", 1.0))
        lookahead = int(cfg.get("lookahead_days", 60))

        def guests_for(u):
            g = unit_cfgs.get(str(u.id), {}).get("guests")
            return int(g or u.capacity or cfg.get("adults", 2))

        # Only dates the villa can really be booked for — otherwise it can never show up in the search
        windows: dict = {}   # (ci, co) -> {platform: [units]}
        too_short: dict = {}  # (unit_id, a, b) -> {unit, nights, min_stay, platforms}
        for u in units:
            ucfg = unit_cfgs.get(str(u.id), {})
            for platform in cfg["platforms"]:
                if not ucfg.get(f"{platform}_url"):
                    continue
                ok, short = _bookable_windows(db, tenant, u, platform, lookahead, ucfg)
                for w in ok:
                    windows.setdefault(w, {}).setdefault(platform, []).append(u)
                for a, b, ms in short:
                    t = too_short.setdefault((u.id, a, b), {"unit": u, "min_stay": ms, "platforms": set()})
                    t["min_stay"] = max(t["min_stay"], ms)
                    t["platforms"].add(platform)

        # Short gaps: deterministic advice, no Apify/AI cost; skip if the same advice is still open
        added = 0
        for (uid, a, b), t in sorted(too_short.items(), key=lambda kv: kv[0][1]):
            exists = db.query(ListingRecommendation).filter(
                ListingRecommendation.tenant == tenant, ListingRecommendation.unit_id == uid,
                ListingRecommendation.category == "availability", ListingRecommendation.status == "open",
                ListingRecommendation.check_in == a, ListingRecommendation.check_out == b,
            ).first()
            if exists:
                continue
            n = (b - a).days
            plats = t["platforms"]
            db.add(ListingRecommendation(
                tenant=tenant, run_id=run_id, unit_id=uid,
                platform="both" if len(plats) > 1 else next(iter(plats)),
                check_in=a, check_out=b, priority="high", category="availability",
                title=f"Κενό {a:%d/%m}–{b:%d/%m} ({n} {'νύχτα' if n == 1 else 'νύχτες'}) δεν εμφανίζεται "
                      + ("σε καμία αναζήτηση" if len(plats) > 1 else f"στο {'Airbnb' if 'airbnb' in plats else 'Booking'}"),
                action=(f"Η ελάχιστη διαμονή για check-in {a:%d/%m} είναι {t['min_stay']} νύχτες, ενώ το κενό είναι {n}. "
                        f"Όσο ισχύει αυτό, η {t['unit'].name} δεν εμφανίζεται σε κανέναν επισκέπτη για αυτές τις ημερομηνίες. "
                        f"Μειώστε την ελάχιστη διαμονή σε {n} {'νύχτα' if n == 1 else 'νύχτες'} για {a:%d/%m}–{b:%d/%m} "
                        f"(Availability) και στις πλατφόρμες." if len(plats) > 1 else
                        f"(ρυθμίσεις {'Airbnb' if 'airbnb' in plats else 'Booking'} / Channel Rates)."),
            ))
            added += 1
        if too_short:
            log(f"{len(too_short)} κενά μικρότερα από την ελάχιστη διαμονή — παραλείπονται από τις αναζητήσεις"
                + (f" ({added} νέες προτάσεις)" if added else ""))
        db.commit()

        # Each platform gets its own earliest bookable windows (min stays can differ per platform)
        searches = []  # (ci, co, guests, platform, units) — one per distinct guest count, like real guests
        for platform in cfg["platforms"]:
            plat_windows = sorted(w for w, by_p in windows.items() if platform in by_p)
            for (ci, co) in plat_windows[: int(cfg.get("max_periods", 1))]:
                by_guests: dict = {}
                for u in windows[(ci, co)][platform]:
                    by_guests.setdefault(guests_for(u), []).append(u)
                searches += [(ci, co, g, platform, gu) for g, gu in sorted(by_guests.items())]
        searches.sort(key=lambda x: (x[0], x[3]))
        if not searches:
            log("Καμία κενή περίοδος που να καλύπτει την ελάχιστη διαμονή — τίποτα για αναζήτηση")
            return

        for (ci, co, guests, platform, search_units) in searches:
            if True:
                if spent >= budget:
                    log(f"Όριο κόστους ${budget:.2f} ανά ανάλυση — παράλειψη υπόλοιπων αναζητήσεων")
                    break
                log(f"Αναζήτηση {platform} {ci:%d/%m}–{co:%d/%m} · {guests} επισκέπτες…")
                try:
                    raw, cost = _apify_search(
                        platform, location, ci, co, guests,
                        int(cfg.get("max_results", 30)),
                        min(float(cfg.get("max_usd_per_search", 0.3)), budget - spent),
                        int(cfg.get("run_timeout_sec", 180)),
                        (cfg.get(f"{platform}_actor") or "").strip().replace("/", "~"), cfg)
                    spent += cost
                    log(f"  {len(raw)} αποτελέσματα · κόστος ${cost:.2f} (σύνολο ${spent:.2f})")
                    listings = _order_listings([_normalize(i, platform) for i in raw], platform)
                    err = None
                except Exception as e:
                    listings, err = [], str(e)
                    log(f"  ✗ {e}")

                for u in search_units:
                    my_url = unit_cfgs.get(str(u.id), {}).get(f"{platform}_url")
                    if not my_url:
                        continue
                    my_key = _listing_key(my_url, platform)
                    rank, mine = None, None
                    for idx, l in enumerate(listings):
                        if my_key and _listing_key(l["url"], platform) == my_key:
                            rank, mine = idx + 1, l
                            break
                    # Own entry: enrich with configured highlights so the score reflects the real villa
                    ucfg = unit_cfgs.get(str(u.id), {})
                    own_text = " ".join([u.name, u.type or "", ucfg.get("title", ""), ucfg.get("description", ""),
                                         ucfg.get("highlights", "")])
                    entries = [{**l, "position": i + 1, "mine": l is mine} for i, l in enumerate(listings)]
                    own = next((e for e in entries if e["mine"]), None)
                    if own is None:
                        own = {"name": u.name, "url": my_url, "price": None, "rating": None, "reviews": 0,
                               "position": None, "mine": True}
                        entries.append(own)
                    own["signals"] = sorted(set(own.get("signals") or []) | set(_signals(own_text)))
                    own["est_price"] = (u.base_price or 0) * (co - ci).days or None
                    own["score"] = _quality(own)
                    snap = ListingSnapshot(
                        tenant=tenant, run_id=run_id, unit_id=u.id, platform=platform,
                        check_in=ci, check_out=co, search_location=location,
                        adults=guests, rank=rank, total_results=len(listings),
                        my_price=mine["price"] if mine else None,
                        my_rating=mine["rating"] if mine else None,
                        competitors=json.dumps(entries, ensure_ascii=False),
                        error=err,
                    )
                    db.add(snap)
                    if not err:
                        snaps_by_unit.setdefault(u.id, []).append(snap)
                    bc = _better_cheaper(entries, rank)
                    log(f"  {u.name}: " + (f"θέση #{rank}/{len(listings)}" if rank else f"εκτός top {len(listings)}")
                        + f" · score {own['score']}" + (f" · {len(bc)} ισάξια/καλύτερα & φθηνότερα" if bc else ""))
        db.commit()

        for u in units:
            snaps = snaps_by_unit.get(u.id)
            if not snaps:
                continue
            log(f"AI ανάλυση για {u.name}…")
            try:
                recs = _claude_recommendations(u, unit_cfgs.get(str(u.id), {}), snaps, location,
                                              float(cfg.get("luxury_min_nightly") or 0))
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
    max_results: int = 30
    max_usd_per_search: float = 0.30
    max_usd_per_run: float = 1.00
    run_timeout_sec: int = 180
    lookahead_days: int = 60
    airbnb_actor: str = ""
    booking_actor: str = ""
    luxury_min_nightly: float = 200
    airbnb_filters: dict = {}
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
    cfg["max_usd_per_search"] = max(0.05, min(cfg["max_usd_per_search"], 5))
    cfg["max_usd_per_run"] = max(0.05, min(cfg["max_usd_per_run"], 20))
    cfg["run_timeout_sec"] = max(60, min(cfg["run_timeout_sec"], 900))
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


def _snap_dict(s: ListingSnapshot, cfg: dict) -> dict:
    min_nightly = float(cfg.get("luxury_min_nightly") or 0)
    all_comps = json.loads(s.competitors or "[]")
    comps = [c for c in all_comps if not c.get("mine")]
    prices = [c["price"] for c in comps if c.get("price")]
    lux_rank, lux_total = _segment_rank(all_comps, (s.check_out - s.check_in).days, min_nightly, s.my_price)
    return {
        "id": s.id, "run_id": s.run_id, "unit_id": s.unit_id, "platform": s.platform,
        "check_in": s.check_in.isoformat(), "check_out": s.check_out.isoformat(),
        "rank": s.rank, "total_results": s.total_results, "my_price": s.my_price,
        "my_rating": s.my_rating, "median_price": round(statistics.median(prices)) if prices else None,
        "lux_rank": lux_rank, "lux_total": lux_total, "adults": s.adults,
        "search_url": _search_url(s.platform, s.search_location or "", s.check_in, s.check_out, s.adults or 2, cfg),
        "my_score": next((c.get("score") for c in all_comps if c.get("mine")), None),
        "better_cheaper": [{"name": c["name"], "url": c.get("url"), "price": c.get("price"),
                            "score": c.get("score"), "position": c.get("position")}
                           for c in _better_cheaper(all_comps, s.rank)],
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
    cfg = _load_config(db, tenant)
    return {"run_id": last.run_id, "created_at": last.created_at.isoformat(),
            "snapshots": [_snap_dict(s, cfg) for s in snaps]}


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
    period_msg = None
    if r.category == "availability" and r.check_in and r.check_out:
        # "Done" on a min-stay advice = the host lowered it on the platform → record it as an exception
        cfg = _load_config(db, tenant)
        ucfg = cfg.setdefault("units", {}).setdefault(str(r.unit_id), {})
        periods = [p for p in (ucfg.get("min_stay_periods") or []) if p.get("rec_id") != r.id]
        if data.status == "done":
            nights = (r.check_out - r.check_in).days
            periods.append({
                "from": r.check_in.isoformat(),
                "to": (r.check_out - timedelta(days=1)).isoformat(),  # last possible check-in
                "platform": r.platform if r.platform in ("airbnb", "booking") else "both",
                "nights": nights, "rec_id": r.id,
                "note": f"Από πρόταση {r.check_in:%d/%m}–{r.check_out:%d/%m}",
            })
            period_msg = f"Καταχωρήθηκε ελάχιστη διαμονή {nights} {'νύχτα' if nights == 1 else 'νύχτες'} για {r.check_in:%d/%m}–{r.check_out:%d/%m}"
        ucfg["min_stay_periods"] = periods
        _save_config(db, tenant, cfg)
    r.status = data.status
    db.commit()
    return {"ok": True, "message": period_msg}
