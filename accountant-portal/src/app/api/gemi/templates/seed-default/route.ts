import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Ευκαιρία Χρηματοδότησης — {{program_title}}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f2f5;">
<tr><td align="center" style="padding:32px 16px;">
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- HEADER -->
    <tr>
      <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 50%,#2563eb 100%);padding:0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:36px 40px 28px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:10px;padding:8px 16px;">
                    <span style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">i-MENTOR</span>
                    <span style="font-size:12px;font-weight:500;color:rgba(255,255,255,0.7);margin-left:8px;">Λογιστικές &amp; Επιχειρηματικές Υπηρεσίες</span>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 8px;font-size:26px;font-weight:800;color:#ffffff;line-height:1.25;letter-spacing:-0.5px;">Η επιχείρησή σας<br />είναι επιλέξιμη!</p>
              <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.85);line-height:1.5;">Κάναμε τον βασικό έλεγχο επιλεξιμότητας για <strong style="color:#fff;">{{business_name}}</strong> και τα αποτελέσματα είναι ενθαρρυντικά.</p>
            </td>
          </tr>
          <tr><td style="height:4px;background:linear-gradient(90deg,#fbbf24,#f59e0b,#d97706);"></td></tr>
        </table>
      </td>
    </tr>

    <!-- PERSONALIZED INTRO -->
    <tr>
      <td style="padding:32px 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;">
          <tr>
            <td style="padding:22px 26px;">
              <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;">✓ Αποτέλεσμα Ελέγχου Επιλεξιμότητας</p>
              <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#14532d;line-height:1.4;">Ο βασικός έλεγχος έχει ήδη γίνει — η {{business_name}} φαίνεται επιλέξιμη!</p>
              <p style="margin:0;font-size:14px;color:#166534;line-height:1.7;">Τα στοιχεία της επιχείρησής σας από το ΓΕΜΗ έχουν αξιολογηθεί αυτόματα και η επιχείρησή σας πληροί τα βασικά κριτήρια του παρακάτω προγράμματος. Το επόμενο βήμα είναι μόνο μια σύντομη επιβεβαίωση μερικών στοιχείων.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- PROGRAM CARD -->
    <tr>
      <td style="padding:24px 40px 0;">
        <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:1px;">Πρόγραμμα που σας αφορά</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border:2px solid #fcd34d;border-radius:12px;">
          <tr>
            <td style="padding:24px 28px;">
              <p style="margin:0 0 8px;font-size:20px;font-weight:800;color:#92400e;line-height:1.25;">{{program_title}}</p>
              <p style="margin:0 0 16px;font-size:14px;color:#78350f;line-height:1.6;">{{program_description}}</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="50%" style="padding-right:8px;">
                    <table cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;border:1px solid #fcd34d;width:100%;">
                      <tr><td style="padding:10px 14px;">
                        <p style="margin:0 0 2px;font-size:10px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.5px;">Προθεσμία</p>
                        <p style="margin:0;font-size:14px;font-weight:700;color:#92400e;">{{program_deadline}}</p>
                      </td></tr>
                    </table>
                  </td>
                  <td width="50%" style="padding-left:8px;">
                    <table cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;border:1px solid #fcd34d;width:100%;">
                      <tr><td style="padding:10px 14px;">
                        <p style="margin:0 0 2px;font-size:10px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.5px;">Κλάδος ΚΑΔ</p>
                        <p style="margin:0;font-size:13px;font-weight:600;color:#92400e;">{{kad_description}}</p>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- MATCH REASONS -->
    <tr>
      <td style="padding:20px 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;">
          <tr>
            <td style="padding:20px 24px;">
              <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;">✓ Γιατί είστε επιλέξιμοι</p>
              <p style="margin:0;font-size:14px;color:#166534;line-height:1.7;white-space:pre-line;">{{match_reason}}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- EXTRA CRITERIA -->
    <tr>
      <td style="padding:16px 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fefce8;border-radius:12px;border:1px solid #fde68a;">
          <tr>
            <td style="padding:18px 22px;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;">Πρόσθετες Προϋποθέσεις</p>
              <p style="margin:0;font-size:13px;color:#78350f;line-height:1.7;white-space:pre-line;">{{extra_criteria}}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA -->
    <tr>
      <td style="padding:28px 40px 0;text-align:center;">
        <a href="{{program_url}}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:10px;box-shadow:0 4px 14px rgba(37,99,235,0.35);">&#x1F4C4; Δείτε το Πρόγραμμα</a>
      </td>
    </tr>

    <!-- ERMIS CHAT WIDGET -->
    <tr>
      <td style="padding:24px 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#4f46e5,#6366f1);border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;">
              <p style="margin:0 0 6px;font-size:20px;">🤖</p>
              <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#ffffff;">Μιλήστε τώρα με τον «ΕΡΜΗ»</p>
              <p style="margin:0 0 16px;font-size:13px;color:rgba(255,255,255,0.85);line-height:1.5;">τον ψηφιακό μας σύμβουλο, που κάνει ✅ <strong style="color:#fff;">ΔΩΡΕΑΝ</strong> έλεγχο επιλεξιμότητας ⏱ σε δευτερόλεπτα (περίπου 2 λεπτά).</p>
              <a href="{{ermis_link}}" style="display:inline-block;background:#ffffff;color:#4f46e5;font-size:15px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:9px;box-shadow:0 2px 10px rgba(0,0,0,0.15);">▶ Ξεκινήστε την προαξιολόγηση</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- DIVIDER -->
    <tr><td style="padding:28px 40px 0;"><div style="height:1px;background:linear-gradient(90deg,transparent,#e5e7eb,transparent);"></div></td></tr>

    <!-- CLOSING -->
    <tr>
      <td style="padding:24px 40px;">
        <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.7;">Είμαστε στη διάθεσή σας για οποιαδήποτε επιπλέον πληροφορία σχετικά με την επιλεξιμότητα της επιχείρησής σας και τη διαδικασία υποβολής αίτησης.</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">Με εκτίμηση,<br /><strong style="color:#1e1b4b;">{{accountant_name}}</strong><br /><span style="color:#6b7280;">{{accountant_office}} — i-MENTOR</span></p>
      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="background:#1e293b;padding:24px 40px;border-radius:0 0 16px 16px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#f1f5f9;">i-MENTOR Λογιστικές &amp; Επιχειρηματικές Υπηρεσίες</p>
        <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">Τα στοιχεία επικοινωνίας σας αντλήθηκαν από το Γενικό Εμπορικό Μητρώο (ΓΕΜΗ) μέσω του επίσημου Open Data API του Ελληνικού Δημοσίου, υπό την άδεια ανοιχτών δεδομένων ODC-BY-1.0, η οποία επιτρέπει ρητά την εμπορική χρήση. Πρόκειται για δημόσια διαθέσιμα εταιρικά στοιχεία (gemi.gov.gr).</p>
        <p style="margin:12px 0 0;font-size:11px;color:#64748b;">Δεν επιθυμείτε να λαμβάνετε ενημερώσεις; <a href="{{unsubscribe_link}}" style="color:#94a3b8;text-decoration:underline;">Κατάργηση εγγραφής</a></p>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`

export async function POST() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const template = await prisma.gemiEmailTemplate.create({
    data: {
      label: 'Ενημέρωση Επιλεξιμότητας Προγράμματος',
      description: 'Εξατομικευμένο email με αποτέλεσμα ελέγχου επιλεξιμότητας, Ερμή chat και banner εξωδικαστικού',
      subject: 'Η {{business_name}} είναι επιλέξιμη για το {{program_title}}',
      htmlContent: DEFAULT_HTML,
      active: true,
    },
  })

  return NextResponse.json(template, { status: 201 })
}
