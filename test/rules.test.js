import test from 'node:test';
import assert from 'node:assert/strict';
import { orthodoxEaster, iso, isWorkingDay, workingDays, checkLeave } from '../server/rules.js';

test('Ορθόδοξο Πάσχα', () => {
  assert.equal(iso(orthodoxEaster(2025)), '2025-04-20');
  assert.equal(iso(orthodoxEaster(2026)), '2026-04-12');
  assert.equal(iso(orthodoxEaster(2027)), '2027-05-02');
});

test('εργάσιμες: Σ/Κ και αργίες εξαιρούνται', () => {
  assert.equal(isWorkingDay('2026-04-11'), false); // Σάββατο
  assert.equal(isWorkingDay('2026-04-10'), false); // Μ. Παρασκευή
  assert.equal(isWorkingDay('2026-04-13'), false); // Δευτέρα Πάσχα
  assert.equal(workingDays('2026-10-26', '2026-10-30').length, 4); // 28/10 αργία
});

const employees = [
  { id: 1, name: 'Μάνος', department: 'grants', annual_days: 22 },
  { id: 2, name: 'Χρήστος', department: 'grants', annual_days: 22 },
  { id: 4, name: 'Σοφία', department: 'debts', annual_days: 22 },
];
const base = (over = {}) => ({
  emp: employees[0], employees, leaves: [], blocked: [], today: '2026-01-01',
  enforceBalance: true, enforceDepartment: true, enforceBlocked: true, enforcePast: true, ...over,
});

test('αποδοχή απλής αίτησης', () => {
  const r = checkLeave({ start: '2026-06-08', end: '2026-06-12', type: 'annual' }, base());
  assert.ok(r.ok);
  assert.equal(r.days.length, 5);
});

test('απορρίπτεται 2ος του ίδιου τμήματος, όχι άλλου τμήματος', () => {
  const leaves = [{ id: 9, employee_id: 2, start: '2026-06-10', end: '2026-06-11', type: 'annual', status: 'approved' }];
  assert.equal(checkLeave({ start: '2026-06-08', end: '2026-06-12', type: 'annual' }, base({ leaves })).ok, false);
  assert.ok(checkLeave({ start: '2026-06-08', end: '2026-06-12', type: 'annual' }, base({ leaves, emp: employees[2] })).ok);
});

test('μπλοκαρισμένες ημέρες', () => {
  const blocked = [{ start: '2026-06-10', end: '2026-06-12', reason: 'Προθεσμία' }];
  assert.equal(checkLeave({ start: '2026-06-08', end: '2026-06-10', type: 'annual' }, base({ blocked })).ok, false);
});

test('υπόλοιπο ημερών', () => {
  const leaves = [{ id: 1, employee_id: 1, start: '2026-02-02', end: '2026-02-27', type: 'annual', status: 'approved' }]; // 20 ημέρες
  assert.equal(checkLeave({ start: '2026-06-02', end: '2026-06-05', type: 'annual' }, base({ leaves })).ok, false);
  assert.ok(checkLeave({ start: '2026-06-02', end: '2026-06-04', type: 'annual' }, base({ leaves })).ok);
});

test('παρελθόν και αλληλοκάλυψη με τον εαυτό', () => {
  assert.equal(checkLeave({ start: '2025-12-01', end: '2025-12-02', type: 'annual' }, base()).ok, false);
  const leaves = [{ id: 1, employee_id: 1, start: '2026-06-01', end: '2026-06-02', type: 'annual', status: 'pending' }];
  assert.equal(checkLeave({ start: '2026-06-02', end: '2026-06-03', type: 'annual' }, base({ leaves })).ok, false);
});
