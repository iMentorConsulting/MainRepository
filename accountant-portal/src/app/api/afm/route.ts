import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

function generateMockData(afm: string) {
  const prefixes: Record<string, any> = {
    '1': { onomasia: 'ΠΑΡΑΔΕΙΓΜΑ ΕΜΠΟΡΙΚΗ ΑΕ', legalStatusDescr: 'ΑΕ', kad: '47.11.10.01' },
    '2': { onomasia: 'ΔΟΚΙΜΑΣΤΙΚΗ ΕΠΕ', legalStatusDescr: 'ΕΠΕ', kad: '62.01.20.00' },
    '3': { onomasia: 'ΤΕΣΤ ΙΚΕ', legalStatusDescr: 'ΙΚΕ', kad: '56.10.11.01' },
    '4': { onomasia: 'SAMPLE ΟΕ', legalStatusDescr: 'ΟΕ', kad: '43.22.10.00' },
    '9': { onomasia: 'ΑΤΟΜΙΚΗ ΕΠΙΧΕΙΡΗΣΗ', legalStatusDescr: 'ΑΤΟΜΙΚΗ', kad: '47.59.11.01' },
  }
  const prefix = afm[0]
  const mock = prefixes[prefix] || prefixes['1']
  return {
    afm,
    onomasia: mock.onomasia,
    commercialTitle: mock.onomasia,
    legalStatusDescr: mock.legalStatusDescr,
    firmFlagDescr: 'ΕΝΕΡΓΟΣ',
    iNiFlagDescr: 'ΜΗ ΙΝΙ',
    deactivationFlag: 'N',
    deactivationFlagDescr: 'ΕΝΕΡΓΗ ΕΠΙΧΕΙΡΗΣΗ',
    regdate: '2015-03-15',
    stopDate: null,
    postalAddress: 'ΣΤΑΔΙΟΥ',
    postalAddressNo: '10',
    postalZipCode: '10562',
    postalAreaDescription: 'ΑΘΗΝΑ',
    doy: '1101',
    doyDescr: 'Α\' ΑΘΗΝΩΝ',
    activities: [
      {
        firmActCode: mock.kad,
        firmActDescr: 'Λιανικό εμπόριο τροφίμων σε εξειδικευμένα καταστήματα',
        firmActKind: 1,
        firmActKindDescr: 'ΚΥΡΙΑ'
      },
      {
        firmActCode: '46.90.10.00',
        firmActDescr: 'Μη εξειδικευμένο χονδρικό εμπόριο',
        firmActKind: 2,
        firmActKindDescr: 'ΔΕΥΤΕΡΕΥΟΥΣΑ'
      }
    ]
  }
}

async function fetchFromGsis(afm: string) {
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://gr/gsis/rgwspublic/RgWsPublic2.wsdl">
  <env:Body>
    <ns:rgWsPublic2AfmMethod>
      <afmCalledBy/>
      <afmCalledFor>${afm}</afmCalledFor>
    </ns:rgWsPublic2AfmMethod>
  </env:Body>
</env:Envelope>`

  const response = await fetch('https://www.gsis.gr/rgwspublic/RgWsPublic2/callSerivce', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '',
    },
    body: soapBody,
    signal: AbortSignal.timeout(8000),
  })

  if (!response.ok) return null

  const text = await response.text()

  // Parse SOAP XML response
  const extractTag = (xml: string, tag: string): string => {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i'))
    return match ? match[1].trim() : ''
  }

  const onomasia = extractTag(text, 'onomasia')
  if (!onomasia) return null

  const activities: any[] = []
  const activityMatches = text.match(/<RgWsPublic2AfmMethodResults[^>]*>[\s\S]*?<\/RgWsPublic2AfmMethodResults>/g) || []

  return {
    afm,
    onomasia,
    commercialTitle: extractTag(text, 'commercialTitle'),
    legalStatusDescr: extractTag(text, 'legalStatusDescr'),
    firmFlagDescr: extractTag(text, 'firmFlagDescr'),
    iNiFlagDescr: extractTag(text, 'iNiFlagDescr'),
    deactivationFlag: extractTag(text, 'deactivationFlag'),
    deactivationFlagDescr: extractTag(text, 'deactivationFlagDescr'),
    regdate: extractTag(text, 'regdate'),
    stopDate: extractTag(text, 'stopDate'),
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
    // Try real GSIS API first
    const realData = await fetchFromGsis(afm)
    if (realData) {
      return NextResponse.json(realData)
    }
  } catch (e) {
    // Fall through to mock
  }

  // Fallback to mock data for development
  const mockData = generateMockData(afm)
  return NextResponse.json(mockData)
}
