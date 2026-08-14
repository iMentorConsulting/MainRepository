import { prisma } from '@/lib/prisma'
import { getOrCreateGemiErmisLink } from '@/lib/gemi-ermis'

const APP_URL = process.env.APP_URL ?? 'https://logistis.i-mentor.gr'

export function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => vars[key] ?? '')
}

const PROGRAM_SELECT = {
  title: true, description: true, websiteUrl: true, endDate: true, extraCriteriaIds: true,
  minInvestment: true, maxInvestment: true, minSubsidyPct: true, maxSubsidyPct: true,
  // ΔΥΠΑ hiring subsidy fields
  monthlyAmount: true, subsidyMonths: true, totalBenefit: true, beneficiaries: true, regions: true,
} as const

const formatAmount = (val: number | null | undefined) =>
  val != null ? new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val) : ''

// Builds the variable block for one program slot. `suffix` is '' / '2' / '3'.
async function buildProgramVars(gemiId: string, programId: string, suffix: '' | '2' | '3'): Promise<Record<string, string>> {
  const pfx = suffix ? `program${suffix}` : 'program'
  const ermisKey = suffix ? `ermis_link_${suffix}` : 'ermis_link'
  const empty: Record<string, string> = {
    [`${pfx}_title`]: '', [`${pfx}_description`]: '', [`${pfx}_url`]: '',
    [`${pfx}_deadline`]: '', [`${pfx}_amount`]: '', [`${pfx}_subsidy`]: '',
    [`${pfx}_extra_criteria`]: '', [`${pfx}_match_reason`]: '',
    [`${pfx}_monthly_amount`]: '', [`${pfx}_subsidy_months`]: '',
    [`${pfx}_total_benefit`]: '', [`${pfx}_beneficiaries`]: '', [`${pfx}_regions`]: '',
    [ermisKey]: '',
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

  const extraCriteriaText = (program as any).extraCriteriaIds?.length
    ? (await prisma.eligibilityCriterion.findMany({ where: { id: { in: (program as any).extraCriteriaIds } }, select: { label: true } }))
        .map(c => `• ${c.label}`).join(' | ')
    : ''

  const deadline = (program as any).endDate
    ? new Date((program as any).endDate).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  const min = (program as any).minInvestment ?? null
  const max = (program as any).maxInvestment ?? null
  const amount = min && max && min !== max
    ? `${formatAmount(min)} – ${formatAmount(max)}`
    : formatAmount(max ?? min)

  const minPct = (program as any).minSubsidyPct ?? null
  const maxPct = (program as any).maxSubsidyPct ?? null
  const subsidy = minPct != null && maxPct != null && minPct !== maxPct
    ? `${minPct}% – ${maxPct}%`
    : (maxPct ?? minPct) != null ? `${maxPct ?? minPct}%` : ''

  const ermisLink = await getOrCreateGemiErmisLink(gemiId, programId).catch(() => '')

  return {
    [`${pfx}_title`]: (program as any).title,
    [`${pfx}_description`]: (program as any).description ?? '',
    [`${pfx}_url`]: (program as any).websiteUrl ?? '',
    [`${pfx}_deadline`]: deadline,
    [`${pfx}_amount`]: amount,
    [`${pfx}_subsidy`]: subsidy,
    [`${pfx}_extra_criteria`]: extraCriteriaText,
    [`${pfx}_match_reason`]: (match?.matchReason ?? []).map((r: string) => `• ${r}`).join(' | '),
    [`${pfx}_monthly_amount`]: (program as any).monthlyAmount ?? '',
    [`${pfx}_subsidy_months`]: (program as any).subsidyMonths ?? '',
    [`${pfx}_total_benefit`]: (program as any).totalBenefit ?? '',
    [`${pfx}_beneficiaries`]: (program as any).beneficiaries ?? '',
    [`${pfx}_regions`]: (program as any).regions ?? '',
    [ermisKey]: ermisLink,
  }
}

export async function buildRecipientVariables(gemiId: string, programId: string, programId2?: string, programId3?: string): Promise<Record<string, string>> {
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

  // Tertiary program: campaign's explicit programId3, else the recipient's
  // best match that isn't already used by slots 1 or 2.
  let resolvedProgramId3 = programId3 ?? ''
  if (!resolvedProgramId3) {
    resolvedProgramId3 = allMatches.find(m => m.programId !== resolvedProgramId && m.programId !== resolvedProgramId2)?.programId ?? ''
  }
  if (resolvedProgramId3 === resolvedProgramId || resolvedProgramId3 === resolvedProgramId2) resolvedProgramId3 = ''

  const [programVars, program2Vars, program3Vars, accountant] = await Promise.all([
    buildProgramVars(gemiId, resolvedProgramId, ''),
    buildProgramVars(gemiId, resolvedProgramId2, '2'),
    buildProgramVars(gemiId, resolvedProgramId3, '3'),
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
    ...program3Vars,
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
