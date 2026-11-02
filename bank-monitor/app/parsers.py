"""Bank statement parsers: generic CSV (Greek/English headers) and MT940.

Each parser returns a list of dicts:
    tx_date (ISO str), amount_cents (int, + credit / - debit),
    description, counterparty, account, currency
"""
import csv
import io
import re
import unicodedata
from datetime import date, datetime
from decimal import Decimal, InvalidOperation


class ParseError(ValueError):
    pass


def norm(s: str) -> str:
    """Uppercase and strip accents: 'Πίστωση' -> 'ΠΙΣΤΩΣΗ'."""
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s).strip().upper()


def parse_amount(text: str) -> int:
    """Return cents. Handles 1.234,56 / 1,234.56 / -12.50 / (12,00) / 12,00-."""
    t = (text or "").strip().replace("\xa0", "").replace(" ", "")
    t = t.replace("€", "").replace("EUR", "")
    if not t:
        raise ParseError("empty amount")
    neg = False
    if t.startswith("(") and t.endswith(")"):
        neg, t = True, t[1:-1]
    if t.endswith("-"):
        neg, t = True, t[:-1]
    if t.startswith("-"):
        neg, t = True, t[1:]
    elif t.startswith("+"):
        t = t[1:]
    if "," in t and "." in t:
        dec = "," if t.rfind(",") > t.rfind(".") else "."
        thou = "." if dec == "," else ","
        t = t.replace(thou, "").replace(dec, ".")
    elif "," in t:
        head, _, tail = t.rpartition(",")
        if len(tail) == 3 and head:
            t = head.replace(",", "") + tail  # 1,234 -> thousands separator
        else:
            t = head.replace(",", "") + "." + tail  # 12,5 / 0,99 -> decimal comma
    elif t.count(".") > 1:
        t = t.replace(".", "")
    elif "." in t and len(t.rpartition(".")[2]) == 3:
        t = t.replace(".", "")  # 1.234 -> thousands separator (Greek style)
    try:
        cents = int((Decimal(t) * 100).to_integral_value())
    except InvalidOperation as e:
        raise ParseError(f"bad amount: {text!r}") from e
    return -cents if neg else cents


_DATE_FORMATS = ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d", "%d/%m/%y", "%d.%m.%y", "%d-%m-%y")


def parse_date(text: str) -> str:
    t = (text or "").strip().split(" ")[0].split("T")[0]
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(t, fmt).date().isoformat()
        except ValueError:
            continue
    raise ParseError(f"bad date: {text!r}")


# ---------------------------------------------------------------- CSV

_DATE = ["ΗΜΕΡΟΜΗΝΙΑ ΣΥΝΑΛΛΑΓΗΣ", "TRANSACTION DATE", "BOOKING DATE", "ΗΜΕΡΟΜΗΝΙΑ", "ΗΜ/ΝΙΑ", "DATE"]
_DESC = ["ΠΕΡΙΓΡΑΦΗ", "ΑΙΤΙΟΛΟΓΙΑ", "ΣΤΟΙΧΕΙΑ", "DESCRIPTION", "DETAILS", "NARRATIVE", "REASON"]
_COUNTER = ["ΔΙΚΑΙΟΥΧΟΣ", "ΑΝΤΙΣΥΜΒΑΛΛΟΜΕΝΟΣ", "ΕΝΤΟΛΕΑΣ", "COUNTERPARTY", "BENEFICIARY", "ORDERING"]
_INDICATOR = ["ΧΡΕΩΣΗ/ΠΙΣΤΩΣΗ", "ΠΙΣΤΩΣΗ/ΧΡΕΩΣΗ", "ΧΡ/ΠΙΣ", "DEBIT/CREDIT", "CREDIT/DEBIT", "DR/CR", "D/C"]
_DEBIT = ["ΧΡΕΩΣΗ", "DEBIT"]
_CREDIT = ["ΠΙΣΤΩΣΗ", "CREDIT"]
_AMOUNT = ["ΠΟΣΟ", "AMOUNT"]


def _find(headers, candidates, exclude=()):
    for cand in candidates:
        for i, h in enumerate(headers):
            if i not in exclude and cand in h:
                return i
    return None


def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1253", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ParseError("cannot decode file")


