import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, ArrowLeft, Users, Clock, Phone, AlertTriangle, CalendarDays, Baby, User, Star, Calendar, TableProperties, X, Check, Printer, ChevronDown, BedDouble } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { severitaLabel } from '../components/AllergeniEditor'

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

// Rende sicuro un testo libero (note, titoli) dentro l'HTML delle stampe:
// un carattere < o & scritto in una nota non deve poter rompere la pagina.
function esc(testo) {
  if (testo == null) return ''
  return String(testo)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
}

// ----------------------------------------------------------
// CHI SIEDE A QUESTO TAVOLO (migrazione 52)
//
// Una copia sola per tutte e tre le stampe, per la lista del giorno e
// per il pannello tavoli (regola 31).
//
// ⚠️ Queste funzioni servono a MOSTRARE, non a contare. Il numero degli
// ospiti resta guests_count, scritto a mano: a tavola siede anche chi non
// ha una scheda, quindi il numero dei clienti collegati non e' e non
// diventera' mai un numero di coperti.
// ----------------------------------------------------------

// Se la prenotazione non ha ancora righe di legame si torna esattamente
// al comportamento di prima della 52: intestatario e camera della
// prenotazione. Nessuna prenotazione puo' restare senza un nome.
function clientiDellaPrenotazione(res, clientiTavolo) {
  var righe = (clientiTavolo && clientiTavolo[res.id]) ? clientiTavolo[res.id] : []
  if (righe.length > 0) return righe
  return [{
    cliente_id: res.customer_id || null,
    nome: res.customers
      ? (res.customers.last_name + ' ' + res.customers.first_name)
      : (res.gift_card ? res.gift_card.codice : '\u2014'),
    camera: res.camera || '',
    allergeni: [],
    allergie_libere: ''
  }]
}

// Nomi per le stampe, con la camera di ciascuno quando c'e'. La camera si
// stampa perche' e' il dato che serve in servizio: sapere che quel tavolo
// sono gli ospiti di Aorivola cambia come li si tratta.
//
// In coda vengono aggiunte le camere del RIEPILOGO della prenotazione che
// nessun nome si e' preso: sono le camere scritte a mano per ospiti che
// una scheda non ce l'hanno. Fino alla prova del 31 agosto sparivano da
// tutte e tre le stampe appena i nomi erano piu' di uno, perche' il
// riepilogo si legge solo quando il nome e' uno solo.
//
// La regola della 0.4 v55 NON cambia: se una camera sta sia sulla riga di
// una persona sia nel riepilogo, vince quella per persona e si stampa una
// volta sola. Qui si stampa soltanto quello che avanza.
function clientiPerStampa(res, clientiTavolo) {
  var elenco = clientiDellaPrenotazione(res, clientiTavolo)
  var pezzi = []
  var stampate = {}
  for (var i = 0; i < elenco.length; i++) {
    var camera = elenco[i].camera
    // Le prenotazioni nate prima della 52 hanno la camera nel riepilogo
    // della prenotazione, non sulla riga della persona.
    if (!camera && elenco.length === 1) camera = res.camera || ''
    var t = esc(elenco[i].nome)
    if (camera) {
      t += ' <span class="camera">\u00b7 ' + esc(camera) + '</span>'
      var suoi = camera.split(',')
      for (var k = 0; k < suoi.length; k++) {
        var chiave = suoi[k].trim().toLowerCase()
        if (chiave !== '') stampate[chiave] = true
      }
    }
    pezzi.push(t)
  }
  var html = pezzi.join('<br>')
  var avanzo = camereAvanzate(res, stampate)
  if (avanzo !== '') {
    // Il <br> davanti non e' cosmetico: la stampa Riepilogo aggancia
    // l'etichetta di categoria al PRIMO pezzo separato da <br>, e senza
    // questo l'avanzo finirebbe dentro quel pezzo quando il nome e' uno
    // solo, rimandando l'etichetta in fondo. E' il difetto della prova B,
    // che non deve poter rientrare da questa porta.
    html += '<br><span class="camera-avanzo">Altre camere: ' + esc(avanzo) + '</span>'
  }
  return html
}

// Le camere del riepilogo della prenotazione che nessun nome si e' gia'
// preso, nell'ordine in cui sono scritte.
//
// Corrispondenza esatta su un pezzo intero, mai una ricerca dentro il
// testo: e' la stessa disciplina di togliCamera() in ReservationForm, e
// per la stessa ragione. Un nome di camera che e' anche una parola comune
// non deve poter sparire perche' compare dentro un'altra parola.
function camereAvanzate(res, stampate) {
  var riepilogo = (res.camera || '').trim()
  if (riepilogo === '') return ''
  var pezzi = riepilogo.split(',')
  var restano = []
  var visti = {}
  for (var i = 0; i < pezzi.length; i++) {
    var pezzo = pezzi[i].trim()
    if (pezzo === '') continue
    var chiave = pezzo.toLowerCase()
    if (stampate[chiave]) continue
    if (visti[chiave]) continue
    visti[chiave] = true
    restano.push(pezzo)
  }
  return restano.join(', ')
}

function etichettaAllergene(a, severita) {
  if (!a) return ''
  var testo = (a.icon ? a.icon + ' ' : '') + a.name
  var sev = severitaLabel(severita)
  if (sev) testo += ' (' + sev + ')'
  return testo
}

// FORMA AGGREGATA — stampa Cucina.
// In cucina conta COSA non deve uscire, non di chi e'. I doppioni si
// tolgono: due persone allergiche al glutine sono una riga sola.
function allergeniAggregati(res, clientiTavolo) {
  var elenco = clientiDellaPrenotazione(res, clientiTavolo)
  var visti = {}
  var out = []
  for (var i = 0; i < elenco.length; i++) {
    var lista = elenco[i].allergeni || []
    for (var j = 0; j < lista.length; j++) {
      var et = etichettaAllergene(lista[j].allergens, lista[j].severity)
      if (et !== '' && !visti[et]) { visti[et] = true; out.push(et) }
    }
    var libero = (elenco[i].allergie_libere || '').trim()
    if (libero !== '' && !visti[libero]) { visti[libero] = true; out.push(libero) }
  }
  return out
}

