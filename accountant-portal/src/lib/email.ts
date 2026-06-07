import nodemailer from 'nodemailer'

const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER || ''
const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || ''
const smtpPort = parseInt(process.env.SMTP_PORT || '587')

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: smtpPort,
  secure: smtpPort === 465,
  requireTLS: smtpPort !== 465,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
})

interface EmailData {
  to: string
  subject: string
  html: string
}

export async function sendEmail(data: EmailData): Promise<boolean> {
  if (!smtpUser || !smtpPass) {
    console.error('[Email] Missing SMTP credentials (SMTP_USER/SMTP_PASS or GMAIL_USER/GMAIL_APP_PASSWORD)')
    return false
  }
  try {
    console.log(`[Email] Sending to ${data.to} via ${process.env.SMTP_HOST || 'smtp.gmail.com'}:${smtpPort} as ${smtpUser}`)
    await transporter.sendMail({
      from: process.env.SMTP_FROM || smtpUser || 'noreply@i-mentor.gr',
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

export async function testSmtpConnection(): Promise<boolean> {
  try {
    await transporter.verify()
    return true
  } catch {
    return false
  }
}
