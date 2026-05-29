import { useState } from 'react'
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

const EMPLOYEES = ['STELLA', 'VALLIA', 'SOFIA', 'HARIS']
const APP_PASSWORD = 'imentor2024'

export default function App() {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('debt-auth') || 'null') } catch { return null }
  })

  const login = (employee, password) => {
    if (!EMPLOYEES.includes(employee)) return 'Μη έγκυρος υπάλληλος'
    if (password !== APP_PASSWORD) return 'Λάθος κωδικός'
    const user = { employee }
    localStorage.setItem('debt-auth', JSON.stringify(user))
    setAuth(user)
    return null
  }

  const logout = () => {
    localStorage.removeItem('debt-auth')
    setAuth(null)
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Routes>
        {/* Public client preview — no auth */}
        <Route path="/preview/:token" element={<ClientPreview />} />

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
            <Route path="/lead-lists" element={<LeadLists />} />
            <Route path="/leads-reporting" element={<LeadsReporting currentEmployee={auth.employee} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  )
}
