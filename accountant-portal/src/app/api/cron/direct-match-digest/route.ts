import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

// Source labels shown in the digest email
const SOURCE_LABEL: Record<string, string> = {
  'website-form': 'Φόρμα ιστοσελίδας',
  'gemi-claim':   'Αξίωση ΓΕΜΗ',
  'gemi':         'ΓΕΜΗ (αυτόματο)',
  'ermis-lead':   'Ερμής',
  'accountant':   'Χειροκίνητη εισαγωγή',
  'bulk-import':  'Μαζική εισαγωγή',
}

function sourceLabel(source: string | null): string {
  if (!source) return 'Άγνωστη πηγή'
  return SOURCE_LABEL[source] ?? source
}

// GET — called by Railway/external cron scheduler (secret in query param)
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runDigest()
}

// POST — called by Railway cron (Bearer token) or manually by an admin
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return runDigest()
  const session = await auth()
  if (session?.user?.role === 'ADMIN') return runDigest()
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

async function runDigest() {
  const adminEmail = process.env.ADMIN_EMAIL || 'info@i-mentor.gr'
  const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'

  // Find all unnotified matches for direct I-MENTOR clients (no accountant assigned)
  const matches = await prisma.programMatch.findMany({
    where: {
      notified: false,
      status: { not: 'REJECTED' },
      matchScore: { gte: 40 },
      business: { accountantId: null },
    },
    include: {
      business: {
        select: { id: true, afm: true, onomasia: true, source: true },
      },
      program: {
        select: { id: true, title: true },
      },
    },
    orderBy: [{ program: { title: 'asc' } }, { matchScore: 'desc' }],
  })

  if (matches.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: 'No pending direct-client matches' })
  }

  // Group by program
  const byProgram = new Map<string, { title: string; entries: typeof matches }>()
  for (const m of matches) {
    if (!byProgram.has(m.programId)) {
      byProgram.set(m.programId, { title: m.program.title, entries: [] })
    }
    byProgram.get(m.programId)!.entries.push(m)
  }

  // Build email HTML — one section per program
  const totalBusinesses = matches.length
  const totalPrograms = byProgram.size

  const programSections = Array.from(byProgram.values()).map(({ title, entries }) => {
    const rows = entries.map(m => {
      const name = m.business.onomasia || m.business.afm || '—'
      const afm = m.business.afm || '—'
      const src = sourceLabel(m.business.source)
      const link = `${appUrl}/businesses/${m.business.id}`
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
            <a href="${link}" style="font-weight:600;color:#1e3a8a;text-decoration:none;">${name}</a>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#4b5563;font-size:13px;">${afm}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
            <span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#eff6ff;color:#1d4ed8;font-size:12px;">${src}</span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
            <a href="${link}" style="color:#1e3a8a;font-size:12px;">Προβολή →</a>
          </td>
        </tr>`
    }).join('')

    return `
      <div style="margin-bottom:32px;">
        <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#111827;border-left:4px solid #1e3a8a;padding-left:10px;">
          ${title}
          <span style="margin-left:8px;font-size:12px;font-weight:500;color:#6b7280;">(${entries.length} ${entries.length === 1 ? 'επιχείρηση' : 'επιχειρήσεις'})</span>
        </h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Επιχείρηση</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">ΑΦΜ</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Πηγή</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
  }).join('')

  const today = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#111827;">
      <div style="background:#1e3a8a;padding:20px 24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:18px;">🎯 Ημερήσιο Digest Matches — ${today}</h1>
        <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">
          ${totalBusinesses} ${totalBusinesses === 1 ? 'νέο match' : 'νέα matches'} σε ${totalPrograms} ${totalPrograms === 1 ? 'πρόγραμμα' : 'προγράμματα'} για απευθείας πελάτες I-MENTOR
        </p>
      </div>

      <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        ${programSections}

        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
          I-MENTOR Portal &middot; <a href="${appUrl}/matches" style="color:#9ca3af;">Δείτε όλα τα matches →</a>
        </p>
      </div>
    </div>`

  try {
    await sendEmail({
      to: adminEmail,
      subject: `🎯 ${totalBusinesses} νέα matches απευθείας πελατών — ${today}`,
      html,
    })
  } catch (err: any) {
    console.error('[DirectMatchDigest] email failed:', err?.message)
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 })
  }

  // Mark all processed matches as notified
  await prisma.programMatch.updateMany({
    where: {
      id: { in: matches.map(m => m.id) },
    },
    data: { notified: true },
  })

  console.log(`[DirectMatchDigest] Sent digest: ${totalBusinesses} matches across ${totalPrograms} programs`)
  return NextResponse.json({ ok: true, sent: true, totalBusinesses, totalPrograms })
}
