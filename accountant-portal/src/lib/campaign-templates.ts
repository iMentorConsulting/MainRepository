export interface CampaignTemplate {
  id: string
  label: string
  description: string
  subject: string
  bodyWithAccountant: string
  bodyDirect: string
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'program-eligibility',
    label: 'Ενημέρωση Επιλεξιμότητας Προγράμματος',
    description: 'Εξηγεί στην επιχείρηση γιατί ελέγχθηκε και βρέθηκε επιλέξιμη για ένα συγκεκριμένο πρόγραμμα.',
    subject: '{{accountant_office}} & I-MENTOR: Επιλέξιμοι για το «{{program_title}}»',
    bodyWithAccountant:
`Αγαπητοί συνεργάτες της {{business_name}},

Σας γράφουμε από κοινού με το λογιστικό σας γραφείο, {{accountant_office}} (υπεύθυνος επικοινωνίας: {{accountant_name}}), σε συνεργασία με την I-MENTOR.

Ελέγξαμε τα στοιχεία της επιχείρησής σας (ΑΦΜ {{afm}}, ΚΑΔ {{kad_description}}) και διαπιστώσαμε ότι πληροίτε τις προϋποθέσεις για το πρόγραμμα «{{program_title}}».

Συγκεκριμένα:
{{match_reason}}

Αν επιθυμείτε να σας ενημερώσουμε αναλυτικά για τις προϋποθέσεις, το ύψος της επιδότησης και τα επόμενα βήματα, επικοινωνήστε με το λογιστικό σας γραφείο ή απαντήστε σε αυτό το μήνυμα.

Με εκτίμηση,
{{accountant_office}} & I-MENTOR

Αν δεν επιθυμείτε να λαμβάνετε ενημερώσεις σχετικά με προγράμματα επιδότησης: {{unsubscribe_link}}`,
    bodyDirect:
`Αγαπητοί συνεργάτες της {{business_name}},

Σας γράφει η ομάδα της I-MENTOR.

Ελέγξαμε τα στοιχεία της επιχείρησής σας (ΑΦΜ {{afm}}, ΚΑΔ {{kad_description}}) και διαπιστώσαμε ότι πληροίτε τις προϋποθέσεις για το πρόγραμμα «{{program_title}}».

Συγκεκριμένα:
{{match_reason}}

Αν επιθυμείτε να σας ενημερώσουμε αναλυτικά για τις προϋποθέσεις, το ύψος της επιδότησης και τα επόμενα βήματα, απαντήστε σε αυτό το μήνυμα.

Με εκτίμηση,
Η ομάδα της I-MENTOR

Αν δεν επιθυμείτε να λαμβάνετε ενημερώσεις σχετικά με προγράμματα επιδότησης: {{unsubscribe_link}}`
  },
  {
    id: 'partnership-intro',
    label: 'Παρουσίαση Συνεργασίας I-MENTOR & Λογιστικού Γραφείου',
    description: 'Πρώτη επαφή — παρουσιάζει τη συνεργασία I-MENTOR με το λογιστικό γραφείο και τη συνδρομή στην εύρεση επιδοτήσεων.',
    subject: '{{accountant_office}}: Νέα υπηρεσία ενημέρωσης για επιδοτήσεις από την I-MENTOR',
    bodyWithAccountant:
`Αγαπητοί κύριοι/κυρίες της {{business_name}},

Το λογιστικό σας γραφείο, {{accountant_office}}, συνεργάζεται με την I-MENTOR με στόχο να σας ενημερώνει έγκαιρα για προγράμματα επιδότησης και χρηματοδότησης (ΕΣΠΑ, ΔΥΠΑ, μικροδάνεια κ.ά.) που ταιριάζουν στο προφίλ της επιχείρησής σας.

Με βάση τα στοιχεία σας (ΑΦΜ {{afm}}, ΚΑΔ {{kad_description}}), παρακολουθούμε διαρκώς τα ενεργά προγράμματα και θα σας ενημερώνουμε άμεσα όταν προκύπτει κάτι που σας αφορά.

Για οποιαδήποτε απορία, ο/η {{accountant_name}} από το {{accountant_office}} είναι στη διάθεσή σας.

Με εκτίμηση,
{{accountant_office}} & I-MENTOR

Διαχείριση ενημερώσεων: {{unsubscribe_link}}`,
    bodyDirect:
`Αγαπητοί κύριοι/κυρίες της {{business_name}},

Είμαστε η I-MENTOR — βοηθάμε επιχειρήσεις σαν τη δική σας να εντοπίζουν προγράμματα επιδότησης και χρηματοδότησης (ΕΣΠΑ, ΔΥΠΑ, μικροδάνεια κ.ά.) που ταιριάζουν στο προφίλ τους.

Με βάση τα στοιχεία σας (ΑΦΜ {{afm}}, ΚΑΔ {{kad_description}}), παρακολουθούμε διαρκώς τα ενεργά προγράμματα και θα σας ενημερώνουμε απευθείας μόλις προκύψει κάτι που σας αφορά — χωρίς καμία δέσμευση.

Για οποιαδήποτε απορία, απαντήστε σε αυτό το μήνυμα.

Με εκτίμηση,
Η ομάδα της I-MENTOR

Διαχείριση ενημερώσεων: {{unsubscribe_link}}`
  },
  {
    id: 'deadline-reminder',
    label: 'Υπενθύμιση Προθεσμίας Υποβολής',
    description: 'Υπενθύμιση για επικείμενη λήξη προθεσμίας υποβολής αίτησης σε πρόγραμμα για το οποίο η επιχείρηση είναι επιλέξιμη.',
    subject: '⏰ {{accountant_office}}: Η προθεσμία για το «{{program_title}}» πλησιάζει!',
    bodyWithAccountant:
`Αγαπητοί συνεργάτες της {{business_name}},

Σας υπενθυμίζουμε, από κοινού με το {{accountant_office}} και την I-MENTOR, ότι η επιχείρησή σας (ΑΦΜ {{afm}}) έχει βρεθεί επιλέξιμη για το πρόγραμμα «{{program_title}}»:

{{match_reason}}

Η προθεσμία υποβολής πλησιάζει — επικοινωνήστε άμεσα με τον/την {{accountant_name}} στο {{accountant_office}} για να προχωρήσουμε στην προετοιμασία του φακέλου σας έγκαιρα.

Με εκτίμηση,
{{accountant_office}} & I-MENTOR

{{unsubscribe_link}}`,
    bodyDirect:
`Αγαπητοί συνεργάτες της {{business_name}},

Σας υπενθυμίζουμε ότι η επιχείρησή σας (ΑΦΜ {{afm}}) έχει βρεθεί επιλέξιμη για το πρόγραμμα «{{program_title}}»:

{{match_reason}}

Η προθεσμία υποβολής πλησιάζει — απαντήστε σε αυτό το μήνυμα άμεσα ώστε να προχωρήσουμε έγκαιρα στην προετοιμασία του φακέλου σας.

Με εκτίμηση,
Η ομάδα της I-MENTOR

{{unsubscribe_link}}`
  },
  {
    id: 'kad-match',
    label: 'Στοχευμένη Ενημέρωση βάσει ΚΑΔ',
    description: 'Τονίζει ότι η επιλεξιμότητα προέκυψε ειδικά από τον κωδικό δραστηριότητας (ΚΑΔ) της επιχείρησης.',
    subject: '{{accountant_office}}: Ο ΚΑΔ σας σας δίνει πρόσβαση στο «{{program_title}}»',
    bodyWithAccountant:
`Αγαπητοί συνεργάτες της {{business_name}},

Κατά τον έλεγχο που πραγματοποιήσαμε από κοινού με το λογιστικό σας γραφείο {{accountant_office}}, εντοπίσαμε ότι ο κωδικός δραστηριότητάς σας ({{kad_description}}) εντάσσεται στις επιλέξιμες κατηγορίες του προγράμματος «{{program_title}}».

Λόγοι επιλεξιμότητας:
{{match_reason}}

Ο/Η {{accountant_name}} από το {{accountant_office}} μπορεί να σας ενημερώσει αναλυτικά για το ποσοστό επιδότησης και τη διαδικασία υποβολής.

Με εκτίμηση,
{{accountant_office}} & I-MENTOR

{{unsubscribe_link}}`,
    bodyDirect:
`Αγαπητοί συνεργάτες της {{business_name}},

Κατά τον έλεγχο που πραγματοποιήσαμε, εντοπίσαμε ότι ο κωδικός δραστηριότητάς σας ({{kad_description}}) εντάσσεται στις επιλέξιμες κατηγορίες του προγράμματος «{{program_title}}».

Λόγοι επιλεξιμότητας:
{{match_reason}}

Απαντήστε σε αυτό το μήνυμα και θα σας ενημερώσουμε αναλυτικά για το ποσοστό επιδότησης και τη διαδικασία υποβολής.

Με εκτίμηση,
Η ομάδα της I-MENTOR

{{unsubscribe_link}}`
  },
]

