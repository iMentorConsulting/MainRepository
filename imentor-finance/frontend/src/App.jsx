import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import IncomeList from './pages/Income/IncomeList';
import ExpensesList from './pages/Expenses/ExpensesList';
import ReportsPage from './pages/Reports/ReportsPage';
import BonusReport from './pages/Reports/BonusReport';
import InvoicesPage from './pages/Invoices/InvoicesPage';
import EmailsPage from './pages/Emails/EmailsPage';
import ListManager from './pages/Settings/ListManager';
import ImportPage from './pages/Import/ImportPage';
import ServiceAgreementsPage from './pages/ServiceAgreements/ServiceAgreementsPage';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Layout>{children}</Layout> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/income" element={<ProtectedRoute><IncomeList /></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute><ExpensesList /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
      <Route path="/bonus" element={<ProtectedRoute><BonusReport /></ProtectedRoute>} />
      <Route path="/invoices" element={<ProtectedRoute><InvoicesPage /></ProtectedRoute>} />
      <Route path="/emails" element={<ProtectedRoute><EmailsPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><ListManager /></ProtectedRoute>} />
      <Route path="/import" element={<ProtectedRoute><ImportPage /></ProtectedRoute>} />
      <Route path="/service-agreements" element={<ProtectedRoute><ServiceAgreementsPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      </BrowserRouter>
    </AuthProvider>
  );
}
