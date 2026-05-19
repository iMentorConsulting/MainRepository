// ============================================================
// Report generators — produce full HTML documents for plan + email
// Ported from the original HTML spec v22.0
// ============================================================

import { fmt, stepUpPMT } from './calculations'
import { PARAMS_B } from './calculationParams'

function escHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function polarToCartesian(cx, cy, r, angle) {
  const rad = ((angle - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
}

const PALETTE = ['#004aad', '#00a3a3', '#ff9f1a', '#7b61ff', '#16a34a', '#ef4444', '#64748b']

function renderDonutChart(title, items, centerTop, centerBottom, note) {
  const valid = (items || []).filter((x) => Number(x.value || 0) > 0).map((x, i) => ({ ...x, color: x.color || PALETTE[i % PALETTE.length], value: Number(x.value || 0) }))
  const total = valid.reduce((a, x) => a + x.value, 0)
  const arcs = !total
    ? `<circle cx="110" cy="100" r="64" stroke="#dfe8f8" stroke-width="34" fill="none"/>`
    : valid.map((item, idx) => {
        const prev = valid.slice(0, idx).reduce((a, x) => a + x.value, 0)
        const start = (prev / total) * 360
        const end = ((prev + item.value) / total) * 360
        return `<path d="${describeArc(110, 100, 64, start, end)}" stroke="${item.color}" stroke-width="34" fill="none"/>`
      }).join('')
  const legendItems = valid.length ? valid : [{ label: 'Χωρίς δεδομένα', value: 0, color: '#dfe8f8' }]
  const legendHtml = legendItems.map((item) => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#4f5c72;margin-right:10px;"><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${item.color}"></i>${escHtml(item.label)}: <b>${fmt(item.value)}</b></span>`).join('')
  return `<div style="border:1px solid #dde7fb;border-radius:12px;padding:14px;margin-bottom:12px;"><div style="font-weight:800;color:#003f97;margin:0 0 8px;font-size:15px;">${escHtml(title)}</div><div style="display:grid;grid-template-columns:200px 1fr;gap:12px;align-items:center;"><svg viewBox="0 0 220 200" width="200" height="200"><circle cx="110" cy="100" r="64" stroke="#edf2fb" stroke-width="34" fill="none"/>${arcs}<text x="110" y="92" text-anchor="middle" font-size="13" fill="#5f6b7a" font-weight="600">${escHtml(centerTop)}</text><text x="110" y="113" text-anchor="middle" font-size="22" fill="#003f97" font-weight="800">${escHtml(centerBottom)}</text></svg><div>${legendHtml}</div></div><div style="color:#5e6c84;font-size:12px;margin-top:8px;">${escHtml(note)}</div></div>`
}

function renderCompareBars(title, items, note) {
  const valid = (items || []).map((x) => ({ ...x, value: Number(x.value || 0) }))
  const maxV = Math.max(...valid.map((x) => x.value), 1)
  const bars = valid.map((item, idx) => {
    const h = Math.max(8, Math.round((item.value / maxV) * 150))
    const x = 42 + idx * 92
    const y = 170 - h
    return `<rect x="${x}" y="${y}" width="48" height="${h}" rx="8" fill="${item.color}"/><text x="${x + 24}" y="185" text-anchor="middle" font-size="12" fill="#5f6b7a">${escHtml(item.label)}</text><text x="${x + 24}" y="${y - 8}" text-anchor="middle" font-size="11" fill="#003f97" font-weight="700">${escHtml(fmt(item.value))}</text>`
  }).join('')
  return `<div style="border:1px solid #dde7fb;border-radius:12px;padding:14px;margin-bottom:12px;"><div style="font-weight:800;color:#003f97;margin:0 0 8px;font-size:15px;">${escHtml(title)}</div><svg viewBox="0 0 320 205" width="100%" height="205"><line x1="26" y1="170" x2="300" y2="170" stroke="#d9e4f7" stroke-width="2"/>${bars}</svg><div style="color:#5e6c84;font-size:12px;margin-top:8px;">${escHtml(note)}</div></div>`
}

function renderHorizontalBars(title, items, note) {
  const valid = (items || []).filter((x) => Number(x.value || 0) > 0).map((x, i) => ({ ...x, color: x.color || PALETTE[i % PALETTE.length], value: Number(x.value || 0) }))
  const maxV = Math.max(...valid.map((x) => x.value), 1)
  const rowH = 38
  const height = Math.max(120, 30 + valid.length * rowH)
  const rowsSvg = (valid.length ? valid : [{ label: 'Χωρίς δεδομένα', value: 0, color: '#dfe8f8' }]).map((item, idx) => {
    const y = 24 + idx * rowH
    const w = Math.max(0, Math.round((item.value / maxV) * 170))
    return `<text x="6" y="${y + 15}" font-size="12" fill="#4f5c72">${escHtml(item.label)}</text><rect x="120" y="${y}" width="170" height="16" rx="8" fill="#edf2fb"/><rect x="120" y="${y}" width="${w}" height="16" rx="8" fill="${item.color}"/><text x="296" y="${y + 13}" font-size="11" text-anchor="end" fill="#003f97" font-weight="700">${escHtml(fmt(item.value))}</text>`
  }).join('')
  return `<div style="border:1px solid #dde7fb;border-radius:12px;padding:14px;margin-bottom:12px;"><div style="font-weight:800;color:#003f97;margin:0 0 8px;font-size:15px;">${escHtml(title)}</div><svg viewBox="0 0 310 ${height}" width="100%" height="${height}">${rowsSvg}</svg><div style="color:#5e6c84;font-size:12px;margin-top:8px;">${escHtml(note)}</div></div>`
}

// ============================================================
// Build the restructuring plan HTML
// ============================================================
// Range helper: show "lo – hi" only when difference is meaningful
function planRng(conservative, base, formatter = fmt) {
  if (conservative == null) return formatter(base)
  const lo = Math.min(conservative, base)
  const hi = Math.max(conservative, base)
  const diff = hi - lo
  if (diff === 0) return formatter(hi)
  const loStr = formatter(lo)
  const hiStr = formatter(hi)
  if (loStr === hiStr) return hiStr
  if (diff < 10 || diff / hi < 0.05) return formatter(base)
  return `${loStr} – ${hiStr}`
}

export function buildPlanHtml(data, customRows) {
  const today = new Date().toLocaleDateString('el-GR')
  const { clientName, clientPhone, clientEmail, debtorType, annualIncome, totalExpenses, householdValue, householdLabel, enfia, medical, rent, studentRent, extraLiving, alimony, dispAnnual, dispMonthly, realEstateAssets, totalRealEstateValue, incomeData = {} } = data

  // If customRows provided (from PlanParamsModal), use those; otherwise fall back to data.creditors
  const allCreditors = customRows
    ? customRows.map((r) => {
        const reqWrAmt = Math.round(r.amount * (r.reqPct || 0) / 100)
        const reqRemaining = Math.max(0, r.amount - reqWrAmt)
        const isPubDebt = r.type === 'Εφορία' || r.type === 'Ασφαλιστικά Ταμεία'
        const isSecDebt = r.isSecured || r.mort || false
        const rr1 = isPubDebt ? PARAMS_B.publicRate : (isSecDebt ? PARAMS_B.promoRateSecured : PARAMS_B.promoRateUnsecured)
        const rr2 = isPubDebt ? PARAMS_B.publicRate : PARAMS_B.euribor3m + (isSecDebt ? PARAMS_B.securedSpreadAfterPromo : PARAMS_B.unsecuredSpreadAfterPromo)
        const { c1: reqC1, c2: reqC2 } = reqRemaining > 0 && r.reqMonths > 0
          ? stepUpPMT(reqRemaining, r.reqMonths, rr1, rr2, PARAMS_B.promoMonths)
          : { c1: 0, c2: 0 }
        const monthlyPay = Math.max(0, Math.floor(reqC2))
        const c1 = Math.max(0, Math.floor(reqC1))
        return {
          creditor: r.name,
          type: r.type,
          amount: r.amount,
          writeoff: reqWrAmt,
          remaining: reqRemaining,
          months: r.reqMonths,
          monthlyPay,
          c1,
          c2: monthlyPay,
          excluded: r.excluded || false,
        }
      })
    : data.creditors.map((c) => ({ ...c, excluded: false }))

  const includedCreditors = allCreditors.filter((c) => !c.excluded)
  const excludedCreditors = allCreditors.filter((c) => c.excluded)
  const creditors = includedCreditors

  const totalDebt = allCreditors.reduce((a, c) => a + c.amount, 0)
  const totalWriteOff = includedCreditors.reduce((a, c) => a + (c.writeoff || 0), 0)
  const totalRemaining = includedCreditors.reduce((a, c) => a + (c.remaining || 0), 0)
  const totalMonthlyPay = includedCreditors.reduce((a, c) => a + (c.monthlyPay || 0), 0)

  // Vulnerable debtors: suppress conservative range (presumed acceptance — no negotiation)
  const isVulnerable = !!(data.isVulnerable) && !debtorType.includes('Νομικό')

  // Conservative fields (from data when customRows not used; null when customRows override or vulnerable)
  const hasConservative = !customRows && !isVulnerable && data.totalWriteOffC != null
  const totalWriteOffC = hasConservative ? (data.totalWriteOffC ?? totalWriteOff) : null
  const totalRemainingC = hasConservative ? (data.totalRemainingC ?? totalRemaining) : null
  const totalMonthlyPayC = hasConservative ? (data.totalMonthlyPayC ?? totalMonthlyPay) : null

  const hasStepUp = includedCreditors.some((c) => c.c1 != null && c.c2 != null && c.c1 !== c.c2)
  const totalC1 = hasStepUp ? includedCreditors.reduce((a, c) => a + (c.c1 || c.monthlyPay || 0), 0) : 0
  const totalC1C = hasStepUp && hasConservative ? includedCreditors.reduce((a, c) => a + (c.c1C || c.c1 || c.monthlyPay || 0), 0) : null

  const totalRatio = dispMonthly > 0 ? Math.round((totalMonthlyPay / dispMonthly) * 100) : 0

  const baseMonthly = dispMonthly
  const stressedMonthly = Math.max(0, baseMonthly * 0.9)
  const bufferBase = baseMonthly - totalMonthlyPay
  const bufferStress = stressedMonthly - totalMonthlyPay
  const baseRatio = baseMonthly > 0 ? Math.round((totalMonthlyPay / baseMonthly) * 100) : 0
  const stressRatio = stressedMonthly > 0 ? Math.round((totalMonthlyPay / stressedMonthly) * 100) : 0

  const fpSubType = incomeData.fpSubType
  const isLE = debtorType?.includes('Νομικό')
  const isFpSE = !isLE && fpSubType === 'Επιτηδευματίας'
  const isFpEmp = !isLE && fpSubType === 'Μισθωτός'

  const incomeRows = isLE
    ? ''
    : isFpSE
      ? [
          incomeData.fp_ebitda_t1 != null ? `<tr><td>EBITDA Τ</td><td>${fmt(incomeData.fp_ebitda_t1)}</td><td>Ε3</td></tr>` : '',
          incomeData.fp_ebitda_t2 != null ? `<tr><td>EBITDA Τ-1</td><td>${fmt(incomeData.fp_ebitda_t2)}</td><td>Ε3</td></tr>` : '',
          incomeData.fp_ebitda_t3 != null ? `<tr><td>EBITDA Τ-2</td><td>${fmt(incomeData.fp_ebitda_t3)}</td><td>Ε3</td></tr>` : '',
          incomeData.fp_tax_t1 ? `<tr><td>Φόρος Τ</td><td>${fmt(incomeData.fp_tax_t1)}</td><td>Εκκαθαριστικό</td></tr>` : '',
          incomeData.fp_tax_t2 ? `<tr><td>Φόρος Τ-1</td><td>${fmt(incomeData.fp_tax_t2)}</td><td>Εκκαθαριστικό</td></tr>` : '',
          incomeData.fp_tax_t3 ? `<tr><td>Φόρος Τ-2</td><td>${fmt(incomeData.fp_tax_t3)}</td><td>Εκκαθαριστικό</td></tr>` : '',
          incomeData.fp_e1outside_t1 ? `<tr><td>Εισόδημα Ε1 εκτός επιχ. Τ</td><td>${fmt(incomeData.fp_e1outside_t1)}</td><td>Ε1</td></tr>` : '',
          incomeData.fp_e1outside_t2 ? `<tr><td>Εισόδημα Ε1 εκτός επιχ. Τ-1</td><td>${fmt(incomeData.fp_e1outside_t2)}</td><td>Ε1</td></tr>` : '',
          incomeData.fp_ke_t1 ? `<tr><td>Κύκλος Εργασιών Τ (ΚΕ)</td><td>${fmt(incomeData.fp_ke_t1)}</td><td>Ε3/500</td></tr>` : '',
          annualIncome ? `<tr><td>Μ.Ο. Εισοδήματος (εκτιμ.)</td><td>${fmt(annualIncome)}</td><td>Υπολογισθέν</td></tr>` : '',
          householdValue ? `<tr><td>Εύλογες δαπάνες (${householdLabel})</td><td>${fmt(householdValue)}</td><td>ΕΛΣΤΑΤ</td></tr>` : '',
          enfia ? `<tr><td>ΕΝΦΙΑ</td><td>${fmt(enfia)}</td><td>Ετήσιο</td></tr>` : '',
          medical ? `<tr><td>Ιατρικές δαπάνες</td><td>${fmt(medical)}</td><td>Μόνιμες</td></tr>` : '',
          rent ? `<tr><td>Ενοίκιο</td><td>${fmt(rent)}</td><td>Ετήσιο</td></tr>` : '',
          alimony ? `<tr><td>Διατροφή λόγω διαζυγίου</td><td>${fmt(alimony)}</td><td>Ετήσιο</td></tr>` : '',
        ].filter(Boolean).join('')
      : [
          isFpEmp && incomeData.fp_income_t1 ? `<tr><td>Καθαρό εισόδημα Τ</td><td>${fmt(incomeData.fp_income_t1)}</td><td>Εκκαθαριστικό</td></tr>` : '',
          isFpEmp && incomeData.fp_income_t2 ? `<tr><td>Καθαρό εισόδημα Τ-1</td><td>${fmt(incomeData.fp_income_t2)}</td><td>Εκκαθαριστικό</td></tr>` : '',
          isFpEmp && incomeData.fp_income_t3 ? `<tr><td>Καθαρό εισόδημα Τ-2</td><td>${fmt(incomeData.fp_income_t3)}</td><td>Εκκαθαριστικό</td></tr>` : '',
          annualIncome ? `<tr><td>${isFpEmp ? 'Μ.Ο. 2 καλύτερων ετών' : 'Ετήσιο εισόδημα'}</td><td>${fmt(annualIncome)}</td><td>${isFpEmp ? 'Υπολογισθέν' : 'Δηλωθέν'}</td></tr>` : '',
          householdValue ? `<tr><td>Εύλογες δαπάνες (${householdLabel})</td><td>${fmt(householdValue)}</td><td>ΕΛΣΤΑΤ</td></tr>` : '',
          enfia ? `<tr><td>ΕΝΦΙΑ</td><td>${fmt(enfia)}</td><td>Ετήσιο</td></tr>` : '',
          medical ? `<tr><td>Ιατρικές δαπάνες</td><td>${fmt(medical)}</td><td>Μόνιμες</td></tr>` : '',
          rent ? `<tr><td>Ενοίκιο</td><td>${fmt(rent)}</td><td>Ετήσιο</td></tr>` : '',
          studentRent ? `<tr><td>Ενοίκιο φοιτητών</td><td>${fmt(studentRent)}</td><td>Ετήσιο</td></tr>` : '',
          extraLiving ? `<tr><td>Πρόσθετη διατροφή/διαβίωση</td><td>${fmt(extraLiving)}</td><td>Ετήσιο</td></tr>` : '',
          alimony ? `<tr><td>Διατροφή λόγω διαζυγίου</td><td>${fmt(alimony)}</td><td>Ετήσιο</td></tr>` : '',
        ].filter(Boolean).join('')

  const GS = 'padding:10px;border:1px solid #d2def8;'
  const summaryRows = creditors.map((c) => {
    const pct = c.amount > 0 ? Math.round((c.writeoff / c.amount) * 100) : 0
    const pctC = hasConservative && c.amount > 0 ? Math.round((c.writeoffC / c.amount) * 100) : null
    const wrText = c.writeoff > 0
      ? (hasConservative ? `${planRng(c.writeoffC, c.writeoff)} (${pctC != null && pctC !== pct ? `${Math.min(pctC,pct)}%–${Math.max(pctC,pct)}%` : `${pct}%`})` : `${fmt(c.writeoff)} (${pct}%)`)
      : '—'
    const remText = hasConservative ? planRng(c.remainingC, c.remaining) : fmt(c.remaining)
    const payCell = hasStepUp
      ? `<td style="${GS}text-align:right;">${hasConservative ? planRng(c.c1C, c.c1 || c.monthlyPay) : (c.c1 > 0 ? fmt(c.c1) : '—')}</td><td style="${GS}text-align:right;font-weight:700;">${hasConservative ? planRng(c.c2C, c.c2 || c.monthlyPay) : (c.c2 > 0 ? fmt(c.c2) : (c.monthlyPay > 0 ? fmt(c.monthlyPay) : '—'))}</td>`
      : `<td style="${GS}text-align:right;font-weight:700;">${hasConservative ? planRng(c.c2C, c.monthlyPay) : (c.monthlyPay > 0 ? fmt(c.monthlyPay) : '—')}</td>`
    return `<tr>
      <td style="${GS}font-weight:600;">${escHtml(c.creditor)}</td>
      <td style="${GS}text-align:right;">${fmt(c.amount)}</td>
      <td style="${GS}text-align:right;">${wrText}</td>
      <td style="${GS}text-align:right;">${remText}</td>
      <td style="${GS}text-align:center;">${c.months || 0}</td>
      ${payCell}
    </tr>`
  }).join('')

  const propRows = realEstateAssets.length
    ? realEstateAssets.map((a, i) => `<tr><td>${i + 1}</td><td>${escHtml(a.label)}</td><td>${escHtml(a.type)}</td><td>${fmt(a.value)}</td></tr>`).join('')
    : '<tr><td colspan="4">Δεν έχουν καταχωρηθεί ακίνητα.</td></tr>'

  const creditorSections = creditors.map((c, idx) => {
    const pct = c.amount > 0 ? Math.round((c.writeoff / c.amount) * 100) : 0
    const showStepUp = c.c1 != null && c.c2 != null && c.c1 !== c.c2
    const payText = showStepUp
      ? `Δόση Έτη 1–3: <b>${fmt(c.c1)}</b> · Δόση Έτη 4+: <b>${fmt(c.c2)}</b>`
      : `Μηνιαία δόση: <b>${c.monthlyPay > 0 ? fmt(c.monthlyPay) : '—'}</b>`
    return `<div style="margin-top:20px"><h3 style="color:#004aad">6.${idx + 1}. ${escHtml(c.creditor)}</h3><p>Για την απαίτηση <b>${escHtml(c.creditor)}</b> (${fmt(c.amount)}), προτείνεται απομείωση <b>${fmt(c.writeoff)}${c.writeoff > 0 ? ` (${pct}%)` : ''}</b> και ρύθμιση υπολοίπου <b>${fmt(c.remaining)}</b> σε <b>${c.months}</b> μηνιαίες δόσεις. ${payText}.</p></div>`
  }).join('')

  // Visual charts
  const debtByCreditor = creditors.map((c) => ({ label: c.creditor, value: c.amount }))
  const incomeDistItems = [
    { label: 'Δόση', value: totalMonthlyPay, color: '#004aad' },
    { label: 'Υπόλοιπο', value: Math.max(0, dispMonthly - totalMonthlyPay), color: '#16a34a' },
  ]
  const beforeAfterItems = [
    { label: 'Οφειλή', value: totalDebt, color: '#64748b' },
    { label: 'Υπόλοιπο', value: totalRemaining, color: '#004aad' },
    { label: 'Διαγραφή', value: totalWriteOff, color: '#ff9f1a' },
  ]

  const th = (s) => `<th style="background:#e8f0ff;color:#004aad;padding:10px;border:1px solid #d2def8;font-size:14px;">${s}</th>`
  const td = (s) => `<td style="padding:10px;border:1px solid #e2e8f4;text-align:left;vertical-align:top;background:#fff;">${s}</td>`

  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;max-width:1100px;margin:0 auto;">
  <div style="display:flex;justify-content:space-between;background:#eaf1ff;border:1px solid #d7e3ff;color:#0b3a82;border-radius:10px;padding:10px 14px;margin-bottom:18px;font-size:14px;">
    <b>i-Mentor Consulting</b>
    <span>www.i-mentor.gr • info@i-mentor.gr • 2810 363007</span>
  </div>
  <h2 style="color:#004aad;">ΣΧΕΔΙΟ ΑΝΑΔΙΑΡΘΡΩΣΗΣ ΟΦΕΙΛΩΝ — Εξωδικαστικός Μηχανισμός</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:14px 0 18px;">
    <div style="background:#f7faff;border:1px solid #d9e6ff;border-radius:10px;padding:10px 12px;"><b>Οφειλέτης</b><br>${escHtml(clientName)}</div>
    <div style="background:#f7faff;border:1px solid #d9e6ff;border-radius:10px;padding:10px 12px;"><b>Τύπος</b><br>${escHtml(debtorType)}</div>
    <div style="background:#f7faff;border:1px solid #d9e6ff;border-radius:10px;padding:10px 12px;"><b>Ημερομηνία</b><br>${today}</div>
    <div style="background:#f7faff;border:1px solid #d9e6ff;border-radius:10px;padding:10px 12px;"><b>Επικοινωνία</b><br>${escHtml(clientPhone)}${clientEmail ? '<br>' + escHtml(clientEmail) : ''}</div>
  </div>

  ${isVulnerable ? `<div style="background:#f0fdfa;border:2px solid #2dd4bf;border-radius:10px;padding:14px 16px;margin-bottom:18px;"><div style="font-size:17px;font-weight:900;color:#0f766e;margin-bottom:8px;">🛡️ ΕΥΑΛΩΤΟΣ ΟΦΕΙΛΕΤΗΣ</div><p style="margin:0 0 8px;color:#115e59;font-size:14px;">Με βάση τη βεβαίωση ευάλωτου οφειλέτη (περ. β΄ άρθρου 217 ν. 4738/2020), ισχύουν οι ευνοϊκές διατάξεις του <b>άρθρου 66 ν. 5072/2023</b>:</p><ul style="margin:0;padding-left:20px;color:#134e4a;font-size:13px;line-height:1.8;"><li><b>Τεκμαιρόμενη συναίνεση</b> όλων των πιστωτών (τράπεζες, Δημόσιο, ΦΚΑ)</li><li><b>Υποχρεωτική αποδοχή</b> πρότασης εφόσον πληρούνται οι προϋποθέσεις ΚΥΑ</li></ul></div>` : ''}

  <h3 style="color:#004aad;">1. Περίληψη</h3>
  ${hasConservative ? `<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:8px 12px;border-radius:6px;font-size:13px;color:#78350f;margin-bottom:10px;">Τα ποσά εμφανίζονται ως εύρος: <b>Συντηρητικό – Θεωρητικό Μέγιστο</b> βάσει ΚΥΑ 13243/2024.</div>` : ''}
  <div style="background:#f7fbff;border-left:4px solid #004aad;padding:12px 14px;border-radius:8px;margin-bottom:18px;">
    Συνολική οφειλή: <b>${fmt(totalDebt)}</b> | Διαγραφή: <b>${planRng(totalWriteOffC, totalWriteOff)}</b> | Υπόλοιπο: <b>${planRng(totalRemainingC, totalRemaining)}</b> | Μηνιαία δόση: <b>${hasStepUp ? planRng(totalC1C, totalC1) + ' (Έτη 1–3) / ' + planRng(totalMonthlyPayC, totalMonthlyPay) + ' (Έτη 4+)' : planRng(totalMonthlyPayC, totalMonthlyPay)}</b>
  </div>

  <h3 style="color:#004aad;">2. Οικονομική εικόνα</h3>
  <table style="width:100%;border-collapse:collapse;margin-top:12px;">
    <thead><tr>${th('Στοιχείο')}${th('Τιμή')}${th('Παρατήρηση')}</tr></thead>
    <tbody>${incomeRows || `<tr>${td('—')}${td('—')}${td('—')}</tr>`}</tbody>
  </table>
  <div style="background:#eef5ff;border-left:4px solid #0070e8;padding:12px 14px;border-radius:8px;margin-top:12px;">
    Διαθέσιμο: <b>${fmt(dispMonthly)}</b> / μήνα • <b>${fmt(dispAnnual)}</b> / έτος
  </div>

  <h3 style="color:#004aad;margin-top:24px;">3. Περιουσιακή εικόνα</h3>
  <table style="width:100%;border-collapse:collapse;margin-top:12px;">
    <thead><tr>${th('#')}${th('Περιγραφή')}${th('Κατηγορία')}${th('Αξία')}</tr></thead>
    <tbody>${propRows}</tbody>
  </table>
  ${totalRealEstateValue > 0 ? `<div style="background:#eef5ff;border-left:4px solid #0070e8;padding:12px 14px;border-radius:8px;margin-top:12px;">Συνολική αξία ακινήτων: <b>${fmt(totalRealEstateValue)}</b></div>` : ''}

  <h3 style="color:#004aad;margin-top:24px;">4. Οπτική αποτύπωση</h3>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-top:14px;">
    ${renderDonutChart('Κατανομή μηνιαίου εισοδήματος', incomeDistItems, 'Μηνιαία βάση', fmt(dispMonthly), 'Πώς κατανέμεται το εισόδημα μεταξύ δόσης και υπολοίπου.')}
    ${renderCompareBars('Πριν και μετά τη ρύθμιση', beforeAfterItems, 'Σύγκριση συνολικής οφειλής, υπολοίπου και διαγραφής.')}
    ${renderHorizontalBars('Δομή οφειλών ανά πιστωτή', debtByCreditor, 'Κατανομή χρέους ανά πιστωτή.')}
  </div>

  <h3 style="color:#004aad;margin-top:24px;">5. Stress Test</h3>
  <table style="width:100%;border-collapse:collapse;margin-top:12px;">
    <thead><tr>${th('Δείκτης')}${th('Βασικό')}${th('Stress -10%')}</tr></thead>
    <tbody>
      <tr>${td('Διαθέσιμο μηνιαίο ποσό')}${td(fmt(baseMonthly))}${td(fmt(stressedMonthly))}</tr>
      <tr>${td('Προτεινόμενη μηνιαία δόση')}${td(fmt(totalMonthlyPay))}${td(fmt(totalMonthlyPay))}</tr>
      <tr>${td('Υπόλοιπο')}${td(fmt(bufferBase))}${td(fmt(bufferStress))}</tr>
      <tr>${td('Επιβάρυνση %')}${td(baseRatio + '%')}${td(stressRatio + '%')}</tr>
    </tbody>
  </table>

  <h3 style="color:#004aad;margin-top:24px;">6. Συνοπτική πρόταση ανά πιστωτή</h3>
  ${hasStepUp ? `<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:8px 12px;border-radius:6px;font-size:13px;color:#78350f;margin-bottom:10px;">Δόσεις βάσει step-up επιτοκίου ΚΥΑ 13243/2024 — Έτη 1–3: προωθητικό επιτόκιο · Έτη 4+: Euribor + spread</div>` : ''}
  <table style="width:100%;border-collapse:collapse;margin-top:12px;">
    <thead><tr>${th('Πιστωτής')}${th('Αρχική')}${th('Διαγραφή')}${th('Υπόλοιπο')}${th('Δόσεις')}${hasStepUp ? th('Δόση Έτη 1–3') + th('Δόση Έτη 4+') : th('Μηνιαία')}</tr></thead>
    <tbody>
      ${summaryRows}
      <tr style="background:#eef5ff;font-weight:700;"><td style="padding:10px;border:1px solid #d2def8;"><b>ΣΥΝΟΛΟ</b></td><td style="padding:10px;border:1px solid #d2def8;">${fmt(totalDebt)}</td><td style="padding:10px;border:1px solid #d2def8;">${planRng(totalWriteOffC, totalWriteOff)}</td><td style="padding:10px;border:1px solid #d2def8;">${planRng(totalRemainingC, totalRemaining)}</td><td style="padding:10px;border:1px solid #d2def8;">—</td>${hasStepUp ? `<td style="padding:10px;border:1px solid #d2def8;">${planRng(totalC1C, totalC1)}</td><td style="padding:10px;border:1px solid #d2def8;font-weight:800;">${planRng(totalMonthlyPayC, totalMonthlyPay)}</td>` : `<td style="padding:10px;border:1px solid #d2def8;">${planRng(totalMonthlyPayC, totalMonthlyPay)}</td>`}</tr>
    </tbody>
  </table>

  ${creditorSections}

  ${excludedCreditors.length > 0 ? `
  <h3 style="color:#b91c1c;margin-top:24px;">⚠️ Πιστωτές που ζητείται να ΑΠΟΣΥΡΘΟΥΝ από τη Ρύθμιση</h3>
  <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:10px;padding:16px;margin-top:12px;">
    <p style="font-weight:700;color:#991b1b;margin:0 0 10px;">Για τους παρακάτω πιστωτές αιτούμαστε ΑΠΟΣΥΡΣΗ και ΜΗ ΣΥΜΜΕΤΟΧΗ στον Εξωδικαστικό Μηχανισμό Ρύθμισης:</p>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>${th('Πιστωτής')}${th('Ποσό')}${th('Σημείωση')}</tr></thead>
      <tbody>
        ${excludedCreditors.map((c) => `<tr><td style="padding:10px;border:1px solid #fca5a5;font-weight:700;color:#991b1b;">${escHtml(c.creditor)}</td><td style="padding:10px;border:1px solid #fca5a5;font-family:monospace;">${fmt(c.amount)}</td><td style="padding:10px;border:1px solid #fca5a5;color:#7f1d1d;font-style:italic;">Αιτείται ΑΠΟΣΥΡΣΗ — δεν συμμετέχει στην πρόταση ρύθμισης μέσω Εξωδικαστικού</td></tr>`).join('')}
      </tbody>
    </table>
    <p style="margin:12px 0 0;font-size:13px;color:#991b1b;">Η συγκεκριμένη/-ες τράπεζα/-ες ή πιστωτής/-ές δημιουργεί/-ούν επιπρόσθετη επιβάρυνση <b>${fmt(excludedCreditors.reduce((a,c)=>a+c.amount,0))}</b> η οποία δεν εντάσσεται στο παρόν σχέδιο ρύθμισης. Αιτούμαστε να μην συμμετάσχουν στη διαδικασία και να αποσυρθούν από τον εξωδικαστικό μηχανισμό.</p>
  </div>` : ''}

  <h3 style="color:#004aad;margin-top:24px;">7. Συμπεράσματα</h3>
  <p>Η προτεινόμενη ρύθμιση αποτελεί αναγκαία προϋπόθεση για τη ρεαλιστική εξυπηρέτηση των οφειλών προς τους πιστωτές. Βάσει της ανάλυσης, το ποσό που μπορεί να διατεθεί για εξυπηρέτηση χρέους ανέρχεται έως <b>${fmt(dispMonthly)}</b> μηνιαίως, η συνολική αρχική οφειλή ανέρχεται σε <b>${fmt(totalDebt)}</b>, η συνολική προτεινόμενη απομείωση σε <b>${planRng(totalWriteOffC, totalWriteOff)}</b>, το υπόλοιπο προς ρύθμιση σε <b>${planRng(totalRemainingC, totalRemaining)}</b> και η συνολική εκτιμώμενη μηνιαία επιβάρυνση σε <b>${planRng(totalMonthlyPayC, totalMonthlyPay)}</b>.${totalRealEstateValue > 0 ? ` Η συνολική καταγεγραμμένη αξία ακίνητης περιουσίας ανέρχεται σε <b>${fmt(totalRealEstateValue)}</b> και η πρόταση δύναται να περιλαμβάνει το τμήμα των απαιτήσεων που υπερβαίνει την αξία κάλυψης/ρευστοποίησης της περιουσίας αυτής.` : ''} Η αποδοχή του παρόντος σχεδίου από τους πιστωτές ενισχύει την πιθανότητα ομαλής και συστηματικής αποπληρωμής των απαιτήσεών τους.</p>
  <div style="background:#eef5ff;border-left:4px solid #0070e8;padding:12px 14px;border-radius:8px;margin-top:12px;">
    Συνολική μηνιαία δόση προς όλους τους πιστωτές: <b>${planRng(totalMonthlyPayC, totalMonthlyPay)}</b>${dispMonthly > 0 ? ` • Εκτιμώμενη επιβάρυνση: <b>${totalRatio}%</b>` : ''}.
  </div>
  ${hasConservative ? `<div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:12px 14px;margin-top:16px;font-size:12px;color:#78350f;"><b>Σημείωση εύρους σεναρίων:</b> Τα ποσά εμφανίζονται ως εύρος «Συντηρητικό – Θεωρητικό». Το συντηρητικό σενάριο εφαρμόζει εμπειρικούς συντελεστές μείωσης των διαγραφών (εξασφαλισμένα τραπεζικά ×0,65, ανεξασφάλιστα τραπεζικά ×0,75, δημόσιο ×1,00) για να προσομοιωθεί η τυπική παρέμβαση του Συντονιστή Πιστωτή βάσει ΚΥΑ 77697/2021 §3.4. Τα ποσά αποτελούν εκτίμηση και δεν αποτελούν νομική συμβουλή ή εγγύηση αποτελέσματος.</div>` : ''}
</div>`
}

// ============================================================
// Wrap plan HTML in a printable window document
// ============================================================
export function wrapPlanDocument(innerHtml) {
  return `<!DOCTYPE html><html lang="el"><head><meta charset="UTF-8"><title>Σχέδιο Αναδιάρθρωσης</title>
<style>
body{font-family:"Segoe UI",Arial,sans-serif;background:#f4f7ff;margin:0;padding:28px}
.wrapper{max-width:1100px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 8px 24px rgba(0,0,0,.07)}
.topBar{display:flex;justify-content:flex-end;gap:10px;margin-bottom:14px;}
.btn{background:#004aad;color:#fff;border:none;padding:10px 18px;border-radius:9px;font-weight:700;cursor:pointer;}
.btn.sec{background:#eef5ff;color:#004aad;border:1px solid #d7e3ff;}
@media print{.topBar{display:none}}
</style></head><body>
<div class="wrapper">
  <div class="topBar">
    <button class="btn sec" onclick="window.print()">🖨️ Εκτύπωση</button>
    <button class="btn" id="copyBtn">✍️ Αντιγραφή σε Word</button>
  </div>
  <div id="planContent">${innerHtml}</div>
</div>
<script>
document.getElementById('copyBtn').addEventListener('click', async () => {
  const target = document.getElementById('planContent');
  try {
    await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([target.innerHTML], {type:'text/html'}),'text/plain': new Blob([target.innerText], {type:'text/plain'})})]);
    alert('✅ Αντιγράφηκε! Κάντε Ctrl+V στο Word.');
  } catch {
    const r = document.createRange(); r.selectNodeContents(target);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('copy'); s.removeAllRanges();
    alert('✅ Αντιγράφηκε (απλό κείμενο).');
  }
});
<\/script></body></html>`
}

// ============================================================
// Build email HTML
// ============================================================
export function buildEmailHtml(data) {
  const { clientName, debtorType, totalDebt, totalWriteOff, totalRemaining, totalMonthlyPay, dispMonthly, creditors, bankDebt, taxDebt, insDebt, forecastTitle, forecastSections, commercialOffer, showTable = true, showDisclaimer = true, portalUrl = null, hasVat = false, nonErasableTotal = 0, isVulnerable = false, totalWriteOffC, totalRemainingC, totalMonthlyPayC, totalC1C, incomeData = {}, assets = [], dispAnnual = 0, totalExpenses = 0 } = data

  const hasStepUp = (creditors || []).some((c) => c.c1 != null && c.c2 != null && c.c1 !== c.c2)
  const totalC1 = (creditors || []).reduce((s, c) => s + (c.c1 || c.monthlyPay || 0), 0)
  const hasConservative = !isVulnerable && totalWriteOffC != null
  const TD = 'padding:8px;border:1px solid #d9e2ef;text-align:center;'

  const rows = creditors.map((c) => {
    const pct = c.amount > 0 ? Math.round((c.writeoff / c.amount) * 100) : 0
    const pctC = hasConservative && c.amount > 0 ? Math.round(((c.writeoffC ?? c.writeoff) / c.amount) * 100) : null
    const wrText = c.writeoff > 0
      ? (hasConservative ? `${planRng(c.writeoffC, c.writeoff)} (${pctC != null && pctC !== pct ? `${Math.min(pctC, pct)}%–${Math.max(pctC, pct)}%` : `${pct}%`})` : `${fmt(c.writeoff)} (${pct}%)`)
      : '—'
    const remText = hasConservative ? planRng(c.remainingC, c.remaining) : fmt(c.remaining)
    const payCell = hasStepUp
      ? `<td style="${TD}">${hasConservative ? planRng(c.c1C, c.c1 || c.monthlyPay) : (c.c1 > 0 ? fmt(c.c1) : '—')}</td><td style="${TD}font-weight:700;color:#1d4ed8;">${hasConservative ? planRng(c.c2C, c.c2 || c.monthlyPay) : (c.c2 > 0 ? fmt(c.c2) : '—')}</td>`
      : `<td style="${TD}">${hasConservative ? planRng(c.c2C, c.monthlyPay) : (c.monthlyPay > 0 ? fmt(c.monthlyPay) : '—')}</td>`
    return `<tr>
      <td style="${TD}">${escHtml(c.creditor)}</td>
      <td style="${TD}">${fmt(c.amount)}</td>
      <td style="${TD}">${wrText}</td>
      <td style="${TD}">${remText}</td>
      <td style="${TD}">${c.months || 0}</td>
      ${payCell}
    </tr>`
  }).join('')

  const forecastHtml = forecastSections && forecastSections.length > 0
    ? `<p style="margin-top:20px;font-size:16px;"><b>🔮 ${escHtml(forecastTitle || 'Πρόβλεψη Ρύθμισης')}</b></p>
       <div style="margin-top:10px;">
         ${forecastSections.map((s) => `
           <div style="margin-bottom:8px;padding:12px 14px;background:${s.type === 'success' ? '#f0fdf4' : '#eff6ff'};border-left:4px solid ${s.type === 'success' ? '#16a34a' : '#3b82f6'};border-radius:6px;font-size:14px;line-height:1.6;">
             <div style="font-weight:700;margin-bottom:4px;">${escHtml(s.icon)} ${escHtml(s.label)}</div>
             <div style="white-space:pre-line;">${escHtml(s.body)}</div>
           </div>`).join('')}
       </div>`
    : ''

  // Icon badge helper — works across Gmail/Outlook/Apple Mail
  const badge = (symbol, color, bg) =>
    `<span style="display:inline-block;background:${bg};border:1px solid ${color}33;border-radius:6px;padding:1px 8px;color:${color};font-size:13px;font-weight:700;vertical-align:middle;margin-right:6px;">${symbol}</span>`

  // VAT offer helper
  const fmtOffer = (net) => {
    if (!net) return '<span style="color:#6b7280;">..... €</span> <span style="font-size:12px;color:#9ca3af;">+ ΦΠΑ 24%</span>'
    const n = Number(net)
    const gross = Math.round(n * 1.24)
    return `<b>${n.toLocaleString('el-GR')}€</b> <span style="font-size:12px;color:#6b7280;">+ ΦΠΑ 24% = ${gross.toLocaleString('el-GR')}€</span>`
  }

  const hasOffer = commercialOffer && (commercialOffer.application_fee || commercialOffer.success_fee)

  const HOUSEHOLD_OPTS = [[6448,'Ένας ενήλικας'],[10866,'Δύο ενήλικες'],[9096,'Ένας ενήλικας με 1 τέκνο'],[13514,'Δύο ενήλικες με 1 τέκνο'],[16162,'Δύο ενήλικες με 2 τέκνα'],[18659,'Δύο ενήλικες με 2 τέκνα + εξαρτ.'],[18810,'Δύο ενήλικες με 3 τέκνα'],[21307,'Δύο ενήλικες με 3 τέκνα + εξαρτ.'],[21458,'Δύο ενήλικες με 4 τέκνα']]
  const hhLabel = HOUSEHOLD_OPTS.find(o => o[0] === incomeData.householdValue)?.[1] || ''
  const isLegal = debtorType?.includes('Νομικό')

  const GI = 'padding:4px 0;font-size:13px;'
  const le3Year = incomeData.ke_t1 > 0 || incomeData.ke_t2 > 0 || incomeData.ke_t3 > 0
  const leAnyTurnover = le3Year || incomeData.turnover > 0
  const emailFpSubType = incomeData.fpSubType
  const emailFpSE = !isLegal && emailFpSubType === 'Επιτηδευματίας'
  const emailFpEmp = !isLegal && (emailFpSubType === 'Μισθωτός' || (!emailFpSubType && !isLegal))
  const fpHasIncome = emailFpEmp
    ? (incomeData.fp_income_t1 > 0 || incomeData.fp_income_t2 > 0 || incomeData.fp_income_t3 > 0 || incomeData.annualIncome > 0)
    : emailFpSE
      ? (incomeData.fp_ebitda_t1 != null || incomeData.fp_ke_t1 > 0)
      : false

  const fpExpensesHtml = (incomeData.householdValue > 0 || incomeData.enfiaCost > 0 || incomeData.medicalCost > 0 || incomeData.rentCost > 0 || incomeData.studentRentCost > 0 || incomeData.extraLivingCost > 0 || incomeData.alimonyCost > 0) ? `
    <div style="border-top:1px solid #e2eaf8;padding-top:10px;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Νοικοκυριό &amp; Δαπάνες</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">
        ${incomeData.householdValue > 0 ? `<div style="${GI}"><span style="color:#64748b;">Εύλογες δαπάνες${hhLabel ? ` (${escHtml(hhLabel)})` : ''}:</span> <b>${fmt(incomeData.householdValue)}</b></div>` : ''}
        ${incomeData.enfiaCost > 0 ? `<div style="${GI}"><span style="color:#64748b;">ΕΝΦΙΑ:</span> <b>${fmt(incomeData.enfiaCost)}</b></div>` : ''}
        ${incomeData.medicalCost > 0 ? `<div style="${GI}"><span style="color:#64748b;">Ιατρικές δαπάνες:</span> <b>${fmt(incomeData.medicalCost)}</b></div>` : ''}
        ${incomeData.rentCost > 0 ? `<div style="${GI}"><span style="color:#64748b;">Ενοίκιο:</span> <b>${fmt(incomeData.rentCost)}</b></div>` : ''}
        ${incomeData.studentRentCost > 0 ? `<div style="${GI}"><span style="color:#64748b;">Ενοίκιο φοιτητών:</span> <b>${fmt(incomeData.studentRentCost)}</b></div>` : ''}
        ${incomeData.extraLivingCost > 0 ? `<div style="${GI}"><span style="color:#64748b;">Πρόσθετη διατροφή:</span> <b>${fmt(incomeData.extraLivingCost)}</b></div>` : ''}
        ${incomeData.alimonyCost > 0 ? `<div style="${GI}"><span style="color:#64748b;">Διατροφή (διαζύγιο):</span> <b>${fmt(incomeData.alimonyCost)}</b></div>` : ''}
        ${totalExpenses > 0 ? `<div style="${GI};grid-column:1/-1;font-weight:700;"><span style="color:#64748b;">Σύνολο δαπανών:</span> <b>${fmt(totalExpenses)}</b></div>` : ''}
      </div>
    </div>` : ''

  const incomeSectionHtml = (dispMonthly > 0 || fpHasIncome || leAnyTurnover) ? `
  <p style="margin:14px 0 6px;">${badge('💶', '#1d4ed8', '#eff6ff')}<b style="font-size:15px;color:#1e3a5f;">Εισοδηματική &amp; Περιουσιακή Εικόνα</b></p>
  <div style="background:#f8faff;border:1px solid #dde7fb;border-radius:10px;padding:14px 16px;margin-bottom:14px;font-size:14px;">
    ${isLegal ? `
    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Οικονομικά Στοιχεία</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 12px;margin-bottom:8px;">
      ${le3Year ? `
      <div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">ΚΕ Τ-1 (Ε3/500):</span> <b>${fmt(incomeData.ke_t1)}</b></div>
      <div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">ΚΕ Τ-2:</span> <b>${fmt(incomeData.ke_t2 || 0)}</b></div>
      <div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">ΚΕ Τ-3:</span> <b>${fmt(incomeData.ke_t3 || 0)}</b></div>
      ${incomeData.kerdh_t1 != null ? `<div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">Κέρδη/Ζημιές Τ-1:</span> <b>${fmt(incomeData.kerdh_t1)}</b></div>` : ''}
      ${incomeData.kerdh_t2 != null ? `<div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">Κέρδη/Ζημιές Τ-2:</span> <b>${fmt(incomeData.kerdh_t2)}</b></div>` : ''}
      ${incomeData.kerdh_t3 != null ? `<div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">Κέρδη/Ζημιές Τ-3:</span> <b>${fmt(incomeData.kerdh_t3)}</b></div>` : ''}
      ` : `
      ${incomeData.turnover > 0 ? `<div style="${GI}"><span style="color:#64748b;">Κύκλος εργασιών:</span> <b>${fmt(incomeData.turnover)}</b></div>` : ''}
      ${incomeData.ebitda > 0 ? `<div style="${GI}"><span style="color:#64748b;">EBITDA:</span> <b>${fmt(incomeData.ebitda)}</b></div>` : ''}
      `}
    </div>
    <div style="${GI}">
      ${dispMonthly > 0 ? `<span style="color:#64748b;">Μηνιαίο διαθέσιμο:</span> <b style="color:#1d4ed8;">${fmt(dispMonthly)}</b>` : ''}
    </div>` : emailFpSE ? `
    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Επιτηδευματίας — Στοιχεία Επιχείρησης</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 12px;margin-bottom:8px;">
      ${incomeData.fp_ebitda_t1 != null ? `<div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">EBITDA Τ:</span> <b>${fmt(incomeData.fp_ebitda_t1)}</b></div>` : ''}
      ${incomeData.fp_ebitda_t2 != null ? `<div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">EBITDA Τ-1:</span> <b>${fmt(incomeData.fp_ebitda_t2)}</b></div>` : ''}
      ${incomeData.fp_ebitda_t3 != null ? `<div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">EBITDA Τ-2:</span> <b>${fmt(incomeData.fp_ebitda_t3)}</b></div>` : ''}
      ${incomeData.fp_tax_t1 > 0 ? `<div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">Φόρος Τ:</span> <b>${fmt(incomeData.fp_tax_t1)}</b></div>` : ''}
      ${incomeData.fp_tax_t2 > 0 ? `<div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">Φόρος Τ-1:</span> <b>${fmt(incomeData.fp_tax_t2)}</b></div>` : ''}
      ${incomeData.fp_e1outside_t1 > 0 ? `<div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">Ε1 εκτός Τ:</span> <b>${fmt(incomeData.fp_e1outside_t1)}</b></div>` : ''}
      ${incomeData.fp_ke_t1 > 0 ? `<div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">ΚΕ Τ:</span> <b>${fmt(incomeData.fp_ke_t1)}</b></div>` : ''}
    </div>
    <div style="${GI};margin-bottom:8px;">
      ${dispAnnual > 0 ? `<span style="color:#64748b;">Διαθέσιμο (×80%, Μ.Ο.):</span> <b style="color:#1d4ed8;">${fmt(dispAnnual)}</b>` : ''}
      ${dispMonthly > 0 ? ` &nbsp;·&nbsp; <span style="color:#64748b;">Μηνιαίο:</span> <b style="color:#1d4ed8;font-size:15px;">${fmt(dispMonthly)}</b>` : ''}
    </div>
    ${fpExpensesHtml}` : `
    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Εισοδήματα — Μισθωτός / Συνταξιούχος</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 12px;margin-bottom:8px;">
      ${incomeData.fp_income_t1 > 0 ? `<div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">Εισόδημα Τ:</span> <b>${fmt(incomeData.fp_income_t1)}</b></div>` : ''}
      ${incomeData.fp_income_t2 > 0 ? `<div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">Εισόδημα Τ-1:</span> <b>${fmt(incomeData.fp_income_t2)}</b></div>` : ''}
      ${incomeData.fp_income_t3 > 0 ? `<div style="${GI}"><span style="color:#64748b;display:block;font-size:11px;">Εισόδημα Τ-2:</span> <b>${fmt(incomeData.fp_income_t3)}</b></div>` : ''}
      ${!incomeData.fp_income_t1 && incomeData.annualIncome > 0 ? `<div style="${GI}"><span style="color:#64748b;">Ετήσιο εισόδημα:</span> <b>${fmt(incomeData.annualIncome)}</b></div>` : ''}
    </div>
    <div style="${GI};margin-bottom:8px;">
      ${dispAnnual > 0 ? `<span style="color:#64748b;">Διαθέσιμο (×80%):</span> <b style="color:#1d4ed8;">${fmt(dispAnnual)}</b>` : ''}
      ${dispMonthly > 0 ? ` &nbsp;·&nbsp; <span style="color:#64748b;">Μηνιαίο:</span> <b style="color:#1d4ed8;font-size:15px;">${fmt(dispMonthly)}</b>` : ''}
    </div>
    ${fpExpensesHtml}`}
    ${assets && assets.length > 0 ? `
    <div style="border-top:1px solid #e2eaf8;padding-top:10px;margin-top:10px;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Ακίνητα &amp; Περιουσία</div>
      <table style="width:100%;border-collapse:collapse;">
        ${assets.map((a) => `<tr><td style="${GI}color:#374151;">${escHtml(a.description || a.type || '')}</td><td style="${GI}text-align:right;font-weight:700;">${fmt(a.value)}</td></tr>`).join('')}
      </table>
    </div>` : ''}
  </div>` : ''

  return `<div id="emailContent" style="font-family:Calibri,Arial,sans-serif;color:#1a1a1a;line-height:1.6;font-size:15px;">
  <p>Αγαπητέ/ή ${escHtml(clientName)},</p>
  <p>Η ομάδα της <b>i-Mentor Consulting</b> ολοκλήρωσε την ανάλυση και παρουσιάζει τα αποτελέσματα της <b>Θεωρητικής Προσομοίωσης Εξωδικαστικού Μηχανισμού</b>.</p>
  <hr style="border:none;border-top:2px solid #e0e7ff;margin:18px 0;">

  <p style="margin:0 0 6px;">${badge('⚖', '#4338ca', '#eef2ff')}<b style="font-size:16px;color:#1e3a5f;">Σύνολο Οφειλών: ${fmt(totalDebt)}</b></p>
  <table style="border-collapse:collapse;width:100%;font-size:14px;margin:8px 0 16px;">
    ${bankDebt > 0 ? `<tr><td style="padding:4px 12px;color:#374151;">Τράπεζες</td><td style="padding:4px 12px;font-weight:700;text-align:right;">${fmt(bankDebt)}</td></tr>` : ''}
    ${insDebt > 0 ? `<tr><td style="padding:4px 12px;color:#374151;">Ασφαλιστικά Ταμεία</td><td style="padding:4px 12px;font-weight:700;text-align:right;">${fmt(insDebt)}</td></tr>` : ''}
    ${taxDebt > 0 ? `<tr><td style="padding:4px 12px;color:#374151;">ΑΑΔΕ / Εφορία</td><td style="padding:4px 12px;font-weight:700;text-align:right;">${fmt(taxDebt)}</td></tr>` : ''}
    ${dispMonthly > 0 ? `<tr style="border-top:1px solid #e0e7ff;"><td style="padding:6px 12px;color:#374151;">Μηνιαίο Διαθέσιμο Εισόδημα</td><td style="padding:6px 12px;font-weight:700;color:#1d4ed8;text-align:right;">${fmt(dispMonthly)}</td></tr>` : ''}
  </table>

  ${incomeSectionHtml}

  ${showTable ? `${hasConservative ? `<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:8px 12px;border-radius:6px;font-size:13px;color:#78350f;margin-bottom:8px;">Τα ποσά εμφανίζονται ως εύρος: <b>Συντηρητικό – Θεωρητικό Μέγιστο</b> βάσει ΚΥΑ 13243/2024.</div>` : ''}<p style="margin:0 0 8px;">${badge('◎', '#059669', '#ecfdf5')}<b style="font-size:16px;color:#1e3a5f;">Εκτιμώμενο Θεωρητικό Αποτέλεσμα Ρύθμισης</b></p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:10px;">
    <thead>
      <tr style="background:#1e3a8a;color:#fff;text-align:center;">
        <th style="padding:8px 10px;border:1px solid #1e3a8a;">Πιστωτής</th>
        <th style="padding:8px 10px;border:1px solid #1e3a8a;">Αρχική Οφειλή</th>
        <th style="padding:8px 10px;border:1px solid #1e3a8a;">Εκτ. Διαγραφή</th>
        <th style="padding:8px 10px;border:1px solid #1e3a8a;">Εναπομένουσα</th>
        <th style="padding:8px 10px;border:1px solid #1e3a8a;">Μήνες</th>
        ${hasStepUp
          ? `<th style="padding:8px 10px;border:1px solid #1e3a8a;">Δόση Έτη 1–3</th><th style="padding:8px 10px;border:1px solid #1e3a8a;">Δόση Έτη 4+</th>`
          : `<th style="padding:8px 10px;border:1px solid #1e3a8a;">Μηνιαία Δόση</th>`}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr style="background:#eef2ff;font-weight:700;">
        <td style="padding:8px 10px;border:1px solid #c7d2fe;">ΣΥΝΟΛΟ</td>
        <td style="padding:8px 10px;border:1px solid #c7d2fe;text-align:center;">${fmt(totalDebt)}</td>
        <td style="padding:8px 10px;border:1px solid #c7d2fe;text-align:center;color:#c2410c;">${planRng(hasConservative ? totalWriteOffC : null, totalWriteOff)}</td>
        <td style="padding:8px 10px;border:1px solid #c7d2fe;text-align:center;">${planRng(hasConservative ? totalRemainingC : null, totalRemaining)}</td>
        <td style="padding:8px 10px;border:1px solid #c7d2fe;text-align:center;">—</td>
        ${hasStepUp
          ? `<td style="padding:8px 10px;border:1px solid #c7d2fe;text-align:center;color:#2563eb;">${planRng(hasConservative ? totalC1C : null, totalC1)}</td><td style="padding:8px 10px;border:1px solid #c7d2fe;text-align:center;color:#1d4ed8;font-weight:800;">${planRng(hasConservative ? totalMonthlyPayC : null, totalMonthlyPay)}</td>`
          : `<td style="padding:8px 10px;border:1px solid #c7d2fe;text-align:center;color:#1d4ed8;">${planRng(hasConservative ? totalMonthlyPayC : null, totalMonthlyPay)}</td>`}
      </tr>
    </tfoot>
  </table>` : ''}
  ${showDisclaimer ? `<div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 6px 6px 0;padding:10px 14px;font-size:13px;color:#78350f;margin-bottom:16px;">
    <b>ΣΗΜΑΝΤΙΚΗ ΕΠΙΣΗΜΑΝΣΗ:</b> Τα παραπάνω αποτελέσματα αποτελούν <b>θεωρητική εκτίμηση</b> βάσει των στοιχείων που δηλώθηκαν και του αλγορίθμου του Εξωδικαστικού Μηχανισμού. Δεν αποτελούν δέσμευση ούτε εγγύηση αποτελέσματος.
  </div>` : ''}
  ${nonErasableTotal > 0 ? `<div style="margin-bottom:16px;padding:10px 14px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:0 6px 6px 0;font-size:13px;color:#991b1b;">
    <b>⚠️ Μη Διαγράψιμα Ποσά — ${fmt(nonErasableTotal)}:</b> Βασικές οφειλές παρακρατούμενων/επιρριπτόμενων φόρων (ΦΠΑ, ΦΜΥ) και εισφορών ΕΦΚΑ δεν επιτρέπεται να διαγραφούν βάσει ΚΥΑ 13243/2024. Καταβάλλονται στο ακέραιο (${fmt(nonErasableTotal)}) και δεν συνυπολογίζονται στις εκτιμώμενες διαγραφές.
  </div>` : ''}
  ${isVulnerable ? `<div style="background:#f0fdfa;border:2px solid #2dd4bf;border-radius:10px;padding:14px 16px;margin-bottom:16px;"><div style="font-size:17px;font-weight:900;color:#0f766e;margin-bottom:8px;">🛡️ ΕΥΑΛΩΤΟΣ ΟΦΕΙΛΕΤΗΣ</div><p style="margin:0 0 8px;color:#115e59;font-size:14px;">Με βάση τη βεβαίωση ευάλωτου οφειλέτη (περ. β΄ άρθρου 217 ν. 4738/2020), ισχύουν οι ευνοϊκές διατάξεις του <b>άρθρου 66 ν. 5072/2023</b>:</p><ul style="margin:0;padding-left:20px;color:#134e4a;font-size:13px;line-height:1.8;"><li><b>Τεκμαιρόμενη συναίνεση</b> όλων των πιστωτών (τράπεζες, Δημόσιο, ΦΚΑ)</li><li><b>Υποχρεωτική αποδοχή</b> πρότασης εφόσον πληρούνται οι προϋποθέσεις ΚΥΑ</li></ul></div>` : ''}
  ${forecastHtml}
  <hr style="border:none;border-top:2px solid #e0e7ff;margin:18px 0;">

  <div style="border:2px solid #3b82f6;border-radius:10px;padding:0;overflow:hidden;margin:16px 0;">
    <div style="background:#1e3a8a;padding:12px 16px;">
      <span style="color:#fff;font-weight:800;font-size:15px;">Γιατί η i-Mentor; — Δεν σταματάμε στην υποβολή</span>
    </div>
    <div style="padding:14px 16px;background:#f8faff;">
      <p style="font-size:13px;color:#374151;margin:0 0 12px;">Ενώ οι περισσότεροι σύμβουλοι σταματούν στην καταχώρηση της αίτησης, εμείς ανεβάζουμε επιπρόσθετα ένα <b>τεκμηριωμένο σχέδιο αναδιάρθρωσης</b> προσαρμοσμένο στους πιστωτές.</p>
      <table style="width:100%;border-collapse:separate;border-spacing:6px;">
        <tr>
          <td style="width:50%;padding:10px 12px;background:#dbeafe;border-radius:8px;vertical-align:top;font-size:13px;border-left:3px solid #3b82f6;">
            <b style="color:#1d4ed8;display:block;margin-bottom:4px;">Τεκμηριωμένο Σχέδιο Αναδιάρθρωσης</b>
            Ειδικά τα funds και οι τράπεζες δίνουν αντιπρότασεις. Τεκμηριώνουμε τη δική μας πρόταση για μεγαλύτερη πιθανότητα αποδοχής ή ευνοϊκότερης αντιπρότασης.
          </td>
          <td style="width:50%;padding:10px 12px;background:#fef3c7;border-radius:8px;vertical-align:top;font-size:13px;border-left:3px solid #f59e0b;">
            <b style="color:#92400e;display:block;margin-bottom:4px;">Business Plan για τη Δυσμενή Κατάσταση</b>
            Περίληψη, οικονομική &amp; περιουσιακή εικόνα, stress test βασικό &amp; dark σενάριο, συνοπτική πρόταση ανά πιστωτή.
          </td>
        </tr>
      </table>
      <div style="margin-top:8px;background:#dcfce7;border-left:3px solid #16a34a;border-radius:0 6px 6px 0;padding:8px 12px;font-size:12px;color:#166534;">
        <b>Αυτό που μας ξεχωρίζει:</b> Η τεκμηρίωση προς τους πιστωτές είναι εξτρά βήμα που κάνουμε μόνο εμείς — με μετρήσιμο αντίκτυπο σε υποθέσεις με funds &amp; τράπεζες.
      </div>
      <div style="margin-top:6px;background:#dbeafe;border-left:3px solid #3b82f6;border-radius:0 6px 6px 0;padding:8px 12px;font-size:12px;color:#1e40af;">
        <b>Στόχος μας:</b> Παρά την εκτίμησή μας, η πρόταση που καταθέτουμε στους πιστωτές στοχεύει να είναι <b>καλύτερη</b> από το θεωρητικό αποτέλεσμα — διεκδικώντας ευνοϊκότερες διαγραφές και χαμηλότερες δόσεις για εσάς.
      </div>
    </div>
  </div>

  ${portalUrl ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px 16px;margin:16px 0;">
    <b style="color:#166534;display:block;margin-bottom:6px;">🔗 Πρόσβαση στη Διαδικτυακή Πύλη</b>
    <p style="margin:0 0 8px;font-size:14px;color:#374151;">Μπορείτε να δείτε ολόκληρη την ανάλυση στη διαδικτυακή πύλη μας:</p>
    <a href="${escHtml(portalUrl)}" style="display:inline-block;background:#16a34a;color:#fff;padding:7px 16px;border-radius:6px;font-weight:700;text-decoration:none;font-size:14px;">Προβολή Ανάλυσης →</a>
    <p style="margin:8px 0 0;font-size:13px;color:#374151;">Κωδικός πρόσβασης: <b>${hasVat ? 'ο ΑΦΜ σας' : 'δεν απαιτείται κωδικός'}</b></p>
  </div>` : ''}

  <hr style="border:none;border-top:2px solid #e0e7ff;margin:18px 0;">
  <p style="margin:0 0 10px;">${badge('◈', '#1d4ed8', '#eff6ff')}<b style="font-size:15px;color:#1e3a5f;">Οικονομική Προσφορά για Ανάληψη Αίτησης</b></p>
  <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:12px;">
    <tr style="border-bottom:1px solid #e0e7ff;">
      <td style="padding:10px 12px;color:#374151;width:60%;">Προετοιμασία, υποβολή &amp; παρακολούθηση αίτησης</td>
      <td style="padding:10px 12px;text-align:right;">${fmtOffer(hasOffer ? commercialOffer.application_fee : null)}</td>
    </tr>
    <tr>
      <td style="padding:10px 12px;color:#374151;">Success fee <span style="font-size:12px;color:#6b7280;">(μόνο αν αποδεχθεί η πρόταση)</span></td>
      <td style="padding:10px 12px;text-align:right;">${fmtOffer(hasOffer ? commercialOffer.success_fee : null)}</td>
    </tr>
  </table>
  ${hasOffer ? `<div style="background:#f8faff;border:1px solid #c7d2fe;border-radius:8px;padding:12px 14px;font-size:13px;">
    <b style="color:#1e3a5f;display:block;margin-bottom:6px;">Τραπεζικοί Λογαριασμοί Πληρωμής</b>
    <span style="color:#374151;">Πειραιώς:&nbsp;&nbsp;&nbsp;</span> <code>GR45 0171 4330 0064 3316 4381 388</code><br>
    <span style="color:#374151;">Eurobank:&nbsp;&nbsp;&nbsp;</span> <code>GR58 0260 1680 0000 6020 1330 648</code><br>
    <span style="color:#374151;">Alpha Bank:</span> <code>GR24 0140 7750 7750 0233 0002 138</code><br>
    <b>Δικαιούχος: I MENTOR IKE</b>
  </div>` : ''}
  <p style="margin-top:16px;">Με εκτίμηση,<br><b>Η ομάδα της i-Mentor Consulting</b><br>📞 2810 363007 • 📧 info@i-mentor.gr • 🌐 www.i-mentor.gr</p>
</div>`
}

export function buildSimpleEmailHtml(text) {
  const lines = text.split('\n')
  const html = lines.map((line) => {
    if (/^─+\s+.+\s+─+$/.test(line.trim())) {
      const title = line.trim().replace(/^─+\s*/, '').replace(/\s*─+$/, '')
      return `<div style="font-weight:800;color:#1e3a8a;background:#eef2ff;padding:5px 12px;border-radius:5px;margin:14px 0 3px;font-size:13px;">${escHtml(title)}</div>`
    }
    if (line.startsWith('⚠️')) {
      return `<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:8px 12px;border-radius:0 6px 6px 0;font-size:13px;color:#78350f;margin:6px 0;">${escHtml(line)}</div>`
    }
    if (line.trim() === '') return `<div style="height:8px;"></div>`
    if (/^\s+GR\d/.test(line)) return `<div style="font-family:monospace;font-size:13px;margin-left:14px;color:#1e3a5f;">${escHtml(line)}</div>`
    if (line.startsWith('  ')) return `<div style="margin-left:14px;font-size:13px;color:#374151;">${escHtml(line)}</div>`
    if (line.startsWith('• ')) return `<div style="font-size:14px;padding-left:14px;">&#8226; ${escHtml(line.slice(2))}</div>`
    return `<div style="font-size:14px;color:#111827;">${escHtml(line)}</div>`
  }).join('')
  return `<div id="emailContent" style="font-family:Calibri,Arial,sans-serif;color:#1a1a1a;line-height:1.7;max-width:720px;">${html}</div>`
}

