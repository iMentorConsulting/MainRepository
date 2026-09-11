import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import CaseForm from './pages/CaseForm'
import CaseDetail from './pages/CaseDetail'
import Statistics from './pages/Statistics'
import SalesPipeline from './pages/SalesPipeline'
import ClientPreview from './pages/ClientPreview'
import Login from './pages/Login'
import QuickQuote from './pages/QuickQuote'
import FinancialDashboard from './pages/FinancialDashboard'
import Leads from './pages/Leads'
import LeadsReporting from './pages/LeadsReporting'
import LeadLists from './pages/LeadLists'
import IrisPayments from './pages/IrisPayments'
import Themis from './pages/Themis'
import ThemisCreate from './pages/ThemisCreate'
import ThemisSettings from './pages/ThemisSettings'
import ThemisConversations from './pages/ThemisConversations'
import NotificationListener from './components/NotificationListener'
import { loginUser } from './api'

const SESSION_MS = 8 * 60 * 60 * 1000  // 8 hours

function getStoredAuth() {
  try {
    const raw = localStorage.getItem('debt-auth')
    if (!raw) return null
    const auth = JSON.parse(raw)
    if (!auth?.token || !auth?.loginAt) return null
    if (Date.now() - auth.loginAt > SESSION_MS) {
      localStorage.removeItem('debt-auth')
      return null
    }
    return auth
  } catch {
    return null
  }
}

export default function App() {
  const [auth, setAuth] = useState(getStoredAuth)

  // Auto-logout: check every 60s and on window focus
  useEffect(() => {
    if (!auth) return
    const check = () => { if (!getStoredAuth()) setAuth(null) }
    const id = setInterval(check, 60_000)
    window.addEventListener('focus', check)
    return () => { clearInterval(id); window.removeEventListener('focus', check) }
  }, [auth])

  const login = async (employee, password) => {
    try {
      const res = await loginUser(employee, password)
      const { token, employee: emp } = res.data
      const user = { employee: emp, token, loginAt: Date.now() }
      localStorage.setItem('debt-auth', JSON.stringify(user))
      setAuth(user)
      return null
    } catch (err) {
      return err?.response?.data?.detail || 'Σφάλμα σύνδεσης'
    }
  }

  const logout = () => {
    localStorage.removeItem('debt-auth')
    setAuth(null)
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <NotificationListener enabled={!!auth} />
      <Routes>
        {/* Public client preview — no auth */}
        <Route path="/preview/:token" element={<ClientPreview />} />
        {/* Public Θέμις AI screening chat — no auth */}
        <Route path="/themis/:token" element={<Themis />} />
        {/* Public ΛΟΓΙΣΤΗΣ direct integration — creates lead + redirects to Θέμις chat */}
        <Route path="/themis/create" element={<ThemisCreate />} />

        {/* Auth-protected app */}
        {!auth ? (
          <>
            <Route path="*" element={<Login onLogin={login} />} />
          </>
        ) : (
          <Route element={<Layout auth={auth} onLogout={logout} />}>
            <Route index element={<Dashboard currentEmployee={auth.employee} />} />
            <Route path="/cases/new" element={<CaseForm currentEmployee={auth.employee} />} />
            <Route path="/cases/:id/edit" element={<CaseForm currentEmployee={auth.employee} />} />
            <Route path="/cases/:id" element={<CaseDetail currentEmployee={auth.employee} />} />
            <Route path="/pipeline" element={<SalesPipeline currentEmployee={auth.employee} />} />
            <Route path="/quick-quote" element={<QuickQuote />} />
            <Route path="/statistics" element={<Statistics currentEmployee={auth.employee} />} />
            <Route path="/finances" element={<FinancialDashboard currentEmployee={auth.employee} />} />
            <Route path="/leads" element={<Leads currentEmployee={auth.employee} />} />
            <Route path="/lead-lists" element={<LeadLists currentEmployee={auth.employee} />} />
            <Route path="/payments" element={<IrisPayments currentEmployee={auth.employee} />} />
            <Route path="/leads-reporting" element={<LeadsReporting currentEmployee={auth.employee} />} />
            <Route path="/themis-settings" element={<ThemisSettings />} />
            <Route path="/themis-conversations" element={<ThemisConversations />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  )
}
