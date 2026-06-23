// Sends Viber messages through a self-hosted/cloud Chatwoot instance with a
// Viber-channel inbox configured. Flow: find-or-create contact by phone,
// open a conversation on the Viber inbox, post an outgoing message — Chatwoot
// then delivers it to the end user via Viber.

interface ViberMessage {
  to: string
  text: string
  senderName?: string
}

function normalizeGreekPhone(rawPhone: string): string {
  let phone = (rawPhone || '').trim().replace(/[\s-]/g, '')
  if (phone && !phone.startsWith('+')) {
    if (phone.startsWith('00')) phone = '+' + phone.slice(2)
    else if (phone.startsWith('0')) phone = '+30' + phone.slice(1)
    else phone = '+30' + phone
  }
  return phone
}

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(url, init)
  const text = await res.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch {}
  return { status: res.status, body, text }
}

async function chatwootSend(clientName: string, phone: string, message: string): Promise<{ ok: boolean; reason: string }> {
  const cwUrl = (process.env.CHATWOOT_URL || '').trim().replace(/\/$/, '')
  const cwToken = (process.env.CHATWOOT_API_TOKEN || '').trim()
  const cwAccount = (process.env.CHATWOOT_ACCOUNT_ID || '').trim()
  const cwInbox = (process.env.CHATWOOT_INBOX_ID || '').trim()

  if (!cwUrl || !cwToken || !cwAccount || !cwInbox) {
    const missing = Object.entries({ CHATWOOT_URL: cwUrl, CHATWOOT_API_TOKEN: cwToken, CHATWOOT_ACCOUNT_ID: cwAccount, CHATWOOT_INBOX_ID: cwInbox })
      .filter(([, v]) => !v).map(([k]) => k)
    return { ok: false, reason: `Missing env vars: ${missing.join(', ')}` }
  }

  const headers = { 'api_access_token': cwToken, 'Content-Type': 'application/json' }
  const base = `${cwUrl}/api/v1/accounts/${cwAccount}`

  // 1. Search for existing contact by phone
  let contactId: number | null = null
  try {
    const r = await fetchJson(`${base}/contacts/search?q=${encodeURIComponent(phone)}&include_contacts=true`, { headers })
    if (r.status === 200) {
      const payload = r.body?.payload
      const contacts = Array.isArray(payload) ? payload : (payload?.contacts || [])
      if (contacts.length > 0) contactId = contacts[0].id
    }
  } catch {}

  // 2. Create contact if not found
  let isNewContact = false
  if (!contactId) {
    isNewContact = true
    try {
      const r = await fetchJson(`${base}/contacts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: clientName, phone_number: phone }),
      })
      if (r.status === 200 || r.status === 201) {
        contactId = r.body?.id ?? r.body?.data?.id ?? null
        if (!contactId) {
          // Body structure unknown — search immediately since we know the contact exists
          console.warn(`[Viber] create_contact 2xx but no id in body for ${phone}:`, JSON.stringify(r.body).slice(0, 400))
          try {
            const r2 = await fetchJson(`${base}/contacts/search?q=${encodeURIComponent(phone)}&include_contacts=true`, { headers })
            if (r2.status === 200) {
              const payload = r2.body?.payload
              const contacts = Array.isArray(payload) ? payload : (payload?.contacts || [])
              if (contacts.length > 0) contactId = contacts[0].id
            }
          } catch {}
        }
      } else {
        console.warn(`[Viber] create_contact HTTP ${r.status} for ${phone}:`, JSON.stringify(r.body).slice(0, 400))
        contactId = r.body?.id
          ?? r.body?.data?.id
          ?? (Array.isArray(r.body?.errors) ? r.body.errors[0]?.id : null)
          ?? null
        if (!contactId) {
          await new Promise(resolve => setTimeout(resolve, 2000))
          try {
            const r2 = await fetchJson(`${base}/contacts/search?q=${encodeURIComponent(phone)}&include_contacts=true`, { headers })
            if (r2.status === 200) {
              const payload = r2.body?.payload
              const contacts = Array.isArray(payload) ? payload : (payload?.contacts || [])
              if (contacts.length > 0) contactId = contacts[0].id
            }
          } catch {}
        }
      }
    } catch (e: any) {
      return { ok: false, reason: `create_contact exception: ${e?.message || e}` }
    }
  }

  if (!contactId) return { ok: false, reason: `Could not create/find contact for ${phone}` }

  // Newly created contacts need a moment to register with the Viber provider
  // before a conversation/message against them will actually be delivered.
  if (isNewContact) await new Promise(resolve => setTimeout(resolve, 3000))

  // 3. Reuse an existing conversation on the Viber inbox if one exists,
  // reopening it if it was resolved/closed, instead of always starting a new one.
  let convId: number | null = null
  try {
    const r = await fetchJson(`${base}/contacts/${contactId}/conversations`, { headers })
    if (r.status === 200) {
      const conversations = Array.isArray(r.body?.payload) ? r.body.payload : []
      const existing = conversations
        .filter((c: any) => c.inbox_id === parseInt(cwInbox))
        .sort((a: any, b: any) => (b.last_activity_at || 0) - (a.last_activity_at || 0))[0]
      if (existing) {
        convId = existing.id
        if (existing.status !== 'open') {
          try {
            await fetchJson(`${base}/conversations/${convId}/toggle_status`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ status: 'open' }),
            })
          } catch {}
        }
      }
    }
  } catch {}

  if (!convId) {
    try {
      const r = await fetchJson(`${base}/conversations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ inbox_id: parseInt(cwInbox), contact_id: contactId }),
      })
      if (r.status === 200 || r.status === 201) convId = r.body?.id ?? null
      else return { ok: false, reason: `create_conv HTTP ${r.status}: ${r.text.slice(0, 200)}` }
    } catch (e: any) {
      return { ok: false, reason: `create_conv exception: ${e?.message || e}` }
    }
  }

  if (!convId) return { ok: false, reason: 'Could not create conversation' }

  // 4. Post outgoing message
  try {
    const r = await fetchJson(`${base}/conversations/${convId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: message, message_type: 'outgoing', private: false }),
    })
    // Full body, not just status — Chatwoot reports per-channel delivery
    // problems (e.g. Infobip rejecting the send) via fields on the message
    // object itself (status/source_id/external_error) even on a 200/201,
    // since the HTTP call only confirms Chatwoot *accepted* the message into
    // the conversation, not that the Viber/Infobip channel delivered it.
    console.log(`[Viber] send_msg HTTP ${r.status} convId=${convId} contactId=${contactId} raw body:`, r.text.slice(0, 2000))
    if (r.status === 200 || r.status === 201) {
      const msgStatus = r.body?.status ?? r.body?.message?.status ?? null
      const sourceId = r.body?.source_id ?? r.body?.message?.source_id ?? null
      const externalError = r.body?.external_error ?? r.body?.message?.external_error ?? r.body?.content_attributes?.external_error ?? null
      console.log(`[Viber] message accepted by Chatwoot — status=${msgStatus} source_id=${sourceId} external_error=${externalError ?? '(none)'}`)
      if (msgStatus === 'failed' || externalError) {
        return { ok: false, reason: `Chatwoot accepted but channel reported failure — status=${msgStatus} external_error=${externalError}` }
      }
      return { ok: true, reason: '' }
    }
    return { ok: false, reason: `send_msg HTTP ${r.status}: ${r.text.slice(0, 200)}` }
  } catch (e: any) {
    return { ok: false, reason: `send_msg exception: ${e?.message || e}` }
  }
}

async function chatwootSendWithRetry(clientName: string, phone: string, message: string, maxAttempts = 3): Promise<{ ok: boolean; reason: string }> {
  let lastErr = ''
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { ok, reason } = await chatwootSend(clientName, phone, message)
    if (ok) return { ok: true, reason: '' }
    lastErr = reason
    const lower = reason.toLowerCase()
    const retryable = lower.includes('timed out') || lower.includes('timeout') || lower.includes('connectionpool')
    if (!retryable || attempt === maxAttempts) break
    await new Promise(resolve => setTimeout(resolve, attempt * 3000))
  }
  return { ok: false, reason: lastErr }
}

export async function sendViberMessage(message: ViberMessage): Promise<{ ok: boolean; reason: string }> {
  const phone = normalizeGreekPhone(message.to)
  if (!phone) return { ok: false, reason: `Empty phone number (raw: "${message.to}")` }
  console.log(`[Viber] Attempting send to ${phone} (raw: "${message.to}")`)
  const result = await chatwootSendWithRetry(message.senderName || 'I-MENTOR', phone, message.text)
  if (!result.ok) console.error(`[Viber] Send to ${phone} failed: ${result.reason}`)
  else console.log(`[Viber] Send to ${phone} succeeded`)
  return result
}
