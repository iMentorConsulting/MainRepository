import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

async function fetchFromGsis(afm: string) {
  const username = process.env.AADE_USER_IMENTOR || process.env.AADE_USER
  const password = process.env.AADE_PASS_IMENTOR || process.env.AADE_PASS
  const callerAfm = process.env.MY_AFM_IMENTOR || process.env.MY_AFM || ''

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://gr/gsis/rgwspublic/RgWsPublic2.wsdl">
  <env:Body>
    <ns:rgWsPublic2AfmMethod>
      <afmCalledBy>${callerAfm}</afmCalledBy>
      <afmCalledFor>${afm}</afmCalledFor>
    </ns:rgWsPublic2AfmMethod>
  </env:Body>
</env:Envelope>`

  const headers: Record<string, string> = {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': '',
  }

  if (username && password) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
  }

  const response = await fetch('https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2?WSDL', {
    method: 'POST',
    headers,
    body: soapBody,
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    // Try alternative endpoint
    const response2 = await fetch('https://www.gsis.gr/rgwspublic/RgWsPublic2/callSerivce', {
      method: 'POST',
      headers,
      body: soapBody,
      signal: AbortSignal.timeout(10000),
    })
    if (!response2.ok) return null
    return parseGsisResponse(await response2.text(), afm)
  }

  return parseGsisResponse(await response.text(), afm)
}

function parseGsisResponse(text: string, afm: string) {
  const extractTag = (xml: string, tag: string): string => {
    const match = xml.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([^<]*)<\/(?:[^:>]+:)?${tag}>`, 'i'))
    return match ? match[1].trim() : ''
  }

  const onomasia = extractTag(text, 'onomasia')
  if (!onomasia) return null

  // Parse activities
  const activities: any[] = []
  const actBlocks = text.match(/<(?:[^:>]+:)?RgWsPublic2AfmMethodResults[\s\S]*?<\/(?:[^:>]+:)?RgWsPublic2AfmMethodResults>/g) || []
  for (const block of actBlocks) {
    const code = extractTag(block, 'firmActCode')
    if (code) {
      activities.push({
        firmActCode: code,
        firmActDescr: extractTag(block, 'firmActDescr'),
        firmActKind: parseInt(extractTag(block, 'firmActKind') || '1'),
        firmActKindDescr: extractTag(block, 'firmActKindDescr') || 'ΚΥΡΙΑ',
      })
    }
  }

  return {
    afm,
    onomasia,
    commercialTitle: extractTag(text, 'commercialTitle') || onomasia,
    legalStatusDescr: extractTag(text, 'legalStatusDescr'),
    firmFlagDescr: extractTag(text, 'firmFlagDescr'),
    iNiFlagDescr: extractTag(text, 'iNiFlagDescr'),
    deactivationFlag: extractTag(text, 'deactivationFlag'),
    deactivationFlagDescr: extractTag(text, 'deactivationFlagDescr'),
    regdate: extractTag(text, 'registDate') || extractTag(text, 'regdate'),
    stopDate: extractTag(text, 'stopDate') || null,
    postalAddress: extractTag(text, 'postalAddress'),
    postalAddressNo: extractTag(text, 'postalAddressNo'),
    postalZipCode: extractTag(text, 'postalZipCode'),
    postalAreaDescription: extractTag(text, 'postalAreaDescription'),
    doy: extractTag(text, 'doy'),
    doyDescr: extractTag(text, 'doyDescr'),
    activities,
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const afm = request.nextUrl.searchParams.get('afm')
  if (!afm || !/^\d{9}$/.test(afm)) {
    return NextResponse.json({ error: 'Μη έγκυρο ΑΦΜ' }, { status: 400 })
  }

  try {
    const realData = await fetchFromGsis(afm)
    if (realData) {
      return NextResponse.json({ ...realData, _source: 'gsis' })
    }
  } catch (e) {
    console.error('GSIS API error:', e)
  }

  // Return error instead of mock - let user know API failed
  return NextResponse.json(
    { error: 'Δεν ήταν δυνατή η ανάκτηση στοιχείων από ΓΓΠΣ. Ελέγξτε τα credentials AADE.' },
    { status: 503 }
  )
}
