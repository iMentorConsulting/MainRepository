import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Calendar from './pages/Calendar'
import Bookings from './pages/Bookings'
import Units from './pages/Units'
import Customers from './pages/Customers'
import Reports from './pages/Reports'
import SmartAdvisor from './pages/SmartAdvisor'
import Cleaning from './pages/Cleaning'

export default function App() {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('auth') || 'null') } catch { return null }
  })

  const handleLogout = () => {
    localStorage.removeItem('auth')
    setAuth(null)
  }

  if (!auth) {
    return (
      <>
        <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
        <Login onLogin={setAuth} />
      </>
    )
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      <Routes>
        <Route path="/" element={<Layout auth={auth} onLogout={handleLogout} />}>
          <Route index element={<Dashboard />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="units" element={<Units />} />
          <Route path="customers" element={<Customers />} />
          <Route path="reports" element={<Reports />} />
          <Route path="smart-advisor" element={<SmartAdvisor />} />
          <Route path="cleaning" element={<Cleaning />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
