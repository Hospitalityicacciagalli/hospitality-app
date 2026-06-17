import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileJson, AlertTriangle, Gift, Bed, Clock, Trash2, Edit3,
  ChevronLeft, ChevronRight, CheckCircle2, Calendar, List, Users, Ban, X
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ============================================================
// ImportPrenotazioniPage
// Strumento (uso prevalentemente una-tantum) per importare le
// prenotazioni storiche da un file JSON gia' normalizzato.
//
// Il JSON viene prodotto a monte (conversione dell'Excel mensile).
// Struttura attesa:
//   { prenotazioni: [...], eventi: [...], alert: [...] }
//
// La pagina NON scrive nulla finche' non si preme "Conferma e inserisci".
// Per ogni prenotazione: cerca un cliente per telefono; se non c'e' lo
// crea (source='import_excel'); poi inserisce la prenotazione collegata.
// Gli eventi vanno in event_dates. Gli alert non vengono inseriti.
// ============================================================

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

var GIORNI_SETT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

function dataEstesa(iso) {
  var p = iso.split('-')
  var d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]))
  return GIORNI_SETT[d.getDay()] + ' ' + parseInt(p[2]) + ' ' + MESI[parseInt(p[1]) - 1]
}

export default function ImportPrenotazioniPage() {
  var { canEdit } = useAuth()
  var navigate = useNavigate()

  var [prenotazioni, setPrenotazioni] = useState([])
  var [eventi, setEventi] = useState([])
  var [alert, setAlert] = useState([])
  var [caricato, setCaricato] = useState(false)
  var [nomeFile, setNomeFile] = useState('')
  var [errore, setErrore] = useState(null)

  var [modalita, setModalita] = useState('giorno') // 'giorno' | 'lista'
  var [giornoIdx, setGiornoIdx] = useState(0)

  var [inserimento, setInserimento] = useState(false)
  var [progresso, setProgresso] = useState(null)
  var [risultato, setRisultato] = useState(null)

  // Permesso di scrittura prenotazioni richiesto per l'inserimento
  var puoScrivere = canEdit('prenotazioni')

  // ----------------------------------------------------------
  // CARICAMENTO FILE JSON
  // ----------------------------------------------------------
  function handleFile(e) {
    setErrore(null)
    var file = e.target.files && e.target.files[0]
    if (!file) return
    setNomeFile(file.name)
    var reader = new FileReader()
    reader.onload = function(ev) {
      try {
        var dati = JSON.parse(ev.target.result)
        if (!dati.prenotazioni || !Array.isArray(dati.prenotazioni)) {
          setErrore('Il file non ha il formato atteso (manca l\'elenco prenotazioni).')
          return
        }
        // assegno un id locale a ogni riga per gestire modifiche e scarti
        var pren = dati.prenotazioni.map(function(p, i) {
          return Object.assign({}, p, {
            _id: 'p' + i,
            _scartata: false,
            adulti: p.adulti == null ? 2 : p.adulti,
            bambini: p.bambini == null ? 0 : p.bambini
          })
        })
        var evs = (dati.eventi || []).map(function(x, i) {
          return Object.assign({}, x, { _id: 'e' + i, _scartato: false })
        })
        setPrenotazioni(pren)
        setEventi(evs)
        setAlert(dati.alert || [])
        setCaricato(true)
        setGiornoIdx(0)
        setRisultato(null)
      } catch (err) {
        setErrore('Errore nella lettura del file: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  // ----------------------------------------------------------
  // MODIFICA RIGHE
  // ----------------------------------------------------------
  function aggiornaPren(pid, campo, valore) {
    setPrenotazioni(function(prev) {
      return prev.map(function(p) {
        if (p._id !== pid) return p
        var u = Object.assign({}, p)
        u[campo] = valore
        return u
      })
    })
  }

  function toggleScartaPren(pid) {
    setPrenotazioni(function(prev) {
      return prev.map(function(p) {
        return p._id === pid ? Object.assign({}, p, { _scartata: !p._scartata }) : p
      })
    })
  }

  function aggiornaEvento(eid, campo, valore) {
    setEventi(function(prev) {
      return prev.map(function(ev) {
        if (ev._id !== eid) return ev
        var u = Object.assign({}, ev)
        u[campo] = valore
        return u
      })
    })
  }

  function toggleScartaEvento(eid) {
    setEventi(function(prev) {
      return prev.map(function(ev) {
        return ev._id === eid ? Object.assign({}, ev, { _scartato: !ev._scartato }) : ev
      })
    })
  }

  // ----------------------------------------------------------
  // RAGGRUPPAMENTO PER GIORNO
  // ----------------------------------------------------------
  function giorniUnici() {
    var set = {}
    prenotazioni.forEach(function(p) { set[p.data] = true })
    eventi.forEach(function(e) { set[e.data] = true })
    return Object.keys(set).sort()
  }

  function prenDelGiorno(data, pasto) {
    return prenotazioni.filter(function(p) { return p.data === data && p.pasto === pasto })
  }
  function eventiDelGiorno(data) {
    return eventi.filter(function(e) { return e.data === data })
  }

  // ----------------------------------------------------------
  // INSERIMENTO SU SUPABASE
  // ----------------------------------------------------------
  function trovaOCreaCliente(p, cacheTelefoni) {
    // ritorna una Promise che risolve con customer_id
    var tel = p.telefono ? String(p.telefono).trim() : null

    // dedup in cache locale (stesso telefono nello stesso batch)
    if (tel && cacheTelefoni[tel]) {
      return Promise.resolve(cacheTelefoni[tel])
    }

    var cercaPromise = tel
      ? supabase.from('customers').select('id').eq('phone', tel).limit(1)
      : Promise.resolve({ data: [], error: null })

    return cercaPromise.then(function(res) {
      if (res && res.data && res.data.length > 0) {
        if (tel) cacheTelefoni[tel] = res.data[0].id
        return res.data[0].id
      }
      // crea nuova scheda
      var first = (p.first_name || '').trim()
      var last = (p.last_name || '').trim()
      if (!last) { last = first || 'Cliente'; first = '' }
      return supabase.from('customers').insert({
        first_name: first || '-',
        last_name: last,
        phone: tel || null,
        is_active: true,
        source: 'import_excel'
      }).select('id').single().then(function(ins) {
        if (ins.error) {
          // se telefono duplicato (race/altro), riprovo a leggerlo
          if (ins.error.code === '23505' && tel) {
            return supabase.from('customers').select('id').eq('phone', tel).limit(1).then(function(r2) {
              var cid = r2.data && r2.data[0] ? r2.data[0].id : null
              if (cid && tel) cacheTelefoni[tel] = cid
              return cid
            })
          }
          throw ins.error
        }
        if (tel) cacheTelefoni[tel] = ins.data.id
        return ins.data.id
      })
    })
  }

  function costruisciNote(p) {
    var parti = []
    if (p.note && p.note.trim()) parti.push(p.note.trim())
    if (p.presa_da) parti.push('Presa da: ' + p.presa_da)
    if (p.email) parti.push('Email: ' + p.email)
    if (p.gift_codes && p.gift_codes.length > 0) parti.push('GIFT CARD: ' + p.gift_codes.join(', '))
    return parti.length ? parti.join(' | ') : null
  }

  function inserisciTutto() {
    if (!puoScrivere) { setErrore('Non hai i permessi per inserire prenotazioni.'); return }
    var daInserire = prenotazioni.filter(function(p) { return !p._scartata })
    var eventiDaInserire = eventi.filter(function(e) { return !e._scartato })
    var totale = daInserire.length + eventiDaInserire.length
    if (totale === 0) { setErrore('Non c\'e\' nulla da inserire.'); return }

    setInserimento(true)
    setErrore(null)
    setProgresso({ fatte: 0, totale: totale, errori: [] })

    var cacheTelefoni = {}
    var errori = []
    var fatte = 0

    // inserimento sequenziale (prudente, evita corse sul vincolo telefono)
    var chain = Promise.resolve()

    daInserire.forEach(function(p) {
      chain = chain.then(function() {
        return trovaOCreaCliente(p, cacheTelefoni).then(function(customerId) {
          var requestedTime = p.orario ? p.orario + ':00' : null
          var payload = {
            customer_id: customerId,
            reservation_date: p.data,
            meal_type: p.meal_type,
            requested_time: requestedTime,
            guests_count: (p.adulti || 0) + (p.bambini || 0),
            adults_count: p.adulti || 0,
            children_count: p.bambini || 0,
            allergie_prenotazione: p.allergie_prenotazione || null,
            notes: costruisciNote(p),
            source: 'import_excel',
            has_allergen_alerts: Boolean(p.ha_allergeni),
            nome_libero: p.nome_libero || p.nome_originale || null,
            camera: p.camera || null,
            orario_default: Boolean(p.orario_default)
          }
          return supabase.from('reservations').insert(payload).then(function(r) {
            if (r.error) errori.push(p.data + ' ' + (p.nome_libero || '') + ': ' + r.error.message)
            fatte += 1
            setProgresso({ fatte: fatte, totale: totale, errori: errori.slice() })
          })
        }).catch(function(err) {
          errori.push(p.data + ' ' + (p.nome_libero || '') + ': ' + (err.message || 'errore cliente'))
          fatte += 1
          setProgresso({ fatte: fatte, totale: totale, errori: errori.slice() })
        })
      })
    })

    eventiDaInserire.forEach(function(ev) {
      chain = chain.then(function() {
        var payload = {
          event_date: ev.data,
          meal_type: ev.meal_type || null,
          event_type: 'confirmed',
          title: ev.titolo || 'Evento',
          notes: ev.note || null,
          covers_reserved: ev.ospiti != null ? ev.ospiti : 0
        }
        return supabase.from('event_dates').insert(payload).then(function(r) {
          if (r.error) errori.push('Evento ' + ev.data + ' ' + (ev.titolo || '') + ': ' + r.error.message)
          fatte += 1
          setProgresso({ fatte: fatte, totale: totale, errori: errori.slice() })
        })
      })
    })

    chain.then(function() {
      setInserimento(false)
      setRisultato({
        inserite: fatte - errori.length,
        errori: errori,
        totale: totale
      })
    })
  }

  // ----------------------------------------------------------
  // RENDER — schermata iniziale (caricamento file)
  // ----------------------------------------------------------
  if (!caricato) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Importa prenotazioni</h1>
        <p className="text-gray-500 mb-6 text-sm">
          Carica il file delle prenotazioni (formato JSON gia preparato) per rivederle e inserirle nel sistema.
        </p>

        {errore && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errore}</div>
        )}

        <label className="block border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-wine-400 hover:bg-wine-50 transition-colors">
          <input type="file" accept=".json,application/json" onChange={handleFile} className="hidden" />
          <Upload className="mx-auto text-gray-400 mb-3" size={40} />
          <div className="text-gray-700 font-medium">Tocca per scegliere il file</div>
          <div className="text-gray-400 text-sm mt-1">File .json delle prenotazioni del mese</div>
        </label>

        {!puoScrivere && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            Puoi visualizzare l'anteprima, ma non hai il permesso di inserire le prenotazioni.
          </div>
        )}
      </div>
    )
  }

  // ----------------------------------------------------------
  // RENDER — risultato finale
  // ----------------------------------------------------------
  if (risultato) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
          <CheckCircle2 className="mx-auto text-green-500 mb-3" size={48} />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Inserimento completato</h1>
          <p className="text-gray-600 mb-4">
            Inserite <span className="font-bold text-green-600">{risultato.inserite}</span> voci su {risultato.totale}.
          </p>

          {risultato.errori.length > 0 && (
            <div className="text-left mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="font-medium text-red-700 mb-2 text-sm">{risultato.errori.length} righe non inserite:</div>
              <ul className="text-xs text-red-600 space-y-1 max-h-48 overflow-auto">
                {risultato.errori.map(function(e, i) { return <li key={i}>• {e}</li> })}
              </ul>
            </div>
          )}

          <div className="flex gap-2 justify-center mt-6">
            <button
              onClick={function() { navigate('/prenotazioni') }}
              className="bg-wine-700 text-white px-5 py-2.5 rounded-lg hover:bg-wine-800 font-medium"
            >
              Vai al calendario
            </button>
            <button
              onClick={function() { setCaricato(false); setPrenotazioni([]); setEventi([]); setAlert([]); setRisultato(null); setNomeFile('') }}
              className="border border-gray-300 px-5 py-2.5 rounded-lg hover:bg-gray-50 font-medium text-gray-700"
            >
              Importa un altro file
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ----------------------------------------------------------
  // RENDER — anteprima e revisione
  // ----------------------------------------------------------
  var giorni = giorniUnici()
  var nValide = prenotazioni.filter(function(p) { return !p._scartata }).length
  var nConAvvisi = prenotazioni.filter(function(p) {
    return !p._scartata && (p.orario_default || p.camera || p.ha_allergeni || (p.gift_codes && p.gift_codes.length))
  }).length
  var nEventi = eventi.filter(function(e) { return !e._scartato }).length

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-6">

      {/* Barra file + totali */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex items-center gap-3">
        <FileJson className="text-wine-600 flex-shrink-0" size={24} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 text-sm truncate">{nomeFile}</div>
          <div className="text-xs text-gray-500">
            {nValide} prenotazioni · {nEventi} eventi · {alert.length} avvisi
          </div>
        </div>
        <button
          onClick={function() { setCaricato(false); setPrenotazioni([]); setEventi([]); setAlert([]); setNomeFile('') }}
          className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100"
        >
          Cambia file
        </button>
      </div>

      {errore && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errore}</div>
      )}

      {/* Selettore modalita */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={function() { setModalita('giorno') }}
          className={
            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors border ' +
            (modalita === 'giorno' ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')
          }
        >
          <Calendar size={16} /> Un giorno alla volta
        </button>
        <button
          onClick={function() { setModalita('lista') }}
          className={
            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors border ' +
            (modalita === 'lista' ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')
          }
        >
          <List size={16} /> Lista unica
        </button>
      </div>

      {/* ===== MODALITA GIORNO ===== */}
      {modalita === 'giorno' && giorni.length > 0 && (
        <RevisioneGiorno
          giorni={giorni}
          giornoIdx={giornoIdx}
          setGiornoIdx={setGiornoIdx}
          prenDelGiorno={prenDelGiorno}
          eventiDelGiorno={eventiDelGiorno}
          aggiornaPren={aggiornaPren}
          toggleScartaPren={toggleScartaPren}
          aggiornaEvento={aggiornaEvento}
          toggleScartaEvento={toggleScartaEvento}
        />
      )}

      {/* ===== MODALITA LISTA ===== */}
      {modalita === 'lista' && (
        <RevisioneLista
          giorni={giorni}
          prenDelGiorno={prenDelGiorno}
          eventiDelGiorno={eventiDelGiorno}
          toggleScartaPren={toggleScartaPren}
          toggleScartaEvento={toggleScartaEvento}
        />
      )}

      {/* Avvisi (alert non importati) */}
      {alert.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
          <div className="flex items-center gap-2 text-amber-800 font-medium text-sm mb-2">
            <Ban size={16} /> Avvisi dal file (NON verranno importati)
          </div>
          <ul className="text-xs text-amber-700 space-y-1">
            {alert.map(function(a, i) {
              return <li key={i}>• {dataEstesa(a.data)} {a.pasto}: "{a.testo}"</li>
            })}
          </ul>
        </div>
      )}

      {/* Barra inserimento finale */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-4 lg:-mx-6 px-4 lg:px-6 py-3 mt-6">
        {inserimento && progresso ? (
          <div>
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Inserimento in corso...</span>
              <span>{progresso.fatte} / {progresso.totale}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-wine-600 h-2 rounded-full transition-all"
                style={{ width: (progresso.totale ? (progresso.fatte / progresso.totale * 100) : 0) + '%' }}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={inserisciTutto}
            disabled={!puoScrivere || nValide + nEventi === 0}
            className="w-full bg-wine-700 text-white py-3 rounded-lg hover:bg-wine-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Conferma e inserisci {nValide} prenotazioni{nEventi > 0 ? ' + ' + nEventi + ' eventi' : ''}
          </button>
        )}
      </div>

      <div className="h-4" />
    </div>
  )
}

// ============================================================
// SOTTO-COMPONENTE: revisione un giorno alla volta
// ============================================================
function RevisioneGiorno(props) {
  var giorni = props.giorni
  var idx = props.giornoIdx
  var data = giorni[idx]
  var pranzo = props.prenDelGiorno(data, 'Pranzo')
  var cena = props.prenDelGiorno(data, 'Cena')
  var eventiG = props.eventiDelGiorno(data)

  function vai(delta) {
    var n = idx + delta
    if (n < 0) n = 0
    if (n > giorni.length - 1) n = giorni.length - 1
    props.setGiornoIdx(n)
  }

  return (
    <div>
      {/* Navigazione giorno */}
      <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-4">
        <button
          onClick={function() { vai(-1) }}
          disabled={idx === 0}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="text-center">
          <div className="font-semibold text-gray-900">{dataEstesa(data)}</div>
          <div className="text-xs text-gray-500">giorno {idx + 1} di {giorni.length}</div>
        </div>
        <button
          onClick={function() { vai(1) }}
          disabled={idx === giorni.length - 1}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {eventiG.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Eventi</div>
          {eventiG.map(function(ev) {
            return <RigaEvento key={ev._id} ev={ev} aggiorna={props.aggiornaEvento} scarta={props.toggleScartaEvento} />
          })}
        </div>
      )}

      <SezionePasto titolo="Pranzo" righe={pranzo} aggiorna={props.aggiornaPren} scarta={props.toggleScartaPren} />
      <SezionePasto titolo="Cena" righe={cena} aggiorna={props.aggiornaPren} scarta={props.toggleScartaPren} />

      {pranzo.length === 0 && cena.length === 0 && eventiG.length === 0 && (
        <div className="text-center text-gray-400 py-8">Nessuna prenotazione in questo giorno</div>
      )}
    </div>
  )
}