def parse_csv(raw: bytes, account: str = "") -> list[dict]:
    text = _decode(raw)
    lines = [l for l in text.splitlines() if l.strip()]
    if not lines:
        raise ParseError("empty file")
    sample = "\n".join(lines[:30])
    delim = max(";,\t|", key=sample.count)
    rows = list(csv.reader(lines, delimiter=delim))

    header_idx = cols = None
    for i, row in enumerate(rows[:40]):
        h = [norm(c) for c in row]
        d = _find(h, _DATE)
        if d is None:
            continue
        ind = _find(h, _INDICATOR)
        excl = {ind} if ind is not None else set()
        deb, cre = _find(h, _DEBIT, excl), _find(h, _CREDIT, excl)
        amt = _find(h, _AMOUNT, excl)
        if (deb is not None and cre is not None and deb != cre) or amt is not None:
            header_idx = i
            cols = dict(date=d, desc=_find(h, _DESC), counter=_find(h, _COUNTER),
                        ind=ind, deb=deb, cre=cre, amt=amt)
            break
    if cols is None:
        raise ParseError(
            "Could not find the header row (need a date column and either an amount "
            "column or separate debit/credit columns). Send a sample file so the "
            "parser can be adapted to this bank's layout."
        )

    def cell(row, key):
        idx = cols[key]
        return row[idx].strip() if idx is not None and idx < len(row) else ""

    split = cols["deb"] is not None and cols["cre"] is not None and cols["deb"] != cols["cre"]
    out = []
    for row in rows[header_idx + 1:]:
        if not row or not cell(row, "date"):
            continue
        try:
            tx_date = parse_date(cell(row, "date"))
        except ParseError:
            continue  # footer / totals rows
        if split:
            d, c = cell(row, "deb"), cell(row, "cre")
            if c and parse_amount(c) != 0:
                cents = abs(parse_amount(c))
            elif d and parse_amount(d) != 0:
                cents = -abs(parse_amount(d))
            else:
                continue
        else:
            raw_amt = cell(row, "amt")
            if not raw_amt:
                continue
            cents = parse_amount(raw_amt)
            if cols["ind"] is not None:
                flag = norm(cell(row, "ind"))
                if flag.startswith(("Χ", "D")):
                    cents = -abs(cents)
                elif flag.startswith(("Π", "C")):
                    cents = abs(cents)
        out.append(dict(tx_date=tx_date, amount_cents=cents, description=cell(row, "desc"),
                        counterparty=cell(row, "counter"), account=account, currency="EUR"))
    return out


# ---------------------------------------------------------------- MT940

_T61 = re.compile(r"^(\d{6})(\d{4})?(RC|RD|C|D)[A-Z]?(\d+(?:,\d*)?)")


def parse_mt940(raw: bytes, account: str = "") -> list[dict]:
    text = _decode(raw)
    blocks, cur = [], None
    for line in text.splitlines():
        if line.startswith(":"):
            m = re.match(r"^:(\d{2}[A-Z]?):(.*)$", line)
            if m:
                cur = [m.group(1), m.group(2)]
                blocks.append(cur)
            continue
        if cur is not None and line.strip() and not line.startswith(("-", "{", "}")):
            cur[1] += "\n" + line.strip()

    acct, out, i = account, [], 0
    while i < len(blocks):
        tag, val = blocks[i]
        if tag == "25" and not account:
            acct = val.strip().split("/")[-1]
        if tag == "61":
            m = _T61.match(val)
            if not m:
                raise ParseError(f"cannot parse :61: line {val!r}")
            yymmdd, _, mark, amt = m.groups()
            tx_date = date(2000 + int(yymmdd[:2]), int(yymmdd[2:4]), int(yymmdd[4:6])).isoformat()
            cents = abs(parse_amount(amt if "," in amt else amt + ",00"))
            if mark in ("D", "RC"):
                cents = -cents
            desc = counter = ""
            if i + 1 < len(blocks) and blocks[i + 1][0] == "86":
                info = blocks[i + 1][1].replace("\n", "")
                if "?" in info:
                    sub = dict(re.findall(r"\?(\d{2})([^?]*)", info))
                    desc = " ".join(sub[k] for k in sorted(sub) if "20" <= k <= "29").strip()
                    counter = " ".join(sub.get(k, "") for k in ("32", "33")).strip()
                else:
                    desc = info.replace("\n", " ").strip()
                i += 1
            out.append(dict(tx_date=tx_date, amount_cents=cents, description=desc,
                            counterparty=counter, account=acct, currency="EUR"))
        i += 1
    return out


def parse_statement(raw: bytes, account: str = "") -> list[dict]:
    """Auto-detect MT940 vs CSV."""
    head = raw[:4000].decode("latin-1", errors="ignore")
    if ":61:" in head or ":20:" in head:
        return parse_mt940(raw, account)
    return parse_csv(raw, account)
