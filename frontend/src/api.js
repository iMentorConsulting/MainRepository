import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach auth token to every request
api.interceptors.request.use((config) => {
  try {
    const auth = JSON.parse(localStorage.getItem('auth') || 'null')
    if (auth?.token) config.headers.Authorization = `Bearer ${auth.token}`
  } catch {}
  return config
})

// Auto-logout on 401
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth')
      window.location.reload()
    }
    return Promise.reject(err)
  }
)

// Auth
export const getTenants = () => api.get('/auth/tenants')
export const login = (data) => api.post('/auth/login', data)

// Units
export const getUnits = (params) => api.get('/units/', { params })
export const createUnit = (data) => api.post('/units/', data)
export const updateUnit = (id, data) => api.put(`/units/${id}`, data)
export const deleteUnit = (id) => api.delete(`/units/${id}`)

// Customers
export const getCustomers = (params) => api.get('/customers/', { params })
export const createCustomer = (data) => api.post('/customers/', data)
export const updateCustomer = (id, data) => api.put(`/customers/${id}`, data)
export const deleteCustomer = (id) => api.delete(`/customers/${id}`)

// Bookings
export const getBookings = (params) => api.get('/bookings/', { params })
export const createBooking = (data) => api.post('/bookings/', data)
export const updateBooking = (id, data) => api.put(`/bookings/${id}`, data)
export const deleteBooking = (id) => api.delete(`/bookings/${id}`)

// Bookings Excel
export const exportBookings = (params) => api.get('/bookings/export/excel', { params, responseType: 'blob' })
export const downloadTemplate = () => api.get('/bookings/template/excel', { responseType: 'blob' })
export const importBookings = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/bookings/import/excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

// Reports
export const getDashboard = () => api.get('/reports/dashboard')
export const getOccupancy = (params) => api.get('/reports/occupancy', { params })
export const getByChannel = (params) => api.get('/reports/by-channel', { params })
export const getFinancial = (params) => api.get('/reports/financial', { params })
export const getPriceAnalytics = (params) => api.get('/reports/price-analytics', { params })

// AI Advisor
export const recommendUnit = (data) => api.post('/ai/recommend-unit', data)
export const getGapAlerts = (params) => api.get('/ai/gap-alerts', { params })
export const getBookingAlerts = () => api.get('/ai/booking-alerts')

// Cleaning
export const getDailyTasks = (params) => api.get('/cleaning/daily', { params })
export const getCleaningSettings = () => api.get('/cleaning/settings')
export const saveCleaningSettings = (data) => api.put('/cleaning/settings', data)

// Expenses
export const getExpenses = (params) => api.get('/expenses/', { params })
export const createExpense = (data) => api.post('/expenses/', data)
export const updateExpense = (id, data) => api.put(`/expenses/${id}`, data)
export const deleteExpense = (id) => api.delete(`/expenses/${id}`)
export const getExpenseCategories = () => api.get('/expenses/categories')
export const getExpenseUnitTypes = () => api.get('/expenses/unit-types')
export const getExpenseSummary = (params) => api.get('/expenses/summary', { params })
export const downloadExpensesTemplate = () => api.get('/expenses/template/excel', { responseType: 'blob' })
export const importExpenses = (file) => {
  const fd = new FormData(); fd.append('file', file)
  return api.post('/expenses/import/excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

// Maintenance
export const getMaintenanceIssues = (params) => api.get('/maintenance/', { params })
export const createMaintenanceIssue = (data) => api.post('/maintenance/', data)
export const updateMaintenanceIssue = (id, data) => api.put(`/maintenance/${id}`, data)
export const updateMaintenanceStatus = (id, data) => api.patch(`/maintenance/${id}/status`, data)
export const deleteMaintenanceIssue = (id) => api.delete(`/maintenance/${id}`)
export const getMaintenanceCategories = () => api.get('/maintenance/categories')
export const getMaintenanceStats = () => api.get('/maintenance/stats')

// Owners
export const getOwners = () => api.get('/owners/')
export const createOwner = (data) => api.post('/owners/', data)
export const updateOwner = (id, data) => api.put(`/owners/${id}`, data)
export const deleteOwner = (id) => api.delete(`/owners/${id}`)
export const assignOwnerUnits = (id, unitIds) => api.put(`/owners/${id}/units`, unitIds)
export const getOwnerReport = (id, year, month) => api.get(`/owners/${id}/report`, { params: { year, month } })
export const sendOwnerReport = (id, year, month) => api.post(`/owners/${id}/send-report`, null, { params: { year, month } })

// Pricing
export const getPricingRates = (params) => api.get('/pricing/rates', { params })
export const createPricingRate = (data) => api.post('/pricing/rates', data)
export const updatePricingRate = (id, data) => api.put(`/pricing/rates/${id}`, data)
export const deletePricingRate = (id) => api.delete(`/pricing/rates/${id}`)
export const checkPrice = (params) => api.get('/pricing/check', { params })

// iCal sync
export const syncIcalAll = () => api.post('/ical/sync')
export const syncIcalUnit = (unitId) => api.post(`/ical/sync/${unitId}`)

// Guest Portal — admin side
export const getPortalSettings = () => api.get('/portal/settings')
export const savePortalSettings = (data) => api.put('/portal/settings', data)
export const getLicense = () => api.get('/portal/license')
export const getPortalGuide = () => api.get('/portal/guide')
export const createGuideItem = (data) => api.post('/portal/guide', data)
export const updateGuideItem = (id, data) => api.put(`/portal/guide/${id}`, data)
export const deleteGuideItem = (id) => api.delete(`/portal/guide/${id}`)
export const getPortalRecommendations = () => api.get('/portal/recommendations')
export const createRecommendation = (data) => api.post('/portal/recommendations', data)
export const updateRecommendation = (id, data) => api.put(`/portal/recommendations/${id}`, data)
export const deleteRecommendation = (id) => api.delete(`/portal/recommendations/${id}`)
export const getMarketplace = () => api.get('/portal/marketplace')
export const createMarketplaceItem = (data) => api.post('/portal/marketplace', data)
export const updateMarketplaceItem = (id, data) => api.put(`/portal/marketplace/${id}`, data)
export const deleteMarketplaceItem = (id) => api.delete(`/portal/marketplace/${id}`)
export const getServiceRequests = () => api.get('/portal/requests')
export const updateServiceRequest = (id, data) => api.put(`/portal/requests/${id}`, data)
export const getConversations = () => api.get('/portal/messages')
export const getConversation = (bookingId) => api.get(`/portal/messages/${bookingId}`)
export const sendManagerMessage = (bookingId, data) => api.post(`/portal/messages/${bookingId}`, data)
export const getPortalLink = (bookingId) => api.get(`/portal/bookings/${bookingId}/portal`)
export const sendPortalEmail = (bookingId, data) => api.post(`/portal/bookings/${bookingId}/send-portal`, data)
export const getPortalAnalytics = () => api.get('/portal/analytics')

export default api
