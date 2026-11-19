const crypto = require('crypto');
const https = require('https');

function parseServiceAccountJson() {
  const candidates = [
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
  ].filter(Boolean);
  if (!candidates.length) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set in Railway');
  for (const src of candidates) {
    const s = src.indexOf('{'); const e = src.lastIndexOf('}');
    if (s !== -1 && e > s) {
      try { return JSON.parse(src.slice(s, e + 1)); } catch (_) {}
    }
  }
  throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON — paste the raw key file contents into Railway');
}

async function getGmailAccessToken(impersonateEmail) {
  const { client_email, private_key } = parseServiceAccountJson();
  if (!client_email || !private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key');

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: client_email,
    sub: impersonateEmail,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const toSign = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(toSign);
  const signature = sign.sign(private_key, 'base64url');
  const jwt = `${toSign}.${signature}`;

  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const data = JSON.parse(Buffer.concat(chunks).toString());
        if (data.access_token) resolve(data.access_token);
        else reject(new Error(`Gmail token error: ${JSON.stringify(data)}`));
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

/**
 * Send email via Gmail API using service account impersonation.
 * @param {string} fromAddr - Gmail address to send from (service account impersonates this)
 * @param {string} to - recipient email
 * @param {string|null} bcc - bcc address or null
 * @param {string} subject - email subject
 * @param {string} html - HTML body
 * @param {Array<{filename:string, content:Buffer, mimeType?:string}>} attachments
 */
async function sendViaGmailApi(fromAddr, to, bcc, subject, html, attachments = []) {
  const accessToken = await getGmailAccessToken(fromAddr);
  const outerBoundary = `outer_${Date.now()}`;
  const innerBoundary = `inner_${Date.now()}`;
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;

  const lines = [
    `From: i-Mentor <${fromAddr}>`,
    `To: ${to}`,
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
  ];

  let mimeBody;
  if (attachments.length === 0) {
    // Simple HTML-only email
    lines.push(`Content-Type: multipart/alternative; boundary="${innerBoundary}"`, '');
    lines.push(`--${innerBoundary}`);
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(html).toString('base64'));
    lines.push(`--${innerBoundary}--`);
    mimeBody = lines.join('\r\n');
  } else {
    // multipart/mixed with HTML body + attachments
    lines.push(`Content-Type: multipart/mixed; boundary="${outerBoundary}"`, '');
    lines.push(`--${outerBoundary}`);
    lines.push(`Content-Type: multipart/alternative; boundary="${innerBoundary}"`);
    lines.push('');
    lines.push(`--${innerBoundary}`);
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(html).toString('base64'));
    lines.push(`--${innerBoundary}--`);
    for (const att of attachments) {
      lines.push('');
      lines.push(`--${outerBoundary}`);
      lines.push(`Content-Type: ${att.mimeType || 'application/octet-stream'}`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
      lines.push('');
      lines.push(att.content.toString('base64'));
    }
    lines.push('');
    lines.push(`--${outerBoundary}--`);
    mimeBody = lines.join('\r\n');
  }

  const raw = Buffer.from(mimeBody).toString('base64url');
  const body = JSON.stringify({ raw });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'gmail.googleapis.com',
      path: '/gmail/v1/users/me/messages/send',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const data = JSON.parse(Buffer.concat(chunks).toString());
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`Gmail API ${res.statusCode}: ${JSON.stringify(data)}`));
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

module.exports = { sendViaGmailApi };
