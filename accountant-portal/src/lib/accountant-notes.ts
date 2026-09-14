// Registrations before `Accountant.declaredClientCount` existed only have the
// self-declared client count embedded in the free-text `notes` blob (see
// /api/register). This recovers it for those older records so callers don't
// need to know about the legacy format.
const DECLARED_CLIENT_COUNT_RE = /Αριθμός πελατών \(κατά την εγγραφή\):\s*(.+)/

export function parseDeclaredClientCountFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null
  const match = notes.match(DECLARED_CLIENT_COUNT_RE)
  return match ? match[1].trim() : null
}
