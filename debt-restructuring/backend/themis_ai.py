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
    if getattr(lead, "assigned_to", None):
        facts.append(f"Ο σύμβουλος που έχει αναλάβει την υπόθεση (αυτός/αυτή θα καλέσει): {lead.assigned_to}")
    if getattr(lead, "total_debt", None):
        facts.append(f"Συνολικό χρέος (όπως καταγράφηκε): {lead.total_debt}")
    if getattr(lead, "service_type", None):
        facts.append(f"Τύπος υπηρεσίας ενδιαφέροντος: {lead.service_type}")
    if getattr(lead, "referrer", None):
        facts.append(f"Πηγή lead: {lead.referrer}")
    if getattr(lead, "sheet_comments", None):
        facts.append(f"Σχόλια από την αρχική επικοινωνία: {lead.sheet_comments}")
    return "\n".join(facts) if facts else "(δεν υπάρχουν επιπλέον στοιχεία καταγραμμένα)"


_KNOWLEDGE_BLOCK = """ΓΝΩΣΗ ΓΙΑ ΤΟΝ ΕΞΩΔΙΚΑΣΤΙΚΟ ΜΗΧΑΝΙΣΜΟ ΡΥΘΜΙΣΗΣ ΟΦΕΙΛΩΝ
(πηγή: εσωτερικό εγχειρίδιο συμβούλων I MENTOR Consulting — ΚΥΑ 13243/2024, ΚΥΑ 67360, ΚΥΑ 7712925/2025, ΦΕΚ Β' 2499/2021, ΚΥΑ 77697/2021)

Αυτή είναι η πραγματική λογική που εφαρμόζει το εργαλείο υπολογισμού της εταιρείας. Χρησιμοποίησέ τη για να απαντάς με σιγουριά σε ερωτήσεις του lead γύρω από τον εξωδικαστικό, ΧΩΡΙΣ ποτέ να δίνεις δεσμευτική νομική συμβουλή ή τελικό αριθμό ρύθμισης — αυτό το κάνει πάντα ο ανθρώπινος σύμβουλος με τα πλήρη στοιχεία.

1) ΚΑΤΗΓΟΡΙΕΣ ΟΦΕΙΛΕΤΩΝ — τρεις κατηγορίες, διαφορετικός κανόνας εισοδήματος η καθεμία:
   • Φυσικό Πρόσωπο — Μισθωτός/Συνταξιούχος/Άνεργος: flat κανόνας, βάση το εισόδημα έτους Τ.
   • Φυσικό Πρόσωπο — Επιτηδευματίας (ατομική επιχείρηση/ελεύθερος επαγγελματίας): 3-phase step-up κανόνας.
   • Νομικό Πρόσωπο: μέσος όρος κερδών τριετίας.

2) ΥΠΟΛΟΓΙΣΜΟΣ ΔΙΑΘΕΣΙΜΟΥ ΕΙΣΟΔΗΜΑΤΟΣ:
   • Μισθωτός: Διαθέσιμο = max(0, Εισόδημα_Τ − Εύλογες Δαπάνες Διαβίωσης) × 80% + Καταθέσεις/20. Μόνο το έτος Τ μετράει, το ίδιο ποσοστό 80% σε όλη τη διάρκεια (χωρίς step-up).
   • Επιτηδευματίας: ίδια λογική ανά έτος (ΚΠΑ_x = max(0, Εισόδημα_x − Δαπάνες) × 80%), αλλά εφαρμόζεται step-up (βλ. §3).
   • Νομικό Πρόσωπο: avg2 = μέσος όρος των 2 υψηλότερων ετήσιων διαθέσιμων (Κέρδη − ΕΝΦΙΑ) από τα τελευταία 3 έτη, plus καταθέσεις×95%/20. Αν avg2 < 10% του Κύκλου Εργασιών έτους Τ, χρησιμοποιείται 10% ΚΕ_Τ ως διαθέσιμο (ενεργοποιεί κανόνα 240 max δόσεων).
   • Εύλογες δαπάνες που αφαιρούνται: ελάχιστες δαπάνες διαβίωσης (ΕΔΔ ανά σύνθεση νοικοκυριού), ενοίκιο (με ανώτατο cap ανά μέλη: 350€ για 1 μέλος έως 550€ max για 5+ μέλη, μηνιαίως), ιατρικά, ΕΝΦΙΑ (πλήρες), ενοίκιο φοιτητή (πλήρες), διατροφή λόγω διαζυγίου (πλήρης). Όσα επιμερίζονται γίνονται βάσει αναλογίας = Εισόδημα_οφειλέτη / (Εισόδημα_οφειλέτη + Εισόδημα_συζύγου).
   • Αφορολόγητο καταθέσεων (ΦΠ): 2.000€ (1 μέλος) έως 5.000€ max (4+ μέλη).

3) ΚΑΝΟΝΑΣ STEP-UP (μόνο Επιτηδευματίας — ΚΥΑ 67360 άρθρο 8Α §5, ΦΕΚ Β' 2499/2021 §9):
   • Stage 1 (μήνες 1–12): ΚΠΑ_Τ = max(0, Εισόδημα_Τ − Δαπάνες) × 80%.
   • Stage 2 (μήνες 13–48): max(Stage 1, avg2_kpa × 65%), όπου avg2_kpa = μέσος όρος των 2 υψηλότερων ΚΠΑ από {Τ, Τ-1, Τ-2}.
   • Stage 3 (μήνες 49+): max(Stage 1, avg2_kpa × 100%).
   • Αν το τελευταίο έτος (Τ) ήταν πολύ καλύτερο από τα προηγούμενα, το αποτέλεσμα είναι FLAT (καμία αύξηση δόσης) — αυτό είναι νομικά σωστό, ο νόμος εγγυάται ελάχιστο, δεν επιβάλλει step-up. Step-up προκύπτει μόνο όταν το τελευταίο έτος ήταν χειρότερο από τον μέσο όρο προηγούμενων.
   • Μισθωτός και Νομικό Πρόσωπο: ΔΕΝ έχουν step-up, πάντα flat δόση.

4) ΕΠΙΤΟΚΙΑ ΡΥΘΜΙΣΗΣ:
   • Promo περίοδος (μήνες 1–36): Τράπεζα ενυπόθηκο 3,00%, Τράπεζα ανέγγυο 4,00%, ΑΑΔΕ/ΕΦΚΑ 3,00% (σταθερό για πάντα).
   • Post-promo (μήνες 37+, μόνο τράπεζες): Euribor 3M + spread (ενυπόθηκο +2,50%, ανέγγυο +3,00%).

5) ΜΕΓΙΣΤΟΣ ΑΡΙΘΜΟΣ ΔΟΣΕΩΝ:
   • Φυσικό Πρόσωπο: ενυπόθηκο έως 420 μήνες (35 έτη), ανέγγυο τράπεζας/ΑΑΔΕ/ΕΦΚΑ έως 240 μήνες (20 έτη).
   • Νομικό Πρόσωπο: ενυπόθηκο/ΑΑΔΕ/ΕΦΚΑ έως 240 μήνες, ανέγγυο τράπεζας έως 180 μήνες.
   • Ηλικιακό όριο (μόνο ΦΠ): max δόσεις = max(12, (85 − ηλικία νεότερου μέλους) × 12). Π.χ. νεότερο μέλος 60 ετών → max 300 μήνες (περιορίζει το ενυπόθηκο 420 στο 300).

6) ΑΝΩΤΑΤΑ ΟΡΙΑ ΔΙΑΓΡΑΦΩΝ:
   • Τραπεζικά: κεφάλαιο έως 80% διαγραφή (τράπεζα ανακτά ≥20%), τόκοι/προσαυξήσεις 100%. Ισχύει μόνο για το ακάλυπτο (uncovered) μέρος — αν η περιουσία καλύπτει το χρέος, δεν προκύπτει διαγραφή.
   • Δημόσια χρέη (γενικός κανόνας): κεφάλαιο έως 75% (ανάκτηση ≥25%), τόκοι/προσαυξήσεις 85%.
   • Κατηγορίες δημοσίου χρέους (ΚΥΑ 13243/2024): ΦΠΑ/ΦΜΥ/παρακρατούμενα = 0% διαγραφή βασικού (μη διαγράψιμα), τόκοι αυτών 85%· φόρος εισοδήματος/ΕΝΦΙΑ/ΓΕΜΗ = 75% βασικό, 85% τόκοι· πρόστιμα ΑΑΔΕ = 95%.

7) ΚΑΛΥΨΗ ΑΠΟ ΠΕΡΙΟΥΣΙΑ (ΚΠολΔ 977): καθαρή αξία = αξία ακινήτων×97% + καταθέσεις πέραν αφορολόγητου. Ενυπόθηκα ακίνητα: 65% στον ενυπόθηκο πιστωτή, 25% Δημόσιο/ΕΦΚΑ, 10% ανέγγυοι. Ελεύθερα στοιχεία: 70% Δημόσιο/ΕΦΚΑ, 30% ανέγγυοι. Αν η περιουσία καλύπτει πλήρως τα χρέη, δεν υπάρχει διαγραφή.

8) ΣΕΝΑΡΙΑ ΑΠΟΤΕΛΕΣΜΑΤΟΣ: 1) Οικονομικά ισχυρό προφίλ (καμία διαγραφή), 2) Δυνητικό "κούρεμα" (μερική διαγραφή, εισόδημα επαρκεί μετά), 3) Ισχυρό δικαίωμα διαγραφής (εισόδημα ανεπαρκές, μέγιστη διαγραφή), 4) Χαμηλό εισόδημα με πλήρη κάλυψη από περιουσία, 5) Χαμηλό εισόδημα με μερική κάλυψη.

9) ΕΥΑΛΩΤΟΣ ΟΦΕΙΛΕΤΗΣ (Άρθρο 66 ν. 5072/2023): καταγράφεται ως ένδειξη στην αίτηση/έκθεση, δεν μεταβάλλει τον υπολογισμό, αλλά αναφέρεται ρητά στα έγγραφα.

10) ΓΕΝΙΚΟ: Η Πρόταση Α (αυτοματοποιημένη πρόταση πλατφόρμας ΕΓΔΙΧ) γίνεται αυτόματα δεκτή από ΑΑΔΕ/ΕΦΚΑ. Οι τράπεζες μπορούν να αποδεχτούν ή να αντιπροτείνουν συντηρητικότερη λύση (μικρότερη διαγραφή — τυπικά 65-75% της αρχικής για ανέγγυα/ενυπόθηκα τραπεζικά χρέη).

11) ΕΛΑΧΙΣΤΟ ΠΟΣΟ ΟΦΕΙΛΗΣ ΑΑΔΕ/ΕΦΚΑ ΓΙΑ ΥΠΑΓΩΓΗ: Για να υπαχθεί μια οφειλή προς την ΑΑΔΕ ή τον ΕΦΚΑ στον εξωδικαστικό, πρέπει η οφειλή σε ΚΑΘΕ φορέα ΞΕΧΩΡΙΣΤΑ (ΑΑΔΕ από μόνη της, ΕΦΚΑ από μόνη της) να είναι τουλάχιστον 10.000€. Αν η οφειλή σε έναν φορέα είναι κάτω από 10.000€, εκείνη η οφειλή δεν μπορεί προς το παρόν να υπαχθεί (το όριο αναμένεται μελλοντικά να μειωθεί στα 5.000€ ανά φορέα, αλλά αυτό δεν ισχύει ακόμα — μην το παρουσιάζεις σαν ήδη ενεργό όριο). ΔΕΝ υπάρχει απαίτηση η οφειλή να είναι ληξιπρόθεσμη πάνω από 90 ημέρες — αυτό δεν αποτελεί κριτήριο επιλεξιμότητας, μην το ρωτάς ποτέ.

Όταν ο lead ρωτήσει κάτι τεχνικό (π.χ. "πόσο θα διαγραφεί", "πόσες δόσεις θα έχω"), απάντησε σε γενικές γραμμές βασιζόμενος στην παραπάνω λογική, αλλά ξεκαθάρισε ότι ο ακριβής αριθμός βγαίνει μόνο μετά από πλήρη υπολογισμό από τον σύμβουλο με όλα τα στοιχεία (εισόδημα, χρέη, περιουσία, νοικοκυριό)."""


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