function SezionePasto(props) {
  if (props.righe.length === 0) return null
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{props.titolo}</div>
      <div className="space-y-2">
        {props.righe.map(function(p) {
          return <RigaPrenotazione key={p._id} p={p} aggiorna={props.aggiorna} scarta={props.scarta} />
        })}
      </div>
    </div>
  )
}

// ============================================================
// SOTTO-COMPONENTE: singola riga prenotazione (editabile)
// ============================================================
function RigaPrenotazione(props) {
  var p = props.p
  var scartata = p._scartata

  return (
    <div className={
      'rounded-lg border p-3 transition-colors ' +
      (scartata ? 'bg-gray-100 border-gray-200 opacity-60' : 'bg-white border-gray-200')
    }>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={p.nome_libero || ''}
          disabled={scartata}
          onChange={function(e) { props.aggiorna(p._id, 'nome_libero', e.target.value) }}
          className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
        />
        <input
          type="text"
          value={p.orario || ''}
          disabled={scartata}
          onChange={function(e) { props.aggiorna(p._id, 'orario', e.target.value) }}
          className={
            'w-16 px-2 py-1.5 border rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-wine-500 ' +
            (p.orario_default ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200')
          }
        />
        <input
          type="number"
          value={p.adulti}
          disabled={scartata}
          onChange={function(e) { props.aggiorna(p._id, 'adulti', parseInt(e.target.value) || 0) }}
          className="w-12 px-1 py-1.5 border border-gray-200 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-wine-500"
          title="adulti"
        />
        <span className="text-gray-300 text-sm">+</span>
        <input
          type="number"
          value={p.bambini}
          disabled={scartata}
          onChange={function(e) { props.aggiorna(p._id, 'bambini', parseInt(e.target.value) || 0) }}
          className="w-12 px-1 py-1.5 border border-gray-200 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-wine-500"
          title="bambini"
        />
        <button
          onClick={function() { props.scarta(p._id) }}
          className={'p-1.5 rounded ' + (scartata ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-red-50 hover:text-red-600')}
          title={scartata ? 'Ripristina' : 'Scarta'}
        >
          {scartata ? <CheckCircle2 size={18} /> : <Trash2 size={18} />}
        </button>
      </div>

      {/* Badge informativi */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {p.orario_default && (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">
            <Clock size={11} /> orario di default
          </span>
        )}
        {p.camera && (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 text-xs px-2 py-0.5 rounded">
            <Bed size={11} /> camera: {p.camera}
          </span>
        )}
        {p.ha_allergeni && (
          <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded">
            <AlertTriangle size={11} /> allergene
          </span>
        )}
        {p.gift_codes && p.gift_codes.length > 0 && (
          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded">
            <Gift size={11} /> gift {p.gift_codes.join(', ')}
          </span>
        )}
        {p.note && (
          <span className="text-xs text-gray-500 truncate max-w-full">{p.note}</span>
        )}
      </div>
    </div>
  )
}

// ============================================================
// SOTTO-COMPONENTE: singola riga evento
// ============================================================
function RigaEvento(props) {
  var ev = props.ev
  var scartato = ev._scartato
  return (
    <div className={
      'rounded-lg border p-3 mb-2 transition-colors ' +
      (scartato ? 'bg-gray-100 border-gray-200 opacity-60' : 'bg-amber-50 border-amber-200')
    }>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={ev.titolo || ''}
          disabled={scartato}
          onChange={function(e) { props.aggiorna(ev._id, 'titolo', e.target.value) }}
          className="flex-1 min-w-0 px-2 py-1.5 border border-amber-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <div className="flex items-center gap-1">
          <Users size={14} className="text-amber-600" />
          <input
            type="number"
            value={ev.ospiti == null ? '' : ev.ospiti}
            placeholder="?"
            disabled={scartato}
            onChange={function(e) { props.aggiorna(ev._id, 'ospiti', e.target.value === '' ? null : (parseInt(e.target.value) || 0)) }}
            className="w-16 px-1 py-1.5 border border-amber-200 rounded text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            title="ospiti previsti"
          />
        </div>
        <button
          onClick={function() { props.scarta(ev._id) }}
          className={'p-1.5 rounded ' + (scartato ? 'text-green-600 hover:bg-green-50' : 'text-amber-600 hover:bg-red-50 hover:text-red-600')}
          title={scartato ? 'Ripristina' : 'Scarta'}
        >
          {scartato ? <CheckCircle2 size={18} /> : <Trash2 size={18} />}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <span className="text-xs text-amber-700">{ev.pasto} · evento in event_dates</span>
        {ev.ospiti == null && (
          <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-800 text-xs px-2 py-0.5 rounded">
            <AlertTriangle size={11} /> ospiti da definire
          </span>
        )}
        {ev.note && <span className="text-xs text-gray-500 truncate max-w-full">{ev.note}</span>}
      </div>
    </div>
  )
}

// ============================================================
// SOTTO-COMPONENTE: revisione a lista unica
// ============================================================
function RevisioneLista(props) {
  return (
    <div className="space-y-4">
      {props.giorni.map(function(data) {
        var pranzo = props.prenDelGiorno(data, 'Pranzo')
        var cena = props.prenDelGiorno(data, 'Cena')
        var eventiG = props.eventiDelGiorno(data)
        if (pranzo.length === 0 && cena.length === 0 && eventiG.length === 0) return null

        return (
          <div key={data} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">{dataEstesa(data)}</div>

            {eventiG.map(function(ev) {
              return (
                <RigaListaCompatta
                  key={ev._id}
                  scartata={ev._scartato}
                  nome={ev.titolo}
                  dettaglio={ev.pasto + ' · evento · ' + (ev.ospiti != null ? ev.ospiti + ' ospiti' : 'ospiti ?')}
                  badge="evento"
                  badgeClass="bg-amber-100 text-amber-800"
                  onScarta={function() { props.toggleScartaEvento(ev._id) }}
                />
              )
            })}

            {pranzo.concat(cena).map(function(p) {
              var badge = null, badgeClass = ''
              if (p.ha_allergeni) { badge = 'allergene'; badgeClass = 'bg-red-100 text-red-700' }
              else if (p.camera) { badge = 'camera ' + p.camera; badgeClass = 'bg-amber-100 text-amber-800' }
              else if (p.gift_codes && p.gift_codes.length) { badge = 'gift card'; badgeClass = 'bg-purple-100 text-purple-700' }
              else if (p.orario_default) { badge = 'orario def'; badgeClass = 'bg-blue-100 text-blue-700' }
              return (
                <RigaListaCompatta
                  key={p._id}
                  scartata={p._scartata}
                  nome={p.nome_libero}
                  dettaglio={(p.pasto === 'Pranzo' ? 'Pranzo' : 'Cena') + ' · ' + (p.orario || '—') + ' · ' + p.adulti + '+' + p.bambini}
                  badge={badge}
                  badgeClass={badgeClass}
                  onScarta={function() { props.toggleScartaPren(p._id) }}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function RigaListaCompatta(props) {
  return (
    <div className={
      'flex items-center gap-2 px-4 py-2.5 border-t border-gray-100 text-sm ' +
      (props.scartata ? 'bg-gray-100 opacity-50' : '')
    }>
      <span className="flex-1 min-w-0 truncate text-gray-900">{props.nome}</span>
      <span className="text-gray-500 text-xs whitespace-nowrap">{props.dettaglio}</span>
      {props.badge && (
        <span className={'text-xs px-2 py-0.5 rounded whitespace-nowrap ' + props.badgeClass}>{props.badge}</span>
      )}
      <button
        onClick={props.onScarta}
        className={'p-1 rounded flex-shrink-0 ' + (props.scartata ? 'text-green-600' : 'text-gray-400 hover:text-red-600')}
        title={props.scartata ? 'Ripristina' : 'Scarta'}
      >
        {props.scartata ? <CheckCircle2 size={16} /> : <X size={16} />}
      </button>
    </div>
  )
}
