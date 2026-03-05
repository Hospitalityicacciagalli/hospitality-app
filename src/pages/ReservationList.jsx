import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, ChevronLeft, ChevronRight, Users, Clock, Phone, AlertTriangle, CalendarDays } from 'lucide-react'
import { supabase } from '../lib/supabase'

function formatDateISO(date) {
  var y = date.getFullYear()
  var m = String(date.getMonth() + 1).padStart(2, '0')
  var d = String(date.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function formatDateDisplay(date) {
  var options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
  return date.toLocaleDateString('it-IT', options)
}

function ReservationList() {
  var dateState = useState(new Date())
  var selectedDate = dateState[0]
  var setSelectedDate = dateState[1]

  var mealState = useState('lunch')
  var selectedMeal = mealState[0]
  var setSelectedMeal = mealState[1]

  var reservationsState = useState([])
  var reservations = reservationsState[0]
  var setReservations = reservationsState[1]

  var loadingState = useState(true)
  var loading = loadingState[0]
  var setLoading = loadingState[1]

  var summaryState = useState({ total_covers: 0, total_reservations: 0 })
  var summary = summaryState[0]
  var setSummary = summaryState[1]

  var settingsState = useState({ max_covers_lunch: 60, max_covers_dinner: 60 })
  var settings = settingsState[0]
  var setSettings = settingsState[1]

  var navigate = useNavigate()

  useEffect(function() {
    loadSettings()
  }, [])

  useEffect(function() {
    loadReservations()
  }, [selectedDate, selectedMeal])

  function loadSettings() {
    supabase
      .from('restaurant_settings')
      .select('*')
      .limit(1)
      .single()
      .then(function(result) {
        if (!result.error && result.data) {
          setSettings(result.data)
        }
      })
  }

  function loadReservations() {
    setLoading(true)
    var dateStr = formatDateISO(selectedDate)

    supabase
      .from('reservations')
      .select('*, customers(id, first_name, last_name, phone, email, category)')
      .eq('reservation_date', dateStr)
      .eq('meal_type', selectedMeal)
      .order('requested_time', { ascending: true, nullsFirst: false })
      .then(function(result) {
        if (result.error) {
          console.error('Errore caricamento prenotazioni:', result.error)
          setReservations([])
        } else {
          setReservations(result.data || [])
        }

        // Carica anche il riepilogo coperti
        return supabase
          .from('reservations')
          .select('guests_count')
          .eq('reservation_date', dateStr)
          .eq('meal_type', selectedMeal)
          .not('status', 'in', '("cancelled")')
      })
      .then(function(result) {
        if (!result.error && result.data) {
          var totalCovers = 0
          var totalRes = result.data.length
          for (var i = 0; i < result.data.length; i++) {
            totalCovers += result.data[i].guests_count
          }
          setSummary({ total_covers: totalCovers, total_reservations: totalRes })
        }
        setLoading(false)
      })
  }

  function changeDate(days) {
    var newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + days)
    setSelectedDate(newDate)
  }

  function goToToday() {
    setSelectedDate(new Date())
  }

  function updateStatus(reservationId, newStatus) {
    supabase
      .from('reservations')
      .update({ status: newStatus })
      .eq('id', reservationId)
      .then(function(result) {
        if (result.error) {
          alert('Errore aggiornamento stato.')
        } else {
          loadReservations()
        }
      })
  }

  var maxCovers = selectedMeal === 'lunch' ? settings.max_covers_lunch : settings.max_covers_dinner
  var remainingCovers = maxCovers - summary.total_covers
  var isToday = formatDateISO(selectedDate) === formatDateISO(new Date())

  var statusLabels = {
    confirmed: 'Confermata',
    arrived: 'Arrivato',
    seated: 'Accomodato',
    completed: 'Completato',
    cancelled: 'Cancellata',
    no_show: 'No Show'
  }

  var statusColors = {
    confirmed: 'bg-blue-100 text-blue-800',
    arrived: 'bg-yellow-100 text-yellow-800',
    seated: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-800',
    no_show: 'bg-orange-100 text-orange-800'
  }

  var categoryColors = {
    standard: 'bg-gray-100 text-gray-700',
    vip: 'bg-amber-100 text-amber-800',
    press: 'bg-purple-100 text-purple-800',
    business: 'bg-blue-100 text-blue-800',
    hotel_guest: 'bg-green-100 text-green-800'
  }

  var categoryLabels = {
    standard: 'Standard',
    vip: 'VIP',
    press: 'Stampa',
    business: 'Business',
    hotel_guest: 'Ospite Hotel'
  }

  // Filtra prenotazioni attive (non cancellate)
  var activeReservations = reservations.filter(function(r) {
    return r.status !== 'cancelled'
  })

  var cancelledReservations = reservations.filter(function(r) {
    return r.status === 'cancelled'
  })

  return (
    <div>
      {/* Intestazione */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prenotazioni</h1>
        </div>
        <Link
          to="/prenotazioni/nuova"
          className="inline-flex items-center gap-2 bg-wine-700 text-white px-5 py-3 rounded-xl hover:bg-wine-800 transition-colors font-medium shadow-sm"
        >
          <Plus size={20} />
          <span>Nuova Prenotazione</span>
        </Link>
      </div>

      {/* Navigazione data */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between">
          <button
            onClick={function() { changeDate(-1) }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="text-center">
            <p className="text-lg font-semibold text-gray-900 capitalize">
              {formatDateDisplay(selectedDate)}
            </p>
            {!isToday && (
              <button
                onClick={goToToday}
                className="text-sm text-wine-600 hover:text-wine-800 mt-1"
              >
                Torna a oggi
              </button>
            )}
          </div>

          <button
            onClick={function() { changeDate(1) }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Selettore data diretta */}
        <div className="mt-3 flex justify-center">
          <input
            type="date"
            value={formatDateISO(selectedDate)}
            onChange={function(e) { setSelectedDate(new Date(e.target.value + 'T12:00:00')) }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
          />
        </div>
      </div>

      {/* Tabs Pranzo / Cena */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={function() { setSelectedMeal('lunch') }}
          className={
            "flex-1 py-3 px-4 rounded-xl font-medium text-center transition-colors " +
            (selectedMeal === 'lunch'
              ? "bg-wine-700 text-white shadow-sm"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50")
          }
        >
          Pranzo (12:30 - 15:00)
        </button>
        <button
          onClick={function() { setSelectedMeal('dinner') }}
          className={
            "flex-1 py-3 px-4 rounded-xl font-medium text-center transition-colors " +
            (selectedMeal === 'dinner'
              ? "bg-wine-700 text-white shadow-sm"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50")
          }
        >
          Cena (19:30 - 23:00)
        </button>
      </div>

      {/* Riepilogo coperti */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-sm text-gray-500">Prenotazioni</p>
              <p className="text-2xl font-bold text-gray-900">{summary.total_reservations}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Coperti</p>
              <p className="text-2xl font-bold text-gray-900">{summary.total_covers}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Disponibili</p>
              <p className={"text-2xl font-bold " + (remainingCovers < 10 ? "text-red-600" : "text-green-600")}>
                {remainingCovers}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Max coperti</p>
            <p className="text-lg font-semibold text-gray-700">{maxCovers}</p>
          </div>
        </div>

        {/* Barra progresso coperti */}
        <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
          <div
            className={"h-2 rounded-full transition-all " + (remainingCovers < 10 ? "bg-red-500" : "bg-wine-600")}
            style={{ width: Math.min((summary.total_covers / maxCovers) * 100, 100) + '%' }}
          />
        </div>
      </div>

      {/* Lista prenotazioni */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-gray-500">Caricamento prenotazioni...</p>
        </div>
      ) : activeReservations.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <CalendarDays className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 text-lg">
            Nessuna prenotazione per questo turno
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeReservations.map(function(res) {
            var customer = res.customers
            var timeStr = res.requested_time ? res.requested_time.substring(0, 5) : null

            return (
              <div
                key={res.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:border-wine-300 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Riga nome e badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">
                        {customer.last_name} {customer.first_name}
                      </h3>
                      {customer.category !== 'standard' && (
                        <span className={"px-2 py-0.5 rounded-full text-xs font-medium " + categoryColors[customer.category]}>
                          {categoryLabels[customer.category]}
                        </span>
                      )}
                      {res.has_allergen_alerts && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          <AlertTriangle size={12} />
                          Allergeni
                        </span>
                      )}
                    </div>

                    {/* Info prenotazione */}
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Users size={14} />
                        {res.guests_count} {res.guests_count === 1 ? 'persona' : 'persone'}
                      </span>
                      {timeStr && (
                        <span className="flex items-center gap-1">
                          <Clock size={14} />
                          {timeStr}
                        </span>
                      )}
                      {customer.phone && (
                        <a
                          href={"tel:" + customer.phone}
                          className="flex items-center gap-1 hover:text-wine-700"
                          onClick={function(e) { e.stopPropagation() }}
                        >
                          <Phone size={14} />
                          {customer.phone}
                        </a>
                      )}
                    </div>

                    {/* Note e richieste speciali */}
                    {res.notes && (
                      <p className="text-sm text-gray-600 mt-2">{res.notes}</p>
                    )}
                    {res.special_requests && (
                      <p className="text-sm text-orange-600 mt-1">{"★ " + res.special_requests}</p>
                    )}
                    {res.table_info && (
                      <p className="text-sm text-gray-500 mt-1">{"Tavolo: " + res.table_info}</p>
                    )}
                  </div>

                  {/* Stato e azioni */}
                  <div className="flex flex-col items-end gap-2">
                    <span className={"px-3 py-1 rounded-full text-xs font-medium " + statusColors[res.status]}>
                      {statusLabels[res.status]}
                    </span>

                    <div className="flex gap-1 flex-wrap justify-end">
                      {res.status === 'confirmed' && (
                        <button
                          onClick={function() { updateStatus(res.id, 'arrived') }}
                          className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 rounded border border-yellow-200 hover:bg-yellow-100"
                        >
                          Arrivato
                        </button>
                      )}
                      {res.status === 'arrived' && (
                        <button
                          onClick={function() { updateStatus(res.id, 'seated') }}
                          className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded border border-green-200 hover:bg-green-100"
                        >
                          Accomodato
                        </button>
                      )}
                      {res.status === 'seated' && (
                        <button
                          onClick={function() { updateStatus(res.id, 'completed') }}
                          className="text-xs px-2 py-1 bg-gray-50 text-gray-700 rounded border border-gray-200 hover:bg-gray-100"
                        >
                          Completato
                        </button>
                      )}
                      {(res.status === 'confirmed' || res.status === 'arrived') && (
                        <button
                          onClick={function() { updateStatus(res.id, 'no_show') }}
                          className="text-xs px-2 py-1 bg-orange-50 text-orange-700 rounded border border-orange-200 hover:bg-orange-100"
                        >
                          No Show
                        </button>
                      )}
                      {res.status === 'confirmed' && (
                        <button
                          onClick={function() { updateStatus(res.id, 'cancelled') }}
                          className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded border border-red-200 hover:bg-red-100"
                        >
                          Cancella
                        </button>
                      )}
                      <button
                        onClick={function() { navigate("/prenotazioni/" + res.id + "/modifica") }}
                        className="text-xs px-2 py-1 bg-wine-50 text-wine-700 rounded border border-wine-200 hover:bg-wine-100"
                      >
                        Modifica
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Prenotazioni cancellate (collassabili) */}
      {cancelledReservations.length > 0 && (
        <details className="mt-6">
          <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-600">
            {cancelledReservations.length} {cancelledReservations.length === 1 ? 'prenotazione cancellata' : 'prenotazioni cancellate'}
          </summary>
          <div className="mt-2 space-y-2 opacity-60">
            {cancelledReservations.map(function(res) {
              var customer = res.customers
              return (
                <div key={res.id} className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 line-through">
                      {customer.last_name} {customer.first_name} - {res.guests_count} persone
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">
                      Cancellata
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </details>
      )}

      <div className="h-8" />
    </div>
  )
}

export default ReservationList
