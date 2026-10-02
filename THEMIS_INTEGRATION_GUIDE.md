# ΘΕΜΗΣ — Integration Guide for External Systems (ΛΟΓΙΣΤΗΣ)

## Overview
The Eksodikastikos app provides a **direct integration** that allows external systems (like ΛΟΓΙΣΤΗΣ portal) to:
1. Create new leads in the system
2. Automatically assign them to consultants (Stella, Vallia, or Sofia)
3. Send the customer a Θέμις (AI eligibility checker) link via Viber/Email
4. Track the conversation and verdict in real-time

---

## 1. URL ENDPOINTS

### Option A: Direct Redirect (Frontend - RECOMMENDED)
```
https://portal.i-mentor.gr/themis/create?name=COMPANY_NAME&phone=+30210123456&email=contact@company.gr&total_debt=50000&referrer=LOGISTIS&application_number=YOUR_ID
```

**Recommended for seamless UX.** The frontend accepts query parameters, auto-creates a lead on the backend via auto round-robin allocation, and redirects the customer directly to Themis chat without separate Viber/Email messages.

### Option B: Backend API (POST - Backend-to-Backend)
```
https://portal.i-mentor.gr/api/external/create-lead
```

**For server-side integration.** POST JSON data and receive `themis_url` in response to redirect customers programmatically.

### Customer Themis Chat (After lead creation)
```
https://portal.i-mentor.gr/themis/{lead_themis_token}
```
This is where customers are redirected after lead creation.

---

## 2. REQUEST FORMAT & PARAMETERS

### Option A: Method: `GET /themis/create?...` (with Query Parameters)

#### Query Parameters
```
?name=COMPANY_NAME                              // Required
&phone=+30210123456                             // Optional
&email=contact@company.gr                       // Optional
&total_debt=50000                               // Optional (just the number)
&service_type=εξωδικαστικός                    // Optional
&referrer=LOGISTIS                              // Optional (source system)
&application_number=LOGISTIS-2026-001234       // Optional (your system ID)
&sheet_comments=Additional+notes                // Optional
```

No authentication required. The frontend creates the lead via backend API and redirects to Themis chat.

### Option B: Method: `POST /api/external/create-lead` (JSON Body)

#### Headers
```
Content-Type: application/json
X-API-Key: {EXODIKASTIKOS_API_KEY}  # Optional (not validated in production yet)
```

#### Body (JSON)
```json
{
  "name": "COMPANY NAME or PERSON NAME",           // Required
  "phone": "+30 2XX XXX XXXX or local number",     // Optional but recommended
  "email": "contact@company.gr",                    // Optional but recommended
  "total_debt": "50000",                            // Optional (just the number, e.g., "50000")
  "service_type": "εξωδικαστικός",                 // Optional
  "referrer": "LOGISTIS",                           // Optional (source system name)
  "sheet_comments": "Any extra notes here",         // Optional
  "application_number": "LOGISTIS-2026-001234",   // Optional (external system ID)
  "send_themis": false                              // Default: false (skip Viber+Email since user redirects directly)
}
```

#### Field Details (same for both Option A query params and Option B JSON body)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✓ | Company/person name — shown in all communications |
| `phone` | string | — | Any format; system normalizes to Greek format (+30) |
| `email` | string | — | Used for email template; Themis link sent here if provided |
| `total_debt` | string | — | Debt amount (just the number: "50000", not "€50k") |
| `service_type` | string | — | Type of service (e.g., "εξωδικαστικός", "arbitration") |
| `referrer` | string | — | Name of referring system or partner (logged for tracking) |
| `sheet_comments` | string | — | Internal notes; passed to Themis AI as context |
| `application_number` | string | — | Your system's lead ID (for audit trail) |
| `send_themis` | boolean | — | Default: `false`; for direct redirect flow, set to `false` (customer already in redirect) |

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

### Recommended: **Direct Redirect with Auto Lead Creation**

**ΛΟΓΙΣΤΗΣ Portal Flow:**

