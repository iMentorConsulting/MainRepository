import { prisma } from './prisma'

// Idempotent suggestion seeds — only insert items whose label doesn't already exist.

const CRITERIA_SUGGESTIONS = [
  'Άδεια Λειτουργίας Επιχείρησης',
  'Εγγραφή στο Επιμελητήριο',
  'Επιχειρηματικός Τραπεζικός Λογαριασμός',
  'Απουσία Ληξιπρόθεσμων Οφειλών προς Δημόσιο',
  'Απουσία Ληξιπρόθεσμων Οφειλών προς Ασφαλιστικά Ταμεία',
  'Εκπληρωμένες Στρατιωτικές Υποχρεώσεις (άνδρες)',
  'Ασφαλιστική Ικανότητα / ΑΜΚΑ',
  'Δελτίο Ανεργίας ΔΥΠΑ σε Ισχύ',
  'Μη Συμμετοχή σε Άλλο Πρόγραμμα ΕΣΠΑ (τελευταία 3 έτη)',
]

const TAG_SUGGESTIONS = [
  'Νέος Επιχειρηματίας',
  'Γυναίκα Επιχειρηματίας',
  'ΑΜΕΑ',
  'Πολύτεκνος/Πολύτεκνη',
  'Άνεργος >12 μήνες',
  'Πτυχιούχος ΑΕΙ/ΤΕΙ',
  'Έδρα σε Ορεινή/Μειονεκτική Περιοχή',
  'Νεοφυής Επιχείρηση (Startup)',
  'Εποχική Επιχείρηση',
  'VIP Πελάτης',
]

const REJECTION_REASON_SUGGESTIONS = [
  'Μη Επιλέξιμος ΚΑΔ',
  'Εκτός Χρονικού Περιθωρίου Ίδρυσης',
  'Έχει Λάβει Παρόμοια Επιδότηση',
  'Ανενεργή Επιχείρηση (Παύση Εργασιών)',
  'Δεν Απάντησε / Αδιαφορία',
  'Ήδη Εξυπηρετείται από Άλλο Λογιστή/Σύμβουλο',
]

// Program-specific reasons: maps a substring of the program title to extra reasons
// that should only apply to matching programs.
const PROGRAM_SPECIFIC_REASONS: { match: string; labels: string[] }[] = [
  { match: 'ΞΕΚΙΝΩ', labels: ['Επιχείρηση με Ίδρυση Πάνω από 5 Έτη'] },
  { match: 'ΕΞΩΔΙΚΑΣΤ', labels: ['Συνολικές Οφειλές Κάτω του Ελάχιστου Ορίου'] },
  { match: 'ΜΙΚΡΟΠΙΣΤΩΣ', labels: ['Ήδη Ενεργό Δάνειο Μικροπίστωσης'] },
]

// One-time backfill: ΚΑΔ codes for divisions 01-09 are sometimes stored without
// their leading zero (e.g. "1261200" instead of "01261200"), which breaks
// prefix-based category filters/where-clauses. Pad them back to 8 digits.
export async function ensureFirmActCodesNormalized() {
  const settings = await getSettings()
  if (settings.firmActCodesNormalized) return
  await prisma.$executeRaw`UPDATE "BusinessActivity" SET "firmActCode" = '0' || "firmActCode" WHERE length("firmActCode") = 7 AND "firmActCode" ~ '^[0-9]+$'`
  await prisma.appSetting.update({ where: { id: 'main' }, data: { firmActCodesNormalized: true } })
}

async function getSettings() {
  return prisma.appSetting.upsert({ where: { id: 'main' }, create: { id: 'main' }, update: {} })
}

export async function ensureCriteriaSuggestionsSeeded() {
  const settings = await getSettings()
  if (settings.criteriaSuggestionsSeeded) return
  const existing = await prisma.eligibilityCriterion.findMany({ select: { label: true } })
  const existingLabels = new Set(existing.map(e => e.label))
  const missing = CRITERIA_SUGGESTIONS.filter(l => !existingLabels.has(l))
  if (missing.length > 0) {
    let order = await prisma.eligibilityCriterion.count()
    await prisma.eligibilityCriterion.createMany({
      data: missing.map(label => ({ label, order: order++ })),
    })
  }
  await prisma.appSetting.update({ where: { id: 'main' }, data: { criteriaSuggestionsSeeded: true } })
}

