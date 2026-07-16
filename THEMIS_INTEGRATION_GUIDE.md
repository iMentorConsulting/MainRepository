# ΘΕΜΗΣ — Integration Guide for External Systems (ΓΕΜΗ)

## Overview
The Eksodikastikos app provides a **webhook-style integration** that allows external systems (like ΓΕΜΗ) to:
1. Create new leads in the system
2. Automatically assign them to consultants (Stella, Vallia, or Sofia)
3. Send the customer a Θέμις (AI eligibility checker) link via Viber/Email
4. Track the conversation and verdict in real-time

---

## 1. URL ENDPOINT

### Primary Endpoint (POST)
```
https://portal.i-mentor.gr/api/leads/create
```

This is a **public endpoint** (no auth required for initial lead creation, but API key validation recommended).

### Alternative: Frontend Themis Link
```
https://portal.i-mentor.gr/themis/{lead_themis_token}
```
This is where the **customer** lands when they click the Viber/Email link.

---

## 2. REQUEST FORMAT & PARAMETERS

### Method: `POST /api/leads/create`

### Headers
```
Content-Type: application/json
X-API-Key: {EXODIKASTIKOS_API_KEY}  # Optional but recommended
```

### Body (JSON)
```json
{
  "name": "COMPANY NAME or PERSON NAME",           // Required
  "phone": "+30 2XX XXX XXXX or local number",     // Optional but recommended
  "email": "contact@company.gr",                    // Optional but recommended
  "total_debt": "€50,000 or just 50000",            // Optional
  "service_type": "εξωδικαστικός",                 // Optional
  "referrer": "ΓΕΜΗ Portal",                        // Optional (source system name)
  "sheet_comments": "Any extra notes here",         // Optional
  "assigned_to": "STELLA",                          // Required: must be STELLA, VALLIA, or SOFIA
  "application_number": "GEMH-2026-001234",        // Optional (external system ID)
  "send_themis": true                               // Default: true (sends Viber + Email with Themis link)
}
```

### Field Details

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✓ | Company/person name — shown in all communications |
| `phone` | string | — | Any format; system normalizes to Greek format (+30) |
| `email` | string | — | Used for email template; Themis link sent here if provided |
| `total_debt` | string | — | Debt amount (any format: "€50k", "50000", "50000€") |
| `service_type` | string | — | Type of service (e.g., "εξωδικαστικός ρύθμιση", "arbitration") |
| `referrer` | string | — | Name of referring system or partner (logged for tracking) |
| `sheet_comments` | string | — | Internal notes; passed to Themis AI as context |
| `assigned_to` | string | ✓ | **STELLA** / **VALLIA** / **SOFIA** (exact case) |
| `application_number` | string | — | Your system's lead ID (for audit trail) |
| `send_themis` | boolean | — | Default: `true`; set `false` to skip Viber+Email |

---

## 3. AUTHENTICATION

### Option A: API Key (Recommended)
```
X-API-Key: {EXODIKASTIKOS_API_KEY}
```
- The key is stored in the Railway environment (`EXODIKASTIKOS_API_KEY`)
- Backend validates it against `os.getenv("EXODIKASTIKOS_API_KEY")`
- If wrong or missing, request is **still accepted** (for backward compatibility), but logged as unverified

### Option B: No Auth (Current Default)
- The endpoint is public and accepts requests without auth
- Recommended to validate your IP on the firewall or add a simple secret to the request

### Option C: Add Bearer Token (Future)
If you need stricter security, we can add JWT/Bearer token validation.

---

## 4. METHOD & FLOW

### Recommended: **Async API Call with Redirect** (Best UX)

**Client-side JavaScript:**
```javascript
// 1. User clicks "Submit to Θέμις" in ΓΕΜΗ portal
// 2. ΓΕΜΗ JavaScript makes a background POST request

fetch('https://portal.i-mentor.gr/api/leads/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'YOUR_API_KEY_HERE'
  },
  body: JSON.stringify({
    name: "ΑΒΓΔ ΑΕ",
    phone: "+30 210 123 4567",
    email: "contact@company.gr",
    total_debt: "50000",
    assigned_to: "STELLA",
    referrer: "ΓΕΜΗ Portal",
    application_number: "GEMH-2026-001234",
    send_themis: true
  })
})
.then(res => res.json())
.then(data => {
  if (data.themis_token) {
    // 3. Open Themis chat in new tab/window
    window.open(`https://portal.i-mentor.gr/themis/${data.themis_token}`, '_blank')
    alert('Lead created! Opening Θέμις chat...')
  } else {
    alert('Error: ' + JSON.stringify(data))
  }
})
.catch(err => alert('Error: ' + err.message))
```

### Alternative: **Simple GET Link** (Less Data)

If you just want to send a pre-populated link (without creating a lead first):

```
https://portal.i-mentor.gr/api/leads/create?name=ΑΒΓΔ+ΑΕ&phone=%2B30210...&assigned_to=STELLA&send_themis=true
```

This method:
- Creates the lead via GET query params (not recommended for large data)
- Returns the Themis link immediately
- Customer clicks the link → starts Θέμις chat

---

## 5. RESPONSE FORMAT

### Success (HTTP 200)
```json
{
  "id": 12345,
  "name": "ΑΒΓΔ ΑΕ",
  "phone": "+30 210 123 4567",
  "email": "contact@company.gr",
  "assigned_to": "STELLA",
  "status": "CALL",
  "themis_token": "abc123def456xyz...",
  "created_at": "2026-07-16T14:32:00Z"
}
```

### Error (HTTP 400/500)
```json
{
  "detail": "assigned_to must be one of: STELLA, VALLIA, SOFIA"
}
```

---

## 6. WHAT HAPPENS AFTER SUBMISSION

### Timeline:

1. **Lead Created**
   - Stored in system with status `CALL`
   - Assigned to the specified consultant (Stella, Vallia, or Sofia)
   - A unique `themis_token` is generated

2. **Θέμις Link Sent** (if `send_themis: true`)
   - **Viber message** sent to phone number with link + greeting (uses Chatwoot integration)
   - **Email** sent to email address with HTML template + Themis link
   - Both use the customer's name in personalization

3. **Customer Clicks Link**
   - Opens → `https://portal.i-mentor.gr/themis/{themis_token}`
   - Starts chat with Θέμις AI
   - Θέμις asks about:
     - Debt amount and type (bank, tax, social)
     - Income (employee, business owner, legal entity)
     - Assets (real estate, deposits)
     - Number of household members
   - Based on answers, Θέμις renders a **preliminary verdict**: ELIGIBLE or INELIGIBLE

