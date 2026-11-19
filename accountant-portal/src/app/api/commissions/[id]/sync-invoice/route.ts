import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { syncCommissionToInvoicing } from '@/lib/invoicing'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await syncCommissionToInvoicing(params.id)
  if (!result) {
    return NextResponse.json(
      { error: 'Sync failed or commission already synced' },
      { status: 400 }
    )
  }

  return NextResponse.json(result)
}