// FORMA PER NOME — stampe Sala e Riepilogo Prenotazioni.
// Chi accoglie e chi porta il piatto deve poter dire il nome.
function allergeniPerNome(res, clientiTavolo) {
  var elenco = clientiDellaPrenotazione(res, clientiTavolo)
  var righe = []
  for (var i = 0; i < elenco.length; i++) {
    var badge = []
    var lista = elenco[i].allergeni || []
    for (var j = 0; j < lista.length; j++) {
      var et = etichettaAllergene(lista[j].allergens, lista[j].severity)
      if (et !== '') badge.push('<span class="badge">' + esc(et) + '</span>')
    }
    var libero = (elenco[i].allergie_libere || '').trim()
    if (libero !== '') badge.push('<span class="badge">' + esc(libero) + '</span>')
    if (badge.length === 0) continue
    if (elenco.length === 1) { righe.push(badge.join('')) }
    else { righe.push('<strong>' + esc(elenco[i].nome) + '</strong> ' + badge.join('')) }
  }
  return righe.join('<br>')
}

// Nomi per lo schermo (lista del giorno e pannello tavoli).
function nomiClienti(res, clientiTavolo) {
  var elenco = clientiDellaPrenotazione(res, clientiTavolo)
  var nomi = []
  for (var i = 0; i < elenco.length; i++) { nomi.push(elenco[i].nome) }
  return nomi
}

// Costruisce lista servizi di una tipologia gift card
function serviziTipologia(t) {
  if (!t) return []
  var s = []
  if (t.pernottamento) s.push('🏨 Pernottamento ' + (t.notti ? t.notti + ' notte/i' : ''))
  if (t.calice_benvenuto) s.push('🥂 Calice di benvenuto')
  if (t.wine_tour) s.push('🍷 Wine Tour')
  if (t.visita_orto) s.push('🌱 Visita all\'orto')
  if (t.cooking_class) s.push('👨‍🍳 Cooking Class')
  if (t.degustazione_vini_1) s.push('🍇 ' + t.degustazione_vini_1)
  if (t.degustazione_vini_2) s.push('🍇 ' + t.degustazione_vini_2)
  if (t.tipologia_pasto_1) s.push('🍽️ ' + t.tipologia_pasto_1)
  if (t.tipologia_pasto_2) s.push('🍽️ ' + t.tipologia_pasto_2)
  if (t.omaggio) s.push('🎁 ' + t.omaggio)
  return s
}

