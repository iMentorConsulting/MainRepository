import { describe, it, expect } from 'vitest'
import { calculateAll, computeLePublicDisposable } from './calculations'

// Νομικό Πρόσωπο — κανόνας εύλογου ποσοστού κέρδους (10% × ΚΕ) για ΑΑΔΕ/ΕΦΚΑ
// ΚΥΑ 77129 ΕΞ 2025 (ΦΕΚ Β' 2331/13.05.2025)

const base = { debtorType: 'Νομικό Πρόσωπο', leEnfia: 0, deposits: 0 }
const debts = [
  { id: 'b', type: 'Τράπεζα', creditorName: 'Bank', amount: 90000, interestPct: 10, status: 'Ληξιπρόθεσμη', mortgaged: false, propertyValue: 0 },
  { id: 'a', type: 'Εφορία', amount: 120000, interestPct: 0, status: 'Ληξιπρόθεσμη', mortgaged: false, propertyValue: 0 },
  { id: 'e', type: 'Ασφαλιστικά Ταμεία', amount: 80000, interestPct: 0, status: 'Ληξιπρόθεσμη', mortgaged: false, propertyValue: 0 },
]
const close = (a, b) => expect(a).toBeCloseTo(b, 2)

describe('Test 1 — ο κανόνας ΔΕΝ ενεργοποιείται', () => {
  const income = { ...base, ke_t1: 199334, ke_t2: 208777, ke_t3: 26934, kerdh_t1: 33843, kerdh_t2: 2787, kerdh_t3: null }
  const r = computeLePublicDisposable(income)
  it('X ανά έτος και M2', () => {
    close(r.X[0], 33843); close(r.X[1], 20877.7); close(r.X[2], 2693.4)
    close(r.M2, 27360.35)
  })
  it('φάσεις ετήσιες και μηνιαίες', () => {
    close(r.annual.year1, 33843); close(r.monthly.year1, 2820.25)
    close(0.65 * r.M2, 17784.23)           // 65% × M2 < έτος 1 → ισχύει έτος 1
    close(r.annual.years24, 33843); close(r.annual.years5, 33843)
  })
  it('ruleTriggered = false και προειδοποίηση για τα κενά κέρδη Τ-3', () => {
    expect(r.eligible10).toBe(true)
    expect(r.ruleTriggered).toBe(false)
    expect(r.floorApplied).toEqual([false, true, true])
    expect(r.warnings.some((w) => w.includes('Τ-3'))).toBe(true)
  })
  it('calculateAll: δεν επιβάλλεται μέγιστος αριθμός δόσεων', () => {
    const calc = calculateAll(debts, [], income)
    expect(calc.flagMaxDoses).toBe(false)
    expect(calc.lePub.ruleTriggered).toBe(false)
  })
})

describe('Test 2 — ο κανόνας ενεργοποιείται', () => {
  const income = { ...base, ke_t1: 199334, ke_t2: 208777, ke_t3: 26934, kerdh_t1: 10000, kerdh_t2: 2787, kerdh_t3: 0 }
  const r = computeLePublicDisposable(income)
  it('X_Τ1 = 10% × ΚΕ_Τ1', () => {
    close(r.X[0], 19933.4); close(r.monthly.year1, 1661.12)
    expect(r.ruleTriggered).toBe(true)
  })
  it('240 μήνες σε ΑΑΔΕ/ΕΦΚΑ, όχι στις τράπεζες', () => {
    expect(r.maxMonths).toBe(240)
    const calc = calculateAll(debts, [], income)
    expect(calc.flagMaxDoses).toBe(true)
    const pub = calc.finalPlan.filter((p) => p.type === 'Εφορία' || p.type === 'Ασφαλιστικά Ταμεία')
    expect(pub.length).toBe(2)
    pub.forEach((p) => expect(p.months).toBe(240))
  })
})

describe('Test 3 — ΚΕ πάνω από το όριο των 2.500.000', () => {
  const income = { ...base, ke_t1: 199334, ke_t2: 2600000, ke_t3: 26934, kerdh_t1: 10000, kerdh_t2: 2787, kerdh_t3: 0 }
  const r = computeLePublicDisposable(income)
  it('eligible10 = false, X_Τ1 = 10.000, ruleTriggered = false', () => {
    expect(r.eligible10).toBe(false)
    close(r.X[0], 10000)
    expect(r.ruleTriggered).toBe(false)
    expect(calculateAll(debts, [], income).flagMaxDoses).toBe(false)
  })
})

describe('Test 4 — αφαίρεση ΕΝΦΙΑ', () => {
  const income = { ...base, leEnfia: 15000, ke_t1: 199334, ke_t2: 208777, ke_t3: 26934, kerdh_t1: 33843, kerdh_t2: 2787, kerdh_t3: null }
  const r = computeLePublicDisposable(income)
  it('X_Τ1 = max(18.843, 19.933,40) και ο κανόνας ενεργοποιείται', () => {
    close(r.xBefore[0], 18843)
    close(r.X[0], 19933.4)
    expect(r.ruleTriggered).toBe(true)
  })
})

describe('Test 5 — Φυσικό Πρόσωπο', () => {
  const fpIncome = {
    debtorType: 'Φυσικό Πρόσωπο', fpSubType: 'Μισθωτός',
    fp_income_t1: 18000, fp_income_t2: 17000, fp_income_t3: 16000,
    householdValue: 10866, householdSize: 2,
    // LE fields present on the form must be ignored for a natural person
    ke_t1: 199334, ke_t2: 208777, ke_t3: 26934, kerdh_t1: 10000, kerdh_t2: 2787, kerdh_t3: 0,
  }
  it('ο κανόνας 10% για το Δημόσιο δεν εκτελείται ποτέ', () => {
    const calc = calculateAll(debts, [], fpIncome)
    expect(calc.lePub).toBeNull()
    expect(calc.flagMaxDoses).toBe(false)
  })
})

describe('Ελλιπή δεδομένα', () => {
  it('λείπει ΚΕ → eligible10 = false και προειδοποίηση', () => {
    const r = computeLePublicDisposable({ ...base, ke_t1: 199334, ke_t2: 208777, ke_t3: 0, kerdh_t1: 10000, kerdh_t2: 2787, kerdh_t3: 0 })
    expect(r.eligible10).toBe(false)
    expect(r.warnings).toContain('Λείπει ΚΕ έτους Τ-3')
  })
  it('κενό ΕΝΦΙΑ θεωρείται 0', () => {
    const r = computeLePublicDisposable({ ...base, leEnfia: undefined, ke_t1: 100000, ke_t2: 100000, ke_t3: 100000, kerdh_t1: 50000, kerdh_t2: 50000, kerdh_t3: 50000 })
    close(r.X[0], 50000)
  })
})
