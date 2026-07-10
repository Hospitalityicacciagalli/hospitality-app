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
import CassaNuovaPage from './pages/CassaNuovaPage';
import CassafortePage from './pages/CassafortePage';
import GestioneVariabiliCassa from './pages/GestioneVariabiliCassa';
import CentriCostoPage from './pages/CentriCostoPage';
import SalePage from './pages/SalePage';
import OrdiniBordoPage from './pages/OrdiniBordoPage';
import ListinoBordoPage from './pages/ListinoBordoPage';
import OrdineBordoPubblico from './pages/OrdineBordoPubblico';
import StipendiMesePage from './pages/StipendiMesePage';
import StipendiDipendentiPage from './pages/StipendiDipendentiPage';
import StipendioDipendenteDetail from './pages/StipendioDipendenteDetail';
import BustePagaPage from './pages/BustePagaPage';
import GiftCardPage from './pages/GiftCardPage';
import WineTourPage from './pages/WineTourPage';
import CookingClassPage from './pages/CookingClassPage';
import ImportPrenotazioniPage from './pages/ImportPrenotazioniPage';
import LimitiPage from './pages/LimitiPage';
import CampagnaImportaPage from './pages/CampagnaImportaPage';
import CampagnaRiepilogoPage from './pages/CampagnaRiepilogoPage';
import CampagnaStipendiPage from './pages/CampagnaStipendiPage';

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

        {/* Import prenotazioni storiche da file — permesso dedicato */}
        <Route path="/prenotazioni/importa" element={
          <ProtectedRoute feature="importa_prenotazioni">
            <ImportPrenotazioniPage />
          </ProtectedRoute>
        } />

        {/* Limiti coperti per giorno/fascia — permesso dedicato */}
        <Route path="/limiti" element={
          <ProtectedRoute feature="limiti">
            <LimitiPage />
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

        {/* Cassa (nuova) — due casse separate via URL */}
        <Route path="/cassa" element={
          <ProtectedRoute feature="cassa">
            <Navigate to="/cassa/reception" replace />
          </ProtectedRoute>
        } />
        <Route path="/cassa/:quale" element={
          <ProtectedRoute feature="cassa">
            <CassaNuovaPage />
          </ProtectedRoute>
        } />

        {/* Cassaforte — pagina dedicata, permesso proprio */}
        <Route path="/cassaforte" element={
          <ProtectedRoute feature="cassaforte">
            <CassafortePage />
          </ProtectedRoute>
        } />

        {/* Gestione variabili cassa: sale, tavoli, centri di costo */}
        <Route path="/variabili-cassa" element={
          <ProtectedRoute feature="variabili_cassa">
            <GestioneVariabiliCassa />
          </ProtectedRoute>
        } />

        {/* Dashboard centri di costo + revisore */}
        <Route path="/centri-costo" element={
          <ProtectedRoute feature="centri_costo">
            <CentriCostoPage />
          </ProtectedRoute>
        } />

        {/* Cassa OLD (congelata, sola consultazione) */}
        <Route path="/cassa-old" element={
          <ProtectedRoute feature="cassa">
            <CassaPage />
          </ProtectedRoute>
        } />

        {/* Ordini Bordo (staff) */}
        <Route path="/ordini-bordo" element={
          <ProtectedRoute feature="ordini_bordo">
            <OrdiniBordoPage />
          </ProtectedRoute>
        } />
        <Route path="/listino-bordo" element={
          <ProtectedRoute feature="listino_bordo">
            <ListinoBordoPage />
          </ProtectedRoute>
        } />

        {/* Gift Card ed esperienze collegate — ognuna con permesso dedicato. */}
        <Route path="/gift-card" element={
          <ProtectedRoute feature="gift_card">
            <GiftCardPage />
          </ProtectedRoute>
        } />
        <Route path="/wine-tour" element={
          <ProtectedRoute feature="wine_tour">
            <WineTourPage />
          </ProtectedRoute>
        } />
        <Route path="/cooking-class" element={
          <ProtectedRoute feature="cooking_class">
            <CookingClassPage />
          </ProtectedRoute>
        } />

        {/* Stipendi: la pagina principale e' il mese */}
        <Route path="/stipendi" element={
          <ProtectedRoute feature="stipendi">
            <Navigate to="/stipendi/mese" replace />
          </ProtectedRoute>
        } />
        <Route path="/stipendi/mese" element={
          <ProtectedRoute feature="stipendi">
            <StipendiMesePage />
          </ProtectedRoute>
        } />
        <Route path="/stipendi/buste" element={
          <ProtectedRoute feature="stipendi">
            <BustePagaPage />
          </ProtectedRoute>
        } />
        <Route path="/stipendi/dipendenti" element={
          <ProtectedRoute feature="stipendi">
            <StipendiDipendentiPage />
          </ProtectedRoute>
        } />
        <Route path="/stipendi/dipendenti/:id" element={
          <ProtectedRoute feature="stipendi">
            <StipendioDipendenteDetail />
          </ProtectedRoute>
        } />

        {/* Campagna: pagina principale e' il riepilogo (dashboard) */}
        <Route path="/campagna" element={
          <ProtectedRoute feature="campagna">
            <Navigate to="/campagna/riepilogo" replace />
          </ProtectedRoute>
        } />
        <Route path="/campagna/riepilogo" element={
          <ProtectedRoute feature="campagna">
            <CampagnaRiepilogoPage />
          </ProtectedRoute>
        } />
        <Route path="/campagna/importa" element={
          <ProtectedRoute feature="campagna" requireEdit>
            <CampagnaImportaPage />
          </ProtectedRoute>
        } />
        <Route path="/campagna/stipendi" element={
          <ProtectedRoute feature="campagna" requireEdit>
            <CampagnaStipendiPage />
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

        {/* Profilo personale */}
        <Route path="/profilo" element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/prenotazioni" replace />} />

      </Routes>
    </Layout>
  );
}

export default function App() {
  if (typeof window !== 'undefined' && window.location.pathname === '/ordina') {
    return <OrdineBordoPubblico />;
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
