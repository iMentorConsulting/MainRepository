# Bank Monitor

Shows new bank **credits (πιστώσεις)** and **debits (χρεώσεις)** from Alpha Bank, Πειραιώς and Eurobank in one
screen, sends a **Viber** message when new money arrives, and lets you keep a note, a category and an
"invoice issued?" mark per transaction. Debits are categorized automatically (editable keyword rules).

## Status

| Piece | State |
|---|---|
| Statement import (CSV + MT940), dedupe, categories, notes, invoice flag, web UI | working, tested |
| Viber alerts + pairing | implemented, tested with a mocked Viber API; **needs a first live test with your bot** |
| Bank CSV layouts | generic header detection (Greek/English). **Not yet verified against real exports** - send one sample per bank |
| Live bank connection (PSD2 aggregator) | **not built yet** - next phase, see below |
| AADE myDATA matching, accountant export | not built yet (phase 2) |

The app deliberately never stores or types your e-banking credentials.

## Run

```bash
cd bank-monitor
pip install -r requirements.txt
cp .env.example .env        # edit it, then: export $(grep -v '^#' .env | xargs)
python -m uvicorn app.main:app --port 8000
```
Open http://localhost:8000. Tests: `python -m pytest`.

## Getting transactions in

1. **Upload** a statement in the web page, or
2. **Drop files** into `data/inbox/alpha|piraeus|eurobank/` - checked every `POLL_SECONDS`, then moved to `processed/`
   (or `failed/` with the error in the log).

Export from corporate e-banking as MT940 if offered (most reliable), otherwise CSV.
Re-importing overlapping statements is safe: duplicates are skipped.

## Viber setup (once)

1. Create a bot at https://partners.viber.com, copy its token into `VIBER_TOKEN`.
2. The app must be reachable over **HTTPS** (Viber requires it). Register the webhook:
   `python -m app.viber_setup https://YOUR.DOMAIN/viber/webhook`
3. In Viber, open the bot and send `/pair <VIBER_PAIR_CODE>`. It remembers you and replies "Συνδέθηκε".
   (Or set `VIBER_RECEIVER` to your Viber user id directly.)

Until Viber is configured, alerts are written to the log instead. You are only notified about credits dated within
`NOTIFY_MAX_AGE_DAYS`, so importing an old statement does not spam you. A failed Viber call never loses an import.

## Security

Set `APP_PASSWORD` (HTTP Basic) before exposing the app beyond your own PC, and serve it over HTTPS.
Data lives in `data/bank.db` (SQLite) - back it up, keep it private.

## Categories

Edit the defaults in `app/categorize.py`, or put a `categories.json` in the data dir:
`{"Ενοίκιο": ["ΕΝΟΙΚΙΟ"], "Καύσιμα": ["SHELL", "EKO"]}`. Matching ignores case and accents. Your manual edits are never overwritten.

## Next: removing the manual download (live feed)

Add a provider that pulls transactions through PSD2 (GoCardless Bank Account Data, Tink, Salt Edge, Yapily or the
banks' own APIs) and passes them to `ingest()` - the rest of the app stays unchanged. Check first that the
aggregator supports your **corporate** accounts at all three banks.