export async function ensureTagSuggestionsSeeded() {
  const settings = await getSettings()
  if (settings.tagSuggestionsSeeded) return
  const existing = await prisma.tagOption.findMany({ select: { label: true } })
  const existingLabels = new Set(existing.map(e => e.label))
  const missing = TAG_SUGGESTIONS.filter(l => !existingLabels.has(l))
  if (missing.length > 0) {
    let order = await prisma.tagOption.count()
    await prisma.tagOption.createMany({
      data: missing.map(label => ({ label, order: order++ })),
    })
  }
  await prisma.appSetting.update({ where: { id: 'main' }, data: { tagSuggestionsSeeded: true } })
}

export async function ensureErmisTagsBackfilled() {
  // Find businesses that have lead interests but are missing those program tags.
  // Self-detecting: no schema flag needed — stops naturally once all are backfilled.
  const interests = await prisma.businessLeadInterest.findMany({
    select: { businessId: true, program: true },
  })
  if (interests.length === 0) return

  const allTags = Array.from(new Set(interests.map(i => i.program.trim()).filter(Boolean)))

  // Ensure TagOptions exist for all program names
  for (const tag of allTags) {
    const exists = await prisma.tagOption.findFirst({ where: { label: tag } })
    if (!exists) {
      const count = await prisma.tagOption.count()
      await prisma.tagOption.create({ data: { label: tag, order: count } })
    }
  }

  // Group interests by business
  const byBusiness = new Map<string, Set<string>>()
  for (const { businessId, program } of interests) {
    const tag = program.trim()
    if (!tag) continue
    if (!byBusiness.has(businessId)) byBusiness.set(businessId, new Set())
    byBusiness.get(businessId)!.add(tag)
  }

  // Only update businesses that are actually missing tags (avoids unnecessary writes)
  const businessIds = Array.from(byBusiness.keys())
  const businesses = await prisma.business.findMany({
    where: { id: { in: businessIds } },
    select: { id: true, tags: true },
  })

  for (const biz of businesses) {
    const needed = Array.from(byBusiness.get(biz.id) ?? [])
    const missing = needed.filter(t => !biz.tags.includes(t))
    if (missing.length > 0) {
      await prisma.business.update({ where: { id: biz.id }, data: { tags: [...biz.tags, ...missing] } })
    }
  }
}

export async function ensureRejectionReasonSuggestionsSeeded() {
  const settings = await getSettings()
  if (settings.rejectionReasonSuggestionsSeeded) return
  const existing = await prisma.rejectionReason.findMany({ select: { label: true } })
  const existingLabels = new Set(existing.map(e => e.label))

  const toCreate: { label: string; programIds: string[] }[] = []

  for (const label of REJECTION_REASON_SUGGESTIONS) {
    if (!existingLabels.has(label)) toCreate.push({ label, programIds: [] })
  }

  const programSpecific = PROGRAM_SPECIFIC_REASONS.filter(p => !p.labels.every(l => existingLabels.has(l)))
  if (programSpecific.length > 0) {
    const programs = await prisma.program.findMany({ select: { id: true, title: true } })
    for (const entry of programSpecific) {
      const matchingPrograms = programs.filter(p => p.title.toUpperCase().includes(entry.match))
      if (matchingPrograms.length === 0) continue
      for (const label of entry.labels) {
        if (!existingLabels.has(label)) {
          toCreate.push({ label, programIds: matchingPrograms.map(p => p.id) })
        }
      }
    }
  }

  if (toCreate.length > 0) {
    let order = await prisma.rejectionReason.count()
    for (const item of toCreate) {
      await prisma.rejectionReason.create({ data: { label: item.label, programIds: item.programIds, order: order++ } })
    }
  }
  await prisma.appSetting.update({ where: { id: 'main' }, data: { rejectionReasonSuggestionsSeeded: true } })
}
