import nodemailer from 'nodemailer'
import { google } from 'googleapis'

const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER || ''
const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || ''
const smtpPort = parseInt(process.env.SMTP_PORT || '587')
const fromAddress = process.env.SMTP_FROM || smtpUser || 'noreply@i-mentor.gr'

// Cloud hosts (Railway included) commonly block/throttle outbound SMTP ports
// (25/465/587), which surfaces as ETIMEDOUT connecting to smtp.gmail.com.
// When a Google service-account key is provided, we send via the Gmail API
// over HTTPS instead — using domain-wide delegation to send "as" SMTP_USER.
const googleServiceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ''

function getGmailClient() {
  if (!googleServiceAccountJson || !smtpUser) return null
  const credentials = JSON.parse(googleServiceAccountJson)
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: smtpUser, // impersonate this mailbox via domain-wide delegation
  })
  return google.gmail({ version: 'v1', auth })
}

function buildRawEmail(to: string, subject: string, html: string): string {
  const headers = [
    `From: iMentor Consulting <${fromAddress}>`,
    `To: ${to}`,
    `Subject: =?utf-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ].join('\r\n')
  const body = Buffer.from(html, 'utf-8').toString('base64')
  const message = `${headers}\r\n\r\n${body}`
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sendViaGmailApi(to: string, subject: string, html: string): Promise<boolean> {
  const gmail = getGmailClient()
  if (!gmail) return false
  try {
    console.log(`[Email] Sending to ${to} via Gmail API as ${smtpUser}`)
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: buildRawEmail(to, subject, html) },
    })
    console.log(`[Email] Sent to ${to} via Gmail API`)
    return true
  } catch (error: any) {
    console.error(`[Email] Gmail API send error for ${to}:`, error?.message || error)
    return false
  }
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: smtpPort,
  secure: smtpPort === 465,
  requireTLS: smtpPort !== 465,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  // Railway's containers often have broken/slow IPv6 routing to Gmail's SMTP
  // servers, which manifests as ETIMEDOUT on connection — force IPv4.
  // `family` isn't in nodemailer's TS typings but is forwarded to net.connect.
  family: 4,
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
} as any)

interface EmailData {
  to: string
  subject: string
  html: string
}

export async function sendEmail(data: EmailData): Promise<boolean> {
  if (googleServiceAccountJson) {
    return sendViaGmailApi(data.to, data.subject, data.html)
  }

  if (!smtpUser || !smtpPass) {
    console.error('[Email] Missing SMTP credentials (SMTP_USER/SMTP_PASS or GMAIL_USER/GMAIL_APP_PASSWORD)')
    return false
  }
  try {
    console.log(`[Email] Sending to ${data.to} via ${process.env.SMTP_HOST || 'smtp.gmail.com'}:${smtpPort} as ${smtpUser}`)
    await transporter.sendMail({
      from: fromAddress,
      to: data.to,
      subject: data.subject,
      html: data.html,
    })
    console.log(`[Email] Sent to ${data.to}`)
    return true
  } catch (error: any) {
    console.error(`[Email] Send error for ${data.to}:`, error?.message || error)
    return false
  }
}

interface CampaignEmailOptions {
  title: string
  bodyText: string
  recipientName: string
  imentorLogoUrl?: string
  accountantOfficeName?: string
  accountantLogoUrl?: string
  ctaUrl?: string
  ctaLabel?: string
  unsubscribeUrl?: string
}

// Renders a polished, branded HTML email: a dark blue header banner with the
// I-MENTOR / accountant identity and a status badge, a personalized greeting,
// the message body rendered as styled paragraphs/bullets, an optional CTA
// button, and a footer disclaimer about automated messages.
export function renderCampaignEmailHtml(options: CampaignEmailOptions): string {
  const {
    title,
    bodyText,
    recipientName,
    imentorLogoUrl,
    accountantOfficeName,
    accountantLogoUrl,
    ctaUrl,
    ctaLabel,
    unsubscribeUrl,
  } = options

  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
      const isBulletBlock = lines.length > 1 && lines.every(l => l.startsWith('•') || l.startsWith('-'))
      if (isBulletBlock) {
        return `<ul style="margin:0 0 16px;padding:0;list-style:none;">
          ${lines.map(l => `<li style="padding:6px 0 6px 22px;position:relative;color:#334155;font-size:14px;line-height:1.6;">
            <span style="position:absolute;left:0;top:6px;color:#1e3a8a;font-weight:700;">•</span>${l.replace(/^[•-]\s*/, '')}
          </li>`).join('')}
        </ul>`
      }
      return `<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.7;">${lines.join('<br>')}</p>`
    })
    .join('')

  const brandLeft = imentorLogoUrl
    ? `<img src="${imentorLogoUrl}" alt="I-MENTOR" height="32" style="display:block;" />`
    : '<span style="font-weight:800;letter-spacing:.5px;color:#ffffff;font-size:18px;">iMENTOR <span style="font-weight:400;opacity:.8;">CONSULTING</span></span>'

  const brandRight = accountantLogoUrl
    ? `<img src="${accountantLogoUrl}" alt="${accountantOfficeName || ''}" height="32" style="display:block;margin-left:auto;" />`
    : (accountantOfficeName
        ? `<span style="color:#cbd5e1;font-size:13px;font-weight:600;">${accountantOfficeName}</span>`
        : '')

  const cta = ctaUrl
    ? `<table cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
        <tr><td style="border-radius:8px;background:#1d4ed8;">
          <a href="${ctaUrl}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
            🔗 ${ctaLabel || 'Δείτε το Portal σας'}
          </a>
        </td></tr>
      </table>`
    : ''

  const unsubscribeRow = unsubscribeUrl
    ? `<p style="margin:12px 0 0;color:#94a3b8;font-size:11px;">
        Διαχείριση ενημερώσεων: <a href="${unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline;">απεγγραφή</a>
      </p>`
    : ''

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08);">

        <tr><td style="background:linear-gradient(135deg,#1e3a8a,#1e40af);padding:24px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>${brandLeft}</td>
            <td align="right">${brandRight}</td>
          </tr></table>
          <div style="margin-top:18px;display:inline-block;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:5px 14px;color:#dbeafe;font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;">
            Αυτόματη Ενημέρωση
          </div>
        </td></tr>

        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0 0 18px;color:#0f172a;font-size:16px;font-weight:700;">Αγαπητέ/ή ${recipientName},</p>
          ${paragraphs}
          ${cta}
        </td></tr>

        <tr><td style="padding:0 28px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;padding-top:18px;">
            <tr><td style="color:#94a3b8;font-size:11px;line-height:1.6;">
              🔒 Αυτό είναι ένα αυτοματοποιημένο μήνυμα ενημέρωσης. Μη δημιουργηθεί επιβεβαίωση παραλαβής, παρακαλούμε επικοινωνήστε με το λογιστικό σας γραφείο ή απαντήστε σε αυτό το email για οποιαδήποτε ερώτηση.
              ${unsubscribeRow}
            </td></tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>`
}

export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result
}

export async function testSmtpConnection(): Promise<{ ok: boolean; error?: string }> {
  if (googleServiceAccountJson) {
    const gmail = getGmailClient()
    if (!gmail) {
      return { ok: false, error: 'Λείπει το SMTP_USER (mailbox προς αποστολή) για χρήση με το Gmail API' }
    }
    try {
      await gmail.users.getProfile({ userId: 'me' })
      return { ok: true }
    } catch (error: any) {
      console.error('[Email] Gmail API verify failed:', error?.message || error)
      return { ok: false, error: `[Gmail API] ${error?.message || 'Άγνωστο σφάλμα σύνδεσης'}` }
    }
  }

  if (!smtpUser || !smtpPass) {
    return { ok: false, error: 'Λείπουν τα SMTP_USER / SMTP_PASS (ή GMAIL_USER / GMAIL_APP_PASSWORD)' }
  }
  try {
    await transporter.verify()
    return { ok: true }
  } catch (error: any) {
    console.error('[Email] SMTP verify failed:', error?.code, error?.message || error)
    return { ok: false, error: `${error?.code ? `[${error.code}] ` : ''}${error?.message || 'Άγνωστο σφάλμα σύνδεσης'}` }
  }
}
