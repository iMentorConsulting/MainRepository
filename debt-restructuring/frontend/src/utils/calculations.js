// ============================================================
// Core financial calculations — ported from HTML spec v22.0
// All formulas preserved exactly as in the original.
// ============================================================

export function PMT(rate, nper, pv) {
  if (!pv || pv <= 0 || !nper || nper <= 0) return 0
  return (pv * rate) / (1 - Math.pow(1 + rate, -nper))
}

export function fmt(n) {
  if (!isFinite(n)) return '0 €'
  return Math.max(0, Math.floor(n)).toLocaleString('de-DE') + '€'
}

export function unfmt(s) {
  if (!s) return 0
  s = String(s).replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.-]/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

export function creditorDisplayName(type, creditorName = '') {
  const name = String(creditorName || '').trim()
  if (type === 'Εφορία') return 'ΑΑΔΕ'
  if (type === 'Ασφαλιστικά Ταμεία') return 'ΕΦΚΑ-ΚΕΑΟ'
  if (type === 'Τράπεζα') return name || 'ΤΡΑΠΕΖΑ'
  return name || type || 'ΠΙΣΤΩΤΗΣ'
}

export function maxMonthsByType(type, amount) {
  if (String(type).includes('Τράπεζ')) return amount > 99999 ? 420 : 300
  return 240
}

