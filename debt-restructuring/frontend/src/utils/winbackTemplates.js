import { format } from 'date-fns'

export const WINBACK_DAYS = 10

// Win-back message templates; amounts come from c.commercial_offer.winback_app / winback_suc
export function buildWinbackTemplates(c) {
  const name = c.client_name || ''
  const wbApp = c.commercial_offer?.winback_app || 0
  const wbSuc = c.commercial_offer?.winback_suc || 0
  const origApp = c.commercial_offer?.application_fee || c.commercial_offer?.system_app || 0
  const origSuc = c.commercial_offer?.success_fee || c.commercial_offer?.system_suc || 0
  const totalDebt = (c.debts || []).reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const debtK = totalDebt >= 1000 ? (totalDebt / 1000).toFixed(0) + 'χιλ.' : Math.round(totalDebt) + ''
  const bankCount = (c.debts || []).filter(d => d.type === 'Τράπεζα').length
  const fmtApp = Number(wbApp).toLocaleString('el-GR')
  const fmtSuc = Number(wbSuc).toLocaleString('el-GR')
  const fmtOrigApp = Number(origApp).toLocaleString('el-GR')
  const fmtOrigSuc = Number(origSuc).toLocaleString('el-GR')

  const validUntil = c.commercial_offer?.winback_offer_valid_until
  let validUntilLine = ''
  if (validUntil) {
    const vDate = new Date(validUntil)
    const daysLeft = Math.max(0, Math.ceil((vDate - new Date()) / (1000 * 60 * 60 * 24)))
    validUntilLine = `\n\n⏰ Η προσφορά ισχύει έως **${format(vDate, 'dd/MM/yyyy')}** (${daysLeft} ημέρες ακόμα).`
  }

  const templates = [
    {
      id: 'special-price',
      icon: '💎',
      label: 'Ειδική Τιμή',
      text: `💎 Αγαπητέ/ή ${name},

Επανερχόμαστε με μια **ξεχωριστή πρόταση** που σχεδιάσαμε αποκλειστικά για εσάς.

Γνωρίζουμε ότι το κόστος αποτελεί συχνά το κυριότερο εμπόδιο στη λήψη αποφάσεων — γι' αυτό θέλουμε να το κάνουμε όσο πιο προσιτό γίνεται:

▸ Κόστος υποβολής αίτησης: **${fmtApp} €** (αντί ${fmtOrigApp} €)
▸ Αμοιβή επιτυχίας: **${fmtSuc} €** (αντί ${fmtOrigSuc} €)

Η ρύθμιση των οφειλών σας είναι εφικτή. Ένα βήμα χωρίζει από μια νέα αρχή. 📞

Η ομάδα iMentor`,
    },
    {
      id: 'empathy',
      icon: '🤝',
      label: 'Συμπαράσταση',
      text: `🤝 Αγαπητέ/ή ${name},

Γνωρίζουμε ότι κάθε υπόθεση έχει τη δική της ιστορία — και **δεν κρίνουμε ποτέ**.

${bankCount > 0 ? `Με ${bankCount} τράπεζ${bankCount === 1 ? 'α' : 'ες'} και λοιπούς πιστωτές να πιέζουν, ` : ''}η καθημερινότητα μπορεί να είναι εξαντλητική. Εμείς είμαστε εδώ **για να μπούμε ανάμεσα** — με γνώση, εμπειρία και αποτελέσματα.

Για να κάνουμε αυτό το βήμα όσο πιο εύκολο γίνεται για εσάς:

▸ Κόστος υποβολής: **${fmtApp} €**
▸ Αμοιβή επιτυχίας: **${fmtSuc} €**

Μια συνομιλία δεν δεσμεύει σε τίποτα. Είμαστε εδώ. 💬

Η ομάδα iMentor`,
    },
    {
      id: 'second-chance',
      icon: '🔄',
      label: 'Δεύτερη Ευκαιρία',
      text: `🔄 Αγαπητέ/ή ${name},

Μερικές φορές χρειαζόμαστε χρόνο για να πάρουμε τις **σωστές αποφάσεις** — και αυτό είναι απολύτως φυσιολογικό.

${totalDebt > 0 ? `Οι οφειλές των ${debtK} € δεν εξαφανίζονται από μόνες τους — αλλά μπορούν να ρυθμιστούν. ` : ''}Η νομοθεσία δίνει σήμερα **πραγματικές ευκαιρίες** αναδιάρθρωσης που αξίζει να εξερευνήσετε.

Σας περιμένουμε, με ακόμα καλύτερες συνθήκες:

▸ Κόστος υποβολής: **${fmtApp} €**
▸ Αμοιβή επιτυχίας: **${fmtSuc} €**

Ας μιλήσουμε ξανά — χωρίς καμία πίεση. 🙏

Η ομάδα iMentor`,
    },
    {
      id: 'reconsider',
      icon: '💭',
      label: 'Ξανασκεφτείτε το',
      text: `💭 Αγαπητέ/ή ${name},

Θέλαμε απλώς να σας θυμίσουμε ότι **η πρότασή μας παραμένει ανοιχτή**.

Καταλαβαίνουμε ότι μια τέτοια απόφαση δεν λαμβάνεται εύκολα. Όμως κάθε μέρα που περνά, οι τόκοι και τα πρόστιμα συνεχίζουν να μεγαλώνουν. **Η ρύθμιση σταματά αυτόν τον κύκλο.**

Για να διευκολύνουμε την επιλογή σας, σας προσφέρουμε:

▸ Κόστος υποβολής: **${fmtApp} €**
▸ Αμοιβή επιτυχίας: **${fmtSuc} €**

Ένα μόνο μήνυμα αρκεί για να ξεκινήσουμε. ✉️

Η ομάδα iMentor`,
    },
    {
      id: 'timing',
      icon: '⏳',
      label: 'Κατάλληλη Στιγμή',
      text: `⏳ Αγαπητέ/ή ${name},

Το νομικό πλαίσιο για τη ρύθμιση οφειλών **εξελίσσεται διαρκώς** — και τα παράθυρα ευκαιρίας δεν παραμένουν ανοιχτά για πάντα.

Πιστεύουμε ότι **τώρα είναι η κατάλληλη στιγμή** για να κάνετε αυτό το βήμα. Έχουμε ήδη αναλύσει την υπόθεσή σας και γνωρίζουμε ότι υπάρχει λύση.

Η πρότασή μας, με ειδικές συνθήκες:

▸ Κόστος υποβολής: **${fmtApp} €**
▸ Αμοιβή επιτυχίας: **${fmtSuc} €**

Είμαστε έτοιμοι να προχωρήσουμε μαζί σας — αμέσως. 🚀

Η ομάδα iMentor`,
    },
  ]

  return validUntilLine ? templates.map(t => ({ ...t, text: t.text + validUntilLine })) : templates
}
