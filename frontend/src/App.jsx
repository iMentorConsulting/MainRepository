import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { getAuth, setAuth as saveAuth, clearAuth } from './api'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Cases from './pages/Cases'
import CaseDetail from './pages/CaseDetail'
import Kanban from './pages/Kanban'
import PendingPage from './pages/PendingPage'
import WorkView from './pages/WorkView'
import Notifications from './pages/Notifications'
import Users from './pages/Users'
import Import from './pages/Import'
import ClientPortal from './pages/ClientPortal'

export default function App() {
  const [auth, setAuthState] = useState(() => getAuth())

  const handleLogin = (data) => {
    saveAuth(data)
    setAuthState(data)
  }

  const handleLogout = () => {
    clearAuth()
    setAuthState(null)
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      <Routes>
        {/* Public portal route — no auth required */}
        <Route path="/portal/:token" element={<ClientPortal />} />

        {/* Auth-protected app */}
        {!auth ? (
          <Route path="*" element={<Login onLogin={handleLogin} />} />
        ) : (
          <Route path="/" element={<Layout auth={auth} onLogout={handleLogout} />}>
            <Route index element={<Dashboard />} />
            <Route path="cases" element={<Cases />} />
            <Route path="cases/:id" element={<CaseDetail />} />
            <Route path="kanban" element={<Kanban />} />
            <Route path="pending" element={<PendingPage />} />
            <Route path="workview" element={<WorkView />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="users" element={<Users />} />
            <Route path="import" element={<Import />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  )
}
