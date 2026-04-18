// ============================================================
// Report generators — produce full HTML documents for plan + email
// Ported from the original HTML spec v22.0
// ============================================================

import { fmt, PMT, creditorDisplayName, maxMonthsByType } from './calculations'

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
export function buildPlanHtml(data) {
  const today = new Date().toLocaleDateString('el-GR')
  const { clientName, clientPhone, clientEmail, debtorType, annualIncome, totalExpenses, householdValue, householdLabel, enfia, medical, rent, studentRent, extraLiving, alimony, dispAnnual, dispMonthly, creditors, totalDebt, totalWriteOff, totalRemaining, totalMonthlyPay, realEstateAssets, totalRealEstateValue } = data

  const totalRatio = dispMonthly > 0 ? Math.round((totalMonthlyPay / dispMonthly) * 100) : 0
  const RATE = 0.03 / 12

  const baseMonthly = dispMonthly
  const stressedMonthly = Math.max(0, baseMonthly * 0.9)
  const bufferBase = baseMonthly - totalMonthlyPay
  const bufferStress = stressedMonthly - totalMonthlyPay
  const baseRatio = baseMonthly > 0 ? Math.round((totalMonthlyPay / baseMonthly) * 100) : 0
  const stressRatio = stressedMonthly > 0 ? Math.round((totalMonthlyPay / stressedMonthly) * 100) : 0

  const incomeRows = debtorType.includes('Νομικό')
    ? ''
    : [
        annualIncome ? `<tr><td>Ετήσιο εισόδημα</td><td>${fmt(annualIncome)}</td><td>Δηλωθέν</td></tr>` : '',
        householdValue ? `<tr><td>Εύλογες δαπάνες (${householdLabel})</td><td>${fmt(householdValue)}</td><td>ΕΛΣΤΑΤ</td></tr>` : '',
        enfia ? `<tr><td>ΕΝΦΙΑ</td><td>${fmt(enfia)}</td><td>Ετήσιο</td></tr>` : '',
        medical ? `<tr><td>Ιατρικές δαπάνες</td><td>${fmt(medical)}</td><td>Μόνιμες</td></tr>` : '',
        rent ? `<tr><td>Ενοίκιο</td><td>${fmt(rent)}</td><td>Ετήσιο</td></tr>` : '',
        studentRent ? `<tr><td>Ενοίκιο φοιτητών</td><td>${fmt(studentRent)}</td><td>Ετήσιο</td></tr>` : '',
        extraLiving ? `<tr><td>Πρόσθετη διατροφή/διαβίωση</td><td>${fmt(extraLiving)}</td><td>Ετήσιο</td></tr>` : '',
        alimony ? `<tr><td>Διατροφή λόγω διαζυγίου</td><td>${fmt(alimony)}</td><td>Ετήσιο</td></tr>` : '',
      ].filter(Boolean).join('')

  const summaryRows = creditors.map((c) => {
    const pct = c.amount > 0 ? Math.round((c.writeoff / c.amount) * 100) : 0
    return `<tr><td>${escHtml(c.creditor)}</td><td>${fmt(c.amount)}</td><td>${c.writeoff > 0 ? `${fmt(c.writeoff)} (${pct}%)` : '—'}</td><td>${fmt(c.remaining)}</td><td>${c.months || 0}</td><td>${c.monthlyPay > 0 ? fmt(c.monthlyPay) : '—'}</td></tr>`
  }).join('')

  const propRows = realEstateAssets.length
    ? realEstateAssets.map((a, i) => `<tr><td>${i + 1}</td><td>${escHtml(a.label)}</td><td>${escHtml(a.type)}</td><td>${fmt(a.value)}</td></tr>`).join('')
    : '<tr><td colspan="4">Δεν έχουν καταχωρηθεί ακίνητα.</td></tr>'

  const creditorSections = creditors.map((c, idx) => {
    const pct = c.amount > 0 ? Math.round((c.writeoff / c.amount) * 100) : 0
    return `<div style="margin-top:20px"><h3 style="color:#004aad">6.${idx + 1}. ${escHtml(c.creditor)}</h3><p>Για την απαίτηση <b>${escHtml(c.creditor)}</b> (${fmt(c.amount)}), προτείνεται απομείωση <b>${fmt(c.writeoff)}${c.writeoff > 0 ? ` (${pct}%)` : ''}</b> και ρύθμιση υπολοίπου <b>${fmt(c.remaining)}</b> σε <b>${c.months}</b> μηνιαίες δόσεις. Μηνιαία δόση: <b>${c.monthlyPay > 0 ? fmt(c.monthlyPay) : '—'}</b>.</p></div>`
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

  <h3 style="color:#004aad;">1. Περίληψη</h3>
  <div style="background:#f7fbff;border-left:4px solid #004aad;padding:12px 14px;border-radius:8px;margin-bottom:18px;">
    Συνολική οφειλή: <b>${fmt(totalDebt)}</b> | Διαγραφή: <b>${fmt(totalWriteOff)}</b> | Υπόλοιπο: <b>${fmt(totalRemaining)}</b> | Μηνιαία δόση: <b>${fmt(totalMonthlyPay)}</b>
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
  <table style="width:100%;border-collapse:collapse;margin-top:12px;">
    <thead><tr>${th('Πιστωτής')}${th('Αρχική')}${th('Διαγραφή')}${th('Υπόλοιπο')}${th('Δόσεις')}${th('Μηνιαία')}</tr></thead>
    <tbody>
      ${summaryRows}
      <tr style="background:#eef5ff;font-weight:700;"><td style="padding:10px;border:1px solid #d2def8;"><b>ΣΥΝΟΛΟ</b></td><td style="padding:10px;border:1px solid #d2def8;">${fmt(totalDebt)}</td><td style="padding:10px;border:1px solid #d2def8;">${fmt(totalWriteOff)}</td><td style="padding:10px;border:1px solid #d2def8;">${fmt(totalRemaining)}</td><td style="padding:10px;border:1px solid #d2def8;">—</td><td style="padding:10px;border:1px solid #d2def8;">${fmt(totalMonthlyPay)}</td></tr>
    </tbody>
  </table>

  ${creditorSections}

  <h3 style="color:#004aad;margin-top:24px;">7. Συμπεράσματα</h3>
  <p>Η παρούσα πρόταση αποσκοπεί στη διαμόρφωση βιώσιμης ρύθμισης. Συνολική μηνιαία δόση: <b>${fmt(totalMonthlyPay)}</b>${dispMonthly > 0 ? ` • Επιβάρυνση: <b>${totalRatio}%</b>` : ''} επί του διαθέσιμου εισοδήματος.</p>
  <div style="background:#eef5ff;border-left:4px solid #0070e8;padding:12px 14px;border-radius:8px;margin-top:12px;">
    ⚠️ Η ανάλυση αποτελεί θεωρητική προσομοίωση και δεν συνιστά δεσμευτική πρόταση.
  </div>
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
  const { clientName, debtorType, totalDebt, totalWriteOff, totalRemaining, totalMonthlyPay, dispMonthly, creditors, bankDebt, taxDebt, insDebt } = data

  const rows = creditors.map((c) => {
    const pct = c.amount > 0 ? Math.round((c.writeoff / c.amount) * 100) : 0
    return `<tr>
      <td style="padding:8px;border:1px solid #d9e2ef;text-align:center;">${escHtml(c.creditor)}</td>
      <td style="padding:8px;border:1px solid #d9e2ef;text-align:center;">${fmt(c.amount)}</td>
      <td style="padding:8px;border:1px solid #d9e2ef;text-align:center;">${c.writeoff > 0 ? `${fmt(c.writeoff)} (${pct}%)` : '—'}</td>
      <td style="padding:8px;border:1px solid #d9e2ef;text-align:center;">${fmt(c.remaining)}</td>
      <td style="padding:8px;border:1px solid #d9e2ef;text-align:center;">${c.months || 0}</td>
      <td style="padding:8px;border:1px solid #d9e2ef;text-align:center;">${c.monthlyPay > 0 ? fmt(c.monthlyPay) : '—'}</td>
    </tr>`
  }).join('')

  const hasBanks = (bankDebt || 0) > 0
  const banksNote = hasBanks
    ? `<div style="margin:12px 0;padding:10px 12px;background:#eaf1ff;border-left:5px solid #004aad;border-radius:6px;color:#00387e;font-size:14px;line-height:1.6;">
        <b>ℹ️ Παρατήρηση (Τράπεζες)</b><br>
        Το αποτέλεσμα προσομοιώνει την πρόταση του αλγορίθμου του Εξωδικαστικού Μηχανισμού. Οι Τράπεζες έχουν δικαίωμα να αποδεχθούν την πρόταση ή να υποβάλουν αντιπρόταση.
      </div>`
    : ''

  return `<div id="emailContent" style="font-family:Calibri,Arial,sans-serif;color:#1a1a1a;line-height:1.6;font-size:15px;">
  <p>Αγαπητέ/ή ${escHtml(clientName)},</p>
  <p>Η ομάδα της <b>i-Mentor Consulting</b> ολοκλήρωσε την ανάλυση και παρουσιάζει τα αποτελέσματα της <b>Θεωρητικής Προσομοίωσης Εξωδικαστικού Μηχανισμού</b>.</p>
  <hr style="border:none;border-top:1px solid #d9e2ef;margin:16px 0;">
  <p><b>📊 Σύνολο Οφειλών: ${fmt(totalDebt)}</b></p>
  <ul>
    <li><b>Προς τράπεζες:</b> ${fmt(bankDebt || 0)}</li>
    <li><b>Προς ασφαλιστικά ταμεία:</b> ${fmt(insDebt || 0)}</li>
    <li><b>Προς ΑΑΔΕ / εφορία:</b> ${fmt(taxDebt || 0)}</li>
  </ul>
  <p><b>💶 Διαθέσιμο μηνιαίο εισόδημα: ${fmt(dispMonthly)}</b></p>
  <p style="margin-top:14px;font-size:16px;"><b>💳 Εκτιμώμενο Θεωρητικό Αποτέλεσμα Ρύθμισης</b></p>
  <table style="border-collapse:collapse;width:100%;font-size:14px;margin-top:10px;">
    <thead style="background:#004aad;color:#fff;text-align:center;">
      <tr>
        <th style="padding:8px;border:1px solid #d9e2ef;">Πιστωτής</th>
        <th style="padding:8px;border:1px solid #d9e2ef;">Αρχική Οφειλή</th>
        <th style="padding:8px;border:1px solid #d9e2ef;">Εκτιμώμενη Διαγραφή</th>
        <th style="padding:8px;border:1px solid #d9e2ef;">Εναπομένουσα</th>
        <th style="padding:8px;border:1px solid #d9e2ef;">Διάρκεια</th>
        <th style="padding:8px;border:1px solid #d9e2ef;">Μηνιαία Δόση</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <ul style="margin-top:12px;">
    <li><b>Συνολική θεωρητική διαγραφή:</b> ${fmt(totalWriteOff)}</li>
    <li><b>Εναπομένουσες οφειλές:</b> ${fmt(totalRemaining)}</li>
    <li><b>Συνολικές μηνιαίες δόσεις:</b> ${fmt(totalMonthlyPay)}</li>
  </ul>
  ${banksNote}
  <p style="margin-top:12px;color:#334;font-size:14px;">⚠️ <b>Διευκρίνιση:</b> Θεωρητική προσομοίωση — δεν συνιστά δεσμευτική πρόταση ρύθμισης.</p>
  <hr style="border:none;border-top:1px solid #d9e2ef;margin:16px 0;">
  <p><b>💼 Οικονομική Προσφορά για Ανάληψη Αίτησης</b></p>
  <ol>
    <li><b>Προετοιμασία, υποβολή &amp; παρακολούθηση αίτησης:</b> ..... € (+ ΦΠΑ)</li>
    <li><b>Success fee (μόνο αν υπογραφεί σύμβαση):</b> ..... € (+ ΦΠΑ)</li>
  </ol>
  <p><b>🏦 Τραπεζικοί Λογαριασμοί</b><br>
  Τράπεζα Πειραιώς: GR45 0171 4330 0064 3316 4381 388<br>
  Eurobank: GR58 0260 1680 0000 6020 1330 648<br>
  Alpha Bank: GR24 0140 7750 7750 0233 0002 138<br>
  <b>Δικαιούχος:</b> I MENTOR IKE</p>
  <p style="margin-top:16px;">Με εκτίμηση,<br><b>Η ομάδα της i-Mentor Consulting</b><br>📞 2810 363007 • 📧 info@i-mentor.gr • 🌐 www.i-mentor.gr</p>
</div>`
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
