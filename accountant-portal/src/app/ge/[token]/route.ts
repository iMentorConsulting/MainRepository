import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const type = request.nextUrl.searchParams.get('type') ?? 'ermis'
  const baseUrl = process.env.APP_URL || new URL(request.url).origin
  return NextResponse.redirect(`${baseUrl}/gemi-entry/${token}?type=${type}`, 302)
}
