// Seeds the default GEMI email template if none exist yet.
// Runs after prisma db push so the table already exists.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

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
              <p style="margin:24px 0 8px;font-size:26px;font-weight:800;color:#ffffff;line-height:1.25;letter-spacing:-0.5px;">
                Ευκαιρία Χρηματοδότησης<br />για την Επιχείρησή σας
              </p>
              <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.8);line-height:1.5;">
                Βρήκαμε ένα πρόγραμμα που ταιριάζει με τη δραστηριότητα της <strong style="color:#fff;">{{business_name}}</strong>
              </p>
            </td>
          </tr>
          <tr><td style="height:4px;background:linear-gradient(90deg,#fbbf24,#f59e0b,#d97706);"></td></tr>
        </table>
      </td>
    </tr>

    <!-- INTRO -->
    <tr>
      <td style="padding:36px 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8faff;border-radius:12px;border:1px solid #e0e7ff;">
          <tr>
            <td style="padding:24px 28px;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;">Ποιοι είμαστε</p>
              <p style="margin:0 0 12px;font-size:17px;font-weight:700;color:#1e1b4b;line-height:1.3;">Η i-MENTOR δίπλα σας από το 2015</p>
              <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.7;">
                Η <strong>i-MENTOR</strong> είναι λογιστικό και συμβουλευτικό γραφείο εξειδικευμένο στην εξεύρεση και διαχείριση χρηματοδοτικών προγραμμάτων για μικρομεσαίες επιχειρήσεις. Παρακολουθούμε συνεχώς τις προκηρύξεις ΕΣΠΑ, ΕΠΑνΕΚ και εθνικά αναπτυξιακά προγράμματα, ώστε να σας ενημερώνουμε έγκαιρα για ευκαιρίες που αφορούν ακριβώς τον κλάδο σας.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- PROGRAM CARD -->
    <tr>
      <td style="padding:28px 40px 0;">
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

    <!-- ELIGIBILITY -->
    <tr>
      <td style="padding:24px 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;">
          <tr>
            <td style="padding:22px 26px;">
              <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;">✓ Γιατί είστε επιλέξιμοι</p>
              <p style="margin:0;font-size:14px;color:#166534;line-height:1.7;">{{match_reason}}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- EXTRA CRITERIA -->
    <tr>
      <td style="padding:20px 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fefce8;border-radius:12px;border:1px solid #fde68a;">
          <tr>
            <td style="padding:20px 24px;">
              <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;">Πρόσθετες Προϋποθέσεις</p>
              <p style="margin:0;font-size:13px;color:#78350f;line-height:1.7;">{{extra_criteria}}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA -->
    <tr>
      <td style="padding:32px 40px 0;text-align:center;">
        <a href="{{program_url}}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:10px;box-shadow:0 4px 14px rgba(37,99,235,0.35);">
          Δείτε το Πρόγραμμα →
        </a>
        <p style="margin:14px 0 0;font-size:13px;color:#6b7280;">
          ή επισκεφθείτε το <a href="{{ermis_link}}" style="color:#2563eb;text-decoration:underline;">Μητρώο Ερμής</a>
        </p>
      </td>
    </tr>

    <!-- DIVIDER -->
    <tr><td style="padding:32px 40px 0;"><div style="height:1px;background:linear-gradient(90deg,transparent,#e5e7eb,transparent);"></div></td></tr>

    <!-- CLOSING -->
    <tr>
      <td style="padding:28px 40px;">
        <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.7;">
          Είμαστε στη διάθεσή σας για οποιαδήποτε επιπλέον πληροφορία ή διευκρίνιση σχετικά με την επιλεξιμότητα της επιχείρησής σας και τη διαδικασία υποβολής αίτησης.
        </p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">
          Με εκτίμηση,<br />
          <strong style="color:#1e1b4b;">{{accountant_name}}</strong><br />
          <span style="color:#6b7280;">{{accountant_office}} — i-MENTOR</span>
        </p>
      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="background:#1e293b;padding:24px 40px;border-radius:0 0 16px 16px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#f1f5f9;">i-MENTOR Λογιστικές &amp; Επιχειρηματικές Υπηρεσίες</p>
        <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">
          Τα στοιχεία επικοινωνίας σας αντλήθηκαν από το Γενικό Εμπορικό Μητρώο (ΓΕΜΗ) μέσω του επίσημου Open Data API του Ελληνικού Δημοσίου, υπό την άδεια ανοιχτών δεδομένων ODC-BY-1.0, η οποία επιτρέπει ρητά την εμπορική χρήση. Πρόκειται για δημόσια διαθέσιμα εταιρικά στοιχεία (gemi.gov.gr).
        </p>
        <p style="margin:12px 0 0;font-size:11px;color:#64748b;">
          Δεν επιθυμείτε να λαμβάνετε ενημερώσεις; <a href="{{unsubscribe_link}}" style="color:#94a3b8;text-decoration:underline;">Κατάργηση εγγραφής</a>
        </p>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`

async function main() {
  const existing = await prisma.gemiEmailTemplate.count()
  if (existing > 0) {
    console.log(`>>> GEMI templates: ${existing} already exist, skipping seed.`)
    return
  }
  await prisma.gemiEmailTemplate.create({
    data: {
      label: 'Ενημέρωση Ταιριάσματος Προγράμματος',
      description: 'Βασικό πρότυπο ενημέρωσης επιχειρήσεων ΓΕΜΗ για επιλέξιμα προγράμματα',
      subject: 'Ευκαιρία χρηματοδότησης για {{business_name}} — {{program_title}}',
      htmlContent: DEFAULT_HTML,
      active: true,
    },
  })
  console.log('>>> GEMI templates: seeded default template.')
}

main()
  .catch(e => { console.error('GEMI template seed error:', e.message) })
  .finally(() => prisma.$disconnect())
