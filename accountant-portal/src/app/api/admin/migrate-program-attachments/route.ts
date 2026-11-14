import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// One-off: programs edited before the ProgramAttachmentFile table existed
// have their uploaded PDFs inlined as base64 data: URLs directly in
// Program.attachmentUrls — multi-MB strings shipped on every fetch of that
// program (and the whole /programs list), which is what was slowing the
// app down and breaking filenames on iOS Safari. Moves each one's bytes
// into ProgramAttachmentFile and rewrites the URL to the real download
// route. Safe to re-run — already-migrated programs have no data: entries
// left to find.
export async function POST(_req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const programs = await prisma.program.findMany({
    where: { attachmentUrls: { isEmpty: false } },
    select: { id: true, attachmentUrls: true, attachmentNames: true },
  })

  let programsMigrated = 0
  let filesMigrated = 0
  let bytesMoved = 0

  for (const program of programs) {
    if (!program.attachmentUrls.some(u => u.startsWith('data:'))) continue

    const newUrls: string[] = []
    for (let i = 0; i < program.attachmentUrls.length; i++) {
      const url = program.attachmentUrls[i]
      if (!url.startsWith('data:')) { newUrls.push(url); continue }

      const commaIdx = url.indexOf(',')
      if (commaIdx === -1) { newUrls.push(url); continue }
      const mimeType = url.slice(5, commaIdx).split(';')[0] || 'application/pdf'
      const buffer = Buffer.from(url.slice(commaIdx + 1), 'base64')
      const name = program.attachmentNames[i] || `Σχετικό αρχείο ${i + 1}`

      const file = await prisma.programAttachmentFile.create({
        data: { programId: program.id, name, mimeType, data: buffer },
      })
      newUrls.push(`/api/programs/${program.id}/attachments/${file.id}`)
      filesMigrated++
      bytesMoved += buffer.length
    }

    await prisma.program.update({ where: { id: program.id }, data: { attachmentUrls: newUrls } })
    programsMigrated++
  }

  return NextResponse.json({ programsMigrated, filesMigrated, megabytesMoved: Math.round(bytesMoved / 1024 / 1024) })
}
