"""Settings, read from environment on every call so tests can override them."""
import os
from dataclasses import dataclass
from pathlib import Path

BANKS = {"alpha": "Alpha Bank", "piraeus": "Πειραιώς", "eurobank": "Eurobank"}


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    app_password: str
    viber_token: str
    viber_receiver: str
    viber_pair_code: str
    viber_sender_name: str
    poll_seconds: int
    notify_max_age_days: int
    notify_debits: bool

    @property
    def db_path(self) -> Path:
        return self.data_dir / "bank.db"

    @property
    def inbox_dir(self) -> Path:
        return self.data_dir / "inbox"


def get_settings() -> Settings:
    env = os.environ.get
    return Settings(
        data_dir=Path(env("DATA_DIR", "data")),
        app_password=env("APP_PASSWORD", ""),
        viber_token=env("VIBER_TOKEN", ""),
        viber_receiver=env("VIBER_RECEIVER", ""),
        viber_pair_code=env("VIBER_PAIR_CODE", ""),
        viber_sender_name=env("VIBER_SENDER_NAME", "Bank Monitor"),
        poll_seconds=int(env("POLL_SECONDS", "60")),
        notify_max_age_days=int(env("NOTIFY_MAX_AGE_DAYS", "3")),
        notify_debits=env("NOTIFY_DEBITS", "false").lower() in ("1", "true", "yes"),
    )
