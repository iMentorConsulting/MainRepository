# ΕΡΜΗΣ Integration — Spec for the LOGISTIS Developer

**Goal:** When Case Management (CM) starts a ΕΡΜΗΣ screening for a lead, LOGISTIS
should, in one automatic flow:

1. Read the lead data CM sends (incl. **VAT/ΑΦΜ**, program, service).
2. Run **one ΑΑΔΕ lookup** on the ΑΦΜ (skip if already cached — never re-query).
3. **Create the business listing** inside LOGISTIS.
4. Run **automatic matching against all available programs**.
5. Feed **lead + business + matching** into ΕΡΜΗΣ, using the ΕΡΜΗΣ profile
   (system prompt + knowledge base) that corresponds to the **program/service**.
6. Return **business data + matching + the ΕΡΜΗΣ transcript/eligibility** to CM.

Auth for everything below: header `x-api-key: <CASES_API_KEY>` (the same shared
secret already used for cases/businesses; on CM it is `IMENTOR_PORTAL_API_KEY`).

---

## 1. Endpoint you implement — create a ΕΡΜΗΣ session

```
POST  {LOGISTIS_ERMIS_SESSION_URL}         (e.g. https://logistis.i-mentor.gr/api/external/ermis-sessions)
Header: x-api-key: <CASES_API_KEY>
```

**Request body (sent by CM):**
```json
{
  "leadRef": "3360",
  "afm": "123456789",
  "program": "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ",
  "serviceType": "ΕΞΩΔΙΚΑΣΤΙΚΟΣ",
  "consultant": "STELLA",
  "callbackUrl": "https://<cm-app>/api/cm/leads/ermis/webhook",
  "contextSummary": "ΓΝΩΣΤΑ ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ (μην τα ξαναρωτήσεις…)\n- Ονοματεπώνυμο: …\n- ΑΦΜ: …\n- ΑΣΦ & ΦΟΡ ΕΝΗΜ: Ναι\n- Υπεύθυνος σύμβουλος: STELLA (…θα επικοινωνήσει σύντομα)",
  "lead": {
    "id": 3360, "name": "…", "phone": "…", "phone2": "…", "email": "…",
    "afm": "123456789", "program": "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ", "serviceType": "ΕΞΩΔΙΚΑΣΤΙΚΟΣ",
    "totalAmount": 0, "status": "NEW LEAD", "consultant": "STELLA",
    "source": "FB", "notes": "<free-text sheet comment>",
    "extraFields": { "ΑΣΦ & ΦΟΡ ΕΝΗΜ": "Ναι", "ΤΕΙΡΕΣΙΑΣ & ΤΡΑΠΕΖΕΣ": "Ναι", "ΚΕΡΔΟΦΟΡΙΑ": "Ναι", "ΕΝΕΡΓΗ ΕΠΙΧΕΙΡΗΣΗ": "Ναι" },
    "contextSummary": "…same preformatted summary…"
  }
}
```

**What you do on receipt (automatically, before or during session creation):**
- Pick the ΕΡΜΗΣ profile by `program` (and/or `serviceType`).
- If `afm` present: ΑΑΔΕ lookup (once) → create/find the business listing → run
  program matching. Store these so they can be returned.
- Seed the ΕΡΜΗΣ session with the `lead`, the business data, and the matching so
  ΕΡΜΗΣ can use them in the conversation.
- Persist `leadRef` and `callbackUrl` against the session/token.

> ⚠️ **IMPORTANT — do not re-ask what we already sent.** ΕΡΜΗΣ must treat every
> field in `lead` (including `lead.extraFields`, e.g. `ΑΣΦ & ΦΟΡ ΕΝΗΜ: Ναι`,
> `ΤΕΙΡΕΣΙΑΣ & ΤΡΑΠΕΖΕΣ: Ναι`, `ΚΕΡΔΟΦΟΡΙΑ: Ναι`, `ΕΝΕΡΓΗ ΕΠΙΧΕΙΡΗΣΗ: Ναι`) as
> **already answered** and must NOT ask the client to fill them in again. To make
> this trivial we now also send a preformatted **`contextSummary`** string (both
> top-level and inside `lead`) — inject it verbatim into the ΕΡΜΗΣ system prompt as
> known facts, and have ΕΡΜΗΣ continue from there rather than re-collecting data.
> In the last test ΕΡΜΗΣ ignored these fields and re-asked everything — that needs fixing.

