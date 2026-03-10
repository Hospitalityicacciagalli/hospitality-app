import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import CustomerList from "./pages/CustomerList";
import CustomerForm from "./pages/CustomerForm";
import CustomerDetail from "./pages/CustomerDetail";
import ReservationCalendar from "./pages/ReservationCalendar";
import ReservationDay from "./pages/ReservationDay";
import ReservationForm from "./pages/ReservationForm";
import UserManagement from "./pages/UserManagement";
import StaffList from "./pages/StaffList";
import StaffForm from "./pages/StaffForm";
import StaffDetail from "./pages/StaffDetail";

function ProtectedRoutes() {
  var { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ color: "#7c2d12", fontSize: "18px" }}>Caricamento...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/prenotazioni" replace />} />

        {/* Clienti */}
        <Route path="/clienti" element={<CustomerList />} />
        <Route path="/clienti/nuovo" element={<CustomerForm />} />
        <Route path="/clienti/:id" element={<CustomerDetail />} />
        <Route path="/clienti/:id/modifica" element={<CustomerForm />} />

        {/* Prenotazioni */}
        <Route path="/prenotazioni" element={<ReservationCalendar />} />
        <Route path="/prenotazioni/:date" element={<ReservationDay />} />
        <Route path="/prenotazioni/:date/nuova" element={<ReservationForm />} />
        <Route path="/prenotazioni/:date/:id/modifica" element={<ReservationForm />} />

        {/* Staff — Modulo 3 */}
        <Route path="/staff" element={<StaffList />} />
        <Route path="/staff/nuovo" element={<StaffForm />} />
        <Route path="/staff/:id" element={<StaffDetail />} />
        <Route path="/staff/:id/modifica" element={<StaffForm />} />

        {/* Gestione utenti — solo Super Admin */}
        <Route path="/utenti" element={<UserManagement />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/prenotazioni" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
