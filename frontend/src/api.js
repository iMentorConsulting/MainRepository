import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || ''

const api = axios.create({ baseURL: BASE, timeout: 30000 })

api.interceptors.request.use((config) => {
  const auth = getAuth()
  if (auth?.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('cm_auth')
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

export const getAuth = () => {
  try { return JSON.parse(localStorage.getItem('cm_auth') || 'null') } catch { return null }
}
export const setAuth = (data) => localStorage.setItem('cm_auth', JSON.stringify(data))
export const clearAuth = () => localStorage.removeItem('cm_auth')

// Auth
export const login = (username, password) =>
  api.post('/api/cm/auth/login', { username, password }).then(r => r.data)
export const getMe = () => api.get('/api/cm/auth/me').then(r => r.data)
export const changePassword = (current_password, new_password) =>
  api.post('/api/cm/auth/change-password', { current_password, new_password }).then(r => r.data)

// Users
export const getUsers = () => api.get('/api/cm/users/').then(r => r.data)
export const createUser = (data) => api.post('/api/cm/users/', data).then(r => r.data)
export const updateUser = (id, data) => api.put(`/api/cm/users/${id}`, data).then(r => r.data)
export const deleteUser = (id) => api.delete(`/api/cm/users/${id}`).then(r => r.data)

// Cases
export const getCases = (params) => api.get('/api/cm/cases/', { params }).then(r => r.data)
export const getCase = (id) => api.get(`/api/cm/cases/${id}`).then(r => r.data)
export const createCase = (data) => api.post('/api/cm/cases/', data).then(r => r.data)
export const updateCase = (id, data) => api.put(`/api/cm/cases/${id}`, data).then(r => r.data)
export const deleteCase = (id) => api.delete(`/api/cm/cases/${id}`).then(r => r.data)

// Tasks
export const getTasks = (caseId) => api.get(`/api/cm/cases/${caseId}/tasks`).then(r => r.data)
export const createTask = (caseId, data) => api.post(`/api/cm/cases/${caseId}/tasks`, data).then(r => r.data)
export const updateTask = (caseId, taskId, data) => api.put(`/api/cm/cases/${caseId}/tasks/${taskId}`, data).then(r => r.data)
export const deleteTask = (caseId, taskId) => api.delete(`/api/cm/cases/${caseId}/tasks/${taskId}`).then(r => r.data)

// Payments
export const getPayments = (caseId) => api.get(`/api/cm/cases/${caseId}/payments`).then(r => r.data)
export const createPayment = (caseId, data) => api.post(`/api/cm/cases/${caseId}/payments`, data).then(r => r.data)
export const deletePayment = (caseId, payId) => api.delete(`/api/cm/cases/${caseId}/payments/${payId}`).then(r => r.data)

// Messages
export const getMessages = (caseId) => api.get(`/api/cm/cases/${caseId}/messages`).then(r => r.data)
export const createMessage = (caseId, data) => api.post(`/api/cm/cases/${caseId}/messages`, data).then(r => r.data)
export const deleteMessage = (caseId, msgId) => api.delete(`/api/cm/cases/${caseId}/messages/${msgId}`).then(r => r.data)

// Documents
export const getDocuments = (caseId) => api.get(`/api/cm/cases/${caseId}/documents`).then(r => r.data)
export const createDocument = (caseId, data) => api.post(`/api/cm/cases/${caseId}/documents`, data).then(r => r.data)
export const updateDocument = (caseId, docId, data) => api.put(`/api/cm/cases/${caseId}/documents/${docId}`, data).then(r => r.data)
export const deleteDocument = (caseId, docId) => api.delete(`/api/cm/cases/${caseId}/documents/${docId}`).then(r => r.data)

// Budget Categories
export const getBudgetCategories = (caseId) => api.get(`/api/cm/cases/${caseId}/budget-categories`).then(r => r.data)
export const createBudgetCategory = (caseId, data) => api.post(`/api/cm/cases/${caseId}/budget-categories`, data).then(r => r.data)
export const updateBudgetCategory = (caseId, catId, data) => api.put(`/api/cm/cases/${caseId}/budget-categories/${catId}`, data).then(r => r.data)
export const deleteBudgetCategory = (caseId, catId) => api.delete(`/api/cm/cases/${caseId}/budget-categories/${catId}`).then(r => r.data)

// Dashboard
export const getDashboardStats = () => api.get('/api/cm/dashboard/stats').then(r => r.data)

// Google Sheets
export const previewSheet = () => api.get('/api/cm/sheets/preview').then(r => r.data)
export const importFromSheet = () => api.post('/api/cm/sheets/import').then(r => r.data)
export const syncPaidFromSheet = () => api.post('/api/cm/sheets/sync-paid').then(r => r.data)
export const syncAgentsFromSheet = () =>
  api.post('/api/cm/sheets/sync-agents').then(r => r.data)
export const getServiceTypes = () => api.get('/api/cm/sheets/service-types').then(r => r.data)
export const assignPrograms = (assignments) =>
  api.post('/api/cm/sheets/assign-programs', { assignments }).then(r => r.data)

// Notifications
export const sendNotification = (caseId, data) => api.post(`/api/cm/notifications/send/${caseId}`, data).then(r => r.data)
export const sendBulkNotification = (data) => api.post('/api/cm/notifications/send-bulk', data).then(r => r.data)
export const getNotificationLogs = (caseId) =>
  api.get('/api/cm/notifications/logs', { params: caseId ? { case_id: caseId } : {} }).then(r => r.data)
export const getNotificationTemplates = () => api.get('/api/cm/notifications/templates').then(r => r.data)

// Admin SLA
export const getSLAConfig = () => api.get('/api/cm/admin/sla').then(r => r.data)
export const updateSLAConfig = (entries) => api.put('/api/cm/admin/sla', { entries }).then(r => r.data)
export const deleteSLAEntry = (status) => api.delete(`/api/cm/admin/sla/${encodeURIComponent(status)}`).then(r => r.data)

// Notification template CRUD
export const createTemplate = (data) => api.post('/api/cm/notifications/templates', data).then(r => r.data)
export const updateTemplate = (id, data) => api.put(`/api/cm/notifications/templates/${id}`, data).then(r => r.data)
export const deleteTemplate = (id) => api.delete(`/api/cm/notifications/templates/${id}`).then(r => r.data)

export const sendSLANotifications = (data) => api.post('/api/cm/notifications/send-sla', data).then(r => r.data)

// Pending Item Templates (admin)
export const getPendingItemTemplates = (programCategory) =>
  api.get('/api/cm/admin/pending-templates', { params: programCategory ? { program_category: programCategory } : {} }).then(r => r.data)
export const createPendingItemTemplate = (data) => api.post('/api/cm/admin/pending-templates', data).then(r => r.data)
export const updatePendingItemTemplate = (id, data) => api.put(`/api/cm/admin/pending-templates/${id}`, data).then(r => r.data)
export const deletePendingItemTemplate = (id) => api.delete(`/api/cm/admin/pending-templates/${id}`).then(r => r.data)

// Per-case pending items
export const getCasePendingItems = (caseId) => api.get(`/api/cm/cases/${caseId}/pending-items`).then(r => r.data)
export const createCasePendingItem = (caseId, data) => api.post(`/api/cm/cases/${caseId}/pending-items`, data).then(r => r.data)
export const updateCasePendingItem = (caseId, itemId, data) => api.put(`/api/cm/cases/${caseId}/pending-items/${itemId}`, data).then(r => r.data)
export const deleteCasePendingItem = (caseId, itemId) => api.delete(`/api/cm/cases/${caseId}/pending-items/${itemId}`).then(r => r.data)
export const notifyCasePendingItems = (caseId, data) => api.post(`/api/cm/cases/${caseId}/pending-items/notify`, data).then(r => r.data)
export const getAllPendingOverview = (params = {}) => api.get('/api/cm/pending-items/all', { params }).then(r => r.data)
export const patchCaseField = (id, data) => api.put(`/api/cm/cases/${id}`, data).then(r => r.data)

// Client Portal
export const getPortalCase = (token) =>
  axios.get(`${BASE}/api/cm/portal/public/${token}`).then(r => r.data)
export const recordPortalVisit = (token, afm) =>
  axios.post(`${BASE}/api/cm/portal/public/${token}/visit`, { afm }).then(r => r.data)
export const togglePortal = (caseId) => api.post(`/api/cm/portal/${caseId}/toggle`).then(r => r.data)
export const regeneratePortalToken = (caseId) => api.post(`/api/cm/portal/${caseId}/regenerate-token`).then(r => r.data)
export const bulkActivateNotify = (data) => api.post('/api/cm/portal/bulk-activate-notify', data).then(r => r.data)

export default api
