import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string; fileId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const file = await prisma.programAttachmentFile.findUnique({ where: { id: params.fileId } })
  if (!file || file.programId !== params.id) return NextResponse.json({ error: 'Δεν βρέθηκε αρχείο' }, { status: 404 })

  const ext = file.mimeType === 'application/pdf' ? '.pdf' : ''
  const asciiName = file.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'document'
  const utf8Name = encodeURIComponent(file.name.slice(0, 80))

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${asciiName}${ext}"; filename*=UTF-8''${utf8Name}${ext}`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
