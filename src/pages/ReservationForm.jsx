import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Search, AlertTriangle, UserPlus, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'

function formatDateISO(date) {
  var y = date.getFullYear()
  var m = String(date.getMonth() + 1).padStart(2, '0')
  var d = String(date.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function ReservationForm() {
  var params = useParams()
  var id = params.id
  var navigate = useNavigate()
  var isEditing = Boolean(id)

  var loadingState = useState(false)
  var loading = loadingState[0]
  var setLoading = loadingState[1]

  var savingState = useState(false)
  var saving = savingState[0]
  var setSaving = savingState[1]

  // Ricerca cliente
  var searchState = useState('')
  var customerSearch = searchState[0]
  var setCustomerSearch = searchState[1]

  var resultsState = useState([])
  var searchResults = resultsState[0]
  var setSearchResults = resultsState[1]

  var selectedCustomerState = useState(null)
  var selectedCustomer = selectedCustomerState[0]
  var setSelectedCustomer = selectedCustomerState[1]

  var allergensState = useState([])
  var customerAllergens = allergensState[0]
  var setCustomerAllergens = allergensState[1]

  var showSearchState = useState(true)
  var showSearch = showSearchState[0]
  var setShowSearch = showSearchState[1]

  // Disponibilita
  var availabilityState = useState(null)
  var availability = availabilityState[0]
  var setAvailability = availabilityState[1]

  // Dati prenotazione
  var formState = useState({
    reservation_date: formatDateISO(new Date()),
    meal_type: 'dinner',
    requested_time: '',
    guests_count: 2,
    table_info: '',
    notes: '',
    special_requests: '',
    source: 'manual'
  })
  var formData = formState[0]
  var setFormData = formState[1]

  useEffect(function() {
    if (isEditing) {
      loadReservation()
    }
  }, [id])

  useEffect(function() {
    if (formData.reservation_date && formData.meal_type) {
      checkAvailability()
    }
  }, [formData.reservation_date, formData.meal_type, formData.guests_count])

  function loadReservation() {
    setLoading(true)
    supabase
      .from('reservations')
      .select('*, customers(id, first_name, last_name, phone, email, category)')
      .eq('id', id)
      .single()
      .then(function(result) {
        if (result.error) {
          alert('Prenotazione non trovata.')
          navigate('/prenotazioni')
          return
        }
        var res = result.data
        setFormData({
          reservation_date: res.reservation_date,
          meal_type: res.meal_type,
          requested_time: res.requested_time || '',
          guests_count: res.guests_count,
          table_info: res.table_info || '',
          notes: res.notes || '',
          special_requests: res.special_requests || '',
          source: res.source || 'manual'
        })
        setSelectedCustomer(res.customers)
        setShowSearch(false)
        loadCustomerAllergens(res.customers.id)
        setLoading(false)
      })
  }

  function searchCustomers(query) {
    setCustomerSearch(query)
    if (query.length < 2) {
      setSearchResults([])
      return
    }

    supabase
      .from('customers')
      .select('id, first_name, last_name, phone, email, category')
      .eq('is_active', true)
      .or('last_name.ilike.%' + query + '%,first_name.ilike.%' + query + '%,phone.ilike.%' + query + '%,email.ilike.%' + query + '%')
      .order('last_name')
      .limit(10)
      .then(function(result) {
        if (!result.error) {
          setSearchResults(result.data || [])
        }
      })
  }

  function selectCustomer(customer) {
    setSelectedCustomer(customer)
    setShowSearch(false)
    setSearchResults([])
    setCustomerSearch('')
    loadCustomerAllergens(customer.id)
  }

  function loadCustomerAllergens(customerId) {
    supabase
      .from('customer_allergens')
      .select('severity, allergens(id, name, icon)')
      .eq('customer_id', customerId)
      .then(function(result) {
        if (!result.error) {
          setCustomerAllergens(result.data || [])
        }
      })
  }

  function checkAvailability() {
    supabase
      .rpc('check_availability', {
        p_date: formData.reservation_date,
        p_meal_type: formData.meal_type,
        p_guests: formData.guests_count
      })
      .then(function(result) {
        if (!result.error && result.data && result.data.length > 0) {
          setAvailability(result.data[0])
        }
      })
  }

  function handleInputChange(e) {
    var name = e.target.name
    var value = e.target.value
    if (name === 'guests_count') {
      value = parseInt(value) || 1
    }
    setFormData(function(prev) {
      var updated = {}
      for (var key in prev) {
        updated[key] = prev[key]
      }
      updated[name] = value
      return updated
    })
  }

  function handleSubmit(e) {
    e.preventDefault()

    if (!selectedCustomer) {
      alert('Seleziona un cliente per la prenotazione.')
      return
    }

    if (!formData.reservation_date) {
      alert('Seleziona una data.')
      return
    }

    if (formData.guests_count < 1) {
      alert('Il numero di persone deve essere almeno 1.')
      return
    }

    if (availability && !availability.is_available) {
      var conferma = window.confirm(
        'Attenzione: i coperti disponibili (' + availability.remaining_covers + ') non sono sufficienti per ' + formData.guests_count + ' persone. Vuoi procedere comunque?'
      )
      if (!conferma) return
    }

    setSaving(true)

    var reservationData = {
      customer_id: selectedCustomer.id,
      reservation_date: formData.reservation_date,
      meal_type: formData.meal_type,
      requested_time: formData.requested_time || null,
      guests_count: formData.guests_count,
      table_info: formData.table_info || null,
      notes: formData.notes || null,
      special_requests: formData.special_requests || null,
      source: formData.source,
      has_allergen_alerts: customerAllergens.length > 0
    }

    var promise
    if (isEditing) {
      promise = supabase
        .from('reservations')
        .update(reservationData)
        .eq('id', id)
    } else {
      promise = supabase
        .from('reservations')
        .insert(reservationData)
    }

    promise.then(function(result) {
      if (result.error) {
        console.error('Errore salvataggio:', result.error)
        alert('Errore nel salvataggio. Riprova.')
      } else {
        navigate('/prenotazioni')
      }
      setSaving(false)
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-lg">Caricamento...</div>
      </div>
    )
  }

  var mealLabel = formData.meal_type === 'lunch' ? 'Pranzo' : 'Cena'

  return (
    <div className="max-w-3xl mx-auto">
      {/* Intestazione */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={function() { navigate(-1) }}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditing ? 'Modifica Prenotazione' : 'Nuova Prenotazione'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Selezione cliente */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Cliente</h2>

          {selectedCustomer && !showSearch ? (
            <div>
              <div className="flex items-center justify-between p-4 bg-wine-50 rounded-lg border border-wine-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-wine-200 text-wine-800 flex items-center justify-center font-bold">
                    {selectedCustomer.first_name[0]}{selectedCustomer.last_name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {selectedCustomer.first_name} {selectedCustomer.last_name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {selectedCustomer.phone || selectedCustomer.email || 'Nessun contatto'}
                    </p>
                  </div>
                  <Check size={20} className="text-green-600" />
                </div>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={function() { setShowSearch(true); setSelectedCustomer(null); setCustomerAllergens([]) }}
                    className="text-sm text-wine-600 hover:text-wine-800"
                  >
                    Cambia
                  </button>
                )}
              </div>

              {/* Allergeni del cliente */}
              {customerAllergens.length > 0 && (
                <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-red-600" />
                    <span className="text-sm font-medium text-red-800">Attenzione: allergeni segnalati</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {customerAllergens.map(function(ca, idx) {
                      return (
                        <span key={idx} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                          {ca.allergens.icon} {ca.allergens.name}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Cerca cliente per nome, telefono o email..."
                  value={customerSearch}
                  onChange={function(e) { searchCustomers(e.target.value) }}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                  autoFocus
                />
              </div>

              {/* Risultati ricerca */}
              {searchResults.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                  {searchResults.map(function(customer) {
                    return (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={function() { selectCustomer(customer) }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {customer.first_name[0]}{customer.last_name[0]}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {customer.last_name} {customer.first_name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {customer.phone || customer.email || ''}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {customerSearch.length >= 2 && searchResults.length === 0 && (
                <div className="mt-3 text-center py-4">
                  <p className="text-gray-500 text-sm mb-2">Nessun cliente trovato</p>
                  <button
                    type="button"
                    onClick={function() { navigate('/clienti/nuovo') }}
                    className="inline-flex items-center gap-2 text-wine-600 hover:text-wine-800 text-sm font-medium"
                  >
                    <UserPlus size={16} />
                    Registra nuovo cliente
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dettagli prenotazione */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Dettagli Prenotazione</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="reservation_date"
                value={formData.reservation_date}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Turno <span className="text-red-500">*</span>
              </label>
              <select
                name="meal_type"
                value={formData.meal_type}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white text-base"
              >
                <option value="lunch">Pranzo (12:30 - 15:00)</option>
                <option value="dinner">Cena (19:30 - 23:00)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Orario richiesto
              </label>
              <input
                type="time"
                name="requested_time"
                value={formData.requested_time}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Numero persone <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="guests_count"
                value={formData.guests_count}
                onChange={handleInputChange}
                min="1"
                max="200"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tavolo
              </label>
              <input
                type="text"
                name="table_info"
                value={formData.table_info}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                placeholder="Es: Tavolo 5, Terrazza"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fonte
              </label>
              <select
                name="source"
                value={formData.source}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white text-base"
              >
                <option value="manual">Inserimento manuale</option>
                <option value="phone">Telefono</option>
                <option value="email">Email</option>
                <option value="website">Sito web</option>
                <option value="hotel_in_cloud">Hotel in Cloud</option>
              </select>
            </div>
          </div>

          {/* Disponibilita */}
          {availability && (
            <div className={"mt-4 p-3 rounded-lg border " + (availability.is_available ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200")}>
              <p className={"text-sm font-medium " + (availability.is_available ? "text-green-800" : "text-red-800")}>
                {availability.is_available
                  ? mealLabel + ": " + availability.remaining_covers + " coperti ancora disponibili su " + availability.max_covers
                  : "Attenzione: solo " + availability.remaining_covers + " coperti disponibili su " + availability.max_covers + " per " + formData.guests_count + " persone richieste"}
              </p>
            </div>
          )}

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
              placeholder="Note interne sulla prenotazione"
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Richieste speciali
            </label>
            <textarea
              name="special_requests"
              value={formData.special_requests}
              onChange={handleInputChange}
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
              placeholder="Es: compleanno, menu vegano, seggiolone..."
            />
          </div>
        </div>

        {/* Pulsanti */}
        <div className="flex flex-col sm:flex-row gap-3 pb-8">
          <button
            type="submit"
            disabled={saving || !selectedCustomer}
            className="flex-1 flex items-center justify-center gap-2 bg-wine-700 text-white px-6 py-4 rounded-xl hover:bg-wine-800 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-base"
          >
            <Save size={20} />
            <span>{saving ? 'Salvataggio...' : (isEditing ? 'Salva Modifiche' : 'Conferma Prenotazione')}</span>
          </button>
          <button
            type="button"
            onClick={function() { navigate(-1) }}
            className="px-6 py-4 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium text-gray-700 text-base"
          >
            Annulla
          </button>
        </div>
      </form>
    </div>
  )
}

export default ReservationForm
