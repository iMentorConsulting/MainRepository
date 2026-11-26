# Τράπεζες (bank movements) module

Sidebar → **Τράπεζες**. Import the statement from corporate e-banking (Alpha / Πειραιώς / Eurobank, MT940 or CSV).
Each movement gets a note, a category (debits are categorized automatically) and, for credits, an
"invoice issued" mark. New credits trigger a Viber message (existing Chatwoot sender) and a live toast.

- Duplicates are skipped, so overlapping statements are safe to re-import.
- Alerts only for movements dated within `BANK_NOTIFY_MAX_AGE_DAYS` (default 3).
- A failed Viber call never loses an import (the error is shown in the import toast).
- Category rules: `backend/src/services/bankCategorize.js`. Hand-typed categories are never overwritten.
- Bank CSV layouts are auto-detected (Greek/English headers, split or signed amounts). If a bank's file is rejected,
  the error says so - send a sample and the parser can be adapted.

API (all under `/api/bank`, JWT-protected): `GET /transactions`, `GET /summary`, `PATCH /transactions/:id`,
`POST /mark-seen`, `POST /import` (multipart `bank`, `file`).

Tests: `cd backend && npm test` (parsers/categories). Add `BANK_E2E_DATABASE_URL=postgres://...` to also run the
database test (it DROPS and recreates the `bank_transactions` table - use a scratch database).

## Automatic fetch (bank connections)
Τράπεζες → **Αυτόματη σύνδεση τραπεζών**: one card per bank (NBG, Alpha, Πειραιώς, Eurobank). **Σύνδεση** sends you to
the bank's own login page; after you approve, the consent is stored (180 days) and the last 90 days are fetched.
Afterwards the app checks every 10 minutes (08:00-21:50) and alerts on new credits exactly like a file import.
**↻ Ανανέωση τώρα** fetches immediately. A Viber message and a banner appear 7 days before a consent expires.
- Provider code: `services/bankProviders/` (`mock.js` works today; `nbgAggregator.js` waits for NBG's sandbox spec).
- Redirect URL to register at NBG: `https://finance.i-mentor.gr/api/bank/callback` (public, protected by a signed `state`).
- Credentials live in Railway variables (`NBG_BASE_URL`, `NBG_CLIENT_ID`, `NBG_CLIENT_SECRET`), never in code.
- Set `BANK_PROVIDER=mock` only on a test deployment: it invents transactions.
- A bank-supplied transaction id (`external_id`) is used for de-duplication when the provider returns one.

Planned: link credits to Income / AADE myDATA invoices by ΑΦΜ, live bank feed via PSD2, accountant export.
