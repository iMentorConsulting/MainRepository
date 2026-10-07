const https = require('https');
const http = require('http');

// Send via the shared Viber bridge (viber-bridge.i-mentor.gr).
// Env vars:
//   VIBER_BRIDGE_URL    e.g. https://viber-bridge.i-mentor.gr
//   VIBER_BRIDGE_PHONES comma-separated phone numbers, e.g. 6952101541,6944000000
async function sendViberMessage(text, { name = 'i-Mentor Finance' } = {}) {
  const bridgeUrl = (process.env.VIBER_BRIDGE_URL || '').replace(/\/$/, '');
  const phones    = (process.env.VIBER_BRIDGE_PHONES || '')
    .split(',').map(p => p.trim()).filter(Boolean);

  if (!bridgeUrl || !phones.length) return;

  await Promise.all(phones.map(phone => postToBridge(bridgeUrl, phone, text, name)));
}

function postToBridge(baseUrl, phone, text, senderName) {
  const payload = JSON.stringify({ to: phone, text, name: senderName });
  const url = new URL(`${baseUrl}/send`);
  const lib = url.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const req = lib.request({
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          console.warn(`[viber-bridge] ${res.statusCode} for ${phone}: ${data.slice(0, 200)}`);
          resolve(false);
        }
      });
    });
    req.on('error', e => {
      console.warn('[viber-bridge] request failed:', e.message);
      resolve(false);
    });
    req.write(payload);
    req.end();
  });
}

module.exports = { sendViberMessage };
