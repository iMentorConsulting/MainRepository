"""Θέμις — AI lead-screening chat agent (Anthropic Claude).

Operates on EXISTING Lead records only: it never collects name/phone from
scratch, it reads whatever the Lead row already has and screens basic
eligibility via a short text chat before a human consultant calls.

Gated behind ENABLE_THEMIS (default off) — see themis_enabled() below and
routers/themis.py. While off, send_themis_link() is a no-op and the public
chat endpoints 404, so deploying this module changes nothing in production
until the env var is flipped on.
"""

import os
import re
import time

VERDICT_ELIGIBLE = "<<VERDICT:ELIGIBLE>>"
VERDICT_INELIGIBLE = "<<VERDICT:INELIGIBLE>>"

_VERDICT_RE = re.compile(r"<<VERDICT:(ELIGIBLE|INELIGIBLE)>>")


def themis_enabled() -> bool:
    return os.getenv("ENABLE_THEMIS", "false").lower() == "true"


def _lead_facts(lead) -> str:
    """Render whatever non-empty fields the Lead row already holds, so Θέμις
    never has to ask for info we already have."""
    facts = []
    if getattr(lead, "name", None):
        facts.append(f"Όνομα: {lead.name}")
    if getattr(lead, "total_debt", None):
        facts.append(f"Συνολικό χρέος (όπως καταγράφηκε): {lead.total_debt}")
    if getattr(lead, "service_type", None):
        facts.append(f"Τύπος υπηρεσίας ενδιαφέροντος: {lead.service_type}")
    if getattr(lead, "referrer", None):
        facts.append(f"Πηγή lead: {lead.referrer}")
    if getattr(lead, "sheet_comments", None):
        facts.append(f"Σχόλια από την αρχική επικοινωνία: {lead.sheet_comments}")
    return "\n".join(facts) if facts else "(δεν υπάρχουν επιπλέον στοιχεία καταγραμμένα)"


def _build_system_prompt(lead, questions: list, instructions: str) -> str:
    questions_block = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(questions)) or "(δεν έχουν οριστεί ερωτήσεις — προχώρα κατευθείαν σε σύντομες διευκρινιστικές ερωτήσεις βάσει κρίσης)"

    return f"""Είσαι η Θέμις, η ψηφιακή βοηθός της I MENTOR Consulting για υποθέσεις εξωδικαστικού μηχανισμού ρύθμισης οφειλών.

Μιλάς στα Ελληνικά, με ζεστό, σύντομο, επαγγελματικό ύφος. Δεν είσαι δικηγόρος ούτε δίνεις νομικές συμβουλές — προετοιμάζεις το έδαφος για τον ανθρώπινο σύμβουλο που θα καλέσει μετά.

ΣΤΟΙΧΕΙΑ ΠΟΥ ΓΝΩΡΙΖΕΙΣ ΗΔΗ ΓΙΑ ΤΟΝ LEAD (μην τα ξαναζητήσεις):
{_lead_facts(lead)}

ΣΕΙΡΑ ΣΥΖΗΤΗΣΗΣ (υποχρεωτική):
1. Στο πρώτο σου μήνυμα: χαιρέτησε τον/την {lead.name or "πελάτη"} ονομαστικά, συστήσου σύντομα ως η Θέμις και εξήγησε γιατί του γράφεις (προκαταρκτικός έλεγχος πριν τον καλέσει ο σύμβουλος).
2. Μόνο μετά τη συστολή, προχώρα στις παρακάτω ερωτήσεις επιλεξιμότητας, μία ή δύο τη φορά — όχι όλες μαζί σαν ανάκριση.
3. Απάντα επίσης σε όποιες ερωτήσεις/ανησυχίες θέσει ο lead στο μεταξύ.

ΕΡΩΤΗΣΕΙΣ ΕΠΙΛΕΞΙΜΟΤΗΤΑΣ (ρωτησέ τις με τη σειρά, σταδιακά):
{questions_block}

ΕΠΙΠΛΕΟΝ ΟΔΗΓΙΕΣ ΑΠΟ ΤΗ ΔΙΟΙΚΗΣΗ:
{instructions or "(καμία επιπλέον οδηγία)"}

ΚΑΝΟΝΑΣ ΕΠΙΛΕΞΙΜΟΤΗΤΑΣ: Η αξιολόγηση είναι χαλαρή — δεν είσαι μηχανισμός κανόνων. Σε ασαφείς ή μη οριστικές απαντήσεις, θεωρείς τον lead ΕΠΙΛΕΞΙΜΟ (ο πραγματικός έλεγχος γίνεται από άνθρωπο σύμβουλο). Κρίνεις ΜΗ ΕΠΙΛΕΞΙΜΟ μόνο όταν υπάρχει σαφής, ξεκάθαρος λόγος αποκλεισμού (π.χ. ο lead δηλώνει ρητά ότι δεν τον ενδιαφέρει πλέον, ή δεν πληροί προφανώς μια βασική προϋπόθεση).

ΣΗΜΑΝΤΙΚΟ — ΣΗΜΑ ΑΠΟΦΑΣΗΣ: Μόλις έχεις πάρει αρκετές απαντήσεις για να βγάλεις συμπέρασμα, πρόσθεσε στο ΤΕΛΟΣ του μηνύματός σου (σε νέα γραμμή, ο lead δεν θα τη δει — αφαιρείται αυτόματα) ΑΚΡΙΒΩΣ ένα από τα δύο tags:
{VERDICT_ELIGIBLE}
{VERDICT_INELIGIBLE}
Μην προσθέσεις tag αν η συζήτηση δεν έχει ακόμα ολοκληρωθεί. Πριν βάλεις tag, κλείσε με ένα ευγενικό, φυσικό μήνυμα προς τον lead (π.χ. ευχαριστία, ενημέρωση ότι θα τον καλέσει σύμβουλος, ή εξήγηση γιατί δεν προχωράμε)."""