// ============================================================
// Main calculation — equivalent to recalc() + autoCombined()
// Input: debts[], assets[], incomeData{}
// Returns: full calculation result object
// ============================================================
export function calculateAll(debts, assets, incomeData) {
  const AUCTION_EXPENSES = 5000
  const RATE = 0.03 / 12
  const LIMIT = 100 // % of income

  // Build rows from valid debts
  const rows = debts
    .filter((d) => (d.amount || 0) > 0)
    .map((d, i) => {
      const type = d.type || 'Τράπεζα'
      const isTaxRow = type === 'Εφορία' || type === 'Ασφαλιστικά Ταμεία'
      const intPct = Math.min(100, Math.max(0, d.interestPct || 0))
      const surchargesPct = isTaxRow ? Math.min(100, Math.max(0, d.surchargesPct || 0)) : 0
      const finesPct = isTaxRow ? Math.min(100, Math.max(0, d.finesPct || 0)) : 0
      const amount = d.amount || 0
      return {
        idx: i,
        id: d.id,
        type,
        creditorName: d.creditorName || '',
        mort: d.mortgaged || false,
        prop: d.propertyValue || 0,
        amount,
        intPct,
        surchargesPct,
        finesPct,
        prinAmt: amount * (100 - intPct) / 100,
        intAmt: amount * intPct / 100,
        status: d.status || 'Ληξιπρόθεσμη',
      }
    })

  const sumDebt = rows.reduce((a, r) => a + r.amount, 0)

  // Other assets total
  const propsTotal = (assets || []).reduce((a, p) => a + (p.value || 0), 0)

  // Mortgaged property total (after auction expenses)
  const sumMortRaw = rows.reduce((a, r) => a + (r.mort ? r.prop : 0), 0)
  const sumMortAfterExp = Math.max(0, sumMortRaw - AUCTION_EXPENSES)
  const sumAssetsAfterExp = sumMortAfterExp + propsTotal
  const mortScale = sumMortRaw ? sumMortAfterExp / sumMortRaw : 0

  // ============================================================
  // Coverage calculation — 65 / 25 / 10 rule
  // ============================================================
  const covMap = new Map()

  if (sumAssetsAfterExp >= sumDebt) {
    rows.forEach((r) => covMap.set(r.idx, r.amount))
  } else {
    const mortRows = rows.filter((r) => r.mort && r.prop > 0)
    const effProp = new Map()
    mortRows.forEach((r) => effProp.set(r.idx, r.prop * mortScale))

    let poolTax = 0
    let poolUnsec = 0
    const own65 = new Map()
    mortRows.forEach((r) => {
      const p = effProp.get(r.idx) || 0
      own65.set(r.idx, p * 0.65)
      poolTax += p * 0.25
      poolUnsec += p * 0.10
    })

    const taxRows = rows.filter((r) => r.type === 'Εφορία' || r.type === 'Ασφαλιστικά Ταμεία')
    const unsecRows = rows.filter((r) => !r.mort && !(r.type === 'Εφορία' || r.type === 'Ασφαλιστικά Ταμεία'))
    const taxTotal = taxRows.reduce((a, r) => a + r.amount, 0)
    const unsecTotal = unsecRows.reduce((a, r) => a + r.amount, 0)
    const allTotal = rows.reduce((a, r) => a + r.amount, 0)

    const poolAlloTax = new Map()
    const poolAlloUnsc = new Map()

    if (taxTotal > 0) {
      taxRows.forEach((r) => poolAlloTax.set(r.idx, poolTax * (r.amount / taxTotal)))
    } else {
      rows.forEach((r) => poolAlloTax.set(r.idx, allTotal ? poolTax * (r.amount / allTotal) : 0))
    }

    if (unsecTotal > 0) {
      unsecRows.forEach((r) => poolAlloUnsc.set(r.idx, poolUnsec * (r.amount / unsecTotal)))
    } else {
      rows.forEach((r) => poolAlloUnsc.set(r.idx, allTotal ? poolUnsec * (r.amount / allTotal) : 0))
    }

    const perOther = rows.length ? propsTotal / rows.length : 0

    rows.forEach((r) => {
      let c = 0
      c += own65.get(r.idx) || 0
      c += poolAlloTax.get(r.idx) || 0
      c += poolAlloUnsc.get(r.idx) || 0
      c += perOther
      c = Math.min(c, r.amount)
      covMap.set(r.idx, c)
    })
  }

  // ============================================================
  // Write-off caps per creditor type
  // Banks: 80% principal + 100% interest
  // Tax/Insurance: 75% basic + 85% surcharges + 95% fines
  // ============================================================
  const analysisRows = rows.map((r) => {
    const cov = covMap.get(r.idx) || 0
    const uncov = Math.max(0, r.amount - cov)
    const isTax = r.type === 'Εφορία' || r.type === 'Ασφαλιστικά Ταμεία'
    let legalMax
    if (isTax) {
      if (r.surchargesPct === 0 && r.finesPct === 0) {
        legalMax = r.prinAmt * 0.75 + r.intAmt * 0.85
      } else {
        const basicAmt = r.amount * Math.max(0, 100 - r.surchargesPct - r.finesPct) / 100
        const surchargeAmt = r.amount * r.surchargesPct / 100
        const finesAmt = r.amount * r.finesPct / 100
        legalMax = basicAmt * 0.75 + surchargeAmt * 0.85 + finesAmt * 0.95
      }
    } else {
      legalMax = r.prinAmt * 0.80 + r.intAmt * 1.00
    }
    const calc = Math.min(uncov, legalMax)
    return {
      ...r,
      cov,
      covPct: r.amount ? Math.round(cov * 100 / r.amount) : 0,
      uncov,
      legalMax,
      calc,
      calcPct: r.amount ? Math.round(calc * 100 / r.amount) : 0,
      remaining: Math.max(0, r.amount - calc),
    }
  })

  const sumMaxWriteoff = analysisRows.reduce((a, r) => a + r.calc, 0)

  // ============================================================
  // Available income
  // ============================================================
  let dispAnnual = 0
  let dispMonthly = 0
  let totalExpenses = 0
  let annualIncome = 0

  if (incomeData.debtorType === 'Νομικό Πρόσωπο') {
    const turnover = incomeData.turnover || 0
    const ebitda = incomeData.ebitda || 0
    const tax = incomeData.tax || 0
    const cash = incomeData.cash || 0
    const liquid = incomeData.liquid || 0
    const minEbitda = turnover * 0.10
    const adjEbitda = Math.max(ebitda, minEbitda)
    dispAnnual = adjEbitda - tax + cash + liquid - turnover * 0.09
    dispMonthly = dispAnnual / 12
  } else {
    annualIncome = incomeData.annualIncome || 0
    const householdVal = incomeData.householdValue || 0
    const enfia = incomeData.enfiaCost || 0
    const medical = incomeData.medicalCost || 0
    const rent = incomeData.rentCost || 0
    const studentRent = incomeData.studentRentCost || 0
    const extraLiving = incomeData.extraLivingCost || 0
    const alimony = incomeData.alimonyCost || 0
    totalExpenses = householdVal + enfia + medical + rent + studentRent + extraLiving + alimony
    const netAfterExpenses = Math.max(0, annualIncome - totalExpenses)
    dispAnnual = netAfterExpenses * 0.8
    dispMonthly = dispAnnual / 12
  }

  const monthlyIncome = Math.max(0, dispMonthly)

  // ============================================================
  // Plan A: no write-offs, extend duration greedily
  // ============================================================
  const hasLargeBankDebt = rows.some((r) => r.type === 'Τράπεζα' && r.amount > 99999)

  function nextStep(cur, type, amount) {
    const max = maxMonthsByType(type, amount)
    return cur < max ? cur + 1 : cur
  }

  function totalForPlan(plan) {
    return plan.reduce((s, p) => s + PMT(RATE, p.months, p.amount), 0)
  }

  const planBase = analysisRows.map((r) => ({
    idx: r.idx,
    type: r.type,
    amount: r.amount,
    months: 12,
    max: maxMonthsByType(r.type, r.amount),
    legalMax: r.legalMax,
    calc: r.calc,
  }))

  const planA = JSON.parse(JSON.stringify(planBase))
  let totalA = totalForPlan(planA)
  let ratioA = monthlyIncome > 0 ? (totalA / monthlyIncome) * 100 : Infinity

  while (ratioA > LIMIT) {
    let bestIdx = -1
    let bestGain = 0
    let newM = 0
    planA.forEach((p, i) => {
      const ns = nextStep(p.months, p.type, p.amount)
      if (ns <= p.max && ns !== p.months) {
        const gain = PMT(RATE, p.months, p.amount) - PMT(RATE, ns, p.amount)
        if (gain > bestGain) {
          bestGain = gain
          bestIdx = i
          newM = ns
        }
      }
    })
    if (bestIdx === -1) break
    planA[bestIdx].months = newM
    totalA = totalForPlan(planA)
    ratioA = monthlyIncome > 0 ? (totalA / monthlyIncome) * 100 : Infinity
  }

  // ============================================================
  // Find optimal write-off scale if Plan A still too high
  // ============================================================
  let best = null

  if (ratioA <= LIMIT) {
    best = {
      plan: planA.map((p) => ({ ...p, writeoff: 0, newAmt: p.amount })),
      tot: totalA,
      ratio: ratioA,
    }
  } else {
    const totalCapWriteoff = analysisRows.reduce((s, r) => s + (r.calc || 0), 0)

    for (let step = 0; step <= 100; step++) {
      const scale = totalCapWriteoff > 0 ? step / 100 : 0
      const plan = planA.map((p) => {
        const refRow = analysisRows.find((r) => r.idx === p.idx)
        const maxWr = refRow ? refRow.calc : p.legalMax || 0
        const wr = Math.min(maxWr * scale, maxWr, p.amount)
        const newAmt = Math.max(0, p.amount - wr)
        return { ...p, writeoff: wr, newAmt }
      })
      const tot = plan.reduce((s, x) => s + PMT(RATE, x.months, x.newAmt), 0)
      const r = monthlyIncome > 0 ? (tot / monthlyIncome) * 100 : Infinity
      if (r <= LIMIT) {
        best = { plan, tot, ratio: r }
        break
      }
    }

    // Fallback: maximum write-off
    if (!best) {
      const plan = planA.map((p) => {
        const refRow = analysisRows.find((r) => r.idx === p.idx)
        const wrMax = refRow ? refRow.calc : p.legalMax || 0
        const wr = Math.min(wrMax, p.amount)
        const newAmt = Math.max(0, p.amount - wr)
        return { ...p, writeoff: wr, newAmt }
      })
      const tot = plan.reduce((s, x) => s + PMT(RATE, x.months, x.newAmt), 0)
      best = { plan, tot, ratio: monthlyIncome > 0 ? (tot / monthlyIncome) * 100 : Infinity }
    }
  }

  if (!best?.plan?.length) {
    best = { plan: planA.map((p) => ({ ...p, writeoff: 0, newAmt: p.amount })), tot: totalA, ratio: ratioA }
  }

  // ============================================================
  // Post-process final plan — enforce rules
  // ============================================================
  const finalPlan = best.plan.map((p) => {
    const refRow = analysisRows.find((r) => r.idx === p.idx)
    if (!refRow) return { ...p, writeoff: 0, newAmt: p.amount, payShown: 0 }

    const maxWr = refRow.calc || 0
    let safeWriteoff = Math.min(p.writeoff || 0, maxWr, p.amount)
    // Ενήμερη (current) debts get no write-off
    if (refRow.status === 'Ενήμερη') safeWriteoff = 0

    const newAmt = Math.max(0, p.amount - safeWriteoff)
    const maxM = maxMonthsByType(p.type, p.amount)
    let months = Math.min(p.months || maxM, maxM)
    let pay = PMT(RATE, months, newAmt)

    const isTaxType = /Εφορία|Ασφαλισ/.test(p.type)
    const minInstallment = isTaxType ? 50 : 0

    // Reduce duration to meet minimum installment
    if (newAmt > 0 && minInstallment > 0 && pay < minInstallment) {
      while (months > 1 && pay < minInstallment) {
        months--
        pay = PMT(RATE, months, newAmt)
      }
    }

    const payShown = Math.max(0, Math.floor(pay))

    return {
      idx: p.idx,
      type: p.type,
      creditorName: refRow.creditorName,
      amount: p.amount,
      writeoff: safeWriteoff,
      writeoffPct: p.amount ? Math.round(safeWriteoff * 100 / p.amount) : 0,
      newAmt,
      months,
      payShown,
      incomePct: monthlyIncome > 0 ? Math.round(payShown / monthlyIncome * 100) : 0,
    }
  })

  const sumWr = finalPlan.reduce((s, p) => s + (p.writeoff || 0), 0)
  const totalRemaining = finalPlan.reduce((s, p) => s + (p.newAmt || 0), 0)
  const totalMonthlyPay = finalPlan.reduce((s, p) => s + (p.payShown || 0), 0)
  const ratio = monthlyIncome > 0 ? Math.round(totalMonthlyPay / monthlyIncome * 100) : 0

  // ============================================================
  // Scenario determination
  // ============================================================
  const hasAssets = sumAssetsAfterExp > 0
  const isFullCoveredByAssets = sumDebt > 0 && sumAssetsAfterExp >= sumDebt
  const isPartialCoveredByAssets = sumDebt > 0 && hasAssets && sumAssetsAfterExp < sumDebt
  const lowIncome = monthlyIncome <= 0 || ratio > 100
  const totalCap = analysisRows.reduce((s, r) => s + (r.calc || 0), 0)

  let scenario = 1
  if (incomeData.debtorType === 'Νομικό Πρόσωπο') scenario = 0
  else if (lowIncome && isFullCoveredByAssets) scenario = 4
  else if (lowIncome && isPartialCoveredByAssets && totalCap > 0) scenario = 5
  else if (sumWr === 0 && ratio <= 100 && monthlyIncome > 0) scenario = 1
  else if (sumWr > 0 && ratio <= 100 && monthlyIncome > 0) scenario = 2
  else scenario = 3

  return {
    // Inputs summary
    rows,
    sumDebt,
    sumAssetsAfterExp,
    propsTotal,
    sumMortRaw,
    hasLargeBankDebt,

    // Coverage
    covMap: Object.fromEntries(covMap),
    analysisRows,
    sumMaxWriteoff,
    sumMaxWriteoffPct: sumDebt ? Math.round(sumMaxWriteoff * 100 / sumDebt) : 0,

    // Income
    annualIncome,
    totalExpenses,
    dispAnnual: Math.max(0, dispAnnual),
    dispMonthly: Math.max(0, dispMonthly),
    monthlyIncome,

    // Final plan
    finalPlan,
    sumWr,
    sumWrPct: sumDebt ? Math.round(sumWr * 100 / sumDebt) : 0,
    totalRemaining,
    totalMonthlyPay,
    ratio,

    // Scenario
    scenario,
    lowIncome,
    isFullCoveredByAssets,
    isPartialCoveredByAssets,
  }
}

