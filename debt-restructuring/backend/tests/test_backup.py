"""Run from the backend folder:  python -m unittest tests.test_backup -v"""
import gzip
import hashlib
import json
import os
import pathlib
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest import mock

_tmp = tempfile.mkdtemp()
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("SECRET_KEY", "test")

from sqlalchemy import create_engine, func, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

import backup  # noqa: E402
import models  # noqa: E402
from database import Base  # noqa: E402


def make_engine(name):
    eng = create_engine(f"sqlite:///{_tmp}/{name}.db")
    Base.metadata.create_all(eng)
    return eng


def populate(eng):
    """At least one row in EVERY table, with datetimes / JSON / unicode / booleans."""
    t = datetime(2026, 11, 7, 12, 30, 45, 123456)
    with Session(eng) as s:
        case = models.Case(client_name="ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ", employee="SOFIA", client_vat="012345678",
                           debts=[{"type": "Τράπεζα", "amount": 1000.5}], income_data={"x": [1, 2, {"y": None}]},
                           service_type="ΠΤΩΧΕΥΣΗ", bankruptcy={"stage": "Άντληση Στοιχείων", "fee_office": 600},
                           commercial_offer={"application_fee": 500}, portal_visits=[{"at": "2026-01-01", "ip": "1.1.1.1"}],
                           external_data={"k": "ν"}, created_at=t, stage_changed_at=t)
        s.add(case)
        s.add(models.Lead(name="Dimitris Papadatos", phone="306909934051", email="d@x.gr", status="DEAL", first_name="Dimitris",
                          last_name="Papadatos", month_sheet="ΝΟΕ", sheet_comments="σχόλιο", extra_fields={"a": 1},
                          app_comments=[{"text": "ok", "author": "H", "at": "2026-01-01"}], phone2="2810", capi_error="x",
                          taxisnet_username="u", taxisnet_password="p", app_next_call=t, created_at=t))
        s.add(models.AppConfig(key="pricing", value=json.dumps({"a": "ελληνικά"}, ensure_ascii=False)))
        s.add(models.FinancePayment(case_id=1, external_id="exo-1-x", amount_collected=10.5, vat_amount=2.52, paid_to="APOSTOLAKIS", sent_at=t))
        s.add(models.IrisPayment(payment_id="P1", customer_name="Κ", net_amount=1, vat_amount=0.24, total_amount=1.24,
                                 raw_initiation_response={"r": [1]}, paid_at=t, expires_at=t))
        s.add(models.Notification(recipient="HARIS", title="t", message="m", delivered=True, created_at=t))
        s.add(models.ThemisSession(lead_id=1, transcript=[{"role": "themis", "text": "Γεια"}], status="done"))
        s.add(models.CallAttempt(lead_id=1, consultant="SOFIA", answered=True, duration_seconds=42, notes="ν"))
        s.add(models.ViberMessage(lead_id=1, consultant="SOFIA", message="μήνυμα", success=True))
        s.add(models.AccountantAssignment(employee="STELLA", accountant_id="A1", notes="n"))
        s.commit()


def table_rows(eng):
    with eng.connect() as c:
        return {t.name: [dict(r) for r in c.execute(select(t).order_by(*t.primary_key.columns)).mappings()]
                for t in Base.metadata.sorted_tables}


