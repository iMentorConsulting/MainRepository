import React, { useState, lazy, Suspense } from 'react'
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
import PortalAdmin from './pages/PortalAdmin'

const GuestPortal = lazy(() => import('./pages/GuestPortal'))

class ErrorBoundary extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 20, fontFamily: 'monospace', color: 'red', background: 'white', minHeight: '100vh' }}>
        <h2>Application Error</h2>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.toString()}</pre>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{this.state.error.stack}</pre>
        <button onClick={() => { localStorage.clear(); window.location.reload() }}
          style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>
          Clear Storage &amp; Reload
        </button>
      </div>
    )
    return this.props.children
  }
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('auth') || 'null') } catch { return null }
  })

  const handleLogout = () => {
    localStorage.removeItem('auth')
    setAuth(null)
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
        <Routes>
          {/* Public guest portal — no auth required */}
          <Route
            path="/guest/:token"
            element={
              <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>}>
                <GuestPortal />
              </Suspense>
            }
          />

          {/* Authenticated admin app */}
          {!auth ? (
            <Route path="*" element={<Login onLogin={setAuth} />} />
          ) : (
            <Route path="/" element={<Layout auth={auth} onLogout={handleLogout} />}>
              <Route index element={<Dashboard />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="units" element={<Units />} />
              <Route path="customers" element={<Customers />} />
              <Route path="reports" element={<Reports />} />
              <Route path="smart-advisor" element={<SmartAdvisor />} />
              <Route path="cleaning" element={<Cleaning />} />
              <Route path="portal" element={<PortalAdmin />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          )}
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
