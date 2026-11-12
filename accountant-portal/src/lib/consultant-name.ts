// Maps the logged-in staff member who triggered an email to the full name
// shown in that email's footer. ADMIN always shows the same name regardless
// of which admin account is logged in; CONSULTANT accounts are keyed by
// their short first name (the Users table stores them that way) to the full
// name clients should see. Accountant-role senders (and no session at all —
// cron/automated sends) get no name, only the shared phone number.
const CONSULTANT_NAME_MAP: Record<string, string> = {
  'Μάνος': 'Βαρδιάμπασης Μάνος',
  'Χρήστος': 'Πουλιδάκης Χρήστος',
  'Ελευθερία': 'Στριλιγκά Ελευθερία',
}

export function resolveConsultantFullName(user: { name?: string | null; role?: string | null } | null | undefined): string | null {
  if (!user) return null
  if (user.role === 'ADMIN') return 'Αποστολάκης Χάρης'
  if (user.role !== 'CONSULTANT') return null
  const name = user.name?.trim()
  if (!name) return null
  return CONSULTANT_NAME_MAP[name] || name
}
