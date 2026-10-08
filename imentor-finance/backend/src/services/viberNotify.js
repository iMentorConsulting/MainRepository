const https = require('https');

// Send a Viber message to one or more phone numbers via the Chatwoot Viber inbox.
// Chatwoot delivers the message through its configured Viber channel when an
// outgoing (non-private) message is posted to a contact's conversation.
//
// Required Railway env vars (same ones the CM backend uses):
//   CHATWOOT_URL            https://chat.i-mentor.gr
//   CHATWOOT_API_TOKEN      <your Chatwoot access token>
//   CHATWOOT_ACCOUNT_ID     1  (or whatever account number)
//   CHATWOOT_VIBER_INBOX_ID <ID of the Viber inbox in Chatwoot>
//   VIBER_BRIDGE_PHONES     6952101541  (comma-separated phone numbers)

function getConfig() {
  return {
    base:    (process.env.CHATWOOT_URL || '').replace(/\/$/, ''),
    token:   process.env.CHATWOOT_API_TOKEN || '',
    account: process.env.CHATWOOT_ACCOUNT_ID || '1',
    inboxId: process.env.CHATWOOT_VIBER_INBOX_ID || '',
    phones:  (process.env.VIBER_BRIDGE_PHONES || '').split(',').map(p => p.trim()).filter(Boolean),
  };
}

async function sendViberMessage(text) {
  const cfg = getConfig();
  if (!cfg.base || !cfg.token || !cfg.inboxId || !cfg.phones.length) return;

  await Promise.all(cfg.phones.map(phone => sendToPhone(cfg, phone, text)));
}

async function sendToPhone(cfg, rawPhone, text) {
  // Normalize to international format without +
  let phone = rawPhone.replace(/[\s\-()]/g, '');
  if (phone.startsWith('0'))       phone = '30' + phone.slice(1);
  else if (phone.startsWith('+'))  phone = phone.slice(1);
  else if (!phone.startsWith('30')) phone = '30' + phone;

  const api = `${cfg.base}/api/v1/accounts/${cfg.account}`;
  const headers = { 'api_access_token': cfg.token, 'Content-Type': 'application/json' };

  try {
    // 1. Find or create contact by phone
    let contactId = await findContact(api, headers, phone);
    if (!contactId) contactId = await createContact(api, headers, phone);
    if (!contactId) { console.warn('[viber-chatwoot] could not find/create contact for', phone); return; }

    // 2. Find or open conversation in the Viber inbox
    let convId = await findConversation(api, headers, contactId, cfg.inboxId);
    if (!convId) convId = await createConversation(api, headers, contactId, cfg.inboxId);
    if (!convId) { console.warn('[viber-chatwoot] could not find/create conversation for', phone); return; }

    // 3. Post outgoing message — Chatwoot delivers it via the Viber channel
    await chatwootPost(`${api}/conversations/${convId}/messages`, headers, {
      content:      text,
      message_type: 'outgoing',
      private:      false,
    });
  } catch (e) {
    console.warn('[viber-chatwoot] error for', phone, ':', e.message);
  }
}

async function findContact(api, headers, phone) {
  // Try multiple formats: international with/without +, and local (strip country code)
  const local = phone.startsWith('30') ? phone.slice(2) : phone;
  for (const q of [phone, `+${phone}`, local]) {
    const data = await chatwootGet(`${api}/contacts/search?q=${encodeURIComponent(q)}&include_contacts=true`, headers);
    // Chatwoot may return payload as {contacts:[]} or as a bare list
    const payload = data?.payload;
    const hits = Array.isArray(payload) ? payload
      : (Array.isArray(payload?.contacts) ? payload.contacts : []);
    if (hits.length) return hits[0].id;
  }
  return null;
}

async function createContact(api, headers, phone) {
  const data = await chatwootPost(`${api}/contacts`, headers, {
    name: `+${phone}`,
    phone_number: `+${phone}`,
  });
  return data?.id || data?.contact?.id || null;
}

async function findConversation(api, headers, contactId, inboxId) {
  const data = await chatwootGet(`${api}/contacts/${contactId}/conversations`, headers);
  const list = Array.isArray(data?.payload) ? data.payload : [];
  const conv = list.find(c => String(c.inbox_id) === String(inboxId));
  if (conv) {
    // Re-open if resolved so the message goes through
    if (conv.status === 'resolved') {
      await chatwootPost(`${api}/conversations/${conv.id}`, headers, { status: 'open' }, 'PATCH');
    }
    return conv.id;
  }
  return null;
}

async function createConversation(api, headers, contactId, inboxId) {
  const data = await chatwootPost(`${api}/conversations`, headers, {
    inbox_id:   parseInt(inboxId),
    contact_id: contactId,
    status:     'open',
  });
  return data?.id || null;
}

function chatwootGet(url, headers) {
  return chatwootRequest('GET', url, headers, null);
}

function chatwootPost(url, headers, body, method = 'POST') {
  return chatwootRequest(method, url, headers, body);
}

function chatwootRequest(method, url, headers, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const parsed = new URL(url);
    const reqHeaders = { ...headers };
    if (payload) reqHeaders['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request({
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname + (parsed.search || ''),
      method,
      headers:  reqHeaders,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.warn(`[viber-chatwoot] ${method} ${parsed.pathname} → HTTP ${res.statusCode}: ${data.slice(0, 300)}`);
          resolve(null);
          return;
        }
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', e => { console.warn('[viber-chatwoot] request error:', e.message); resolve(null); });
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { sendViberMessage };
