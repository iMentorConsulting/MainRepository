import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
})

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

// Reports
export const getDashboard = () => api.get('/reports/dashboard')
export const getOccupancy = (params) => api.get('/reports/occupancy', { params })
export const getByChannel = (params) => api.get('/reports/by-channel', { params })
export const getFinancial = (params) => api.get('/reports/financial', { params })

// AI Advisor
export const recommendUnit = (data) => api.post('/ai/recommend-unit', data)
export const getGapAlerts = (params) => api.get('/ai/gap-alerts', { params })

export default api
