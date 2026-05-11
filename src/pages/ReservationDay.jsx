import { useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, ArrowLeft, Users, Clock, Phone, AlertTriangle, CalendarDays, Baby, User, Star, Calendar, TableProperties, X, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'

function formatDateDisplay(dateStr) {
  var parts = dateStr.split('-')
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  var options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
  return d.toLocaleDateString('it-IT', options)
}

var STATO_EVENTO_LABELS = {
  option: 'Opzione',
  confirmed: 'Confermato'
}

var PASTO_LABELS = {
  lunch: 'Pranzo',
  dinner: 'Cena',
  both: 'Giornata intera'
}

function turnoDb(turno) {
  return turno === 'lunch' ? 'pranzo' : 'cena'
}

// ── FORM EVENTO ──────────────────────────────────────────────
function FormEvento(props) {
  var onSave = props.onSave
  var onClose = props.onClose
  var dateStr = props.dateStr
  var eventoEsistente = props.evento || null
  var isModifica = eventoEsistente !== null

  var [title, setTitle] = useState(isModifica ? eventoEsistente.title : '')
  var [eventType, setEventType] = useState(isModifica ? eventoEsistente.event_type : 'option')
  var [mealType, setMealType] = useState(isModifica ? eventoEsistente.meal_type : 'dinner')
  var [coversReserved, setCoversReserved] = useState(isModifica ? String(eventoEsistente.covers_reserved || '') : '')
  var [notes, setNotes] = useState(isModifica ? (eventoEsistente.notes || '') : '')
  var [saving, setSaving] = useState(false)
  var [errore, setErrore] = useState('')

  function handleSave() {
    if (!title.trim()) { setErrore('Inserisci il titolo dell\'evento.'); return; }
    setErrore('')
    setSaving(true)

    var payload = {
      event_date: dateStr,
      title: title.trim(),
      event_type: eventType,
      meal_type: mealType,
      covers_reserved: parseInt(coversReserved, 10) || null,
      notes: notes.trim() || null
    }

    var query = isModifica
      ? supabase.from('event_dates').update(payload).eq('id', eventoEsistente.id).select()
      : supabase.from('event_dates').insert([payload]).select()

    query.then(function(result) {
      setSaving(false)
      if (result.error) { setErrore('Errore: ' + result.error.message); return; }
      if (result.data && result.data.length > 0) {
        onSave(result.data[0], isModifica)
      }
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isModifica ? 'Modifica Evento' : 'Nuovo Evento'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titolo evento *</label>
            <input
              type="text"
              placeholder="es. Matrimonio Rossi, Compleanno 50 anni..."
              value={title}
              onChange={function(e) { setTitle(e.target.value); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stato</label>
            <div className="flex gap-2">
              <button
                onClick={function() { setEventType('option'); }}
                className={"flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors " + (eventType === 'option' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')}
              >
                Opzione
              </button>
              <button
                onClick={function() { setEventType('confirmed'); }}
                className={"flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors " + (eventType === 'confirmed' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')}
              >
                Confermato
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pasto</label>
            <div className="flex gap-2">
              {['lunch', 'dinner', 'both'].map(function(p) {
                return (
                  <button
                    key={p}
                    onClick={function() { setMealType(p); }}
                    className={"flex-1 py-2 px-2 rounded-lg text-xs font-medium border transition-colors " + (mealType === p ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')}
                  >
                    {PASTO_LABELS[p]}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ospiti previsti (opzionale)</label>
            <input
              type="number"
              min="1"
              placeholder="es. 80"
              value={coversReserved}
              onChange={function(e) { setCoversReserved(e.target.value); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (opzionale)</label>
            <textarea
              rows={2}
              placeholder="Note interne sull'evento..."
              value={notes}
              onChange={function(e) { setNotes(e.target.value); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 resize-none"
            />
          </div>
          {errore && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {errore}
            </div>
          )}
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={"flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors " + (saving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-wine-700 text-white hover:bg-wine-800')}
          >
            {saving ? 'Salvataggio...' : (isModifica ? 'Aggiorna' : 'Salva Evento')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CARD EVENTO ──────────────────────────────────────────────
function CardEvento(props) {
  var ev = props.evento
  var onModifica = props.onModifica
  var onElimina = props.onElimina

  var isConfirmato = ev.event_type === 'confirmed'
  var bgColor = isConfirmato ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
  var badgeColor = isConfirmato ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'

  return (
    <div className={"rounded-xl border p-4 " + bgColor}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {isConfirmato
              ? <Star size={14} className="text-amber-500 fill-amber-500 flex-shrink-0" />
              : <Clock size={14} className="text-blue-500 flex-shrink-0" />
            }
            <span className="font-semibold text-gray-900 text-sm">{ev.title}</span>
            <span className={"px-2 py-0.5 rounded-full text-xs font-medium " + badgeColor}>
              {STATO_EVENTO_LABELS[ev.event_type]}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              {PASTO_LABELS[ev.meal_type] || ev.meal_type}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
            {ev.covers_reserved && (
              <span className="flex items-center gap-1">
                <Users size={12} />
                {ev.covers_reserved + ' ospiti previsti'}
              </span>
            )}
            {ev.notes && (
              <span className="text-gray-400 italic truncate max-w-xs">{ev.notes}</span>
            )}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={function() { onModifica(ev); }}
            className="text-xs px-2 py-1 bg-white text-gray-600 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Modifica
          </button>
          <button
            onClick={function() { onElimina(ev.id); }}
            className="text-xs px-2 py-1 bg-white text-red-600 rounded border border-red-200 hover:bg-red-50 transition-colors"
          >
            Elimina
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PANNELLO ASSEGNAZIONE TAVOLI ─────────────────────────────
function PannelloTavoli(props) {
  var prenotazione = props.prenotazione
  var dateStr = props.dateStr
  var turno = props.turno
  var onClose = props.onClose

  var [sale, setSale] = useState([])
  var [tavoliPerSala, setTavoliPerSala] = useState({})
  var [tavoliOccupati, setTavoliOccupati] = useState([]) // id tavoli occupati da ALTRE prenotazioni
  var [tavoliSelezionati, setTavoliSelezionati] = useState([]) // id tavoli già assegnati a QUESTA prenotazione
  var [loading, setLoading] = useState(true)
  var [saving, setSaving] = useState(false)
  var [salaAttiva, setSalaAttiva] = useState(null)

  var customer = prenotazione.customers

  useEffect(function() {
    loadDati()
  }, [])

  function loadDati() {
    setLoading(true)

    // Carica sale attive
    supabase
      .from('sale')
      .select('*')
      .eq('attiva', true)
      .order('ordine', { ascending: true })
      .then(function(result) {
        if (result.error || !result.data) { setLoading(false); return }
        var saleData = result.data
        setSale(saleData)
        if (saleData.length > 0) setSalaAttiva(saleData[0].id)

        // Carica tavoli attivi di tutte le sale
        return supabase
          .from('tavoli_sala')
          .select('*')
          .eq('attivo', true)
          .order('nome', { ascending: true })
      })
      .then(function(result) {
        if (!result || result.error || !result.data) { setLoading(false); return }
        var mappa = {}
        result.data.forEach(function(t) {
          if (!mappa[t.sala_id]) mappa[t.sala_id] = []
          mappa[t.sala_id].push(t)
        })
        setTavoliPerSala(mappa)

        // Carica assegnazioni già presenti per questo turno e data
        return supabase
          .from('tavoli_prenotazioni')
          .select('tavolo_id, prenotazione_id')
          .eq('data', dateStr)
          .eq('turno', turnoDb(turno))
      })
      .then(function(result) {
        setLoading(false)
        if (!result || result.error || !result.data) return

        var occupatiDaAltri = []
        var giaMiei = []

        result.data.forEach(function(tp) {
          if (tp.prenotazione_id === prenotazione.id) {
            giaMiei.push(tp.tavolo_id)
          } else {
            occupatiDaAltri.push(tp.tavolo_id)
          }
        })

        setTavoliOccupati(occupatiDaAltri)
        setTavoliSelezionati(giaMiei)
      })
  }

  function toggleTavolo(tavoloId) {
    var isOccupato = tavoliOccupati.indexOf(tavoloId) !== -1
    if (isOccupato) return // non selezionabile

    setTavoliSelezionati(function(prev) {
      if (prev.indexOf(tavoloId) !== -1) {
        return prev.filter(function(id) { return id !== tavoloId })
      } else {
        return prev.concat([tavoloId])
      }
    })
  }

  function handleSalva() {
    setSaving(true)

    // Prima elimina tutte le assegnazioni esistenti per questa prenotazione in questo turno/data
    supabase
      .from('tavoli_prenotazioni')
      .delete()
      .eq('prenotazione_id', prenotazione.id)
      .eq('data', dateStr)
      .eq('turno', turnoDb(turno))
      .then(function(result) {
        if (result.error) {
          setSaving(false)
          alert('Errore: ' + result.error.message)
          return
        }

        // Se non ci sono tavoli selezionati, fine
        if (tavoliSelezionati.length === 0) {
          setSaving(false)
          onClose(true)
          return
        }

        // Inserisce le nuove assegnazioni
        var righe = tavoliSelezionati.map(function(tavoloId) {
          return {
            prenotazione_id: prenotazione.id,
            tavolo_id: tavoloId,
            data: dateStr,
            turno: turnoDb(turno),
            n_ospiti_assegnati: 0,
            n_bambini_tavolo: 0,
            allergie_tavolo: []
          }
        })

        return supabase.from('tavoli_prenotazioni').insert(righe)
      })
      .then(function(result) {
        setSaving(false)
        if (result && result.error) {
          alert('Errore salvataggio: ' + result.error.message)
          return
        }
        onClose(true)
      })
  }

  // Calcola decine per griglia
  function getDecina(nome) {
    var num = parseInt(nome.replace(/[^0-9]/g, ''), 10)
    if (isNaN(num)) return 0
    return Math.floor(num / 10) * 10
  }

  function buildGriglia(tavoli) {
    var colonneMap = {}
    tavoli.forEach(function(t) {
      var dec = getDecina(t.nome)
      if (!colonneMap[dec]) colonneMap[dec] = []
      colonneMap[dec].push(t)
    })
    var keys = Object.keys(colonneMap).map(Number).sort(function(a, b) { return a - b })
    return keys.map(function(k) {
      var col = colonneMap[k].slice().sort(function(a, b) {
        var na = parseInt(a.nome.replace(/[^0-9]/g, ''), 10)
        var nb = parseInt(b.nome.replace(/[^0-9]/g, ''), 10)
        return na - nb
      })
      return { decina: k, tavoli: col }
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Assegna Tavoli</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {customer.last_name + ' ' + customer.first_name + ' · ' + prenotazione.guests_count + ' ospiti'}
            </p>
          </div>
          <button onClick={function() { onClose(false) }} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={22} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-gray-400 text-sm">Caricamento...</p>
          </div>
        ) : (
          <>
            {/* Tabs sale */}
            {sale.length > 1 && (
              <div className="flex gap-2 px-5 pt-4 flex-shrink-0 overflow-x-auto">
                {sale.map(function(s) {
                  return (
                    <button
                      key={s.id}
                      onClick={function() { setSalaAttiva(s.id) }}
                      className={"px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors " + (salaAttiva === s.id ? 'bg-wine-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
                    >
                      {s.nome}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Griglia tavoli */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {sale.map(function(s) {
                if (s.id !== salaAttiva) return null
                var tavoli = tavoliPerSala[s.id] || []
                if (tavoli.length === 0) {
                  return (
                    <div key={s.id} className="text-center py-8 text-gray-400 text-sm">
                      Nessun tavolo configurato per questa sala.
                    </div>
                  )
                }
                var griglia = buildGriglia(tavoli)
                return (
                  <div key={s.id}>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {griglia.map(function(colonna) {
                        return (
                          <div key={colonna.decina} className="flex flex-col gap-2 flex-shrink-0">
                            {colonna.tavoli.map(function(t) {
                              var isOccupato = tavoliOccupati.indexOf(t.id) !== -1
                              var isSelezionato = tavoliSelezionati.indexOf(t.id) !== -1

                              var stile = 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                              if (isOccupato) stile = 'bg-red-50 border-red-200 text-red-400 cursor-not-allowed opacity-60'
                              else if (isSelezionato) stile = 'bg-green-500 border-green-600 text-white shadow-sm'

                              return (
                                <button
                                  key={t.id}
                                  onClick={function() { toggleTavolo(t.id) }}
                                  disabled={isOccupato}
                                  className={"w-16 h-12 rounded-lg border-2 text-sm font-mono font-semibold transition-all relative " + stile}
                                >
                                  {t.nome}
                                  {isSelezionato && (
                                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-green-600 rounded-full flex items-center justify-center">
                                      <Check size={10} className="text-white" />
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>

                    {/* Legenda */}
                    <div className="flex gap-4 mt-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded bg-gray-100 border border-gray-200 inline-block"></span>
                        Libero
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded bg-green-500 inline-block"></span>
                        Selezionato
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded bg-red-100 border border-red-200 inline-block"></span>
                        Occupato
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Riepilogo selezione */}
            {tavoliSelezionati.length > 0 && (
              <div className="px-5 py-3 bg-green-50 border-t border-green-100 flex-shrink-0">
                <p className="text-sm text-green-700 font-medium">
                  {tavoliSelezionati.length === 1 ? '1 tavolo selezionato' : tavoliSelezionati.length + ' tavoli selezionati'}
                  {': '}
                  {tavoliSelezionati.map(function(id) {
                    var trovato = null
                    Object.values(tavoliPerSala).forEach(function(lista) {
                      lista.forEach(function(t) { if (t.id === id) trovato = t })
                    })
                    return trovato ? trovato.nome : id
                  }).join(', ')}
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-3 p-5 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={function() { onClose(false) }}
                className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={handleSalva}
                disabled={saving}
                className={"flex-1 py-3 rounded-xl text-sm font-medium transition-colors " + (saving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-wine-700 text-white hover:bg-wine-800')}
              >
                {saving ? 'Salvataggio...' : 'Salva assegnazione'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── PAGINA GIORNALIERA ───────────────────────────────────────
function ReservationDay() {
  var params = useParams()
  var dateStr = params.date
  var navigate = useNavigate()

  var mealState = useState('lunch')
  var selectedMeal = mealState[0]
  var setSelectedMeal = mealState[1]

  var reservationsState = useState([])
  var reservations = reservationsState[0]
  var setReservations = reservationsState[1]

  var loadingState = useState(true)
  var loading = loadingState[0]
  var setLoading = loadingState[1]

  var summaryState = useState({ total: 0, adults: 0, children: 0, count: 0 })
  var summary = summaryState[0]
  var setSummary = summaryState[1]

  var settingsState = useState({ max_covers_lunch: 60, max_covers_dinner: 60 })
  var settings = settingsState[0]
  var setSettings = settingsState[1]

  var eventiState = useState([])
  var eventi = eventiState[0]
  var setEventi = eventiState[1]

  var showFormEventoState = useState(false)
  var showFormEvento = showFormEventoState[0]
  var setShowFormEvento = showFormEventoState[1]

  var eventoInModificaState = useState(null)
  var eventoInModifica = eventoInModificaState[0]
  var setEventoInModifica = eventoInModificaState[1]

  var pannelloTavoliState = useState(null) // prenotazione selezionata
  var pannelloTavoli = pannelloTavoliState[0]
  var setPannelloTavoli = pannelloTavoliState[1]

  // Mappa prenotazione_id -> nomi tavoli assegnati (per mostrare badge)
  var tavoliAssegnatiState = useState({})
  var tavoliAssegnati = tavoliAssegnatiState[0]
  var setTavoliAssegnati = tavoliAssegnatiState[1]

  useEffect(function() {
    loadSettings()
    loadEventi()
  }, [])

  useEffect(function() {
    loadReservations()
  }, [dateStr, selectedMeal])

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

  function loadEventi() {
    supabase
      .from('event_dates')
      .select('*')
      .eq('event_date', dateStr)
      .order('created_at', { ascending: true })
      .then(function(result) {
        if (!result.error) {
          setEventi(result.data || [])
        }
      })
  }

  function loadReservations() {
    setLoading(true)

    supabase
      .from('reservations')
      .select('*, customers(id, first_name, last_name, phone, email, category)')
      .eq('reservation_date', dateStr)
      .eq('meal_type', selectedMeal)
      .order('requested_time', { ascending: true, nullsFirst: false })
      .then(function(result) {
        if (result.error) {
          setReservations([])
        } else {
          setReservations(result.data || [])
        }

        return supabase
          .from('reservations')
          .select('guests_count, adults_count, children_count')
          .eq('reservation_date', dateStr)
          .eq('meal_type', selectedMeal)
          .not('status', 'in', '("cancelled")')
      })
      .then(function(result) {
        if (!result.error && result.data) {
          var total = 0
          var adults = 0
          var children = 0
          for (var i = 0; i < result.data.length; i++) {
            total += result.data[i].guests_count
            adults += result.data[i].adults_count
            children += result.data[i].children_count
          }
          setSummary({ total: total, adults: adults, children: children, count: result.data.length })
        }
        setLoading(false)
      })

    // Carica anche le assegnazioni tavoli per questa data/turno
    supabase
      .from('tavoli_prenotazioni')
      .select('prenotazione_id, tavolo_id, tavoli_sala(nome)')
      .eq('data', dateStr)
      .eq('turno', turnoDb(selectedMeal))
      .then(function(result) {
        if (result.error || !result.data) return
        var mappa = {}
        result.data.forEach(function(tp) {
          if (!mappa[tp.prenotazione_id]) mappa[tp.prenotazione_id] = []
          if (tp.tavoli_sala && tp.tavoli_sala.nome) {
            mappa[tp.prenotazione_id].push(tp.tavoli_sala.nome)
          }
        })
        setTavoliAssegnati(mappa)
      })
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

  function handleSaveEvento(eventoSalvato, isModifica) {
    if (isModifica) {
      setEventi(function(prev) {
        return prev.map(function(ev) { return ev.id === eventoSalvato.id ? eventoSalvato : ev; })
      })
    } else {
      setEventi(function(prev) { return prev.concat([eventoSalvato]); })
    }
    setShowFormEvento(false)
    setEventoInModifica(null)
  }

  function handleModificaEvento(ev) {
    setEventoInModifica(ev)
    setShowFormEvento(true)
  }

  function handleEliminaEvento(id) {
    if (!confirm('Eliminare questo evento dalla data? I movimenti di cassa collegati non vengono eliminati.')) return;
    supabase.from('event_dates').delete().eq('id', id).then(function(result) {
      if (result.error) {
        alert('Errore eliminazione: ' + result.error.message)
      } else {
        setEventi(function(prev) { return prev.filter(function(ev) { return ev.id !== id; }); })
      }
    })
  }

  function handleChiudiPannelloTavoli(aggiornato) {
    setPannelloTavoli(null)
    if (aggiornato) {
      // Ricarica le assegnazioni tavoli
      supabase
        .from('tavoli_prenotazioni')
        .select('prenotazione_id, tavolo_id, tavoli_sala(nome)')
        .eq('data', dateStr)
        .eq('turno', turnoDb(selectedMeal))
        .then(function(result) {
          if (result.error || !result.data) return
          var mappa = {}
          result.data.forEach(function(tp) {
            if (!mappa[tp.prenotazione_id]) mappa[tp.prenotazione_id] = []
            if (tp.tavoli_sala && tp.tavoli_sala.nome) {
              mappa[tp.prenotazione_id].push(tp.tavoli_sala.nome)
            }
          })
          setTavoliAssegnati(mappa)
        })
    }
  }

  var maxCovers = selectedMeal === 'lunch' ? settings.max_covers_lunch : settings.max_covers_dinner
  var remainingCovers = maxCovers - summary.total

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

  var activeReservations = reservations.filter(function(r) { return r.status !== 'cancelled' })
  var cancelledReservations = reservations.filter(function(r) { return r.status === 'cancelled' })

  var eventiConfermati = eventi.filter(function(ev) { return ev.event_type === 'confirmed'; })
  var eventiOpzione = eventi.filter(function(ev) { return ev.event_type === 'option'; })

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">

      {/* Intestazione */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={function() { navigate('/prenotazioni') }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 capitalize">{formatDateDisplay(dateStr)}</h1>
            {eventi.length > 0 && (
              <div className="flex items-center gap-2 mt-0.5">
                {eventiConfermati.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-amber-700 font-medium">
                    <Star size={12} className="fill-amber-500 text-amber-500" />
                    {eventiConfermati.length === 1 ? '1 evento confermato' : eventiConfermati.length + ' eventi confermati'}
                  </span>
                )}
                {eventiOpzione.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                    <Clock size={12} />
                    {eventiOpzione.length === 1 ? '1 opzione' : eventiOpzione.length + ' opzioni'}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={function() { setEventoInModifica(null); setShowFormEvento(true); }}
            className="inline-flex items-center gap-2 bg-amber-500 text-white px-4 py-2.5 rounded-xl hover:bg-amber-600 transition-colors font-medium shadow-sm text-sm"
          >
            <Calendar size={16} />
            <span>Nuovo Evento</span>
          </button>
          <Link
            to={"/prenotazioni/nuova?date=" + dateStr + "&meal=" + selectedMeal}
            className="inline-flex items-center gap-2 bg-wine-700 text-white px-4 py-2.5 rounded-xl hover:bg-wine-800 transition-colors font-medium shadow-sm text-sm"
          >
            <Plus size={16} />
            <span>Nuova Prenotazione</span>
          </Link>
        </div>
      </div>

      {/* Sezione eventi */}
      {eventi.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Star size={14} className="text-amber-500" />
              {eventi.length === 1 ? 'Evento del giorno' : 'Eventi del giorno'}
            </h2>
          </div>
          <div className="space-y-2">
            {eventi.map(function(ev) {
              return (
                <CardEvento
                  key={ev.id}
                  evento={ev}
                  onModifica={handleModificaEvento}
                  onElimina={handleEliminaEvento}
                />
              );
            })}
          </div>
        </div>
      )}

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
          Pranzo
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
          Cena
        </button>
      </div>

      {/* Riepilogo coperti */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-sm text-gray-500">Prenotazioni</p>
              <p className="text-2xl font-bold text-gray-900">{summary.count}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Ospiti</p>
              <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 flex items-center gap-1"><User size={12} /> Adulti</p>
              <p className="text-xl font-bold text-gray-700">{summary.adults}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 flex items-center gap-1"><Baby size={12} /> Bambini</p>
              <p className="text-xl font-bold text-gray-700">{summary.children}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Disponibili</p>
              <p className={"text-2xl font-bold " + (remainingCovers < 10 ? "text-red-600" : "text-green-600")}>
                {remainingCovers}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
          <div
            className={"h-2 rounded-full transition-all " + (remainingCovers < 10 ? "bg-red-500" : "bg-wine-600")}
            style={{ width: Math.min((summary.total / maxCovers) * 100, 100) + '%' }}
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
          <p className="text-gray-500 text-lg">Nessuna prenotazione per questo turno</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeReservations.map(function(res) {
            var customer = res.customers
            var timeStr = res.requested_time ? res.requested_time.substring(0, 5) : null
            var tavoli = tavoliAssegnati[res.id] || []

            return (
              <div
                key={res.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:border-wine-300 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
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

                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Users size={14} />
                        {res.guests_count + " ospiti (" + res.adults_count + " ad. + " + res.children_count + " ba.)"}
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

                    {/* Badge tavoli assegnati */}
                    {tavoli.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <TableProperties size={13} className="text-wine-600" />
                        {tavoli.map(function(nome) {
                          return (
                            <span key={nome} className="px-2 py-0.5 rounded-md text-xs font-mono font-medium bg-wine-50 text-wine-700 border border-wine-200">
                              {nome}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {res.notes && (
                      <p className="text-sm text-gray-600 mt-2">{res.notes}</p>
                    )}
                    {res.special_requests && (
                      <p className="text-sm text-orange-600 mt-1">{"★ " + res.special_requests}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className={"px-3 py-1 rounded-full text-xs font-medium " + statusColors[res.status]}>
                      {statusLabels[res.status]}
                    </span>

                    <div className="flex gap-1 flex-wrap justify-end">
                      {/* Pulsante tavoli */}
                      <button
                        onClick={function() { setPannelloTavoli(res) }}
                        className={"text-xs px-2 py-1 rounded border transition-colors " + (tavoli.length > 0 ? 'bg-wine-50 text-wine-700 border-wine-200 hover:bg-wine-100' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100')}
                        title="Assegna tavoli"
                      >
                        <TableProperties size={13} />
                      </button>

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

      {cancelledReservations.length > 0 && (
        <details className="mt-6">
          <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-600">
            {cancelledReservations.length + (cancelledReservations.length === 1 ? ' prenotazione cancellata' : ' prenotazioni cancellate')}
          </summary>
          <div className="mt-2 space-y-2 opacity-60">
            {cancelledReservations.map(function(res) {
              var customer = res.customers
              return (
                <div key={res.id} className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 line-through">
                      {customer.last_name + " " + customer.first_name + " - " + res.guests_count + " ospiti"}
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

      {/* Form evento (modale) */}
      {showFormEvento && (
        <FormEvento
          dateStr={dateStr}
          evento={eventoInModifica}
          onSave={handleSaveEvento}
          onClose={function() { setShowFormEvento(false); setEventoInModifica(null); }}
        />
      )}

      {/* Pannello assegnazione tavoli */}
      {pannelloTavoli && (
        <PannelloTavoli
          prenotazione={pannelloTavoli}
          dateStr={dateStr}
          turno={selectedMeal}
          onClose={handleChiudiPannelloTavoli}
        />
      )}

    </div>
  )
}

export default ReservationDay
