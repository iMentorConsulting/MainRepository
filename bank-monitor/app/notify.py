"""Notifications. Viber bot is the real channel; Console is the fallback/test double."""
import hashlib
import hmac
import logging
from typing import Protocol

import httpx

log = logging.getLogger("bank-monitor.notify")
VIBER_API = "https://chatapi.viber.com/pa"


class NotifyError(RuntimeError):
    pass


class Notifier(Protocol):
    def send(self, text: str) -> None: ...


class ConsoleNotifier:
    """Used when Viber isn't configured yet. Messages go to the log."""

    def send(self, text: str) -> None:
        log.warning("[notification - Viber not configured]\n%s", text)


class ViberNotifier:
    def __init__(self, token: str, receiver: str, sender_name: str = "Bank Monitor", client=None):
        self.token, self.receiver, self.sender_name = token, receiver, sender_name
        self.client = client or httpx.Client(timeout=15)

    def send(self, text: str) -> None:
        self.send_to(self.receiver, text)

    def send_to(self, receiver: str, text: str) -> None:
        try:
            r = self.client.post(
                f"{VIBER_API}/send_message",
                headers={"X-Viber-Auth-Token": self.token},
                json={"receiver": receiver, "min_api_version": 1,
                      "sender": {"name": self.sender_name[:28]},
                      "type": "text", "text": text[:7000]},
            )
            body = r.json()
        except (httpx.HTTPError, ValueError) as e:
            raise NotifyError(f"Viber request failed: {e}") from e
        if body.get("status") != 0:
            raise NotifyError(f"Viber rejected message: {body.get('status_message', body)}")


def verify_viber_signature(token: str, body: bytes, signature: str) -> bool:
    expected = hmac.new(token.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def set_viber_webhook(token: str, url: str, client=None) -> dict:
    client = client or httpx.Client(timeout=15)
    r = client.post(f"{VIBER_API}/set_webhook", headers={"X-Viber-Auth-Token": token},
                    json={"url": url, "event_types": ["message", "subscribed", "conversation_started"]})
    return r.json()


def get_notifier(settings, conn) -> Notifier:
    from .db import kv_get

    receiver = settings.viber_receiver or kv_get(conn, "viber_receiver")
    if settings.viber_token and receiver:
        return ViberNotifier(settings.viber_token, receiver, settings.viber_sender_name)
    return ConsoleNotifier()