> 👤 **Consultant callback.** We send the assigned consultant as top-level
> `consultant` (and inside `lead.consultant` / `contextSummary`). ΕΡΜΗΣ should
> reassure the client that this specific person will contact them shortly, e.g.
> «Ο/Η {consultant} από την i-Mentor θα επικοινωνήσει σύντομα μαζί σας.» If
> `consultant` is empty, use a generic «ένας σύμβουλός μας».

**Response (200):**
```json
{ "token": "<opaque>", "chatUrl": "https://logistis.i-mentor.gr/ermis/<token>" }
```
CM sends `chatUrl` to the client via Viber/Email.

---

## 2. Webhook you call — return results to CM

Call this whenever data is ready. You may call it **twice**: once when the
business + matching are ready (`ermis.business_ready`), and again when the
conversation finishes (`ermis.completed`). A single `ermis.completed` carrying
everything is also fine.

```
POST  {callbackUrl}          →  https://<cm-app>/api/cm/leads/ermis/webhook
Header: x-api-key: <CASES_API_KEY>
```

**Body:**
```json
{
  "event": "ermis.completed",          // or "ermis.business_ready" | "ermis.progress"
  "token": "<opaque>",
  "leadRef": "3360",
  "afm": "123456789",

  "business": {
    "afm": "123456789",
    "onomasia": "…",
    "commercialTitle": "…",
    "legalStatusDescr": "…",
    "regdate": "2015-03-01",                       // ΗΜΕΡΟΜΗΝΙΑ ΕΝΑΡΞΗΣ
    "doy": "…", "doyDescr": "…",
    "postalAddress": "…", "postalAddressNo": "…",  // ΔΙΕΥΘΥΝΣΗ ΕΔΡΑΣ
    "postalZipCode": "…", "postalAreaDescription": "…",
    "perifereia": "…", "klados": "…",
    "activities": [                                 // ΚΑΔ (multiple)
      { "firmActCode": "62.01", "firmActDescr": "…", "firmActKind": "1" }
    ]
  },

  "matchedPrograms": [                              // automatic program matching
    { "title": "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ", "status": "POTENTIAL" }
  ],

  "eligibility": "eligible",                        // eligible | ineligible (on completed)
  "transcript": [                                   // ΕΡΜΗΣ conversation
    { "role": "assistant", "text": "…", "ts": "…" },
    { "role": "user", "text": "…", "ts": "…" }
  ],
  "completedAt": "2026-07-01T18:00:00Z"
}
```

**How CM handles it:**
- `business` + `matchedPrograms` → stored in CM's business cache (by ΑΦΜ) and
  shown on the lead (start date, address, ΚΑΔ, matched programs). `matchedPrograms`
  should **exclude REJECTED**.
- `transcript` + `eligibility` → stored on the lead; `eligible` nudges the lead to
  HOT. `transcript` accepts either the array shown or a single markdown string.
- Resolution: CM matches the lead by `token`, falling back to `leadRef`.

---

## 3. Config / coordination checklist

- **Shared secret:** reuse the existing `CASES_API_KEY` — no new secret.
- **Session URL:** confirm the exact path for `LOGISTIS_ERMIS_SESSION_URL`
  (CM currently defaults to `https://logistis.i-mentor.gr/api/external/ermis-sessions`).
- **CM webhook URL:** `https://<cm-app>/api/cm/leads/ermis/webhook` (CM passes it
  as `callbackUrl` in every session-create call).
- **Program vocabulary:** CM's program values are exactly
  `ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ`, `ΔΥΠΑ`, `ΕΣΠΑ`, `ΑΝΑΚΑΙΝΙΖΩ`. Tell us if your ΕΡΜΗΣ profiles /
  matching key on different labels so we map before sending.
- **No re-lookup:** if the ΑΦΜ already has a cached business in LOGISTIS, reuse it
  (no second ΑΑΔΕ call), same rule already agreed for `/api/external/businesses`.

---

## 4. Joint end-to-end test

1. CM starts ΕΡΜΗΣ on a lead with a **known** ΑΦΜ → expect `ermis.business_ready`
   with business + matching, then `ermis.completed` with transcript.
2. Repeat with a **new** ΑΦΜ → expect exactly one ΑΑΔΕ lookup + a created listing.
3. Verify CM shows business data, ΚΑΔ, matched programs, and the transcript on the lead.