// Badge gift card cliccabile con popover servizi
function BadgeGiftCard(props) {
  var codice = props.codice
  var tipologia = props.tipologia
  var [aperto, setAperto] = useState(false)
  var servizi = serviziTipologia(tipologia)
  return (
    <span className="relative inline-block">
      <button type="button" onClick={function(e) { e.stopPropagation(); setAperto(!aperto) }}
        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 hover:bg-purple-200 cursor-pointer">
        🎁 {codice}
        {tipologia && <span className="opacity-80">· {tipologia.nome} ⓘ</span>}
      </button>
      {aperto && tipologia && (
        <>
          <span className="fixed inset-0 z-40" onClick={function(e) { e.stopPropagation(); setAperto(false) }} />
          <div className="absolute left-0 top-full mt-1 z-50 w-60 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-left" onClick={function(e) { e.stopPropagation() }}>
            <p className="text-xs font-bold text-gray-900 mb-1">{tipologia.nome}</p>
            <p className="text-xs text-gray-400 mb-2">€{tipologia.prezzo}{tipologia.prezzo_per_persona ? ' a persona' : ' per coppia'}</p>
            {servizi.length > 0 ? (
              <ul className="space-y-1">
                {servizi.map(function(srv, i) { return <li key={i} className="text-xs text-gray-700">{srv}</li> })}
              </ul>
            ) : (
              <p className="text-xs text-gray-400 italic">Nessun servizio strutturato</p>
            )}
          </div>
        </>
      )}
    </span>
  )
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
            {isConfirmato ? <Star size={14} className="text-amber-500 fill-amber-500 flex-shrink-0" /> : <Clock size={14} className="text-blue-500 flex-shrink-0" />}
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
  var clientiTavolo = props.clientiTavolo || {}

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
            dettagli[tp.tavolo_id] = {
              ospiti: tp.n_ospiti_assegnati || 0,
              bambini: tp.n_bambini_tavolo || 0,
              allergeni: (tp.allergie_tavolo || []).join(', '),
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
          var next = Object.assign({}, d); delete next[tavoloId]; return next
        })
        return prev.filter(function(id) { return id !== tavoloId })
      } else {
        setDettagliTavoli(function(d) {
          var next = Object.assign({}, d)
          if (!next[tavoloId]) next[tavoloId] = { ospiti: 0, bambini: 0, allergeni: '', note: '' }
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
          var allergeFinali = det.allergeni && det.allergeni.trim() ? [det.allergeni.trim()] : []
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
              {nomiClienti(prenotazione, clientiTavolo).join(', ') + ' \u00b7 ' + totOspiti + ' ospiti (' + (totOspiti - totBambini) + ' adulti + ' + totBambini + ' bambini)'}
              {prenotazione.camera ? ' \u00b7 camera ' + prenotazione.camera : ''}
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
                  {ospitiRimanenti > 0 && <span className="text-xs opacity-75">{'(' + ospitiRimanenti + ' rimanenti)'}</span>}
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
                    var det = dettagliTavoli[tavoloId] || { ospiti: 0, bambini: 0, allergeni: '', note: '' }
                    var nomeTavolo = getNomeTavolo(tavoloId)
                    var hasAllergeni = det.allergeni && det.allergeni.trim().length > 0
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
                          <label className={"block text-xs font-medium mb-1 " + (hasAllergeni ? 'text-red-600' : 'text-gray-600')}>
                            {hasAllergeni ? '\u26a0 Allergeni / Intolleranze segnalati' : 'Allergeni / Intolleranze'}
                          </label>
                          <input type="text"
                            placeholder="Scrivi qui la lista degli allergeni o intolleranze"
                            value={det.allergeni || ''}
                            onChange={function(e) { aggiornaDettaglio(tavoloId, 'allergeni', e.target.value) }}
                            className={"w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 " + (hasAllergeni ? 'border-red-400 bg-red-50 focus:ring-red-400' : 'border-gray-300 focus:ring-wine-500')} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Note tavolo</label>
                          <input type="text" placeholder="es. menu vegetariano, sediolino bambino, cambio menu..."
                            value={det.note || ''}
                            onChange={function(e) { aggiornaDettaglio(tavoloId, 'note', e.target.value) }}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-wine-500" />
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
  var clientiTavolo = props.clientiTavolo || {}
  var eventi = props.eventi || []
  var [aperto, setAperto] = useState(false)
  var ref = useRef(null)

  useEffect(function() {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setAperto(false)
    }
    document.addEventListener('mousedown', handleClick)
    return function() { document.removeEventListener('mousedown', handleClick) }
  }, [])

  var stileBase = '<style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px;} h1{font-size:16px;margin-bottom:4px;} .sub{color:#666;font-size:11px;margin-bottom:16px;} table{width:100%;border-collapse:collapse;margin-bottom:16px;} th{background:#7a1b2e;color:white;padding:6px 8px;text-align:left;font-size:11px;} td{padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;} .section-title{font-weight:bold;font-size:13px;color:#7a1b2e;margin:18px 0 6px;border-bottom:2px solid #7a1b2e;padding-bottom:3px;} .badge{display:inline-block;background:#fee2e2;color:#991b1b;border-radius:4px;padding:1px 5px;font-size:10px;margin-right:3px;} .badge-bam{display:inline-block;background:#fef9c3;color:#854d0e;border-radius:4px;padding:1px 5px;font-size:10px;} .badge-stato{display:inline-block;border-radius:4px;padding:1px 6px;font-size:10px;margin-right:3px;} .note{color:#666;font-style:italic;font-size:11px;} .avviso{background:#fff7ed;border:1px solid #fed7aa;border-radius:4px;padding:4px 8px;font-size:11px;color:#9a3412;margin-top:3px;} .card{border:1px solid #ddd;border-radius:6px;padding:10px 14px;margin-bottom:10px;page-break-inside:avoid;} .cliente{font-weight:bold;font-size:13px;} .camera{font-weight:normal;color:#7a1b2e;font-size:11px;} .camera-avanzo{font-weight:normal;color:#7a1b2e;font-size:11px;margin-top:2px;} .row{display:flex;gap:16px;margin-top:4px;flex-wrap:wrap;align-items:center;} .riepilogo{border:2px solid #7a1b2e;border-radius:6px;padding:8px 12px;margin-bottom:14px;page-break-inside:avoid;} .riep-titolo{font-weight:bold;font-size:12px;color:#7a1b2e;margin-bottom:5px;} table.riep{width:auto;margin:0;} table.riep td{border:none;padding:2px 16px 2px 0;font-size:12px;vertical-align:baseline;} table.riep td.num{font-weight:bold;font-size:15px;text-align:right;} table.riep td.det{color:#555;font-size:11px;} table.riep tr.tot td{border-top:1px solid #7a1b2e;padding-top:5px;font-weight:bold;} table.riep tr.tot td.det{font-weight:normal;} .card-evento{border:1px solid #fcd34d;border-left:4px solid #d97706;background:#fffbeb;border-radius:6px;padding:10px 14px;margin-bottom:10px;page-break-inside:avoid;} tr.riga-totale td{border-top:2px solid #7a1b2e;font-weight:bold;background:#faf5f6;} .totale-blocco{border-top:2px solid #7a1b2e;padding-top:6px;margin-top:4px;font-size:12px;font-weight:bold;page-break-inside:avoid;} @media print{body{padding:8px;}}</style>'

  // Eventi che pesano su QUESTO turno: la stessa regola della pagina a
  // schermo (un evento "Giornata intera" vale sia a pranzo sia a cena).
  function eventiDelTurno() {
    return eventi.filter(function(ev) { return ev.meal_type === turno || ev.meal_type === 'both' })
  }

  // Un unico punto di calcolo per tutte le stampe: i numeri stampati devono
  // coincidere con quelli della testata a schermo, sempre.
  function calcolaTotali() {
    var ospiti = 0
    var adulti = 0
    var bambini = 0
    reservations.forEach(function(r) {
      ospiti += r.guests_count || 0
      adulti += r.adults_count || 0
      bambini += r.children_count || 0
    })
    var evs = eventiDelTurno()
    var ospitiEvento = 0
    var senzaNumero = false
    evs.forEach(function(ev) {
      var cr = ev.covers_reserved
      // Un evento senza numero ospiti non si somma e va dichiarato:
      // un evento reale non ha mai zero ospiti.
      if (cr == null || cr === '' || Number(cr) === 0) senzaNumero = true
      else ospitiEvento += (parseInt(cr, 10) || 0)
    })
    return {
      prenotazioni: reservations.length,
      ospiti: ospiti,
      adulti: adulti,
      bambini: bambini,
      eventi: evs.length,
      ospitiEvento: ospitiEvento,
      senzaNumero: senzaNumero,
      totale: ospiti + ospitiEvento
    }
  }

  // Riquadro in testa a ogni stampa: prenotazioni, eventi, totale del turno.
  function buildRiepilogoHtml() {
    var t = calcolaTotali()
    var piu = t.senzaNumero ? ' +?' : ''
    var html = '<div class="riepilogo">'
    html += '<div class="riep-titolo">Riepilogo del turno</div>'
    html += '<table class="riep">'
    html += '<tr><td>Prenotazioni</td><td class="num">' + t.prenotazioni + '</td>'
    html += '<td class="det">' + t.ospiti + ' ospiti \u00b7 ' + t.adulti + ' adulti + ' + t.bambini + ' bambini</td></tr>'
    html += '<tr><td>Eventi</td><td class="num">' + t.eventi + '</td>'
    html += '<td class="det">' + t.ospitiEvento + piu + ' ospiti previsti</td></tr>'
    html += '<tr class="tot"><td>Totale turno</td><td class="num">' + t.totale + piu + '</td>'
    html += '<td class="det">ospiti attesi \u00b7 ' + t.ospiti + ' da prenotazioni + ' + t.ospitiEvento + piu + ' da eventi</td></tr>'
    html += '</table>'
    if (t.senzaNumero) {
      html += '<div class="avviso">Un evento di questo turno non ha il numero ospiti indicato: il totale resta parziale.</div>'
    }
    html += '</div>'
    return html
  }

  // Sezione con gli eventi del turno. Gli eventi non hanno tavoli assegnati
  // e conoscono solo il numero ospiti complessivo: adulti e bambini restano
  // dichiarati soltanto per le prenotazioni.
  function buildEventiHtml() {
    var evs = eventiDelTurno()
    if (evs.length === 0) return ''
    var totEv = 0
    var senzaNumero = false
    var html = '<div class="section-title">' + (evs.length === 1 ? 'Evento del giorno' : 'Eventi del giorno') + '</div>'
    evs.forEach(function(ev) {
      var cr = ev.covers_reserved
      if (cr == null || cr === '' || Number(cr) === 0) senzaNumero = true
      else totEv += (parseInt(cr, 10) || 0)
      var stato = STATO_EVENTO_LABELS[ev.event_type] || ev.event_type
      var pasto = PASTO_LABELS[ev.meal_type] || ev.meal_type
      var statoColor = ev.event_type === 'confirmed' ? '#fef3c7' : '#dbeafe'
      html += '<div class="card-evento">'
      html += '<div class="cliente">\u2605 ' + esc(ev.title || 'Evento') + '</div>'
      html += '<div class="row">'
      html += '<span class="badge-stato" style="background:' + statoColor + ';color:#111;">' + stato + '</span>'
      html += '<span class="badge-stato" style="background:#f3f4f6;color:#111;">' + pasto + '</span>'
      html += '<span>\ud83d\udc65 ' + ((cr == null || cr === '' || Number(cr) === 0) ? 'numero ospiti non indicato' : cr + ' ospiti previsti') + '</span>'
      html += '</div>'
      if (ev.notes) html += '<div class="note">\ud83d\udcdd ' + esc(ev.notes) + '</div>'
      html += '</div>'
    })
    // Con un evento solo il totale ripeterebbe la riga sopra: si stampa
    // soltanto quando gli eventi sono piu di uno.
    if (evs.length > 1) {
      html += '<div class="totale-blocco">Totale eventi: ' + evs.length + ' \u00b7 ' + totEv + (senzaNumero ? ' +?' : '') + ' ospiti previsti</div>'
    }
    return html
  }

  function buildStampaSalaHtml(salaFiltro, righeAll, turnoLabel) {
    var titolo = salaFiltro ? 'Sala: ' + salaFiltro.nome : 'Riepilogo tutte le sale'
    var html = '<html><head><title>' + titolo + '</title>' + stileBase + '</head><body>'
    html += '<h1>' + titolo + ' \u2014 ' + turnoLabel + '</h1>'
    html += '<div class="sub">' + formatDateDisplay(dateStr) + '</div>'
    html += buildRiepilogoHtml()
    var htmlEventi = buildEventiHtml()
    html += htmlEventi
    if (htmlEventi !== '') html += '<div class="section-title">Tavoli assegnati</div>'
    var saleConTavoli = salaFiltro ? [salaFiltro] : sale
    saleConTavoli.forEach(function(s) {
      var righe = righeAll.filter(function(r) { return r.tavoli_sala && r.tavoli_sala.sala_id === s.id })
      if (!salaFiltro) html += '<div class="section-title">' + esc(s.nome) + '</div>'
      if (righe.length === 0) { html += '<p class="note">Nessun tavolo assegnato per questa sala.</p>'; return }
      var perTavolo = {}
      righe.forEach(function(r) {
        var nomeTavolo = r.tavoli_sala.nome
        if (!perTavolo[nomeTavolo]) perTavolo[nomeTavolo] = []
        var res = reservations.find(function(x) { return x.id === r.prenotazione_id })
        if (res) perTavolo[nomeTavolo].push({ res: res, tp: r })
      })
      var nomiTavoli = Object.keys(perTavolo).sort()
      if (nomiTavoli.length === 0) { html += '<p class="note">Nessun tavolo assegnato.</p>'; return }
      html += '<table><tr><th>Tavolo</th><th>Cliente</th><th>Ospiti</th><th>Bambini</th><th>Allergeni</th><th>Note</th></tr>'
      nomiTavoli.forEach(function(nomeTavolo) {
        perTavolo[nomeTavolo].forEach(function(item) {
          var res = item.res; var tp = item.tp
          var cliente = clientiPerStampa(res, clientiTavolo)
          // Forma c: ogni nome con il proprio elenco. Si aggiungono gli
          // allergeni scritti sul tavolo, che non appartengono a nessuna
          // scheda ma valgono per tutti quelli seduti li'.
          var pezziAllerg = []
          var perNome = allergeniPerNome(res, clientiTavolo)
          if (perNome !== '') pezziAllerg.push(perNome)
          var allerge = tp.allergie_tavolo || []
          if (allerge.length > 0) {
            pezziAllerg.push(allerge.map(function(a) { return '<span class="badge">' + esc(a) + '</span>' }).join(''))
          }
          // La spia della prenotazione si stampa solo se non e' gia' stata
          // sostituita da allergeni veri: meglio un rimando che il nulla.
          if (pezziAllerg.length === 0 && res.has_allergen_alerts) {
            pezziAllerg.push('<span class="badge">\u26a0 vedi scheda cliente</span>')
          }
          var allergeLabel = pezziAllerg.length > 0 ? pezziAllerg.join('<br>') : '\u2014'
          html += '<tr><td><strong>' + esc(nomeTavolo) + '</strong></td><td>' + cliente + '</td>'
          html += '<td>' + (tp.n_ospiti_assegnati || res.guests_count) + '</td>'
          html += '<td>' + (tp.n_bambini_tavolo || 0) + '</td>'
          html += '<td>' + allergeLabel + '</td>'
          html += '<td class="note">' + (tp.note_tavolo ? esc(tp.note_tavolo) : '\u2014') + '</td></tr>'
        })
      })
      html += '</table>'
    })
    html += '</body></html>'
    return html
  }

  function stampaSala(salaFiltro) {
    setAperto(false)
    supabase.from('tavoli_prenotazioni')
      .select('prenotazione_id, tavolo_id, n_ospiti_assegnati, n_bambini_tavolo, allergie_tavolo, note_tavolo, tavoli_sala(nome, sala_id)')
      .eq('data', dateStr).eq('turno', turnoDb(turno))
      .then(function(result) {
        var turnoLabel = turno === 'lunch' ? 'Pranzo' : 'Cena'
        var html = buildStampaSalaHtml(salaFiltro, result.data || [], turnoLabel)
        var w = window.open('', '_blank')
        w.document.write(html)
        w.document.close()
        w.print()
      })
  }

  function stampaCucina() {
    setAperto(false)
    supabase.from('tavoli_prenotazioni')
      .select('prenotazione_id, tavolo_id, n_ospiti_assegnati, n_bambini_tavolo, allergie_tavolo, note_tavolo, tavoli_sala(nome, sala_id)')
      .eq('data', dateStr).eq('turno', turnoDb(turno))
      .then(function(result) {
        var righe = result.data || []
        var perPrenotazione = {}
        righe.forEach(function(r) {
          if (!perPrenotazione[r.prenotazione_id]) perPrenotazione[r.prenotazione_id] = []
          perPrenotazione[r.prenotazione_id].push(r)
        })
        var turnoLabel = turno === 'lunch' ? 'Pranzo' : 'Cena'
        var html = '<html><head><title>Lista Cucina</title>' + stileBase + '</head><body>'
        html += '<h1>Lista Cucina \u2014 ' + turnoLabel + '</h1>'
        html += '<div class="sub">' + formatDateDisplay(dateStr) + ' \u00b7 ' + reservations.length + ' prenotazioni</div>'
        html += buildRiepilogoHtml()
        html += buildEventiHtml()
        html += '<div class="section-title">' + (reservations.length === 1 ? 'Prenotazione' : 'Prenotazioni') + '</div>'
        if (reservations.length === 0) {
          html += '<p class="note">Nessuna prenotazione su questo turno.</p>'
        }
        reservations.forEach(function(res) {
          var tavRighe = perPrenotazione[res.id] || []
          var bambiniTotRes = 0
          tavRighe.forEach(function(r) { bambiniTotRes += r.n_bambini_tavolo || 0 })
          // Forma b: gli allergeni di tutti i clienti, uniti e senza dire
          // di chi sono. In cucina conta cosa non deve uscire.
          var allergeClienti = allergeniAggregati(res, clientiTavolo)
          if (allergeClienti.length === 0 && res.has_allergen_alerts) {
            allergeClienti = ['\u26a0 vedi scheda cliente']
          }
          html += '<div class="card">'
          html += '<div class="cliente">' + clientiPerStampa(res, clientiTavolo) + '</div>'
          html += '<div class="row">'
          html += '<span>\ud83d\udc65 ' + res.guests_count + ' ospiti (' + (res.adults_count || 0) + ' ad. + ' + (res.children_count || 0) + ' ba.)</span>'
          if (bambiniTotRes > 0) html += '<span class="badge-bam">\ud83c\udf7c ' + bambiniTotRes + ' bambini ai tavoli</span>'
          if (res.requested_time) html += '<span>\u23f0 ' + res.requested_time.substring(0, 5) + '</span>'
          html += '</div>'
          if (res.allergie_prenotazione) {
            html += '<div class="avviso">\u26a0 Allergeni prenotazione: ' + esc(res.allergie_prenotazione) + '</div>'
          }
          if (allergeClienti.length > 0) {
            html += '<div class="avviso">\u26a0 Allergeni clienti: ' + allergeClienti.map(function(a) { return '<span class="badge">' + esc(a) + '</span>' }).join('') + '</div>'
          }
          if (res.notes) {
            html += '<div class="note">\ud83d\udcdd ' + esc(res.notes) + '</div>'
          }
          if (tavRighe.length > 0) {
            html += '<table style="margin-top:8px;"><tr><th>Tavolo</th><th>Sala</th><th>Ospiti</th><th>Bambini</th><th>Allergeni tavolo</th><th>Note</th></tr>'
            tavRighe.forEach(function(r) {
              var nomeTav = r.tavoli_sala ? esc(r.tavoli_sala.nome) : '\u2014'
              var salaObj = r.tavoli_sala ? sale.find(function(s) { return s.id === r.tavoli_sala.sala_id }) : null
              var nomeSala = salaObj ? esc(salaObj.nome) : ''
              var allerge = r.allergie_tavolo || []
              var allergeLabel = allerge.length > 0 ? allerge.map(function(a) { return '<span class="badge">' + esc(a) + '</span>' }).join('') : '\u2014'
              html += '<tr><td><strong>' + nomeTav + '</strong></td><td>' + nomeSala + '</td>'
              html += '<td>' + (r.n_ospiti_assegnati || '\u2014') + '</td>'
              html += '<td>' + (r.n_bambini_tavolo || 0) + '</td>'
              html += '<td>' + allergeLabel + '</td>'
              html += '<td class="note">' + (r.note_tavolo ? esc(r.note_tavolo) : '\u2014') + '</td></tr>'
            })
            html += '</table>'
          } else {
            html += '<p class="note" style="margin-top:6px;">Nessun tavolo assegnato</p>'
          }
          if (res.special_requests) html += '<div class="note">\u2605 Richieste speciali: ' + esc(res.special_requests) + '</div>'
          html += '</div>'
        })
        var tot = calcolaTotali()
        var piuTot = tot.senzaNumero ? ' +?' : ''
        html += '<div class="totale-blocco">Totale prenotazioni: ' + tot.prenotazioni + ' \u00b7 ' + tot.ospiti + ' ospiti \u00b7 ' + tot.adulti + ' adulti + ' + tot.bambini + ' bambini</div>'
        html += '<div class="totale-blocco">TOTALE DEL TURNO: ' + tot.totale + piuTot + ' ospiti \u00b7 ' + tot.ospiti + ' da prenotazioni + ' + tot.ospitiEvento + piuTot + ' da eventi</div>'
        html += '</body></html>'
        var w = window.open('', '_blank')
        w.document.write(html)
        w.document.close()
        w.print()
      })
  }

  function stampaPrenotazioni() {
    setAperto(false)
    var turnoLabel = turno === 'lunch' ? 'Pranzo' : 'Cena'
    var statusLabels = { confirmed: 'Confermata', arrived: 'Arrivato', seated: 'Accomodato', completed: 'Completato', no_show: 'No Show' }
    var statusColors = { confirmed: '#dbeafe', arrived: '#fef9c3', seated: '#dcfce7', completed: '#f3f4f6', no_show: '#ffedd5' }
    var categoryLabels = { standard: '', vip: 'VIP', press: 'Stampa', business: 'Business', hotel_guest: 'Ospite Hotel' }

    // Separa prenotazioni con e senza orario, ordina per orario
    var conOrario = reservations.filter(function(r) { return r.requested_time }).slice().sort(function(a, b) { return a.requested_time > b.requested_time ? 1 : -1 })
    var senzaOrario = reservations.filter(function(r) { return !r.requested_time })
    var ordinate = conOrario.concat(senzaOrario)

    var html = '<html><head><title>Prenotazioni ' + turnoLabel + '</title>' + stileBase + '</head><body>'
    html += '<h1>Prenotazioni \u2014 ' + turnoLabel + '</h1>'
    html += '<div class="sub">' + formatDateDisplay(dateStr) + ' \u00b7 ' + reservations.length + ' prenotazioni</div>'
    html += buildRiepilogoHtml()
    html += buildEventiHtml()
    html += '<div class="section-title">' + (reservations.length === 1 ? 'Prenotazione' : 'Prenotazioni') + '</div>'
    html += '<table>'
    html += '<tr><th>Orario</th><th>Cliente</th><th>Ospiti</th><th>Stato</th><th>Allergeni</th><th>Note</th></tr>'
    ordinate.forEach(function(res) {
      var cliente = clientiPerStampa(res, clientiTavolo)
      var cat = res.customers && res.customers.category !== 'standard' ? categoryLabels[res.customers.category] : ''
      var orario = res.requested_time ? res.requested_time.substring(0, 5) : '\u2014'
      var stato = statusLabels[res.status] || res.status
      var statoColor = statusColors[res.status] || '#f3f4f6'
      var ospiti = res.guests_count + ' (' + res.adults_count + ' ad.'
      if (res.children_count > 0) ospiti += ' + ' + res.children_count + ' ba.'
      ospiti += ')'

      // Forma c: ogni nome con il proprio elenco.
      var pezziAll = []
      var perNomeP = allergeniPerNome(res, clientiTavolo)
      if (perNomeP !== '') pezziAll.push(perNomeP)
      if (res.allergie_prenotazione) pezziAll.push('<span class="badge">' + esc(res.allergie_prenotazione) + '</span>')
      if (pezziAll.length === 0 && res.has_allergen_alerts) {
        pezziAll.push('<span class="badge">\u26a0 vedi scheda cliente</span>')
      }
      var allergeLabel = pezziAll.length > 0 ? pezziAll.join('<br>') : '\u2014'

      var noteList = []
      if (res.notes) noteList.push(esc(res.notes))
      if (res.special_requests) noteList.push('\u2605 ' + esc(res.special_requests))
      var noteLabel = noteList.length > 0 ? noteList.join(' | ') : '\u2014'

      html += '<tr>'
      html += '<td>' + orario + '</td>'
      // \u26a0\ufe0f La categoria e' dell'INTESTATARIO, non dell'ultimo nome
      // stampato: va accanto al primo nome, non in fondo al blocco.
      // Con un cliente solo il risultato e' identico a prima.
      var clienteCol = cliente
      if (cat) {
        var righeNomi = cliente.split('<br>')
        righeNomi[0] = righeNomi[0] + ' <span class="badge-stato" style="background:#ede9fe;color:#4c1d95;">' + cat + '</span>'
        clienteCol = righeNomi.join('<br>')
      }
      html += '<td><strong>' + clienteCol + '</strong></td>'
      html += '<td>' + ospiti + '</td>'
      html += '<td><span class="badge-stato" style="background:' + statoColor + ';color:#111;">' + stato + '</span></td>'
      html += '<td>' + allergeLabel + '</td>'
      html += '<td class="note">' + noteLabel + '</td>'
      html += '</tr>'
    })
    var totP = calcolaTotali()
    var piuP = totP.senzaNumero ? ' +?' : ''
    html += '<tr class="riga-totale">'
    html += '<td>Totale</td>'
    html += '<td>' + totP.prenotazioni + ' prenotazioni</td>'
    html += '<td>' + totP.ospiti + ' (' + totP.adulti + ' ad. + ' + totP.bambini + ' ba.)</td>'
    html += '<td></td><td></td><td></td>'
    html += '</tr>'
    html += '</table>'
    html += '<div class="totale-blocco">TOTALE DEL TURNO: ' + totP.totale + piuP + ' ospiti \u00b7 ' + totP.ospiti + ' da prenotazioni + ' + totP.ospitiEvento + piuP + ' da eventi</div>'
    html += '</body></html>'
    var w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
    w.print()
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
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 min-w-52 overflow-hidden">
          <button onClick={function() { stampaSala(null) }}
            className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100">
            {'🏠 Riepilogo tutte le sale'}
          </button>
          <button onClick={stampaCucina}
            className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100">
            {'👨‍🍳 Lista Cucina'}
          </button>
          <button onClick={stampaPrenotazioni}
            className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100">
            {'📋 Riepilogo Prenotazioni'}
          </button>
          {sale.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Per sala</div>
              {sale.map(function(s) {
                return (
                  <button key={s.id} onClick={function() { stampaSala(s) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    {'🪑 ' + s.nome}
                  </button>
                )
              })}
            </>
          )}
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
  // Chi siede a ciascun tavolo: una copia sola, letta qui e passata a
  // stampe e pannello tavoli (regola 31).
  var [clientiTavolo, setClientiTavolo] = useState({})
  var [sale, setSale] = useState([])
  var [tipologieGift, setTipologieGift] = useState({})
  var [limiteEffettivo, setLimiteEffettivo] = useState(null)

  var { canEdit, user, profile, elevato, elevazione } = useAuth()

  // Avviso manuale del direttore su questo giorno/turno (riga o null)
  var [alertManuale, setAlertManuale] = useState(null)
  var [showAvvisoModal, setShowAvvisoModal] = useState(false)
  var [avvisoTesto, setAvvisoTesto] = useState('')
  var [savingAvviso, setSavingAvviso] = useState(false)

  useEffect(function() {
    loadSettings()
    loadEventi()
    loadSale()
    loadTipologieGift()
  }, [])

  useEffect(function() { loadReservations(); caricaLimite(); caricaAlertManuale() }, [dateStr, selectedMeal])

  function loadTipologieGift() {
    supabase.from('gift_card_tipologie').select('*')
      .then(function(result) {
        if (!result.error && result.data) {
          var mappa = {}
          result.data.forEach(function(t) { mappa[t.id] = t })
          setTipologieGift(mappa)
        }
      })
  }

  function loadSale() {
    supabase.from('sale').select('*').eq('attiva', true).order('ordine', { ascending: true })
      .then(function(result) { if (!result.error && result.data) setSale(result.data) })
  }

  function loadSettings() {
    supabase.from('restaurant_settings').select('*').limit(1).single()
      .then(function(result) { if (!result.error && result.data) setSettings(result.data) })
  }

  // Limite effettivo del giorno/turno: override da limiti_coperti se
  // presente, altrimenti default globale. Se la RPC non risponde,
  // si usa il fallback dai settings (vedi maxCovers sotto).
  function caricaLimite() {
    supabase.rpc('limite_effettivo', { p_data: dateStr, p_fascia: selectedMeal })
      .then(function(result) {
        if (!result.error && result.data != null) setLimiteEffettivo(result.data)
        else setLimiteEffettivo(null)
      })
  }

  function caricaAlertManuale() {
    supabase.from('alert_prenotazioni')
      .select('*')
      .eq('data', dateStr).eq('fascia', selectedMeal).eq('attivo', true)
      .maybeSingle()
      .then(function(result) {
        if (!result.error && result.data) setAlertManuale(result.data)
        else setAlertManuale(null)
      })
  }

  // Chi firma l'avviso: l'utente elevato (se "entrato con PIN") o quello loggato.
  function firmaAvviso() {
    if (elevato && elevazione) {
      return { user_id: elevazione.user_id, nome: elevazione.nome }
    }
    return {
      user_id: user ? user.id : null,
      nome: profile ? (profile.display_name || (profile.first_name + ' ' + profile.last_name)) : null
    }
  }

  function salvaAvviso() {
    var firma = firmaAvviso()
    setSavingAvviso(true)
    var row = {
      data: dateStr,
      fascia: selectedMeal,
      testo: avvisoTesto.trim() || null,
      attivo: true,
      creato_da: firma.user_id,
      creato_da_nome: firma.nome || null,
      spento_da: null,
      spento_da_nome: null,
      spento_at: null
    }
    supabase.from('alert_prenotazioni')
      .upsert(row, { onConflict: 'data,fascia' })
      .select()
      .single()
      .then(function(result) {
        setSavingAvviso(false)
        if (result.error) { alert('Errore nel salvataggio avviso: ' + result.error.message); return }
        setAlertManuale(result.data || null)
        setShowAvvisoModal(false)
      })
  }

  function spegniAvviso() {
    if (!confirm('Spegnere questo avviso del direttore?')) return
    var firma = firmaAvviso()
    supabase.from('alert_prenotazioni')
      .update({ attivo: false, spento_da: firma.user_id, spento_da_nome: firma.nome || null, spento_at: new Date().toISOString() })
      .eq('data', dateStr).eq('fascia', selectedMeal)
      .then(function(result) {
        if (result.error) { alert('Errore: ' + result.error.message); return }
        setAlertManuale(null)
      })
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

  // Chi siede a ciascun tavolo del giorno, con camera e allergeni.
  //
  // ⚠️ Due letture e non una: gli allergeni stanno su customer_allergens
  // e su customers.allergie_cliente, che sono complementari e non
  // doppioni (regola 34). Chi ne mostra uno solo mente.
  //
  // ⚠️ Nessun conteggio nasce qui. Questa lettura serve a stampare nomi,
  // non a sommare coperti.
  function caricaClientiTavolo(prenotazioni) {
    var ids = []
    for (var i = 0; i < prenotazioni.length; i++) { ids.push(prenotazioni[i].id) }
    if (ids.length === 0) { setClientiTavolo({}); return }
    supabase.from('prenotazione_clienti')
      .select('prenotazione_id, cliente_id, camera, ordine, customers(id, first_name, last_name, allergie_cliente)')
      .in('prenotazione_id', ids)
      .order('ordine', { ascending: true })
      .then(function(result) {
        if (result.error || !result.data) { setClientiTavolo({}); return }
        var mappa = {}
        var clienteIds = []
        for (var k = 0; k < result.data.length; k++) {
          var r = result.data[k]
          var c = r.customers
          if (!mappa[r.prenotazione_id]) mappa[r.prenotazione_id] = []
          mappa[r.prenotazione_id].push({
            cliente_id: r.cliente_id,
            nome: c ? (c.last_name + ' ' + c.first_name) : '\u2014',
            camera: r.camera || '',
            allergeni: [],
            allergie_libere: c ? (c.allergie_cliente || '') : ''
          })
          if (clienteIds.indexOf(r.cliente_id) === -1) clienteIds.push(r.cliente_id)
        }
        if (clienteIds.length === 0) { setClientiTavolo(mappa); return }
        supabase.from('customer_allergens')
          .select('customer_id, severity, allergens(id, name, icon)')
          .in('customer_id', clienteIds)
          .then(function(ris) {
            if (!ris.error && ris.data) {
              for (var a = 0; a < ris.data.length; a++) {
                var riga = ris.data[a]
                for (var pid in mappa) {
                  var elenco = mappa[pid]
                  for (var e = 0; e < elenco.length; e++) {
                    if (elenco[e].cliente_id === riga.customer_id) {
                      elenco[e].allergeni = elenco[e].allergeni.concat([{ severity: riga.severity, allergens: riga.allergens }])
                    }
                  }
                }
              }
            }
            setClientiTavolo(mappa)
          })
      })
  }

  function loadReservations() {
    setLoading(true)
    supabase.from('reservations')
      .select('*, customers(id, first_name, last_name, phone, email, category), gift_card!reservations_gift_card_id_fkey(id, codice, tipologia_id)')
      .eq('reservation_date', dateStr).eq('meal_type', selectedMeal)
      .order('requested_time', { ascending: true, nullsFirst: false })
      .then(function(result) {
        if (result.error) {
          // Fallback: se la join con gift_card fallisce, carico senza
          return supabase.from('reservations')
            .select('*, customers(id, first_name, last_name, phone, email, category)')
            .eq('reservation_date', dateStr).eq('meal_type', selectedMeal)
            .order('requested_time', { ascending: true, nullsFirst: false })
            .then(function(fallback) {
              var righe = fallback.error ? [] : (fallback.data || [])
              setReservations(righe)
              caricaClientiTavolo(righe)
            })
        } else {
          setReservations(result.data || [])
          caricaClientiTavolo(result.data || [])
        }
      })
      .then(function() {
        return supabase.from('reservations')
          .select('guests_count, adults_count, children_count')
          .eq('reservation_date', dateStr).eq('meal_type', selectedMeal)
          .not('status', 'in', '("cancelled")')
      })
      .then(function(result) {
        if (result && !result.error && result.data) {
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

  var maxCoversDefault = selectedMeal === 'lunch' ? settings.max_covers_lunch : settings.max_covers_dinner
  var maxCovers = (limiteEffettivo != null) ? limiteEffettivo : maxCoversDefault
  // Coperti degli eventi del giorno sul turno selezionato (un evento "both"
  // vale su entrambi i turni). Se un evento non ha il numero, il totale del
  // turno resta parziale e lo segnaliamo.
  var eventiFascia = eventi.filter(function(ev) { return ev.meal_type === selectedMeal || ev.meal_type === 'both' })
  var copertiEvento = 0
  var eventoSenzaNumero = false
  eventiFascia.forEach(function(ev) {
    var cr = ev.covers_reserved
    // Un evento senza il numero ospiti (vuoto, nullo o 0) non va sommato
    // e va segnalato: un evento reale non ha mai 0 ospiti.
    if (cr == null || cr === '' || Number(cr) === 0) eventoSenzaNumero = true
    else copertiEvento += (parseInt(cr, 10) || 0)
  })
  var totaleTurno = summary.total + copertiEvento
  var remainingCovers = maxCovers - totaleTurno
  var inAlertAuto = totaleTurno >= maxCovers
  var fasciaInAlert = inAlertAuto || Boolean(alertManuale)
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
          <StampaMenu dateStr={dateStr} turno={selectedMeal} reservations={activeReservations} sale={sale} eventi={eventi} clientiTavolo={clientiTavolo} />
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
          <div><p className="text-sm text-gray-500 flex items-center gap-1"><Star size={12} />Evento</p><p className="text-xl font-bold text-gray-700">{copertiEvento + (eventoSenzaNumero ? ' +?' : '')}</p></div>
          <div><p className="text-sm text-gray-500">Totale turno</p><p className="text-2xl font-bold text-gray-900">{totaleTurno + (eventoSenzaNumero ? ' +?' : '')}</p></div>
          <div><p className="text-sm text-gray-500">Disponibili</p><p className={"text-2xl font-bold " + (remainingCovers < 10 ? 'text-red-600' : 'text-green-600')}>{remainingCovers}</p></div>
        </div>
        <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
          <div className={"h-2 rounded-full transition-all " + (remainingCovers < 10 ? 'bg-red-500' : 'bg-wine-600')}
            style={{ width: Math.min((totaleTurno / maxCovers) * 100, 100) + '%' }} />
        </div>
      </div>

      {(fasciaInAlert || eventoSenzaNumero || canEdit('alert_prenotazioni')) && (
        <div className={"rounded-xl border p-4 mb-6 " + (fasciaInAlert ? "bg-amber-50 border-amber-300" : (eventoSenzaNumero ? "bg-indigo-50 border-indigo-200" : "bg-white border-gray-200"))}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle size={18} className={(fasciaInAlert ? "text-amber-600" : (eventoSenzaNumero ? "text-indigo-500" : "text-gray-400")) + " mt-0.5 flex-shrink-0"} />
              <div className="min-w-0">
                {inAlertAuto && (
                  <p className="text-sm font-semibold text-amber-900">
                    {(selectedMeal === 'lunch' ? 'Pranzo' : 'Cena') + " al limite: " + totaleTurno + (eventoSenzaNumero ? "+? " : " ") + "coperti su " + maxCovers}
                  </p>
                )}
                {eventoSenzaNumero && (
                  <p className="text-sm font-medium text-indigo-800">
                    Evento senza numero ospiti: il totale del turno e incompleto.
                  </p>
                )}
                {alertManuale ? (
                  <p className="text-sm text-amber-800">
                    {"Avviso del direttore" + (alertManuale.testo ? ": " + alertManuale.testo : "")}
                  </p>
                ) : (!inAlertAuto && !eventoSenzaNumero && (
                  <p className="text-sm text-gray-500">Nessun avviso del direttore su questo turno.</p>
                ))}
              </div>
            </div>
            {canEdit('alert_prenotazioni') && (
              <div className="flex gap-2 flex-shrink-0">
                <button type="button" onClick={function() { setAvvisoTesto(alertManuale ? (alertManuale.testo || '') : ''); setShowAvvisoModal(true) }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 bg-white hover:bg-amber-100 font-medium">
                  {alertManuale ? 'Modifica avviso' : 'Aggiungi avviso'}
                </button>
                {alertManuale && (
                  <button type="button" onClick={spegniAvviso}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 bg-white hover:bg-gray-100 font-medium">
                    Spegni
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
            var customer = res.customers || { first_name: 'Gift Card', last_name: res.gift_card ? res.gift_card.codice : '—', phone: null, email: null, category: 'standard' }
            var timeStr = res.requested_time ? res.requested_time.substring(0, 5) : null
            var tavoliInfo = tavoliAssegnati[res.id] || { nomi: [], hasAllergeni: false }
            // Gli altri commensali con una scheda. Non sono coperti: il
            // numero degli ospiti resta quello scritto nella prenotazione.
            var altriNomi = nomiClienti(res, clientiTavolo).slice(1)
            var hasAnyAllergen = res.has_allergen_alerts || tavoliInfo.hasAllergeni || (res.allergie_prenotazione && res.allergie_prenotazione.trim().length > 0)
            return (
              <div key={res.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:border-wine-300 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{customer.last_name + ' ' + customer.first_name}</h3>
                      {altriNomi.length > 0 && (
                        <span className="text-sm text-gray-500">{'+ ' + altriNomi.join(', ')}</span>
                      )}
                      {customer.category !== 'standard' && (
                        <span className={"px-2 py-0.5 rounded-full text-xs font-medium " + categoryColors[customer.category]}>{categoryLabels[customer.category]}</span>
                      )}
                      {hasAnyAllergen && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          <AlertTriangle size={12} />Allergeni
                        </span>
                      )}
                      {res.ok_direttore && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"
                          title={res.ok_direttore_da_nome ? ('Ok direttore - ' + res.ok_direttore_da_nome) : 'Ok direttore'}>
                          <Check size={12} />Ok direttore
                        </span>
                      )}
                      {res.gift_card && (
                        <BadgeGiftCard codice={res.gift_card.codice} tipologia={res.gift_card.tipologia_id ? tipologieGift[res.gift_card.tipologia_id] : null} />
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1"><Users size={14} />{res.guests_count + ' ospiti (' + res.adults_count + ' ad. + ' + res.children_count + ' ba.)'}</span>
                      {timeStr && <span className="flex items-center gap-1"><Clock size={14} />{timeStr}</span>}
                      {res.camera && (
                        <span className="flex items-center gap-1 text-wine-700 font-medium">
                          <BedDouble size={14} />{res.camera}
                        </span>
                      )}
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
                    {res.allergie_prenotazione && (
                      <p className="text-xs text-red-700 mt-1.5 flex items-center gap-1">
                        <AlertTriangle size={11} className="flex-shrink-0" />
                        {res.allergie_prenotazione}
                      </p>
                    )}
                    {res.notes && <p className="text-sm text-gray-600 mt-1">{res.notes}</p>}
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
              var custCan = res.customers || { last_name: res.gift_card ? res.gift_card.codice : 'Gift Card', first_name: '' }
              return (
                <div key={res.id} className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 line-through">{custCan.last_name + ' ' + custCan.first_name + ' - ' + res.guests_count + ' ospiti'}</span>
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
        <PannelloTavoli prenotazione={pannelloTavoli} dateStr={dateStr} turno={selectedMeal} clientiTavolo={clientiTavolo} onClose={handleChiudiPannelloTavoli} />
      )}

      {showAvvisoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{alertManuale ? 'Modifica avviso' : 'Avviso del direttore'}</h2>
              <button type="button" onClick={function() { setShowAvvisoModal(false) }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">
                {"Comparira su " + (selectedMeal === 'lunch' ? 'pranzo' : 'cena') + " di " + formatDateDisplay(dateStr) + " e sara visibile a tutto lo staff."}
              </p>
              <textarea value={avvisoTesto} onChange={function(e) { setAvvisoTesto(e.target.value) }} rows={3} autoFocus
                placeholder="es. Chiedere al direttore prima di accettare tavoli grandi"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
              <div className="flex gap-3">
                <button type="button" onClick={function() { setShowAvvisoModal(false) }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
                <button type="button" onClick={salvaAvviso} disabled={savingAvviso}
                  className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  {savingAvviso ? 'Salvataggio...' : (alertManuale ? 'Salva' : 'Accendi avviso')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default ReservationDay
