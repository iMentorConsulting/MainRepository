import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const CANONICAL_HOST = 'logistis.i-mentor.gr'
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

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

  // Basic CSRF protection: for state-changing API requests, the Origin header
  // (sent by all browsers on cross-site fetch/form submissions) must match the
  // request's own Host. Same-origin requests pass; cross-site requests are
  // rejected before they reach any route handler.
  if (
    request.nextUrl.pathname.startsWith('/api/') &&
    !request.nextUrl.pathname.startsWith('/api/public/') &&
    MUTATING_METHODS.has(request.method)
  ) {
    const origin = request.headers.get('origin')
    if (origin) {
      let originHost: string | null = null
      try {
        originHost = new URL(origin).host
      } catch {
        originHost = null
      }
      if (!originHost || originHost !== host) {
        return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
      }
    }
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
}
