import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from app import notify
from app.main import app
from test_core import CSV_SPLIT


@pytest.fixture
def client(env):
    with TestClient(app) as c:
        yield c


def test_import_list_update(client):
    r = client.post("/api/import", data={"bank": "alpha"}, files={"file": ("a.csv", CSV_SPLIT)})
    assert r.status_code == 200 and r.json()["new"] == 3
    credits = client.get("/api/transactions", params={"direction": "credit"}).json()
    assert len(credits) == 1 and credits[0]["invoice_issued"] is None
    tid = credits[0]["id"]
    u = client.patch(f"/api/transactions/{tid}", json={"note": "Πελάτης ΑΦΜ 123", "invoice_issued": True, "seen": True})
    assert u.json()["invoice_issued"] == 1 and u.json()["note"] == "Πελάτης ΑΦΜ 123"
    assert client.get("/api/summary").json()["credits_without_invoice"] == 0
    # clearing the mark again
    assert client.patch(f"/api/transactions/{tid}", json={"invoice_issued": None}).json()["invoice_issued"] is None
    assert client.get("/api/transactions", params={"q": "ΔΕΗ"}).json()[0]["category"].startswith("Λογαριασμοί")


def test_bad_file_gives_clear_error(client):
    r = client.post("/api/import", data={"bank": "alpha"}, files={"file": ("x.csv", b"foo;bar\n1;2\n")})
    assert r.status_code == 422 and "header" in r.json()["detail"]


def test_password_protection(env, monkeypatch):
    monkeypatch.setenv("APP_PASSWORD", "s3cret")
    with TestClient(app) as c:
        assert c.get("/api/summary").status_code == 401
        assert c.get("/api/summary", auth=("me", "wrong")).status_code == 401
        assert c.get("/api/summary", auth=("me", "s3cret")).status_code == 200


def test_viber_pairing(env, monkeypatch):
    monkeypatch.setenv("VIBER_TOKEN", "tok")
    monkeypatch.setenv("VIBER_PAIR_CODE", "open-sesame")
    sent = []
    monkeypatch.setattr(notify.ViberNotifier, "send_to", lambda self, rcv, text: sent.append((rcv, text)))
    body = json.dumps({"event": "message", "sender": {"id": "USER123"}, "message": {"text": "/pair open-sesame"}}).encode()
    sig = hmac.new(b"tok", body, hashlib.sha256).hexdigest()
    with TestClient(app) as c:
        assert c.post("/viber/webhook", content=body, headers={"X-Viber-Content-Signature": "nope"}).status_code == 403
        assert c.post("/viber/webhook", content=body, headers={"X-Viber-Content-Signature": sig}).status_code == 200
        assert sent and sent[0][0] == "USER123"
        # now imports notify that user
        c.post("/api/import", data={"bank": "alpha"}, files={"file": ("a.csv", CSV_SPLIT)})
    # wrong pair code must not pair
    bad = json.dumps({"event": "message", "sender": {"id": "EVIL"}, "message": {"text": "/pair guess"}}).encode()
    sent.clear()
    with TestClient(app) as c:
        c.post("/viber/webhook", content=bad, headers={"X-Viber-Content-Signature": hmac.new(b"tok", bad, hashlib.sha256).hexdigest()})
    assert not sent


def test_viber_notifier_payload():
    calls = []

    class C:
        def post(self, url, headers, json):
            calls.append((url, headers, json))
            class R:
                def json(self_): return {"status": 0}
            return R()

    notify.ViberNotifier("tok", "U1", "Bank Monitor", client=C()).send("hi")
    url, headers, js = calls[0]
    assert url.endswith("/send_message") and headers["X-Viber-Auth-Token"] == "tok"
    assert js["receiver"] == "U1" and js["type"] == "text"
