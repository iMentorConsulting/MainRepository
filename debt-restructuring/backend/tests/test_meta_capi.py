"""Run from the backend folder:  python -m unittest tests.test_meta_capi -v"""
import hashlib
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ.setdefault("SECRET_KEY", "test")

import meta_capi  # noqa: E402


def sha(v):
    return hashlib.sha256(v.encode()).hexdigest()


class HashingTests(unittest.TestCase):
    def test_email_lowercase_trim(self):
        self.assertEqual(meta_capi.hash_email("  Foo@Example.COM "), sha("foo@example.com"))
        self.assertIsNone(meta_capi.hash_email(""))
        self.assertIsNone(meta_capi.hash_email("not-an-email"))

    def test_greek_phone_e164_without_plus(self):
        expected = sha("306912345678")
        for raw in ["6912345678", "+306912345678", "306912345678", "0030 691 234 5678", "+30306912345678"]:
            self.assertEqual(meta_capi.hash_phone(raw), expected, raw)
        self.assertIsNone(meta_capi.hash_phone(""))

    def test_names(self):
        self.assertEqual(meta_capi.hash_name("  Δημήτρης "), sha("δημήτρης"))
        self.assertEqual(meta_capi.split_name("Ιωάννης"), ("Ιωάννης", ""))
        self.assertEqual(meta_capi.split_name(""), ("", ""))

    def test_name_order(self):
        # agent-typed, ALL-CAPS: surname first
        self.assertEqual(meta_capi.split_name("ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ"), ("ΓΙΩΡΓΟΣ", "ΠΑΠΑΔΟΠΟΥΛΟΣ"))
        # Facebook-style «first last»
        self.assertEqual(meta_capi.split_name("Dimitris Papadatos"), ("Dimitris", "Papadatos"))
        self.assertEqual(meta_capi.split_name("Γιώργος Παπαδόπουλος"), ("Γιώργος", "Παπαδόπουλος"))

    def test_explicit_first_last_win(self):
        lead = SimpleNamespace(name="ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ", first_name="Γιώργος", last_name="Παπαδόπουλος", email="", phone="")
        ud = meta_capi.build_user_data(lead)
        self.assertEqual(ud["fn"], [sha("γιώργος")])
        self.assertEqual(ud["ln"], [sha("παπαδόπουλος")])
        lead2 = SimpleNamespace(name="ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΙΩΡΓΟΣ", email="", phone="")   # no explicit columns → heuristic
        ud2 = meta_capi.build_user_data(lead2)
        # ALL-CAPS Greek has no accents, so the lowercase form is «γιωργος» (final sigma handled by Python)
        self.assertEqual(ud2["fn"], [sha("γιωργος")])
        self.assertEqual(ud2["ln"], [sha("παπαδοπουλος")])

    def test_user_data_omits_missing_fields(self):
        lead = SimpleNamespace(name="Ιωάννης", email="", phone="6912345678")
        ud = meta_capi.build_user_data(lead)
        self.assertEqual(set(ud), {"ph", "fn"})
        self.assertEqual(ud["ph"], [sha("306912345678")])


class EventTests(unittest.TestCase):
    lead = SimpleNamespace(id=42, name="Dimitris Papadatos", email="D@x.gr", phone="6912345678", offer_amount="1.250,50")

    def test_event_shape(self):
        ev = meta_capi.build_event(self.lead, event_time=1700000000)
        self.assertEqual(ev["event_time"], 1700000000)
        self.assertEqual(ev["event_id"], "exo-lead-42-deal")
        self.assertEqual(ev["event_name"], "Purchase")
        self.assertEqual(ev["custom_data"], {"currency": "EUR", "value": 1250.5})
        self.assertEqual(set(ev["user_data"]), {"em", "ph", "fn", "ln"})
        for hashes in ev["user_data"].values():
            self.assertRegex(hashes[0], r"^[0-9a-f]{64}$")

    def test_purchase_without_amount_has_zero_value(self):
        lead = SimpleNamespace(id=1, name="A B", email="a@b.gr", phone="", offer_amount="")
        self.assertEqual(meta_capi.build_event(lead)["custom_data"], {"currency": "EUR", "value": 0})

    def test_send_requires_token(self):
        with mock.patch.dict(os.environ, {"META_CAPI_TOKEN": ""}):
            ok, err = meta_capi.send_event({"event_name": "x"})
        self.assertFalse(ok)
        self.assertIn("META_CAPI_TOKEN", err)

    def test_send_posts_to_graph_api_and_never_leaks_token(self):
        env = {"META_CAPI_TOKEN": "SECRET-TOKEN", "META_CAPI_TEST_EVENT_CODE": "TEST123"}
        with mock.patch.dict(os.environ, env), mock.patch("meta_capi.requests.post") as post:
            post.return_value = mock.Mock(status_code=200, json=lambda: {"events_received": 1}, text="{}")
            ok, err = meta_capi.send_event({"event_name": "Purchase"})
            self.assertTrue(ok)
            url = post.call_args.args[0]
            body = post.call_args.kwargs["json"]
            self.assertIn("/1152400940658328/events", url)
            self.assertNotIn("SECRET-TOKEN", url)           # token travels in the body, not the URL
            self.assertEqual(body["access_token"], "SECRET-TOKEN")
            self.assertEqual(body["test_event_code"], "TEST123")
            post.return_value = mock.Mock(status_code=400, text="bad SECRET-TOKEN request")
            ok, err = meta_capi.send_event({"event_name": "Purchase"})
            self.assertFalse(ok)
            self.assertNotIn("SECRET-TOKEN", err)


class LeadFlowTests(unittest.TestCase):
    """PATCH status → DEAL fires exactly one event."""

    @classmethod
    def setUpClass(cls):
        import warnings
        warnings.filterwarnings("ignore")
        from fastapi.testclient import TestClient
        import main
        from auth_utils import get_current_user
        main.app.dependency_overrides[get_current_user] = lambda: "HARIS"
        cls.client = TestClient(main.app)
        from database import SessionLocal
        from models import Lead
        db = SessionLocal()
        lead = Lead(name="Dimitris Papadatos", phone="306909934051", email="d@x.gr", status="HOT")
        db.add(lead); db.commit(); cls.lead_id = lead.id; db.close()

    def test_one_event_per_conversion(self):
        env = {"META_CAPI_TOKEN": "T"}
        with mock.patch.dict(os.environ, env), mock.patch("meta_capi.requests.post") as post:
            post.return_value = mock.Mock(status_code=200, json=lambda: {"events_received": 1}, text="{}")
            r = self.client.patch(f"/leads/{self.lead_id}", json={"status": "ACTIVE"})
            self.assertEqual(post.call_count, 0)                      # not a conversion
            r = self.client.patch(f"/leads/{self.lead_id}", json={"status": "DEAL"})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(post.call_count, 1)                      # conversion
            event = post.call_args.kwargs["json"]["data"][0]
            self.assertEqual(event["event_id"], f"exo-lead-{self.lead_id}-deal")
            self.client.patch(f"/leads/{self.lead_id}", json={"status": "HOT"})
            self.client.patch(f"/leads/{self.lead_id}", json={"status": "DEAL"})
            self.assertEqual(post.call_count, 1)                      # never twice
            d = self.client.get(f"/leads/{self.lead_id}").json()
            self.assertTrue(d["capi_sent_at"])
            self.assertEqual(d["capi_error"], "")


if __name__ == "__main__":
    unittest.main()
