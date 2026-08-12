import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import https from 'https'

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function getGsisCredentials() {
  const setting = await prisma.appSetting.findUnique({ where: { id: 'main' } })
  return {
    username: (setting?.aadeUser ? decrypt(setting.aadeUser) : '') || process.env.AADE_USER_IMENTOR || process.env.AADE_USER || '',
    password: (setting?.aadePass ? decrypt(setting.aadePass) : '') || process.env.AADE_PASS_IMENTOR || process.env.AADE_PASS || '',
    callerAfm: (setting?.aadeCallerAfm ? decrypt(setting.aadeCallerAfm) : '') || process.env.MY_AFM_IMENTOR || process.env.MY_AFM || '',
  }
}

async function fetchFromGsis(afm: string): Promise<string> {
  const { username, password, callerAfm } = await getGsisCredentials()

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

  console.log(`[GSIS] Calling GSIS for AFM: ${afm}`)

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
          console.log(`[GSIS] GSIS response status: ${res.statusCode}`)
          resolve(data)
        })
      }
    )

    req.setTimeout(15000, () => {
      req.destroy(new Error('GSIS request timed out'))
    })

    req.on('error', (err) => {
      console.error('[GSIS] GSIS request error:', err.message)
      reject(err)
    })

    req.write(bodyBuffer)
    req.end()
  })
}

export interface GsisActivity {
  firmActCode: string
  firmActDescr: string
  firmActKind: number
  firmActKindDescr: string
}

export interface GsisBusinessData {
  afm: string
  onomasia: string
  commercialTitle: string
  legalStatusDescr: string
  firmFlagDescr: string
  iNiFlagDescr: string
  deactivationFlag: string
  deactivationFlagDescr: string
  regdate: string
  stopDate: string | null
  postalAddress: string
  postalAddressNo: string
  postalZipCode: string
  postalAreaDescription: string
  doy: string
  doyDescr: string
  activities: GsisActivity[]
  _source: 'gsis'
}

// Known GSIS error codes that mean the AFM will never yield data — no point retrying.
export const GSIS_TERMINAL_ERRORS = new Set([
  'RG_WS_PUBLIC_AFM_SUBJECT_IS_NOT_ACTIVE',
  'RG_WS_PUBLIC_AFM_SUBJECT_IS_BLANK_COMPANY',
  'RG_WS_PUBLIC_AFM_NOT_FOUND',
  'RG_WS_PUBLIC_ELENXOS_EKSO_AXIONOS',
])

// Quota errors that should stop the current batch without marking the record as permanently failed.
const GSIS_QUOTA_ERRORS = new Set([
  'RG_WS_PUBLIC_MONTHLY_LIMIT_EXCEEDED',
  'RG_WS_PUBLIC_DAILY_LIMIT_EXCEEDED',
  'RG_WS_PUBLIC_LIMIT_EXCEEDED',
])

function parseGsisResponse(text: string, afm: string): GsisBusinessData | null {
  const extractTag = (xml: string, tag: string): string => {
    const m = xml.match(new RegExp(`<[^:>]*:?${tag}>([^<]*)<`, 'i'))
    return m ? m[1].trim() : ''
  }

  // SOAP fault detection — entire response is a fault, not a business record
  if (/<(?:[^:>]*:)?[Ff]ault\b/.test(text)) {
    const faultString = extractTag(text, 'faultstring') || extractTag(text, 'Reason') || extractTag(text, 'Text')
    console.log(`[GSIS] SOAP Fault for AFM ${afm}: ${faultString || text.slice(0, 200)}`)
    throw new Error(`GSIS_SOAP_FAULT: ${faultString || 'unknown fault'}`)
  }

  const errorCode = extractTag(text, 'error_code')
  if (errorCode && errorCode !== 'RET_CODE_OK') {
    const errorDescr = extractTag(text, 'error_descr')
    console.log(`[GSIS] AFM ${afm} — error_code: ${errorCode}, error_descr: ${errorDescr}`)
    if (GSIS_QUOTA_ERRORS.has(errorCode)) {
      throw new Error(errorCode)
    }
    // Terminal error: throw so caller can store the specific code
    throw new Error(errorCode)
  }

  const onomasia = extractTag(text, 'onomasia')
  if (!onomasia) {
    console.log(`[GSIS] AFM ${afm} — no onomasia in response (first 300 chars): ${text.slice(0, 300)}`)
    return null
  }

  const activities: GsisActivity[] = []
  const codeRegex = /<(?:[^:>]*:)?firm_act_code>([^<]*)<\/(?:[^:>]*:)?firm_act_code>/gi
  const codeMatches: RegExpExecArray[] = []
  let cm: RegExpExecArray | null
  while ((cm = codeRegex.exec(text)) !== null) {
    codeMatches.push(cm)
  }
  for (let i = 0; i < codeMatches.length; i++) {
    const m = codeMatches[i]
    const code = m[1].trim()
    if (!code) continue
    const start = m.index ?? 0
    const end = i + 1 < codeMatches.length ? (codeMatches[i + 1].index ?? text.length) : text.length
    const seg = text.slice(start, end)
    activities.push({
      firmActCode: code,
      firmActDescr: extractTag(seg, 'firm_act_descr'),
      firmActKind: parseInt(extractTag(seg, 'firm_act_kind') || '1'),
      firmActKindDescr: extractTag(seg, 'firm_act_kind_descr') || 'ΚΥΡΙΑ',
    })
  }

  const regdate =
    extractTag(text, 'regdate') ||
    extractTag(text, 'regist_date') ||
    extractTag(text, 'registration_date') ||
    extractTag(text, 'reg_date') ||
    extractTag(text, 'date_of_reg') ||
    extractTag(text, 'firm_date_of_reg')

  return {
    afm,
    onomasia,
    commercialTitle: extractTag(text, 'commer_title') || extractTag(text, 'commercial_title') || onomasia,
    legalStatusDescr: extractTag(text, 'legal_status_descr'),
    firmFlagDescr: extractTag(text, 'firm_flag_descr'),
    iNiFlagDescr: extractTag(text, 'i_ni_flag_descr'),
    deactivationFlag: extractTag(text, 'deactivation_flag'),
    deactivationFlagDescr: extractTag(text, 'deactivation_flag_descr'),
    regdate,
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

export async function lookupAfm(afm: string): Promise<GsisBusinessData | null> {
  try {
    const text = await fetchFromGsis(afm)
    return parseGsisResponse(text, afm)
  } catch (e: any) {
    const msg: string = e?.message || String(e)
    // Quota errors must bubble up so the batch stops without marking the record as failed
    if (GSIS_QUOTA_ERRORS.has(msg) || msg === 'RG_WS_PUBLIC_MONTHLY_LIMIT_EXCEEDED') throw e
    // For all other errors (GSIS error codes, SOAP faults, timeouts, network errors),
    // re-throw so the enrich route can store the specific error in aadeError
    throw e
  }
}
