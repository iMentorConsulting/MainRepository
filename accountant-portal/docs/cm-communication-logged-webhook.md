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
  "email": "info@dokimi.gr",
  "phone": "2810123456",
  "programTitle": "ΕΣΠΑ Ψηφιακός Μετασχηματισμός",
  "program_category": "ΕΣΠΑ",
  "kind": "ADVICE",
  "channel": "EMAIL",
  "subject": "ΔΟΚΙΜΗ ΕΠΕ — Ενημέρωση & επόμενα βήματα για «ΕΣΠΑ Ψηφιακός Μετασχηματισμός»",
  "comment": "Εστάλη email «Ενημέρωση & Επόμενα Βήματα» για το πρόγραμμα «ΕΣΠΑ Ψηφιακός Μετασχηματισμός».",
  "leadStatus": "HOT",
  "reminderDate": "2026-11-20",
  "sentByName": "Γιώργος Παπαδόπουλος",
  "assignToConsultant": "Πουλιδάκης Χρήστος",
  "createIfMissing": true,
  "loggedAt": "2026-11-06T18:00:00.000Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `afm` | string | Always present. |
| `onomasia` | string\|null | Business name. |
| `email` | string\|null | New — business's email, in case a lead needs to be created (see below). |
| `phone` | string\|null | New — business's phone, same reason. |
| `programTitle` | string\|null | Exact program title in Logistis. |
| `program_category` | string | Same coarse categories already used in `case.created` (ΕΣΠΑ / ΔΥΠΑ / ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ / ΑΝΑΚΑΙΝΙΖΩ), derived the same way. |
| `kind` | string | `PROGRAM_EMAIL` \| `MICROCREDITS` \| `ADVICE` |
| `channel` | string | Always `EMAIL` today. |
| `subject` | string\|null | The email's subject line. |
| `comment` | string | Human-readable one-liner to append as a note/activity on the lead. |
| `leadStatus` | string\|null | **No mapping, send/apply these verbatim.** One of `NEW LEAD` \| `CALL` \| `HOT` \| `ACTIVE` \| `DEAL` \| `CANCEL` (or `null`/absent = don't change the lead's status). These are CM's own values, byte-for-byte — Logistis's consultant-facing dropdown offers exactly these 6 (deliberately **not** `WORKED` — consultants never set that one from Logistis), so CM should set the lead's status field directly to whatever string arrives here, with **no translation table in between**. If a `NEW→NEW LEAD` / `CANCELLED→CANCEL` mapping was built earlier, remove it — a literal `"CANCEL"` run through a mapper expecting `"CANCELLED"` would fail to match. |
| `reminderDate` | string\|null | `YYYY-MM-DD`, or `null`/absent = don't change. Set/replace the lead's follow-up/reminder date. |
| `sentByName` | string\|null | The consultant who sent it. |
| `assignToConsultant` | string\|null | **New.** The exact CM consultant name to assign a **brand-new** lead to (Logistis maps the sending consultant's login to one of: `Πουλιδάκης Χρήστος`, `Βαρδιάμπασης Μάνος`, `Στριλιγκά Ελευθερία`, `Αποστολάκης Χάρης`). `null` if the sender isn't one of these four. **Only ever used when creating a new lead (step 2 below) — never use this to change who an existing lead is assigned to, even if it differs from `assignToConsultant`.** |
| `createIfMissing` | boolean | **New.** `true` (the default — shown pre-checked in Logistis, the consultant can uncheck it per-send) means "create a new lead if none is found" (step 2 below applies normally). `false` means **do not create a new lead** if none is found — in that case, skip steps 2–5 entirely (no lead to create, no comment/status/reminder to attach) and reply `{ "found": false, "created": false }`. Always sent — never omitted. |
| `loggedAt` | string | ISO timestamp. |

## What CM should do

1. **Find the lead** matching this `afm` + program (`programTitle` /
   `program_category`, same identifying fields `case.created` already sends)
   — if the client has more than one, use the most recent non-cancelled one
   for this program.
2. **If none exists and `createIfMissing` is `true`, create one.** Create
   it using `onomasia` / `email` / `phone` / `programTitle` /
   `program_category`, with status `NEW LEAD` (or `leadStatus` if one was
   sent with this event), and **assign it to `assignToConsultant`** if
   present (fall back to whatever CM already does for an unassigned lead
   when it's `null`). **If `createIfMissing` is `false` and no lead was
   found, stop here** — do not create a lead, and skip steps 3–5 below
   (there's nothing to attach a comment/status/reminder to); reply
   `{ "found": false, "created": false }`.
3. **Append `comment`** as a new note/activity on that lead — whether it was
   just found or just created (authored as "Logistis" / the given
   `sentByName`).
4. If `leadStatus` is present, **set the lead's status to that exact
   string** — it's already one of CM's own values, no lookup/translation
   needed. (Skip this step for a lead you just created with that same
   status in step 2 — no need to set it twice.)
5. If `reminderDate` is present, **set the lead's reminder/follow-up date**.

**Do not touch consultant assignment on an existing lead (step 1).** Only a
newly-created lead (step 2) gets `assignToConsultant` applied — if the lead
already existed, leave its current assignment exactly as it was, even if
`assignToConsultant` names someone else. Steps 3–5 still apply normally to
an existing lead; only the assignment step is skipped for it.

## Response (optional but helpful)

```json
{ "found": true, "created": false }
```

So Logistis can tell the consultant what actually happened:
- `found: true, created: false` — landed on an existing lead.
- `found: false, created: true` — no lead existed, one was created.
- `found: false, created: false` (or `found` omitted) — nothing happened on
  the CM side; Logistis shows this as a warning. Given step 2 above this
  should no longer occur in normal operation.

Any 2xx response (with or without a body) is otherwise treated as a
successful delivery even without these fields.

## Consultant mapping (Logistis login → CM consultant name)

| Logistis login | CM consultant |
|---|---|
| `christos@i-mentor.gr` | Πουλιδάκης Χρήστος |
| `manos@i-mentor.gr` | Βαρδιάμπασης Μάνος |
| `eleftheria@i-mentor.gr` | Στριλιγκά Ελευθερία |
| `info@i-mentor.gr` | Αποστολάκης Χάρης |

Maintained by hand in `src/lib/case-management-sync.ts`
(`CM_CONSULTANT_BY_EMAIL`) — no shared user directory between the two
systems, so if CM renames a consultant or a new one joins, this mapping
needs a matching update on the Logistis side.

## Logistis-side implementation

- `src/lib/case-management-sync.ts` → `notifyCaseManagementCommunication()`
- Wired into: `api/businesses/[id]/program-email`,
  `api/businesses/[id]/microcredits-eligibility`,
  `api/businesses/[id]/eligibility-advice`
- UI: `src/components/cm-sync-controls.tsx`, used by
  `prospect-program-email-modal.tsx`, `microcredits-eligibility-modal.tsx`,
  `eligibility-advice-modal.tsx`
