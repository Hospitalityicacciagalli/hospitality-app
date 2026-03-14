import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import CustomerList from './pages/CustomerList';
import CustomerForm from './pages/CustomerForm';
import CustomerDetail from './pages/CustomerDetail';
import ReservationCalendar from './pages/ReservationCalendar';
import ReservationDay from './pages/ReservationDay';
import ReservationForm from './pages/ReservationForm';
import StaffList from './pages/StaffList';
import StaffForm from './pages/StaffForm';
import StaffDetail from './pages/StaffDetail';
import SettingsPage from './pages/SettingsPage';
import UserManagement from './pages/UserManagement';
import ProfilePage from './pages/ProfilePage';
import CassaPage from './pages/CassaPage';
import SalePage from './pages/SalePage';

function ProtectedRoute({ children, roles }) {
  var { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Caricamento...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRoutes() {
  var { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Caricamento...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>

        {/* Redirect radice */}
        <Route path="/" element={<Navigate to="/prenotazioni" replace />} />
        <Route path="/login" element={<Navigate to="/prenotazioni" replace />} />

        {/* Clienti */}
        <Route path="/clienti" element={
          <ProtectedRoute>
            <CustomerList />
          </ProtectedRoute>
        } />
        <Route path="/clienti/nuovo" element={
          <ProtectedRoute roles={['super_admin', 'direttore', 'reception', 'sala']}>
            <CustomerForm />
          </ProtectedRoute>
        } />
        <Route path="/clienti/:id" element={
          <ProtectedRoute>
            <CustomerDetail />
          </ProtectedRoute>
        } />
        <Route path="/clienti/:id/modifica" element={
          <ProtectedRoute roles={['super_admin', 'direttore', 'reception', 'sala']}>
            <CustomerForm />
          </ProtectedRoute>
        } />

        {/* Prenotazioni */}
        <Route path="/prenotazioni" element={
          <ProtectedRoute>
            <ReservationCalendar />
          </ProtectedRoute>
        } />
        <Route path="/prenotazioni/giorno/:date" element={
          <ProtectedRoute>
            <ReservationDay />
          </ProtectedRoute>
        } />
        <Route path="/prenotazioni/nuova" element={
          <ProtectedRoute roles={['super_admin', 'direttore', 'reception', 'sala']}>
            <ReservationForm />
          </ProtectedRoute>
        } />
        <Route path="/prenotazioni/:id/modifica" element={
          <ProtectedRoute roles={['super_admin', 'direttore', 'reception', 'sala']}>
            <ReservationForm />
          </ProtectedRoute>
        } />

        {/* Sale e Tavoli */}
        <Route path="/sale" element={
          <ProtectedRoute roles={['super_admin', 'proprieta', 'direttore', 'reception', 'sala']}>
            <SalePage />
          </ProtectedRoute>
        } />

        {/* Staff */}
        <Route path="/staff" element={
          <ProtectedRoute roles={['super_admin', 'direttore', 'reception']}>
            <StaffList />
          </ProtectedRoute>
        } />
        <Route path="/staff/nuovo" element={
          <ProtectedRoute roles={['super_admin', 'direttore']}>
            <StaffForm />
          </ProtectedRoute>
        } />
        <Route path="/staff/:id" element={
          <ProtectedRoute roles={['super_admin', 'direttore', 'reception']}>
            <StaffDetail />
          </ProtectedRoute>
        } />
        <Route path="/staff/:id/modifica" element={
          <ProtectedRoute roles={['super_admin', 'direttore']}>
            <StaffForm />
          </ProtectedRoute>
        } />

        {/* Cassa - Reception e Ristorante */}
        <Route path="/cassa" element={
          <ProtectedRoute roles={['super_admin', 'proprieta', 'direttore', 'reception', 'sala']}>
            <CassaPage />
          </ProtectedRoute>
        } />

        {/* Impostazioni */}
        <Route path="/impostazioni" element={
          <ProtectedRoute roles={['super_admin', 'direttore']}>
            <SettingsPage />
          </ProtectedRoute>
        } />

        {/* Gestione utenti - solo Super Admin */}
        <Route path="/utenti" element={
          <ProtectedRoute roles={['super_admin']}>
            <UserManagement />
          </ProtectedRoute>
        } />

        {/* Profilo personale - tutti gli utenti autenticati */}
        <Route path="/profilo" element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/prenotazioni" replace />} />

      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
