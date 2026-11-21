"""Client-facing consultant name formatting shared by every outgoing email."""
from typing import Optional

# Greek display names for consultants stored under a Latin code
CONSULTANT_GR = {
    "ELEFTHERIA": "Ελευθερία", "CHRISTOS": "Χρήστος", "VALLIA": "Βάλλια",
    "STELLA": "Στέλλα", "SOFIA": "Σοφία", "HARIS": "Χάρης",
}


def consultant_short(name: Optional[str]) -> Optional[str]:
    """"Βαρδιάμπασης Μάνος" → "Μάνος Β." (first name + surname initial).
    Names are stored "Surname First". Single-word names are returned as-is."""
    if not name:
        return name
    disp = CONSULTANT_GR.get(name.strip().upper(), name).strip()
    parts = disp.split()
    if len(parts) < 2:
        return disp
    return f"{parts[-1]} {parts[0][0].upper()}."


def consultant_first(name: Optional[str]) -> Optional[str]:
    """"Βαρδιάμπασης Μάνος" → "Μάνος" (first name only, for Viber/SMS)."""
    if not name:
        return name
    disp = CONSULTANT_GR.get(name.strip().upper(), name).strip()
    parts = disp.split()
    return parts[-1] if parts else disp
