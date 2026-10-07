const https = require('https');

function getReceivers() {
  // VIBER_RECEIVER_IDS: comma-separated list of Viber user IDs (takes priority)
  // VIBER_RECEIVER_ID: single legacy ID (kept for backward compat)
  const multi = process.env.VIBER_RECEIVER_IDS;
  if (multi) return multi.split(',').map(s => s.trim()).filter(Boolean);
  const single = process.env.VIBER_RECEIVER_ID;
  return single ? [single] : [];
}

function postToViber(token, receiver, text) {
  const body = JSON.stringify({
    receiver,
    type: 'text',
    sender: { name: 'i-Mentor Finance' },
    text,
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'chatapi.viber.com',
      path: '/pa/send_message',
      method: 'POST',
      headers: {
        'X-Viber-Auth-Token': token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', (e) => {
      console.warn('[viber] send failed:', e.message);
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

async function sendViberMessage(text) {
  const token = process.env.VIBER_BOT_TOKEN;
  const receivers = getReceivers();
  if (!token || !receivers.length) return;
  await Promise.all(receivers.map(id => postToViber(token, id, text)));
}

module.exports = { sendViberMessage };
