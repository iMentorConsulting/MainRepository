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

function getGmailAuth() {
  if (!googleServiceAccountJson || !smtpUser) return null
  const credentials = JSON.parse(googleServiceAccountJson)
  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: smtpUser, // impersonate this mailbox via domain-wide delegation
  })
}

function getGmailClient() {
  const auth = getGmailAuth()
  if (!auth) return null
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
  unsubscribeUrl?: string
  ermisLink?: string
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
    unsubscribeUrl,
    ermisLink,
  } = options

  const paragraphs = bodyText
    // Convert Viber *bold* markdown to HTML <strong> tags; drop empty ** pairs
    .replace(/\*([^*]*)\*/g, (_, inner) => inner.trim() ? `<strong>${inner}</strong>` : '')
    // Remove common emoji ranges that don't render well in email clients
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[☀-➿]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/g, '')
    // Drop a leading greeting line ("Γειά σας, ..." or "Αγαπητοί συνεργάτες της ...") —
    // the wrapper already renders "Αγαπητέ/ή ..."
    .replace(/^\s*(Γειά σας|Αγαπητο[ίοι] συνεργάτ[ηε]ς?)[^\n]*\n+/, '')
    // The Ερμής link and unsubscribe link are rendered separately (CTA button /
    // footer), so drop any raw text line that still contains either URL.
    .split('\n')
    .filter(line => !(ermisLink && line.includes(ermisLink)) && !(unsubscribeUrl && line.includes(unsubscribeUrl)))
    .join('\n')
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
      // Bold the closing signature line(s) ending with "& I-MENTOR"
      const styledLines = lines.map(l => /&\s*I-MENTOR\s*$/.test(l) ? `<strong>${l}</strong>` : l)
      return `<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.7;">${styledLines.join('<br>')}</p>`
    })
    .join('')

  const brandLeft = imentorLogoUrl
    ? `<img src="${imentorLogoUrl}" alt="I-MENTOR" height="72" style="display:block;height:72px;width:auto;max-width:260px;object-fit:contain;" />`
    : '<span style="font-weight:800;letter-spacing:.5px;color:#ffffff;font-size:20px;">iMENTOR <span style="font-weight:400;opacity:.8;">CONSULTING</span></span>'

  const brandRight = accountantLogoUrl
    ? `<img src="${accountantLogoUrl}" alt="${accountantOfficeName || ''}" height="90" style="display:block;height:90px;width:auto;max-width:300px;object-fit:contain;margin-left:auto;" />`
    : (accountantOfficeName
        ? `<span style="color:#cbd5e1;font-size:14px;font-weight:600;">${accountantOfficeName}</span>`
        : '')

  const ermisButton = ermisLink
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">
        <tr><td align="center">
          <a href="${ermisLink}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:10px;box-shadow:0 2px 6px rgba(79,70,229,.35);">
            💬 Μίλα με τον Ερμή — μάθε αν είσαι επιλέξιμος
          </a>
        </td></tr>
      </table>`
    : ''

  const unsubscribeRow = unsubscribeUrl
    ? `<p style="margin:12px 0 0;color:#94a3b8;font-size:11px;">
        Δεν επιθυμείτε να λαμβάνετε ενημερώσεις σαν κι αυτή; <a href="${unsubscribeUrl}" style="color:#64748b;text-decoration:underline;">Κάντε απεγγραφή εδώ</a>.
      </p>`
    : ''

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08);">

        <tr><td style="background:linear-gradient(135deg,#1e3a8a,#1e40af);padding:24px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td valign="middle" align="left" style="padding-right:12px;">${brandLeft}</td>
            <td valign="middle" align="right" style="padding-left:12px;">${brandRight}</td>
          </tr></table>
          <div style="margin-top:18px;display:inline-block;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:5px 14px;color:#dbeafe;font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;">
            Αυτόματη Ενημέρωση
          </div>
        </td></tr>

        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0 0 18px;color:#0f172a;font-size:16px;font-weight:700;">Αγαπητέ/ή ${recipientName},</p>
          ${paragraphs}
        </td></tr>

        ${ermisButton ? `<tr><td style="padding:0 28px 8px;">${ermisButton}</td></tr>` : ''}

        <tr><td style="padding:0 28px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;padding-top:18px;">
            <tr><td style="color:#94a3b8;font-size:11px;line-height:1.6;">
              🔒 ${accountantOfficeName
                ? `Αυτό είναι ένα αυτοματοποιημένο μήνυμα ενημέρωσης από το λογιστικό σας γραφείο σε συνεργασία με την I-MENTOR Consulting. Για οποιαδήποτε ερώτηση, επικοινωνήστε απευθείας με το λογιστικό σας γραφείο.`
                : `Αυτό είναι ένα αυτοματοποιημένο μήνυμα ενημέρωσης από την I-MENTOR Consulting. Για οποιαδήποτε ερώτηση, απαντήστε σε αυτό το μήνυμα.`
              }
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
  variables: Record<string, string>,
  options?: { boldKeys?: string[] }
): string {
  let result = template
  const boldKeys = new Set(options?.boldKeys || [])
  for (const [key, value] of Object.entries(variables)) {
    const replacement = value && boldKeys.has(key) ? `<strong>${value}</strong>` : value
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), replacement)
  }
  return result
}

export async function testSmtpConnection(): Promise<{ ok: boolean; error?: string }> {
  if (googleServiceAccountJson) {
    const auth = getGmailAuth()
    if (!auth) {
      return { ok: false, error: 'Λείπει το SMTP_USER (mailbox προς αποστολή) για χρήση με το Gmail API' }
    }
    try {
      // Only request an access token scoped to gmail.send — calling an API
      // like users.getProfile would require a broader scope (gmail.readonly/
      // gmail.metadata) that domain-wide delegation may not have authorized,
      // surfacing a misleading "insufficient authentication scopes" error.
      await auth.authorize()
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
