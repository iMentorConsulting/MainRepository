import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { getAuth, setAuth as saveAuth, clearAuth } from './api'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
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
import PortalBroadcastPage from './pages/PortalBroadcastPage'
import PortalDocumentsPage from './pages/PortalDocumentsPage'
import RevenueForecastPage from './pages/RevenueForecastPage'
import PipelineAdmin from './pages/PipelineAdmin'
import WorkListsPage from './pages/WorkListsPage'
import Analytics from './pages/Analytics'
import DeadlineCalendar from './pages/DeadlineCalendar'
import BackupPage from './pages/BackupPage'
import StatusNotificationsPage from './pages/StatusNotificationsPage'
import Leads from './pages/Leads'
import LeadDetail from './pages/LeadDetail'
import LeadSheetConfigPage from './pages/LeadSheetConfigPage'
import LeadsStats from './pages/LeadsStats'

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
        <Route path="/portal/:token" element={<ErrorBoundary><ClientPortal /></ErrorBoundary>} />

        {/* Auth-protected app */}
        {!auth ? (
          <Route path="*" element={<Login onLogin={handleLogin} />} />
        ) : (
          <Route path="/" element={<Layout auth={auth} onLogout={handleLogout} />}>
            <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="cases" element={<ErrorBoundary><Cases /></ErrorBoundary>} />
            <Route path="cases/:id" element={<ErrorBoundary><CaseDetail /></ErrorBoundary>} />
            <Route path="leads" element={<ErrorBoundary><Leads /></ErrorBoundary>} />
            <Route path="leads/:id" element={<ErrorBoundary><LeadDetail /></ErrorBoundary>} />
            <Route path="leads-stats" element={<ErrorBoundary><LeadsStats /></ErrorBoundary>} />
            <Route path="leads-config" element={<ErrorBoundary><LeadSheetConfigPage /></ErrorBoundary>} />
            <Route path="kanban" element={<ErrorBoundary><Kanban /></ErrorBoundary>} />
            <Route path="pending" element={<ErrorBoundary><PendingPage /></ErrorBoundary>} />
            <Route path="workview" element={<ErrorBoundary><WorkView /></ErrorBoundary>} />
            <Route path="notifications" element={<ErrorBoundary><Notifications /></ErrorBoundary>} />
            <Route path="users" element={<ErrorBoundary><Users /></ErrorBoundary>} />
            <Route path="import" element={<ErrorBoundary><Import /></ErrorBoundary>} />
            <Route path="portal-broadcast" element={<ErrorBoundary><PortalBroadcastPage /></ErrorBoundary>} />
            <Route path="portal-documents" element={<ErrorBoundary><PortalDocumentsPage /></ErrorBoundary>} />
            <Route path="pipeline-admin" element={<ErrorBoundary><PipelineAdmin /></ErrorBoundary>} />
            <Route path="worklists" element={<ErrorBoundary><WorkListsPage /></ErrorBoundary>} />
            <Route path="analytics" element={<ErrorBoundary><Analytics /></ErrorBoundary>} />
            <Route path="revenue" element={<ErrorBoundary><RevenueForecastPage /></ErrorBoundary>} />
            <Route path="calendar" element={<ErrorBoundary><DeadlineCalendar /></ErrorBoundary>} />
            <Route path="backup" element={<ErrorBoundary><BackupPage /></ErrorBoundary>} />
            <Route path="status-notifications" element={<ErrorBoundary><StatusNotificationsPage /></ErrorBoundary>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  )
}
