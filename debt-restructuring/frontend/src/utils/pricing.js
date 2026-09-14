// Automatic commercial offer calculator
// Factors: total debt, bank count, public-only, real estate assets,
// guarantors (auto: any bank debt = guarantors assumed), spouse (manual only),
// write-off percentage from the proposed restructuring plan.

export const DEFAULT_PRICING_CONFIG = {
  minFee: 400,
  maxFee: 2000,
  scoreMax: 7,

  debtBrackets: [
    { upTo: 30000,    score: 0.5 },
    { upTo: 80000,    score: 1.0 },
    { upTo: 200000,   score: 1.5 },
    { upTo: 400000,   score: 2.2 },
    { upTo: 800000,   score: 2.8 },
    { upTo: 9999999,  score: 3.5 },
  ],

  bankBaseBonus: 0.8,
  perBankBonus: 0.3,
  maxBankBonus: 2.0,
  publicOnlyDiscount: 0.4,
  perAssetBonus: 0.5,
  guarantorBonus: 0.5,    // auto-triggered when bank debts exist
  spouseBonus: 0.3,       // manual only
  highIncomeBonus: 0.4,
  highTurnoverBonus: 0.5,
  highIncomeThreshold: 25000,
  highTurnoverThreshold: 100000,

  // Write-off bonus: score added = writeoffPct (0-1) × writeoffMultiplier
  // e.g. 60% writeoff × 1.2 = +0.72 score
  writeoffMultiplier: 1.2,
}