1. User clicks "Check Eligibility via Θέμις" link in ΛΟΓΙΣΤΗΣ app
2. ΛΟΓΙΣΤΗΣ redirects directly to Eksodikastikos:
```
https://portal.i-mentor.gr/themis/create?name=COMPANY_NAME&phone=PHONE&email=EMAIL&total_debt=AMOUNT&referrer=LOGISTIS&application_number=YOUR_ID
```

3. Eksodikastikos backend:
   - Creates the lead automatically
   - Assigns to consultant via round-robin (Stella → Vallia → Sophia → repeat)
   - **Skips sending separate Viber/Email** (user is already here)
   - Redirects directly to Θέμις chat UI

4. Customer immediately enters Themis AI chat conversation
5. No separate message interruption — seamless experience

### Alternative: **API Call with Server-Side Redirect** (For Backend-to-Backend)

If ΛΟΓΙΣΤΗΣ has a backend, POST to create the lead and redirect:

```javascript
// Backend-to-backend integration
const response = await fetch('https://portal.i-mentor.gr/api/leads/create', {
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
    referrer: "ΛΟΓΙΣΤΗΣ Portal",
    application_number: "LOGISTIS-2026-001234",
    send_themis: false  // No separate email/Viber
  })
})

const data = await response.json()
if (data.themis_token) {
  // Redirect frontend to Themis chat directly
  window.location.href = `https://portal.i-mentor.gr/themis/${data.themis_token}`
}
```

---

## 5. RESPONSE FORMAT

### Option A: Direct Redirect Response
```
HTTP 302 Redirect to: https://portal.i-mentor.gr/themis/{themis_token}
```
The frontend automatically redirects customers to the Themis chat. No JSON response to handle.

### Option B: API Response (HTTP 201 Created)
```json
{
  "id": 12345,
  "name": "ΑΒΓΔ ΑΕ",
  "phone": "+30 210 123 4567",
  "email": "contact@company.gr",
  "assigned_to": "STELLA",
  "status": "CALL",
  "themis_token": "abc123def456xyz...",
  "themis_url": "https://portal.i-mentor.gr/themis/abc123def456xyz...",
  "created_at": "2026-07-16T14:32:00Z"
}
```

**Extract `themis_url` from response and redirect your frontend to it.**

### Error Response (HTTP 400/422/500)
```json
{
  "detail": "name field is required"
}
```

---

## 6. WHAT HAPPENS AFTER SUBMISSION

### Timeline (Direct Redirect Flow):

1. **Lead Created**
   - Stored in system with status `CALL`
   - **Automatically assigned** to next consultant in round-robin (Stella → Vallia → Sophia → repeat)
   - A unique `themis_token` is generated

2. **No Separate Messages**
   - ✅ **NO Viber message** (user is already navigating)
   - ✅ **NO Email** (seamless web experience)
   - User is directly redirected to Themis chat

3. **Customer Enters Themis Chat**
   - Opens → `https://portal.i-mentor.gr/themis/{themis_token}`
   - **Immediately starts chat** with Θέμις AI (no interruption)
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

# Viber/Chatwoot (for optional Viber notifications)
CHATWOOT_API_URL=https://chat.i-mentor.gr/api
CHATWOOT_API_KEY=...
CHATWOOT_INBOX_ID=...
```

---

## 8. EXAMPLE INTEGRATIONS

### Example 1: Option A — Direct Redirect (RECOMMENDED)

```html
<!-- ΛΟΓΙΣΤΗΣ Portal: User clicks this link -->
<a href="https://portal.i-mentor.gr/themis/create?name=ΑΒΓΔ+ΑΕ&phone=%2B30210123456&email=contact%40company.gr&total_debt=50000&referrer=LOGISTIS&application_number=LOGISTIS-2026-001234">
  Ελέγξτε εξωδικαστική ρύθμιση
