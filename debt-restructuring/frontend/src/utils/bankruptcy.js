// Bankruptcy (ΠΤΩΧΕΥΣΗ) helpers — mirrors backend/bankruptcy_utils.py
export const SERVICE_EXODIKASTIKOS = 'ΕΞΩΔΙΚΑΣΤΙΚΟΣ'
export const SERVICE_BANKRUPTCY = 'ΠΤΩΧΕΥΣΗ'

export const SERVICE_LABELS = {
  [SERVICE_EXODIKASTIKOS]: 'Εξωδικαστικός',
  [SERVICE_BANKRUPTCY]: 'Πτώχευση',
}

export const BANKRUPTCY_STAGES = [
  'Άντληση Στοιχείων',
  'Συγκέντρωση Δικαιολογητικών',
  'Εγγραφή στο Μητρώο Φερεγγυότητας',
  'Κατάθεση σε Δικαστήριο — Αναμονή Απόφασης',
  'Έκδοση Απόφασης',
  'Αναμονή Τριετίας για Απαλλαγή',
]

export const SUCCESS_FEE_INSTALLMENTS = 4
export const SUCCESS_FEE_INTERVAL_MONTHS = 3

function parseDate(v) {
  if (!v) return null
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`)
  return isNaN(d) ? null : d
}

export function addMonths(date, months) {
  const y = date.getFullYear() + Math.floor((date.getMonth() + months) / 12)
  const m = (date.getMonth() + months) % 12
  const lastDay = new Date(y, m + 1, 0).getDate()
  return new Date(y, m, Math.min(date.getDate(), lastDay))
}

export const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// 4 equal installments, one every 3 months starting 3 months after the court filing date
export function successFeeSchedule(successFee, filingDate) {
  const fd = parseDate(filingDate)
  const total = Number(successFee) || 0
  if (!fd || !total) return []
  const each = Math.round(total / SUCCESS_FEE_INSTALLMENTS * 100) / 100
  return Array.from({ length: SUCCESS_FEE_INSTALLMENTS }, (_, i) => ({
    n: i + 1,
    due: toIso(addMonths(fd, SUCCESS_FEE_INTERVAL_MONTHS * (i + 1))),
    amount: i < SUCCESS_FEE_INSTALLMENTS - 1 ? each : Math.round((total - each * (SUCCESS_FEE_INSTALLMENTS - 1)) * 100) / 100,
  }))
}

// End of the 3-year waiting period, counted from the decision date
export function threeYearEnd(decisionDate) {
  const d = parseDate(decisionDate)
  return d ? toIso(addMonths(d, 36)) : null
}

export const fmtDateGr = (iso) => {
  const d = parseDate(iso)
  return d ? d.toLocaleDateString('el-GR') : '—'
}
export const eur = (n) => `${Number(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}€`
