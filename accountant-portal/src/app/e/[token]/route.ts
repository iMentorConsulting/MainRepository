import { NextRequest, NextResponse } from 'next/server'

// Short-link alias for /match/[token], so links sent over Viber/SMS read as
// a clean "i-mentor.gr/e/<token>" instead of "i-mentor.gr/match/<token>".
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return NextResponse.redirect(new URL(`/match/${token}`, request.url), 302)
}
