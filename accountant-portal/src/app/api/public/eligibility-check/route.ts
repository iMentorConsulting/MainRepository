import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkEligibilityForAfm } from '@/lib/eligibility-check-core'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// IP-based rate limiting — 5 searches per IP per 24 hours
// State lives on globalThis so it survives across requests without
// module-level side-effects that break Next.js build analysis.
// ---------------------------------------------------------------------------
declare global {
  // eslint-disable-next-line no-var
  var _rlStore: Map<string, { count: number; windowStart: number }> | undefined
}

const RL_WINDOW = 24 * 60 * 60 * 1000
const RL_MAX = 5

function getRlStore() {
  if (!globalThis._rlStore) globalThis._rlStore = new Map()
  return globalThis._rlStore
}

function splitEnv(key: string) {
  return (process.env[key] || '').split(',').map(s => s.trim()).filter(s => s.length > 0)
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function isWhitelisted(ip: string, email: string): boolean {
  const ips = splitEnv('RATE_LIMIT_WHITELIST_IPS')
  const emails = splitEnv('RATE_LIMIT_WHITELIST_EMAILS').map(e => e.toLowerCase())
  return ips.includes(ip) || emails.includes(email.toLowerCase())
}

function checkRateLimit(ip: string): boolean {
  const store = getRlStore()
  const now = Date.now()
  if (store.size > 500) {
    const cutoff = now - RL_WINDOW
    store.forEach((v, k) => { if (v.windowStart < cutoff) store.delete(k) })
  }
  const entry = store.get(ip)
  if (!entry || now - entry.windowStart >= RL_WINDOW) {
    store.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= RL_MAX) return false
  entry.count++
  return true
}
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = new Set([
  'https://www.i-mentor.gr',
  'https://i-mentor.gr',
  ...(process.env.ELIGIBILITY_CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean),
])

function cors(origin?: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.i-mentor.gr'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return new NextResponse(null, { status: 204, headers: cors(origin) })
}

async function verifyRecaptcha(token: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY
  if (!secret) return true
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
    })
    const data = await res.json()
    return data.success === true && (data.score ?? 1) >= 0.5
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const clientIp = getClientIp(request)

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Μη έγκυρη αίτηση' }, { status: 400, headers: cors(origin) })
  }

  const { afm, email, phone, recaptchaToken, widgetToken } = body || {}

  // Rate limit — whitelisted IPs and emails bypass the limit
  const emailStr = String(email || '').trim()
  if (!isWhitelisted(clientIp, emailStr) && !checkRateLimit(clientIp)) {
    return NextResponse.json(
      { error: 'Έχετε πραγματοποιήσει τον μέγιστο αριθμό αναζητήσεων για σήμερα (5). Παρακαλώ επικοινωνήστε μαζί μας ή δοκιμάστε ξανά αύριο.' },
      { status: 429, headers: { ...cors(origin), 'Retry-After': '86400' } }
    )
  }

  // reCAPTCHA
  if (!recaptchaToken || !(await verifyRecaptcha(String(recaptchaToken)))) {
    return NextResponse.json({ error: 'Επαλήθευση reCAPTCHA απέτυχε. Παρακαλώ δοκιμάστε ξανά.' }, { status: 400, headers: cors(origin) })
  }

  // AFM validation
  const cleanAfm = String(afm || '').replace(/\D/g, '').replace(/^0+/, '').padStart(9, '0')
  if (!/^\d{9}$/.test(cleanAfm)) {
    return NextResponse.json({ error: 'Μη έγκυρο ΑΦΜ. Εισάγετε ακριβώς 9 ψηφία.' }, { status: 400, headers: cors(origin) })
  }

  // Email validation (required)
  const cleanEmail = String(email || '').trim()
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return NextResponse.json({ error: 'Παρακαλώ εισάγετε έγκυρο email.' }, { status: 400, headers: cors(origin) })
  }

  // Phone validation (required)
  const cleanPhone = String(phone || '').replace(/\s/g, '')
  if (!cleanPhone || !/^\+?[\d\-]{8,}$/.test(cleanPhone)) {
    return NextResponse.json({ error: 'Παρακαλώ εισάγετε έγκυρο τηλέφωνο.' }, { status: 400, headers: cors(origin) })
  }

  const result = await checkEligibilityForAfm(cleanAfm, cleanEmail, cleanPhone)

  if (result.notFound) {
    const notFoundResult = { notFound: true, themisUrl: result.themisUrl }
    return NextResponse.json(notFoundResult, { headers: cors(origin) })
  }

  if (result.inactive) {
    const inactiveResult = { business: { name: result.businessName }, programs: [], inactive: true }
    if (widgetToken) prisma.widgetSession.updateMany({ where: { token: String(widgetToken) }, data: { checkedAt: new Date(), result: inactiveResult as any } }).catch(() => {})
    return NextResponse.json(inactiveResult, { headers: cors(origin) })
  }

  const finalResult = { business: { name: result.businessName }, programs: result.programs, themisUrl: result.themisUrl }
  if (widgetToken) {
    prisma.widgetSession.updateMany({
      where: { token: String(widgetToken) },
      data: { checkedAt: new Date(), result: finalResult as any },
    }).catch(() => {})
  }
  return NextResponse.json(finalResult, { headers: cors(origin) })
}
