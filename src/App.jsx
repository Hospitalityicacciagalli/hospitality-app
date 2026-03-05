import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import CustomerList from './pages/CustomerList'
import CustomerForm from './pages/CustomerForm'
import CustomerDetail from './pages/CustomerDetail'
import ReservationList from './pages/ReservationList'
import ReservationForm from './pages/ReservationForm'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/clienti" replace />} />
          <Route path="clienti" element={<CustomerList />} />
          <Route path="clienti/nuovo" element={<CustomerForm />} />
          <Route path="clienti/:id" element={<CustomerDetail />} />
          <Route path="clienti/:id/modifica" element={<CustomerForm />} />
          <Route path="prenotazioni" element={<ReservationList />} />
          <Route path="prenotazioni/nuova" element={<ReservationForm />} />
          <Route path="prenotazioni/:id/modifica" element={<ReservationForm />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
