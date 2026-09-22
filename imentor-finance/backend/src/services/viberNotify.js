const https = require('https');

async function sendViberMessage(text) {
  const token = process.env.VIBER_BOT_TOKEN;
  const receiver = process.env.VIBER_RECEIVER_ID;
  if (!token || !receiver) return;

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

module.exports = { sendViberMessage };
