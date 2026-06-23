import { NextRequest, NextResponse } from 'next/server'

// Short-link alias for /match/[token], so links sent over Viber/SMS read as
// a clean "i-mentor.gr/e/<token>" instead of "i-mentor.gr/match/<token>".
// Resolve against APP_URL rather than request.url — behind Railway's proxy
// request.url can reflect an internal/non-public host, which turns the
// redirect's Location header into an address the recipient's browser can't
// reach ("Δεν είναι δυνατή η πρόσβαση σε αυτόν τον ιστότοπο").
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params
  const baseUrl = process.env.APP_URL || new URL(request.url).origin
  return NextResponse.redirect(`${baseUrl}/match/${token}`, 302)
}