// ============================================================
// Scenario narrative text — structured multi-section format
// ============================================================
export function buildForecastText(calc, incomeData) {
  if (!calc || calc.sumDebt === 0) return null
  const { scenario, sumDebt, sumWr, sumWrPct, totalRemaining, totalMonthlyPay, dispMonthly, finalPlan, sumAssetsAfterExp } = calc

  const banksDebt = (calc.rows || []).filter((r) => r.type === 'Τράπεζα').reduce((a, r) => a + r.amount, 0)
  const taxDebt = (calc.rows || []).filter((r) => r.type === 'Εφορία').reduce((a, r) => a + r.amount, 0)
  const fundsDebt = (calc.rows || []).filter((r) => r.type === 'Ασφαλιστικά Ταμεία').reduce((a, r) => a + r.amount, 0)
  const hasBanks = banksDebt > 0
  const hasAssets = sumAssetsAfterExp > 0

  const monthsList = (finalPlan || []).map((p) => p.months || 0).filter((m) => m > 0)
  const minM = monthsList.length ? Math.min(...monthsList) : 0
  const maxM = monthsList.length ? Math.max(...monthsList) : 0
  const durationPhrase = minM === maxM
    ? `${maxM} μήνες (~${(maxM / 12).toFixed(1)} έτη)`
    : `από ${minM} έως ${maxM} μήνες (~${(minM / 12).toFixed(1)}–${(maxM / 12).toFixed(1)} έτη)`

  const ratio = dispMonthly > 0 ? Math.round(totalMonthlyPay / dispMonthly * 100) : 0

  // Common sections
  const debtSection = {
    type: 'info', icon: '🔢', label: 'Σύνολο Οφειλών',
    body: `Οι συνολικές οφειλές του οφειλέτη ανέρχονται σε ${fmt(sumDebt)}, κατανεμημένες ως εξής:\n• Προς τράπεζες: ${fmt(banksDebt)}\n• Προς ασφαλιστικά ταμεία: ${fmt(fundsDebt)}\n• Προς ΑΑΔΕ / εφορία: ${fmt(taxDebt)}`,
  }
  const incomeSection = {
    type: 'info', icon: '💶', label: 'Εισοδηματικά Στοιχεία',
    body: `Με βάση τα δηλωθέντα στοιχεία, το διαθέσιμο εισόδημα μετά τις εύλογες δαπάνες εκτιμάται σε ${fmt(dispMonthly)} / μήνα.`,
  }
  const assetSection = hasAssets ? {
    type: 'info', icon: '🏠', label: 'Περιουσιακή Εικόνα',
    body: `Η συνολική εκτιμώμενη αξία περιουσιακών στοιχείων ανέρχεται σε ${fmt(sumAssetsAfterExp)}. ${
      calc.isFullCoveredByAssets
        ? 'Η περιουσία καλύπτει πλήρως τις οφειλές.'
        : 'Η περιουσία παρέχει μερική κάλυψη των οφειλών, ωστόσο παραμένει "αδιάσωστο" μέρος της συνολικής οφειλής.'
    }`,
  } : null
  const noteSection = {
    type: 'info', icon: 'ℹ️', label: 'Παρατήρηση',
    body: 'Η παρούσα εκτίμηση είναι θεωρητική προσομοίωση και δεν αποτελεί δέσμευση. Η τελική πρόταση θα παραχθεί από το σύστημα του εξωδικαστικού μηχανισμού ρύθμισης οφειλών.',
  }
  const banksSection = hasBanks ? {
    type: 'info', icon: 'ℹ️', label: 'Παρατήρηση (Τράπεζες)',
    body: 'Το αποτέλεσμα του εργαλείου προσομοιώνει την πρόταση του αλγορίθμου της πλατφόρμας του Εξωδικαστικού Μηχανισμού. Η προσομοιωμένη πρόταση υιοθετείται από το Δημόσιο (ΕΦΚΑ & ΑΑΔΕ) και αποστέλλεται προς τις Τράπεζες. Οι Τράπεζες έχουν δικαίωμα είτε να αποδεχθούν την αυτοματοποιημένη πρόταση του συστήματος είτε να υποβάλουν επίσημα «Αντιπρόταση Πιστωτών». Όταν υποβάλλεται Αντιπρόταση, συνήθως είναι δυσμενέστερη και αυστηρότερη από την πρόταση του συστήματος.',
  } : null

  function sections(resultSection) {
    return [debtSection, incomeSection, assetSection, resultSection, noteSection, banksSection].filter(Boolean)
  }

  if (scenario === 0) {
    return {
      title: 'Πρόβλεψη Ρύθμισης – Νομικό Πρόσωπο',
      sections: sections({
        type: 'success', icon: '✅', label: 'Εκτίμηση Αποτελέσματος',
        body: `Διαθέσιμο μηνιαίο ποσό για εξυπηρέτηση: ${fmt(dispMonthly)}\nΕκτιμώμενη διαγραφή: ${sumWr > 0 ? `${fmt(sumWr)} (${sumWrPct}%)` : 'Δεν απαιτείται'}\nΕναπομένουσα οφειλή: ${fmt(totalRemaining)}\nΔιάρκεια ρύθμισης: ${durationPhrase}\nΣυνολική μηνιαία δόση: ${fmt(totalMonthlyPay)} (${ratio}% εισοδήματος)`,
      }),
    }
  }

  if (scenario === 1) {
    return {
      title: 'Πρόβλεψη Ρύθμισης – Οικονομικά Ισχυρό Προφίλ',
      sections: sections({
        type: 'success', icon: '✅', label: 'Εκτίμηση Αποτελέσματος',
        body: `• Επαρκές εισόδημα — δεν απαιτείται διαγραφή.\n• Διαθέσιμο μηνιαίο εισόδημα: ${fmt(dispMonthly)}\n• Διάρκεια ρύθμισης: ${durationPhrase}\n• Συνολική μηνιαία δόση: ${fmt(totalMonthlyPay)} (${ratio}% εισοδήματος)`,
      }),
    }
  }

  if (scenario === 2) {
    return {
      title: 'Πρόβλεψη Ρύθμισης – Δυνητικό "Κούρεμα" Οφειλών',
      sections: sections({
        type: 'success', icon: '✅', label: 'Εκτίμηση Αποτελέσματος',
        body: `• Προκύπτει περιθώριο μερικής διαγραφής.\n• Θεωρητικά εκτιμώμενη διαγραφή: ${fmt(sumWr)} (${sumWrPct}%)\n• Εναπομένουσα οφειλή μετά τη διαγραφή: ${fmt(totalRemaining)}\n• Συνολική μηνιαία δόση: ${fmt(totalMonthlyPay)} (${ratio}% εισοδήματος)\n• Διάρκεια ρύθμισης: ${durationPhrase}`,
      }),
    }
  }

  if (scenario === 3) {
    return {
      title: 'Πρόβλεψη Ρύθμισης – Ισχυρό Δικαίωμα Διαγραφής',
      sections: sections({
        type: 'success', icon: '✅', label: 'Εκτίμηση Αποτελέσματος',
        body: `• Τεκμηριωμένη οικονομική αδυναμία — μέγιστη διαγραφή.\n• Θεωρητικά εκτιμώμενη διαγραφή: ${fmt(sumWr)} (${sumWrPct}%)\n• Εναπομένουσα οφειλή μετά τη διαγραφή: ${fmt(totalRemaining)}\n• Συνολική μηνιαία δόση: ${fmt(totalMonthlyPay)} (${ratio}% εισοδήματος)\n• Διάρκεια ρύθμισης: ${durationPhrase}`,
      }),
    }
  }

  if (scenario === 4) {
    return {
      title: 'Πρόβλεψη Ρύθμισης – Χαμηλό Εισόδημα με Πλήρη Κάλυψη από Περιουσία',
      sections: sections({
        type: 'success', icon: '✅', label: 'Εκτίμηση Αποτελέσματος',
        body: `• Η περιουσία καλύπτει πλήρως τις οφειλές — δεν απαιτείται θεωρητικά διαγραφή.\n• Εναπομένουσα οφειλή: ${fmt(totalRemaining)}\n• Συνολική μηνιαία δόση: ${fmt(totalMonthlyPay)}`,
      }),
    }
  }

  // scenario 5
  return {
    title: 'Πρόβλεψη Ρύθμισης – Χαμηλό Εισόδημα με Μερική Κάλυψη από Περιουσία',
    sections: sections({
      type: 'success', icon: '✅', label: 'Εκτίμηση Αποτελέσματος',
      body: `• Προκύπτει θεωρητικά αδιάσωστο ποσό, άρα υπάρχει περιθώριο μερικής διαγραφής.\n• Θεωρητικά εκτιμώμενη διαγραφή: ${fmt(sumWr)} (${sumWrPct}%)\n• Εναπομένουσα οφειλή μετά τη διαγραφή: ${fmt(totalRemaining)}\n• Συνολική μηνιαία δόση: ${fmt(totalMonthlyPay)}`,
    }),
  }
}
