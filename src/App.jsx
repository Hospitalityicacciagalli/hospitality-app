import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import CustomerList from './pages/CustomerList'
import CustomerForm from './pages/CustomerForm'
import CustomerDetail from './pages/CustomerDetail'
import ReservationCalendar from './pages/ReservationCalendar'
import ReservationDay from './pages/ReservationDay'
import ReservationForm from './pages/ReservationForm'
import UserManagement from './pages/UserManagement'

function ProtectedRoutes() {
  var auth = useAuth()

  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-wine-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">C</span>
          </div>
          <p className="text-gray-500">Caricamento...</p>
        </div>
      </div>
    )
  }

  if (!auth.session) {
    return <LoginPage />
  }

  if (auth.profile && !auth.profile.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-2xl font-bold">!</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Account disattivato</h1>
          <p className="text-gray-500 mb-4">Il tuo account e stato disattivato. Contatta il Super Admin per riattivarlo.</p>
          <button
            onClick={function() { auth.signOut() }}
            className="bg-wine-700 text-white px-6 py-3 rounded-lg hover:bg-wine-800 transition-colors font-medium"
          >
            Esci
          </button>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/clienti" replace />} />
        <Route path="clienti" element={<CustomerList />} />
        <Route path="clienti/nuovo" element={<CustomerForm />} />
        <Route path="clienti/:id" element={<CustomerDetail />} />
        <Route path="clienti/:id/modifica" element={<CustomerForm />} />
        <Route path="prenotazioni" element={<ReservationCalendar />} />
        <Route path="prenotazioni/giorno/:date" element={<ReservationDay />} />
        <Route path="prenotazioni/nuova" element={<ReservationForm />} />
        <Route path="prenotazioni/:id/modifica" element={<ReservationForm />} />
        <Route path="utenti" element={<UserManagement />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProtectedRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
