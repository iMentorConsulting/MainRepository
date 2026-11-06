import fs from 'fs'
import path from 'path'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, ImageRun, BorderStyle, HeadingLevel,
} from 'docx'

// Generates the "ΣΥΜΦΩΝΗΤΙΚΟ ΣΥΝΕΡΓΑΣΙΑΣ" (cooperation agreement) .docx,
// prefilled with the client business's data and I-MENTOR's own fixed
// details, following the office's standard template
// (IMentor_Symfonitiko_Protypo.docx). Admin/consultant-only feature —
// see src/app/api/businesses/[id]/agreement/route.ts.

export interface AgreementBusiness {
  onomasia: string | null
  afm: string
  doyDescr: string | null
  postalAddress: string | null
  postalAddressNo: string | null
  postalZipCode: string | null
  postalAreaDescription: string | null
}

export interface AgreementParams {
  business: AgreementBusiness
  programTitle: string
  applicationFee: number | null
  implementationFee: number
}

const IMENTOR_SIGNATURE_PATH = path.join(process.cwd(), 'src/lib/assets/imentor-signature.png')

function fmtEur(n: number) {
  return n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function underline(n = 18) {
  return '_'.repeat(n)
}

function heading(text: string) {
  return new Paragraph({
    spacing: { before: 280, after: 140 },
    children: [new TextRun({ text, bold: true })],
  })
}

function body(text: string, opts: { spacingAfter?: number } = {}) {
  return new Paragraph({
    spacing: { after: opts.spacingAfter ?? 200 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text })],
  })
}

export async function buildAgreementDocx({ business, programTitle, applicationFee, implementationFee }: AgreementParams): Promise<Buffer> {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()

  const businessAddress = [business.postalAddress, business.postalAddressNo, business.postalAreaDescription]
    .filter(Boolean).join(' ') || underline(40)
  const businessZip = business.postalZipCode || underline(8)
  const businessName = business.onomasia || underline(40)
  const businessDoy = business.doyDescr || underline(20)

  const signatureImage = fs.readFileSync(IMENTOR_SIGNATURE_PATH)

  const signatureTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ children: [new TextRun({ text: 'Ο ΣΥΜΒΟΥΛΟΣ', bold: true })] }),
              new Paragraph({ children: [new TextRun({ text: 'I MENTOR ΙΚΕ', bold: true })], spacing: { after: 200 } }),
              new Paragraph({
                children: [new ImageRun({
                  type: 'png',
                  data: signatureImage,
                  transformation: { width: 220, height: 88 },
                })],
              }),
              new Paragraph({ text: underline(28), spacing: { before: 100 } }),
              new Paragraph({ children: [new TextRun({ text: '(Υπογραφή & σφραγίδα)', size: 18 })] }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ children: [new TextRun({ text: 'Ο ΕΝΤΟΛΕΑΣ', bold: true })], spacing: { after: 420 } }),
              new Paragraph({ text: underline(28), spacing: { before: 420 } }),
              new Paragraph({ children: [new TextRun({ text: '(Υπογραφή & σφραγίδα)', size: 18 })] }),
            ],
          }),
        ],
      }),
    ],
  })

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: 'ΣΥΜΦΩΝΗΤΙΚΟ ΣΥΝΕΡΓΑΣΙΑΣ', bold: true, size: 28 })],
    }),
    new Paragraph({
      spacing: { after: 280 },
      children: [new TextRun({ text: `Ηράκλειο, ${day} / ${month} / ${year}` })],
    }),

    heading('ΜΕΡΟΣ Α΄ – ΣΥΜΒΑΛΛΟΜΕΝΑ ΜΕΡΗ'),
    body('Το παρόν Συμφωνητικό Συνεργασίας (εφεξής «Σύμβαση») συνάπτεται μεταξύ των κάτωθι μερών:'),
    body('1. Της εταιρείας με την επωνυμία «I MENTOR ΙΚΕ», με έδρα επί της οδού Παύλου Μπακογιάννη 5, Τ.Κ. 71410, Ηράκλειο Κρήτης, Α.Φ.Μ. 802100033 Δ.Ο.Υ. Ηρακλείου αρ. Γ.Ε.ΜΗ. 169943427000, νομίμως εκπροσωπούμενης από τον Χαράλαμπο Αποστολάκη (εφεξής «Σύμβουλος»).'),
    body(`2. Του/της «${businessName}», με Α.Φ.Μ. ${business.afm}, Δ.Ο.Υ. ${businessDoy}, διεύθυνση έδρας ${businessAddress}, Τ.Κ. ${businessZip}, (εφεξής «Εντολέας»).`),

    heading('ΑΡΘΡΟ 1 – ΑΝΤΙΚΕΙΜΕΝΟ ΤΗΣ ΣΥΜΒΑΣΗΣ'),
    body('Ο Εντολέας αναθέτει στον Σύμβουλο και ο Σύμβουλος αποδέχεται την παροχή συμβουλευτικών υπηρεσιών σχετικά με την προετοιμασία, υποβολή και παρακολούθηση της υλοποίησης επενδυτικού σχεδίου στο πλαίσιο του ακόλουθου προγράμματος:'),
    new Paragraph({ spacing: { after: 280 }, children: [new TextRun({ text: `Πρόγραμμα: ${programTitle}`, bold: true })] }),

    heading('ΑΡΘΡΟ 2 – ΑΜΟΙΒΗ'),
    body('Για την παροχή των ανωτέρω υπηρεσιών, ο Εντολέας υποχρεούται να καταβάλει στον Σύμβουλο τις ακόλουθες διακριτές αμοιβές:'),
    ...(applicationFee != null ? [body(`Α. Αμοιβή για την υποβολή αίτησης επενδυτικού σχεδίου: ποσό ${fmtEur(applicationFee)} € πλέον Φ.Π.Α.`)] : []),
    body(`${applicationFee != null ? 'Β' : 'Α'}. Αμοιβή για την υλοποίηση επενδυτικού σχεδίου: ποσό ${fmtEur(implementationFee)} € πλέον Φ.Π.Α.`),

    heading('ΑΡΘΡΟ 3 – ΕΜΠΙΣΤΕΥΤΙΚΟΤΗΤΑ'),
    body('Τα μέρη συμφωνούν ότι κάθε πληροφορία που λαμβάνουν στο πλαίσιο της παρούσας συνεργασίας είναι εμπιστευτική. Απαγορεύεται η γνωστοποίησή της σε τρίτους χωρίς την έγγραφη συναίνεση του άλλου μέρους, τόσο κατά τη συνεργασία όσο και μετά τη λήξη της.'),

    heading('ΑΡΘΡΟ 4 – ΛΟΙΠΟΙ ΟΡΟΙ'),
    body('Η παρούσα Σύμβαση διέπεται από το ελληνικό δίκαιο. Για κάθε διαφορά που τυχόν ανακύψει αρμόδια ορίζονται τα δικαστήρια Ηρακλείου.'),
    body('Τυχόν τροποποιήσεις της παρούσας θα γίνονται μόνο εγγράφως και θα υπογράφονται και από τα δύο συμβαλλόμενα μέρη.', { spacingAfter: 360 }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: 'ΟΙ ΣΥΜΒΑΛΛΟΜΕΝΟΙ', bold: true })],
    }),
    signatureTable,
  ]

  const doc = new Document({
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 } } }, // A4
      children,
    }],
  })

  return Packer.toBuffer(doc)
}
