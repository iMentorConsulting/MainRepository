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
the bank's own login page; after you approve, the consent is stored (until the date NBG reports, ~180 days) and the last
90 days are fetched. Piraeus also asks for an SMS code, typed into the card. Afterwards the app checks every 10 minutes
(08:00-21:50) and alerts on new credits exactly like a file import. **↻ Ανανέωση τώρα** fetches immediately.
A Viber message and a banner appear 7 days before a consent expires.

NBG API (Aggregator Account Information API v1.1): OAuth2 client-credentials token + `Client-Id`; per call the headers
`X-Fapi-Interaction-Id`, `X-Client-User-Id`, `X-Fapi-Customer-Ip-Address` (customer IPv4 – the user's own IP on a click,
the last known one for scheduled runs, or `NBG_PSU_IP`), `X-Subject-Bank-Bic`, and `Sandbox_Id` in the sandbox.

Set-up checklist (details in the NBG portal guide):
1. developer.nbg.gr → APPS → create an Organization → **ADD AN APPLICATION**; redirect URI
   `https://finance.i-mentor.gr/api/bank/callback`; store the Client ID / Secret.
2. API PRODUCTS → Account Aggregation Platform → **Start using this API** → choose the app.
3. Railway variables of the Finance service: `BANK_PROVIDER=nbg`, `NBG_CLIENT_ID`, `NBG_CLIENT_SECRET`, `NBG_ENV=sandbox`,
   `NBG_SANDBOX_ID` (see `backend/.env.example`). Never put the secret in code or chat.
4. On the Τράπεζες page (real provider only): **Δημιουργία sandbox** once (sandbox environment), then **Έλεγχος σύνδεσης NBG**, which
   verifies the credentials and shows whether our bank codes (BICs) match NBG's list. (CLI equivalents: `npm run nbg:sandbox`, `npm run nbg:banks`.)
5. In the app: Τράπεζες → Σύνδεση on a bank (sandbox logins are in NBG's guide). Later switch `NBG_ENV=production`.

Code: `services/bankProviders/` (`nbgAggregator.js` real, `mock.js` for tests), `bankSync.js`, `bankScheduler.js`,
`routes/bankCallback.js` (public redirect target, protected by a signed `state`; falls back to the connectionId NBG appends).
`npm test` runs everything; the NBG client is tested against a fake server that enforces the published spec.
Open points to confirm in the sandbox: date format of `dateFrom/dateTo`, whether `amount` is signed, and what Alpha/Eurobank/Piraeus
return in `relatedName/relatedAccount` (NBG says only NBG accounts include the counterparty IBAN and full description).

Planned: link credits to Income / AADE myDATA invoices by ΑΦΜ, live bank feed via PSD2, accountant export.
