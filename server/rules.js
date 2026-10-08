// Καθαρή λογική κανόνων αδειών (χωρίς I/O) ώστε να ελέγχεται εύκολα με τεστ.

export const LEAVE_TYPES = {
  annual: 'Κανονική άδεια',
  sick: 'Αναρρωτική',
  illness: 'Ασθενείας',
  maternity: 'Μητρότητας / Γονική',
  other: 'Άλλη έκτακτη',
};
export const SPECIAL_TYPES = Object.keys(LEAVE_TYPES).filter((t) => t !== 'annual');

export const DEPARTMENTS = {
  grants: 'Επιχορηγούμενα Προγράμματα',
  debts: 'Οφειλές',
};

const parse = (s) => new Date(`${s}T00:00:00Z`);
export const iso = (d) => d.toISOString().slice(0, 10);
export const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s;
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// Ορθόδοξο Πάσχα (Ιουλιανό ημερολόγιο + 13 ημέρες, ισχύει 1900–2099)
export function orthodoxEaster(year) {
  const a = year % 4, b = year % 7, c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day + 13));
}

const holidayCache = new Map();
export function holidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const fixed = ['01-01', '01-06', '03-25', '05-01', '08-15', '10-28', '12-25', '12-26'];
  const set = new Set(fixed.map((md) => `${year}-${md}`));
  const easter = orthodoxEaster(year);
  for (const off of [-48, -2, 1, 50]) set.add(iso(addDays(easter, off))); // Καθαρά Δευτέρα, Μ. Παρασκευή, Δευτέρα Πάσχα, Αγ. Πνεύματος
  holidayCache.set(year, set);
  return set;
}
export const isHoliday = (s) => holidays(Number(s.slice(0, 4))).has(s);

export function isWorkingDay(s) {
  const dow = parse(s).getUTCDay();
  return dow !== 0 && dow !== 6 && !isHoliday(s);
}

export function eachDay(start, end) {
  const out = [];
  for (let d = parse(start); d <= parse(end); d = addDays(d, 1)) out.push(iso(d));
  return out;
}
export const workingDays = (start, end) => eachDay(start, end).filter(isWorkingDay);

const overlaps = (a, b) => a.start <= b.end && b.start <= a.end;

/**
 * Έλεγχος αίτησης/καταχώρησης άδειας.
 * ctx: { emp, employees, leaves, blocked, today, enforceBalance, enforceDepartment, enforceBlocked, enforcePast, ignoreLeaveId }
 * leaves: όλες οι άδειες με status pending/approved.
 */
export function checkLeave({ start, end, type }, ctx) {
  const errors = [];
  if (!isIsoDate(start) || !isIsoDate(end)) return { ok: false, errors: ['Μη έγκυρες ημερομηνίες.'], days: [] };
  if (end < start) return { ok: false, errors: ['Η ημερομηνία λήξης είναι πριν την έναρξη.'], days: [] };
  if (!LEAVE_TYPES[type]) return { ok: false, errors: ['Άγνωστος τύπος άδειας.'], days: [] };

  const days = workingDays(start, end);
  if (days.length === 0) errors.push('Το διάστημα δεν περιέχει εργάσιμες ημέρες.');
  if (ctx.enforcePast && start < ctx.today) errors.push('Δεν επιτρέπεται αίτηση για παρελθοντικές ημερομηνίες.');

  const others = ctx.leaves.filter((l) => l.id !== ctx.ignoreLeaveId);

  // Αλληλοκάλυψη με δικές του άδειες
  const own = others.find((l) => l.employee_id === ctx.emp.id && overlaps(l, { start, end }));
  if (own) errors.push(`Υπάρχει ήδη άδεια στο διάστημα ${own.start} – ${own.end}.`);

  // Μπλοκαρισμένες ημέρες
  if (ctx.enforceBlocked) {
    for (const b of ctx.blocked) {
      const hit = days.find((d) => d >= b.start && d <= b.end);
      if (hit) { errors.push(`Η ημερομηνία ${hit} είναι μπλοκαρισμένη για άδειες${b.reason ? ` (${b.reason})` : ''}.`); break; }
    }
  }

  // Δύο άτομα του ίδιου τμήματος δεν απουσιάζουν ταυτόχρονα
  if (ctx.enforceDepartment) {
    const mates = new Map(ctx.employees.filter((e) => e.department === ctx.emp.department && e.id !== ctx.emp.id).map((e) => [e.id, e]));
    for (const l of others) {
      const mate = mates.get(l.employee_id);
      if (!mate || !overlaps(l, { start, end })) continue;
      const clash = days.find((d) => d >= l.start && d <= l.end);
      if (clash) { errors.push(`Την ${clash} απουσιάζει ήδη ο/η ${mate.name} του ίδιου τμήματος.`); break; }
    }
  }

  // Υπόλοιπο κανονικής άδειας ανά έτος
  if (ctx.enforceBalance && type === 'annual') {
    const byYear = new Map();
    for (const d of days) byYear.set(d.slice(0, 4), (byYear.get(d.slice(0, 4)) || 0) + 1);
    for (const [year, n] of byYear) {
      const used = annualDaysUsed(others.filter((l) => l.employee_id === ctx.emp.id), Number(year));
      const remaining = ctx.emp.annual_days - used;
      if (n > remaining) { errors.push(`Ανεπαρκές υπόλοιπο για το ${year}: ζητούνται ${n}, διαθέσιμες ${Math.max(remaining, 0)}.`); }
    }
  }
  return { ok: errors.length === 0, errors, days };
}

// Εργάσιμες ημέρες κανονικής άδειας (εγκεκριμένες + εκκρεμείς) εντός έτους
export function annualDaysUsed(leaves, year, statuses = ['approved', 'pending']) {
  let n = 0;
  for (const l of leaves) {
    if (l.type !== 'annual' || !statuses.includes(l.status)) continue;
    n += workingDays(l.start, l.end).filter((d) => d.startsWith(String(year))).length;
  }
  return n;
}
