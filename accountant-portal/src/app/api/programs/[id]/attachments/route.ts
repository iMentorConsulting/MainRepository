import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const MAX_SIZE_BYTES = 20 * 1024 * 1024

// Stores an uploaded PDF's actual bytes out-of-line from the Program row —
// see the schema comment on ProgramAttachmentFile for why. Returns the
// download URL to push into Program.attachmentUrls instead of the raw
// data: URL.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, dataUrl } = await request.json().catch(() => ({}))
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Λείπει ο τίτλος' }, { status: 400 })
  }
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return NextResponse.json({ error: 'Μη έγκυρο αρχείο' }, { status: 400 })
  }

  const program = await prisma.program.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!program) return NextResponse.json({ error: 'Δεν βρέθηκε πρόγραμμα' }, { status: 404 })

  const commaIdx = dataUrl.indexOf(',')
  if (commaIdx === -1) return NextResponse.json({ error: 'Μη έγκυρο αρχείο' }, { status: 400 })
  const header = dataUrl.slice(5, commaIdx) // "<mime>;base64"
  const mimeType = header.split(';')[0] || 'application/pdf'
  const buffer = Buffer.from(dataUrl.slice(commaIdx + 1), 'base64')
  if (buffer.length > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'Μέγιστο μέγεθος αρχείου: 20 MB' }, { status: 400 })
  }

  const file = await prisma.programAttachmentFile.create({
    data: { programId: program.id, name: name.trim(), mimeType, data: buffer },
  })

  return NextResponse.json({ url: `/api/programs/${program.id}/attachments/${file.id}`, name: file.name })
}
