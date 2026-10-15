import { describe, it, expect } from 'vitest'
import { calculateAll, computeLePublicDisposable, lePublicKpa, lePublicDuration } from './calculations'

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

describe('Test 2 — ο κανόνας ενεργοποιείται (Τ-1 < 10% × ΚΕ)', () => {
  const income = { ...base, ke_t1: 199334, ke_t2: 208777, ke_t3: 26934, kerdh_t1: 10000, kerdh_t2: 2787, kerdh_t3: 0 }
  const r = computeLePublicDisposable(income)
  it('X_Τ1 = 10% × ΚΕ_Τ1', () => {
    close(r.X[0], 19933.4); close(r.monthly.year1, 1661.12)
    expect(r.ruleTriggered).toBe(true)
  })
  it('η διάρκεια ΑΑΔΕ/ΕΦΚΑ προκύπτει από την ΚΠΑ (όχι σταθερά 240), πολλαπλάσιο του 12', () => {
    const calc = calculateAll(debts, [], income)
    expect(calc.flagMaxDoses).toBe(false)
    const d = calc.lePubDuration
    expect(d.months % 12).toBe(0)
    expect(d.months).toBeLessThan(240)
    expect(d.kpa).toBeGreaterThanOrEqual(d.debt)
    expect(d.kpaPrev).toBeLessThan(d.debt)
    calc.finalPlan.filter((p) => p.type === 'Εφορία' || p.type === 'Ασφαλιστικά Ταμεία').forEach((p) => expect(p.months).toBe(d.months))
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

// ── Κανόνας διάρκειας ΑΑΔΕ/ΕΦΚΑ — ΚΥΑ 77697 ΕΞ 2021, όρος 7.14γ ──────────────────────────────
describe('Test 6 — διάρκεια από ΚΠΑ (πραγματικό δοσολόγιο πλατφόρμας)', () => {
  // Τ-1 = ΚΕ 26.934 / κέρδη 0 · άλλα έτη 199.334 / 33.843 και 208.777 / 2.787
  // Οφειλές όπως προκύπτουν από τα δοσολόγια της πλατφόρμας (856,20 € και 222,21 € σε 48 δόσεις, 3%): 38.682 € και 10.039,15 €
  const income = { ...base, ke_t1: 26934, ke_t2: 199334, ke_t3: 208777, kerdh_t1: 0, kerdh_t2: 33843, kerdh_t3: 2787 }
  const pubDebts = [
    { id: 'a', type: 'Εφορία', amount: 38682, interestPct: 0, status: 'Ληξιπρόθεσμη', mortgaged: false, propertyValue: 0 },
    { id: 'e', type: 'Ασφαλιστικά Ταμεία', amount: 10039.15, interestPct: 0, status: 'Ληξιπρόθεσμη', mortgaged: false, propertyValue: 0 },
  ]
  const lp = computeLePublicDisposable(income)

  it('κλιμακωτό εισόδημα', () => {
    close(lp.X[0], 2693.4)                       // Τ-1: 0 < 10% × 26.934 → όριο
    close(lp.M2, 27360.35)
    close(lp.annual.year1, 2693.4)
    close(lp.annual.years24, 17784.23)           // max(65% × M2, X_Τ1)
    close(lp.annual.years5, 27360.35)            // max(M2, X_Τ1)
    expect(lp.ruleTriggered).toBe(true)
  })
  it('ΚΠΑ: 36 μήνες δεν καλύπτει, 48 μήνες καλύπτει', () => {
    expect(Math.abs(lePublicKpa(lp, 36) - 36113)).toBeLessThan(2)
    expect(Math.abs(lePublicKpa(lp, 48) - 52107)).toBeLessThan(2)
    const d = lePublicDuration(lp, 38682 + 10039.15)
    expect(d.months).toBe(48)
    expect(d.covered).toBe(true)
  })
  it('48 μήνες · ΑΑΔΕ 856,20 €/μήνα · ΕΦΚΑ 222,21 €/μήνα', () => {
    const calc = calculateAll(pubDebts, [], income)
    const aade = calc.finalPlan.find((p) => p.type === 'Εφορία')
    const efka = calc.finalPlan.find((p) => p.type === 'Ασφαλιστικά Ταμεία')
    expect(aade.months).toBe(48); expect(efka.months).toBe(48)
    expect(aade.writeoff).toBe(0); expect(efka.writeoff).toBe(0)
    close(aade.c2Exact, 856.2); close(efka.c2Exact, 222.21)
    // σταθερή δόση για όλη τη διάρκεια (καμία κλιμάκωση)
    close(aade.c1Exact, aade.c2Exact)
    expect(Math.abs(aade.c2Exact * 48 - 41097.51)).toBeLessThan(0.5)
    expect(Math.abs(efka.c2Exact * 48 - 10666.07)).toBeLessThan(0.5)
  })
  it('η διάρκεια είναι πάντα πολλαπλάσιο του 12 και δεν ελέγχεται η δόση έναντι του μηνιαίου εισοδήματος του έτους 1', () => {
    // η δόση (1.078 €/μήνα) είναι πολύ μεγαλύτερη από το μηνιαίο εισόδημα του έτους 1 (224 €) — δεν επηρεάζει τη διάρκεια
    expect(lp.monthly.year1).toBeLessThan(1078)
    expect(lePublicDuration(lp, 48722).months % 12).toBe(0)
  })
  it('όταν ούτε οι 240 μήνες καλύπτουν → 240 με διαγραφή', () => {
    const d = lePublicDuration(lp, 5_000_000)
    expect(d.months).toBe(240); expect(d.covered).toBe(false)
  })
})
