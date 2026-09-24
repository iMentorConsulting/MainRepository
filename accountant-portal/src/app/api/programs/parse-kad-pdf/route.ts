import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// Matches dotted numeric codes like "10.11.2", "10.11.20.01" (2-5 segments, 1-2 digits each)
const KAD_REGEX = /\b\d{1,2}(?:\.\d{1,2}){1,4}\b/g

function normalizeKad(code: string): string {
  const digits = code.replace(/\./g, '')
  return digits.length >= 8 ? digits.slice(0, 8) : digits.padEnd(8, '0')
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'Χωρίς αρχείο' }, { status: 400 })

  try {
    const { PDFParse } = await import('pdf-parse')
    const path = await import('path')
    const { pathToFileURL } = await import('url')
    PDFParse.setWorker(pathToFileURL(path.join(process.cwd(), 'node_modules/pdf-parse/dist/worker/pdf.worker.mjs')).href)
    const buffer = Buffer.from(await file.arrayBuffer())
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()

    const matches = result.text.match(KAD_REGEX) || []
    const seen = new Set<string>()
    const kadRules: string[] = []
    for (const m of matches) {
      const normalized = normalizeKad(m)
      if (!seen.has(normalized)) {
        seen.add(normalized)
        kadRules.push(normalized)
      }
    }

    return NextResponse.json({ kadRules, found: matches.length, unique: kadRules.length })
  } catch (e: any) {
    console.error('[KAD PDF Parse] Error:', e?.message)
    return NextResponse.json({ error: 'Σφάλμα ανάγνωσης PDF' }, { status: 500 })
  }
}
