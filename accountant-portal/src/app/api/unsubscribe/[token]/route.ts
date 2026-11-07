import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const business = await prisma.business.findFirst({
    where: { unsubscribeToken: params.token }
  })

  if (!business) {
    return new NextResponse(`
      <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
        <h2>Μη έγκυρος σύνδεσμος</h2>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  // Mark as unsubscribed via tags
  const tags = [...(business.tags || []).filter(t => t !== 'unsubscribed'), 'unsubscribed']
  await prisma.business.update({
    where: { id: business.id },
    data: { tags }
  })

  return new NextResponse(`
    <html><body style="font-family:sans-serif;text-align:center;padding:50px;max-width:500px;margin:auto;">
      <h2 style="color:#1e40af;">Αποεγγραφή Επιτυχής</h2>
      <p>Η επιχείρηση <strong>${business.onomasia || business.afm}</strong> έχει αποεγγραφεί από τις επικοινωνίες μας.</p>
      <p style="color:#6b7280;font-size:14px;">Δεν θα λαμβάνετε πλέον ενημερώσεις από το I-MENTOR Portal.</p>
    </body></html>
  `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
