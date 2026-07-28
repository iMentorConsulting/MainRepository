import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const apiKey = process.env.MOOSEND_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No MOOSEND_API_KEY' }, { status: 500 })

  const url = `https://api.moosend.com/v3/campaigns/find_all.json?pageSize=50&sortBy=CreatedOn&sortMethod=DESC&apikey=${apiKey}`
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } })
  const raw = await res.json()

  return NextResponse.json({ status: res.status, raw })
}
