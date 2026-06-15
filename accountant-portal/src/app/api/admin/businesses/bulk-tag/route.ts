import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { ensureRejectionReasonSuggestionsSeeded, ensureCriteriaSuggestionsSeeded } from '@/lib/suggestions-seed'
import * as XLSX from 'xlsx'

function norm(s: any): string {
  return String(s ?? '').trim()
}

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function pick(row: any, ...keys: string[]): string {
  const map: Record<string, any> = {}
  for (const k of Object.keys(row)) map[normKey(k)] = row[k]
  for (const key of keys) {
    const v = map[normKey(key)]
    if (v !== undefined && v !== null && norm(v) !== '') return norm(v)
  }
  return ''
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const tag = String(formData.get('tag') || '').trim()
  if (!file) return NextResponse.json({ error: 'Χωρίς αρχείο' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  let rows: any[] = []

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json(sheet)
  } catch {
    const text = buffer.toString('utf-8')
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const first = lines[0]?.toLowerCase().replace(/\s/g, '')
    if (first === 'afm' || first === 'αφμ') {
      rows = lines.slice(1).map(line => ({ afm: line.split(',')[0] }))
    } else {
      rows = lines.map(line => ({ afm: line.split(',')[0] }))
    }
  }

  // Parse rows into structured entries
  interface RowData {
    afm: string
    tag: string
    program: string
    rejectionReason: string
    criterionLabel: string
    extraCondition: string
  }
  const parsed: RowData[] = []
  for (const row of rows) {
    const rawAfm = row.afm ?? row.ΑΦΜ ?? row.AFM ?? row.Afm ?? Object.values(row)[0]
    const afm = String(rawAfm ?? '').trim().replace(/\D/g, '')
    if (afm.length !== 9) continue
    parsed.push({
      afm,
      tag: pick(row, 'tag', 'tags', 'TAG'),
      program: pick(row, 'Πρόγραμμα', 'PROGRAM', 'Program'),
      rejectionReason: pick(row, 'Λόγοι Απόρριψης Match', 'ΛΟΓΟΙ ΑΠΟΡΡΙΨΗΣ', 'Λόγος Απόρριψης'),
      criterionLabel: pick(row, 'Κριτήριο', 'ΚΡΙΤΗΡΙΟ', 'Criterion'),
      extraCondition: pick(row, 'Πρόσθετες Προϋποθέσεις Προγραμμάτων', 'ΠΡΟΣΘΕΤΕΣ ΠΡΟΫΠΟΘΕΣΕΙΣ ΠΡΟΓΡΑΜΜΑΤΩΝ', 'Πρόσθετες Προϋποθέσεις'),
    })
  }

  if (parsed.length === 0) {
    return NextResponse.json({ error: 'Δεν βρέθηκαν έγκυρα ΑΦΜ στο αρχείο' }, { status: 400 })
  }

  // Resolve businesses
  const afms = new Set(parsed.map(r => r.afm))
  const businesses = await prisma.business.findMany({
    where: { afm: { in: Array.from(afms) } },
    select: { id: true, afm: true, tags: true },
  })
  const businessByAfm = new Map(businesses.map(b => [b.afm, b]))
  const notFoundAfms = Array.from(afms).filter(afm => !businessByAfm.has(afm))

  await ensureRejectionReasonSuggestionsSeeded().catch(() => {})
  await ensureCriteriaSuggestionsSeeded().catch(() => {})

  // Preload programs, rejection reasons, criteria for matching
  const programs = await prisma.program.findMany({ select: { id: true, title: true } })
  const reasons = await prisma.rejectionReason.findMany({ select: { id: true, label: true } })
  const criteria = await prisma.eligibilityCriterion.findMany({ select: { id: true, label: true } })

  function findProgram(name: string) {
    if (!name) return null
    const n = name.trim().toLowerCase()
    let p = programs.find(p => p.title.trim().toLowerCase() === n)
    if (!p) p = programs.find(p => p.title.trim().toLowerCase().includes(n) || n.includes(p.title.trim().toLowerCase()))
    return p || null
  }
  function findReason(label: string) {
    if (!label) return null
    const n = label.trim().toLowerCase()
    let r = reasons.find(r => r.label.trim().toLowerCase() === n)
    if (!r) r = reasons.find(r => r.label.trim().toLowerCase().includes(n) || n.includes(r.label.trim().toLowerCase()))
    return r || null
  }
  function findCriterion(label: string) {
    if (!label) return null
    const n = label.trim().toLowerCase()
    let c = criteria.find(c => c.label.trim().toLowerCase() === n)
    if (!c) c = criteria.find(c => c.label.trim().toLowerCase().includes(n) || n.includes(c.label.trim().toLowerCase()))
    return c || null
  }
  function parseYesNo(v: string): 'PASS' | 'FAIL' | null {
    const n = v.trim().toLowerCase()
    if (['yes', 'y', 'ναι', 'true', '1'].includes(n)) return 'PASS'
    if (['no', 'n', 'οχι', 'όχι', 'false', '0'].includes(n)) return 'FAIL'
    return null
  }

  let tagsUpdated = 0
  let rejectionsSet = 0
  let criteriaSet = 0
  const notFoundPrograms = new Set<string>()
  const notFoundReasons = new Set<string>()
  const notFoundCriteria = new Set<string>()
  const ambiguousAfms = new Set<string>()

  for (const row of parsed) {
    const business = businessByAfm.get(row.afm)
    if (!business) continue

    // 1. TAG
    const businessTag = row.tag || tag
    if (businessTag && !business.tags.includes(businessTag)) {
      await prisma.business.update({
        where: { id: business.id },
        data: { tags: { push: businessTag } },
      })
      business.tags.push(businessTag)
      tagsUpdated++
    }

    // Need program for the other two operations
    const wantsRejection = !!row.rejectionReason
    const wantsCriterion = !!row.extraCondition && !!row.criterionLabel
    if (!wantsRejection && !wantsCriterion) continue

    if (!row.program) {
      // can't proceed without program
      continue
    }
    const program = findProgram(row.program)
    if (!program) {
      notFoundPrograms.add(row.program)
      continue
    }

    // Ensure ProgramMatch exists
    let match = await prisma.programMatch.findUnique({
      where: { programId_businessId: { programId: program.id, businessId: business.id } },
    })

    // 2. Rejection reason
    if (wantsRejection) {
      const reason = findReason(row.rejectionReason)
      if (!reason) {
        notFoundReasons.add(row.rejectionReason)
      } else {
        if (!match) {
          match = await prisma.programMatch.create({
            data: {
              programId: program.id,
              businessId: business.id,
              matchScore: 0,
              status: 'REJECTED',
              rejectionReasonId: reason.id,
            },
          })
        } else {
          match = await prisma.programMatch.update({
            where: { id: match.id },
            data: { rejectionReasonId: reason.id, status: 'REJECTED' },
          })
        }
        rejectionsSet++
      }
    }

    // 3. Extra criterion check
    if (wantsCriterion) {
      const criterion = findCriterion(row.criterionLabel)
      const value = parseYesNo(row.extraCondition)
      if (!criterion) {
        notFoundCriteria.add(row.criterionLabel)
      } else if (!value) {
        // invalid YES/NO value, skip
      } else {
        if (!match) {
          match = await prisma.programMatch.create({
            data: {
              programId: program.id,
              businessId: business.id,
              matchScore: 0,
              status: 'POTENTIAL',
            },
          })
        }
        await prisma.matchCriterionCheck.upsert({
          where: { matchId_criterionId: { matchId: match.id, criterionId: criterion.id } },
          update: { value },
          create: { matchId: match.id, criterionId: criterion.id, value },
        })
        criteriaSet++

        // Keep status in sync, mirroring /api/matches/[id]/criteria behavior
        if (value === 'FAIL' && match.status !== 'REJECTED') {
          match = await prisma.programMatch.update({
            where: { id: match.id },
            data: { status: 'REJECTED' },
          })
        }
      }
    }
  }

  await createAuditLog({
    userId: session.user.id,
    action: 'BULK_TAG',
    entity: 'Business',
    entityId: businesses.map(b => b.id).join(','),
    details: `Bulk import: ${tagsUpdated} tags, ${rejectionsSet} rejections, ${criteriaSet} criteria set (${afms.size} AFM submitted, ${notFoundAfms.length} not found)`,
  })

  return NextResponse.json({
    submitted: afms.size,
    matched: businesses.length,
    updated: tagsUpdated,
    tagsUpdated,
    rejectionsSet,
    criteriaSet,
    notFound: notFoundAfms,
    notFoundAfms,
    notFoundPrograms: Array.from(notFoundPrograms),
    notFoundReasons: Array.from(notFoundReasons),
    notFoundCriteria: Array.from(notFoundCriteria),
  })
}
