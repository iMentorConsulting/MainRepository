import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import https from 'https'

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function fetchFromGsis(afm: string): Promise<string> {
  const username = process.env.AADE_USER_IMENTOR || process.env.AADE_USER || ''
  const password = process.env.AADE_PASS_IMENTOR || process.env.AADE_PASS || ''
  const callerAfm = process.env.MY_AFM_IMENTOR || process.env.MY_AFM || ''

  const soapBody =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope" ` +
    `xmlns:ns1="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" ` +
    `xmlns:ns2="http://rgwspublic2/RgWsPublic2Service" ` +
    `xmlns:ns3="http://rgwspublic2/RgWsPublic2">` +
    `<env:Header>` +
    `<ns1:Security>` +
    `<ns1:UsernameToken>` +
    `<ns1:Username>${xmlEscape(username)}</ns1:Username>` +
    `<ns1:Password>${xmlEscape(password)}</ns1:Password>` +
    `</ns1:UsernameToken>` +
    `</ns1:Security>` +
    `</env:Header>` +
    `<env:Body>` +
    `<ns2:rgWsPublic2AfmMethod>` +
    `<ns2:INPUT_REC>` +
    `<ns3:afm_called_by>${xmlEscape(callerAfm)}</ns3:afm_called_by>` +
    `<ns3:afm_called_for>${xmlEscape(afm)}</ns3:afm_called_for>` +
    `</ns2:INPUT_REC>` +
    `</ns2:rgWsPublic2AfmMethod>` +
    `</env:Body>` +
    `</env:Envelope>`

  const bodyBuffer = Buffer.from(soapBody, 'utf-8')

  console.log(`[AFM] Calling GSIS for AFM: ${afm}, user: ${username}, callerAfm: ${callerAfm}`)

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'www1.gsis.gr',
        path: '/wsaade/RgWsPublic2/RgWsPublic2',
        method: 'POST',
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(bodyBuffer),
        },
      },
      (res) => {
        let data = ''
        res.setEncoding('utf-8')
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          console.log(`[AFM] GSIS response status: ${res.statusCode}`)
          console.log(`[AFM] GSIS response (first 1000 chars): ${data.substring(0, 1000)}`)
          resolve(data)
        })
      }
    )

    req.setTimeout(15000, () => {
      req.destroy(new Error('GSIS request timed out'))
    })

    req.on('error', (err) => {
      console.error('[AFM] GSIS request error:', err.message)
      reject(err)
    })

    req.write(bodyBuffer)
    req.end()
  })
}

function parseGsisResponse(text: string, afm: string) {
  const extractTag = (xml: string, tag: string): string => {
    const m = xml.match(new RegExp(`<[^:>]*:?${tag}>([^<]*)<`, 'i'))
    return m ? m[1].trim() : ''
  }

  const errorCode = extractTag(text, 'error_code')
  if (errorCode && errorCode !== 'RET_CODE_OK') {
    console.log(`[AFM] GSIS returned error_code: ${errorCode}, error_descr: ${extractTag(text, 'error_descr')}`)
    return null
  }

  const onomasia = extractTag(text, 'onomasia')
  if (!onomasia) {
    console.log('[AFM] Could not find onomasia in response. Full XML:')
    console.log(text.substring(0, 3000))
    return null
  }

  const activities: any[] = []
  const actBlocks = text.match(/<[^:>]*:?firm_act_tab[^>]*>[\s\S]*?<\/[^:>]*:?firm_act_tab>/gi) || []

  for (const block of actBlocks) {
    const code = extractTag(block, 'firm_act_code')
    if (code) {
      activities.push({
        firmActCode: code,
        firmActDescr: extractTag(block, 'firm_act_descr'),
        firmActKind: parseInt(extractTag(block, 'firm_act_kind') || '1'),
        firmActKindDescr: extractTag(block, 'firm_act_kind_descr') || 'ΚΥΡΙΑ',
      })
    }
  }

  return {
    afm,
    onomasia,
    commercialTitle: extractTag(text, 'commer_title') || extractTag(text, 'commercial_title') || onomasia,
    legalStatusDescr: extractTag(text, 'legal_status_descr'),
    firmFlagDescr: extractTag(text, 'firm_flag_descr'),
    iNiFlagDescr: extractTag(text, 'i_ni_flag_descr'),
    deactivationFlag: extractTag(text, 'deactivation_flag'),
    deactivationFlagDescr: extractTag(text, 'deactivation_flag_descr'),
    regdate: extractTag(text, 'regdate'),
    stopDate: extractTag(text, 'stop_date') || null,
    postalAddress: extractTag(text, 'postal_address'),
    postalAddressNo: extractTag(text, 'postal_address_no'),
    postalZipCode: extractTag(text, 'postal_zip_code'),
    postalAreaDescription: extractTag(text, 'postal_area_description'),
    doy: extractTag(text, 'doy'),
    doyDescr: extractTag(text, 'doy_descr'),
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
    const text = await fetchFromGsis(afm)
    const realData = parseGsisResponse(text, afm)
    if (realData) return NextResponse.json(realData)
  } catch (e: any) {
    console.error('[AFM] Error:', e?.message)
  }

  return NextResponse.json(
    { error: 'Δεν ήταν δυνατή η ανάκτηση στοιχείων από ΓΓΠΣ.' },
    { status: 503 }
  )
}
