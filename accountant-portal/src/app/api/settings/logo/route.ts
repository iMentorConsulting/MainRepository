import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Public branding asset — needed on the pre-auth login page too.
  const setting = await prisma.appSetting.findUnique({ where: { id: 'main' } })
  return NextResponse.json({
    imentorLogoUrl: setting?.imentorLogoUrl || null,
    logistisLogoUrl: setting?.logistisLogoUrl || null,
  })
}

function validateLogoUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { imentorLogoUrl, logistisLogoUrl } = await request.json()

  if (imentorLogoUrl && !validateLogoUrl(imentorLogoUrl)) {
    return NextResponse.json({ error: 'Invalid logo URL' }, { status: 400 })
  }
  if (logistisLogoUrl && !validateLogoUrl(logistisLogoUrl)) {
    return NextResponse.json({ error: 'Invalid logo URL' }, { status: 400 })
  }

  const data: any = {}
  if (imentorLogoUrl !== undefined) data.imentorLogoUrl = imentorLogoUrl || null
  if (logistisLogoUrl !== undefined) data.logistisLogoUrl = logistisLogoUrl || null

  const setting = await prisma.appSetting.upsert({
    where: { id: 'main' },
    update: data,
    create: { id: 'main', ...data },
  })
  return NextResponse.json({ imentorLogoUrl: setting.imentorLogoUrl, logistisLogoUrl: setting.logistisLogoUrl })
}
