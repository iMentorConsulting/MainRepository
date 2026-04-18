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

// Statistics
export const getOverview = () => api.get('/statistics/overview')
export const getEmployeeStats = (employee) => api.get(`/statistics/employee/${employee}`)
export const getComparison = () => api.get('/statistics/comparison')

// Public (no auth)
export const getPublicCase = (token, vat) => api.get(`/public/case/${token}`, vat ? { params: { vat } } : {})

export default api