class DumpAndRestoreTests(unittest.TestCase):
    def test_every_table_is_in_the_backup(self):
        eng = make_engine("src_all")
        populate(eng)
        payload = backup.build_backup_payload(engine=eng)
        model_tables = {t.name for t in Base.metadata.sorted_tables}
        self.assertEqual(set(payload["tables"]), model_tables)
        self.assertEqual(set(payload["counts"]), model_tables)
        for name in model_tables:
            self.assertGreater(payload["counts"][name], 0, f"{name} has no sample row — add one to populate()")
        # every column of every table is stored
        for t in Base.metadata.sorted_tables:
            self.assertEqual(set(payload["schema"][t.name]), {c.name for c in t.columns})
            self.assertEqual(set(payload["tables"][t.name][0]), {c.name for c in t.columns})

    def test_roundtrip_is_exact_for_every_table(self):
        src, dst = make_engine("src_rt"), make_engine("dst_rt")
        populate(src)
        payload = backup.decode_backup(backup.encode_backup(backup.build_backup_payload(engine=src)))  # through gzip
        result = backup.restore_from_payload(payload, wipe_first=True, engine=dst)
        self.assertTrue(result["ok"])
        self.assertEqual(table_rows(dst), table_rows(src))     # byte-for-byte equal data incl. datetimes, JSON, unicode

    def test_integrity_hash_detects_damage(self):
        eng = make_engine("src_int")
        populate(eng)
        payload = backup.build_backup_payload(engine=eng)
        backup.verify_payload(payload)                         # fine
        payload["tables"]["cases"][0]["client_name"] = "ΑΛΛΟΙΩΜΕΝΟ"
        with self.assertRaises(ValueError):
            backup.verify_payload(payload)
        payload2 = backup.build_backup_payload(engine=eng)
        payload2["counts"]["leads"] = 99
        with self.assertRaises(ValueError):
            backup.verify_payload(payload2)

    def test_damaged_gzip_is_rejected(self):
        eng = make_engine("src_gz")
        populate(eng)
        data = bytearray(backup.encode_backup(backup.build_backup_payload(engine=eng)))
        data[len(data) // 2] ^= 0xFF
        with self.assertRaises(Exception):
            backup.verify_payload(backup.decode_backup(bytes(data)))

    def test_dry_run_writes_nothing(self):
        src, dst = make_engine("src_dry"), make_engine("dst_dry")
        populate(src)
        payload = backup.build_backup_payload(engine=src)
        result = backup.restore_from_payload(payload, wipe_first=True, dry_run=True, engine=dst)
        self.assertTrue(result["dry_run"])
        self.assertEqual(result["tables"]["cases"]["inserted"], 1)
        self.assertTrue(all(len(rows) == 0 for rows in table_rows(dst).values()))

    def test_merge_keeps_newer_rows_and_overwrites_by_id(self):
        src, dst = make_engine("src_mg"), make_engine("dst_mg")
        populate(src)
        payload = backup.build_backup_payload(engine=src)
        backup.restore_from_payload(payload, wipe_first=True, engine=dst)
        with Session(dst) as s:                                  # live DB moved on after the backup
            s.get(models.Case, 1).client_name = "ΑΛΛΑΓΗ ΜΕΤΑ"
            s.add(models.Case(client_name="ΝΕΑ ΥΠΟΘΕΣΗ", employee="VALLIA"))
            s.commit()
        res = backup.restore_from_payload(payload, wipe_first=False, engine=dst)
        self.assertEqual(res["tables"]["cases"]["updated"], 1)
        with Session(dst) as s:
            self.assertEqual(s.get(models.Case, 1).client_name, "ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ")   # overwritten from backup
            self.assertEqual(s.query(models.Case).count(), 2)                              # new row kept

    def test_restore_is_atomic(self):
        src, dst = make_engine("src_at"), make_engine("dst_at")
        populate(src)
        payload = backup.build_backup_payload(engine=src)
        backup.restore_from_payload(payload, wipe_first=True, engine=dst)
        before = table_rows(dst)
        bad = json.loads(json.dumps(payload))
        bad["tables"]["viber_messages"][0]["lead_id"] = None          # violates NOT NULL → fails late in the run
        bad["integrity"]["tables_sha256"] = backup._tables_hash(bad["tables"])
        with self.assertRaises(Exception):
            backup.restore_from_payload(bad, wipe_first=True, engine=dst)
        self.assertEqual(table_rows(dst), before)                      # the failed wipe+restore changed nothing

    def test_old_format_1_backup_still_restores(self):
        old = {"cases": [{"id": 5, "client_name": "Παλιό", "employee": "SOFIA"}], "leads": [{"id": 6, "name": "L"}],
               "app_config": [{"key": "k", "value": "v"}]}
        self.assertEqual(backup.verify_payload(old)["format"], 1)
        from database import engine as default_engine
        Base.metadata.create_all(default_engine)           # legacy path works on the app's own database
        res = backup.restore_from_payload(old, dry_run=True)
        self.assertEqual((res["cases_inserted"], res["leads_inserted"]), (1, 1))

    def test_service_type_and_bankruptcy_survive(self):
        src, dst = make_engine("src_sb"), make_engine("dst_sb")
        populate(src)
        backup.restore_from_payload(backup.build_backup_payload(engine=src), wipe_first=True, engine=dst)
        with Session(dst) as s:
            c = s.get(models.Case, 1)
            self.assertEqual(c.service_type, "ΠΤΩΧΕΥΣΗ")
            self.assertEqual(c.bankruptcy["fee_office"], 600)


class RunBackupTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.env = mock.patch.dict(os.environ, {"BACKUP_LOCAL_DIR": self.dir, "GOOGLE_DRIVE_BACKUP_FOLDER_ID": "FOLDER"})
        self.env.start()
        self.eng = make_engine("run_" + str(id(self)))
        populate(self.eng)
        self.patches = [
            mock.patch.object(backup, "build_backup_payload", lambda engine=None: _orig_build(self.eng)),
            mock.patch.object(backup, "_set_status", lambda k, v: self.__dict__.setdefault("status", {}).update({k: v})),
            mock.patch.object(backup, "_get_status", lambda k: dict(self.__dict__.get("status", {}).get(k, {}))),
            mock.patch.object(backup.time, "sleep", lambda s: None),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.env.stop()

    def test_success_is_verified_and_recorded(self):
        def fake_upload(svc, folder, name, data, props):
            return {"id": "D1", "name": name, "size": str(len(data)), "md5Checksum": hashlib.md5(data).hexdigest()}
        with mock.patch.object(backup, "_get_drive_service", lambda: object()), \
             mock.patch.object(backup, "_drive_upload", fake_upload), mock.patch.object(backup, "_alert") as alert:
            r = backup.run_backup()
        self.assertTrue(r["ok"], r)
        self.assertTrue(r["drive_verified"])
        self.assertEqual(r["drive_backup"], "D1")
        alert.assert_not_called()
        files = list(pathlib.Path(self.dir).glob("Exodikastikos-backup_*.json.gz"))
        self.assertEqual(len(files), 1)
        self.assertEqual(hashlib.sha256(files[0].read_bytes()).hexdigest(), r["sha256"])
        self.assertEqual(self.status[backup.STATUS_KEY]["counts"]["cases"], 1)
        self.assertTrue(self.status[backup.STATUS_KEY]["last_drive_ok_at"])

    def test_corrupted_drive_upload_is_a_failure_and_alerts(self):
        def bad_upload(svc, folder, name, data, props):
            return {"id": "D2", "name": name, "size": str(len(data)), "md5Checksum": "0" * 32}
        with mock.patch.object(backup, "_get_drive_service", lambda: object()), \
             mock.patch.object(backup, "_drive_upload", bad_upload), mock.patch.object(backup, "_alert") as alert:
            r = backup.run_backup()
        self.assertFalse(r["ok"])
        self.assertIn("verification failed", r["drive_error"])
        alert.assert_called_once()
        self.assertTrue(r["local_backup"])                       # the local copy is still made

    def test_drive_outage_is_retried_then_alerts(self):
        calls = []
        def flaky(svc, folder, name, data, props):
            calls.append(1)
            raise ConnectionError("network down")
        with mock.patch.object(backup, "_get_drive_service", lambda: object()), \
             mock.patch.object(backup, "_drive_upload", flaky), mock.patch.object(backup, "_alert") as alert:
            r = backup.run_backup()
        self.assertEqual(len(calls), 3)                          # 3 attempts
        self.assertFalse(r["ok"])
        alert.assert_called_once()

    def test_missing_drive_folder_alerts(self):
        with mock.patch.dict(os.environ, {"GOOGLE_DRIVE_BACKUP_FOLDER_ID": ""}), mock.patch.object(backup, "_alert") as alert:
            r = backup.run_backup()
        self.assertFalse(r["ok"])
        alert.assert_called_once()

    def test_local_retention_keeps_newest_and_prunes_old(self):
        d = pathlib.Path(self.dir)
        old = []
        for i in range(6):
            f = d / f"Exodikastikos-backup_2026-01-0{i + 1}_00-00.json.gz"
            f.write_bytes(b"x")
            ts = (datetime.utcnow() - timedelta(days=30 + i)).timestamp()
            os.utime(f, (ts, ts))
            old.append(f)
        pruned = backup._prune_local()
        self.assertEqual(pruned, 3)                              # older than 7 days, except the 3 newest are kept
        self.assertEqual(len(list(d.glob("Exodikastikos-backup_*"))), 3)

    def test_freshness_watchdog(self):
        with mock.patch.object(backup, "_alert") as alert:
            self.assertTrue(backup.check_backup_freshness()["stale"])           # never backed up
            alert.assert_called_once()
        fresh = (datetime.utcnow() - timedelta(hours=3)).isoformat()
        self.status = {backup.STATUS_KEY: {"last_drive_ok_at": fresh}}
        with mock.patch.object(backup, "_alert") as alert:
            self.assertFalse(backup.check_backup_freshness()["stale"])
            alert.assert_not_called()
        old = (datetime.utcnow() - timedelta(hours=40)).isoformat()
        self.status = {backup.STATUS_KEY: {"last_drive_ok_at": old}}
        with mock.patch.object(backup, "_alert") as alert:
            self.assertTrue(backup.check_backup_freshness()["stale"])
            alert.assert_called_once()

    def test_restore_drill_proves_the_backup_is_restorable(self):
        data = backup.encode_backup(_orig_build(self.eng))
        meta = {"id": "D1", "name": "Exodikastikos-backup_x.json.gz", "createdTime": "2026-11-07T15:00:00Z"}
        with mock.patch.object(backup, "download_latest_from_drive", lambda: (meta, data)), mock.patch.object(backup, "_alert") as alert:
            r = backup.run_restore_drill()
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["cases"], 1)
        alert.assert_not_called()
        # a damaged backup must fail the drill and alert
        broken = bytearray(data)
        broken[len(broken) // 2] ^= 0xFF
        with mock.patch.object(backup, "download_latest_from_drive", lambda: (meta, bytes(broken))), mock.patch.object(backup, "_alert") as alert:
            r = backup.run_restore_drill()
        self.assertFalse(r["ok"])
        alert.assert_called_once()


_orig_build = backup.build_backup_payload

if __name__ == "__main__":
    unittest.main()