export function wrapEmailDocument(innerHtml, subject) {
  return `<!DOCTYPE html><html lang="el"><head><meta charset="UTF-8"><title>${escHtml(subject)}</title>
<style>body{margin:0;background:#f0f4ff;padding:30px;font-family:Calibri,Arial,sans-serif;}</style>
</head><body>
<div style="font-size:15px;font-weight:500;margin-bottom:12px;">Θέμα: ${escHtml(subject)}</div>
${innerHtml}
<div style="text-align:center;margin:30px 0 10px;">
  <button id="copyBtn" style="padding:10px 22px;background:#004aad;color:#fff;border:none;border-radius:6px;font-size:15px;cursor:pointer;">📋 Αντιγραφή Email</button>
</div>
<script>
document.getElementById('copyBtn').addEventListener('click', async () => {
  const target = document.getElementById('emailContent');
  try {
    await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([target.outerHTML], {type:'text/html'}),'text/plain': new Blob([target.innerText], {type:'text/plain'})})]);
    alert('✅ Αντιγράφηκε! Κάντε Ctrl+V στο Gmail.');
  } catch {
    const r = document.createRange(); r.selectNode(target);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('copy'); s.removeAllRanges();
    alert('✅ Αντιγράφηκε.');
  }
});
<\/script></body></html>`
}

