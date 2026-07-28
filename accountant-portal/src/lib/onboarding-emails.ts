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

function screenshotImg(filename: string, alt: string): string {
  return `<div style="margin:16px 0;text-align:center;">
  <img src="${APP_URL}/email-assets/${filename}" alt="${alt}" width="540" style="max-width:100%;border-radius:10px;border:1px solid #e5e7eb;box-shadow:0 2px 8px rgba(0,0,0,0.08);" />
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
      <li>Προαιρετικά: email και/ή κινητό για κάθε επιχείρηση</li>
    </ul>
    <br/>
    Το σύστημα αναζητά <strong>αυτόματα</strong> τα στοιχεία κάθε επιχείρησης από την ΑΑΔΕ και εντοπίζει ποια ταιριάζουν με τα ενεργά προγράμματα.
  `)}

  ${screenshotImg('email_1_maziki_eisagogi_pelatwn.png', 'Μαζική Εισαγωγή Πελατών — 3 βήματα')}

  ${ctaButton('Εισαγωγή Πελατών →', `${APP_URL}/businesses/import`)}

  ${divider()}

  ${emailSection('🔍', 'Βήμα 2: Δείτε τα αυτόματα matches', `
    Μόλις εισάγετε τους πελάτες σας, το σύστημα τους <strong>αντιστοιχεί αυτόματα</strong> με τα ενεργά χρηματοδοτικά προγράμματα (ΕΣΠΑ, ΔΥΠΑ, Αναπτυξιακός, κ.ά.) βάσει ΚΑΔ, περιφέρειας και ημερομηνίας ίδρυσης.
    <br/><br/>
    Κάθε επιχείρηση που πληροί τα κριτήρια εμφανίζεται στη λίστα matches σας με <strong>αναλυτική αιτιολόγηση</strong>.
  `)}

  ${screenshotImg('email_1_matches.jpg', 'Matches Επιχειρήσεων & Προγραμμάτων')}

  ${ctaButton('Δείτε τα Matches σας →', `${APP_URL}/matches`)}

  ${divider()}

  <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:20px 22px;margin:16px 0;">
    <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#92400e;">📬 Ένα βήμα που κάνει τεράστια διαφορά</p>
    <p style="margin:0 0 12px;font-size:14px;color:#78350f;line-height:1.7;">
      Αν έχετε τα <strong>email ή κινητά</strong> των πελατών σας, προσθέστε τα στο import — ή αργότερα, μέσα από κάθε επιχείρηση ξεχωριστά. Δεν είναι υποχρεωτικό, αλλά <strong>αλλάζει τα πάντα</strong>:
    </p>
    <ul style="margin:0;padding-left:20px;font-size:14px;color:#78350f;line-height:2;">
      <li>Εσείς ελέγχετε <strong>απόλυτα</strong> ποιοι πελάτες θα ενημερωθούν και πότε — η πλατφόρμα δεν στέλνει τίποτα χωρίς τη δική σας εντολή</li>
      <li>Μπορείτε να στέλνετε εσείς ή να ζητάτε από εμάς να αναλάβουμε την επικοινωνία — πάντα με το λογότυπο και το όνομα του γραφείου σας</li>
      <li>Ή να μη στείλετε τίποτα — <strong>η επιλογή είναι αποκλειστικά δική σας</strong></li>
    </ul>
    <p style="margin:12px 0 0;font-size:13px;color:#92400e;font-style:italic;">
      Χωρίς στοιχεία επικοινωνίας, η ανάθεση υπηρεσιών από την I-MENTOR δεν είναι δυνατή.
    </p>
  </div>

  <p style="font-size:14px;color:#374151;line-height:1.7;margin:20px 0 0;">
    Αν έχετε οποιαδήποτε απορία, η ομάδα μας είναι διαθέσιμη <strong>Δευτέρα–Παρασκευή 10:00–16:30</strong>.
  </p>
  ${ctaButton('🗓️ Κλείστε ραντεβού (15 λεπτά)', BOOKING_URL, '#059669')}
</div>`)
  return { subject, html }
}

function step2(name: string, officeName: string): { subject: string; html: string } {
  const subject = `Πώς κρατάτε ικανοποιημένους τους πελάτες σας — και κερδίζετε παράλληλα`
  const html = emailWrap(`
