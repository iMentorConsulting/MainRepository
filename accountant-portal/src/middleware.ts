import { NextRequest, NextResponse } from 'next/server'

const CANONICAL_HOST = 'logistis.i-mentor.gr'

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || ''

  // Redirect Railway internal URL to canonical domain
  if (host !== CANONICAL_HOST && host.includes('railway.app')) {
    const url = request.nextUrl.clone()
    url.host = CANONICAL_HOST
    url.protocol = 'https:'
    url.port = ''
    return NextResponse.redirect(url, { status: 301 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
}
