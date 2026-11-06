import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildAgreementDocx } from '@/lib/agreement-docx'

export const dynamic = 'force-dynamic'

// Admin/consultant-only: generates the "ΣΥΜΦΩΝΗΤΙΚΟ ΣΥΝΕΡΓΑΣΙΑΣ" .docx for
// a business + matched program, prefilled with the business's data and
// I-MENTOR's own fixed details, for local download (no email sent).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { programId, applicationFee, implementationFee } = await request.json().catch(() => ({}))
  if (typeof programId !== 'string' || !programId) {
    return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })
  }
  const implementationFeeNum = Number(implementationFee)
  if (!Number.isFinite(implementationFeeNum) || implementationFeeNum < 0) {
    return NextResponse.json({ error: 'Λείπει ή είναι μη έγκυρη η αμοιβή υλοποίησης' }, { status: 400 })
  }
  let applicationFeeNum: number | null = null
  if (applicationFee !== undefined && applicationFee !== null && applicationFee !== '') {
    applicationFeeNum = Number(applicationFee)
    if (!Number.isFinite(applicationFeeNum) || applicationFeeNum < 0) {
      return NextResponse.json({ error: 'Μη έγκυρη αμοιβή αίτησης' }, { status: 400 })
    }
  }

  const [business, program] = await Promise.all([
    prisma.business.findUnique({
      where: { id: params.id },
      select: {
        onomasia: true, afm: true, doyDescr: true,
        postalAddress: true, postalAddressNo: true, postalZipCode: true, postalAreaDescription: true,
      },
    }),
    prisma.program.findUnique({ where: { id: programId }, select: { title: true } }),
  ])
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })
  if (!program) return NextResponse.json({ error: 'Δεν βρέθηκε το πρόγραμμα' }, { status: 404 })

  const buffer = await buildAgreementDocx({
    business,
    programTitle: program.title,
    applicationFee: applicationFeeNum,
    implementationFee: implementationFeeNum,
  })

  const safeName = (business.onomasia || business.afm).replace(/[^a-zA-Z0-9Α-Ωα-ωΆ-Ώά-ώ]+/g, '_').slice(0, 60)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Symfonitiko_${safeName}.docx"`,
    },
  })
}
