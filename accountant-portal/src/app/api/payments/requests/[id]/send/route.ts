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

  if (!pr.stripePaymentLink) {
    return NextResponse.json({ error: 'No payment link available' }, { status: 400 })
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
      <div style="max-width:600px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <div style="background:#1e40af;padding:24px;text-align:center;">
          <h1 style="color:white;margin:0;font-size:24px;">I-MENTOR</h1>
          <p style="color:#bfdbfe;margin:8px 0 0;">σε συνεργασία με ${pr.accountant.officeName}</p>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#1e40af;margin-top:0;">Αίτημα Πληρωμής</h2>
          <p>Αγαπητέ/ή ${pr.business.onomasia || 'Πελάτη'},</p>
          <p>Λάβαμε αίτημα από το λογιστικό γραφείο <strong>${pr.accountant.officeName}</strong> για την υπηρεσία:</p>
          <div style="background:#eff6ff;border-left:4px solid #1e40af;padding:16px;margin:16px 0;border-radius:4px;">
            <h3 style="margin:0 0 8px;color:#1e40af;">${pr.service.name}</h3>
            ${pr.description ? `<p style="margin:0;color:#374151;">${pr.description}</p>` : ''}
            ${pr.program ? `<p style="margin:8px 0 0;color:#6b7280;">Πρόγραμμα: ${pr.program.title}</p>` : ''}
          </div>
          <div style="text-align:center;padding:16px 0;">
            <p style="font-size:32px;font-weight:bold;color:#059669;margin:0;">${amountFormatted}</p>
          </div>
          <div style="text-align:center;margin:24px 0;">
            <a href="${pr.stripePaymentLink}" style="background:#1e40af;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block;">
              Ολοκλήρωση Πληρωμής
            </a>
          </div>
          <p style="color:#6b7280;font-size:14px;text-align:center;">Αποδεκτές μέθοδοι πληρωμής: Πιστωτική/Χρεωστική κάρτα, SEPA Direct Debit</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
          <p style="color:#6b7280;font-size:12px;text-align:center;">
            Αυτό το μήνυμα εστάλη από την I-MENTOR σε συνεργασία με ${pr.accountant.officeName}.<br/>
            ${pr.accountant.phone ? `Τηλ: ${pr.accountant.phone}` : ''}
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  await transporter.sendMail({
    from: `"I-MENTOR & ${pr.accountant.officeName}" <${process.env.SMTP_FROM}>`,
    to: pr.business.email,
    subject: `Αίτημα Πληρωμής: ${pr.service.name} - ${amountFormatted}`,
    html,
  })

  // Update status to SENT
  await prisma.paymentRequest.update({
    where: { id: params.id },
    data: { status: 'SENT' },
  })

  return NextResponse.json({ success: true })
}
