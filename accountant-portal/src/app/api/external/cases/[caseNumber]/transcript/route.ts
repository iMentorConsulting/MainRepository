import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function checkApiKey(request: NextRequest): boolean {
  const key = process.env.CASES_API_KEY
  return !!key && request.headers.get('x-api-key') === key
}

export async function GET(
  request: NextRequest,
  { params }: { params: { caseNumber: string } }
) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const caseNumber = parseInt(params.caseNumber, 10)
  if (isNaN(caseNumber)) return NextResponse.json({ error: 'Invalid case number' }, { status: 400 })

  const clientCase = await prisma.clientCase.findUnique({
    where: { caseNumber },
    select: { businessId: true, programId: true },
  })
  if (!clientCase) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  if (!clientCase.programId) return NextResponse.json({ transcript: null, messages: [] })

  const token = await prisma.businessMatchToken.findUnique({
    where: { businessId_programId: { businessId: clientCase.businessId, programId: clientCase.programId } },
    select: { chatLog: true },
  })

  if (!token?.chatLog || !Array.isArray(token.chatLog) || token.chatLog.length === 0) {
    return NextResponse.json({ transcript: null, messages: [] })
  }

  const messages = (token.chatLog as any[]).map((m: any) => ({ role: m.role, text: m.text }))
  const transcript = messages
    .map((m: { role: string; text: string }) => `${m.role === 'user' ? 'ΠΕΛΑΤΗΣ' : 'ΕΡΜΗΣ'}: ${m.text}`)
    .join('\n\n')

  return NextResponse.json({ transcript, messages })
}
