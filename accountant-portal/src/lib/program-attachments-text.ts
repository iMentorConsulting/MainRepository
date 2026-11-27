import { prisma } from '@/lib/prisma'

// Plain text of a program's attached PDFs (announcement/invitation, KYA…), shared
// by the admin "Ρωτήστε για το Πρόγραμμα" tool and the Ερμής chat. Accepts either
// a legacy inline data: URL or our own "/api/programs/{id}/attachments/{fileId}"
// route (bytes read straight from ProgramAttachmentFile). External http(s) links
// are skipped. Extracted text is cached per file (a 58-page PDF takes seconds to
// parse and the chat asks for it on every turn).
const cache = new Map<string, string | null>()

async function extractAttachmentText(url: string, name: string): Promise<string | null> {
  let buffer: Buffer
  let key: string
  if (url.startsWith('data:')) {
    const commaIdx = url.indexOf(',')
    if (commaIdx === -1) return null
    buffer = Buffer.from(url.slice(commaIdx + 1), 'base64')
    key = `data:${buffer.length}:${url.slice(commaIdx + 1, commaIdx + 41)}`
  } else {
    const match = url.match(/\/api\/programs\/[^/]+\/attachments\/([^/?]+)/)
    if (!match) return null
    key = `file:${match[1]}`
    if (cache.has(key)) return cache.get(key) ?? null
    const file = await prisma.programAttachmentFile.findUnique({ where: { id: match[1] } })
    if (!file) return null
    buffer = Buffer.from(file.data)
  }
  if (cache.has(key)) return cache.get(key) ?? null
  try {
    const { PDFParse } = await import('pdf-parse')
    const path = await import('path')
    const { pathToFileURL } = await import('url')
    PDFParse.setWorker(pathToFileURL(path.join(process.cwd(), 'node_modules/pdf-parse/dist/worker/pdf.worker.mjs')).href)
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    const text = result.text?.trim() || null
    cache.set(key, text)
    return text
  } catch (e: any) {
    console.error(`[ProgramAttachments] Failed to extract text from "${name}":`, e?.message)
    return null
  }
}

export async function buildAttachmentsText(
  program: { attachmentUrls?: string[] | null; attachmentNames?: string[] | null },
  maxChars: number,
): Promise<string> {
  const urls = program.attachmentUrls ?? []
  if (urls.length === 0) return ''
  let remaining = maxChars
  const sections: string[] = []
  for (let i = 0; i < urls.length; i++) {
    if (remaining <= 0) break
    const name = program.attachmentNames?.[i] || `Σχετικό αρχείο ${i + 1}`
    const text = await extractAttachmentText(urls[i], name)
    if (!text) continue
    const slice = text.slice(0, remaining)
    remaining -= slice.length
    sections.push(`\n=== Έγγραφο: ${name} ===\n${slice}${slice.length < text.length ? '\n[...περικοπή λόγω μήκους...]' : ''}`)
  }
  return sections.join('\n')
}
