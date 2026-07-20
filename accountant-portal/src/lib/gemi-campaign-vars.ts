import { prisma } from '@/lib/prisma'
import { getOrCreateGemiErmisLink } from '@/lib/gemi-ermis'

const APP_URL = process.env.APP_URL ?? 'https://logistis.i-mentor.gr'

export function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => vars[key] ?? '')
}

export async function buildRecipientVariables(gemiId: string, programId: string): Promise<Record<string, string>> {
  const gemi = await prisma.gemiLookup.findUnique({
    where: { id: gemiId },
    select: {
      onomasia: true, afm: true, activities: true, unsubscribeToken: true,
      claimedAccountantId: true, postalAreaDescription: true, regdate: true,
      postalAddress: true, postalAddressNo: true, postalZipCode: true,
    },
  })
  if (!gemi) return {}

  // When the campaign has no explicit program, fall back to the business's
  // best (highest-scoring, non-rejected) program match, so program variables
  // ({{program_title}}, {{program_amount}}, {{program_subsidy}}, ...) still
  // resolve instead of rendering empty.
  let resolvedProgramId = programId
  if (!resolvedProgramId) {
    const firstMatch = await prisma.gemiProgramMatch.findFirst({
      where: { gemiId, status: { not: 'REJECTED' } },
      select: { programId: true },
      orderBy: { matchScore: 'desc' },
    })
    resolvedProgramId = firstMatch?.programId ?? ''
  }

  const [program, match, accountant] = await Promise.all([
    resolvedProgramId ? prisma.program.findUnique({
      where: { id: resolvedProgramId },
      select: {
        title: true, description: true, websiteUrl: true, endDate: true, extraCriteriaIds: true,
        minInvestment: true, maxInvestment: true, minSubsidyPct: true, maxSubsidyPct: true,
      },
    }) : null,
    resolvedProgramId ? prisma.gemiProgramMatch.findUnique({
      where: { gemiId_programId: { gemiId, programId: resolvedProgramId } },
      select: { matchReason: true },
    }) : null,
    gemi.claimedAccountantId
      ? prisma.accountant.findUnique({ where: { id: gemi.claimedAccountantId }, select: { contactPerson: true, officeName: true } })
      : null,
  ])

  const activities = (Array.isArray(gemi.activities) ? gemi.activities : []) as any[]
  const primaryKad = activities.find((a: any) => a.firmActKind === 1) ?? activities[0]

  const extraCriteriaText = program?.extraCriteriaIds?.length
    ? (await prisma.eligibilityCriterion.findMany({ where: { id: { in: program.extraCriteriaIds } }, select: { label: true } }))
        .map(c => `• ${c.label}`).join(' | ')
    : ''

  const programDeadline = program?.endDate
    ? new Date(program.endDate).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  const ermisLink = resolvedProgramId
    ? await getOrCreateGemiErmisLink(gemiId, resolvedProgramId).catch(() => '')
    : ''

  const afm = gemi.afm ?? ''
  const onomasia = gemi.onomasia ?? afm
  const unsubscribeLink = gemi.unsubscribeToken ? `${APP_URL}/api/gemi/unsubscribe/${gemi.unsubscribeToken}` : ''
  const exodikastikosLink = ermisLink ? `${ermisLink}?type=themis` : '#'

  const formatAmount = (val: number | null | undefined) =>
    val != null ? new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val) : ''
  const min = program?.minInvestment ?? null
  const max = program?.maxInvestment ?? null
  const programAmount = min && max && min !== max
    ? `${formatAmount(min)} – ${formatAmount(max)}`
    : formatAmount(max ?? min)

  // Subsidy percentage range, e.g. "50% – 70%" (single value when min = max)
  const minPct = program?.minSubsidyPct ?? null
  const maxPct = program?.maxSubsidyPct ?? null
  const programSubsidy = minPct != null && maxPct != null && minPct !== maxPct
    ? `${minPct}% – ${maxPct}%`
    : (maxPct ?? minPct) != null ? `${maxPct ?? minPct}%` : ''

  return {
    business_name: onomasia,
    afm,
    accountant_name: accountant?.contactPerson ?? 'i-MENTOR',
    accountant_office: accountant?.officeName ?? 'i-MENTOR',
    program_title: program?.title ?? '',
    program_description: program?.description ?? '',
    program_url: program?.websiteUrl ?? '',
    program_deadline: programDeadline,
    program_amount: programAmount,
    program_subsidy: programSubsidy,
    region: gemi.postalAreaDescription ?? '',
    address: [gemi.postalAddress, gemi.postalAddressNo, gemi.postalZipCode, gemi.postalAreaDescription].filter(Boolean).join(' '),
    founding_date: gemi.regdate
      ? new Date(gemi.regdate).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '',
    kad_code: primaryKad?.firmActCode ?? '',
    kad_description: primaryKad?.firmActDescr ?? '',
    extra_criteria: extraCriteriaText,
    match_reason: (match?.matchReason ?? []).map((r: string) => `• ${r}`).join(' | '),
    ermis_link: ermisLink,
    unsubscribe_link: unsubscribeLink,
    exodikastikos_link: exodikastikosLink,
  }
}
