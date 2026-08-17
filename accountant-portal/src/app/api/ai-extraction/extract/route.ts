import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractProgramFields, SourceTextTooLargeError, MAX_SOURCE_TEXT_CHARS } from '@/lib/ai-extraction'
import { checkAndConsumeRateLimit } from '@/lib/ai-extraction-rate-limit'

export const dynamic = 'force-dynamic'

async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const path = await import('path')
  const { pathToFileURL } = await import('url')
  PDFParse.setWorker(pathToFileURL(path.join(process.cwd(), 'node_modules/pdf-parse/dist/worker/pdf.worker.mjs')).href)
  if (buffer.length === 0) throw new Error('Το αρχείο PDF είναι κενό (0 bytes).')
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  return result.text
}

async function extractPdfText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length === 0) throw new Error('Το αρχείο PDF που ανεβάσατε είναι κενό (0 bytes). Δοκιμάστε να το κατεβάσετε εκ νέου και ανεβάστε το ξανά.')
  return extractTextFromPdfBuffer(buffer)
}

// The announcement's official PDF attachment(s) carry the real eligibility
// rules (ΚΑΔ, regions, dates, budgets) — the title+description text alone is
// far too thin for accurate extraction. Best-effort: a slow/failed download
// of one attachment shouldn't block the others or the whole extraction.
async function fetchAttachmentTexts(urls: string[]): Promise<string[]> {
  const texts: string[] = []
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const buffer = Buffer.from(await res.arrayBuffer())
      const text = await extractTextFromPdfBuffer(buffer)
      if (text.trim()) texts.push(text)
    } catch (err) {
      console.error(`AI extraction: failed to fetch/parse attachment ${url}`, err)
    }
  }
  return texts
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!checkAndConsumeRateLimit(session.user.id)) {
    return NextResponse.json({ error: 'Έχετε φτάσει το ημερήσιο όριο εξαγωγών AI. Δοκιμάστε ξανά αύριο.' }, { status: 429 })
  }

  const contentType = request.headers.get('content-type') || ''
  let sourceText = ''
  let sourceUrl: string | null = null

  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'Χωρίς αρχείο' }, { status: 400 })
      sourceText = await extractPdfText(file)
    } else {
      const body = await request.json()
      if (body.announcementId) {
        const espa = await prisma.espaAnnouncement.findUnique({ where: { id: body.announcementId } })
        const dypa = espa ? null : await prisma.dypaAnnouncement.findUnique({ where: { id: body.announcementId } })
        const announcement = espa || dypa
        if (!announcement) return NextResponse.json({ error: 'Δεν βρέθηκε ανακοίνωση' }, { status: 404 })
        sourceUrl = announcement.detailUrl

        const attachmentUrls = (announcement as { attachmentUrls?: string[] }).attachmentUrls || []
        const attachmentTexts = attachmentUrls.length > 0 ? await fetchAttachmentTexts(attachmentUrls) : []

        sourceText = [announcement.title, announcement.description, ...attachmentTexts].filter(Boolean).join('\n\n')
      } else if (typeof body.text === 'string') {
        sourceText = body.text
      } else {
        return NextResponse.json({ error: 'Απαιτείται αρχείο, announcementId ή text' }, { status: 400 })
      }
    }
  } catch (err) {
    console.error('AI extraction: failed to read source', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Σφάλμα ανάγνωσης αρχείου' }, { status: 400 })
  }

  if (!sourceText.trim()) return NextResponse.json({ error: 'Δεν βρέθηκε κείμενο προς ανάλυση' }, { status: 400 })

  try {
    const result = await extractProgramFields(sourceText)
    return NextResponse.json({ sourceText: sourceText.slice(0, MAX_SOURCE_TEXT_CHARS), sourceUrl, result })
  } catch (err) {
    if (err instanceof SourceTextTooLargeError) {
      return NextResponse.json({ error: err.message }, { status: 413 })
    }
    console.error('AI extraction failed', err)
    return NextResponse.json({ error: 'Σφάλμα κατά την εξαγωγή με AI' }, { status: 500 })
  }
}