// Viber messages are short, punchy, and support light markdown — *text*
// renders as bold on the recipient's device. Each template comes in two
// flavors: one that highlights the partnership with the accounting office,
// and a "direct" one for contacts of I-MENTOR that have no linked accountant.
export interface ViberCampaignTemplate {
  id: string
  label: string
  description: string
  subject: string
  bodyWithAccountant: string
  bodyDirect: string
}

export const VIBER_CAMPAIGN_TEMPLATES: ViberCampaignTemplate[] = [
  {
    id: 'viber-program-eligibility',
    label: 'Ενημέρωση Επιλεξιμότητας Προγράμματος',
    description: 'Σύντομο μήνυμα Viber που ενημερώνει την επιχείρηση ότι βρέθηκε επιλέξιμη για συγκεκριμένο πρόγραμμα.',
    subject: '{{accountant_office}} & I-MENTOR: Επιλέξιμοι για το «{{program_title}}»',
    bodyWithAccountant:
`Γειά σας, *{{business_name}}* 👋

Σας γράφουμε από κοινού με το λογιστικό σας γραφείο *{{accountant_office}}* και την *I-MENTOR*.

Ελέγξαμε τα στοιχεία σας (ΑΦΜ {{afm}}) και είστε *επιλέξιμοι* για το πρόγραμμα «*{{program_title}}*»!

{{match_reason}}

Επικοινωνήστε με τον/την *{{accountant_name}}* ή απαντήστε εδώ για αναλυτική ενημέρωση.

— {{accountant_office}} & I-MENTOR
{{unsubscribe_link}}`,
    bodyDirect:
`Γειά σας, *{{business_name}}* 👋

Σας γράφει η ομάδα της *I-MENTOR*.

Ελέγξαμε τα στοιχεία σας (ΑΦΜ {{afm}}) και είστε *επιλέξιμοι* για το πρόγραμμα «*{{program_title}}*»!

{{match_reason}}

Απαντήστε σε αυτό το μήνυμα για αναλυτική ενημέρωση σχετικά με τις προϋποθέσεις και τα επόμενα βήματα.

— Η ομάδα της I-MENTOR
{{unsubscribe_link}}`
  },
  {
    id: 'viber-partnership-intro',
    label: 'Πρώτη Επαφή & Παρουσίαση',
    description: 'Σύντομη πρώτη επαφή μέσω Viber που παρουσιάζει την υπηρεσία ενημέρωσης για επιδοτήσεις.',
    subject: '{{accountant_office}}: Νέα υπηρεσία ενημέρωσης για επιδοτήσεις από την I-MENTOR',
    bodyWithAccountant:
`Γειά σας, *{{business_name}}* 👋

Το λογιστικό σας γραφείο *{{accountant_office}}* συνεργάζεται με την *I-MENTOR* ώστε να σας ενημερώνει έγκαιρα για προγράμματα επιδότησης (ΕΣΠΑ, ΔΥΠΑ, μικροδάνεια κ.ά.) που ταιριάζουν στο προφίλ σας.

Με βάση τα στοιχεία σας (ΑΦΜ {{afm}}, ΚΑΔ {{kad_description}}) θα σας ενημερώνουμε άμεσα μόλις προκύψει κάτι που σας αφορά.

Για ό,τι χρειαστείτε, ο/η *{{accountant_name}}* είναι στη διάθεσή σας.

— {{accountant_office}} & I-MENTOR
{{unsubscribe_link}}`,
    bodyDirect:
`Γειά σας, *{{business_name}}* 👋

Είμαστε η *I-MENTOR* — βοηθάμε επιχειρήσεις σαν τη δική σας να εντοπίζουν προγράμματα επιδότησης και χρηματοδότησης (ΕΣΠΑ, ΔΥΠΑ, μικροδάνεια κ.ά.) που ταιριάζουν στο προφίλ τους.

Με βάση τα στοιχεία σας (ΑΦΜ {{afm}}, ΚΑΔ {{kad_description}}) θα σας ενημερώνουμε απευθείας κάθε φορά που προκύπτει κάτι που σας αφορά — χωρίς καμία δέσμευση.

Απαντήστε «ΝΑΙ» αν θέλετε να ξεκινήσουμε!

— Η ομάδα της I-MENTOR
{{unsubscribe_link}}`
  },
  {
    id: 'viber-deadline-reminder',
    label: 'Υπενθύμιση Προθεσμίας',
    description: 'Σύντομη υπενθύμιση μέσω Viber για επικείμενη λήξη προθεσμίας υποβολής σε πρόγραμμα στο οποίο είναι επιλέξιμη η επιχείρηση.',
    subject: '⏰ {{accountant_office}}: Η προθεσμία για το «{{program_title}}» πλησιάζει!',
    bodyWithAccountant:
`Γειά σας, *{{business_name}}* ⏰

Υπενθύμιση από το *{{accountant_office}}* και την *I-MENTOR*: είστε επιλέξιμοι για το πρόγραμμα «*{{program_title}}*» και η προθεσμία υποβολής *πλησιάζει*!

{{match_reason}}

Επικοινωνήστε άμεσα με τον/την *{{accountant_name}}* για να προετοιμάσουμε έγκαιρα τον φάκελό σας.

— {{accountant_office}} & I-MENTOR
{{unsubscribe_link}}`,
    bodyDirect:
`Γειά σας, *{{business_name}}* ⏰

Υπενθύμιση από την *I-MENTOR*: είστε επιλέξιμοι για το πρόγραμμα «*{{program_title}}*» και η προθεσμία υποβολής *πλησιάζει*!

{{match_reason}}

Απαντήστε σε αυτό το μήνυμα άμεσα ώστε να προχωρήσουμε έγκαιρα στην προετοιμασία του φακέλου σας.

— Η ομάδα της I-MENTOR
{{unsubscribe_link}}`
  },
  {
    id: 'viber-kad-match',
    label: 'Στοχευμένη Ενημέρωση βάσει ΚΑΔ',
    description: 'Τονίζει μέσω Viber ότι η επιλεξιμότητα προέκυψε ειδικά από τον κωδικό δραστηριότητας (ΚΑΔ) της επιχείρησης.',
    subject: '{{accountant_office}}: Ο ΚΑΔ σας σας δίνει πρόσβαση στο «{{program_title}}»',
    bodyWithAccountant:
`Γειά σας, *{{business_name}}* 👋

Κατά τον έλεγχο που κάναμε με το *{{accountant_office}}*, είδαμε ότι ο ΚΑΔ σας (*{{kad_description}}*) εντάσσεται στις επιλέξιμες κατηγορίες του προγράμματος «*{{program_title}}*»!

{{match_reason}}

Ο/Η *{{accountant_name}}* μπορεί να σας ενημερώσει για το ποσοστό επιδότησης και τα επόμενα βήματα.

— {{accountant_office}} & I-MENTOR
{{unsubscribe_link}}`,
    bodyDirect:
`Γειά σας, *{{business_name}}* 👋

Είδαμε ότι ο ΚΑΔ σας (*{{kad_description}}*) εντάσσεται στις επιλέξιμες κατηγορίες του προγράμματος «*{{program_title}}*»!

{{match_reason}}

Απαντήστε σε αυτό το μήνυμα και θα σας ενημερώσουμε αναλυτικά για το ποσοστό επιδότησης και τα επόμενα βήματα.

— Η ομάδα της I-MENTOR
{{unsubscribe_link}}`
  },
]

