import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import nodemailer from 'nodemailer'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pr = await prisma.paymentRequest.findUnique({
    where: { id: params.id },
    include: {
      business: true,
      accountant: true,
      service: true,
      program: true,
    },
  })

  if (!pr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Accountants can only send for their own payment requests
  if (session.user.role === 'ACCOUNTANT' && pr.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!pr.business.email) {
    return NextResponse.json({ error: 'Business has no email' }, { status: 400 })
  }

  if (!pr.irisLink) {
    return NextResponse.json({ error: 'No IRIS payment link available' }, { status: 400 })
  }

  if (pr.status === 'PAID') {
    return NextResponse.json({ error: 'Payment already completed' }, { status: 400 })
  }

  if (pr.status === 'EXPIRED' || pr.status === 'CANCELLED') {
    return NextResponse.json({ error: 'Payment request is no longer active' }, { status: 400 })
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: parseInt(process.env.SMTP_PORT || '587') === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  const amountFormatted = (pr.amount / 100).toLocaleString('el-GR', {
    style: 'currency',
    currency: 'EUR',
  })

  const html = `
<!DOCTYPE html>
<html lang="el">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px;margin:0;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e40af,#1d4ed8);padding:28px 32px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:26px;font-weight:700;">I-MENTOR</h1>
      <p style="color:#bfdbfe;margin:6px 0 0;font-size:14px;">σε συνεργασία με ${pr.accountant.officeName}</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <h2 style="color:#1e40af;margin-top:0;font-size:20px;">Αίτημα Πληρωμής μέσω IRIS</h2>
      <p style="color:#374151;">Αγαπητέ/ή <strong>${pr.business.onomasia || 'Πελάτη'}</strong>,</p>
      <p style="color:#374151;">Το λογιστικό γραφείο <strong>${pr.accountant.officeName}</strong> σε συνεργασία με την <strong>I-MENTOR</strong> σας αποστέλλει αίτημα πληρωμής για:</p>

      <!-- Service box -->
      <div style="background:#eff6ff;border-left:4px solid #1e40af;padding:16px 20px;border-radius:6px;margin:20px 0;">
        <h3 style="margin:0 0 6px;color:#1e40af;font-size:16px;">${pr.service.name}</h3>
        ${pr.description ? `<p style="margin:0;color:#374151;font-size:14px;">${pr.description}</p>` : ''}
        ${pr.program ? `<p style="margin:8px 0 0;color:#6b7280;font-size:13px;">Πρόγραμμα: ${pr.program.title}</p>` : ''}
      </div>

      <!-- Amount -->
      <div style="text-align:center;padding:20px 0;">
        <p style="font-size:42px;font-weight:800;color:#059669;margin:0;">${amountFormatted}</p>
      </div>

      <!-- IRIS Button -->
      <div style="text-align:center;margin:16px 0 24px;">
        <a href="${pr.irisLink}" style="background:#1e40af;color:white;padding:16px 36px;border-radius:10px;text-decoration:none;font-size:17px;font-weight:700;display:inline-block;letter-spacing:0.3px;">
          💳 Πληρωμή με IRIS
        </a>
        <p style="color:#6b7280;font-size:12px;margin:8px 0 0;">Ανοίγει την τραπεζική σας εφαρμογή</p>
      </div>

      <!-- Payment details box -->
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:20px 0;">
        <h4 style="margin:0 0 12px;color:#374151;font-size:14px;text-transform:uppercase;letter-spacing:0.5px;">Στοιχεία Πληρωμής</h4>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:4px 0;color:#6b7280;width:45%;">Αριθμός Αναφοράς:</td><td style="font-weight:700;color:#111827;font-family:monospace;">${pr.irisReference}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;">IBAN Δικαιούχου:</td><td style="font-weight:600;color:#111827;font-family:monospace;">${process.env.IRIS_IBAN}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;">Δικαιούχος:</td><td style="font-weight:600;color:#111827;">${process.env.IRIS_MERCHANT_NAME || 'I-MENTOR'}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;">Ποσό:</td><td style="font-weight:700;color:#059669;">${amountFormatted}</td></tr>
        </table>
        <p style="margin:12px 0 0;color:#6b7280;font-size:12px;">⚠️ Παρακαλούμε συμπεριλάβετε τον Αριθμό Αναφοράς στην αιτιολογία της συναλλαγής.</p>
      </div>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
      <p style="color:#6b7280;font-size:12px;text-align:center;">
        Αυτό το μήνυμα εστάλη από την I-MENTOR σε συνεργασία με ${pr.accountant.officeName}.
        ${pr.accountant.phone ? `<br/>Τηλ. γραφείου: ${pr.accountant.phone}` : ''}
      </p>
    </div>
  </div>
</body>
</html>
`

  await transporter.sendMail({
    from: `"I-MENTOR & ${pr.accountant.officeName}" <${process.env.SMTP_FROM}>`,
    to: pr.business.email,
    subject: `Αίτημα Πληρωμής IRIS: ${pr.service.name} - ${amountFormatted}`,
    html,
  })

  // Update status to SENT
  await prisma.paymentRequest.update({
    where: { id: params.id },
    data: { status: 'SENT' },
  })

  return NextResponse.json({ success: true })
}
