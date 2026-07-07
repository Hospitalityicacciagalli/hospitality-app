import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Save, Search, AlertTriangle, UserPlus, Check, Users, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import ConfermaPin from '../components/ConfermaPin'

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function formatDateISO(date) {
  var y = date.getFullYear()
  var m = String(date.getMonth() + 1).padStart(2, '0')
  var d = String(date.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function dataBreve(iso) {
  if (!iso) return ''
  var p = ('' + iso).split('-')
  if (p.length !== 3) return iso
  return p[2] + '/' + p[1] + '/' + p[0]
}

function due(n) { return n < 10 ? '0' + n : '' + n }

function fmtLogData(ts) {
  if (!ts) return ''
  var d = new Date(ts)
  return due(d.getDate()) + '/' + due(d.getMonth() + 1) + ' ' + due(d.getHours()) + ':' + due(d.getMinutes())
}

var HOURS = []
for (var h = 7; h <= 23; h++) { HOURS.push(h) }
var MINUTES = ['00', '15', '30', '45']

var MEAL_TYPES = [
  { value: 'lunch', label: 'Pranzo' },
  { value: 'dinner', label: 'Cena' }
]

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

function ReservationForm() {
  var params = useParams()
  var id = params.id
  var searchParamsResult = useSearchParams()
  var searchParams = searchParamsResult[0]
  var navigate = useNavigate()
  var isEditing = Boolean(id)

  var { user, profile, elevato, elevazione, attivaElevazione } = useAuth()

  var [showPinModal, setShowPinModal] = useState(false)
  var [pendingData, setPendingData] = useState(null)

  var [loading, setLoading] = useState(false)
  var [saving, setSaving] = useState(false)

  // Stato alert della fascia (coperti degli altri, alert manuale, spunta ok direttore)
  var [copertiAltri, setCopertiAltri] = useState(0)
  var [alertManuale, setAlertManuale] = useState(null)
  var [okDirettore, setOkDirettore] = useState(false)

  // Coperti prima della modifica (per il log), storia della prenotazione,
  // e minuti di durata della sessione "Entra con PIN".
  var [copertiPrima, setCopertiPrima] = useState(null)
  var [storia, setStoria] = useState([])
  var [minutiElevazione, setMinutiElevazione] = useState(5)

  var [customerSearch, setCustomerSearch] = useState('')
  var [searchResults, setSearchResults] = useState([])
  var [selectedCustomer, setSelectedCustomer] = useState(null)
  var [customerAllergens, setCustomerAllergens] = useState([])
  var [showSearch, setShowSearch] = useState(true)

  var [showListaClienti, setShowListaClienti] = useState(false)
  var [listaClienti, setListaClienti] = useState([])
  var [loadingLista, setLoadingLista] = useState(false)
  var [filtroLista, setFiltroLista] = useState('')

  var [availability, setAvailability] = useState(null)
  var [selectedHour, setSelectedHour] = useState('')
  var [selectedMinute, setSelectedMinute] = useState('00')

  var [showQuickCustomer, setShowQuickCustomer] = useState(false)
  var [quickForm, setQuickForm] = useState({ first_name: '', last_name: '', phone: '', email: '', category: 'standard', notes: '' })
  var [quickLoading, setQuickLoading] = useState(false)
  var [quickError, setQuickError] = useState(null)

  var initialDate = searchParams.get('date') || formatDateISO(new Date())
  var initialMeal = searchParams.get('meal') || 'dinner'

  var [formData, setFormData] = useState({
    reservation_date: initialDate,
    meal_type: initialMeal,
    adults_count: 2,
    children_count: 0,
    table_info: '',
    allergie_prenotazione: '',
    notes: '',
    special_requests: '',
    source: 'manual'
  })

  var totalGuests = formData.adults_count + formData.children_count
  var hasAllergiePrenotazione = Boolean(formData.allergie_prenotazione && formData.allergie_prenotazione.trim().length > 0)

  useEffect(function() {
    if (isEditing) loadReservation()
  }, [id])

  useEffect(function() {
    if (formData.reservation_date && formData.meal_type) checkAvailability()
  }, [formData.reservation_date, formData.meal_type, totalGuests])

  useEffect(function() {
    refreshAlertState()
  }, [formData.reservation_date, formData.meal_type])

  useEffect(function() {
    supabase.from('restaurant_settings')
      .select('elevazione_minuti')
      .limit(1)
      .then(function(result) {
        if (!result.error && result.data && result.data.length > 0) {
          var m = result.data[0].elevazione_minuti
          if (m && m > 0) setMinutiElevazione(m)
        }
      })
  }, [])

  useEffect(function() {
    if (isEditing) caricaStoria()
  }, [id])

  useEffect(function() {
    if (selectedHour !== '') {
      var h = parseInt(selectedHour)
      var detected = h >= 11 && h <= 15 ? 'lunch' : (h >= 19 && h <= 23 ? 'dinner' : null)
      if (detected) {
        setFormData(function(prev) {
          var u = {}; for (var k in prev) { u[k] = prev[k] }
          u.meal_type = detected
          return u
        })
      }
    }
  }, [selectedHour])

  function loadReservation() {
    setLoading(true)
    supabase.from('reservations')
      .select('*, customers(id, first_name, last_name, phone, email, category)')
      .eq('id', id).single()
      .then(function(result) {
        if (result.error) { alert('Prenotazione non trovata.'); navigate('/prenotazioni'); return }
        var res = result.data
        setFormData({
          reservation_date: res.reservation_date,
          meal_type: res.meal_type === 'lunch' || res.meal_type === 'dinner' ? res.meal_type : 'dinner',
          adults_count: res.adults_count || res.guests_count,
          children_count: res.children_count || 0,
          table_info: res.table_info || '',
          allergie_prenotazione: res.allergie_prenotazione || '',
          notes: res.notes || '',
          special_requests: res.special_requests || '',
          source: res.source || 'manual'
        })
        if (res.requested_time) {
          var timeParts = res.requested_time.split(':')
          setSelectedHour(timeParts[0])
          var mins = parseInt(timeParts[1])
          var closest = '00'
          if (mins >= 8 && mins < 23) closest = '15'
          else if (mins >= 23 && mins < 38) closest = '30'
          else if (mins >= 38 && mins < 53) closest = '45'
          setSelectedMinute(closest)
        }
        setSelectedCustomer(res.customers)
        setShowSearch(false)
        // In modifica la spunta "Ok direttore" parte SEMPRE vuota: e' una
        // decisione fresca a ogni salvataggio. Qui memorizzo solo i coperti
        // di partenza, che servono al log (da X a Y).
        var prima = (typeof res.guests_count === 'number')
          ? res.guests_count
          : ((res.adults_count || 0) + (res.children_count || 0))
        setCopertiPrima(prima)
        loadCustomerAllergens(res.customers.id)
        setLoading(false)
      })
  }

  function searchCustomers(query) {
    setCustomerSearch(query)
    if (query.length < 2) { setSearchResults([]); return }
    supabase.from('customers')
      .select('id, first_name, last_name, phone, email, category')
      .eq('is_active', true)
      .or('last_name.ilike.%' + query + '%,first_name.ilike.%' + query + '%,phone.ilike.%' + query + '%,email.ilike.%' + query + '%')
      .order('last_name').limit(10)
      .then(function(result) {
        if (!result.error) setSearchResults(result.data || [])
      })
  }

  function apriListaClienti() {
    setShowListaClienti(true)
    setFiltroLista('')
    if (listaClienti.length > 0) return
    setLoadingLista(true)
    supabase.from('customers')
      .select('id, first_name, last_name, phone, email, category')
      .eq('is_active', true)
      .order('last_name', { ascending: true })
      .then(function(result) {
        setLoadingLista(false)
        if (!result.error) setListaClienti(result.data || [])
      })
  }

  function selectCustomer(customer) {
    setSelectedCustomer(customer)
    setShowSearch(false)
    setShowListaClienti(false)
    setSearchResults([])
    setCustomerSearch('')
    loadCustomerAllergens(customer.id)
  }

  function loadCustomerAllergens(customerId) {
    supabase.from('customer_allergens')
      .select('severity, allergens(id, name, icon)')
      .eq('customer_id', customerId)
      .then(function(result) {
        if (!result.error) setCustomerAllergens(result.data || [])
      })
  }

  function checkAvailability() {
    supabase.rpc('check_availability', {
      p_date: formData.reservation_date,
      p_meal_type: formData.meal_type,
      p_guests: totalGuests
    }).then(function(result) {
      if (!result.error && result.data && result.data.length > 0) setAvailability(result.data[0])
    })
  }

  // Carica i coperti gia' presenti nella fascia (esclusa questa prenotazione
  // se siamo in modifica) e l'eventuale alert manuale attivo su quella fascia.
  function refreshAlertState() {
    var d = formData.reservation_date
    var m = formData.meal_type
    if (!d || !m) { setCopertiAltri(0); setAlertManuale(null); return }

    supabase.from('reservations')
      .select('id, guests_count')
      .eq('reservation_date', d)
      .eq('meal_type', m)
      .not('status', 'eq', 'cancelled')
      .then(function(result) {
        var somma = 0
        if (!result.error && result.data) {
          for (var i = 0; i < result.data.length; i++) {
            var row = result.data[i]
            if (isEditing && row.id === id) continue
            somma += (row.guests_count || 0)
          }
        }
        setCopertiAltri(somma)
      })

    supabase.from('alert_prenotazioni')
      .select('testo, attivo')
      .eq('data', d)
      .eq('fascia', m)
      .eq('attivo', true)
      .maybeSingle()
      .then(function(result) {
        if (!result.error && result.data) setAlertManuale(result.data)
        else setAlertManuale(null)
      })
  }

  function handleInputChange(e) {
    var name = e.target.name
    var value = e.target.value
    if (name === 'adults_count' || name === 'children_count') {
      value = parseInt(value) || 0
      if (value < 0) value = 0
    }
    setFormData(function(prev) {
      var u = {}; for (var k in prev) { u[k] = prev[k] }
      u[name] = value
      return u
    })
  }

  function openQuickCustomer() {
    setQuickForm({ first_name: '', last_name: '', phone: '', email: '', category: 'standard', notes: '' })
    setQuickError(null)
    setShowQuickCustomer(true)
  }

  function handleQuickCustomerSubmit(e) {
    e.preventDefault()
    setQuickError(null)
    if (!quickForm.first_name.trim() || !quickForm.last_name.trim()) { setQuickError('Nome e Cognome sono obbligatori.'); return }
    setQuickLoading(true)
    supabase.from('customers').insert({
      first_name: quickForm.first_name.trim(),
      last_name: quickForm.last_name.trim(),
      phone: quickForm.phone.trim() || null,
      email: quickForm.email.trim() || null,
      category: quickForm.category,
      notes: quickForm.notes.trim() || null,
      is_active: true,
      source: 'manual'
    }).select().single()
      .then(function(result) {
        setQuickLoading(false)
        if (result.error) {
          setQuickError(result.error.code === '23505' ? 'Esiste gia un cliente con questo telefono o email.' : 'Errore: ' + result.error.message)
          return
        }
        selectCustomer(result.data)
        setShowQuickCustomer(false)
        setListaClienti([])
      })
  }

  function isSharedDevice() {
    try {
      return localStorage.getItem('icg_shared_device') === '1'
    } catch (e) {
      return false
    }
  }

  function buildReservationData() {
    var requestedTime = null
    if (selectedHour !== '') requestedTime = pad(parseInt(selectedHour)) + ':' + selectedMinute + ':00'
    var haAllergeni = Boolean(customerAllergens.length > 0 || hasAllergiePrenotazione)
    return {
      customer_id: selectedCustomer.id,
      reservation_date: formData.reservation_date,
      meal_type: formData.meal_type,
      requested_time: requestedTime,
      guests_count: totalGuests,
      adults_count: formData.adults_count,
      children_count: formData.children_count,
      table_info: formData.table_info || null,
      allergie_prenotazione: (formData.allergie_prenotazione || '').trim() || null,
      notes: formData.notes || null,
      special_requests: formData.special_requests || null,
      source: formData.source,
      has_allergen_alerts: haAllergeni
    }
  }

  // Chi firma il salvataggio, adesso:
  //  - se sei "entrato con PIN" (sessione attiva) -> l'utente elevato;
  //  - altrimenti l'utente loggato (postazione personale).
  function firmaCorrente() {
    if (elevato && elevazione) {
      return { user_id: elevazione.user_id, nome: elevazione.nome }
    }
    return {
      user_id: user ? user.id : null,
      nome: profile ? (profile.display_name || (profile.first_name + ' ' + profile.last_name)) : null
    }
  }

  // Serve il PIN? Solo su postazione condivisa quando NON c'e' gia' una
  // sessione attiva. Il PIN, oltre a firmare, apre la sessione: i
  // salvataggi successivi non lo richiederanno finche' la sessione dura.
  function servePin() {
    return isSharedDevice() && !elevato
  }

  // Carica la storia (log) della prenotazione in modifica.
  function caricaStoria() {
    if (!id) return
    supabase.from('prenotazioni_log')
      .select('*')
      .eq('prenotazione_id', id)
      .order('created_at', { ascending: true })
      .then(function(result) {
        if (!result.error && result.data) setStoria(result.data)
      })
  }

  // Scrive una riga nel log. Non blocca l'operazione se fallisce:
  // la prenotazione e' gia' salvata.
  function scriviLog(prenotazioneId, firma) {
    var clienteNome = selectedCustomer
      ? (selectedCustomer.first_name + ' ' + selectedCustomer.last_name)
      : (formData.nome_libero || null)
    var riga = {
      prenotazione_id: prenotazioneId,
      azione: isEditing ? 'modifica' : 'creazione',
      coperti_prima: isEditing ? copertiPrima : null,
      coperti_dopo: totalGuests,
      ok_direttore: okDirettore === true,
      cliente_nome: clienteNome,
      data_prenotazione: formData.reservation_date,
      fascia: formData.meal_type,
      autore_id: firma.user_id,
      autore_nome: firma.nome || null
    }
    return supabase.from('prenotazioni_log').insert(riga)
  }

  // Applica al payload la firma (autore in creazione, modificatore in
  // modifica) e lo stato della spunta "Ok direttore" di QUESTO salvataggio.
  function applicaFirmaEOk(base, firma) {
    var out = {}; for (var k in base) { out[k] = base[k] }

    if (isEditing) {
      out.modificata_da = firma.user_id
      out.modificata_da_nome = firma.nome || null
      out.modificata_at = new Date().toISOString()
    } else {
      out.creata_da = firma.user_id
      out.creata_da_nome = firma.nome || null
    }

    if (okDirettore) {
      out.ok_direttore = true
      out.ok_direttore_da = firma.user_id
      out.ok_direttore_da_nome = firma.nome || null
      out.ok_direttore_at = new Date().toISOString()
    } else {
      out.ok_direttore = false
      out.ok_direttore_da = null
      out.ok_direttore_da_nome = null
      out.ok_direttore_at = null
    }

    return out
  }

  // Salva la prenotazione e poi scrive il log, sempre con la stessa firma.
  function eseguiSalvataggio(base, firma) {
    setSaving(true)
    var payload = applicaFirmaEOk(base, firma)
    var promise = isEditing
      ? supabase.from('reservations').update(payload).eq('id', id).select('id').single()
      : supabase.from('reservations').insert(payload).select('id').single()

    promise.then(function(result) {
      if (result.error) { setSaving(false); alert('Errore nel salvataggio. Riprova.'); return }
      var savedId = (result.data && result.data.id) ? result.data.id : id
      scriviLog(savedId, firma).then(function() {
        setSaving(false)
        navigate('/prenotazioni/giorno/' + formData.reservation_date)
      })
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!selectedCustomer) { alert('Seleziona un cliente per la prenotazione.'); return }
    if (!formData.reservation_date) { alert('Seleziona una data.'); return }
    if (formData.adults_count < 1) { alert('Il numero di adulti deve essere almeno 1.'); return }
    if (bloccato) { alert('Questa fascia e in alert: spunta "Ok direttore" per poter salvare.'); return }

    var base = buildReservationData()

    // Postazione condivisa senza sessione attiva: chiedo il PIN, che firma
    // e apre la sessione. Il salvataggio prosegue dentro handlePinConfirmed.
    if (servePin()) {
      setPendingData(base)
      setShowPinModal(true)
      return
    }

    // Sessione attiva o postazione personale: firma automatica.
    eseguiSalvataggio(base, firmaCorrente())
  }

  function handlePinConfirmed(info) {
    setShowPinModal(false)
    // Il PIN apre la sessione: i prossimi salvataggi non lo richiederanno
    // finche' la sessione dura.
    attivaElevazione(info, minutiElevazione)
    var base = pendingData
    setPendingData(null)
    eseguiSalvataggio(base, { user_id: info.user_id, nome: info.nome })
  }

  var clientiFiltrati = listaClienti.filter(function(c) {
    if (!filtroLista) return true
    var f = filtroLista.toLowerCase()
    return (c.last_name + ' ' + c.first_name + ' ' + (c.phone || '')).toLowerCase().indexOf(f) !== -1
  })

  var mealLabel = formData.meal_type === 'lunch' ? 'Pranzo' : 'Cena'

  // --- Calcolo stato alert della fascia ---
  var limite = (availability && typeof availability.max_covers === 'number') ? availability.max_covers : null
  var copertiDopo = copertiAltri + totalGuests
  var overLimit = (limite !== null) && (copertiDopo > limite)
  var fasciaInAlert = overLimit || Boolean(alertManuale)
  // L'avviso manuale rende obbligatorio l'ok solo in creazione; l'oltre-limite
  // lo rende obbligatorio sia in creazione sia in modifica.
  var serveOk = overLimit || (Boolean(alertManuale) && !isEditing)
  var bloccato = serveOk && !okDirettore
  var mostraSpunta = fasciaInAlert

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-lg">Caricamento...</div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={function() { navigate(-1) }} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
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
                  <div className="w-10 h-10 rounded-full bg-wine-200 text-wine-800 flex items-center justify-center font-bold text-sm">
                    {selectedCustomer.first_name[0]}{selectedCustomer.last_name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{selectedCustomer.first_name} {selectedCustomer.last_name}</p>
                    <p className="text-sm text-gray-500">{selectedCustomer.phone || selectedCustomer.email || 'Nessun contatto'}</p>
                    {selectedCustomer.category && selectedCustomer.category !== 'standard' && (
                      <span className={"px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 inline-block " + categoryColors[selectedCustomer.category]}>
                        {categoryLabels[selectedCustomer.category]}
                      </span>
                    )}
                  </div>
                  <Check size={20} className="text-green-600 ml-2" />
                </div>
                {!isEditing && (
                  <button type="button"
                    onClick={function() { setShowSearch(true); setSelectedCustomer(null); setCustomerAllergens([]) }}
                    className="text-sm text-wine-600 hover:text-wine-800 font-medium">
                    Cambia
                  </button>
                )}
              </div>

              {customerAllergens.length > 0 && (
                <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-red-600" />
                    <span className="text-sm font-medium text-red-800">Allergeni registrati sul profilo cliente</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {customerAllergens.map(function(ca, idx) {
                      return <span key={idx} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">{ca.allergens.icon} {ca.allergens.name}</span>
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Cerca per nome, telefono o email..."
                  value={customerSearch}
                  onChange={function(e) { searchCustomers(e.target.value) }}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                  autoFocus
                />
              </div>

              {searchResults.length > 0 && (
                <div className="mb-3 border border-gray-200 rounded-lg overflow-hidden">
                  {searchResults.map(function(customer) {
                    return (
                      <button key={customer.id} type="button" onClick={function() { selectCustomer(customer) }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {customer.first_name[0]}{customer.last_name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900">{customer.last_name} {customer.first_name}</p>
                          <p className="text-sm text-gray-500 truncate">{customer.phone || customer.email || ''}</p>
                        </div>
                        {customer.category && customer.category !== 'standard' && (
                          <span className={"px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 " + categoryColors[customer.category]}>
                            {categoryLabels[customer.category]}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={apriListaClienti}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 font-medium">
                  <Users size={16} />
                  Lista clienti
                </button>
                <button type="button" onClick={openQuickCustomer}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-wine-300 text-sm text-wine-700 hover:bg-wine-50 font-medium">
                  <UserPlus size={16} />
                  Nuovo cliente
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dettagli prenotazione */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Dettagli Prenotazione</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
              <input type="date" name="reservation_date" value={formData.reservation_date}
                onChange={handleInputChange} required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Turno *
                {selectedHour !== '' && <span className="text-xs text-wine-600 ml-1">(rilevato dall'orario)</span>}
              </label>
              <div className="flex gap-2">
                {MEAL_TYPES.map(function(mt) {
                  var isSelected = formData.meal_type === mt.value
                  return (
                    <button key={mt.value} type="button"
                      onClick={function() {
                        setFormData(function(prev) {
                          var u = {}; for (var k in prev) { u[k] = prev[k] }
                          u.meal_type = mt.value
                          return u
                        })
                      }}
                      className={'flex-1 px-4 py-3 rounded-lg text-sm font-medium border transition-colors ' + (isSelected ? 'bg-wine-700 border-wine-700 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-wine-400')}>
                      {mt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Orario di arrivo</label>
              <div className="flex items-center gap-2">
                <select value={selectedHour} onChange={function(e) { setSelectedHour(e.target.value) }}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white text-base">
                  <option value="">Ore</option>
                  {HOURS.map(function(h) { return <option key={h} value={h}>{pad(h)}</option> })}
                </select>
                <span className="text-xl font-bold text-gray-400">:</span>
                <select value={selectedMinute} onChange={function(e) { setSelectedMinute(e.target.value) }}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white text-base"
                  disabled={selectedHour === ''}>
                  {MINUTES.map(function(m) { return <option key={m} value={m}>{m}</option> })}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fonte</label>
              <select name="source" value={formData.source} onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white text-base">
                <option value="manual">Inserimento manuale</option>
                <option value="phone">Telefono</option>
                <option value="email">Email</option>
                <option value="website">Sito web</option>
                <option value="hotel_in_cloud">Hotel in Cloud</option>
              </select>
            </div>
          </div>

          {/* Ospiti */}
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Numero ospiti</h3>
            <div className="grid grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Adulti *</label>
                <input type="number" name="adults_count" value={formData.adults_count}
                  onChange={handleInputChange} min="1" max="200" required
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base text-center" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Bambini</label>
                <input type="number" name="children_count" value={formData.children_count}
                  onChange={handleInputChange} min="0" max="200"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base text-center" />
              </div>
              <div className="text-center">
                <label className="block text-sm text-gray-600 mb-1">Totale</label>
                <div className="px-4 py-3 bg-wine-100 text-wine-800 rounded-lg font-bold text-lg">{totalGuests}</div>
              </div>
            </div>
          </div>

          {/* Alert fascia / disponibilita */}
          {fasciaInAlert ? (
            <div className="mt-4 p-4 rounded-lg border bg-amber-50 border-amber-300">
              <div className="flex items-start gap-2">
                <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900">
                    {mealLabel + " del " + dataBreve(formData.reservation_date) + " \u2014 fascia in alert"}
                  </p>
                  {overLimit && (
                    <p className="text-sm text-amber-800 mt-0.5">
                      {"Con questa prenotazione: " + copertiDopo + " coperti" + (limite !== null ? " su un limite di " + limite : "") + "."}
                    </p>
                  )}
                  {alertManuale && (
                    <p className="text-sm text-amber-800 mt-0.5">
                      {"Avviso del direttore: " + (alertManuale.testo || "\u2014")}
                    </p>
                  )}

                  {mostraSpunta && (
                    <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={okDirettore}
                        onChange={function(e) { setOkDirettore(e.target.checked) }}
                        className="w-5 h-5 rounded border-gray-300 text-wine-700 focus:ring-wine-500"
                      />
                      <span className={"text-sm font-medium " + (serveOk && !okDirettore ? "text-red-700" : "text-amber-900")}>
                        {serveOk ? "Ok direttore (obbligatorio per salvare)" : "Ok direttore (facoltativo)"}
                      </span>
                    </label>
                  )}
                  {bloccato && (
                    <p className="text-xs text-red-600 mt-1">
                      {"Spunta \u201cOk direttore\u201d per poter salvare la prenotazione."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (limite !== null && (
            <div className="mt-4 p-3 rounded-lg border bg-green-50 border-green-200">
              <p className="text-sm font-medium text-green-800">
                {mealLabel + ": ancora " + Math.max(0, limite - copertiDopo) + " coperti disponibili su " + limite}
              </p>
            </div>
          ))}

          {/* Allergeni prenotazione */}
          <div className="mt-4">
            <label className={"block text-sm font-medium mb-1 " + (hasAllergiePrenotazione ? 'text-red-600' : 'text-gray-700')}>
              {hasAllergiePrenotazione
                ? <span className="flex items-center gap-1.5"><AlertTriangle size={15} className="text-red-500" />Allergeni / Intolleranze segnalati per questa prenotazione</span>
                : 'Allergeni / Intolleranze per questa prenotazione'}
            </label>
            <textarea
              name="allergie_prenotazione"
              value={formData.allergie_prenotazione}
              onChange={handleInputChange}
              rows={2}
              placeholder="Es. un ospite celiaco, intolleranza al lattosio, allergia ai crostacei..."
              className={"w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 text-base transition-colors " + (hasAllergiePrenotazione ? 'border-red-400 bg-red-50 focus:ring-red-400' : 'border-gray-200 focus:ring-wine-500')}
            />
            {hasAllergiePrenotazione && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} />
                Questa prenotazione verra segnalata con alert allergeni
              </p>
            )}
          </div>

          {/* Note */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea name="notes" value={formData.notes} onChange={handleInputChange} rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
              placeholder="Note interne sulla prenotazione, preferenze posto, richieste particolari..." />
          </div>

          {/* Richieste speciali */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Richieste speciali</label>
            <textarea name="special_requests" value={formData.special_requests} onChange={handleInputChange} rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
              placeholder="es. compleanno, menu vegano, seggiolone..." />
          </div>
        </div>

        {/* Storia della prenotazione (log, sola lettura) */}
        {isEditing && storia.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Storia</h2>
            <ul className="space-y-2">
              {storia.map(function(ev) {
                var chi = ev.autore_nome || 'Qualcuno'
                var frase = ev.azione === 'creazione'
                  ? chi + ' ha creato la prenotazione' + (ev.cliente_nome ? ' per ' + ev.cliente_nome : '') + ' di ' + (ev.coperti_dopo != null ? ev.coperti_dopo : '?') + ' coperti' + (ev.ok_direttore ? ' con ok del direttore' : '')
                  : chi + ' ha modificato' + (ev.cliente_nome ? ' la prenotazione di ' + ev.cliente_nome : ' la prenotazione') + ' da ' + (ev.coperti_prima != null ? ev.coperti_prima : '?') + ' a ' + (ev.coperti_dopo != null ? ev.coperti_dopo : '?') + ' coperti' + (ev.ok_direttore ? ' con ok del direttore' : '')
                return (
                  <li key={ev.id} className="flex items-start gap-2 text-sm">
                    <span className="text-gray-400 font-mono text-xs mt-0.5 flex-shrink-0 whitespace-nowrap">{fmtLogData(ev.created_at)}</span>
                    <span className="text-gray-700">{frase}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Pulsanti */}
        <div className="flex flex-col sm:flex-row gap-3 pb-8">
          <button type="submit" disabled={saving || !selectedCustomer || bloccato}
            className="flex-1 flex items-center justify-center gap-2 bg-wine-700 text-white px-6 py-4 rounded-xl hover:bg-wine-800 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-base">
            <Save size={20} />
            <span>{saving ? 'Salvataggio...' : (isEditing ? 'Salva Modifiche' : 'Conferma Prenotazione')}</span>
          </button>
          <button type="button" onClick={function() { navigate(-1) }}
            className="px-6 py-4 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium text-gray-700 text-base">
            Annulla
          </button>
        </div>

      </form>

      {/* Modale lista clienti */}
      {showListaClienti && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col max-h-screen sm:max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">Seleziona cliente</h2>
              <button type="button" onClick={function() { setShowListaClienti(false) }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <input type="text" placeholder="Filtra per nome o telefono..."
                value={filtroLista}
                onChange={function(e) { setFiltroLista(e.target.value) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                autoFocus />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingLista ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-gray-400 text-sm">Caricamento...</p>
                </div>
              ) : clientiFiltrati.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Nessun cliente trovato</div>
              ) : (
                clientiFiltrati.map(function(customer) {
                  return (
                    <button key={customer.id} type="button" onClick={function() { selectCustomer(customer) }}
                      className="w-full text-left px-5 py-3.5 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {customer.first_name[0]}{customer.last_name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{customer.last_name} {customer.first_name}</p>
                        <p className="text-xs text-gray-500 truncate">{customer.phone || customer.email || ''}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {customer.category && customer.category !== 'standard' && (
                          <span className={"px-2 py-0.5 rounded-full text-xs font-medium " + categoryColors[customer.category]}>
                            {categoryLabels[customer.category]}
                          </span>
                        )}
                        <ChevronRight size={16} className="text-gray-300" />
                      </div>
                    </button>
                  )
                })
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex-shrink-0">
              <button type="button" onClick={function() { setShowListaClienti(false); openQuickCustomer() }}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-wine-300 text-wine-700 rounded-lg text-sm font-medium hover:bg-wine-50">
                <UserPlus size={16} />
                Registra nuovo cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale cliente rapido */}
      {showQuickCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Nuovo cliente</h2>
                <p className="text-xs text-gray-400 mt-0.5">Il cliente verra creato e selezionato automaticamente</p>
              </div>
              <button type="button" onClick={function() { setShowQuickCustomer(false) }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleQuickCustomerSubmit} className="p-6 space-y-4">
              {quickError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{quickError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
                  <input type="text" value={quickForm.first_name}
                    onChange={function(e) { var v = e.target.value; setQuickForm(function(p) { var u = Object.assign({}, p); u.first_name = v; return u }) }}
                    required autoFocus className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cognome *</label>
                  <input type="text" value={quickForm.last_name}
                    onChange={function(e) { var v = e.target.value; setQuickForm(function(p) { var u = Object.assign({}, p); u.last_name = v; return u }) }}
                    required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Telefono</label>
                <input type="tel" value={quickForm.phone} placeholder="+39..."
                  onChange={function(e) { var v = e.target.value; setQuickForm(function(p) { var u = Object.assign({}, p); u.phone = v; return u }) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Categoria</label>
                <select value={quickForm.category}
                  onChange={function(e) { var v = e.target.value; setQuickForm(function(p) { var u = Object.assign({}, p); u.category = v; return u }) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500">
                  <option value="standard">Standard</option>
                  <option value="vip">VIP</option>
                  <option value="press">Stampa</option>
                  <option value="business">Business</option>
                  <option value="hotel_guest">Ospite Hotel</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
                <textarea value={quickForm.notes} rows={2} placeholder="Informazioni utili..."
                  onChange={function(e) { var v = e.target.value; setQuickForm(function(p) { var u = Object.assign({}, p); u.notes = v; return u }) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 resize-none" />
              </div>
              <p className="text-xs text-gray-400">Allergeni e dati completi si aggiungono in seguito da Anagrafica Clienti.</p>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={function() { setShowQuickCustomer(false) }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
                <button type="submit" disabled={quickLoading}
                  className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  {quickLoading ? 'Creazione...' : 'Crea e seleziona'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfermaPin
        open={showPinModal}
        title={isEditing ? 'Conferma modifica' : 'Conferma prenotazione'}
        message={isEditing
          ? 'Inserisci il tuo PIN a 6 cifre per registrare la modifica a tuo nome. Resterai attivo per qualche minuto senza doverlo reinserire.'
          : 'Inserisci il tuo PIN a 6 cifre per formalizzare la prenotazione a tuo nome. Resterai attivo per qualche minuto senza doverlo reinserire.'}
        onCancel={function() { setShowPinModal(false); setPendingData(null) }}
        onConfirmed={handlePinConfirmed}
      />

    </div>
  )
}

export default ReservationForm
