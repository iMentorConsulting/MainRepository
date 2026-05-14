// Automatic commercial offer calculator
// Factors: total debt, bank count, public-only, real estate assets,
// guarantors, spouse, income/turnover levels.

export const DEFAULT_PRICING_CONFIG = {
  minFee: 400,
  maxFee: 2000,
  scoreMax: 7,          // score that maps to maxFee; below → linear scaling

  // Debt amount → base score (bracket, first match wins)
  debtBrackets: [
    { upTo: 30000,    score: 0.5 },
    { upTo: 80000,    score: 1.0 },
    { upTo: 200000,   score: 1.5 },
    { upTo: 400000,   score: 2.2 },
    { upTo: 800000,   score: 2.8 },
    { upTo: 9999999,  score: 3.5 },
  ],

  // Complexity bonuses (added on top of debt score)
  bankBaseBonus: 0.8,         // any bank debt at all
  perBankBonus: 0.3,          // per additional bank (after the 1st)
  maxBankBonus: 2.0,          // cap on bank bonuses
  publicOnlyDiscount: 0.4,    // subtract when ONLY public debt (simpler)
  perAssetBonus: 0.5,         // per real estate asset with value > 0
  guarantorBonus: 0.5,        // has guarantors
  spouseBonus: 0.3,           // spouse involved / co-debtor

  // Income/turnover bonuses
  highIncomeThreshold: 25000,    // annual net income (€)
  highIncomeBonus: 0.4,
  highTurnoverThreshold: 100000, // annual turnover (€)
  highTurnoverBonus: 0.5,
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

/**
 * Compute suggested application_fee and success_fee from case data.
 * Both fees use the same base amount.
 */
export function computeOffer(debts, assets, income, config = DEFAULT_PRICING_CONFIG) {
  const totalDebt = (debts || []).reduce((s, d) => s + (d.amount || 0), 0)
  if (totalDebt === 0) return { application_fee: config.minFee, success_fee: config.minFee }

  const bankDebts = (debts || []).filter(d => d.type === 'Τράπεζα' && (d.amount || 0) > 0)
  const publicOnly = bankDebts.length === 0
  const realAssets = (assets || []).filter(a => (a.value || 0) > 0)

  // Income proxies — pick best available field
  const annualIncome = Math.max(
    income?.fp_income_t1 || 0,
    income?.annualIncome || 0,
    income?.kerdh_t1 || 0,
    0,
  )
  const turnover = Math.max(income?.turnover || 0, income?.ke_t1 || 0, 0)

  // ── Debt base score ──────────────────────────────────────────────────────
  let debtScore = config.debtBrackets[0].score
  for (const bracket of config.debtBrackets) {
    if (totalDebt <= bracket.upTo) { debtScore = bracket.score; break }
  }

  // ── Complexity score ──────────────────────────────────────────────────────
  let complexity = 0
  if (publicOnly) {
    complexity -= config.publicOnlyDiscount
  } else {
    const bankBonus = config.bankBaseBonus + Math.min(bankDebts.length - 1, 6) * config.perBankBonus
    complexity += Math.min(bankBonus, config.maxBankBonus)
  }
  complexity += realAssets.length * config.perAssetBonus
  if (income?.hasGuarantor) complexity += config.guarantorBonus
  if (income?.withSpouse || (income?.spouseIncome || 0) > 0) complexity += config.spouseBonus
  if (annualIncome > config.highIncomeThreshold) complexity += config.highIncomeBonus
  if (turnover > config.highTurnoverThreshold) complexity += config.highTurnoverBonus

  // ── Map to fee ────────────────────────────────────────────────────────────
  const totalScore = Math.max(0, debtScore + complexity)
  const t = Math.min(totalScore / config.scoreMax, 1)
  const rawFee = config.minFee + t * (config.maxFee - config.minFee)
  const fee = Math.round(rawFee / 50) * 50  // round to nearest 50€
  const clampedFee = Math.max(config.minFee, Math.min(config.maxFee, fee))

  return { application_fee: clampedFee, success_fee: clampedFee, _score: totalScore }
}

/** Human-readable breakdown of how the score was built (for admin preview) */
export function scoreBreakdown(debts, assets, income, config = DEFAULT_PRICING_CONFIG) {
  const totalDebt = (debts || []).reduce((s, d) => s + (d.amount || 0), 0)
  const bankDebts = (debts || []).filter(d => d.type === 'Τράπεζα' && (d.amount || 0) > 0)
  const publicOnly = bankDebts.length === 0
  const realAssets = (assets || []).filter(a => (a.value || 0) > 0)
  const annualIncome = Math.max(income?.fp_income_t1 || 0, income?.annualIncome || 0, income?.kerdh_t1 || 0, 0)
  const turnover = Math.max(income?.turnover || 0, income?.ke_t1 || 0, 0)

  let debtScore = config.debtBrackets[0].score
  for (const bracket of config.debtBrackets) {
    if (totalDebt <= bracket.upTo) { debtScore = bracket.score; break }
  }

  const items = [{ label: `Οφειλές ${totalDebt > 0 ? Math.round(totalDebt).toLocaleString('el-GR') + '€' : '0'}`, value: debtScore }]
  if (publicOnly) items.push({ label: 'Μόνο δημόσιο (απλή)', value: -config.publicOnlyDiscount })
  else {
    const bb = config.bankBaseBonus + Math.min(bankDebts.length - 1, 6) * config.perBankBonus
    items.push({ label: `Τράπεζες (${bankDebts.length})`, value: +Math.min(bb, config.maxBankBonus).toFixed(2) })
  }
  if (realAssets.length > 0) items.push({ label: `Ακίνητα (${realAssets.length})`, value: realAssets.length * config.perAssetBonus })
  if (income?.hasGuarantor) items.push({ label: 'Εγγυητές', value: config.guarantorBonus })
  if (income?.withSpouse || (income?.spouseIncome || 0) > 0) items.push({ label: 'Σύζυγος', value: config.spouseBonus })
  if (annualIncome > config.highIncomeThreshold) items.push({ label: `Υψηλό εισόδημα (${Math.round(annualIncome).toLocaleString('el-GR')}€)`, value: config.highIncomeBonus })
  if (turnover > config.highTurnoverThreshold) items.push({ label: `Υψηλός τζίρος (${Math.round(turnover).toLocaleString('el-GR')}€)`, value: config.highTurnoverBonus })

  return items
}