async def get_reply(lead, questions: list, instructions: str, transcript: list) -> str:
    """One Claude call per turn. transcript is the full ThemisSession.transcript
    so far (list of {role: 'themis'|'lead', text}); returns Θέμις's raw reply,
    possibly with a trailing <<VERDICT:...>> tag for the caller to parse."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    system_prompt = _build_system_prompt(lead, questions, instructions)

    messages = [
        {"role": "assistant" if t["role"] == "themis" else "user", "content": t["text"]}
        for t in transcript
    ]

    resp = await client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=600,
        system=system_prompt,
        messages=messages,
    )
    return "".join(block.text for block in resp.content if block.type == "text")


def parse_verdict(reply: str) -> tuple:
    """Returns (clean_reply, verdict) where verdict is 'eligible' / 'ineligible' / None."""
    m = _VERDICT_RE.search(reply)
    clean = _VERDICT_RE.sub("", reply).strip()
    if not m:
        return clean, None
    return clean, "eligible" if m.group(1) == "ELIGIBLE" else "ineligible"


# ── Auto-send the Θέμις link on Lead creation ───────────────────────────────

_VIBER_TEMPLATE = (
    "⚖️ Γεια σου {name}!\n\n"
    "Είμαι η Θέμις, η ψηφιακή βοηθός της I MENTOR Consulting. 👋\n\n"
    "Πριν σε καλέσει ο σύμβουλός σου, θα ήθελα να σου κάνω μερικές σύντομες ερωτήσεις για την υπόθεσή σου — δεν θα σου πάρει πάνω από 2 λεπτά. ⏱️\n\n"
    "👉 Πάτησε εδώ για να ξεκινήσουμε:\n{link}\n\n"
    "Σε περιμένω! 😊"
)

_EMAIL_SUBJECT = "⚖️ Θέμις — Σύντομη προκαταρκτική συζήτηση για την υπόθεσή σας"

_EMAIL_BODY_TEMPLATE = (
    "**Γεια σου {name},** 👋\n\n"
    "Είμαι η **Θέμις**, η ψηφιακή βοηθός της [c=#2563eb]I MENTOR Consulting[/c]. "
    "Πριν σε καλέσει ο σύμβουλός σου, θα ήθελα να σου κάνω μερικές σύντομες ερωτήσεις για την υπόθεσή σου.\n\n"
    "▸ Διαρκεί μόλις λίγα λεπτά\n"
    "▸ Γίνεται μέσω σύντομης συζήτησης, χωρίς δεσμεύσεις\n"
    "▸ Βοηθά τον σύμβουλό σου να ετοιμαστεί καλύτερα για την κλήση σας\n\n"
    "[btn]Ξεκινάμε τη συζήτηση →|{link}[/btn]\n\n"
    "[c=#64748b]Η ομάδα της I MENTOR Consulting[/c]"
)


def _normalize_phone(phone: str) -> str:
    phone = (phone or "").strip().replace(" ", "").replace("-", "")
    if phone and not phone.startswith("+"):
        if phone.startswith("00"):
            phone = "+" + phone[2:]
        elif phone.startswith("0"):
            phone = "+30" + phone[1:]
        else:
            phone = "+30" + phone
    return phone


def send_themis_link(lead) -> dict:
    """Best-effort, independent Viber + email send of the lead's personalized
    Θέμις link. No-op while ENABLE_THEMIS is off."""
    if not themis_enabled():
        return {"ok": True, "skipped": "ENABLE_THEMIS is off"}

    portal_base = os.getenv("FRONTEND_URL", "https://mainrepository-production.up.railway.app").rstrip("/")
    link = f"{portal_base}/themis/{lead.themis_token}"
    name = lead.name or "εκεί"
    result = {"viber_ok": False, "viber_error": None, "email_ok": False, "email_error": None}

    phone = _normalize_phone(getattr(lead, "phone", "") or "")
    if phone:
        try:
            from routers.leads import _chatwoot_send_with_retry
            ok, err = _chatwoot_send_with_retry(lead.name or "Lead", phone, _VIBER_TEMPLATE.format(name=name, link=link))
            result["viber_ok"] = ok
            if not ok:
                result["viber_error"] = err
        except Exception as e:
            result["viber_error"] = str(e)

    email = (getattr(lead, "email", "") or "").strip()
    if email:
        try:
            from routers.leads import _send_gmail
            ok, err = _send_gmail(email, _EMAIL_SUBJECT, _EMAIL_BODY_TEMPLATE.format(name=name, link=link))
            result["email_ok"] = ok
            if not ok:
                result["email_error"] = err
        except Exception as e:
            result["email_error"] = str(e)

    return result