</a>
```

Frontend creates lead with auto round-robin allocation and redirects directly to Themis chat. No separate Viber/Email messages.

### Example 2: Option B — Backend API Call

```bash
curl -X POST https://portal.i-mentor.gr/api/external/create-lead \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ΑΒΓΔ ΑΕ",
    "phone": "+30 210 123 4567",
    "email": "contact@company.gr",
    "total_debt": "50000",
    "service_type": "εξωδικαστικός",
    "referrer": "LOGISTIS Portal",
    "application_number": "LOGISTIS-2026-001234",
    "send_themis": false
  }'
```

**Response (HTTP 201):**
```json
{
  "id": 12345,
  "name": "ΑΒΓΔ ΑΕ",
  "phone": "+30 210 123 4567",
  "email": "contact@company.gr",
  "assigned_to": "STELLA",
  "status": "CALL",
  "themis_token": "abc123def456xyz...",
  "themis_url": "https://portal.i-mentor.gr/themis/abc123def456xyz...",
  "created_at": "2026-07-16T14:32:00Z"
}
```

Extract `themis_url` and redirect customer there: `window.location.href = data.themis_url`

---

## 9. FREQUENTLY ASKED QUESTIONS

### Q: How is the consultant allocated?
**A:** **Automatic round-robin by default**. Omit the `assigned_to` field and the system will automatically distribute leads equally across Stella, Vallia, and Sofia in rotating order. This ensures fair allocation and balanced workload. You can override by specifying `assigned_to` explicitly if needed (e.g., for specific cases or reassignments).

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

## 10. TESTING CHECKLIST

### For Option A (Direct Redirect):
1. Test the redirect URL in your browser: `https://portal.i-mentor.gr/themis/create?name=TEST+AE&phone=%2B306912345678&referrer=LOGISTIS`
2. Verify you're redirected to the Themis chat (no errors)
3. Check in Eksodikastikos UI that a lead was created with auto-assigned consultant

### For Option B (Backend API):
1. Test the API call:
   ```bash
   curl -X POST https://portal.i-mentor.gr/api/external/create-lead \
     -H "Content-Type: application/json" \
     -d '{"name":"TEST AE","phone":"+306912345678","referrer":"LOGISTIS","send_themis":false}'
   ```
2. Verify HTTP 201 response with `themis_url`
3. Use returned URL to redirect customer
4. Check lead was created in Eksodikastikos UI

---

## 11. SECURITY NOTES

- API endpoint is **public** (no authentication required, but API key strongly recommended)
- `themis_token` is a UUID unique to each lead (not guessable)
- Customer conversations are **private** (no external API exposes transcripts)
- EXODIKASTIKOS_API_KEY should be **rotated periodically** and kept secret
- ΓΕΜΗ should **sanitize input** (name, email, phone) before sending

---

## Summary for ΛΟΓΙΣΤΗΣ Developer

### Option A: Frontend Redirect (RECOMMENDED)
**Endpoint:** `https://portal.i-mentor.gr/themis/create?name=...&phone=...&email=...&referrer=LOGISTIS`

Flow:
1. User clicks eligibility link in ΛΟΓΙΣΤΗΣ
2. ΛΟΓΙΣΤΗΣ redirects to `/themis/create` with query parameters
3. Frontend auto-creates lead (auto round-robin consultant assignment)
4. Frontend redirects customer directly to Themis chat (no separate Viber/Email)
5. Seamless, fast, and best UX

### Option B: Backend-to-Backend API
**Endpoint:** `https://portal.i-mentor.gr/api/external/create-lead` (POST JSON)

Flow:
1. ΛΟΓΙΣΤΗΣ backend POSTs lead data to our API
2. Our API returns HTTP 201 with `themis_url`
3. ΛΟΓΙΣΤΗΣ frontend receives response and redirects to `themis_url`
4. Customer enters Themis chat directly
5. For server-side integration

### Key Points:
✅ **Round-robin allocation** — consultants get leads automatically in rotation (Stella → Vallia → Sophia)  
✅ **Direct Themis chat** — no separate Viber/Email messages  
✅ **No Gmail needed** — seamless web redirect  
✅ **Consultant notified** — gets alert to call customer after chat ends  

That's it! 🎯
