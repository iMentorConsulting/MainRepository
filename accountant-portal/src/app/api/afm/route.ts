import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

async function fetchFromGsis(afm: string) {
  const username = process.env.AADE_USER_IMENTOR || process.env.AADE_USER
  const password = process.env.AADE_PASS_IMENTOR || process.env.AADE_PASS
  const callerAfm = process.env.MY_AFM_IMENTOR || process.env.MY_AFM || ''

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:rgws="http://gr/gsis/rgwspublic/RgWsPublic2.wsdl"
  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${username}</wsse:Username>
        <wsse:Password>${password}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <rgws:rgWsPublic2AfmMethod>
      <afmCalledBy>${callerAfm}</afmCalledBy>
      <afmCalledFor>${afm}</afmCalledFor>
    </rgws:rgWsPublic2AfmMethod>
  </soapenv:Body>
</soapenv:Envelope>`

  const headers: Record<string, string> = {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': '',
  }

  // Correct GSIS endpoint
  const endpoint = 'https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2'

  console.log(`[AFM] Calling GSIS for AFM: ${afm}, user: ${username}, callerAfm: ${callerAfm}`)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: soapBody,
    signal: AbortSignal.timeout(12000),
  })

  const text = await response.text()
  console.log(`[AFM] GSIS response status: ${response.status}`)
  console.log(`[AFM] GSIS response (first 1000 chars): ${text.substring(0, 1000)}`)

  if (!response.ok) {
    console.log(`[AFM] GSIS non-OK status, full body: ${text}`)
    return null
  }

  // Check for SOAP fault
  if (text.includes('faultcode') || text.includes('Fault')) {
    console.log(`[AFM] SOAP Fault detected: ${text.substring(0, 2000)}`)
  }

  return parseGsisResponse(text, afm)
}

function parseGsisResponse(text: string, afm: string) {
  const extractTag = (xml: string, tag: string): string => {
    const patterns = [
      new RegExp(`<${tag}>([^<]*)<\/${tag}>`, 'i'),
      new RegExp(`<[^:>]+:${tag}>([^<]*)<\/[^:>]+:${tag}>`, 'i'),
      new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i'),
    ]
    for (const p of patterns) {
      const m = xml.match(p)
      if (m) return m[1].trim()
    }
    return ''
  }

  const onomasia = extractTag(text, 'onomasia')
  if (!onomasia) {
    console.log('[AFM] Could not find onomasia in response. Full XML:')
    console.log(text.substring(0, 3000))
    return null
  }

  // Parse activities
  const activities: any[] = []
  const actBlocks = text.match(/<firm_act_tab[^>]*>[\s\S]*?<\/firm_act_tab>/gi) ||
                    text.match(/<RgWsPublic2AfmMethodResults[^>]*>[\s\S]*?<\/RgWsPublic2AfmMethodResults>/gi) || []

  for (const block of actBlocks) {
    const code = extractTag(block, 'firm_act_code') || extractTag(block, 'firmActCode')
    if (code) {
      activities.push({
        firmActCode: code,
        firmActDescr: extractTag(block, 'firm_act_descr') || extractTag(block, 'firmActDescr'),
        firmActKind: parseInt(extractTag(block, 'firm_act_kind') || extractTag(block, 'firmActKind') || '1'),
        firmActKindDescr: extractTag(block, 'firm_act_kind_descr') || extractTag(block, 'firmActKindDescr') || 'ΚΥΡΙΑ',
      })
    }
  }

  return {
    afm,
    onomasia,
    commercialTitle: extractTag(text, 'commercial_title') || extractTag(text, 'commercialTitle') || onomasia,
    legalStatusDescr: extractTag(text, 'legal_status_descr') || extractTag(text, 'legalStatusDescr'),
    firmFlagDescr: extractTag(text, 'firm_flag_descr') || extractTag(text, 'firmFlagDescr'),
    iNiFlagDescr: extractTag(text, 'i_ni_flag_descr') || extractTag(text, 'iNiFlagDescr'),
    deactivationFlag: extractTag(text, 'deactivation_flag') || extractTag(text, 'deactivationFlag'),
    deactivationFlagDescr: extractTag(text, 'deactivation_flag_descr') || extractTag(text, 'deactivationFlagDescr'),
    regdate: extractTag(text, 'regdate') || extractTag(text, 'registDate'),
    stopDate: extractTag(text, 'stop_date') || extractTag(text, 'stopDate') || null,
    postalAddress: extractTag(text, 'postal_address') || extractTag(text, 'postalAddress'),
    postalAddressNo: extractTag(text, 'postal_address_no') || extractTag(text, 'postalAddressNo'),
    postalZipCode: extractTag(text, 'postal_zip_code') || extractTag(text, 'postalZipCode'),
    postalAreaDescription: extractTag(text, 'postal_area_description') || extractTag(text, 'postalAreaDescription'),
    doy: extractTag(text, 'doy'),
    doyDescr: extractTag(text, 'doy_descr') || extractTag(text, 'doyDescr'),
    activities,
    _source: 'gsis',
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
    if (realData) return NextResponse.json(realData)
  } catch (e: any) {
    console.error('[AFM] Error:', e?.message)
  }

  return NextResponse.json(
    { error: 'Δεν ήταν δυνατή η ανάκτηση στοιχείων από ΓΓΠΣ.' },
    { status: 503 }
  )
}
