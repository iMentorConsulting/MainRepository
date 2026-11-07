// IRIS Payment System - Greek instant payment standard (DIAS)
// Reference: https://www.iris-payments.gr

export interface IrisPaymentParams {
  iban: string           // Company IBAN (from settings)
  merchantName: string   // Company display name
  amount: number         // in cents
  reference: string      // Unique reference number
  description?: string
}

export interface IrisPaymentData {
  reference: string
  irisLink: string    // web URL
  irisUri: string     // iris:// URI for mobile apps
  qrData: string      // same as irisUri, encoded in QR
  amount: number      // in cents
  amountFormatted: string
}

export function generateIrisReference(prefix = 'IMENT'): string {
  const date = new Date()
  const year = date.getFullYear()
  const random = Math.floor(Math.random() * 900000) + 100000
  return `${prefix}-${year}-${random}`
}

export function createIrisPayment(params: IrisPaymentParams): IrisPaymentData {
  const { iban, merchantName, amount, reference } = params
  const amountFormatted = (amount / 100).toFixed(2)

  // Clean IBAN (remove spaces)
  const cleanIban = iban.replace(/\s/g, '')

  // Standard IRIS URI format
  const irisUri = `iris://pay?a=${amountFormatted}&r=${encodeURIComponent(reference)}&i=${cleanIban}&n=${encodeURIComponent(merchantName)}`

  // Web URL (redirects to banking app or shows payment page)
  const irisLink = `https://www.iris-payments.gr/pay?a=${amountFormatted}&r=${encodeURIComponent(reference)}&i=${cleanIban}&n=${encodeURIComponent(merchantName)}`

  return {
    reference,
    irisLink,
    irisUri,
    qrData: irisUri, // QR contains the iris:// URI
    amount,
    amountFormatted: `€${amountFormatted}`,
  }
}

export function formatIrisInstructions(data: IrisPaymentData, merchantName: string, iban: string): string {
  return `
Στοιχεία Πληρωμής IRIS:
• Ποσό: ${data.amountFormatted}
• Αριθμός Αναφοράς: ${data.reference}
• IBAN Δικαιούχου: ${iban}
• Δικαιούχος: ${merchantName}

Μπορείτε να πληρώσετε:
1. Με κλικ στο σύνδεσμο IRIS (ανοίγει την τραπεζική εφαρμογή σας)
2. Σαρώνοντας το QR Code με την τραπεζική εφαρμογή σας
3. Μέσω web banking χρησιμοποιώντας τα παραπάνω στοιχεία
  `.trim()
}