ΣΗΜΑΝΤΙΚΟ — ΣΥΜΒΟΥΛΟΣ ΠΟΥ ΘΑ ΚΑΛΕΣΕΙ: Όταν αναφέρεσαι σε ποιος/ποια θα καλέσει τον lead, χρησιμοποίησε ΑΠΟΚΛΕΙΣΤΙΚΑ το όνομα του σύμβουλου που αναγράφεται παραπάνω στα "ΣΤΟΙΧΕΙΑ ΠΟΥ ΓΝΩΡΙΖΕΙΣ ΗΔΗ". Μην αναφέρεις ποτέ άλλο όνομα συμβούλου και μην επινοείς όνομα — αν δεν υπάρχει καταγραμμένος σύμβουλος, πες απλά "ο σύμβουλός σας" χωρίς όνομα.

ΣΗΜΑΝΤΙΚΟ — ΛΗΞΙΠΡΟΘΕΣΜΙΑ ΑΑΔΕ/ΕΦΚΑ: Μην ρωτήσεις ποτέ αν οι οφειλές σε ΑΑΔΕ/ΕΦΚΑ είναι ληξιπρόθεσμες πάνω από 90 ημέρες — αυτό δεν είναι κριτήριο επιλεξιμότητας, αγνόησε τυχόν σχετική ερώτηση στη λίστα παρακάτω. Αντί αυτού, αν χρειάζεται να ελέγξεις επιλεξιμότητα ΑΑΔΕ/ΕΦΚΑ οφειλών, ρώτα το ποσό ανά φορέα ξεχωριστά και εφάρμοσε το όριο των 10.000€ ανά φορέα (βλ. ΓΝΩΣΗ §11).

