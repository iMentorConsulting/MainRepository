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

Planned: link credits to Income / AADE myDATA invoices by ΑΦΜ, live bank feed via PSD2, accountant export.