export function loadPricingConfig() {
  try {
    const raw = localStorage.getItem('debt-pricing-config')
    if (raw) return { ...DEFAULT_PRICING_CONFIG, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_PRICING_CONFIG }
}

export function savePricingConfig(config) {
  localStorage.setItem('debt-pricing-config', JSON.stringify(config))
}

/** Count real-estate assets from all available data sources */
function countAssets(debts, assets, income) {
  const fromAssets = (assets || []).filter(a => (a.value || 0) > 0).length
  const fromMortgaged = (debts || []).filter(d => d.mortgaged && (d.propertyValue || 0) > 0).length
  // householdValue = primary residence — only add if not already represented
  const fromHousehold = (income?.householdValue || 0) > 0 ? 1 : 0
  const base = Math.max(fromAssets, fromMortgaged)
  return base + (fromHousehold > 0 && base === 0 ? 1 : 0)
}

/** Guarantors assumed whenever there are bank debts */
function detectGuarantors(debts) {
  return (debts || []).some(d => d.type === 'Τράπεζα' && (d.amount || 0) > 0)
}

/**
 * writeoffPct: fraction 0-1 of total debt being written off (from calc.sumWr / calc.sumDebt).
 * Pass 0 when not yet calculated.
 */
export function computeOffer(debts, assets, income, config = DEFAULT_PRICING_CONFIG, writeoffPct = 0) {
  const totalDebt = (debts || []).reduce((s, d) => s + (d.amount || 0), 0)
  if (totalDebt === 0) return { application_fee: config.minFee, success_fee: config.minFee, _score: 0 }

  const bankDebts  = (debts || []).filter(d => d.type === 'Τράπεζα' && (d.amount || 0) > 0)
  const publicOnly = bankDebts.length === 0
  const assetCount = countAssets(debts, assets, income)
  const guarantors = detectGuarantors(debts)
  const withSpouse = !!(income?.withSpouse || (income?.spouseIncome || 0) > 0)

  const annualIncome = Math.max(
    income?.fp_income_t1 || 0, income?.annualIncome || 0, income?.kerdh_t1 || 0, 0,
  )
  const turnover = Math.max(income?.turnover || 0, income?.ke_t1 || 0, 0)

  // Debt base score
  let debtScore = config.debtBrackets[0].score
  for (const b of config.debtBrackets) {
    if (totalDebt <= b.upTo) { debtScore = b.score; break }
  }

  // Complexity bonuses
  let complexity = 0
  if (publicOnly) {
    complexity -= config.publicOnlyDiscount
  } else {
    const bb = config.bankBaseBonus + Math.min(bankDebts.length - 1, 6) * config.perBankBonus
    complexity += Math.min(bb, config.maxBankBonus)
  }
  complexity += assetCount * config.perAssetBonus
  if (guarantors) complexity += config.guarantorBonus
  if (withSpouse) complexity += config.spouseBonus
  if (annualIncome > config.highIncomeThreshold) complexity += config.highIncomeBonus
  if (turnover > config.highTurnoverThreshold) complexity += config.highTurnoverBonus

  // Write-off bonus
  const woPct = Math.min(Math.max(writeoffPct || 0, 0), 1)
  complexity += woPct * (config.writeoffMultiplier ?? DEFAULT_PRICING_CONFIG.writeoffMultiplier)

  const totalScore = Math.max(0, debtScore + complexity)
  const t = Math.min(totalScore / config.scoreMax, 1)
  const rawFee = config.minFee + t * (config.maxFee - config.minFee)
  const fee = Math.max(config.minFee, Math.min(config.maxFee, Math.round(rawFee / 50) * 50))

  return { application_fee: fee, success_fee: fee, _score: +totalScore.toFixed(2) }
}

export function scoreBreakdown(debts, assets, income, config = DEFAULT_PRICING_CONFIG, writeoffPct = 0) {
  const totalDebt  = (debts || []).reduce((s, d) => s + (d.amount || 0), 0)
  const bankDebts  = (debts || []).filter(d => d.type === 'Τράπεζα' && (d.amount || 0) > 0)
  const publicOnly = bankDebts.length === 0
  const assetCount = countAssets(debts, assets, income)
  const guarantors = detectGuarantors(debts)
  const withSpouse = !!(income?.withSpouse || (income?.spouseIncome || 0) > 0)
  const annualInc  = Math.max(income?.fp_income_t1 || 0, income?.annualIncome || 0, income?.kerdh_t1 || 0, 0)
  const turnover   = Math.max(income?.turnover || 0, income?.ke_t1 || 0, 0)

  let debtScore = config.debtBrackets[0].score
  for (const b of config.debtBrackets) {
    if (totalDebt <= b.upTo) { debtScore = b.score; break }
  }

  const fk = v => v >= 1000 ? (v / 1000).toFixed(0) + 'k€' : Math.round(v) + '€'
  const items = [{ label: `Οφειλές ${fk(totalDebt)}`, value: debtScore, auto: true }]
  if (publicOnly) {
    items.push({ label: 'Μόνο δημόσιο', value: -config.publicOnlyDiscount, auto: true })
  } else {
    const bb = +(Math.min(config.bankBaseBonus + Math.min(bankDebts.length - 1, 6) * config.perBankBonus, config.maxBankBonus)).toFixed(2)
    items.push({ label: `Τράπεζες ×${bankDebts.length}`, value: bb, auto: true })
  }
  if (assetCount > 0) items.push({ label: `Ακίνητα ×${assetCount}`, value: +(assetCount * config.perAssetBonus).toFixed(2), auto: true })
  if (guarantors) items.push({ label: 'Εγγυητές (αυτόματο)', value: config.guarantorBonus, auto: true })
  if (withSpouse) items.push({ label: 'Σύζυγος', value: config.spouseBonus, auto: false })
  if (annualInc > config.highIncomeThreshold) items.push({ label: `Εισόδημα ${fk(annualInc)}`, value: config.highIncomeBonus, auto: true })
  if (turnover > config.highTurnoverThreshold) items.push({ label: `Τζίρος ${fk(turnover)}`, value: config.highTurnoverBonus, auto: true })

  const woPct = Math.min(Math.max(writeoffPct || 0, 0), 1)
  const mult = config.writeoffMultiplier ?? DEFAULT_PRICING_CONFIG.writeoffMultiplier
  if (woPct > 0) {
    items.push({
      label: `Διαγραφή ${(woPct * 100).toFixed(0)}%`,
      value: +(woPct * mult).toFixed(2),
      auto: true,
    })
  }

  return items
}