ΚΑΝΟΝΑΣ ΕΠΙΛΕΞΙΜΟΤΗΤΑΣ: Η αξιολόγηση είναι χαλαρή — δεν είσαι μηχανισμός κανόνων. Σε ασαφείς ή μη οριστικές απαντήσεις, θεωρείς τον lead ΕΠΙΛΕΞΙΜΟ (ο πραγματικός έλεγχος γίνεται από άνθρωπο σύμβουλο). Κρίνεις ΜΗ ΕΠΙΛΕΞΙΜΟ μόνο όταν υπάρχει σαφής, ξεκάθαρος λόγος αποκλεισμού (π.χ. ο lead δηλώνει ρητά ότι δεν τον ενδιαφέρει πλέον, ή δεν πληροί προφανώς μια βασική προϋπόθεση).

ΣΗΜΑΝΤΙΚΟ — ΣΗΜΑ ΑΠΟΦΑΣΗΣ: Μόλις έχεις πάρει αρκετές απαντήσεις για να βγάλεις συμπέρασμα, πρόσθεσε στο ΤΕΛΟΣ του μηνύματός σου (σε νέα γραμμή, ο lead δεν θα τη δει — αφαιρείται αυτόματα) ΑΚΡΙΒΩΣ ένα από τα δύο tags:
{VERDICT_ELIGIBLE}
{VERDICT_INELIGIBLE}
Μην προσθέσεις tag αν η συζήτηση δεν έχει ακόμα ολοκληρωθεί. Πριν βάλεις tag, κλείσε με ένα ευγενικό, φυσικό μήνυμα προς τον lead (π.χ. ευχαριστία, ενημέρωση ότι θα τον καλέσει σύμβουλος, ή εξήγηση γιατί δεν προχωράμε)."""


async def get_reply(lead, questions: list, instructions: str, transcript: list) -> tuple:
    """One Claude call per turn. transcript is the full ThemisSession.transcript
    so far (list of {role: 'themis'|'lead', text}); returns (reply, usage) where
    reply is Θέμις's raw text (possibly with a trailing <<VERDICT:...>> tag for
    the caller to parse) and usage is a dict of token counts for cost tracking.

    The domain-knowledge block is a separate, identical-every-call system block
    with cache_control so Anthropic caches it server-side (5-min TTL) instead of
    re-billing the full block on every single message of every session."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    system_blocks = [
        {"type": "text", "text": _KNOWLEDGE_BLOCK, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": _build_system_prompt(lead, questions, instructions)},
    ]

    messages = [
        {"role": "assistant" if t["role"] == "themis" else "user", "content": t["text"]}
        for t in transcript
    ]

    resp = await client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=600,
        system=system_blocks,
        messages=messages,
    )
    text = "".join(block.text for block in resp.content if block.type == "text")
    usage = {
        "input_tokens": resp.usage.input_tokens,
        "output_tokens": resp.usage.output_tokens,
        "cache_creation_input_tokens": getattr(resp.usage, "cache_creation_input_tokens", 0) or 0,
        "cache_read_input_tokens": getattr(resp.usage, "cache_read_input_tokens", 0) or 0,
    }
    return text, usage


