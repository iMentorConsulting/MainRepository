import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

// Simple in-memory rate limit: max 3 invites per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return false
  }
  if (entry.count >= 3) return true
  entry.count++
  return false
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Έχετε στείλει πολλές προσκλήσεις. Δοκιμάστε ξανά αργότερα.' }, { status: 429 })
  }

  const { ownerName, businessName, accountantEmail, accountantName } = await request.json()

  if (!ownerName?.trim() || !businessName?.trim() || !accountantEmail?.trim()) {
    return NextResponse.json({ error: 'Συμπληρώστε όλα τα υποχρεωτικά πεδία.' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(accountantEmail.trim())) {
    return NextResponse.json({ error: 'Μη έγκυρη διεύθυνση email.' }, { status: 400 })
  }

  const greeting = accountantName?.trim() ? `Αγαπητέ/ή ${accountantName.trim()},` : 'Αγαπητέ/ή Λογιστή,'
  const registerUrl = `${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/register`

  await sendEmail({
    to: accountantEmail.trim(),
    subject: `${ownerName.trim()} σας προσκαλεί στο I-MENTOR Portal`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0f172a, #312e81); padding: 28px 32px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px; font-weight: bold;">I-MENTOR Portal</h1>
          <p style="color: #a5b4fc; margin: 6px 0 0; font-size: 14px;">Πρόσκληση συνεργασίας</p>
        </div>
        <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
          <p style="color: #374151; font-size: 15px; margin-top: 0;">${greeting}</p>
          <p style="color: #374151; font-size: 15px;">
            Ο/Η <strong>${ownerName.trim()}</strong>, ιδιοκτήτης/τρια της επιχείρησης <strong>${businessName.trim()}</strong>,
            σας στέλνει αυτή την πρόσκληση και σας ζητά να εγγραφείτε στην πλατφόρμα <strong>I-MENTOR Portal</strong>.
          </p>
          <p style="color: #374151; font-size: 15px;">
            Μέσω της πλατφόρμας μπορείτε να εντοπίσετε επιδοτήσεις ΕΣΠΑ/ΔΥΠΑ που αφορούν τους πελάτες σας,
            να ενημερώνεστε αυτόματα για νέα προγράμματα και να διεκπεραιώνετε υποθέσεις σε συνεργασία με την I-MENTOR —
            χωρίς καμία χρέωση για το γραφείο σας.
          </p>
          <div style="margin: 28px 0; text-align: center;">
            <a href="${registerUrl}"
              style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #4338ca); color: white; text-decoration: none;
                     padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: bold;">
              Εγγραφή Λογιστικού Γραφείου →
            </a>
          </div>
          <p style="color: #6b7280; font-size: 13px; margin-bottom: 0;">
            Η εγγραφή είναι δωρεάν και διαρκεί λιγότερο από 2 λεπτά.
            Αν έχετε ήδη λογαριασμό, απλώς συνδεθείτε στο
            <a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/login" style="color: #4f46e5;">logistis.i-mentor.gr</a>.
          </p>
        </div>
        <p style="color: #9ca3af; font-size: 11px; text-align: center; margin-top: 16px;">
          Αυτό το μήνυμα στάλθηκε κατόπιν αιτήματος μέσω της πλατφόρμας I-MENTOR.
          Αν δεν αναμένατε αυτό το email, μπορείτε να το αγνοήσετε.
        </p>
      </div>
    `,
  })

  return NextResponse.json({ success: true })
}
