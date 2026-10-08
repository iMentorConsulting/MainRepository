import nodemailer from 'nodemailer';

let transport = null;
const configured = () => Boolean(process.env.SMTP_HOST);

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

export async function sendMail({ to, subject, text }) {
  if (!configured()) {
    console.log(`[mail] (SMTP δεν έχει ρυθμιστεί) → ${to}\n  Θέμα: ${subject}\n  ${text.replace(/\n/g, '\n  ')}`);
    return { sent: false, reason: 'SMTP δεν έχει ρυθμιστεί' };
  }
  await getTransport().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
  return { sent: true };
}