4. **Consultant Follow-up**
   - Once chat ends, consultant (Stella, Vallia, or Sofia) receives notification
   - Consultant calls the customer to:
     - Confirm eligibility
     - Collect full financial documents
     - Create a formal Case (with official proposal)

5. **Data Tracking**
   - All conversations logged in `ThemisSession` table
   - Verdict and transcript stored for audit/compliance
   - Cost tracked (Claude API usage)

---

## 7. ENVIRONMENT VARIABLES & SETUP

### On the Backend (Railway):

Ensure these env vars are set:

```bash
# Themis AI Gate
ENABLE_THEMIS=true

# API Key (for your requests)
EXODIKASTIKOS_API_KEY=your_secret_key_here

# Frontend URL (where Themis chat loads from)
FRONTEND_URL=https://portal.i-mentor.gr

# Claude API (for Themis AI)
ANTHROPIC_API_KEY=sk-ant-...

# Viber/Chatwoot (for sending Viber messages)
CHATWOOT_API_URL=https://chat.i-mentor.gr/api
CHATWOOT_API_KEY=...
CHATWOOT_INBOX_ID=...

# Gmail (for sending emails)
GMAIL_USER=noreply@i-mentor.gr
GMAIL_APP_PASSWORD=...
```

---

## 8. EXAMPLE CURL REQUEST

```bash
curl -X POST https://portal.i-mentor.gr/api/leads/create \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{
    "name": "ΑΒΓΔ ΑΕ",
    "phone": "+30 210 123 4567",
    "email": "contact@company.gr",
    "total_debt": "50000",
    "service_type": "εξωδικαστικός",
    "referrer": "ΓΕΜΗ Portal",
    "assigned_to": "STELLA",
    "application_number": "GEMH-2026-001234",
    "send_themis": true
  }'
```

---

## 9. FREQUENTLY ASKED QUESTIONS

### Q: Can I choose which consultant gets the lead randomly?
**A:** No, you must specify `assigned_to` as one of: `STELLA`, `VALLIA`, `SOPHIA`. If you want round-robin, implement it in your system and send the chosen name.

### Q: What if the customer doesn't have a phone or email?
**A:** 
- If no `phone`, Viber message won't send (but lead is still created)
- If no `email`, email won't send (but lead is still created)
- Consultant can still manually call/email later
- Set `send_themis: false` if you want to handle outreach yourself

### Q: Can I update a lead after creating it?
**A:** Not via this endpoint. Manual updates must be done in the Eksodikastikos UI.

### Q: How long is the Themis link valid?
**A:** The link uses a `themis_token` unique to the lead and never expires. However, once the chat ends with a verdict, the lead is marked as `completed` and the customer can still revisit but can't change the verdict.

### Q: Can I track the verdict programmatically?
**A:** Not yet. Currently, you must check the Eksodikastikos UI to see the verdict. We can add a webhook callback if needed.

### Q: What if the API key is wrong?
**A:** Request still processes (for backward compatibility), but it's logged as unverified. Recommend validating on your end.

---

## 10. SUPPORT & NEXT STEPS

1. **Implement the POST request** in ΓΕΜΗ portal
2. **Test with a sample company** (use a test phone/email)
3. **Verify Viber + Email delivery** to your test number
4. **Open the Themis link** and test the eligibility chat
5. **Confirm consultant assignment** in the Eksodikastikos UI
6. If issues, check:
   - API response for error messages
   - Backend logs on Railway (`railway logs`)
   - Viber/Email delivery status

---

## 11. SECURITY NOTES

- API endpoint is **public** (no authentication required, but API key strongly recommended)
- `themis_token` is a UUID unique to each lead (not guessable)
- Customer conversations are **private** (no external API exposes transcripts)
- EXODIKASTIKOS_API_KEY should be **rotated periodically** and kept secret
- ΓΕΜΗ should **sanitize input** (name, email, phone) before sending

---

## Summary for ΓΕΜΗ Developer

You need to:

1. **POST to** `https://portal.i-mentor.gr/api/leads/create`
2. **Send JSON** with: name, phone (optional), email (optional), assigned_to (required: STELLA/VALLIA/SOPHIA)
3. **Add header** `X-API-Key: {your_api_key}` (optional but recommended)
4. **Receive back** the `themis_token`
5. **Open** `https://portal.i-mentor.gr/themis/{themis_token}` in a browser (or link to it)
6. Customer talks to Θέμις AI → gets verdict
7. Consultant (Stella/Vallia/Sophia) gets notified → calls customer for full details

That's it! 🎯
