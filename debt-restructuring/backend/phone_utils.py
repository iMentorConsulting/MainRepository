import re


def normalize_greek_phone(phone: str) -> str:
    """Return a Greek phone number in +30XXXXXXXXXX form.

    Accepts local (69…, 069…), 30…, +30…, 0030… and the malformed variants where the
    country code was added twice (+3030…, 303069…). Greek national numbers never start
    with 30, so any repeated leading 30 is safe to strip. Returns "" for empty input.
    """
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return ""
    if digits.startswith("00"):
        digits = digits[2:]
    while digits.startswith("30") and len(digits) > 10:
        digits = digits[2:]
    while digits.startswith("0") and len(digits) > 10:
        digits = digits[1:]
    return "+30" + digits
