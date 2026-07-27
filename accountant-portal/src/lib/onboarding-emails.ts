import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

const APP_URL = process.env.APP_URL || 'https://logistis.i-mentor.gr'
const BOOKING_URL = process.env.ANYDESK_BOOKING_URL || 'https://calendly.com/i-mentor/anydesk-15min'

const STEP_DELAYS_DAYS = [0, 3, 7, 14] // steps 1-4

// ─── shared layout wrappers ────────────────────────────────────────────────

function emailWrap(body: string): string {
  return `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:620px;margin:32px auto;background:#f3f4f6;">
${body}
${emailFooter()}
</div>
</body></html>`
}

function emailHeader(title: string, subtitle?: string): string {
  return `<div style="background:linear-gradient(135deg,#4f46e5 0%,#6366f1 50%,#818cf8 100%);padding:36px 40px 32px;border-radius:16px 16px 0 0;">
  <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:10px;padding:8px 14px;margin-bottom:16px;">
    <span style="color:white;font-size:13px;font-weight:600;letter-spacing:0.5px;">I-MENTOR LOGISTIS</span>
  </div>
  <h1 style="color:white;margin:0;font-size:22px;line-height:1.4;font-weight:700;">${title}</h1>
  ${subtitle ? `<p style="color:rgba(255,255,255,0.85);margin:10px 0 0;font-size:15px;line-height:1.5;">${subtitle}</p>` : ''}
</div>`
}

function emailSection(icon: string, title: string, body: string): string {
  return `<div style="margin-bottom:20px;">
  <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:10px;">
    <div style="background:#ede9fe;border-radius:10px;padding:10px;font-size:20px;line-height:1;min-width:42px;text-align:center;">${icon}</div>
    <div style="flex:1;">
      <h3 style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1e1b4b;">${title}</h3>
      <div style="font-size:14px;color:#374151;line-height:1.7;">${body}</div>
    </div>
  </div>
</div>`
}

function ctaButton(text: string, url: string, color = '#4f46e5'): string {
  return `<div style="text-align:center;margin:24px 0;">
  <a href="${url}" style="display:inline-block;background:${color};color:white;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:0.2px;">${text}</a>
</div>`
}

function infoBox(emoji: string, text: string, bg = '#f0fdf4', border = '#bbf7d0', color = '#166534'): string {
  return `<div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:16px 18px;margin:16px 0;display:flex;align-items:flex-start;gap:10px;">
  <span style="font-size:20px;">${emoji}</span>
  <div style="font-size:14px;color:${color};line-height:1.6;">${text}</div>
</div>`
}