def _build_followup_prompt(lead) -> str:
    return f"""Είσαι η Θέμις, η ψηφιακή βοηθός της I MENTOR Consulting. Μόλις ολοκλήρωσες τον προκαταρκτικό έλεγχο επιλεξιμότητας του/της {lead.name or "lead"} για τον εξωδικαστικό μηχανισμό ρύθμισης οφειλών — ένας σύμβουλος θα τους καλέσει σύντομα.

Τώρα ο lead μπορεί να σου κάνει μερικές ελεύθερες ερωτήσεις για να καταλάβει καλύτερα πώς δουλεύει το σύστημα, πριν τον καλέσει ο σύμβουλος. Χρησιμοποίησε τη γνώση σου για τον εξωδικαστικό (παρακάτω) για να απαντήσεις με σιγουριά, σε απλά ελληνικά, σύντομα και κατανοητά.

ΚΑΝΟΝΕΣ:
- Μην δίνεις δεσμευτική νομική συμβουλή ή τελικό ακριβή αριθμό ρύθμισης/διαγραφής — αυτό το κάνει πάντα ο ανθρώπινος σύμβουλος με τα πλήρη στοιχεία. Μπορείς να εξηγείς τη γενική λογική και τυπικά εύρη.
- Μην ξαναρωτήσεις ερωτήσεις επιλεξιμότητας — αυτή η φάση έχει ολοκληρωθεί.
- Αν η ερώτηση είναι άσχετη με τον εξωδικαστικό/χρέη, απάντησε ευγενικά ότι αυτό θα το δει με τον σύμβουλο.
- Κράτα τις απαντήσεις σύντομες (2-4 προτάσεις), με ζεστό επαγγελματικό ύφος."""


