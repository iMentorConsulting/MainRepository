import { describe, it, expect } from 'vitest'
import { calculateAll } from './calculations'

// Φυσικό Πρόσωπο χωρίς περιουσία: το διαθέσιμο εισόδημα πρέπει να μοιράζεται στους πιστωτές
// (πριν το διορθώσουμε, η μηχανή θεωρούσε «μηδενικό εισόδημα» όταν δεν υπήρχαν ελάχιστες δόσεις).

const debts = [
  { id: 'a', type: 'Εφορία', amount: 32835, interestPct: 18, status: 'Ληξιπρόθεσμη' },
  { id: 'b', type: 'Ασφαλιστικά Ταμεία', amount: 2667, interestPct: 18, status: 'Ληξιπρόθεσμη' },
  { id: 'c', type: 'Τράπεζα', creditorName: 'ΕΘΝΙΚΗ', amount: 38710, interestPct: 30, status: 'Ληξιπρόθεσμη' },
  { id: 'd', type: 'Τράπεζα', creditorName: 'doValue', amount: 9061, interestPct: 0, status: 'Ενήμερη' },
  { id: 'e', type: 'Τράπεζα', creditorName: 'ΑΛΦΑ', amount: 4756, interestPct: 0, status: 'Ενήμερη' },
]
const income = {
  debtorType: 'Φυσικό Πρόσωπο', fpSubType: 'Μισθωτός',
  fp_income_t1: 9891, fp_income_t2: 13858, fp_income_t3: 12226,
  householdValue: 6448, householdSize: 1, debtorAge: 40, rentCost: 1200,
}

describe('Διαθέσιμο εισόδημα — υπόθεση χωρίς περιουσία', () => {
  const calc = calculateAll(debts, [], income)
  const by = (name) => calc.finalPlan.find((p) => (p.creditorName || p.type) === name)

  it('διαθέσιμο = (13.042 − 7.648) × 80% / 12 = 359,60 €', () => {
    expect(calc.annualIncome).toBe(13042)
    expect(calc.totalExpenses).toBe(7648)
    expect(calc.monthlyDisp1).toBeCloseTo(359.6, 2)
  })
  it('η συνολική δόση δεν ξεπερνά το διαθέσιμο (έτη 1–3 και 4+)', () => {
    expect(calc.totalC1).toBeLessThanOrEqual(calc.monthlyDisp1 + 0.5)
    expect(calc.totalMonthlyPay).toBeLessThanOrEqual(calc.monthlyDisp24 + 0.5)
  })
  it('το διαθέσιμο αξιοποιείται (δεν μηδενίζεται το μοίρασμα)', () => {
    expect(calc.totalMonthlyPay).toBeGreaterThan(0.9 * calc.monthlyDisp24)
    // οι διαγραφές δεν είναι όλες στο νομικό μέγιστο
    expect(calc.sumWr).toBeLessThan(calc.sumMaxWriteoff)
  })
  it('οι πιστωτές «Ενήμερη» πληρώνονται ολόκληροι χωρίς διαγραφή', () => {
    expect(by('doValue').writeoff).toBe(0)
    expect(by('ΑΛΦΑ').writeoff).toBe(0)
    expect(Math.floor(by('doValue').c1Exact)).toBe(54); expect(Math.floor(by('doValue').c2Exact)).toBe(59)
    expect(Math.floor(by('ΑΛΦΑ').c1Exact)).toBe(28); expect(Math.floor(by('ΑΛΦΑ').c2Exact)).toBe(31)
  })
  it('ελάχιστη δόση 50 € στον ΕΦΚΑ', () => {
    expect(by('Ασφαλιστικά Ταμεία').c2Exact).toBeGreaterThanOrEqual(49.99)
  })
})

describe('Αναλλοίωτα σε τυχαίες υποθέσεις', () => {
  let seed = 7
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  it('καμία NaN· διαγραφή ≤ νομικό μέγιστο· δόση ≤ διαθέσιμο εκτός αν εμποδίζουν τα νομικά όρια', () => {
    for (let k = 0; k < 200; k++) {
      const ds = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) => {
        const type = pick(['Τράπεζα', 'Εφορία', 'Ασφαλιστικά Ταμεία'])
        const mortgaged = type === 'Τράπεζα' && rnd() < 0.2
        return { id: 'd' + i, type, creditorName: 'C' + i, amount: Math.round(2000 + rnd() * 120000), interestPct: Math.round(rnd() * 40),
          status: pick(['Ληξιπρόθεσμη', 'Ληξιπρόθεσμη', 'Ενήμερη']), mortgaged, propertyValue: mortgaged ? Math.round(rnd() * 150000) : 0 }
      })
      const inc = { debtorType: 'Φυσικό Πρόσωπο', fpSubType: 'Μισθωτός', fp_income_t1: Math.round(rnd() * 30000), fp_income_t2: Math.round(rnd() * 30000),
        fp_income_t3: Math.round(rnd() * 30000), householdValue: pick([6448, 10866, 16162]), householdSize: pick([1, 2, 4]), debtorAge: 45, rentCost: Math.round(rnd() * 6000) }
      const c = calculateAll(ds, rnd() < 0.3 ? [{ value: Math.round(rnd() * 100000) }] : [], inc)
      c.finalPlan.forEach((p) => {
        expect([p.c1, p.c2, p.newAmt, p.writeoff].every(Number.isFinite)).toBe(true)
        expect(p.writeoff).toBeLessThanOrEqual((c.analysisRows.find((r) => r.idx === p.idx)?.calc ?? 0) + 1)
      })
      const slack = Math.max(c.totalC1 - c.monthlyDisp1, c.totalMonthlyPay - c.monthlyDisp24)
      if (slack > 2 && c.monthlyDisp1 > 0 && !(c.capacityShortfall > 0)) {
        const stuck = c.finalPlan.every((p) => {
          const r = c.analysisRows.find((x) => x.idx === p.idx)
          return r.status === 'Ενήμερη' || p.writeoff >= (r.calc || 0) - 1 || (p.type !== 'Τράπεζα' && p.c2 <= 51)
        })
        expect(stuck).toBe(true)
      }
    }
  })
})
