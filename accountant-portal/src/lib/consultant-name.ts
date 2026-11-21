// Maps the logged-in staff member who triggered an email to the full name
// shown in that email's footer. ADMIN deliberately shows NO personal name (see
// TEAM_FOOTER_LABEL in email.ts — clients were calling the admin directly);
// CONSULTANT accounts are keyed by
// their short first name (the Users table stores them that way) to the full
// name clients should see. Accountant-role senders (and no session at all —
// cron/automated sends) get no name, only the shared phone number.
const CONSULTANT_NAME_MAP: Record<string, string> = {
  'Μάνος': 'Βαρδιάμπασης Μάνος',
  'Χρήστος': 'Πουλιδάκης Χρήστος',
  'Ελευθερία': 'Στριλιγκά Ελευθερία',
  'Βάλλια': 'Μποτσάκη Βάλλια',
}

export function resolveConsultantFullName(user: { name?: string | null; role?: string | null } | null | undefined): string | null {
  if (!user) return null
  if (user.role === 'ADMIN') return null
  if (user.role !== 'CONSULTANT') return null
  const name = user.name?.trim()
  if (!name) return null
  return CONSULTANT_NAME_MAP[name] || name
}

// ─── Client-facing label: "Ο σύμβουλός μας Μάνος Β." ─────────────────────────
// First name + the initial of the surname only (clients were calling the
// consultants directly by full name). Names are stored "Επώνυμο Όνομα"
// (e.g. "Βαρδιάμπασης Μάνος"); the first name is recognised from this list so
// the article (Ο/Η) is right. New consultant → add their first name here.
const FIRST_NAME_ARTICLE: Record<string, 'Ο' | 'Η'> = {
  'μανος': 'Ο',
  'χρηστος': 'Ο',
  'χαρης': 'Ο',
  'ελευθερια': 'Η',
  'βαλλια': 'Η',
}

function plain(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function formatConsultantLabel(fullName: string | null | undefined): string {
  const tokens = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 'Ο/Η σύμβουλός μας'

  let firstIdx = tokens.findIndex(t => plain(t) in FIRST_NAME_ARTICLE)
  const known = firstIdx !== -1
  if (!known) firstIdx = tokens.length - 1 // stored as "Επώνυμο Όνομα"
  const first = tokens[firstIdx]
  const surname = tokens.find((_, i) => i !== firstIdx)
  const initial = surname ? `${Array.from(surname)[0].toLocaleUpperCase('el-GR')}.` : ''
  const article = known ? FIRST_NAME_ARTICLE[plain(first)] : null
  const lead = article === 'Η' ? 'Η σύμβουλός μας' : article === 'Ο' ? 'Ο σύμβουλός μας' : 'Ο/Η σύμβουλός μας'
  return `${lead} ${first}${initial ? ` ${initial}` : ''}`
}