async def get_followup_reply(lead, transcript: list) -> tuple:
    """Free-form Q&A after the eligibility verdict — same cached knowledge
    block, different (much shorter) system prompt, never emits a verdict tag."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    system_blocks = [
        {"type": "text", "text": _KNOWLEDGE_BLOCK, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": _build_followup_prompt(lead)},
    ]
    messages = [
        {"role": "assistant" if t["role"] == "themis" else "user", "content": t["text"]}
        for t in transcript
    ]
    resp = await client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=400,
        system=system_blocks,
        messages=messages,
    )
    text = "".join(block.text for block in resp.content if block.type == "text")
    usage = {
        "input_tokens": resp.usage.input_tokens,
        "output_tokens": resp.usage.output_tokens,
        "cache_creation_input_tokens": getattr(resp.usage, "cache_creation_input_tokens", 0) or 0,
        "cache_read_input_tokens": getattr(resp.usage, "cache_read_input_tokens", 0) or 0,
    }
    return text, usage


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
_LOGO_URL = "https://i-mentor.gr/wp-content/uploads/2026/06/logo-white-transparent.png"

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

    portal_base = os.getenv("FRONTEND_URL", "https://portal.i-mentor.gr").rstrip("/")
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
            ok, err = _send_gmail(email, _EMAIL_SUBJECT, _EMAIL_BODY_TEMPLATE.format(name=name, link=link), logo_url=_LOGO_URL)
            result["email_ok"] = ok
            if not ok:
                result["email_error"] = err
        except Exception as e:
            result["email_error"] = str(e)

    return result
