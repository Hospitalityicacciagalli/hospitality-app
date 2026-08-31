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
import CessazioneDipendentePage from './pages/CessazioneDipendentePage';
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
import StipendiGiornatePage from './pages/StipendiGiornatePage';
import GiftCardPage from './pages/GiftCardPage';
import WineTourPage from './pages/WineTourPage';
import CookingClassPage from './pages/CookingClassPage';
import ImportPrenotazioniPage from './pages/ImportPrenotazioniPage';
import NormalizzaPrenotazioniPage from './pages/NormalizzaPrenotazioniPage';
import LimitiPage from './pages/LimitiPage';
import HicDashboardPage from './pages/hic/HicDashboardPage';
import CamereOggiPage from './pages/hic/CamereOggiPage';
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

// /cassa apre la PRIMA cassa che l'utente puo' vedere (permessi separati
// cassa_reception / cassa_ristorante). Se non ne vede nessuna, torna a home.
function CassaIndexRedirect() {
  var { canView } = useAuth();
  if (canView('cassa_reception')) return <Navigate to="/cassa/reception" replace />;
  if (canView('cassa_ristorante')) return <Navigate to="/cassa/ristorante" replace />;
  return <Navigate to="/" replace />;
}

// Dashboard HotelInCloud: si apre con hic_operativo OPPURE con
// hic_economico. La pagina filtra da se' le schede da mostrare, quindi
// chi ha un permesso solo entra lo stesso e vede le sue. Chi non ne ha
// nessuno dei due torna a home.
function HicRoute() {
  var { canView } = useAuth();
  if (!canView('hic_operativo') && !canView('hic_economico')) {
    return <Navigate to="/" replace />;
  }
  return <HicDashboardPage />;
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

        {/* Normalizza prenotazioni — l'elenco che indica dove la camera o
            il codice gift card stanno scritti a mano nelle note. La pagina
            non normalizza niente: apre la prenotazione, una alla volta.
            Nessuna chiave di permesso nuova: chi puo' MODIFICARE una
            prenotazione puo' normalizzarla, e il pannello mostra la parte
            gift card solo a chi ha anche quel permesso. */}
        <Route path="/prenotazioni/normalizza" element={
          <ProtectedRoute feature="prenotazioni" requireEdit>
            <NormalizzaPrenotazioniPage />
          </ProtectedRoute>
        } />

        {/* Limiti coperti per giorno/fascia — permesso dedicato */}
        <Route path="/limiti" element={
          <ProtectedRoute feature="limiti">
            <LimitiPage />
          </ProtectedRoute>
        } />

        {/* Dashboard HotelInCloud — specchio di camere e soggiorni, sola
            lettura. Le aggregazioni arrivano gia' fatte dalle funzioni SQL
            delle migrazioni 32, 33 e 34: la pagina non somma niente. */}
        <Route path="/camere" element={
          <ProtectedRoute>
            <HicRoute />
          </ProtectedRoute>
        } />

        {/* Camere e colazioni — l'operativo del giorno, sotto hic_operativo.
            Distinta da /camere per USO: quella e' analisi ed economia,
            questa dice chi dorme stanotte e quante colazioni servire.
            I numeri arrivano gia' fatti dalle funzioni della migrazione
            46 (hic_camere_notte / hic_camere_notte_totale): la pagina non
            somma niente e la regola di chi conta come presente resta in
            hic_perimetro_ok, in una copia sola. */}
        <Route path="/camere/oggi" element={
          <ProtectedRoute feature="hic_operativo">
            <CamereOggiPage />
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
        {/* ⚠️ Prima di /staff/:id, altrimenti "cessazione" verrebbe
            interpretata come l'id di un dipendente e la pagina
            risponderebbe "Dipendente non trovato".
            Chiude il rapporto di lavoro da UniLav o a mano: scrive data,
            motivo, protocollo e origine (migrazione 47), sostituisce la
            scadenza contratto conservando quella prevista, e spegne
            is_active. NON tocca stip_profili.attivo, perche' l'ultima
            busta — quella del TFR — si carica il mese dopo. */}
        <Route path="/staff/cessazione" element={
          <ProtectedRoute feature="staff" requireEdit>
            <CessazioneDipendentePage />
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

        {/* Cassa (nuova) — due casse separate, ognuna con permesso proprio.
            /cassa apre la prima cassa visibile all'utente. */}
        <Route path="/cassa" element={
          <ProtectedRoute>
            <CassaIndexRedirect />
          </ProtectedRoute>
        } />
        <Route path="/cassa/reception" element={
          <ProtectedRoute feature="cassa_reception">
            <CassaNuovaPage quale="reception" />
          </ProtectedRoute>
        } />
        <Route path="/cassa/ristorante" element={
          <ProtectedRoute feature="cassa_ristorante">
            <CassaNuovaPage quale="ristorante" />
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

        {/* Cassa OLD (congelata, sola consultazione). Dopo lo split del
            permesso cassa la proteggiamo con cassa_reception: chi aveva la
            cassa la ritrova (la migrazione copia il vecchio valore in
            entrambe le nuove chiavi). */}
        <Route path="/cassa-old" element={
          <ProtectedRoute feature="cassa_reception">
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
        <Route path="/stipendi/giornate" element={
          <ProtectedRoute feature="stipendi">
            <StipendiGiornatePage />
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

        {/* Campagna: ogni sotto-pagina ha il suo permesso indipendente.
            /campagna reindirizza al Riepilogo (chi non lo vede usa le
            voci di menu' della sotto-pagina che gli e' concessa). */}
        <Route path="/campagna" element={
          <ProtectedRoute feature="campagna_riepilogo">
            <Navigate to="/campagna/riepilogo" replace />
          </ProtectedRoute>
        } />
        <Route path="/campagna/riepilogo" element={
          <ProtectedRoute feature="campagna_riepilogo">
            <CampagnaRiepilogoPage />
          </ProtectedRoute>
        } />
        <Route path="/campagna/importa" element={
          <ProtectedRoute feature="campagna_importa">
            <CampagnaImportaPage />
          </ProtectedRoute>
        } />
        <Route path="/campagna/stipendi" element={
          <ProtectedRoute feature="campagna_stipendi">
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
