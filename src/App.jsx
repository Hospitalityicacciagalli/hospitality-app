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
import ShiftsPage from './pages/ShiftsPage';
import SettingsPage from './pages/SettingsPage';
import UserManagement from './pages/UserManagement';
import ProfilePage from './pages/ProfilePage';
import CassaPage from './pages/CassaPage';
import SalePage from './pages/SalePage';

// ProtectedRoute basato sul nuovo sistema di permessi.
// - feature: chiave della funzione (es. 'clienti'); se assente, basta essere loggati.
// - requireEdit: se true, richiede il permesso di scrittura sulla funzione.
function ProtectedRoute({ children, feature, requireEdit }) {
  var { session, loading, canView, canEdit } = useAuth();

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

  if (feature) {
    var ok = requireEdit ? canEdit(feature) : canView(feature);
    if (!ok) {
      return <Navigate to="/" replace />;
    }
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
          <ProtectedRoute feature="clienti">
            <CustomerList />
          </ProtectedRoute>
        } />
        <Route path="/clienti/nuovo" element={
          <ProtectedRoute feature="clienti" requireEdit>
            <CustomerForm />
          </ProtectedRoute>
        } />
        <Route path="/clienti/:id" element={
          <ProtectedRoute feature="clienti">
            <CustomerDetail />
          </ProtectedRoute>
        } />
        <Route path="/clienti/:id/modifica" element={
          <ProtectedRoute feature="clienti" requireEdit>
            <CustomerForm />
          </ProtectedRoute>
        } />

        {/* Prenotazioni */}
        <Route path="/prenotazioni" element={
          <ProtectedRoute feature="prenotazioni">
            <ReservationCalendar />
          </ProtectedRoute>
        } />
        <Route path="/prenotazioni/giorno/:date" element={
          <ProtectedRoute feature="prenotazioni">
            <ReservationDay />
          </ProtectedRoute>
        } />
        <Route path="/prenotazioni/nuova" element={
          <ProtectedRoute feature="prenotazioni" requireEdit>
            <ReservationForm />
          </ProtectedRoute>
        } />
        <Route path="/prenotazioni/:id/modifica" element={
          <ProtectedRoute feature="prenotazioni" requireEdit>
            <ReservationForm />
          </ProtectedRoute>
        } />

        {/* Sale e Tavoli */}
        <Route path="/sale" element={
          <ProtectedRoute feature="sale">
            <SalePage />
          </ProtectedRoute>
        } />

        {/* Staff */}
        <Route path="/staff" element={
          <ProtectedRoute feature="staff">
            <StaffList />
          </ProtectedRoute>
        } />
        <Route path="/staff/nuovo" element={
          <ProtectedRoute feature="staff" requireEdit>
            <StaffForm />
          </ProtectedRoute>
        } />
        <Route path="/staff/:id" element={
          <ProtectedRoute feature="staff">
            <StaffDetail />
          </ProtectedRoute>
        } />
        <Route path="/staff/:id/modifica" element={
          <ProtectedRoute feature="staff" requireEdit>
            <StaffForm />
          </ProtectedRoute>
        } />

        {/* Turni del personale */}
        <Route path="/turni" element={
          <ProtectedRoute feature="turni">
            <ShiftsPage />
          </ProtectedRoute>
        } />

        {/* Cassa - Reception e Ristorante */}
        <Route path="/cassa" element={
          <ProtectedRoute feature="cassa">
            <CassaPage />
          </ProtectedRoute>
        } />

        {/* Impostazioni */}
        <Route path="/impostazioni" element={
          <ProtectedRoute feature="impostazioni">
            <SettingsPage />
          </ProtectedRoute>
        } />

        {/* Gestione utenti */}
        <Route path="/utenti" element={
          <ProtectedRoute feature="utenti">
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
