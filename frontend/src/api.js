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

export default api
