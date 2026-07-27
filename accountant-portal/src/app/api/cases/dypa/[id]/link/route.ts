import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { sendViberMessage } from '@/lib/viber'

// Generates a fresh, time-limited public link the accountant can send to the
// business so it can fill in the entire ΔΥΠΑ assignment wizard itself, and
// notifies the business by email/Viber on behalf of I-MENTOR + the accountant.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const assignment = await prisma.dypaAssignment.findUnique({
    where: { id: params.id },
    include: {
      clientCase: {
        select: {
          accountantId: true,
          accountant: { select: { officeName: true } },
          business: { select: { onomasia: true, afm: true, email: true, phone: true } },
        },
      },
    },
  })
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && assignment.clientCase.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const contactEmail = (body.contactEmail || assignment.clientCase.business?.email || '').trim()
  const contactPhone = (body.contactPhone || assignment.clientCase.business?.phone || '').trim()

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  const formToken = await prisma.dypaFormToken.create({
    data: { dypaAssignmentId: assignment.id, expiresAt, contactEmail: contactEmail || null, contactPhone: contactPhone || null },
  })

  const url = `${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/dypa/${formToken.token}`
  const businessName = assignment.clientCase.business?.onomasia || assignment.clientCase.business?.afm || ''
  const officeName = assignment.clientCase.accountant?.officeName || ''

  // Email/Viber sends (SMTP handshakes, Chatwoot retries) can take tens of
  // seconds — fire them in the background instead of blocking the response,
  // so the accountant gets the link immediately and isn't left staring at a
  // spinner. Delivery status lands on the token's emailSentAt/viberSentAt.
  void (async () => {
    let emailSent = false
    let viberSent = false

    if (contactEmail) {
      emailSent = await sendEmail({
        to: contactEmail,
        subject: `Επόμενο βήμα για την επιδότηση ΔΥΠΑ πρόσληψης — συμπλήρωση αίτησης`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#374151;">
          <div style="background:linear-gradient(135deg,#4f46e5,#4338ca);padding:28px 32px;border-radius:12px 12px 0 0;">
            <h1 style="color:white;margin:0;font-size:20px;line-height:1.4;">Επόμενο βήμα για την επιδότηση πρόσληψης ΔΥΠΑ</h1>
          </div>
          <div style="background:white;padding:32px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;">
            <p style="font-size:16px;margin:0 0 20px;">Αγαπητέ/ή <strong>${businessName || 'συνεργάτη'}</strong>,</p>

            <p style="font-size:15px;margin:0 0 16px;line-height:1.7;">
              Σε συνέχεια του ενδιαφέροντός σας για την <strong>επιδότηση πρόσληψης ανέργου μέσω ΔΥΠΑ</strong>, η
              <strong>I-MENTOR Consulting</strong>${officeName ? `, σε συνεργασία με το λογιστικό γραφείο <strong>${officeName}</strong>,` : ''} είναι έτοιμη να προχωρήσει με την υποβολή της αίτησής σας.
            </p>

            <p style="font-size:15px;margin:0 0 24px;line-height:1.7;">
              Το επόμενο βήμα είναι να συμπληρώσετε μερικά απαραίτητα στοιχεία που χρειαζόμαστε για να καταθέσουμε την αίτηση στη ΔΥΠΑ.
              Η διαδικασία είναι <strong>απλή και γρήγορη</strong> — ακολουθήστε τον παρακάτω σύνδεσμο:
            </p>

            <div style="text-align:center;margin:0 0 28px;">
              <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;padding:16px 40px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:17px;">
                Συμπλήρωση Αίτησης ΔΥΠΑ &rarr;
              </a>
              <p style="color:#9ca3af;font-size:12px;margin:10px 0 0;">Ο σύνδεσμος ισχύει για 30 ημέρες &middot; Δεν απαιτείται εγγραφή</p>
            </div>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px 20px;margin:0 0 24px;">
              <p style="margin:0 0 10px;font-weight:bold;color:#166534;font-size:14px;">Τι θα χρειαστείτε:</p>
              <ul style="margin:0;padding-left:20px;color:#166534;font-size:14px;line-height:1.8;">
                <li>Στοιχεία της θέσης εργασίας που θέλετε να καλύψετε</li>
                <li>Πληροφορίες για το υφιστάμενο προσωπικό σας</li>
                <li>Κωδικοί TAXISnet της επιχείρησής σας (καταχωρούνται κρυπτογραφημένα)</li>
              </ul>
            </div>

            <p style="font-size:14px;color:#6b7280;margin:0 0 8px;line-height:1.7;">
              Μόλις υποβάλετε τα στοιχεία, η ομάδα μας αναλαμβάνει την υποβολή της αίτησης στη ΔΥΠΑ.
              Εσείς δεν χρειάζεται να κάνετε τίποτα άλλο.
            </p>

            <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">
              Για οποιαπήποτε απορία, επικοινωνήστε μαζί μας στο <a href="mailto:info@i-mentor.gr" style="color:#4f46e5;">info@i-mentor.gr</a> ή στο <a href="tel:+302810363007" style="color:#4f46e5;">2810 363007</a>.
            </p>

            <p style="font-size:15px;margin:0;">Με εκτίμηση,<br/>
            <strong>Η ομάδα της I-MENTOR Consulting</strong>${officeName ? `<br/><span style="color:#6b7280;font-size:14px;">σε συνεργασία με ${officeName}</span>` : ''}</p>
          </div>
          <div style="padding:16px 32px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">I-MENTOR Consulting &middot; <a href="https://www.i-mentor.gr" style="color:#9ca3af;text-decoration:none;">www.i-mentor.gr</a></p>
          </div>
        </div>`,
      }).catch(() => false)
    }

    if (contactPhone) {
      const viberText = [
        `Αγαπητέ/ή ${businessName || 'συνεργάτη'},`,
        ``,
        `Σε συνέχεια του ενδιαφέροντός σας για την επιδότηση πρόσληψης ΔΥΠΑ, σας στέλνουμε τον σύνδεσμο για να συμπληρώσετε τα απαραίτητα στοιχεία της αίτησης.`,
        ``,
        `Η διαδικασία είναι απλή — ακολουθήστε τον σύνδεσμο και συμπληρώστε τα στοιχεία. Αναλαμβάνουμε εμείς τα υπόλοιπα.`,
        ``,
        url,
        ``,
        `I-MENTOR Consulting${officeName ? ` & ${officeName}` : ''}`,
      ].join('\n')
      const result = await sendViberMessage({
        to: contactPhone,
        text: viberText,
        senderName: 'I-MENTOR',
      }).catch(() => ({ ok: false, reason: '' }))
      viberSent = result.ok
    }

    if (emailSent || viberSent) {
      await prisma.dypaFormToken.update({
        where: { id: formToken.id },
        data: { emailSentAt: emailSent ? new Date() : undefined, viberSentAt: viberSent ? new Date() : undefined },
      }).catch(() => {})
    }
  })()

  return NextResponse.json({ url, expiresAt: formToken.expiresAt, notifying: !!(contactEmail || contactPhone) })
}
