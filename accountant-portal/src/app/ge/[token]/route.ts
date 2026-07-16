import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params
  const baseUrl = process.env.APP_URL || new URL(request.url).origin
  return NextResponse.redirect(`${baseUrl}/gemi-match/${token}`, 302)
}