${emailHeader('Ο πελάτης σας ευχαριστημένος — αυτό είναι το ζητούμενο 🤝', `Η I-MENTOR σας δίνει τα εργαλεία να του προσφέρετε κάτι παραπάνω.`)}
<div style="background:white;padding:32px 40px;">
  <p style="font-size:15px;margin:0 0 24px;color:#374151;">Αγαπητέ/ή <strong>${name}</strong>,</p>
  <p style="font-size:14px;margin:0 0 24px;color:#374151;line-height:1.7;">
    Ως λογιστής, η σχέση με τον πελάτη σας βασίζεται στην εμπιστοσύνη. Η I-MENTOR σας βοηθά να <strong>ενισχύσετε αυτή τη σχέση</strong> — να εμφανίζεστε ως ο σύμβουλος που του βρίσκει ευκαιρίες και τον φροντίζει, χωρίς να χρειαστεί εσείς να ασχολείτε με τη γραφειοκρατία.
  </p>

  ${emailSection('🤝', 'Το κύριο: ο πελάτης να φεύγει ικανοποιημένος', `
    Όταν ενημερώνετε έναν πελάτη ότι <strong>μπορεί να επιδοτηθεί</strong> — για πρόσληψη, για επένδυση, για ρύθμιση οφειλών — εσείς είστε εκείνος που έκανε τη διαφορά.
    <br/><br/>
    Δεν χρειάζεται να κάνετε τίποτα επιπλέον: η πλατφόρμα εντοπίζει τα matches, η I-MENTOR αναλαμβάνει την υλοποίηση. <strong>Εσείς είστε ο σύμβουλος που έκανε τη σύνδεση.</strong>
  `)}

  ${divider()}

  <h2 style="font-size:17px;font-weight:700;color:#1e1b4b;margin:0 0 6px;">Υπηρεσίες που μπορείτε να αναθέσετε στη I-MENTOR</h2>
  <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Για κάθε επιχείρηση-πελάτη σας που πληροί τα κριτήρια</p>

  ${emailSection('🏢', 'ΕΣΠΑ & LEADER', `
    Επιδοτήσεις για επενδύσεις, εξοπλισμό, ψηφιακή αναβάθμιση — από τα μεγάλα ΕΣΠΑ Περιφερειών έως τα τοπικά LEADER.
    <br/>Η I-MENTOR αναλαμβάνει την αίτηση, τη δικαιολογητικά και την παρακολούθηση.
  `)}

  ${emailSection('📈', 'Αναπτυξιακός Νόμος', `
    Επενδυτικά σχέδια για επιχειρήσεις που θέλουν να αναπτυχθούν με φορολογικές απαλλαγές και επιχορηγήσεις.
  `)}

  ${emailSection('🧑‍💼', 'ΔΥΠΑ — Επιδότηση Έναρξης Νέας Επιχείρησης', `
    Για πελάτες (ή γνωστούς τους) που θέλουν να ξεκινήσουν επιχείρηση. Επιδότηση έναρξης μέσω ΔΥΠΑ — ολοκληρωμένη υποστήριξη από εμάς.
  `)}

  ${emailSection('👷', 'ΔΥΠΑ — Επιδότηση Πρόσληψης Προσωπικού', `
    Για επιχειρήσεις-πελάτες σας που θέλουν να προσλάβουν. Επιδότηση μισθοδοσίας για τους πρώτους μήνες — η I-MENTOR αναλαμβάνει ολόκληρη τη διαδικασία.
  `)}

  ${emailSection('⚖️', 'Εξωδικαστικός Μηχανισμός Ρύθμισης Οφειλών', `
    Είμαστε από τις <strong>πιο έμπειρες ομάδες εξωδικαστικού στην Ελλάδα</strong>. Αν κάποιος πελάτης σας αντιμετωπίζει χρέη — προς εφορία, ασφαλιστικά, τράπεζες — μπορείτε να μας τον παραπέμψετε. Χειριζόμαστε από απλές ρυθμίσεις ως πολύπλοκες περιπτώσεις επιχειρήσεων.
  `)}

  ${divider()}

  ${emailSection('💳', 'Προμήθεια — επιβράβευση για την αίτηση, όχι μόνο για την έγκριση', `
    Κερδίζετε προμήθεια <strong>με την υποβολή της αίτησης</strong> — όχι μόνο αν εγκριθεί. Το αποτέλεσμα δεν εξαρτάται από εσάς, αλλά η σύσταση ναι.
    <br/><br/>
    Τα ποσά εμφανίζονται αναλυτικά στη σελίδα "Προμήθειες" — ανά πελάτη, ανά αίτηση.
  `)}

  ${screenshotImg('email_2_commissions_table.png', 'Σελίδα Προμηθειών — ανά πελάτη και αίτηση')}

  ${ctaButton('Δείτε τις Προμήθειές σας →', `${APP_URL}/commissions`)}

  ${divider()}

  ${infoBox('📬', `
    <strong>Υπενθύμιση:</strong> Για να μπορέσει η I-MENTOR να αναλάβει υπηρεσία για έναν πελάτη σας, χρειάζεται να έχετε καταχωρήσει <strong>email ή κινητό</strong> για εκείνον στην πλατφόρμα.
    <br/><br/>
    Χωρίς στοιχεία επικοινωνίας δεν μπορούμε να επικοινωνήσουμε μαζί του για λογαριασμό σας.
  `, '#fef3c7', '#f59e0b', '#92400e')}

  ${ctaButton('🗓️ Κλείστε ραντεβού για να τα συζητήσουμε', BOOKING_URL, '#059669')}
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
    ? `Έχετε ήδη ${matchCount} matches — δείτε ποιοι πελάτες σας κερδίζουν`
    : `Υπενθύμιση: εισάγετε τους πελάτες σας και δείτε τα matches`

  const html = emailWrap(`
${emailHeader(
  hasImported
    ? `${matchCount} matches σε ${businessCount} επιχειρήσεις 🎯`
    : `Εισάγετε τους πελάτες σας — δείτε ποιοι κερδίζουν επιδοτήσεις 📋`,
  hasImported
    ? `Ορισμένοι πελάτες σας ήδη πληρούν τα κριτήρια ενεργών προγραμμάτων.`
    : `Μόλις εισάγετε τα ΑΦΜ σας, το σύστημα βρίσκει αμέσως τι τους αντιστοιχεί.`
)}
<div style="background:white;padding:32px 40px;">
  <p style="font-size:15px;margin:0 0 24px;color:#374151;">Αγαπητέ/ή <strong>${name}</strong>,</p>

  ${hasImported ? `
    ${infoBox('🏆', `
      <strong>Υπάρχουν ήδη ${matchCount} matches</strong> για επιχειρήσεις του γραφείου σας.
      Αυτά είναι πελάτες που πληρούν τα κριτήρια ενεργών προγραμμάτων και μπορείτε να τους ενημερώσετε άμεσα.
    `, '#f0fdf4', '#bbf7d0', '#166534')}

    ${emailSection('🎯', 'Επόμενο βήμα: ενημερώστε τους πελάτες σας', `
      Από τη σελίδα "Matches" μπορείτε να στείλετε <strong>μαζική ειδοποίηση</strong> στους πελάτες σας που πληρούν τα κριτήρια ενός προγράμματος — με ένα κλικ, μέσω email και Viber.
    `)}

    ${screenshotImg('email_3_enimerwsh_pelatwn.png', 'Γρήγορη Αποστολή — ενημέρωση πελατών')}

    ${ctaButton('Δείτε τα Matches σας →', `${APP_URL}/matches`)}
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

    ${screenshotImg('email_1_maziki_eisagogi_pelatwn.png', 'Μαζική Εισαγωγή Πελατών — πρότυπο Excel')}

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
${emailHeader('15 λεπτά AnyDesk — στήνουμε όλα μαζί 🖥️', `Δευτέρα–Παρασκευή 10:00–16:30 · Επιλέξτε ώρα από το ημερολόγιό μας`)}
<div style="background:white;padding:32px 40px;">
  <p style="font-size:15px;margin:0 0 24px;color:#374151;">Αγαπητέ/ή <strong>${name}</strong>,</p>
  <p style="font-size:14px;margin:0 0 24px;color:#374151;line-height:1.7;">
    Έχουν περάσει 2 εβδομάδες από την ενεργοποίηση του λογαριασμού σας. Θέλουμε να βεβαιωθούμε ότι το γραφείο <strong>${officeName}</strong> αξιοποιεί ό,τι του προσφέρει η πλατφόρμα.
  </p>

  ${infoBox('🖥️', `
    <strong>Κλείστε ένα 15λεπτο AnyDesk</strong> — συνδεόμαστε απευθείας στον υπολογιστή σας και σας βοηθάμε να ξεκινήσετε. Δεν χρειάζεται καμία προετοιμασία.
    <ul style="margin:8px 0 0;padding-left:18px;line-height:1.9;">
      <li>Εισαγωγή ή έλεγχος πελατολογίου</li>
      <li>Επισκόπηση ταιριασμάτων</li>
      <li>Αποστολή πρώτης ειδοποίησης σε πελάτες</li>
      <li>Ανάθεση πρώτης αίτησης (ΔΥΠΑ, ΕΣΠΑ, εξωδικαστικού)</li>
    </ul>
  `, '#ede9fe', '#c4b5fd', '#4c1d95')}

  ${ctaButton('🗓️ Κλείστε ραντεβού AnyDesk (15 λεπτά)', BOOKING_URL, '#4f46e5')}

  <p style="font-size:13px;color:#9ca3af;text-align:center;margin:-12px 0 20px;">Επιλέξτε ώρα από το Google Calendar της I-MENTOR · Δευτέρα–Παρασκευή · 10:00–16:30</p>

  ${divider()}

  <h2 style="font-size:17px;font-weight:700;color:#1e1b4b;margin:0 0 6px;">Τι έχετε στη διάθεσή σας — πλήρης λίστα</h2>
  <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Όλα τα εργαλεία και υπηρεσίες της πλατφόρμας</p>

  ${emailSection('🔍', 'Αυτόματο matching επιχειρήσεων με προγράμματα', `
    Κάθε πελάτης σας αντιστοιχίζεται αυτόματα με τα ενεργά χρηματοδοτικά προγράμματα βάσει ΚΑΔ, περιφέρειας και ημερομηνίας ίδρυσης. Τα matches ενημερώνονται σε πραγματικό χρόνο.
  `)}

  ${emailSection('📬', 'Αυτόματες ειδοποιήσεις πελατών (email & Viber)', `
    Όταν βρεθεί πρόγραμμα που αφορά κάποιον πελάτη, η πλατφόρμα του στέλνει αυτόματα ειδοποίηση <strong>στο όνομα του γραφείου σας</strong> — με το λογότυπό σας. Εσείς εμφανίζεστε ως ο σύμβουλος που τον φροντίζει.
  `)}

  ${emailSection('📊', 'Λεπτομερής ανάλυση κριτηρίων επιλεξιμότητας', `
    Για κάθε match βλέπετε αναλυτικά γιατί μια επιχείρηση ταιριάζει — ή δεν ταιριάζει — με κάθε πρόγραμμα. ΚΑΔ, περιφέρεια, νομική μορφή, ηλικία επιχείρησης, ειδικά κριτήρια.
  `)}

  ${emailSection('🏢', 'ΕΣΠΑ & LEADER — αίτηση & παρακολούθηση', `
    Παραπομπή επιχείρησης-πελάτη για αίτηση ΕΣΠΑ ή LEADER. Η I-MENTOR αναλαμβάνει τη σύνταξη φακέλου, υποβολή και παρακολούθηση.
  `)}

  ${emailSection('📈', 'Αναπτυξιακός Νόμος', `
    Επενδυτικά σχέδια για φορολογικές απαλλαγές και επιχορηγήσεις. Κατάλληλο για επιχειρήσεις που σχεδιάζουν επένδυση.
  `)}

  ${emailSection('🧑‍💼', 'ΔΥΠΑ — Επιδότηση Έναρξης Νέας Επιχείρησης', `
    Για ανέργους που θέλουν να ξεκινήσουν επιχείρηση. Παραπομπή και ολοκληρωμένη υποστήριξη από εμάς.
  `)}

  ${emailSection('👷', 'ΔΥΠΑ — Επιδότηση Πρόσληψης Προσωπικού', `
    Για επιχειρήσεις που θέλουν να προσλάβουν. Επιδότηση μισθοδοσίας — η I-MENTOR αναλαμβάνει την ολοκληρωμένη διαδικασία.
  `)}

  ${emailSection('⚖️', 'Εξωδικαστικός Μηχανισμός Ρύθμισης Οφειλών', `
    Η πιο έμπειρη ομάδα εξωδικαστικού στην Ελλάδα. Χρέη προς εφορία, ασφαλιστικά, τράπεζες — από απλές ρυθμίσεις ως σύνθετες επιχειρηματικές περιπτώσεις.
  `)}

  ${emailSection('💳', 'Διαφανείς προμήθειες — ανά αίτηση', `
    Κάθε αίτηση που υποβάλλεται για λογαριασμό πελάτη σας εμφανίζεται στη σελίδα Προμηθειών — με ημερομηνία, ποσό και κατάσταση. Πλήρης διαφάνεια.
  `)}

  ${emailSection('📁', 'Πελατολόγιο & στοιχεία από ΑΑΔΕ', `
    Αυτόματη αναζήτηση και εμπλουτισμός στοιχείων επιχείρησης από την ΑΑΔΕ — επωνυμία, ΚΑΔ, διεύθυνση, ημ/νία έναρξης. Δεν χρειάζεται να τα εισάγετε χειροκίνητα.
  `)}

  ${emailSection('📢', 'Campaigns — μαζική ενημέρωση πελατών', `
    Επιλέξτε ένα πρόγραμμα, επιλέξτε τους πελάτες που ταιριάζουν και στείλτε μαζική ειδοποίηση με ένα κλικ — email ή Viber, με το λογότυπο και την υπογραφή του γραφείου σας.
  `)}

  ${divider()}

  <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 8px;">
    Επικοινωνήστε μαζί μας:
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
