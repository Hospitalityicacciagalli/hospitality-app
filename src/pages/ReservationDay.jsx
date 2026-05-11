import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, ArrowLeft, Users, Clock, Phone, AlertTriangle, CalendarDays, Baby, User, Star, Calendar, TableProperties, X, Check, Printer, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'

function formatDateDisplay(dateStr) {
  var parts = dateStr.split('-')
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  var options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
  return d.toLocaleDateString('it-IT', options)
}

var STATO_EVENTO_LABELS = { option: 'Opzione', confirmed: 'Confermato' }
var PASTO_LABELS = { lunch: 'Pranzo', dinner: 'Cena', both: 'Giornata intera' }

function turnoDb(turno) {
  return turno === 'lunch' ? 'pranzo' : 'cena'
}

var ALLERGENI_14 = [
  { id: 'glutine', label: 'Glutine' },
  { id: 'crostacei', label: 'Crostacei' },
  { id: 'uova', label: 'Uova' },
  { id: 'pesce', label: 'Pesce' },
  { id: 'arachidi', label: 'Arachidi' },
  { id: 'soia', label: 'Soia' },
  { id: 'latte', label: 'Latte/Lattosio' },
  { id: 'frutta_guscio', label: 'Frutta a guscio' },
  { id: 'sedano', label: 'Sedano' },
  { id: 'senape', label: 'Senape' },
  { id: 'sesamo', label: 'Sesamo' },
  { id: 'solfiti', label: 'Solfiti' },
  { id: 'lupini', label: 'Lupini' },
  { id: 'molluschi', label: 'Molluschi' }
]

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
    if (!title.trim()) { setErrore("Inserisci il titolo dell'evento."); return }
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
      if (result.error) { setErrore('Errore: ' + result.error.message); return }
      if (result.data && result.data.length > 0) { onSave(result.data[0], isModifica) }
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{isModifica ? 'Modifica Evento' : 'Nuovo Evento'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titolo evento *</label>
            <input type="text" placeholder="es. Matrimonio Rossi, Compleanno 50 anni..." value={title}
              onChange={function(e) { setTitle(e.target.value) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stato</label>
            <div className="flex gap-2">
              <button onClick={function() { setEventType('option') }}
                className={"flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors " + (eventType === 'option' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')}>
                Opzione
              </button>
              <button onClick={function() { setEventType('confirmed') }}
                className={"flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors " + (eventType === 'confirmed' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')}>
                Confermato
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pasto</label>
            <div className="flex gap-2">
              {['lunch', 'dinner', 'both'].map(function(p) {
                return (
                  <button key={p} onClick={function() { setMealType(p) }}
                    className={"flex-1 py-2 px-2 rounded-lg text-xs font-medium border transition-colors " + (mealType === p ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')}>
                    {PASTO_LABELS[p]}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ospiti previsti (opzionale)</label>
            <input type="number" min="1" placeholder="es. 80" value={coversReserved}
              onChange={function(e) { setCoversReserved(e.target.value) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (opzionale)</label>
            <textarea rows={2} placeholder="Note interne sull'evento..." value={notes}
              onChange={function(e) { setNotes(e.target.value) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 resize-none" />
          </div>
          {errore && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{errore}</div>}
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button onClick={onClose} className="flex-1 py-2.5 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Annulla</button>
          <button onClick={handleSave} disabled={saving}
            className={"flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors " + (saving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-wine-700 text-white hover:bg-wine-800')}>
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
              : <Clock size={14} className="text-blue-500 flex-shrink-0" />}
            <span className="font-semibold text-gray-900 text-sm">{ev.title}</span>
            <span className={"px-2 py-0.5 rounded-full text-xs font-medium " + badgeColor}>{STATO_EVENTO_LABELS[ev.event_type]}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{PASTO_LABELS[ev.meal_type] || ev.meal_type}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
            {ev.covers_reserved && <span className="flex items-center gap-1"><Users size={12} />{ev.covers_reserved + ' ospiti previsti'}</span>}
            {ev.notes && <span className="text-gray-400 italic truncate max-w-xs">{ev.notes}</span>}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={function() { onModifica(ev) }} className="text-xs px-2 py-1 bg-white text-gray-600 rounded border border-gray-200 hover:bg-gray-50">Modifica</button>
          <button onClick={function() { onElimina(ev.id) }} className="text-xs px-2 py-1 bg-white text-red-600 rounded border border-red-200 hover:bg-red-50">Elimina</button>
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
  var [tavoliOccupati, setTavoliOccupati] = useState([])
  var [tavoliSelezionati, setTavoliSelezionati] = useState([])
  var [dettagliTavoli, setDettagliTavoli] = useState({})
  var [loading, setLoading] = useState(true)
  var [saving, setSaving] = useState(false)
  var [salaAttiva, setSalaAttiva] = useState(null)

  var customer = prenotazione.customers
  var totOspiti = prenotazione.guests_count || 0
  var totBambini = prenotazione.children_count || 0

  useEffect(function() { loadDati() }, [])

  function loadDati() {
    setLoading(true)
    supabase.from('sale').select('*').eq('attiva', true).order('ordine', { ascending: true })
      .then(function(result) {
        if (result.error || !result.data) { setLoading(false); return }
        setSale(result.data)
        if (result.data.length > 0) setSalaAttiva(result.data[0].id)
        return supabase.from('tavoli_sala').select('*').eq('attivo', true).order('nome', { ascending: true })
      })
      .then(function(result) {
        if (!result || result.error || !result.data) { setLoading(false); return }
        var mappa = {}
        result.data.forEach(function(t) {
          if (!mappa[t.sala_id]) mappa[t.sala_id] = []
          mappa[t.sala_id].push(t)
        })
        setTavoliPerSala(mappa)
        return supabase.from('tavoli_prenotazioni')
          .select('tavolo_id, prenotazione_id, n_ospiti_assegnati, n_bambini_tavolo, allergie_tavolo, note_tavolo')
          .eq('data', dateStr).eq('turno', turnoDb(turno))
      })
      .then(function(result) {
        setLoading(false)
        if (!result || result.error || !result.data) return
        var occupatiDaAltri = []
        var giaMiei = []
        var dettagli = {}
        result.data.forEach(function(tp) {
          if (tp.prenotazione_id === prenotazione.id) {
            giaMiei.push(tp.tavolo_id)
            var allergeStd = []
            var allergeManuale = ''
            var allergeArr = tp.allergie_tavolo || []
            allergeArr.forEach(function(a) {
              var found = ALLERGENI_14.find(function(x) { return x.id === a })
              if (found) { allergeStd.push(a) } else { allergeManuale = a }
            })
            dettagli[tp.tavolo_id] = {
              ospiti: tp.n_ospiti_assegnati || 0,
              bambini: tp.n_bambini_tavolo || 0,
              allergeni: allergeStd,
              allergeneManualeInput: allergeManuale,
              note: tp.note_tavolo || ''
            }
          } else {
            occupatiDaAltri.push(tp.tavolo_id)
          }
        })
        setTavoliOccupati(occupatiDaAltri)
        setTavoliSelezionati(giaMiei)
        setDettagliTavoli(dettagli)
      })
  }

  function toggleTavolo(tavoloId) {
    if (tavoliOccupati.indexOf(tavoloId) !== -1) return
    setTavoliSelezionati(function(prev) {
      if (prev.indexOf(tavoloId) !== -1) {
        setDettagliTavoli(function(d) {
          var next = Object.assign({}, d)
          delete next[tavoloId]
          return next
        })
        return prev.filter(function(id) { return id !== tavoloId })
      } else {
        setDettagliTavoli(function(d) {
          var next = Object.assign({}, d)
          if (!next[tavoloId]) next[tavoloId] = { ospiti: 0, bambini: 0, allergeni: [], allergeneManualeInput: '', note: '' }
          return next
        })
        return prev.concat([tavoloId])
      }
    })
  }

  function aggiornaDettaglio(tavoloId, campo, valore) {
    setDettagliTavoli(function(prev) {
      var next = Object.assign({}, prev)
      next[tavoloId] = Object.assign({}, next[tavoloId])
      next[tavoloId][campo] = valore
      return next
    })
  }

  function toggleAllergene(tavoloId, allergeneId) {
    setDettagliTavoli(function(prev) {
      var next = Object.assign({}, prev)
      var cur = next[tavoloId] || { ospiti: 0, bambini: 0, allergeni: [], allergeneManualeInput: '', note: '' }
      var arr = cur.allergeni.slice()
      var idx = arr.indexOf(allergeneId)
      if (idx !== -1) { arr.splice(idx, 1) } else { arr.push(allergeneId) }
      next[tavoloId] = Object.assign({}, cur, { allergeni: arr })
      return next
    })
  }

  function ospitiAssegnati() {
    var tot = 0
    tavoliSelezionati.forEach(function(id) { tot += parseInt((dettagliTavoli[id] || {}).ospiti || 0, 10) })
    return tot
  }

  function bambiniAssegnati() {
    var tot = 0
    tavoliSelezionati.forEach(function(id) { tot += parseInt((dettagliTavoli[id] || {}).bambini || 0, 10) })
    return tot
  }

  function handleSalva() {
    setSaving(true)
    supabase.from('tavoli_prenotazioni').delete()
      .eq('prenotazione_id', prenotazione.id).eq('data', dateStr).eq('turno', turnoDb(turno))
      .then(function(result) {
        if (result.error) { setSaving(false); alert('Errore: ' + result.error.message); return }
        if (tavoliSelezionati.length === 0) { setSaving(false); onClose(true); return }
        var righe = tavoliSelezionati.map(function(tavoloId) {
          var det = dettagliTavoli[tavoloId] || {}
          var allergeFinali = (det.allergeni || []).slice()
          if (det.allergeneManualeInput && det.allergeneManualeInput.trim()) {
            allergeFinali.push(det.allergeneManualeInput.trim())
          }
          return {
            prenotazione_id: prenotazione.id,
            tavolo_id: tavoloId,
            data: dateStr,
            turno: turnoDb(turno),
            n_ospiti_assegnati: parseInt(det.ospiti || 0, 10),
            n_bambini_tavolo: parseInt(det.bambini || 0, 10),
            allergie_tavolo: allergeFinali,
            note_tavolo: det.note || null
          }
        })
        return supabase.from('tavoli_prenotazioni').insert(righe)
      })
      .then(function(result) {
        setSaving(false)
        if (result && result.error) { alert('Errore salvataggio: ' + result.error.message); return }
        onClose(true)
      })
  }

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
      return {
        decina: k,
        tavoli: colonneMap[k].slice().sort(function(a, b) {
          return parseInt(a.nome.replace(/[^0-9]/g, ''), 10) - parseInt(b.nome.replace(/[^0-9]/g, ''), 10)
        })
      }
    })
  }

  function getNomeTavolo(id) {
    var trovato = null
    Object.values(tavoliPerSala).forEach(function(lista) {
      lista.forEach(function(t) { if (t.id === id) trovato = t })
    })
    return trovato ? trovato.nome : id
  }

  var ospitiTot = ospitiAssegnati()
  var bambiniTot = bambiniAssegnati()
  var ospitiRimanenti = totOspiti - ospitiTot
  var bambiniRimanenti = totBambini - bambiniTot

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[92vh]">

        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Assegna Tavoli</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {customer.last_name + ' ' + customer.first_name + ' · ' + totOspiti + ' ospiti (' + (totOspiti - totBambini) + ' adulti + ' + totBambini + ' bambini)'}
            </p>
          </div>
          <button onClick={function() { onClose(false) }} className="text-gray-400 hover:text-gray-600 p-1"><X size={22} /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40"><p className="text-gray-400 text-sm">Caricamento...</p></div>
        ) : (
          <>
            <div className="px-5 pt-3 pb-2 flex-shrink-0">
              <div className="flex gap-3 flex-wrap">
                <div className={"flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm " + (ospitiRimanenti < 0 ? 'bg-red-50 text-red-700' : ospitiRimanenti === 0 && ospitiTot > 0 ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700')}>
                  <Users size={14} />
                  <span className="font-medium">{ospitiTot + ' / ' + totOspiti + ' ospiti assegnati'}</span>
                  {ospitiRimanenti > 0 && <span className="text-xs opacity-75">({ospitiRimanenti} rimanenti)</span>}
                  {ospitiRimanenti < 0 && <span className="text-xs font-semibold">troppi!</span>}
                </div>
                {totBambini > 0 && (
                  <div className={"flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm " + (bambiniRimanenti < 0 ? 'bg-red-50 text-red-700' : bambiniRimanenti === 0 && bambiniTot > 0 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700')}>
                    <Baby size={14} />
                    <span className="font-medium">{bambiniTot + ' / ' + totBambini + ' bambini assegnati'}</span>
                  </div>
                )}
              </div>
            </div>

            {sale.length > 1 && (
              <div className="flex gap-2 px-5 pb-2 flex-shrink-0 overflow-x-auto">
                {sale.map(function(s) {
                  return (
                    <button key={s.id} onClick={function() { setSalaAttiva(s.id) }}
                      className={"px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors " + (salaAttiva === s.id ? 'bg-wine-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                      {s.nome}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-2">
              {sale.map(function(s) {
                if (s.id !== salaAttiva) return null
                var tavoli = tavoliPerSala[s.id] || []
                if (tavoli.length === 0) return <div key={s.id} className="text-center py-8 text-gray-400 text-sm">Nessun tavolo configurato.</div>
                var griglia = buildGriglia(tavoli)
                return (
                  <div key={s.id} className="mb-4">
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
                                <button key={t.id} onClick={function() { toggleTavolo(t.id) }} disabled={isOccupato}
                                  className={"w-16 h-12 rounded-lg border-2 text-sm font-mono font-semibold transition-all relative " + stile}>
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
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-gray-100 border border-gray-200 inline-block"></span>Libero</span>
                      <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-green-500 inline-block"></span>Selezionato</span>
                      <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-red-100 border border-red-200 inline-block"></span>Occupato</span>
                    </div>
                  </div>
                )
              })}

              {tavoliSelezionati.length > 0 && (
                <div className="mt-4 space-y-4">
                  <p className="text-sm font-semibold text-gray-700 border-t border-gray-100 pt-3">Dettaglio tavoli selezionati</p>
                  {tavoliSelezionati.map(function(tavoloId) {
                    var det = dettagliTavoli[tavoloId] || { ospiti: 0, bambini: 0, allergeni: [], allergeneManualeInput: '', note: '' }
                    var nomeTavolo = getNomeTavolo(tavoloId)
                    return (
                      <div key={tavoloId} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                        <p className="font-mono font-semibold text-wine-700 text-sm mb-3">{nomeTavolo}</p>
                        <div className="flex gap-3 mb-3">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Ospiti al tavolo</label>
                            <input type="number" min="0" max={totOspiti} value={det.ospiti}
                              onChange={function(e) { aggiornaDettaglio(tavoloId, 'ospiti', e.target.value) }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-600 mb-1">di cui bambini</label>
                            <input type="number" min="0" max={totBambini} value={det.bambini}
                              onChange={function(e) { aggiornaDettaglio(tavoloId, 'bambini', e.target.value) }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-gray-600 mb-2">Allergeni / Intolleranze</label>
                          <div className="flex flex-wrap gap-1.5">
                            {ALLERGENI_14.map(function(all) {
                              var attivo = (det.allergeni || []).indexOf(all.id) !== -1
                              return (
                                <button key={all.id} onClick={function() { toggleAllergene(tavoloId, all.id) }}
                                  className={"px-2 py-1 rounded-md text-xs font-medium border transition-colors " + (attivo ? 'bg-red-500 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-red-50 hover:border-red-300')}>
                                  {all.label}
                                </button>
                              )
                            })}
                          </div>
                          <input type="text" placeholder="Altro allergene (scrivi qui)"
                            value={det.allergeneManualeInput || ''}
                            onChange={function(e) { aggiornaDettaglio(tavoloId, 'allergeneManualeInput', e.target.value) }}
                            className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-wine-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Note tavolo</label>
                          <input type="text" placeholder="es. menù vegetariano, sediolino bambino, cambio menù..."
                            value={det.note || ''}
                            onChange={function(e) { aggiornaDettaglio(tavoloId, 'note', e.target.value) }}
                            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-wine-500" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-3 p-5 border-t border-gray-100 flex-shrink-0">
              <button onClick={function() { onClose(false) }} className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Annulla</button>
              <button onClick={handleSalva} disabled={saving}
                className={"flex-1 py-3 rounded-xl text-sm font-medium transition-colors " + (saving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-wine-700 text-white hover:bg-wine-800')}>
                {saving ? 'Salvataggio...' : 'Salva assegnazione'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── STAMPE ───────────────────────────────────────────────────
function StampaMenu(props) {
  var dateStr = props.dateStr
  var turno = props.turno
  var reservations = props.reservations
  var sale = props.sale
  var [aperto, setAperto] = useState(false)
  var ref = useRef(null)

  useEffect(function() {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setAperto(false)
    }
    document.addEventListener('mousedown', handleClick)
    return function() { document.removeEventListener('mousedown', handleClick) }
  }, [])

  function stampaSala(sala) {
    setAperto(false)
    supabase.from('tavoli_prenotazioni')
      .select('prenotazione_id, tavolo_id, n_ospiti_assegnati, n_bambini_tavolo, allergie_tavolo, note_tavolo, tavoli_sala(nome, sala_id)')
      .eq('data', dateStr).eq('turno', turnoDb(turno))
      .then(function(result) {
        var righe = (result.data || []).filter(function(r) { return r.tavoli_sala && r.tavoli_sala.sala_id === sala.id })
        var perTavolo = {}
        righe.forEach(function(r) {
          var nomeTavolo = r.tavoli_sala.nome
          if (!perTavolo[nomeTavolo]) perTavolo[nomeTavolo] = []
          var res = reservations.find(function(x) { return x.id === r.prenotazione_id })
          if (res) perTavolo[nomeTavolo].push({ res: res, tp: r })
        })
        var turnoLabel = turno === 'lunch' ? 'Pranzo' : 'Cena'
        var html = '<html><head><title>Sala ' + sala.nome + '</title>'
        html += '<style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px;} h1{font-size:16px;margin-bottom:4px;} .sub{color:#666;font-size:11px;margin-bottom:16px;} table{width:100%;border-collapse:collapse;margin-bottom:12px;} th{background:#7a1b2e;color:white;padding:6px 8px;text-align:left;font-size:11px;} td{padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;} .tavolo-title{font-weight:bold;font-size:13px;color:#7a1b2e;margin:14px 0 4px;} .badge{display:inline-block;background:#fee2e2;color:#991b1b;border-radius:4px;padding:1px 5px;font-size:10px;margin-right:3px;} .note{color:#666;font-style:italic;font-size:11px;} @media print{body{padding:8px;}}</style>'
        html += '</head><body>'
        html += '<h1>Sala: ' + sala.nome + ' \u2014 ' + turnoLabel + '</h1>'
        html += '<div class="sub">' + formatDateDisplay(dateStr) + '</div>'
        var nomiTavoli = Object.keys(perTavolo).sort()
        if (nomiTavoli.length === 0) {
          html += '<p>Nessun tavolo assegnato per questa sala in questo turno.</p>'
        } else {
          nomiTavoli.forEach(function(nomeTavolo) {
            html += '<div class="tavolo-title">Tavolo ' + nomeTavolo + '</div>'
            html += '<table><tr><th>Cliente</th><th>Ospiti</th><th>Bambini</th><th>Allergeni</th><th>Note</th></tr>'
            perTavolo[nomeTavolo].forEach(function(item) {
              var res = item.res
              var tp = item.tp
              var cliente = res.customers ? (res.customers.last_name + ' ' + res.customers.first_name) : '\u2014'
              var allerge = tp.allergie_tavolo || []
              var allergeLabel = allerge.length > 0 ? allerge.map(function(a) { return '<span class="badge">' + a + '</span>' }).join('') : '\u2014'
              html += '<tr>'
              html += '<td>' + cliente + '</td>'
              html += '<td>' + (tp.n_ospiti_assegnati || res.guests_count) + '</td>'
              html += '<td>' + (tp.n_bambini_tavolo || 0) + '</td>'
              html += '<td>' + allergeLabel + '</td>'
              html += '<td class="note">' + (tp.note_tavolo || '\u2014') + '</td>'
              html += '</tr>'
            })
            html += '</table>'
          })
        }
        html += '</body></html>'
        var w = window.open('', '_blank')
        w.document.write(html)
        w.document.close()
        w.print()
      })
  }

  function stampaCucina() {
    setAperto(false)
    supabase.from('tavoli_prenotazioni')
      .select('prenotazione_id, tavolo_id, n_ospiti_assegnati, n_bambini_tavolo, allergie_tavolo, note_tavolo, tavoli_sala(nome)')
      .eq('data', dateStr).eq('turno', turnoDb(turno))
      .then(function(result) {
        var righe = result.data || []
        var perPrenotazione = {}
        righe.forEach(function(r) {
          if (!perPrenotazione[r.prenotazione_id]) perPrenotazione[r.prenotazione_id] = []
          perPrenotazione[r.prenotazione_id].push(r)
        })
        var turnoLabel = turno === 'lunch' ? 'Pranzo' : 'Cena'
        var html = '<html><head><title>Lista Cucina</title>'
        html += '<style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px;} h1{font-size:16px;margin-bottom:4px;} .sub{color:#666;font-size:11px;margin-bottom:16px;} .card{border:1px solid #ddd;border-radius:6px;padding:10px 14px;margin-bottom:10px;page-break-inside:avoid;} .cliente{font-weight:bold;font-size:13px;} .row{display:flex;gap:16px;margin-top:4px;flex-wrap:wrap;} .badge-all{display:inline-block;background:#fee2e2;color:#991b1b;border-radius:4px;padding:1px 5px;font-size:10px;margin-right:3px;} .badge-bam{display:inline-block;background:#fef9c3;color:#854d0e;border-radius:4px;padding:1px 5px;font-size:10px;} .badge-tav{display:inline-block;background:#e0f2fe;color:#075985;border-radius:4px;padding:1px 5px;font-size:10px;margin-right:3px;} .note{color:#666;font-style:italic;font-size:11px;margin-top:3px;} .avviso{background:#fff7ed;border:1px solid #fed7aa;border-radius:4px;padding:4px 8px;font-size:11px;color:#9a3412;margin-top:4px;} @media print{body{padding:8px;}}</style>'
        html += '</head><body>'
        html += '<h1>Lista Cucina \u2014 ' + turnoLabel + '</h1>'
        html += '<div class="sub">' + formatDateDisplay(dateStr) + ' \u00b7 ' + reservations.length + ' prenotazioni</div>'
        reservations.forEach(function(res) {
          var tavRighe = perPrenotazione[res.id] || []
          var tavoliNomi = tavRighe.map(function(r) { return r.tavoli_sala ? r.tavoli_sala.nome : '' }).filter(Boolean)
          var allergeTavoli = []
          var noteTavoli = []
          var bambiniTot = 0
          tavRighe.forEach(function(r) {
            ;(r.allergie_tavolo || []).forEach(function(a) { if (allergeTavoli.indexOf(a) === -1) allergeTavoli.push(a) })
            if (r.note_tavolo) noteTavoli.push((r.tavoli_sala ? r.tavoli_sala.nome : '') + ': ' + r.note_tavolo)
            bambiniTot += r.n_bambini_tavolo || 0
          })
          var allergeClienti = res.has_allergen_alerts ? ['\u26a0 vedi scheda cliente'] : []
          var tuttiAllergeni = allergeClienti.concat(allergeTavoli)
          html += '<div class="card">'
          html += '<div class="cliente">' + (res.customers ? res.customers.last_name + ' ' + res.customers.first_name : '\u2014') + '</div>'
          html += '<div class="row">'
          html += '<span>\ud83d\udc65 ' + res.guests_count + ' ospiti</span>'
          if (bambiniTot > 0) html += '<span class="badge-bam">\ud83c\udf7c ' + bambiniTot + ' bambini</span>'
          if (res.requested_time) html += '<span>\u23f0 ' + res.requested_time.substring(0, 5) + '</span>'
          html += '</div>'
          if (tavoliNomi.length > 0) {
            html += '<div style="margin-top:4px;">' + tavoliNomi.map(function(n) { return '<span class="badge-tav">' + n + '</span>' }).join('') + '</div>'
          }
          if (tuttiAllergeni.length > 0) {
            html += '<div class="avviso">\u26a0 Allergeni: ' + tuttiAllergeni.map(function(a) { return '<span class="badge-all">' + a + '</span>' }).join('') + '</div>'
          }
          if (noteTavoli.length > 0) html += '<div class="note">\ud83d\udcdd ' + noteTavoli.join(' | ') + '</div>'
          if (res.special_requests) html += '<div class="note">\u2605 ' + res.special_requests + '</div>'
          html += '</div>'
        })
        html += '</body></html>'
        var w = window.open('', '_blank')
        w.document.write(html)
        w.document.close()
        w.print()
      })
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={function() { setAperto(!aperto) }}
        className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors font-medium shadow-sm text-sm">
        <Printer size={16} />
        <span>Stampa</span>
        <ChevronDown size={14} />
      </button>
      {aperto && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 min-w-48 overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">Per sala</div>
          {sale.map(function(s) {
            return (
              <button key={s.id} onClick={function() { stampaSala(s) }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                {'🪑 ' + s.nome}
              </button>
            )
          })}
          <div className="border-t border-gray-100">
            <button onClick={stampaCucina}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              {'👨\u200d🍳 Lista Cucina'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PAGINA GIORNALIERA ───────────────────────────────────────
function ReservationDay() {
  var params = useParams()
  var dateStr = params.date
  var navigate = useNavigate()

  var [selectedMeal, setSelectedMeal] = useState('lunch')
  var [reservations, setReservations] = useState([])
  var [loading, setLoading] = useState(true)
  var [summary, setSummary] = useState({ total: 0, adults: 0, children: 0, count: 0 })
  var [settings, setSettings] = useState({ max_covers_lunch: 60, max_covers_dinner: 60 })
  var [eventi, setEventi] = useState([])
  var [showFormEvento, setShowFormEvento] = useState(false)
  var [eventoInModifica, setEventoInModifica] = useState(null)
  var [pannelloTavoli, setPannelloTavoli] = useState(null)
  var [tavoliAssegnati, setTavoliAssegnati] = useState({})
  var [sale, setSale] = useState([])

  useEffect(function() {
    loadSettings()
    loadEventi()
    loadSale()
  }, [])

  useEffect(function() { loadReservations() }, [dateStr, selectedMeal])

  function loadSale() {
    supabase.from('sale').select('*').eq('attiva', true).order('ordine', { ascending: true })
      .then(function(result) { if (!result.error && result.data) setSale(result.data) })
  }

  function loadSettings() {
    supabase.from('restaurant_settings').select('*').limit(1).single()
      .then(function(result) { if (!result.error && result.data) setSettings(result.data) })
  }

  function loadEventi() {
    supabase.from('event_dates').select('*').eq('event_date', dateStr).order('created_at', { ascending: true })
      .then(function(result) { if (!result.error) setEventi(result.data || []) })
  }

  function caricaBadgeTavoli(meal) {
    supabase.from('tavoli_prenotazioni')
      .select('prenotazione_id, tavolo_id, allergie_tavolo, tavoli_sala(nome)')
      .eq('data', dateStr).eq('turno', turnoDb(meal))
      .then(function(result) {
        if (result.error || !result.data) return
        var mappa = {}
        result.data.forEach(function(tp) {
          if (!mappa[tp.prenotazione_id]) mappa[tp.prenotazione_id] = { nomi: [], hasAllergeni: false }
          if (tp.tavoli_sala && tp.tavoli_sala.nome) mappa[tp.prenotazione_id].nomi.push(tp.tavoli_sala.nome)
          if ((tp.allergie_tavolo || []).length > 0) mappa[tp.prenotazione_id].hasAllergeni = true
        })
        setTavoliAssegnati(mappa)
      })
  }

  function loadReservations() {
    setLoading(true)
    supabase.from('reservations')
      .select('*, customers(id, first_name, last_name, phone, email, category)')
      .eq('reservation_date', dateStr).eq('meal_type', selectedMeal)
      .order('requested_time', { ascending: true, nullsFirst: false })
      .then(function(result) {
        if (result.error) { setReservations([]) } else { setReservations(result.data || []) }
        return supabase.from('reservations')
          .select('guests_count, adults_count, children_count')
          .eq('reservation_date', dateStr).eq('meal_type', selectedMeal)
          .not('status', 'in', '("cancelled")')
      })
      .then(function(result) {
        if (!result.error && result.data) {
          var total = 0; var adults = 0; var children = 0
          result.data.forEach(function(r) { total += r.guests_count; adults += r.adults_count; children += r.children_count })
          setSummary({ total: total, adults: adults, children: children, count: result.data.length })
        }
        setLoading(false)
      })
    caricaBadgeTavoli(selectedMeal)
  }

  function updateStatus(reservationId, newStatus) {
    supabase.from('reservations').update({ status: newStatus }).eq('id', reservationId)
      .then(function(result) {
        if (result.error) { alert('Errore aggiornamento stato.') } else { loadReservations() }
      })
  }

  function handleSaveEvento(eventoSalvato, isModifica) {
    if (isModifica) {
      setEventi(function(prev) { return prev.map(function(ev) { return ev.id === eventoSalvato.id ? eventoSalvato : ev }) })
    } else {
      setEventi(function(prev) { return prev.concat([eventoSalvato]) })
    }
    setShowFormEvento(false)
    setEventoInModifica(null)
  }

  function handleEliminaEvento(id) {
    if (!confirm('Eliminare questo evento? I movimenti di cassa collegati non vengono eliminati.')) return
    supabase.from('event_dates').delete().eq('id', id).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message) }
      else { setEventi(function(prev) { return prev.filter(function(ev) { return ev.id !== id }) }) }
    })
  }

  function handleChiudiPannelloTavoli(aggiornato) {
    setPannelloTavoli(null)
    if (aggiornato) caricaBadgeTavoli(selectedMeal)
  }

  var maxCovers = selectedMeal === 'lunch' ? settings.max_covers_lunch : settings.max_covers_dinner
  var remainingCovers = maxCovers - summary.total
  var statusLabels = { confirmed: 'Confermata', arrived: 'Arrivato', seated: 'Accomodato', completed: 'Completato', cancelled: 'Cancellata', no_show: 'No Show' }
  var statusColors = { confirmed: 'bg-blue-100 text-blue-800', arrived: 'bg-yellow-100 text-yellow-800', seated: 'bg-green-100 text-green-800', completed: 'bg-gray-100 text-gray-600', cancelled: 'bg-red-100 text-red-800', no_show: 'bg-orange-100 text-orange-800' }
  var categoryColors = { standard: 'bg-gray-100 text-gray-700', vip: 'bg-amber-100 text-amber-800', press: 'bg-purple-100 text-purple-800', business: 'bg-blue-100 text-blue-800', hotel_guest: 'bg-green-100 text-green-800' }
  var categoryLabels = { standard: 'Standard', vip: 'VIP', press: 'Stampa', business: 'Business', hotel_guest: 'Ospite Hotel' }
  var activeReservations = reservations.filter(function(r) { return r.status !== 'cancelled' })
  var cancelledReservations = reservations.filter(function(r) { return r.status === 'cancelled' })
  var eventiConfermati = eventi.filter(function(ev) { return ev.event_type === 'confirmed' })
  var eventiOpzione = eventi.filter(function(ev) { return ev.event_type === 'option' })

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button onClick={function() { navigate('/prenotazioni') }} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
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
        <div className="flex gap-2 flex-wrap">
          <StampaMenu dateStr={dateStr} turno={selectedMeal} reservations={activeReservations} sale={sale} />
          <button onClick={function() { setEventoInModifica(null); setShowFormEvento(true) }}
            className="inline-flex items-center gap-2 bg-amber-500 text-white px-4 py-2.5 rounded-xl hover:bg-amber-600 transition-colors font-medium shadow-sm text-sm">
            <Calendar size={16} />
            <span>Nuovo Evento</span>
          </button>
          <Link to={"/prenotazioni/nuova?date=" + dateStr + "&meal=" + selectedMeal}
            className="inline-flex items-center gap-2 bg-wine-700 text-white px-4 py-2.5 rounded-xl hover:bg-wine-800 transition-colors font-medium shadow-sm text-sm">
            <Plus size={16} />
            <span>Nuova Prenotazione</span>
          </Link>
        </div>
      </div>

      {eventi.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-5">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <Star size={14} className="text-amber-500" />
            {eventi.length === 1 ? 'Evento del giorno' : 'Eventi del giorno'}
          </h2>
          <div className="space-y-2">
            {eventi.map(function(ev) {
              return <CardEvento key={ev.id} evento={ev}
                onModifica={function() { setEventoInModifica(ev); setShowFormEvento(true) }}
                onElimina={handleEliminaEvento} />
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {['lunch', 'dinner'].map(function(meal) {
          return (
            <button key={meal} onClick={function() { setSelectedMeal(meal) }}
              className={"flex-1 py-3 px-4 rounded-xl font-medium text-center transition-colors " + (selectedMeal === meal ? 'bg-wine-700 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50')}>
              {meal === 'lunch' ? 'Pranzo' : 'Cena'}
            </button>
          )
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-6 flex-wrap">
          <div><p className="text-sm text-gray-500">Prenotazioni</p><p className="text-2xl font-bold text-gray-900">{summary.count}</p></div>
          <div><p className="text-sm text-gray-500">Ospiti</p><p className="text-2xl font-bold text-gray-900">{summary.total}</p></div>
          <div><p className="text-sm text-gray-500 flex items-center gap-1"><User size={12} />Adulti</p><p className="text-xl font-bold text-gray-700">{summary.adults}</p></div>
          <div><p className="text-sm text-gray-500 flex items-center gap-1"><Baby size={12} />Bambini</p><p className="text-xl font-bold text-gray-700">{summary.children}</p></div>
          <div><p className="text-sm text-gray-500">Disponibili</p><p className={"text-2xl font-bold " + (remainingCovers < 10 ? 'text-red-600' : 'text-green-600')}>{remainingCovers}</p></div>
        </div>
        <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
          <div className={"h-2 rounded-full transition-all " + (remainingCovers < 10 ? 'bg-red-500' : 'bg-wine-600')}
            style={{ width: Math.min((summary.total / maxCovers) * 100, 100) + '%' }} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32"><p className="text-gray-500">Caricamento prenotazioni...</p></div>
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
            var tavoliInfo = tavoliAssegnati[res.id] || { nomi: [], hasAllergeni: false }
            return (
              <div key={res.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:border-wine-300 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{customer.last_name + ' ' + customer.first_name}</h3>
                      {customer.category !== 'standard' && (
                        <span className={"px-2 py-0.5 rounded-full text-xs font-medium " + categoryColors[customer.category]}>{categoryLabels[customer.category]}</span>
                      )}
                      {(res.has_allergen_alerts || tavoliInfo.hasAllergeni) && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          <AlertTriangle size={12} />Allergeni
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1"><Users size={14} />{res.guests_count + ' ospiti (' + res.adults_count + ' ad. + ' + res.children_count + ' ba.)'}</span>
                      {timeStr && <span className="flex items-center gap-1"><Clock size={14} />{timeStr}</span>}
                      {customer.phone && (
                        <a href={"tel:" + customer.phone} className="flex items-center gap-1 hover:text-wine-700" onClick={function(e) { e.stopPropagation() }}>
                          <Phone size={14} />{customer.phone}
                        </a>
                      )}
                    </div>
                    {tavoliInfo.nomi.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <TableProperties size={13} className="text-wine-600" />
                        {tavoliInfo.nomi.map(function(nome) {
                          return <span key={nome} className="px-2 py-0.5 rounded-md text-xs font-mono font-medium bg-wine-50 text-wine-700 border border-wine-200">{nome}</span>
                        })}
                      </div>
                    )}
                    {res.notes && <p className="text-sm text-gray-600 mt-2">{res.notes}</p>}
                    {res.special_requests && <p className="text-sm text-orange-600 mt-1">{'★ ' + res.special_requests}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={"px-3 py-1 rounded-full text-xs font-medium " + statusColors[res.status]}>{statusLabels[res.status]}</span>
                    <div className="flex gap-1 flex-wrap justify-end">
                      <button onClick={function() { setPannelloTavoli(res) }}
                        className={"text-xs px-2 py-1 rounded border transition-colors " + (tavoliInfo.nomi.length > 0 ? 'bg-wine-50 text-wine-700 border-wine-200 hover:bg-wine-100' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100')}
                        title="Assegna tavoli"><TableProperties size={13} /></button>
                      {res.status === 'confirmed' && <button onClick={function() { updateStatus(res.id, 'arrived') }} className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 rounded border border-yellow-200 hover:bg-yellow-100">Arrivato</button>}
                      {res.status === 'arrived' && <button onClick={function() { updateStatus(res.id, 'seated') }} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded border border-green-200 hover:bg-green-100">Accomodato</button>}
                      {res.status === 'seated' && <button onClick={function() { updateStatus(res.id, 'completed') }} className="text-xs px-2 py-1 bg-gray-50 text-gray-700 rounded border border-gray-200 hover:bg-gray-100">Completato</button>}
                      {(res.status === 'confirmed' || res.status === 'arrived') && <button onClick={function() { updateStatus(res.id, 'no_show') }} className="text-xs px-2 py-1 bg-orange-50 text-orange-700 rounded border border-orange-200 hover:bg-orange-100">No Show</button>}
                      {res.status === 'confirmed' && <button onClick={function() { updateStatus(res.id, 'cancelled') }} className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded border border-red-200 hover:bg-red-100">Cancella</button>}
                      <button onClick={function() { navigate('/prenotazioni/' + res.id + '/modifica') }} className="text-xs px-2 py-1 bg-wine-50 text-wine-700 rounded border border-wine-200 hover:bg-wine-100">Modifica</button>
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
              return (
                <div key={res.id} className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 line-through">{res.customers.last_name + ' ' + res.customers.first_name + ' - ' + res.guests_count + ' ospiti'}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">Cancellata</span>
                  </div>
                </div>
              )
            })}
          </div>
        </details>
      )}

      <div className="h-8" />

      {showFormEvento && (
        <FormEvento dateStr={dateStr} evento={eventoInModifica} onSave={handleSaveEvento}
          onClose={function() { setShowFormEvento(false); setEventoInModifica(null) }} />
      )}

      {pannelloTavoli && (
        <PannelloTavoli prenotazione={pannelloTavoli} dateStr={dateStr} turno={selectedMeal} onClose={handleChiudiPannelloTavoli} />
      )}

    </div>
  )
}

export default ReservationDay
