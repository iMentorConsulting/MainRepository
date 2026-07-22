// ============================================================
// Core financial calculations — Sprint 1 (ΚΥΑ 13243/2024)
// ============================================================
import { PARAMS_B, CONSERVATIVE_FACTORS } from './calculationParams'

export function PMT(rate, nper, pv) {
  if (!pv || pv <= 0 || !nper || nper <= 0) return 0
  if (rate === 0) return pv / nper
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

// VAT Calculation (fixed 24% per Greek law)
const VAT_RATE = 0.24

export function calculateVAT(netAmount) {
  if (!netAmount || netAmount <= 0) return 0
  return Math.round(netAmount * VAT_RATE * 100) / 100
}

export function getGrossAmount(netAmount) {
  if (!netAmount || netAmount <= 0) return 0
  return Math.round((netAmount + calculateVAT(netAmount)) * 100) / 100
}

export function formatOfferWithVAT(netAmount) {
  const net = Number(netAmount) || 0
  const vat = calculateVAT(net)
  const gross = net + vat
  return {
    net: net,
    vat: Math.round(vat),
    gross: Math.round(gross),
    formatted: `${fmt(net)} + ΦΠΑ = ${fmt(Math.round(gross))}`
  }
}

// Banking details - Apostolakis Charalampos (Individual Business / Ατομική Επιχείρηση)
export const COMPANY_BANKING_DETAILS = {
  beneficiary: 'Αποστολάκης Χαράλαμπος',
  banks: [
    { name: 'Πειραιώς', iban: 'GR9401727540005754096471354' },
    { name: 'Alpha Bank', iban: 'GR0901407750775002002010585' },
    { name: 'Eurobank', iban: 'GR8102601680000070200668063' },
  ]
}

export function getBankingDetailsText() {
  const bankLines = COMPANY_BANKING_DETAILS.banks
    .map(b => `${b.name}: ${b.iban}`)
    .join('\n')
  return `\n\n🏦 *Τραπεζικοί Λογαριασμοί:*\n${bankLines}\nΔικαιούχος: *${COMPANY_BANKING_DETAILS.beneficiary}*`
}

// Withholding tax calculation (20% for amounts > €305 net value, only for business entities)
// εξαιρούνται: μισθωτός, συνταξιούχος (ΑΠΥ - no withholding)
// Note: incomeSubType is passed when available (from income_data); debtorType is fallback for legacy calls
export function calculateOfferWithWithholding(netAmount, debtorTypeOrIncomeSubType) {
  const net = Number(netAmount) || 0
  const vat = calculateVAT(net)
  const grossBeforeTax = net + vat

  // Check if withholding applies: NO for μισθωτός/συνταξιούχος, YES for νομικό πρόσωπο/επιτηδευματίας
  // incomeSubType='Μισθωτός' or 'Επιτηδευματίας' takes precedence (from income_data)
  // Fall back to checking if debtorType === 'Μισθωτός' for legacy calls
  const isEmployeeOrPensioner = debtorTypeOrIncomeSubType === 'Μισθωτός'
  const hasWithholding = !isEmployeeOrPensioner && net > 305

  // Calculate withholding tax if applicable (20% of NET amount, not gross)
  const withholding = hasWithholding ? Math.round(net * 0.20 * 100) / 100 : 0
  const finalPayable = Math.round((grossBeforeTax - withholding) * 100) / 100

  return {
    net: Math.round(net * 100) / 100,
    vat: Math.round(vat * 100) / 100,
    grossBeforeTax: Math.round(grossBeforeTax * 100) / 100,
    withholding: Math.round(withholding * 100) / 100,
    finalPayable: Math.round(finalPayable * 100) / 100,
    hasWithholding,
    formatted: hasWithholding
      ? `${fmt(net)} + ΦΠΑ 24% = ${fmt(grossBeforeTax)} - Παρακράτηση 20% = ${fmt(finalPayable)}`
      : `${fmt(net)} + ΦΠΑ 24% = ${fmt(finalPayable)}` // No withholding for employees
  }
}

// Payment Tracking (1/2 installments)
export function getPaymentStatus(caseObj) {
  const contactStage = caseObj.contact_stage || 'Νέα Ανάλυση'
  const status = caseObj.status || 'draft'

  // 1st payment (Application & Process): made when case is Έκλεισε or beyond
  const firstPaymentMade = ['Έκλεισε', 'Αποδοχή Ρύθμισης', 'Απόρριψη Ρύθμισης'].includes(contactStage)

  // 2nd payment (Success Fee): made when status is completed
  const secondPaymentMade = status === 'completed'

  return {
    total: 2,
    completed: (firstPaymentMade ? 1 : 0) + (secondPaymentMade ? 1 : 0),
    firstPaymentMade: firstPaymentMade,
    secondPaymentMade: secondPaymentMade,
    formatted: firstPaymentMade ? (secondPaymentMade ? '2/2' : '1/2') : '0/2',
    stages: {
      'Αίτηση & Διαδικασία': firstPaymentMade,
      'Success Fee': secondPaymentMade
    }
  }
}

export function creditorDisplayName(type, creditorName = '') {
  const name = String(creditorName || '').trim()
  if (type === 'Εφορία') return 'ΑΑΔΕ'
  if (type === 'Ασφαλιστικά Ταμεία') return 'ΕΦΚΑ-ΚΕΑΟ'
  if (type === 'Τράπεζα') return name || 'ΤΡΑΠΕΖΑ'
  return name || type || 'ΠΙΣΤΩΤΗΣ'
}

// ---- internal helpers ----

function isPublicDebt(type) {
  return type === 'Εφορία' || type === 'Ασφαλιστικά Ταμεία'
}

function getPromoRate(type, isSecured, params) {
  if (isPublicDebt(type)) return params.publicRate
  return isSecured ? params.promoRateSecured : params.promoRateUnsecured
}

function getPostPromoRate(type, isSecured, params) {
  if (isPublicDebt(type)) return params.publicRate
  const spread = isSecured ? params.securedSpreadAfterPromo : params.unsecuredSpreadAfterPromo
  return params.euribor3m + spread
}

function getMaxMonths(type, isLegalEntity, isSecured, params) {
  if (isPublicDebt(type)) return params.maxMonths.publicMax
  if (isLegalEntity) return isSecured ? params.maxMonths.leSecured : params.maxMonths.leUnsecured
  return isSecured ? params.maxMonths.fpSecured : params.maxMonths.fpUnsecured
}

function effectiveMaxMonths(theoretical, isLegalEntity, youngestAge, params) {
  if (isLegalEntity || !youngestAge || youngestAge <= 0) return theoretical
  const ageLimit = Math.max(12, (params.ageCap - youngestAge) * 12)
  return Math.min(theoretical, ageLimit)
}

// remaining balance after nPayments at monthlyRate
function loanBalance(pv, monthlyRate, payment, nPayments) {
  if (monthlyRate === 0) return pv - payment * nPayments
  const f = Math.pow(1 + monthlyRate, nPayments)
  return pv * f - payment * (f - 1) / monthlyRate
}

// Step-up PMT: promo payment c1, post-promo payment c2
export function stepUpPMT(amount, totalMonths, r1Annual, r2Annual, promoMonths) {
  if (!amount || amount <= 0 || !totalMonths || totalMonths <= 0) return { c1: 0, c2: 0 }
  const r1 = r1Annual / 12
  const r2 = r2Annual / 12
  if (totalMonths <= promoMonths || r1 === r2) {
    const c = PMT(r1, totalMonths, amount)
    return { c1: c, c2: c }
  }
  const c1 = PMT(r1, totalMonths, amount)
  const bal = Math.max(0, loanBalance(amount, r1, c1, promoMonths))
  const c2 = PMT(r2, totalMonths - promoMonths, bal)
  return { c1, c2 }
}

// c1/c2 values for a single debt (used in greedy loop)
function debtC2(amount, months, type, isSecured, params) {
  if (!amount || amount <= 0 || !months || months <= 0) return 0
  const r1 = getPromoRate(type, isSecured, params)
  const r2 = getPostPromoRate(type, isSecured, params)
  return stepUpPMT(amount, months, r1, r2, params.promoMonths).c2
}

function debtC1(amount, months, type, isSecured, params) {
  if (!amount || amount <= 0 || !months || months <= 0) return 0
  const r1 = getPromoRate(type, isSecured, params)
  const r2 = getPostPromoRate(type, isSecured, params)
  return stepUpPMT(amount, months, r1, r2, params.promoMonths).c1
}

// backward-compatible export (still used by DebtTable display)
export function maxMonthsByType(type, amount) {
  if (String(type).includes('Τράπεζ')) return amount > 99999 ? 420 : 300
  return 240
}

// ============================================================
// Income computation (independent of debts — for preview display)
// ============================================================
export function computeIncomeFromData(incomeData) {
  const isLE = incomeData.debtorType === 'Νομικό Πρόσωπο'

  if (isLE) {
    // Legal entity: use KE/profits data
    const ke_t1 = incomeData.ke_t1 || 0
    const ke_t2 = incomeData.ke_t2 || 0
    const ke_t3 = incomeData.ke_t3 || 0
    const use3Year = ke_t1 > 0 || ke_t2 > 0 || ke_t3 > 0

    if (use3Year) {
      const kerdh_t1 = incomeData.kerdh_t1 ?? 0
      const kerdh_t2 = incomeData.kerdh_t2 ?? 0
      const kerdh_t3 = incomeData.kerdh_t3 ?? 0
      const leEnfia = incomeData.leEnfia || 0
      const diathArr = [
        Math.max(0, kerdh_t1 - leEnfia),
        Math.max(0, kerdh_t2 - leEnfia),
        Math.max(0, kerdh_t3 - leEnfia),
      ].sort((a, b) => b - a)
      return (diathArr[0] + diathArr[1]) / 2
    } else {
      const netProfits = incomeData.netProfits != null ? incomeData.netProfits : (incomeData.ebitda || 0)
      const leEnfia = incomeData.leEnfia || 0
      return Math.max(0, netProfits - leEnfia)
    }
  } else {
    // FP: use 3-year income data
    const fpSubType = incomeData.fpSubType || 'Μισθωτός'
    const t1 = incomeData.fp_income_t1 || 0
    const t2 = incomeData.fp_income_t2 || 0
    const t3 = incomeData.fp_income_t3 || 0

    if (fpSubType === 'Μισθωτός') {
      // Average of top-2 income years
      const sortedIncomes = [t1, t2, t3].sort((a, b) => b - a)
      return (sortedIncomes[0] + sortedIncomes[1]) / 2
    } else {
      // Επιτηδευματίας: use year T income
      return t1
    }
  }
}

// ============================================================
// Main calculation
// ============================================================
export function calculateAll(debts, assets, incomeData, params = PARAMS_B) {
  const isLE = incomeData.debtorType === 'Νομικό Πρόσωπο'
  const youngestAge = isLE ? 0 : (incomeData.debtorAge || 0)

  // --- rows ---
  const rows = debts
    .filter((d) => (d.amount || 0) > 0)
    .map((d, i) => {
      const intPct = Math.min(100, Math.max(0, d.interestPct || 0))
      const amount = d.amount || 0
      const isSecured = !!(d.mortgaged)
      const type = d.type || 'Τράπεζα'
      const isPub = type === 'Εφορία' || type === 'Ασφαλιστικά Ταμεία'
      return {
        idx: i, id: d.id, type, creditorName: d.creditorName || '',
        mort: isSecured, prop: d.propertyValue || 0, amount,
        intPct, prinAmt: amount * (100 - intPct) / 100,
        intAmt: amount * intPct / 100,
        status: d.status || 'Ληξιπρόθεσμη', isSecured,
        pubCategories: (isPub && d.pubCategories) ? d.pubCategories : null,
      }
    })

  const sumDebt = rows.reduce((a, r) => a + r.amount, 0)

  // --- assets: other props + countable FP savings ---
  const propsRaw = (assets || []).reduce((a, p) => a + (p.value || 0), 0)
  const fpSize = isLE ? 1 : Math.max(1, incomeData.householdSize || 1)
  let countableSavings = 0
  if (!isLE) {
    const exempt = Math.min(
      params.fpExemptSavingsBase + params.fpExemptSavingsPerMember * (fpSize - 1),
      params.fpExemptSavingsMax
    )
    countableSavings = Math.max(0, (incomeData.savings || 0) - exempt)
  }
  const propsTotal = propsRaw + countableSavings

  const sumMortRaw = rows.reduce((a, r) => a + (r.mort ? r.prop : 0), 0)
  // Net liquidation: real estate × 0.97; liquid savings at full value
  const sumMortNet = rows.reduce((a, r) => a + (r.mort ? r.prop * params.collateralFactor : 0), 0)
  const freeLiq = propsRaw * params.collateralFactor + countableSavings
  const sumAssetsAfterExp = sumMortNet + freeLiq

  // --- coverage: ΚΠολΔ 977 (correct split per mortgaged + free assets) ---
  // Mortgaged property: 65% to secured creditor, 10% to public (Δημόσιο/ΦΚΑ), 25% to unsecured pro-rata
  //   Unsecured pool includes residual (uncovered) portion of the same mortgage creditor
  // Free assets: 2/3 to public, 1/3 to unsecured pro-rata (same unsecured pool with all residuals)
  const covMap = new Map()
  if (sumAssetsAfterExp >= sumDebt) {
    rows.forEach((r) => covMap.set(r.idx, r.amount))
  } else {
    const recovery = new Map()
    rows.forEach((r) => recovery.set(r.idx, 0))
    const pubRows = rows.filter((r) => isPublicDebt(r.type))
    const pubClaimTotal = pubRows.reduce((a, r) => a + r.amount, 0)
    const unsecBankRows = rows.filter((r) => !r.mort && !isPublicDebt(r.type))

    // Step 1: each mortgaged property (ΚΠολΔ 977)
    const mortResiduals = new Map()
    rows.filter((r) => r.mort && r.prop > 0).forEach((r) => {
      const liq = r.prop * params.collateralFactor
      const secured65 = Math.min(0.65 * liq, r.amount)
      recovery.set(r.idx, (recovery.get(r.idx) || 0) + secured65)
      mortResiduals.set(r.idx, Math.max(0, r.amount - secured65))
      // 25% to general privilege (γενικά προνόμια — ΚΥΑ 67360 άρθρο 8Γ §2α.αα); surplus from capped 65% also flows here
      const surplus65 = Math.max(0, 0.65 * liq - r.amount)
      const genPool = 0.25 * liq + surplus65
      if (pubClaimTotal > 0) {
        pubRows.forEach((p) => recovery.set(p.idx, (recovery.get(p.idx) || 0) + genPool * p.amount / pubClaimTotal))
      }
      // 10% to unsecured pro-rata — includes residual of this mortgage creditor
      const unsecPool = 0.10 * liq
      const unsecClaims = [
        ...unsecBankRows.map((u) => ({ idx: u.idx, amount: u.amount })),
        ...(mortResiduals.get(r.idx) > 0 ? [{ idx: r.idx, amount: mortResiduals.get(r.idx) }] : []),
      ]
      const unsecClaimTotal = unsecClaims.reduce((a, u) => a + u.amount, 0)
      if (unsecClaimTotal > 0) {
        unsecClaims.forEach((u) => recovery.set(u.idx, (recovery.get(u.idx) || 0) + unsecPool * u.amount / unsecClaimTotal))
      }
    })

    // Step 2: free assets — 70% general privilege, 30% unsecured (ΚΥΑ 67360 άρθρο 8Γ §2β)
    if (freeLiq > 0) {
      const freeGenPool = 0.70 * freeLiq
      if (pubClaimTotal > 0) {
        pubRows.forEach((r) => recovery.set(r.idx, (recovery.get(r.idx) || 0) + freeGenPool * r.amount / pubClaimTotal))
      }
      const freeUnsecPool = 0.30 * freeLiq
      const freeUnsecClaims = [
        ...unsecBankRows.map((u) => ({ idx: u.idx, amount: u.amount })),
        ...Array.from(mortResiduals.entries()).filter(([, v]) => v > 0).map(([i, v]) => ({ idx: i, amount: v })),
      ]
      const freeUnsecTotal = freeUnsecClaims.reduce((a, u) => a + u.amount, 0)
      if (freeUnsecTotal > 0) {
        freeUnsecClaims.forEach((u) => recovery.set(u.idx, (recovery.get(u.idx) || 0) + freeUnsecPool * u.amount / freeUnsecTotal))
      }
    }

    // Step 3: cap at debt amount
    rows.forEach((r) => covMap.set(r.idx, Math.min(recovery.get(r.idx) || 0, r.amount)))
  }

  // --- write-off caps ---
  const analysisRows = rows.map((r) => {
    const cov = covMap.get(r.idx) || 0
    const uncov = Math.max(0, r.amount - cov)
    const isPub = isPublicDebt(r.type)
    let legalMax
    if (isPub && r.pubCategories) {
      // Per-category write-off rates (ΚΥΑ 13243/2024)
      // nonErasableBasic → 0%; its surcharges still follow 85% rule
      const cats = r.pubCategories
      const cr = params.pubCategoryRates
      legalMax = (cats.nonErasableSurcharges ?? 0) * cr.nonErasableSurcharges
               + (cats.otherBasic              ?? 0) * cr.otherBasic
               + (cats.otherSurcharges         ?? 0) * cr.otherSurcharges
               + (cats.fines                   ?? 0) * cr.fines
               + (cats.surcharges              ?? 0) * cr.otherSurcharges // legacy key compat
    } else {
      const capPrin = isPub ? (1 - params.recovery.publicPrincipalMin) : (1 - params.recovery.bankPrincipalMin)
      const capInt  = isPub ? params.recovery.publicInterestWriteoffMax : params.recovery.bankInterestWriteoffMax
      legalMax = r.prinAmt * capPrin + r.intAmt * capInt
    }
    // partially-secured rule
    if (r.mort && r.prop > 0) {
      const netColl = r.prop * params.collateralFactor
      if (netColl > r.amount * params.partiallySecuredThreshold) {
        legalMax = Math.max(legalMax, Math.max(0, r.amount - netColl))
      }
    }
    const calc = Math.min(uncov, legalMax)
    const capPct = params.writeoffCapPct > 0 && params.writeoffCapPct < 100 ? params.writeoffCapPct : null
    const calcCapped = capPct != null ? Math.min(calc, r.amount * capPct / 100) : calc
    return {
      ...r, cov, covPct: r.amount ? Math.round(cov * 100 / r.amount) : 0,
      uncov, legalMax, calc: calcCapped,
      calcCapped: capPct != null && calc > calcCapped ? capPct : null,
      calcPct: r.amount ? Math.round(calcCapped * 100 / r.amount) : 0,
      remaining: Math.max(0, r.amount - calcCapped),
    }
  })
  const sumMaxWriteoff = analysisRows.reduce((a, r) => a + r.calc, 0)

  // --- income ---
  let dispAnnual = 0, totalExpenses = 0, annualIncome = 0
  let dispYear1 = 0, dispYear24 = 0, dispYear5 = 0
  let flagMaxDoses = false, isFPEpit = false, leMoDispMonthly = 0, leFloorMonthly = 0
  let fpRatio = 1, fpFamilyIncome = 0, fpSpouseIncome = 0
  let fpDispFromAvg = 0, fpAvg2Income = 0
  let fpEulogoMarginPct = null, fpEulogoPresumedIncome = 0, fpEulogoNote = null
  if (isLE) {
    const ke_t1 = incomeData.ke_t1 || 0
    const ke_t2 = incomeData.ke_t2 || 0
    const ke_t3 = incomeData.ke_t3 || 0
    const use3Year = ke_t1 > 0 || ke_t2 > 0 || ke_t3 > 0

    if (use3Year) {
      const kerdh_t1 = incomeData.kerdh_t1 ?? 0
      const kerdh_t2 = incomeData.kerdh_t2 ?? 0
      const kerdh_t3 = incomeData.kerdh_t3 ?? 0
      const leEnfia = incomeData.leEnfia || 0
      const deposits = incomeData.deposits || 0

      // Classification: ΜΙΚΡΗ if all 3 KE < 2.5M AND bank debt < 5M (ΚΥΑ 7712925/2025)
      const bankDebt = rows.filter((r) => r.type === 'Τράπεζα').reduce((s, r) => s + r.amount, 0)
      const isMikri = ke_t1 < params.leTurnoverThreshold
                   && ke_t2 < params.leTurnoverThreshold
                   && ke_t3 < params.leTurnoverThreshold
                   && bankDebt < 5_000_000

      // Per-year disposable = MAX(0, Κέρδη_x − ΕΝΦΙΑ); no interest added (ΚΥΑ 7712925/2025)
      const diathArr = [
        Math.max(0, kerdh_t1 - leEnfia),
        Math.max(0, kerdh_t2 - leEnfia),
        Math.max(0, kerdh_t3 - leEnfia),
      ].sort((a, b) => b - a)

      // Average of top 2 years (exclude lowest)
      const mo_diath = (diathArr[0] + diathArr[1]) / 2

      // 10% floor check for small category
      let finalDiath = mo_diath
      if (isMikri && ke_t1 > 0) {
        const floor10 = ke_t1 * params.leIncomeFloorPct
        leMoDispMonthly = mo_diath / 12
        leFloorMonthly = floor10 / 12
        if (mo_diath < floor10) {
          finalDiath = floor10
          flagMaxDoses = true
        }
      }

      // ΚΥΑ 7712925/2025: no statutory working capital % — deposits counted at 95% over 20 years
      const freeDeposits = deposits
      // 95% of deposits spread over 20-year typical duration
      const annualDeposit = (freeDeposits * params.leDepositRate) / 20

      dispAnnual = finalDiath + annualDeposit
    } else {
      // Legacy single-year logic (backward compat for cases saved before 3-year fields)
      const turnover = incomeData.turnover || 0
      const netProfits = incomeData.netProfits != null ? incomeData.netProfits : (incomeData.ebitda || 0)
      const leEnfia = incomeData.leEnfia || 0
      const deposits = incomeData.deposits || 0
      const isSmall = turnover > 0 && turnover < params.leTurnoverThreshold
      const base = Math.max(0, netProfits - leEnfia)
      const floored = isSmall ? Math.max(base, turnover * params.leIncomeFloorPct) : base
      dispAnnual = floored + deposits * params.leDepositRate
    }
    dispYear1 = dispYear24 = dispYear5 = dispAnnual
  } else {
    const fpSubType = incomeData.fpSubType || 'Μισθωτός'
    isFPEpit = fpSubType === 'Επιτηδευματίας'

    // Rent cap (ΚΥΑ Παράρτημα παρ. δ) — applied before ratio allocation
    const rentCapMonthly = Math.min(params.rentCapBase + params.rentCapPerMember * (fpSize - 1), params.rentCapMax)
    const effectiveRent = Math.min(incomeData.rentCost || 0, rentCapMonthly * 12)

    const householdExempt = Math.min(
      params.fpExemptSavingsBase + params.fpExemptSavingsPerMember * (fpSize - 1),
      params.fpExemptSavingsMax
    )

    if (fpSubType === 'Μισθωτός') {
      // ΚΥΑ 67360 άρθρο 7, §7.1: average of top-2 income years (exclude lowest)
      // (No step-up phases unlike Επιτηδευματίας — single flat rate throughout)
      const t1 = incomeData.fp_income_t1 || 0
      const t2 = incomeData.fp_income_t2 || 0
      const t3 = incomeData.fp_income_t3 || 0

      // Sort incomes and use average of top 2 (ΚΥΑ 67360 §7.1)
      const sortedIncomes = [t1, t2, t3].sort((a, b) => b - a)
      const avg2Income = (sortedIncomes[0] + sortedIncomes[1]) / 2
      annualIncome = avg2Income

      // Ratio allocation of shared expenses (ΚΥΑ 67360 άρθρο 1(κ))
      const spIncome = incomeData.spouseIncome || 0
      fpSpouseIncome = spIncome
      fpFamilyIncome = avg2Income + spIncome
      fpRatio = fpFamilyIncome > 0 ? avg2Income / fpFamilyIncome : 1

      const edd = incomeData.householdValue || 0
      // ΕΝΦΙΑ, alimony, student rent: personal obligations — full amount
      totalExpenses = edd * fpRatio + effectiveRent * fpRatio + (incomeData.medicalCost || 0) * fpRatio +
        (incomeData.enfiaCost || 0) + (incomeData.studentRentCost || 0) + (incomeData.alimonyCost || 0)

      const savingsAdd = countableSavings / 20

      if (t1 > 0 || t2 > 0 || t3 > 0) {
        const disp = Math.max(0, avg2Income - totalExpenses) * 0.8 + savingsAdd
        dispYear1 = dispYear24 = dispYear5 = disp
      } else {
        // Legacy fallback (no 3-year data) — use legacy annualIncome but preserve annualIncome already set from avg2Income
        const fallbackIncome = incomeData.annualIncome || 0
        const disp = Math.max(0, fallbackIncome - totalExpenses) * 0.8 + savingsAdd
        dispYear1 = dispYear24 = dispYear5 = disp
      }
      dispAnnual = dispYear1

    } else if (fpSubType === 'Επιτηδευματίας') {
      // 3-phase income caps — ΦΕΚ Β' 2499/2021 §9, ΚΥΑ 67360 άρθρο 8Α §5
      // Direct platform income from ΕΓΔΙΧ: "Ετήσιο Ατομικό Εισόδημα Οφειλέτη"
      const fp_ke_t1 = incomeData.fp_ke_t1 || 0
      const y1 = incomeData.fp_income_t1 || 0
      const y2 = incomeData.fp_income_t2 || 0
      const y3 = incomeData.fp_income_t3 || 0
      annualIncome = y1

      // Ratio allocation
      const spIncome = incomeData.spouseIncome || 0
      fpSpouseIncome = spIncome
      fpFamilyIncome = y1 + spIncome
      fpRatio = fpFamilyIncome > 0 ? y1 / fpFamilyIncome : 1

      const edd = incomeData.householdValue || 0
      totalExpenses = edd * fpRatio + effectiveRent * fpRatio + (incomeData.medicalCost || 0) * fpRatio +
        (incomeData.enfiaCost || 0) + (incomeData.alimonyCost || 0)

      // ΚΥΑ 67360 §9.viii: no KE% reserve for FP — only household exempt (personal accounts)
      // Business account surplus (above 12m average) not tracked separately → use householdExempt only
      const freeSavings = Math.max(0, (incomeData.savings || 0) - householdExempt)
      const savingsAdd = freeSavings / 20

      // Stage 1: KPA from year T
      const kpa1 = Math.max(0, y1 - totalExpenses) * 0.8
      const dispFromY1 = kpa1 + savingsAdd

      // Stage 2/3: average of top-2 KPA values (ΚΥΑ 67360 άρθρο 8Α §5.ii.α — sort KPAs not raw incomes)
      const kpa2 = Math.max(0, y2 - totalExpenses) * 0.8
      const kpa3 = Math.max(0, y3 - totalExpenses) * 0.8
      const sortedKpa = [kpa1, kpa2, kpa3].sort((a, b) => b - a)
      const avg2kpa = (sortedKpa[0] + sortedKpa[1]) / 2

      // "Εύλογο ποσοστό κέρδους επί κύκλου εργασιών" (ΚΥΑ 77697/2021 §7.1 περ.4 / ΚΥΑ 67360/2021 άρθρο 8Α περ.4,
      // όπως ισχύει μετά το ΦΕΚ Β' 1253/13.03.2025): όταν περιθώριο κέρδους = Εισόδημα_Τ / ΚΕ_Τ < 10%,
      // το ετήσιο εισόδημα τεκμαίρεται στο 10% × ΚΕ_Τ (μόνο προς τα πάνω) και ΑΑΔΕ/ΕΦΚΑ ορίζονται στο
      // ανώτατο όριο των 240 δόσεων (ΦΕΚ Β' 2499/2021 άρθρο 7 / όρος 7.13, με το cap ηλικίας να υπερισχύει αν είναι μικρότερο)
      const eulogoPct = incomeData.fp_eulogo_pct != null ? incomeData.fp_eulogo_pct / 100 : params.fpSelfEmployedFloorPct
      const eulogoFloorIncome = fp_ke_t1 * eulogoPct
      let disp1 = dispFromY1
      if (fp_ke_t1 > 0 && y1 < eulogoFloorIncome) {
        fpEulogoMarginPct = (y1 / fp_ke_t1) * 100
        fpEulogoPresumedIncome = eulogoFloorIncome
        const presumedKpa1 = Math.max(0, eulogoFloorIncome - totalExpenses) * 0.8
        const dispFromPresumed = presumedKpa1 + savingsAdd
        leMoDispMonthly = dispFromY1 / 12
        leFloorMonthly = dispFromPresumed / 12
        disp1 = Math.max(dispFromY1, dispFromPresumed)
        flagMaxDoses = true
        fpEulogoNote = `⚠️ Εφαρμόστηκε ο κανόνας εύλογου ποσοστού κέρδους (ΚΥΑ 77697/2021 §7.1.4, όπως ισχύει): περιθώριο κέρδους ${fpEulogoMarginPct.toFixed(1).replace('.', ',')}% < 10% → το διαθέσιμο εισόδημα αναπροσαρμόστηκε σε ${fmt(fpEulogoPresumedIncome)} (10% × ΚΕ Τ) και επιβλήθηκε ο μέγιστος αριθμός δόσεων (240 μήνες) σε ΑΑΔΕ και ΕΦΚΑ.`
      }

      dispYear1 = disp1
      dispYear24 = Math.max(disp1, avg2kpa * 0.65 + savingsAdd)
      dispYear5  = Math.max(disp1, avg2kpa + savingsAdd)
      dispAnnual = dispYear1
      fpDispFromAvg = avg2kpa  // KPA average — raw base for Stage 2/3 display (before max & savingsAdd)
      fpAvg2Income = avg2kpa   // same — shown in info panel

    } else {
      // Legacy: single annualIncome (FP cases created before fpSubType field) — backward compat
      const rentCapMonthly2 = Math.min(params.rentCapBase + params.rentCapPerMember * (fpSize - 1), params.rentCapMax)
      const effectiveRent2 = Math.min(incomeData.rentCost || 0, rentCapMonthly2 * 12)
      totalExpenses = (incomeData.householdValue || 0) + (incomeData.enfiaCost || 0) +
        (incomeData.medicalCost || 0) + effectiveRent2 +
        (incomeData.studentRentCost || 0) + (incomeData.alimonyCost || 0)
      annualIncome = incomeData.annualIncome || 0
      dispAnnual = Math.max(0, annualIncome - totalExpenses) * 0.8 + countableSavings * params.fpSavingsIncomeRate
      dispYear1 = dispYear24 = dispYear5 = dispAnnual
    }
  }
  const dispMonthly = dispAnnual / 12
  const monthlyIncome = Math.max(0, dispMonthly)
  // 3-phase monthly caps (ΚΥΑ 67360 άρθρο 8Α §5) — for LE all phases are equal
  const monthlyDisp1  = Math.max(0, dispYear1  / 12)
  const monthlyDisp24 = Math.max(0, dispYear24 / 12)
  const monthlyDisp5  = Math.max(0, dispYear5  / 12)

  // --- plan base: compute max months per debt ---
  const planBase = analysisRows.map((r) => {
    const theoretical = getMaxMonths(r.type, isLE, r.isSecured, params)
    const maxM = effectiveMaxMonths(theoretical, isLE, youngestAge, params)
    // εύλογο ποσοστό κέρδους rule (FP Επιτηδευματίας) / small-LE turnover floor: only ΑΑΔΕ/ΕΦΚΑ
    // (public debts) are forced to the maximum 240 installments — banks/other creditors are unaffected
    // and keep their own normal max-months & greedy-extension behaviour (ΚΥΑ 77697/2021 §7.1.4)
    const isForcedMax = flagMaxDoses && isPublicDebt(r.type)
    const initMonths = isForcedMax ? maxM : Math.min(12, maxM)
    return {
      idx: r.idx, type: r.type, isSecured: r.isSecured,
      amount: r.amount, months: initMonths, maxMonths: maxM,
      legalMax: r.legalMax, calc: r.calc, writeoff: 0, newAmt: r.amount,
    }
  })

  // --- Plan A: greedy month extension — dual constraint (c1 ≤ cap1 year-1, c2 ≤ cap24 years-2-4) ---
  // ΚΥΑ 67360 άρθρο 8Α §5: promo payment (c1) must fit year-1 income; post-promo (c2) fits years-2-4
  const planA = planBase.map((p) => ({ ...p }))
  const sumFn = (plan, fn) => plan.reduce((s, p) => s + fn(p.newAmt, p.months, p.type, p.isSecured, params), 0)
  let sc1 = sumFn(planA, debtC1)
  let sc2 = sumFn(planA, debtC2)

  while (true) {
    const c1ok = monthlyDisp1 <= 0 || sc1 <= monthlyDisp1
    const c2ok = monthlyDisp24 <= 0 || sc2 <= monthlyDisp24
    if (c1ok && c2ok) break
    // Extend the debt that most reduces the more-violated constraint
    const useC1 = !c1ok && (c2ok || (sc1 - monthlyDisp1) >= (sc2 - monthlyDisp24))
    const fn = useC1 ? debtC1 : debtC2
    let bestI = -1, bestGain = 0
    planA.forEach((p, i) => {
      const nextM = p.months + 1
      if (nextM > p.maxMonths) return
      const gain = fn(p.newAmt, p.months, p.type, p.isSecured, params)
                 - fn(p.newAmt, nextM,   p.type, p.isSecured, params)
      if (gain > bestGain) { bestGain = gain; bestI = i }
    })
    if (bestI === -1) break
    planA[bestI].months++
    sc1 = sumFn(planA, debtC1)
    sc2 = sumFn(planA, debtC2)
  }

  // --- write-off binary search if still infeasible ---
  const isFeasible = (p) => {
    const s1 = sumFn(p, debtC1), s2 = sumFn(p, debtC2)
    return (monthlyDisp1 <= 0 || s1 <= monthlyDisp1) && (monthlyDisp24 <= 0 || s2 <= monthlyDisp24)
  }
  let best = null
  if (monthlyDisp1 <= 0 && monthlyDisp24 <= 0) {
    // Zero income across all phases: max months + max legal write-offs
    const plan = planA.map((p) => {
      const ref = analysisRows.find((r) => r.idx === p.idx)
      const wr = Math.min(ref ? ref.calc : 0, p.amount)
      return { ...p, writeoff: wr, newAmt: Math.max(0, p.amount - wr), months: p.maxMonths }
    })
    best = { plan }
  } else if (isFeasible(planA)) {
    best = { plan: planA }
  } else {
    const capTotal = analysisRows.reduce((s, r) => s + (r.calc || 0), 0)
    for (let step = 0; step <= 100; step++) {
      const scale = capTotal > 0 ? step / 100 : 0
      const plan = planA.map((p) => {
        const ref = analysisRows.find((r) => r.idx === p.idx)
        const maxWr = ref ? ref.calc : 0
        const wr = Math.min(maxWr * scale, maxWr, p.amount)
        const newAmt = Math.max(0, p.amount - wr)
        return { ...p, writeoff: wr, newAmt }
      })
      if (isFeasible(plan)) { best = { plan }; break }
    }
    if (!best) {
      const plan = planA.map((p) => {
        const ref = analysisRows.find((r) => r.idx === p.idx)
        const wr = Math.min(ref ? ref.calc : 0, p.amount)
        return { ...p, writeoff: wr, newAmt: Math.max(0, p.amount - wr) }
      })
      best = { plan }
    }
  }
  if (!best?.plan?.length) best = { plan: planA }

  // --- post-process: enforce rules, compute c1/c2 ---
  const finalPlan = best.plan.map((p) => {
    const ref = analysisRows.find((r) => r.idx === p.idx)
    if (!ref) return { ...p, writeoff: 0, newAmt: p.amount, payShown: 0, c1: 0, c2: 0 }

    let safeWr = Math.min(p.writeoff || 0, ref.calc || 0, p.amount)
    if (ref.status === 'Ενήμερη') safeWr = 0
    const capped = ref.calcCapped ?? null
    const newAmt = Math.max(0, p.amount - safeWr)
    let months = Math.min(p.months || p.maxMonths, p.maxMonths)

    const r1 = getPromoRate(p.type, p.isSecured, params)
    const r2 = getPostPromoRate(p.type, p.isSecured, params)
    let { c1, c2 } = stepUpPMT(newAmt, months, r1, r2, params.promoMonths)

    // enforce min installment for public debts
    if (isPublicDebt(p.type) && newAmt > 0 && c2 < params.minInstallment.publicTotal) {
      while (months > 1 && c2 < params.minInstallment.publicTotal) {
        months--
        const s = stepUpPMT(newAmt, months, r1, r2, params.promoMonths)
        c1 = s.c1; c2 = s.c2
      }
    }

    const payShown = Math.max(0, Math.floor(c2))

    // Conservative scenario: apply empirical factor to write-off, recompute payments
    const factorC = isPublicDebt(p.type)
      ? CONSERVATIVE_FACTORS.PUBLIC
      : p.isSecured ? CONSERVATIVE_FACTORS.PRIVATE_SECURED : CONSERVATIVE_FACTORS.PRIVATE_UNSECURED
    const writeoffC = Math.min(Math.round(safeWr * factorC), p.amount)
    const newAmtC = Math.max(0, p.amount - writeoffC)
    const { c1: c1c, c2: c2c } = stepUpPMT(newAmtC, months, r1, r2, params.promoMonths)

    return {
      idx: p.idx, type: p.type, creditorName: ref.creditorName, isSecured: p.isSecured,
      amount: p.amount, capped, writeoff: safeWr,
      writeoffPct: p.amount ? Math.round(safeWr * 100 / p.amount) : 0,
      newAmt, months,
      c1: Math.max(0, Math.floor(c1)),
      c2: Math.max(0, Math.floor(c2)),
      payShown,
      incomePct: monthlyIncome > 0 ? Math.round(payShown / monthlyIncome * 100) : 0,
      // Conservative scenario fields
      factorC, writeoffC,
      writeoffPctC: p.amount ? Math.round(writeoffC * 100 / p.amount) : 0,
      newAmtC, c1C: Math.max(0, Math.floor(c1c)), c2C: Math.max(0, Math.floor(c2c)),
      payShownC: Math.max(0, Math.floor(c2c)),
    }
  })

  const sumWr = finalPlan.reduce((s, p) => s + (p.writeoff || 0), 0)
  const totalRemaining = finalPlan.reduce((s, p) => s + (p.newAmt || 0), 0)
  const totalMonthlyPay = finalPlan.reduce((s, p) => s + (p.payShown || 0), 0)
  const totalC1 = finalPlan.reduce((s, p) => s + p.c1, 0)
  // ratio vs year1 (display); ratio5 vs years5+ (scenario logic — uses long-term income)
  const ratio  = monthlyIncome  > 0 ? Math.round(totalMonthlyPay / monthlyIncome  * 100) : 0
  const ratio5 = monthlyDisp5   > 0 ? Math.round(totalMonthlyPay / monthlyDisp5   * 100) : 0
  // Conservative scenario aggregates
  const sumWrC = finalPlan.reduce((s, p) => s + p.writeoffC, 0)
  const totalRemainingC = finalPlan.reduce((s, p) => s + p.newAmtC, 0)
  const totalMonthlyPayC = finalPlan.reduce((s, p) => s + p.payShownC, 0)
  const totalC1C = finalPlan.reduce((s, p) => s + p.c1C, 0)
  const ratioC = monthlyIncome > 0 ? Math.round(totalMonthlyPayC / monthlyIncome * 100) : 0

  const isFullCoveredByAssets = sumDebt > 0 && sumAssetsAfterExp >= sumDebt
  const isPartialCoveredByAssets = sumDebt > 0 && sumAssetsAfterExp > 0 && sumAssetsAfterExp < sumDebt
  // lowIncome uses years5+ — plan is feasible if the long-term income covers the installment
  const lowIncome = monthlyDisp5 <= 0 || ratio5 > 100
  const totalCap = analysisRows.reduce((s, r) => s + (r.calc || 0), 0)

  let scenario = 1
  if (isLE) scenario = 0
  else if (lowIncome && isFullCoveredByAssets) scenario = 4
  else if (lowIncome && isPartialCoveredByAssets && totalCap > 0) scenario = 5
  else if (sumWr === 0 && ratio5 <= 100 && monthlyDisp5 > 0) scenario = 1
  else if (sumWr > 0 && ratio5 <= 100 && monthlyDisp5 > 0) scenario = 2
  else scenario = 3

  return {
    rows, sumDebt, sumAssetsAfterExp, propsTotal, sumMortRaw,
    hasLargeBankDebt: rows.some((r) => r.type === 'Τράπεζα' && r.amount > 99999),
    covMap: Object.fromEntries(covMap), analysisRows, sumMaxWriteoff,
    sumMaxWriteoffPct: sumDebt ? Math.round(sumMaxWriteoff * 100 / sumDebt) : 0,
    annualIncome, totalExpenses,
    dispAnnual: Math.max(0, dispAnnual), dispMonthly: Math.max(0, dispMonthly), monthlyIncome,
    dispYear1: Math.max(0, dispYear1), dispYear24: Math.max(0, dispYear24), dispYear5: Math.max(0, dispYear5),
    monthlyDisp1, monthlyDisp24, monthlyDisp5,
    fpRatio, fpFamilyIncome, fpSpouseIncome,
    finalPlan, sumWr, sumWrPct: sumDebt ? Math.round(sumWr * 100 / sumDebt) : 0,
    totalRemaining, totalMonthlyPay, totalC1, ratio, ratio5,
    sumWrC, sumWrPctC: sumDebt ? Math.round(sumWrC * 100 / sumDebt) : 0,
    totalRemainingC, totalMonthlyPayC, totalC1C, ratioC,
    scenario, lowIncome, isFullCoveredByAssets, isPartialCoveredByAssets,
    flagMaxDoses, isFPEpit, leMoDispMonthly, leFloorMonthly,
    fpDispFromAvg, fpAvg2Income,
    fpEulogoMarginPct, fpEulogoPresumedIncome, fpEulogoNote,
  }
}

// ============================================================
// Scenario narrative text
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

  // Step-up payment display
  const hasStepUp = (finalPlan || []).some((p) => p.c1 != null && p.c2 != null && p.c1 !== p.c2)
  const totalC1 = hasStepUp ? (finalPlan || []).reduce((s, p) => s + (p.c1 ?? p.payShown ?? 0), 0) : 0
  const payLine = hasStepUp
    ? `Δόση Έτη 1–3: ${fmt(totalC1)} | Δόση Έτη 4+: ${fmt(totalMonthlyPay)} (${ratio}% εισοδήματος)`
    : `Συνολική μηνιαία δόση: ${fmt(totalMonthlyPay)} (${ratio}% εισοδήματος)`
  const payLineShort = hasStepUp
    ? `Δόση Έτη 1–3: ${fmt(totalC1)} | Δόση Έτη 4+: ${fmt(totalMonthlyPay)}`
    : `Συνολική μηνιαία δόση: ${fmt(totalMonthlyPay)}`

  const debtSection = {
    type: 'info', icon: 'debt', label: 'Σύνολο Οφειλών',
    body: `Οι συνολικές οφειλές του οφειλέτη ανέρχονται σε ${fmt(sumDebt)}, κατανεμημένες ως εξής:\n• Προς τράπεζες: ${fmt(banksDebt)}\n• Προς ασφαλιστικά ταμεία: ${fmt(fundsDebt)}\n• Προς ΑΑΔΕ / εφορία: ${fmt(taxDebt)}`,
  }
  const incomeSection = {
    type: 'info', icon: 'income', label: 'Εισοδηματικά Στοιχεία',
    body: `Με βάση τα δηλωθέντα στοιχεία, το διαθέσιμο εισόδημα μετά τις εύλογες δαπάνες εκτιμάται σε ${fmt(dispMonthly)} / μήνα.`,
  }
  const assetSection = hasAssets ? {
    type: 'info', icon: 'asset', label: 'Περιουσιακή Εικόνα',
    body: `Η συνολική εκτιμώμενη αξία περιουσιακών στοιχείων ανέρχεται σε ${fmt(sumAssetsAfterExp)}. ${
      calc.isFullCoveredByAssets
        ? 'Η περιουσία καλύπτει πλήρως τις οφειλές.'
        : 'Η περιουσία παρέχει μερική κάλυψη των οφειλών, ωστόσο παραμένει "αδιάσωστο" μέρος της συνολικής οφειλής.'
    }`,
  } : null
  const noteSection = {
    type: 'info', icon: 'note', label: 'Παρατήρηση',
    body: 'Η παρούσα εκτίμηση είναι θεωρητική προσομοίωση και δεν αποτελεί δέσμευση. Η τελική πρόταση θα παραχθεί από το σύστημα του εξωδικαστικού μηχανισμού ρύθμισης οφειλών.',
  }
  const banksSection = hasBanks ? {
    type: 'info', icon: 'bank', label: 'Παρατήρηση (Τράπεζες)',
    body: 'Το αποτέλεσμα του εργαλείου προσομοιώνει την πρόταση του αλγορίθμου της πλατφόρμας του Εξωδικαστικού Μηχανισμού. Η προσομοιωμένη πρόταση υιοθετείται από το Δημόσιο (ΕΦΚΑ & ΑΑΔΕ) και αποστέλλεται προς τις Τράπεζες. Οι Τράπεζες έχουν δικαίωμα είτε να αποδεχθούν την αυτοματοποιημένη πρόταση του συστήματος είτε να υποβάλουν επίσημα «Αντιπρόταση Πιστωτών». Όταν υποβάλλεται Αντιπρόταση, συνήθως είναι δυσμενέστερη και αυστηρότερη από την πρόταση του συστήματος.',
  } : null

  function sections(resultSection) {
    return [debtSection, incomeSection, assetSection, resultSection, noteSection, banksSection].filter(Boolean)
  }

  if (scenario === 0) {
    return {
      title: 'Πρόβλεψη Ρύθμισης – Νομικό Πρόσωπο',
      sections: sections({
        type: 'success', icon: 'result', label: 'Εκτίμηση Αποτελέσματος',
        body: `Διαθέσιμο μηνιαίο ποσό για εξυπηρέτηση: ${fmt(dispMonthly)}\nΕκτιμώμενη διαγραφή: ${sumWr > 0 ? `${fmt(sumWr)} (${sumWrPct}%)` : 'Δεν απαιτείται'}\nΕναπομένουσα οφειλή: ${fmt(totalRemaining)}\nΔιάρκεια ρύθμισης: ${durationPhrase}\n${payLine}`,
      }),
    }
  }
  if (scenario === 1) {
    return {
      title: 'Πρόβλεψη Ρύθμισης – Οικονομικά Ισχυρό Προφίλ',
      sections: sections({
        type: 'success', icon: 'result', label: 'Εκτίμηση Αποτελέσματος',
        body: `• Επαρκές εισόδημα — δεν απαιτείται διαγραφή.\n• Διαθέσιμο μηνιαίο εισόδημα: ${fmt(dispMonthly)}\n• Διάρκεια ρύθμισης: ${durationPhrase}\n• ${payLine}`,
      }),
    }
  }
  if (scenario === 2) {
    return {
      title: 'Πρόβλεψη Ρύθμισης – Δυνητικό "Κούρεμα" Οφειλών',
      sections: sections({
        type: 'success', icon: 'result', label: 'Εκτίμηση Αποτελέσματος',
        body: `• Προκύπτει περιθώριο μερικής διαγραφής.\n• Θεωρητικά εκτιμώμενη διαγραφή: ${fmt(sumWr)} (${sumWrPct}%)\n• Εναπομένουσα οφειλή μετά τη διαγραφή: ${fmt(totalRemaining)}\n• ${payLine}\n• Διάρκεια ρύθμισης: ${durationPhrase}`,
      }),
    }
  }
  if (scenario === 3) {
    return {
      title: 'Πρόβλεψη Ρύθμισης – Ισχυρό Δικαίωμα Διαγραφής',
      sections: sections({
        type: 'success', icon: 'result', label: 'Εκτίμηση Αποτελέσματος',
        body: `• Τεκμηριωμένη οικονομική αδυναμία — μέγιστη διαγραφή.\n• Θεωρητικά εκτιμώμενη διαγραφή: ${fmt(sumWr)} (${sumWrPct}%)\n• Εναπομένουσα οφειλή μετά τη διαγραφή: ${fmt(totalRemaining)}\n• ${payLine}\n• Διάρκεια ρύθμισης: ${durationPhrase}`,
      }),
    }
  }
  if (scenario === 4) {
    return {
      title: 'Πρόβλεψη Ρύθμισης – Χαμηλό Εισόδημα με Πλήρη Κάλυψη από Περιουσία',
      sections: sections({
        type: 'success', icon: 'result', label: 'Εκτίμηση Αποτελέσματος',
        body: `• Η περιουσία καλύπτει πλήρως τις οφειλές — δεν απαιτείται θεωρητικά διαγραφή.\n• Εναπομένουσα οφειλή: ${fmt(totalRemaining)}\n• ${payLineShort}`,
      }),
    }
  }
  return {
    title: 'Πρόβλεψη Ρύθμισης – Χαμηλό Εισόδημα με Μερική Κάλυψη από Περιουσία',
    sections: sections({
      type: 'success', icon: 'result', label: 'Εκτίμηση Αποτελέσματος',
      body: `• Προκύπτει θεωρητικά αδιάσωστο ποσό, άρα υπάρχει περιθώριο μερικής διαγραφής.\n• Θεωρητικά εκτιμώμενη διαγραφή: ${fmt(sumWr)} (${sumWrPct}%)\n• Εναπομένουσα οφειλή μετά τη διαγραφή: ${fmt(totalRemaining)}\n• ${payLineShort}`,
    }),
  }
}