export function buildResultsEmailHtml(data) {
  const { clientName, actualResults } = data
  const today = new Date().toLocaleDateString('el-GR')
  const creditors = actualResults?.creditors || []
  const generalNotes = actualResults?.generalNotes || ''
  const thR = (s) => `<th style="background:#004aad;color:#fff;padding:10px;border:1px solid #003080;font-size:13px;text-align:left;">${s}</th>`
  const tdR = (s, align = 'left', style = '') => `<td style="padding:10px;border:1px solid #d2def8;text-align:${align};${style}">${s}</td>`
  const fmtDec2 = (n) => Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'

  // Build rows — expand sub-rows when present
  const creditorRows = creditors.flatMap((c) => {
    const hasSub = (c.subRows || []).length > 0
    if (!hasSub) {
      return [`<tr>${tdR(escHtml(c.creditor))}${tdR(c.actualWriteoff > 0 ? fmt(c.actualWriteoff) : '—', 'right')}${tdR(c.actualRemaining > 0 ? fmt(c.actualRemaining) : '—', 'right')}${tdR(c.actualMonthlyPay > 0 ? fmtDec2(c.actualMonthlyPay) : '—', 'right')}${tdR(c.actualMonths ? String(c.actualMonths) : '—', 'center')}${tdR(escHtml(c.rfCode || '—'))}${tdR(escHtml(c.notes || '—'))}</tr>`]
    }
    const parentRow = `<tr style="background:#f5f8ff;"><td style="padding:10px;border:1px solid #d2def8;font-weight:700;">${escHtml(c.creditor)} <span style="font-size:11px;color:#8898a9;">(${c.subRows.length} μέρη)</span></td>${tdR(c.actualWriteoff > 0 ? fmt(c.actualWriteoff) : '—', 'right', 'font-weight:700;')}${tdR(c.actualRemaining > 0 ? fmt(c.actualRemaining) : '—', 'right', 'font-weight:700;')}${tdR(c.actualMonthlyPay > 0 ? fmtDec2(c.actualMonthlyPay) : '—', 'right', 'font-weight:700;color:#004aad;')}<td style="padding:10px;border:1px solid #d2def8;" colspan="3"></td></tr>`
    const subRowsHtml = c.subRows.map((s) => `<tr style="background:#fafcff;"><td style="padding:8px 10px 8px 22px;border:1px solid #d2def8;color:#556;font-style:italic;">↳ ${escHtml(s.label || '')}</td>${tdR(s.actualWriteoff > 0 ? fmt(s.actualWriteoff) : '—', 'right')}${tdR(s.actualRemaining > 0 ? fmt(s.actualRemaining) : '—', 'right')}${tdR(s.actualMonthlyPay > 0 ? fmtDec2(s.actualMonthlyPay) : '—', 'right')}${tdR(s.actualMonths ? String(s.actualMonths) : '—', 'center')}${tdR(escHtml(s.rfCode || '—'))}${tdR(escHtml(s.notes || '—'))}</tr>`).join('')
    return [parentRow, subRowsHtml]
  }).join('')

  const totalWriteoff = creditors.reduce((s, c) => s + (c.actualWriteoff || 0), 0)
  const totalRemaining = creditors.reduce((s, c) => s + (c.actualRemaining || 0), 0)
  const totalMonthly = creditors.reduce((s, c) => s + (c.actualMonthlyPay || 0), 0)
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;max-width:800px;margin:0 auto;"><div style="display:flex;justify-content:space-between;background:#eaf1ff;border:1px solid #d7e3ff;color:#0b3a82;border-radius:10px;padding:10px 14px;margin-bottom:18px;font-size:14px;"><b>i-Mentor Consulting</b><span>www.i-mentor.gr • info@i-mentor.gr • 2810 363007</span></div><h2 style="color:#004aad;">ΑΠΟΤΕΛΕΣΜΑΤΑ ΡΥΘΜΙΣΗΣ ΟΦΕΙΛΩΝ</h2><p style="color:#5e6c84;font-size:14px;">${today} — Αναφορά για: <b>${escHtml(clientName)}</b></p><div style="background:#f0fdf4;border:2px solid #86efac;border-radius:10px;padding:14px;margin-bottom:18px;"><b style="color:#166534;">Η ρύθμιση οφειλών ολοκληρώθηκε.</b><p style="color:#166534;margin:4px 0 0;font-size:14px;">Παρακάτω θα βρείτε τα αναλυτικά αποτελέσματα ανά πιστωτή όπως εγκρίθηκαν.</p></div>${creditors.length > 0 ? `<h3 style="color:#004aad;">Αποτελέσματα ανά Πιστωτή</h3><table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:10px;"><thead><tr>${thR('Πιστωτής')}${thR('Διαγραφή')}${thR('Εναπομένουσα')}${thR('Μηνιαία Δόση')}${thR('Δόσεις')}${thR('RF Κωδικός')}${thR('Σημειώσεις')}</tr></thead><tbody>${creditorRows}<tr style="background:#eef5ff;font-weight:700;"><td style="padding:10px;border:1px solid #d2def8;">ΣΥΝΟΛΟ</td>${tdR(totalWriteoff > 0 ? fmt(totalWriteoff) : '—', 'right', 'font-weight:700;')}${tdR(totalRemaining > 0 ? fmt(totalRemaining) : '—', 'right', 'font-weight:700;')}${tdR(totalMonthly > 0 ? fmtDec2(totalMonthly) : '—', 'right', 'font-weight:700;color:#004aad;')}<td style="padding:10px;border:1px solid #d2def8;text-align:center;" colspan="3">—</td></tr></tbody></table>` : ''}${generalNotes ? `<div style="background:#f7faff;border-left:4px solid #004aad;padding:12px 14px;border-radius:8px;margin-top:18px;"><b>Σημειώσεις:</b><br>${escHtml(generalNotes)}</div>` : ''}<div style="border-top:1px solid #e2e8f4;margin-top:24px;padding-top:12px;text-align:center;font-size:12px;color:#8898a9;">i-Mentor Consulting • www.i-mentor.gr • info@i-mentor.gr • 2810 363007</div></div>`
}
