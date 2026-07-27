import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { sendViberMessage } from '@/lib/viber'

const APP_URL = process.env.APP_URL || 'https://logistis.i-mentor.gr'

export async function createAndSendDypaLink({
  assignmentId,
  businessName,
  officeName,
  contactEmail,
  contactPhone,
}: {
  assignmentId: string
  businessName: string
  officeName: string
  contactEmail: string
  contactPhone: string
}) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  const formToken = await prisma.dypaFormToken.create({
    data: {
      dypaAssignmentId: assignmentId,
      expiresAt,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
    },
  })

  const url = `${APP_URL}/dypa/${formToken.token}`

  // Email/Viber sends can take tens of seconds — fire in the background so the
  // caller isn't blocked. Delivery status lands on emailSentAt/viberSentAt.
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
              Για οποιαδήποτε απορία, επικοινωνήστε μαζί μας στο <a href="mailto:info@i-mentor.gr" style="color:#4f46e5;">info@i-mentor.gr</a> ή στο <a href="tel:+302810363007" style="color:#4f46e5;">2810 363007</a>.
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
        data: {
          emailSentAt: emailSent ? new Date() : undefined,
          viberSentAt: viberSent ? new Date() : undefined,
        },
      }).catch(() => {})
    }
  })()

  return { url, formToken }
}

export async function sendMissingContactNotification({
  businessName,
  caseUrl,
}: {
  businessName: string
  caseUrl: string
}) {
  await sendEmail({
    to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
    subject: `⚠️ ΔΥΠΑ — Λείπουν στοιχεία επικοινωνίας: ${businessName}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#374151;">
      <div style="background:#f59e0b;padding:20px 28px;border-radius:12px 12px 0 0;">
        <h2 style="color:white;margin:0;font-size:18px;">⚠️ Δεν ήταν δυνατή η αυτόματη αποστολή συνδέσμου ΔΥΠΑ</h2>
      </div>
      <div style="background:white;padding:28px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 16px;">Δημιουργήθηκε νέα ανάθεση ΔΥΠΑ για την επιχείρηση <strong>${businessName}</strong>, αλλά <strong>δεν βρέθηκαν στοιχεία επικοινωνίας</strong> (email ή κινητό) για αυτόματη αποστολή του συνδέσμου.</p>
        <p style="margin:0 0 20px;">Παρακαλούμε ενημερώστε τα στοιχεία επικοινωνίας της επιχείρησης και στείλτε χειροκίνητα τον σύνδεσμο.</p>
        <a href="${caseUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
          Δείτε την Ανάθεση →
        </a>
      </div>
    </div>`,
  }).catch(() => {})
}
