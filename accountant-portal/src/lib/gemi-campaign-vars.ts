import { prisma } from '@/lib/prisma'
import { getOrCreateGemiErmisLink } from '@/lib/gemi-ermis'

const APP_URL = process.env.APP_URL ?? 'https://logistis.i-mentor.gr'

export function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => vars[key] ?? '')
}

const PROGRAM_SELECT = {
  title: true, description: true, websiteUrl: true, endDate: true, extraCriteriaIds: true,
  minInvestment: true, maxInvestment: true, minSubsidyPct: true, maxSubsidyPct: true,
} as const

const formatAmount = (val: number | null | undefined) =>
  val != null ? new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val) : ''

// Builds the variable block for one program (title/description/amount/subsidy/
// deadline/criteria/match_reason/ermis link). `suffix` is '' for the primary
// program and '2' for the secondary ({{program2_*}}, {{ermis_link_2}}).
async function buildProgramVars(gemiId: string, programId: string, suffix: '' | '2'): Promise<Record<string, string>> {
  const empty = {
    [`program${suffix}_title`]: '',
    [`program${suffix}_description`]: '',
    [`program${suffix}_url`]: '',
    [`program${suffix}_deadline`]: '',
    [`program${suffix}_amount`]: '',
    [`program${suffix}_subsidy`]: '',
    [`program${suffix}_extra_criteria`]: '',
    [`program${suffix}_match_reason`]: '',
    [suffix ? `ermis_link_${suffix}` : 'ermis_link']: '',
  }
  if (!programId) return empty

  const [program, match] = await Promise.all([
    prisma.program.findUnique({ where: { id: programId }, select: PROGRAM_SELECT }),
    prisma.gemiProgramMatch.findUnique({
      where: { gemiId_programId: { gemiId, programId } },
      select: { matchReason: true },
    }),
  ])
  if (!program) return empty

  const extraCriteriaText = program.extraCriteriaIds?.length
    ? (await prisma.eligibilityCriterion.findMany({ where: { id: { in: program.extraCriteriaIds } }, select: { label: true } }))
        .map(c => `• ${c.label}`).join(' | ')
    : ''

  const deadline = program.endDate
    ? new Date(program.endDate).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  const min = program.minInvestment ?? null
  const max = program.maxInvestment ?? null
  const amount = min && max && min !== max
    ? `${formatAmount(min)} – ${formatAmount(max)}`
    : formatAmount(max ?? min)

  const minPct = program.minSubsidyPct ?? null
  const maxPct = program.maxSubsidyPct ?? null
  const subsidy = minPct != null && maxPct != null && minPct !== maxPct
    ? `${minPct}% – ${maxPct}%`
    : (maxPct ?? minPct) != null ? `${maxPct ?? minPct}%` : ''

  const ermisLink = await getOrCreateGemiErmisLink(gemiId, programId).catch(() => '')

  return {
    [`program${suffix}_title`]: program.title,
    [`program${suffix}_description`]: program.description ?? '',
    [`program${suffix}_url`]: program.websiteUrl ?? '',
    [`program${suffix}_deadline`]: deadline,
    [`program${suffix}_amount`]: amount,
    [`program${suffix}_subsidy`]: subsidy,
    [`program${suffix}_extra_criteria`]: extraCriteriaText,
    [`program${suffix}_match_reason`]: (match?.matchReason ?? []).map((r: string) => `• ${r}`).join(' | '),
    [suffix ? `ermis_link_${suffix}` : 'ermis_link']: ermisLink,
  }
}

export async function buildRecipientVariables(gemiId: string, programId: string, programId2?: string): Promise<Record<string, string>> {
  const gemi = await prisma.gemiLookup.findUnique({
    where: { id: gemiId },
    select: {
      onomasia: true, afm: true, activities: true, unsubscribeToken: true,
      claimedAccountantId: true, postalAreaDescription: true, regdate: true,
      postalAddress: true, postalAddressNo: true, postalZipCode: true,
    },
  })
  if (!gemi) return {}

  // All non-rejected matches to active programs, best first — used both for
  // program fallbacks and the cross-selling variables.
  const allMatches = await prisma.gemiProgramMatch.findMany({
    where: { gemiId, status: { not: 'REJECTED' }, program: { active: true } },
    select: { programId: true, program: { select: { title: true } } },
    orderBy: { matchScore: 'desc' },
  })

  // Primary program: campaign's programId, else the recipient's best match
  let resolvedProgramId = programId
  if (!resolvedProgramId) resolvedProgramId = allMatches[0]?.programId ?? ''

  // Secondary program: campaign's explicit programId2, else the recipient's
  // best OTHER match (auto) — so {{program2_*}} always has something useful
  // when the business matches more than one program.
  let resolvedProgramId2 = programId2 ?? ''
  if (!resolvedProgramId2) {
    resolvedProgramId2 = allMatches.find(m => m.programId !== resolvedProgramId)?.programId ?? ''
  }
  if (resolvedProgramId2 === resolvedProgramId) resolvedProgramId2 = ''

  const [programVars, program2Vars, accountant] = await Promise.all([
    buildProgramVars(gemiId, resolvedProgramId, ''),
    buildProgramVars(gemiId, resolvedProgramId2, '2'),
    gemi.claimedAccountantId
      ? prisma.accountant.findUnique({ where: { id: gemi.claimedAccountantId }, select: { contactPerson: true, officeName: true } })
      : null,
  ])

  const activities = (Array.isArray(gemi.activities) ? gemi.activities : []) as any[]
  const primaryKad = activities.find((a: any) => a.firmActKind === 1) ?? activities[0]

  const afm = gemi.afm ?? ''
  const onomasia = gemi.onomasia ?? afm
  const unsubscribeLink = gemi.unsubscribeToken ? `${APP_URL}/api/gemi/unsubscribe/${gemi.unsubscribeToken}` : ''
  const ermisLink = programVars['ermis_link'] ?? ''
  const exodikastikosLink = ermisLink ? `${ermisLink}?type=themis` : '#'

  // Cross-selling: other matched programs beyond the primary
  const otherPrograms = allMatches.filter(m => m.programId !== resolvedProgramId)

  return {
    business_name: onomasia,
    afm,
    accountant_name: accountant?.contactPerson ?? 'i-MENTOR',
    accountant_office: accountant?.officeName ?? 'i-MENTOR',
    ...programVars,
    ...program2Vars,
    // Back-compat aliases for the primary program's original variable names
    extra_criteria: programVars['program_extra_criteria'] ?? '',
    match_reason: programVars['program_match_reason'] ?? '',
    region: gemi.postalAreaDescription ?? '',
    address: [gemi.postalAddress, gemi.postalAddressNo, gemi.postalZipCode, gemi.postalAreaDescription].filter(Boolean).join(' '),
    founding_date: gemi.regdate
      ? new Date(gemi.regdate).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '',
    kad_code: primaryKad?.firmActCode ?? '',
    kad_description: primaryKad?.firmActDescr ?? '',
    unsubscribe_link: unsubscribeLink,
    exodikastikos_link: exodikastikosLink,
    matched_programs_count: String(allMatches.length),
    other_programs_count: String(otherPrograms.length),
    other_programs: otherPrograms.map(m => `• ${m.program.title}`).join('  '),
  }
}
