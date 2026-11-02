import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    for k in ("APP_PASSWORD", "VIBER_TOKEN", "VIBER_RECEIVER", "VIBER_PAIR_CODE"):
        monkeypatch.delenv(k, raising=False)
    return tmp_path


class FakeNotifier:
    def __init__(self, fail=False):
        self.sent, self.fail = [], fail

    def send(self, text):
        if self.fail:
            raise RuntimeError("viber down")
        self.sent.append(text)
