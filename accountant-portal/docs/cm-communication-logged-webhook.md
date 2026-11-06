# `communication.logged` webhook — spec for Case Management

Logistis already pushes `case.created` and `document.uploaded` events to Case
Management's webhook (`CASE_MGMT_WEBHOOK_URL`, auth via `x-api-key:
CASES_API_KEY` — same as today). This adds one more event, fired whenever a
consultant sends one of these client-facing emails from a business's program
match and leaves "Ενημέρωση Case Management" checked (checked by default):

- Αναλυτικό email προγράμματος (`program-email`)
- Ανάλυση Επιλεξιμότητας Ταμείου Μικροπιστώσεων (`microcredits-eligibility`)
- Ενημέρωση & Επόμενα Βήματα (`eligibility-advice`)

## Request

```
POST {CASE_MGMT_WEBHOOK_URL}
x-api-key: {CASES_API_KEY}
Content-Type: application/json
```

```json
{
  "event": "communication.logged",
  "afm": "123456789",
  "onomasia": "ΔΟΚΙΜΗ ΕΠΕ",
  "programTitle": "ΕΣΠΑ Ψηφιακός Μετασχηματισμός",
  "program_category": "ΕΣΠΑ",
  "kind": "ADVICE",
  "channel": "EMAIL",
  "subject": "ΔΟΚΙΜΗ ΕΠΕ — Ενημέρωση & επόμενα βήματα για «ΕΣΠΑ Ψηφιακός Μετασχηματισμός»",
  "comment": "Εστάλη email «Ενημέρωση & Επόμενα Βήματα» για το πρόγραμμα «ΕΣΠΑ Ψηφιακός Μετασχηματισμός».",
  "leadStatus": "HOT",
  "reminderDate": "2026-11-20",
  "sentByName": "Γιώργος Παπαδόπουλος",
  "loggedAt": "2026-11-06T18:00:00.000Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `afm` | string | Always present. |
| `onomasia` | string\|null | Business name. |
| `programTitle` | string\|null | Exact program title in Logistis. |
| `program_category` | string | Same coarse categories already used in `case.created` (ΕΣΠΑ / ΔΥΠΑ / ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ / ΑΝΑΚΑΙΝΙΖΩ), derived the same way. |
| `kind` | string | `PROGRAM_EMAIL` \| `MICROCREDITS` \| `ADVICE` |
| `channel` | string | Always `EMAIL` today. |
| `subject` | string\|null | The email's subject line. |
| `comment` | string | Human-readable one-liner to append as a note/activity on the lead. |
| `leadStatus` | string\|null | One of `NEW` \| `WORKED` \| `CALL` \| `HOT` \| `ACTIVE` \| `DEAL` \| `CANCELLED`, or `null`/absent = don't change the lead's status. **Update (this matches CM's actual lead-status dropdown exactly now — NEW LEAD / WORKED / CALL / HOT / ACTIVE / DEAL / CANCEL):** the existing mapper (`NEW→NEW LEAD`, `HOT→HOT`, `CALL→CALL`, `ACTIVE→ACTIVE`, `CANCELLED→CANCEL`) needs two more identity entries added: `WORKED→WORKED` and `DEAL→DEAL`. |
| `reminderDate` | string\|null | `YYYY-MM-DD`, or `null`/absent = don't change. Set/replace the lead's follow-up/reminder date. |
| `sentByName` | string\|null | The consultant who sent it. |
| `loggedAt` | string | ISO timestamp. |

## What CM should do

1. **Find the lead** matching this `afm` + program (`programTitle` /
   `program_category`, same identifying fields `case.created` already sends)
   — if the client has more than one, use the most recent non-cancelled one
   for this program.
2. **Append `comment`** as a new note/activity on that lead (authored as
   "Logistis" / the given `sentByName`).
3. If `leadStatus` is present, **update the lead's status**.
4. If `reminderDate` is present, **set the lead's reminder/follow-up date**.
5. If no matching lead exists, it's fine to no-op (or create one, CM's
   call).

## Response (optional but helpful)

```json
{ "found": true }
```

If CM can report whether a matching lead was actually found, Logistis
surfaces that back to the consultant as a small warning ("δεν βρέθηκε
αντίστοιχο lead") when `found: false`. Any other 2xx response (with or
without a body) is otherwise treated as a successful delivery.

## Logistis-side implementation

- `src/lib/case-management-sync.ts` → `notifyCaseManagementCommunication()`
- Wired into: `api/businesses/[id]/program-email`,
  `api/businesses/[id]/microcredits-eligibility`,
  `api/businesses/[id]/eligibility-advice`
- UI: `src/components/cm-sync-controls.tsx`, used by
  `prospect-program-email-modal.tsx`, `microcredits-eligibility-modal.tsx`,
  `eligibility-advice-modal.tsx`
