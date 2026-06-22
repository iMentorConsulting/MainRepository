import axios from 'axios'

// Base URL for client-facing portal links (preview pages sent to clients via Viber/email).
// Set VITE_PORTAL_URL in Railway env to the custom domain (e.g. https://portal.i-mentor.gr).
// Falls back to the current origin so local dev still works.
export const PORTAL_BASE = (import.meta.env.VITE_PORTAL_URL || '').replace(/\/$/, '') || window.location.origin

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Inject Bearer token from localStorage on every request
api.interceptors.request.use(config => {
  try {
    const stored = localStorage.getItem('debt-auth')
    if (stored) {
      const { token } = JSON.parse(stored)
      if (token) config.headers.Authorization = `Bearer ${token}`
    }
  } catch {}
  return config
})

// On 401, clear session and reload to login screen
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('debt-auth')
      window.location.reload()
    }
    return Promise.reject(err)
  }
)

export const loginUser = (employee, password) => api.post('/auth/login', { employee, password })

// Cases
export const listCases = (params) => api.get('/cases/', { params })
export const getCase = (id) => api.get(`/cases/${id}`)
export const createCase = (data) => api.post('/cases/', data)
export const updateCase = (id, data) => api.put(`/cases/${id}`, data)
export const deleteCase = (id) => api.delete(`/cases/${id}`)
export const saveActualResults = (id, data) => api.patch(`/cases/${id}/actual`, data)
export const duplicateCase = (id) => api.post(`/cases/${id}/duplicate`)
export const updateContact = (id, data) => api.patch(`/cases/${id}/contact`, data)
export const patchOffer = (id, commercial_offer) => api.patch(`/cases/${id}/offer`, { commercial_offer })
export const notifyPricingApproval = (id, data) => api.post(`/cases/${id}/notify-pricing-approval`, data)
export const approveWinback = (id, approve, overrides = {}) => api.post(`/cases/${id}/approve-winback`, { approve, ...overrides })
export const requestWinback = (id, data) => api.post(`/cases/${id}/request-winback`, data)
export const sendWinback = (id, channel, message, subject) => api.post(`/cases/${id}/send-winback`, { channel, message, subject })
export const sendViber = (id, data) => api.post(`/cases/${id}/send-viber`, data)
export const sendEmail = (id, data) => api.post(`/cases/${id}/send-email`, data)

// External referrals (LOGISTIS Accountant Portal)
export const listPendingExternalCases = () => api.get('/cases/', { params: { status: 'pending_external' } })
export const acceptExternalCase = (id, employee) => api.post(`/cases/${id}/accept-external`, { employee })
export const pushExternalStatus = (id, data) => api.post(`/cases/${id}/external-status`, data)

// Config
export const getPricingConfig = () => api.get('/config/pricing')
export const putPricingConfig = (data) => api.put('/config/pricing', data)
export const getLeadTemplates = () => api.get('/config/lead-templates')
export const putLeadTemplates = (data) => api.put('/config/lead-templates', data)
export const getLeadLinks = () => api.get('/config/lead-links')
export const putLeadLinks = (data) => api.put('/config/lead-links', data)

// Statistics
export const getOverview = () => api.get('/statistics/overview')
export const getEmployeeStats = (employee) => api.get(`/statistics/employee/${employee}`)
export const getComparison = () => api.get('/statistics/comparison')

// Leads
export const listLeads = (params) => api.get('/leads/', { params, paramsSerializer: p => {
  const sp = new URLSearchParams()
  Object.entries(p).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach(val => sp.append(k, val))
    else if (v !== undefined && v !== null && v !== '') sp.append(k, v)
  })
  return sp.toString()
}})
export const getLead = (id) => api.get(`/leads/${id}`)
export const patchLead = (id, data) => api.patch(`/leads/${id}`, data)
export const addLeadComment = (id, text, author) => api.post(`/leads/${id}/comment`, { text, author })
export const editLeadComment = (id, idx, text) => api.patch(`/leads/${id}/comment/${idx}`, { text })
export const deleteLeadComment = (id, idx) => api.delete(`/leads/${id}/comment/${idx}`)
export const syncLeads = (full = false) => api.post(`/leads/sync${full ? '?full=true' : ''}`)
export const getLeadSheetHeaders = () => api.get('/leads/sheet-headers')
export const normalizeLeadStatuses = () => api.post('/leads/normalize-statuses')
export const sendLeadViber = (id, message) => api.post(`/leads/${id}/send-viber`, { message })
export const sendLeadEmail = (id, to, subject, body) => api.post(`/leads/${id}/send-email`, { to, subject, body })
export const getLeadsReporting = () => api.get('/leads/reporting')
export const getLeadsDailyVolume = () => api.get('/leads/daily-volume')

// Health / diagnostics
export const getHealth = () => api.get('/health')

// Phone — hang up the active call in the user's softphone.
// Tries two mechanisms:
//  1. PhoneLite's local HTTP API via Image() (bypasses CORS/mixed-content for localhost)
//     PhoneLite must have HTTP interface enabled; default port 7070
//  2. MicroSIP's registered "msip:" URI scheme — MicroSIP parses "msip:hangupall"
//     and hangs up all non-incoming calls (works if MicroSIP is installed and
//     registered as the msip: protocol handler, the default on install)
export const hangupCall = () => {
  // Fire the msip: navigation synchronously so it stays within the click's
  // user-activation window — browsers silently block custom-protocol
  // navigations triggered from async callbacks (e.g. after a Promise/setTimeout).
  try {
    window.location.href = 'msip:hangupall'
  } catch {}

  return new Promise(resolve => {
    const img = new Image()
    img.onload = img.onerror = resolve
    img.src = `http://127.0.0.1:7070/hangup?_=${Date.now()}`
    setTimeout(resolve, 500)
  })
}

// Leads — manual create
export const createLead = (data) => api.post('/leads/create', data)

// Admin / backup
export const triggerBackup = () => api.post('/admin/backup-now')
export const exportData = async () => {
  const res = await api.get('/admin/export', { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `Exodikastikos-backup_${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// Public (no auth)
export const getPublicCase = (token, vat, notrack = false) => {
  const params = {}
  if (vat) params.vat = vat
  if (notrack) params.notrack = '1'
  return api.get(`/public/case/${token}`, Object.keys(params).length ? { params } : {})
}
export const markPortalInterested = (token) => api.post(`/public/case/${token}/interested`)
export const getPublicStats = () => api.get('/public/stats')

// IRIS payments (DIAS Request to Pay)
export const createIrisPayment = (data) => api.post('/payments/iris/create', data)
export const listIrisPayments = () => api.get('/payments/iris')
export const getIrisPayment = (paymentId) => api.get(`/payments/iris/${paymentId}`)
export const recheckIrisPayment = (paymentId) => api.post(`/payments/iris/${paymentId}/recheck`)

export default api
