import { MatchStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

// "Αποστολή Ειδοποιήσεων" tells businesses/accountants they match a program. It
// must NOT propose that for a business that already came in with interest in
// that SAME program — e.g. from Case Management, where Ερμής already
// messaged them (and may have talked to them) about it. Such a business carries
// a tag with the program's name (added on the CM / Ερμής flow), a
// CM-originated Ερμής session for that program, an Υπόθεση (case) for it, and/or
// (for ΓΕΜΗ-tagged businesses) an email already sent that names the whole program.
//
// Those matches are marked as notified (they are "handled"), so they leave the
// preview, the counters and the "pending notifications" list for good.

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export async function markAlreadyEngagedMatchesNotified(programId?: string): Promise<number> {
  const matches = await prisma.programMatch.findMany({
    where: {
      notified: false,
      status: { not: MatchStatus.REJECTED },
      ...(programId ? { programId } : {}),
    },
    select: {
      id: true, businessId: true, programId: true,
      business: { select: { tags: true } },
      program: { select: { title: true } },
    },
  })
  if (matches.length === 0) return 0

  const byTag = new Set<string>()
  for (const m of matches) {
    const title = norm(m.program.title)
    if ((m.business.tags || []).some(t => norm(t) === title)) byTag.add(m.id)
  }

  // CM-originated Ερμής sessions (callbackUrl set) for exactly this business + program.
  const tokens = await prisma.businessMatchToken.findMany({
    where: {
      callbackUrl: { not: null },
      businessId: { in: Array.from(new Set(matches.map(m => m.businessId))) },
      ...(programId ? { programId } : {}),
    },
    select: { businessId: true, programId: true },
  })
  const tokenKeys = new Set(tokens.map(t => `${t.businessId}:${t.programId}`))

  // An Υπόθεση (case) already exists for this business + program, in any status.
  const cases = await prisma.clientCase.findMany({
    where: {
      programId: programId ?? { not: null },
      businessId: { in: Array.from(new Set(matches.map(m => m.businessId))) },
    },
    select: { businessId: true, programId: true },
  })
  const caseKeys = new Set(cases.map(c => `${c.businessId}:${c.programId}`))

  // ΓΕΜΗ-tagged business that was already EMAILED about this program: some email in its
  // communication history (campaign title/subject or an ad-hoc send's subject)
  // contains the program's WHOLE name ("Leader Ημαθίας" / "LEADER ΗΜΑΘΙΑΣ").
  const gemiCandidates = matches.filter(m => (m.business.tags || []).some(t => norm(t) === 'γεμη'))
  const emailedKeys = new Set<string>()
  if (gemiCandidates.length > 0) {
    const bizIds = Array.from(new Set(gemiCandidates.map(m => m.businessId)))
    const businesses = await prisma.business.findMany({ where: { id: { in: bizIds } }, select: { id: true, afm: true } })
    const afmByBiz = new Map(businesses.map(b => [b.id, b.afm]))
    const afms = businesses.map(b => b.afm)
    const isEmail = (ch: string | null | undefined) => (ch || '').toUpperCase().includes('EMAIL')

    const [recs, gemiRecs, logs] = await Promise.all([
      prisma.campaignRecipient.findMany({
        where: { businessId: { in: bizIds }, sentAt: { not: null } },
        select: { businessId: true, channel: true, campaign: { select: { title: true, subject: true } } },
      }),
      prisma.gemiCampaignRecipient.findMany({
        where: { gemi: { afm: { in: afms } }, sentAt: { not: null } },
        select: { channel: true, gemi: { select: { afm: true } }, campaign: { select: { title: true, subject: true } } },
      }),
      prisma.messageLog.findMany({
        where: { afm: { in: afms }, success: true, channel: 'EMAIL' },
        select: { afm: true, subject: true },
      }),
    ])

    // texts of every email sent, per ΑΦΜ
    const textsByAfm = new Map<string, string[]>()
    const add = (afm: string | null | undefined, ...texts: (string | null | undefined)[]) => {
      if (!afm) return
      const list = textsByAfm.get(afm) ?? []
      for (const t of texts) if (t) list.push(norm(t))
      textsByAfm.set(afm, list)
    }
    for (const r of recs) if (isEmail(r.channel)) add(afmByBiz.get(r.businessId), r.campaign?.title, r.campaign?.subject)
    for (const r of gemiRecs) if (isEmail(r.channel)) add(r.gemi?.afm, r.campaign?.title, r.campaign?.subject)
    for (const l of logs) add(l.afm, l.subject)

    for (const m of gemiCandidates) {
      const title = norm(m.program.title)
      const texts = textsByAfm.get(afmByBiz.get(m.businessId) ?? '') ?? []
      if (title && texts.some(t => t.includes(title))) emailedKeys.add(m.id)
    }
  }

  const ids = matches
    .filter(m => byTag.has(m.id) || emailedKeys.has(m.id) || tokenKeys.has(`${m.businessId}:${m.programId}`) || caseKeys.has(`${m.businessId}:${m.programId}`))
    .map(m => m.id)
  if (ids.length === 0) return 0

  await prisma.programMatch.updateMany({ where: { id: { in: ids } }, data: { notified: true } })
  return ids.length
}
