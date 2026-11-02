from datetime import date

from app import db
from app.categorize import categorize
from app.config import get_settings
from app.ingest import format_eur, ingest
from app.parsers import parse_amount, parse_csv, parse_mt940, parse_statement
from conftest import FakeNotifier

TODAY = date(2026, 11, 2)

CSV_SPLIT = """Κίνηση λογαριασμού GR12345
Ημερομηνία;Αιτιολογία;Χρέωση;Πίστωση;Υπόλοιπο
01/11/2026;ΕΙΣΟΔΗΜΑ ΑΠΟ ACME ΑΕ ΤΙΜ 123;;1.234,56;10.000,00
31/10/2026;ΔΕΗ ΛΟΓΑΡΙΑΣΜΟΣ;85,20;;8.765,44
31/10/2026;ΕΞΟΔΑ ΤΡΑΠΕΖΑΣ;2,50;;8.762,94
Σύνολο;;87,70;1.234,56;
""".encode("cp1253")

CSV_SIGNED = "Date,Description,Amount\n2026-11-01,Customer payment,\"1,500.00\"\n2026-11-01,Rent,-800.00\n"

MT940 = """:20:STMT
:25:GR1601101250000000012300695
:28C:1/1
:60F:C261031EUR1000,00
:61:2611011101C1234,56NTRFNONREF
:86:?20ΠΛΗΡΩΜΗ ΤΙΜ 55?32ACME ΑΕ
:61:2611021102D99,90NTRFNONREF
:86:?20COSMOTE ΛΟΓ?32COSMOTE
:62F:C261102EUR2134,66
""".encode("utf-8")


def test_amounts():
    assert parse_amount("1.234,56") == 123456
    assert parse_amount("1,234.56") == 123456
    assert parse_amount("-12.50") == -1250
    assert parse_amount("(12,00)") == -1200
    assert parse_amount("1.234") == 123400


def test_csv_split_columns_with_preamble_and_footer():
    rows = parse_csv(CSV_SPLIT)
    assert [r["amount_cents"] for r in rows] == [123456, -8520, -250]
    assert rows[0]["tx_date"] == "2026-11-01"


def test_csv_signed_amount():
    assert [r["amount_cents"] for r in parse_csv(CSV_SIGNED.encode())] == [150000, -80000]


def test_mt940_and_autodetect():
    rows = parse_statement(MT940)
    assert [r["amount_cents"] for r in rows] == [123456, -9990]
    assert rows[0]["counterparty"] == "ACME ΑΕ" and rows[0]["account"].endswith("0695")


def test_categorize():
    assert categorize("ΠΛΗΡΩΜΗ ΔΕΗ ΑΕ") == "Λογαριασμοί (ΔΕΗ/νερό/τηλ.)"
    assert categorize("ΕΙΣΦΟΡΕΣ ΕΦΚΑ 10/2026") == "Ασφαλιστικές εισφορές"
    assert categorize("something random") == ""


def test_ingest_dedup_notify_and_age(env):
    s = get_settings()
    conn = db.connect(s.db_path)
    n = FakeNotifier()
    rows = parse_csv(CSV_SPLIT)
    r1 = ingest(conn, "alpha", rows, n, s, today=TODAY)
    assert r1["new"] == 3 and r1["notified"] == 1          # only the credit
    assert "1.234,56 €" in n.sent[0] and "Alpha Bank" in n.sent[0]
    r2 = ingest(conn, "alpha", rows, n, s, today=TODAY)    # same statement again
    assert r2["new"] == 0 and len(n.sent) == 1
    old = [dict(rows[0], tx_date="2026-01-01", amount_cents=999)]
    assert ingest(conn, "alpha", old, n, s, today=TODAY)["notified"] == 0  # too old to ping
    cats = {r["description"]: r["category"] for r in conn.execute("SELECT * FROM transactions")}
    assert cats["ΔΕΗ ΛΟΓΑΡΙΑΣΜΟΣ"].startswith("Λογαριασμοί")


def test_identical_rows_same_day_are_both_kept(env):
    s = get_settings(); conn = db.connect(s.db_path)
    row = dict(tx_date="2026-11-01", amount_cents=5000, description="POS", counterparty="", account="")
    assert ingest(conn, "piraeus", [row, row], FakeNotifier(), s, today=TODAY)["new"] == 2
    assert ingest(conn, "piraeus", [row, row], FakeNotifier(), s, today=TODAY)["new"] == 0


def test_notify_failure_keeps_data_and_retries_nothing_lost(env):
    s = get_settings(); conn = db.connect(s.db_path)
    r = ingest(conn, "eurobank", parse_csv(CSV_SPLIT), FakeNotifier(fail=True), s, today=TODAY)
    assert r["new"] == 3 and r["notified"] == 0 and "viber down" in r["notify_error"]
    assert conn.execute("SELECT COUNT(*) FROM transactions WHERE notified=1").fetchone()[0] == 0


def test_format_eur():
    assert format_eur(123456) == "1.234,56 €" and format_eur(-5) == "-0,05 €"
