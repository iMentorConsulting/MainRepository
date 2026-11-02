"""One-off: register the webhook with Viber.   python -m app.viber_setup https://YOUR.DOMAIN/viber/webhook"""
import sys

from .config import get_settings
from .notify import set_viber_webhook

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python -m app.viber_setup https://your.domain/viber/webhook")
    token = get_settings().viber_token
    if not token:
        sys.exit("Set VIBER_TOKEN first.")
    print(set_viber_webhook(token, sys.argv[1]))
