import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
})

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
export const approveWinback = (id, approve) => api.post(`/cases/${id}/approve-winback`, { approve })
export const sendWinback = (id, channel) => api.post(`/cases/${id}/send-winback`, { channel })
export const sendViber = (id, data) => api.post(`/cases/${id}/send-viber`, data)
export const sendEmail = (id, data) => api.post(`/cases/${id}/send-email`, data)

// Statistics
export const getOverview = () => api.get('/statistics/overview')
export const getEmployeeStats = (employee) => api.get(`/statistics/employee/${employee}`)
export const getComparison = () => api.get('/statistics/comparison')

// Public (no auth)
export const getPublicCase = (token, vat, notrack = false) => {
  const params = {}
  if (vat) params.vat = vat
  if (notrack) params.notrack = '1'
  return api.get(`/public/case/${token}`, Object.keys(params).length ? { params } : {})
}
export const markPortalInterested = (token) => api.post(`/public/case/${token}/interested`)
export const getPublicStats = () => api.get('/public/stats')

export default api