function screenshotPlaceholder(label: string, height = 180): string {
  // Replace these with real hosted screenshots, e.g. ${APP_URL}/email-assets/[name].png
  return `<div style="background:#e0e7ff;border:2px dashed #a5b4fc;border-radius:10px;height:${height}px;display:flex;align-items:center;justify-content:center;margin:12px 0;">
  <span style="color:#6366f1;font-size:13px;font-weight:600;">📸 ${label}</span>
</div>`
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>`
}

function emailFooter(): string {
  return `<div style="background:#1e1b4b;padding:24px 32px;border-radius:0 0 16px 16px;text-align:center;">
  <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;font-size:13px;">I-MENTOR Consulting</p>
  <p style="color:rgba(255,255,255,0.5);margin:0 0 12px;font-size:12px;">
    📧 <a href="mailto:info@i-mentor.gr" style="color:#a5b4fc;text-decoration:none;">info@i-mentor.gr</a>
    &nbsp;·&nbsp;
    📞 <a href="tel:+302810363007" style="color:#a5b4fc;text-decoration:none;">2810 363007</a>
    &nbsp;·&nbsp;
    🌐 <a href="https://www.i-mentor.gr" style="color:#a5b4fc;text-decoration:none;">www.i-mentor.gr</a>
  </p>
  <a href="${BOOKING_URL}" style="display:inline-block;background:rgba(255,255,255,0.12);color:white;padding:8px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">
    🖥️ Κλείστε ραντεβού AnyDesk
  </a>
</div>`
}

// ─── step templates ────────────────────────────────────────────────────────

function step1(name: string, officeName: string): { subject: string; html: string } {
  const subject = `Καλωσορίσατε στο I-MENTOR Logistis — Ξεκινήστε σε 5 λεπτά`
  const html = emailWrap(`
${emailHeader('Καλωσορίσατε στο I-MENTOR Logistis! 🎉', `Χαρούμαστε που συνεργαζόμαστε με το γραφείο ${officeName}. Δείτε πώς ξεκινάτε.`)}
<div style="background:white;padding:32px 40px;">
  <p style="font-size:15px;margin:0 0 24px;color:#374151;">Αγαπητέ/ή <strong>${name}</strong>,</p>
  <p style="font-size:14px;margin:0 0 24px;color:#374151;line-height:1.7;">
    Ο λογαριασμός σας εγκρίθηκε και μπορείτε πλέον να συνδεθείτε στο <strong>I-MENTOR Logistis</strong> — την πλατφόρμα που εντοπίζει αυτόματα τα προγράμματα επιχορήγησης που ταιριάζουν στους πελάτες σας και σας δίνει εργαλεία για να προσφέρετε περισσότερες υπηρεσίες με λιγότερο κόπο.
  </p>

  ${emailSection('📥', 'Βήμα 1: Εισάγετε τους πελάτες σας', `
    Ο πιο γρήγορος τρόπος να αξιοποιήσετε την πλατφόρμα είναι να εισάγετε το πελατολόγιό σας. Μπορείτε να το κάνετε με <strong>Excel import</strong> σε λιγότερο από 2 λεπτά.
    <br/><br/>
    <strong>Τι χρειάζεστε:</strong>
    <ul style="margin:8px 0 0;padding-left:20px;line-height:1.9;">
      <li>Ένα αρχείο Excel/CSV με στήλη <strong>ΑΦΜ</strong> (9 ψηφία)</li>
      <li>Προαιρετικά: email, τηλέφωνο για κάθε επιχείρηση</li>
    </ul>
    <br/>
    Το σύστημα αναζητά <strong>αυτόματα</strong> τα στοιχεία κάθε επιχείρησης από την ΑΑΔΕ και εντοπίζει ποια ταιριάζουν με τα ενεργά προγράμματα.
  `)}

  ${screenshotPlaceholder('Οθόνη import Excel — εισαγωγή ΑΦΜ', 160)}

  ${ctaButton('Εισαγωγή Πελατών →', `${APP_URL}/businesses/import`)}

  ${divider()}

  ${emailSection('🔍', 'Βήμα 2: Δείτε τα αυτόματα ταιριάσματα', `
    Μόλις εισάγετε τους πελάτες σας, το σύστημα τους <strong>αντιστοιχεί αυτόματα</strong> με τα ενεργά χρηματοδοτικά προγράμματα (ΕΣΠΑ, ΔΥΠΑ, Αναπτυξιακός, κ.ά.) βάσει ΚΑΔ, περιφέρειας και ημερομηνίας ίδρυσης.
    <br/><br/>
    Κάθε επιχείρηση που πληροί τα κριτήρια εμφανίζεται στη λίστα ταιριασμάτων σας με <strong>αναλυτική αιτιολόγηση</strong>.
  `)}

  ${screenshotPlaceholder('Λίστα ταιριασμάτων — πρόγραμμα, βαθμολογία, λόγοι', 160)}

  ${ctaButton('Δείτε τα Ταιριάσματά σας →', `${APP_URL}/matches`)}

  ${divider()}

  ${infoBox('💡', `<strong>Συμβουλή:</strong> Αν έχετε τα email και τηλέφωνα των πελατών σας, συμπεριλάβετέ τα στο import. Σας εξηγούμε γιατί στο επόμενο email.`)}

  <p style="font-size:14px;color:#374151;line-height:1.7;margin:20px 0 0;">
    Αν έχετε οποιαδήποτε απορία, η ομάδα μας είναι διαθέσιμη <strong>Δευτέρα–Παρασκευή 10:00–16:30</strong>.
  </p>
  ${ctaButton('🖥️ Κλείστε ραντεβού AnyDesk (15 λεπτά)', BOOKING_URL, '#059669')}
</div>`)
  return { subject, html }
}

function step2(name: string, officeName: string): { subject: string; html: string } {
  const subject = `Πώς κερδίζετε προμήθειες — και γιατί το email & τηλέφωνο κάνουν διαφορά`
  const html = emailWrap(`
${emailHeader('Κερδίστε προμήθειες χωρίς επιπλέον δουλειά 💰', `Η πλατφόρμα δουλεύει για εσάς — εσείς εισπράττετε.`)}
<div style="background:white;padding:32px 40px;">
  <p style="font-size:15px;margin:0 0 24px;color:#374151;">Αγαπητέ/ή <strong>${name}</strong>,</p>

  ${emailSection('💳', 'Πώς λειτουργούν οι προμήθειες', `
    Κάθε φορά που ένας πελάτης σας υποβάλει αίτηση για ένα πρόγραμμα μέσω της I-MENTOR και αυτή <strong>εγκριθεί</strong>, κερδίζετε προμήθεια.
    <br/><br/>
    Τα ποσά εμφανίζονται <strong>αναλυτικά</strong> στη σελίδα "Προμήθειες" της πλατφόρμας — τι εγκρίθηκε, για ποιον πελάτη, πότε, και πόσο σας αναλογεί.
  `)}

  ${screenshotPlaceholder('Σελίδα Προμηθειών — ανάλυση ανά πελάτη και πρόγραμμα', 160)}

  ${ctaButton('Δείτε τις Προμήθειές σας →', `${APP_URL}/commissions`)}

  ${divider()}

  ${emailSection('📬', 'Γιατί το email & τηλέφωνο αλλάζουν τα πάντα', `
    Όταν έχετε καταχωρήσει <strong>email ή κινητό</strong> για έναν πελάτη, η πλατφόρμα μπορεί να του στέλνει αυτόματα ειδοποιήσεις για τα προγράμματα που τον αφορούν — στο όνομά σας, με το λογότυπο του γραφείου σας.
    <br/><br/>
    Έτσι <strong>εσείς</strong> εμφανίζεστε ως ο σύμβουλος που τον ενημερώνει για κάθε ευκαιρία, χωρίς να χρειαστεί να κάνετε τίποτα.
  `)}

  ${screenshotPlaceholder('Αυτόματη ειδοποίηση που λαμβάνει ο πελάτης — email & Viber', 160)}

  ${divider()}

  <h2 style="font-size:17px;font-weight:700;color:#1e1b4b;margin:0 0 16px;">Τι υπηρεσίες μπορείτε να αναθέσετε</h2>

  ${emailSection('🏛️', 'ΔΥΠΑ — Επιδότηση Πρόσληψης Ανέργου', `
    Για επιχειρήσεις-πελάτες σας που θέλουν να προσλάβουν προσωπικό, μπορείτε να αναθέσετε αίτηση επιδότησης πρόσληψης ανέργου μέσω ΔΥΠΑ.
    <br/><br/>
    Η I-MENTOR αναλαμβάνει <strong>ολόκληρη τη διαδικασία</strong> — εσείς κερδίζετε προμήθεια και <strong>κρατάτε ικανοποιημένους τους πελάτες σας</strong>.
  `)}

  ${emailSection('⚖️', 'Εξωδικαστικός Μηχανισμός & Πτώχευση', `
    Είμαστε η <strong>πιο έμπειρη ομάδα εξωδικαστικού μηχανισμού ρύθμισης οφειλών</strong> στην Ελλάδα. Αν κάποιος πελάτης σας αντιμετωπίζει υπερχρέωση ή σκέφτεται αίτηση πτώχευσης, μπορείτε να μας τον αναθέσετε και να κερδίσετε προμήθεια.
    <br/><br/>
    Ο πελάτης σας χειρίζεται με εμπιστοσύνη — εσείς προσθέτετε αξία στη σχέση σας μαζί του.
  `)}

  ${infoBox('📊', `
    <strong>Δείτε τα ενεργά προγράμματα</strong> και τα αντίστοιχα ποσοστά προμήθειας από τη σελίδα "Προγράμματα" της πλατφόρμας.
    <br/><br/>
    <a href="${APP_URL}/programs" style="color:#4f46e5;font-weight:700;text-decoration:none;">Δείτε τα Προγράμματα →</a>
  `, '#ede9fe', '#c4b5fd', '#4c1d95')}

  ${ctaButton('Κλείστε ραντεβού AnyDesk για πλήρη ενημέρωση', BOOKING_URL, '#059669')}
</div>`)
  return { subject, html }
}

async function step3(name: string, officeName: string, accountantId: string): Promise<{ subject: string; html: string }> {
  const businessCount = await prisma.business.count({ where: { accountantId } })
  const matchCount = await prisma.programMatch.count({
    where: { business: { accountantId }, status: { not: 'REJECTED' } },
  })
  const hasImported = businessCount > 0

  const subject = hasImported
    ? `Έχετε ήδη ${matchCount} ταιριάσματα — δείτε ποιοι πελάτες σας κερδίζουν`
    : `Υπενθύμιση: εισάγετε τους πελάτες σας και δείτε τα ταιριάσματα`

  const html = emailWrap(`
${emailHeader(
  hasImported
    ? `${matchCount} ταιριάσματα σε ${businessCount} επιχειρήσεις 🎯`
    : `Εισάγετε τους πελάτες σας — δείτε ποιοι κερδίζουν επιδοτήσεις 📋`,
  hasImported
    ? `Ορισμένοι πελάτες σας ήδη πληρούν τα κριτήρια ενεργών προγραμμάτων.`
    : `Μόλις εισάγετε τα ΑΦΜ σας, το σύστημα βρίσκει αμέσως τι τους αντιστοιχεί.`
)}
<div style="background:white;padding:32px 40px;">
  <p style="font-size:15px;margin:0 0 24px;color:#374151;">Αγαπητέ/ή <strong>${name}</strong>,</p>

  ${hasImported ? `
    ${infoBox('🏆', `
      <strong>Υπάρχουν ήδη ${matchCount} ταιριάσματα</strong> για επιχειρήσεις του γραφείου σας.
      Αυτά είναι πελάτες που πληρούν τα κριτήρια ενεργών προγραμμάτων και μπορείτε να τους ενημερώσετε άμεσα.
    `, '#f0fdf4', '#bbf7d0', '#166534')}

    ${emailSection('🎯', 'Επόμενο βήμα: ενημερώστε τους πελάτες σας', `
      Από τη σελίδα "Ταιριάσματα" μπορείτε να στείλετε <strong>μαζική ειδοποίηση</strong> στους πελάτες σας που πληρούν τα κριτήρια ενός προγράμματος — με ένα κλικ, μέσω email και Viber.
    `)}

    ${screenshotPlaceholder('Λίστα ταιριασμάτων — επιλογή και αποστολή ειδοποίησης', 160)}

    ${ctaButton('Δείτε τα Ταιριάσματά σας →', `${APP_URL}/matches`)}
  ` : `
    ${infoBox('⏰', `
      Δεν έχετε εισάγει πελάτες ακόμα. Χρειάζεστε μόνο <strong>2 λεπτά</strong> και ένα αρχείο Excel με τα ΑΦΜ τους.
    `, '#fff7ed', '#fed7aa', '#92400e')}

    ${emailSection('📥', 'Πώς να κάνετε import σε 3 βήματα', `
      <ol style="margin:8px 0 0;padding-left:20px;line-height:2;">
        <li>Κατεβάστε το <a href="${APP_URL}/businesses/import" style="color:#4f46e5;font-weight:700;">πρότυπο Excel</a> από την πλατφόρμα</li>
        <li>Συμπληρώστε τα ΑΦΜ (και email/τηλέφωνα αν τα έχετε)</li>
        <li>Ανεβάστε το αρχείο — το σύστημα κάνει τα υπόλοιπα</li>
      </ol>
    `)}

    ${screenshotPlaceholder('Οθόνη import — πρότυπο Excel και επιλογή αρχείου', 160)}

    ${ctaButton('Εισαγωγή Πελατών Τώρα →', `${APP_URL}/businesses/import`)}
  `}

  ${divider()}

  ${emailSection('📡', 'Πώς λειτουργεί το αυτόματο matching', `
    Κάθε επιχείρηση αντιστοιχίζεται με τα ενεργά προγράμματα βάσει:
    <ul style="margin:8px 0 0;padding-left:20px;line-height:1.9;">
      <li><strong>ΚΑΔ</strong> — κύρια και δευτερεύουσα δραστηριότητα</li>
      <li><strong>Περιφέρεια</strong> — μέσω του ΤΚ</li>
      <li><strong>Ημερομηνία ίδρυσης</strong> — για προγράμματα με ηλικιακά κριτήρια</li>
    </ul>
    <br/>
    Το αποτέλεσμα ενημερώνεται αυτόματα κάθε φορά που αλλάζουν τα κριτήρια ενός προγράμματος.
  `)}

  ${ctaButton('Κλείστε ραντεβού AnyDesk για να τα στήσουμε μαζί', BOOKING_URL, '#059669')}
</div>`)

  return { subject, html }
}

function step4(name: string, officeName: string): { subject: string; html: string } {
  const subject = `Κλείστε 15 λεπτά μαζί μας — στήνουμε τα πάντα για το γραφείο σας`
  const html = emailWrap(`
${emailHeader('15 λεπτά AnyDesk — στήνουμε όλα μαζί 🖥️', `Δευτέρα–Παρασκευή 10:00–16:30 · Επιλέξτε την ώρα που σας βολεύει`)}
<div style="background:white;padding:32px 40px;">
  <p style="font-size:15px;margin:0 0 24px;color:#374151;">Αγαπητέ/ή <strong>${name}</strong>,</p>
  <p style="font-size:14px;margin:0 0 24px;color:#374151;line-height:1.7;">
    Έχουν περάσει 2 εβδομάδες από την ενεργοποίηση του λογαριασμού σας. Θέλουμε να βεβαιωθούμε ότι το γραφείο <strong>${officeName}</strong> αξιοποιεί την πλατφόρμα στο μέγιστο.
  </p>

  ${infoBox('🖥️', `
    <strong>Κλείστε ένα 15λεπτο AnyDesk</strong> — συνδεόμαστε απευθείας στον υπολογιστή σας και σας βοηθάμε να:
    <ul style="margin:8px 0 0;padding-left:18px;line-height:1.9;">
      <li>Εισάγετε ή ελέγξετε το πελατολόγιό σας</li>
      <li>Δείτε τα ταιριάσματα που ήδη υπάρχουν</li>
      <li>Στείλετε την πρώτη σας ειδοποίηση σε πελάτες</li>
      <li>Αναθέσετε την πρώτη αίτηση ΔΥΠΑ ή εξωδικαστικού</li>
    </ul>
    <br/>
    <strong>Δεν χρειάζεται καμία προετοιμασία από εσάς.</strong>
  `, '#ede9fe', '#c4b5fd', '#4c1d95')}

  ${ctaButton('🗓️ Κλείστε ραντεβού AnyDesk (15 λεπτά)', BOOKING_URL, '#4f46e5')}

  <p style="font-size:13px;color:#9ca3af;text-align:center;margin:-12px 0 20px;">Διαθέσιμες ώρες: Δευτέρα–Παρασκευή · 10:00–16:30</p>

  ${divider()}

  <h2 style="font-size:17px;font-weight:700;color:#1e1b4b;margin:0 0 16px;">Τι έχετε στη διάθεσή σας</h2>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
    <!-- grid fallback for email clients that don't support grid -->
  </div>

  ${emailSection('🔗', 'Αυτόματα ταιριάσματα & ειδοποιήσεις', `
    Εντοπισμός επιλέξιμων επιχειρήσεων + αυτόματη αποστολή ειδοποιήσεων στους πελάτες σας μέσω email και Viber.
  `)}

  ${emailSection('🏛️', 'Αναθέσεις ΔΥΠΑ', `
    Επιδότηση πρόσληψης ανέργου για επιχειρήσεις πελατών σας. Η I-MENTOR αναλαμβάνει — εσείς κερδίζετε προμήθεια.
  `)}

  ${emailSection('⚖️', 'Εξωδικαστικός Μηχανισμός', `
    Η πιο έμπειρη ομάδα εξωδικαστικού στην Ελλάδα. Παραπέμψτε υπερχρεωμένους πελάτες σας — η I-MENTOR αναλαμβάνει πλήρως.
  `)}

  ${emailSection('💳', 'Διαφανείς προμήθειες', `
    Κάθε εγκεκριμένη αίτηση εμφανίζεται αυτόματα στις προμήθειές σας. Πλήρης ιστορικό και διαφάνεια.
  `)}

  ${divider()}

  <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 8px;">
    Εναλλακτικά, επικοινωνήστε μαζί μας απευθείας:
  </p>
  <p style="font-size:14px;color:#374151;line-height:1.9;margin:0;">
    📧 <a href="mailto:info@i-mentor.gr" style="color:#4f46e5;">info@i-mentor.gr</a><br/>
    📞 <a href="tel:+302810363007" style="color:#4f46e5;">2810 363007</a> (Δευ–Παρ 10:00–17:00)
  </p>
</div>`)
  return { subject, html }
}

// ─── public API ────────────────────────────────────────────────────────────

export async function scheduleOnboardingEmails(accountantId: string): Promise<void> {
  const now = new Date()
  const entries = STEP_DELAYS_DAYS.map((days, i) => {
    const scheduledFor = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    return { accountantId, step: i + 1, scheduledFor }
  })

  for (const entry of entries) {
    await prisma.onboardingEmail.upsert({
      where: { accountantId_step: { accountantId: entry.accountantId, step: entry.step } },
      update: { scheduledFor: entry.scheduledFor, sentAt: null, error: null },
      create: entry,
    })
  }
}

export async function sendOnboardingEmailStep(onboardingEmailId: string): Promise<void> {
  const record = await prisma.onboardingEmail.findUnique({
    where: { id: onboardingEmailId },
    include: { accountant: true },
  })
  if (!record || record.sentAt) return

  const { step, accountant } = record
  const name = accountant.contactPerson
  const officeName = accountant.officeName
  const to = accountant.email

  let payload: { subject: string; html: string }

  if (step === 1) {
    payload = step1(name, officeName)
  } else if (step === 2) {
    payload = step2(name, officeName)
  } else if (step === 3) {
    payload = await step3(name, officeName, accountant.id)
  } else if (step === 4) {
    payload = step4(name, officeName)
  } else {
    return
  }

  const ok = await sendEmail({ to, subject: payload.subject, html: payload.html }).catch(() => false)
  await prisma.onboardingEmail.update({
    where: { id: onboardingEmailId },
    data: ok ? { sentAt: new Date() } : { error: 'Email send failed' },
  })
}
