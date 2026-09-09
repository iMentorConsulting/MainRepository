import React, { useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import Login from './pages/Login'
import SuperAdmin from './pages/SuperAdmin'
import Dashboard from './pages/Dashboard'
import Calendar from './pages/Calendar'
import Bookings from './pages/Bookings'
import Units from './pages/Units'
import Customers from './pages/Customers'
import Reports from './pages/Reports'
import SmartAdvisor from './pages/SmartAdvisor'
import Cleaning from './pages/Cleaning'
import PortalAdmin from './pages/PortalAdmin'
import Expenses from './pages/Expenses'
import Maintenance from './pages/Maintenance'
import Owners from './pages/Owners'
import Pricing from './pages/Pricing'
import Sync from './pages/Sync'
import Availability from './pages/Availability'
import WidgetAdmin from './pages/WidgetAdmin'
import Loans from './pages/Loans'

const GuestPortal = lazy(() => import('./pages/GuestPortal'))
const WidgetPage = lazy(() => import('./pages/WidgetPage'))
const BookingPage = lazy(() => import('./pages/BookingPage'))

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

          {/* Public availability widget — no auth required */}
          <Route
            path="/widget/:token"
            element={
              <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>}>
                <WidgetPage />
              </Suspense>
            }
          />

          {/* Public direct booking page — no auth required */}
          <Route
            path="/book/:token"
            element={
              <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>}>
                <BookingPage />
              </Suspense>
            }
          />

          {/* Authenticated admin app */}
          {!auth ? (
            <Route path="*" element={<Login onLogin={setAuth} />} />
          ) : auth.is_superadmin ? (
            <Route path="*" element={<SuperAdmin onLogout={handleLogout} />} />
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
              <Route path="expenses" element={<Expenses />} />
              <Route path="loans" element={<Loans />} />
              <Route path="maintenance" element={<Maintenance />} />
              <Route path="owners" element={<Owners />} />
              <Route path="pricing" element={<Pricing />} />
              <Route path="sync" element={<Sync />} />
              <Route path="availability" element={<Availability />} />
              <Route path="portal" element={<PortalAdmin />} />
              <Route path="widget-admin" element={<WidgetAdmin />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          )}
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
