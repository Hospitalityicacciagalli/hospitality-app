import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileJson, AlertTriangle, Gift, Bed, Clock, Trash2,
  ChevronLeft, ChevronRight, CheckCircle2, Calendar, List, Ban, X, Star, Bell
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ============================================================
// ImportPrenotazioniPage
// Strumento (uso prevalentemente una-tantum) per importare le
// prenotazioni storiche da un file JSON gia' normalizzato.
//
// Il JSON viene prodotto a monte (conversione dell'Excel mensile).
// Struttura attesa: { prenotazioni: [...], eventi: [...], alert: [...] }
//
// MODELLO INTERNO UNIFICATO:
// prenotazioni ed eventi vengono fusi in un'unica lista "voci".
// Ogni voce ha _tipo ('prenotazione' | 'evento') MODIFICABILE dall'utente,
// cosi' una prenotazione classificata male puo' diventare evento e viceversa.
//
// La pagina NON scrive nulla finche' non si preme "Conferma e inserisci".
// Prenotazioni -> reservations (con cliente per telefono, dedup).
// Eventi -> event_dates SOLO se l'interruttore "Reinserisci eventi" e' acceso
//           (di default SPENTO: sul reimport gli eventi restano quelli gia'
//           presenti, perche' event_dates e' protetta e non ha un marcatore
//           che distingua gli eventi importati da quelli inseriti a mano).
// Alert -> alert_prenotazioni, ma SOLO se non ne esiste gia' uno su quel
//          giorno+fascia (non calpesta gli alert manuali). Firma "Import Excel".
//
// REIMPORT PULITO (azzeramento):
// Nella schermata di caricamento c'e' un'azione separata "Azzera dati importati"
// che cancella TUTTE le prenotazioni con source='import_excel' e poi i clienti
// import_excel rimasti ORFANI (non piu' referenziati da nessuna prenotazione).
// Cosi' le prenotazioni/clienti inseriti a mano restano intatti e non si
// rompono foreign key. L'inserimento vero e proprio NON cancella nulla, cosi'
// caricando piu' mesi di fila non si cancellano a vicenda.
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

  var [voci, setVoci] = useState([])
  var [alert, setAlert] = useState([])
  var [caricato, setCaricato] = useState(false)
  var [nomeFile, setNomeFile] = useState('')
  var [errore, setErrore] = useState(null)

  var [modalita, setModalita] = useState('giorno')
  var [giornoIdx, setGiornoIdx] = useState(0)

  var [reinserisciEventi, setReinserisciEventi] = useState(false)

  var [inserimento, setInserimento] = useState(false)
  var [progresso, setProgresso] = useState(null)
  var [risultato, setRisultato] = useState(null)

  var [confermaAzzera, setConfermaAzzera] = useState(false)
  var [azzeramento, setAzzeramento] = useState(false)
  var [esitoAzzera, setEsitoAzzera] = useState(null)

  var puoScrivere = canEdit('prenotazioni')

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

        var lista = []
        var k = 0

        dati.prenotazioni.forEach(function(p) {
          lista.push(Object.assign({}, p, {
            _id: 'v' + (k++),
            _tipo: 'prenotazione',
            _scartata: false,
            adulti: p.adulti == null ? 2 : p.adulti,
            bambini: p.bambini == null ? 0 : p.bambini,
            titolo: p.nome_libero || p.nome_originale || 'Evento'
          }))
        })

        ;(dati.eventi || []).forEach(function(x) {
          lista.push(Object.assign({}, x, {
            _id: 'v' + (k++),
            _tipo: 'evento',
            _scartata: false,
            nome_libero: x.titolo || '',
            nome_originale: x.titolo || '',
            first_name: '',
            last_name: x.titolo || '',
            adulti: x.ospiti == null ? null : x.ospiti,
            bambini: x.bambini == null ? 0 : x.bambini,
            orario: x.orario || (x.meal_type === 'lunch' ? '13:00' : '20:00'),
            orario_default: !x.orario,
            camera: null,
            gift_codes: [],
            ha_allergeni: false,
            allergie_prenotazione: null,
            pasto: x.pasto || (x.meal_type === 'lunch' ? 'Pranzo' : 'Cena')
          }))
        })

        setVoci(lista)
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

  function aggiorna(vid, campo, valore) {
    setVoci(function(prev) {
      return prev.map(function(v) {
        if (v._id !== vid) return v
        var u = Object.assign({}, v)
        u[campo] = valore
        return u
      })
    })
  }

  function toggleScarta(vid) {
    setVoci(function(prev) {
      return prev.map(function(v) {
        return v._id === vid ? Object.assign({}, v, { _scartata: !v._scartata }) : v
      })
    })
  }

  function cambiaTipo(vid, nuovoTipo) {
    setVoci(function(prev) {
      return prev.map(function(v) {
        if (v._id !== vid) return v
        var u = Object.assign({}, v)
        u._tipo = nuovoTipo
        if (nuovoTipo === 'evento') {
          if (!u.titolo || u.titolo === 'Evento') u.titolo = u.nome_libero || u.nome_originale || 'Evento'
        } else {
          if (!u.nome_libero) u.nome_libero = u.titolo || ''
        }
        return u
      })
    })
  }

  function giorniUnici() {
    var set = {}
    voci.forEach(function(v) { set[v.data] = true })
    return Object.keys(set).sort()
  }
  function vociDelGiorno(data, pasto) {
    return voci.filter(function(v) { return v.data === data && (pasto ? v.pasto === pasto : true) })
  }

  // ----------------------------------------------------------
  // AZZERAMENTO (reimport pulito)
  // 1) cancella tutte le reservations con source='import_excel'
  // 2) cancella i customers import_excel rimasti ORFANI
  //    (non referenziati da nessuna reservation). Cosi' un cliente
  //    importato ma agganciato a una prenotazione MANUALE non viene
  //    toccato -> nessuna FK rotta.
  // ----------------------------------------------------------
  function cancellaClientiABatch(ids) {
    var chunks = []
    var i = 0
    for (i = 0; i < ids.length; i += 200) {
      chunks.push(ids.slice(i, i + 200))
    }
    var totale = 0
    var chain = Promise.resolve()
    chunks.forEach(function(slice) {
      chain = chain.then(function() {
        return supabase.from('customers').delete().in('id', slice).select('id').then(function(r) {
          if (r.error) throw r.error
          totale += r.data ? r.data.length : 0
        })
      })
    })
    return chain.then(function() { return totale })
  }

  function azzeraImportati() {
    if (!puoScrivere) { setErrore('Non hai i permessi per cancellare le prenotazioni.'); return }
    setConfermaAzzera(false)
    setAzzeramento(true)
    setErrore(null)
    setEsitoAzzera(null)

    var esito = { prenotazioni: 0, clienti: 0 }

    supabase.from('reservations').delete().eq('source', 'import_excel').select('id')
      .then(function(rDel) {
        if (rDel.error) throw rDel.error
        esito.prenotazioni = rDel.data ? rDel.data.length : 0
        return supabase.from('customers').select('id').eq('source', 'import_excel')
      })
      .then(function(rCust) {
        if (rCust.error) throw rCust.error
        var idsImport = (rCust.data || []).map(function(c) { return c.id })
        if (idsImport.length === 0) { esito.clienti = 0; return null }
        return supabase.from('reservations').select('customer_id').not('customer_id', 'is', null)
          .then(function(rRef) {
            if (rRef.error) throw rRef.error
            var referenced = {}
            ;(rRef.data || []).forEach(function(row) { if (row.customer_id) referenced[row.customer_id] = true })
            var orfani = idsImport.filter(function(id) { return !referenced[id] })
            if (orfani.length === 0) { esito.clienti = 0; return null }
            return cancellaClientiABatch(orfani).then(function(n) { esito.clienti = n })
          })
      })
      .then(function() {
        setAzzeramento(false)
        setEsitoAzzera(esito)
      })
      .catch(function(err) {
        setAzzeramento(false)
        setEsitoAzzera(null)
        setErrore('Azzeramento non riuscito: ' + (err.message || 'errore'))
      })
  }

  function trovaOCreaCliente(p, cacheTelefoni) {
    var tel = p.telefono ? String(p.telefono).trim() : null
    if (tel && cacheTelefoni[tel]) return Promise.resolve(cacheTelefoni[tel])

    var cercaPromise = tel
      ? supabase.from('customers').select('id').eq('phone', tel).limit(1)
      : Promise.resolve({ data: [], error: null })

    return cercaPromise.then(function(res) {
      if (res && res.data && res.data.length > 0) {
        if (tel) cacheTelefoni[tel] = res.data[0].id
        return res.data[0].id
      }
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
    if (p.note && String(p.note).trim()) parti.push(String(p.note).trim())
    if (p.presa_da) parti.push('Presa da: ' + p.presa_da)
    if (p.email) parti.push('Email: ' + p.email)
    if (p.gift_codes && p.gift_codes.length > 0) parti.push('GIFT CARD: ' + p.gift_codes.join(', '))
    return parti.length ? parti.join(' | ') : null
  }

  // ----------------------------------------------------------
  // INSERIMENTO ALERT in alert_prenotazioni
  // Inserisce solo se non esiste gia' un alert su quel giorno+fascia
  // (evita di calpestare gli alert manuali). Firma "Import Excel".
  // ----------------------------------------------------------
  function inserisciAlert() {
    var res = { inseriti: 0, saltati: 0, errori: [] }
    if (!alert || alert.length === 0) return Promise.resolve(res)

    var vociAlert = alert.map(function(a) {
      var fascia = (a.meal_type === 'lunch' || a.pasto === 'Pranzo') ? 'lunch' : 'dinner'
      return { data: a.data, fascia: fascia, testo: a.testo || null }
    }).filter(function(v) { return v.data })

    if (vociAlert.length === 0) return Promise.resolve(res)

    var setDate = {}
    vociAlert.forEach(function(v) { setDate[v.data] = true })
    var listaDate = Object.keys(setDate)

    return supabase.from('alert_prenotazioni').select('data, fascia').in('data', listaDate)
      .then(function(r) {
        var esistenti = {}
        if (!r.error && r.data) {
          r.data.forEach(function(row) { esistenti[row.data + '|' + row.fascia] = true })
        }
        var daInserire = vociAlert.filter(function(v) {
          var k = v.data + '|' + v.fascia
          if (esistenti[k]) { res.saltati += 1; return false }
          esistenti[k] = true
          return true
        })
        if (daInserire.length === 0) return res
        var payloads = daInserire.map(function(v) {
          return { data: v.data, fascia: v.fascia, testo: v.testo, attivo: true, creato_da_nome: 'Import Excel' }
        })
        return supabase.from('alert_prenotazioni').insert(payloads).select('id').then(function(ins) {
          if (ins.error) { res.errori.push('Alert: ' + ins.error.message); return res }
          res.inseriti = ins.data ? ins.data.length : daInserire.length
          return res
        })
      })
  }

  function inserisciTutto() {
    if (!puoScrivere) { setErrore('Non hai i permessi per inserire prenotazioni.'); return }

    var attive = voci.filter(function(v) { return !v._scartata })
    var daInserire = attive.filter(function(v) { return v._tipo === 'prenotazione' || reinserisciEventi })
    var eventiSaltati = attive.filter(function(v) { return v._tipo === 'evento' && !reinserisciEventi }).length
    var totale = daInserire.length
    var haAlert = alert && alert.length > 0

    if (totale === 0 && !haAlert) { setErrore('Non c\'e\' nulla da inserire.'); return }

    setInserimento(true)
    setErrore(null)
    setProgresso({ fatte: 0, totale: totale, errori: [] })

    var cacheTelefoni = {}
    var errori = []
    var fatte = 0
    var chain = Promise.resolve()

    daInserire.forEach(function(v) {
      chain = chain.then(function() {
        if (v._tipo === 'evento') {
          var ad = v.adulti == null ? 0 : v.adulti
          var bb = v.bambini == null ? 0 : v.bambini
          var noteEv = []
          if (v.note && String(v.note).trim()) noteEv.push(String(v.note).trim())
          noteEv.push('Adulti: ' + ad + ' · Bambini: ' + bb)
          var payloadEv = {
            event_date: v.data,
            meal_type: v.meal_type || (v.pasto === 'Pranzo' ? 'lunch' : 'dinner'),
            event_type: 'confirmed',
            title: v.titolo || 'Evento',
            notes: noteEv.join(' | '),
            covers_reserved: ad + bb
          }
          return supabase.from('event_dates').insert(payloadEv).then(function(r) {
            if (r.error) errori.push('Evento ' + v.data + ' ' + (v.titolo || '') + ': ' + r.error.message)
            fatte += 1
            setProgresso({ fatte: fatte, totale: totale, errori: errori.slice() })
          })
        }
        return trovaOCreaCliente(v, cacheTelefoni).then(function(customerId) {
          var requestedTime = v.orario ? v.orario + ':00' : null
          var payload = {
            customer_id: customerId,
            reservation_date: v.data,
            meal_type: v.meal_type || (v.pasto === 'Pranzo' ? 'lunch' : 'dinner'),
            requested_time: requestedTime,
            guests_count: (v.adulti || 0) + (v.bambini || 0),
            adults_count: v.adulti || 0,
            children_count: v.bambini || 0,
            allergie_prenotazione: v.allergie_prenotazione || null,
            notes: costruisciNote(v),
            source: 'import_excel',
            has_allergen_alerts: Boolean(v.ha_allergeni),
            nome_libero: v.nome_libero || v.nome_originale || null,
            camera: v.camera || null,
            orario_default: Boolean(v.orario_default)
          }
          return supabase.from('reservations').insert(payload).then(function(r) {
            if (r.error) errori.push(v.data + ' ' + (v.nome_libero || '') + ': ' + r.error.message)
            fatte += 1
            setProgresso({ fatte: fatte, totale: totale, errori: errori.slice() })
          })
        }).catch(function(err) {
          errori.push(v.data + ' ' + (v.nome_libero || '') + ': ' + (err.message || 'errore cliente'))
          fatte += 1
          setProgresso({ fatte: fatte, totale: totale, errori: errori.slice() })
        })
      })
    })

    chain.then(function() {
      return inserisciAlert()
    }).then(function(esitoAlert) {
      setInserimento(false)
      setRisultato({
        inserite: fatte - errori.length,
        errori: errori,
        totale: totale,
        eventiSaltati: eventiSaltati,
        alert: esitoAlert
      })
    })
  }

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

        <div className="mt-8 border-t border-gray-200 pt-6">
          <div className="text-sm font-semibold text-gray-800 mb-1">Reimport pulito</div>
          <p className="text-xs text-gray-500 mb-3">
            Cancella tutte le prenotazioni e le schede cliente importate da Excel. Le prenotazioni e i clienti
            inseriti a mano NON vengono toccati. Utile prima di ricaricare i mesi corretti.
          </p>

          {esitoAzzera && (
            <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              Azzeramento completato: rimosse <span className="font-semibold">{esitoAzzera.prenotazioni}</span> prenotazioni
              e <span className="font-semibold">{esitoAzzera.clienti}</span> schede cliente importate.
            </div>
          )}

          {azzeramento ? (
            <div className="inline-flex items-center gap-2 text-sm text-gray-600">
              <Trash2 size={16} /> Azzeramento in corso...
            </div>
          ) : confermaAzzera ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-red-700 font-medium">Sei sicuro? Cancello tutti i dati importati da Excel.</span>
              <button
                onClick={azzeraImportati}
                className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm font-medium"
              >
                <Trash2 size={16} /> Sì, azzera
              </button>
              <button
                onClick={function() { setConfermaAzzera(false) }}
                className="border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
              >
                Annulla
              </button>
            </div>
          ) : (
            <button
              onClick={function() { setEsitoAzzera(null); setConfermaAzzera(true) }}
              disabled={!puoScrivere}
              className="inline-flex items-center gap-2 border border-red-300 text-red-700 px-4 py-2 rounded-lg hover:bg-red-50 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={16} /> Azzera dati importati
            </button>
          )}
        </div>
      </div>
    )
  }

  if (risultato) {
    var alr = risultato.alert || { inseriti: 0, saltati: 0, errori: [] }
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
          <CheckCircle2 className="mx-auto text-green-500 mb-3" size={48} />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Inserimento completato</h1>
          <p className="text-gray-600 mb-4">
            Inserite <span className="font-bold text-green-600">{risultato.inserite}</span> voci su {risultato.totale}.
          </p>

          <div className="text-left text-sm text-gray-600 space-y-1 mb-2">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-amber-500" />
              Alert: inseriti <span className="font-semibold">{alr.inseriti}</span>
              {alr.saltati > 0 ? (', gia presenti (saltati) ' + alr.saltati) : ''}
            </div>
            {risultato.eventiSaltati > 0 && (
              <div className="flex items-center gap-2">
                <Star size={14} className="text-amber-500" />
                Eventi non reinseriti: <span className="font-semibold">{risultato.eventiSaltati}</span> (restano quelli gia presenti)
              </div>
            )}
          </div>

          {risultato.errori.length > 0 && (
            <div className="text-left mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="font-medium text-red-700 mb-2 text-sm">{risultato.errori.length} righe non inserite:</div>
              <ul className="text-xs text-red-600 space-y-1 max-h-48 overflow-auto">
                {risultato.errori.map(function(e, i) { return <li key={i}>• {e}</li> })}
              </ul>
            </div>
          )}

          {alr.errori && alr.errori.length > 0 && (
            <div className="text-left mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="font-medium text-red-700 mb-2 text-sm">Problemi con gli alert:</div>
              <ul className="text-xs text-red-600 space-y-1">
                {alr.errori.map(function(e, i) { return <li key={i}>• {e}</li> })}
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
              onClick={function() { setCaricato(false); setVoci([]); setAlert([]); setRisultato(null); setNomeFile('') }}
              className="border border-gray-300 px-5 py-2.5 rounded-lg hover:bg-gray-50 font-medium text-gray-700"
            >
              Importa un altro file
            </button>
          </div>
        </div>
      </div>
    )
  }

  var giorni = giorniUnici()
  var attive = voci.filter(function(v) { return !v._scartata })
  var nPren = attive.filter(function(v) { return v._tipo === 'prenotazione' }).length
  var nEventi = attive.filter(function(v) { return v._tipo === 'evento' }).length
  var nAlert = alert.length
  var nDaInserire = nPren + (reinserisciEventi ? nEventi : 0)

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-6">

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex items-center gap-3">
        <FileJson className="text-wine-600 flex-shrink-0" size={24} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 text-sm truncate">{nomeFile}</div>
          <div className="text-xs text-gray-500">
            {nPren} prenotazioni · {nEventi} eventi · {alert.length} avvisi
          </div>
        </div>
        <button
          onClick={function() { setCaricato(false); setVoci([]); setAlert([]); setNomeFile('') }}
          className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100"
        >
          Cambia file
        </button>
      </div>

      {errore && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errore}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
            <Star size={14} className="text-amber-500" /> Eventi
          </div>
          <div className="text-xs text-gray-500">
            {reinserisciEventi
              ? 'Verranno reinseriti in event_dates (attenzione ai doppioni).'
              : 'Non vengono reinseriti: restano quelli gia presenti dal primo import.'}
          </div>
        </div>
        <button
          onClick={function() { setReinserisciEventi(!reinserisciEventi) }}
          className={
            'flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ' +
            (reinserisciEventi
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')
          }
        >
          {reinserisciEventi ? 'Reinserisco eventi: SÌ' : 'Reinserisco eventi: NO'}
        </button>
      </div>

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

      {modalita === 'giorno' && giorni.length > 0 && (
        <RevisioneGiorno
          giorni={giorni}
          giornoIdx={giornoIdx}
          setGiornoIdx={setGiornoIdx}
          vociDelGiorno={vociDelGiorno}
          aggiorna={aggiorna}
          toggleScarta={toggleScarta}
          cambiaTipo={cambiaTipo}
        />
      )}

      {modalita === 'lista' && (
        <RevisioneLista
          giorni={giorni}
          vociDelGiorno={vociDelGiorno}
          toggleScarta={toggleScarta}
          cambiaTipo={cambiaTipo}
        />
      )}

      {alert.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
          <div className="flex items-center gap-2 text-amber-800 font-medium text-sm mb-2">
            <Bell size={16} /> Avvisi dal file (verranno inseriti come alert, solo se non gia presenti)
          </div>
          <ul className="text-xs text-amber-700 space-y-1">
            {alert.map(function(a, i) {
              return <li key={i}>• {dataEstesa(a.data)} {a.pasto}: "{a.testo}"</li>
            })}
          </ul>
        </div>
      )}

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
            disabled={!puoScrivere || (nDaInserire + nAlert === 0)}
            className="w-full bg-wine-700 text-white py-3 rounded-lg hover:bg-wine-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Conferma e inserisci {nPren} prenotazioni
            {reinserisciEventi && nEventi > 0 ? ' + ' + nEventi + ' eventi' : ''}
            {nAlert > 0 ? ' + ' + nAlert + ' avvisi' : ''}
          </button>
        )}
      </div>

      <div className="h-4" />
    </div>
  )
}

function RevisioneGiorno(props) {
  var giorni = props.giorni
  var idx = props.giornoIdx
  var data = giorni[idx]
  var pranzo = props.vociDelGiorno(data, 'Pranzo')
  var cena = props.vociDelGiorno(data, 'Cena')

  function vai(delta) {
    var n = idx + delta
    if (n < 0) n = 0
    if (n > giorni.length - 1) n = giorni.length - 1
    props.setGiornoIdx(n)
  }

  return (
    <div>
      <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-4">
        <button onClick={function() { vai(-1) }} disabled={idx === 0} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30">
          <ChevronLeft size={22} />
        </button>
        <div className="text-center">
          <div className="font-semibold text-gray-900">{dataEstesa(data)}</div>
          <div className="text-xs text-gray-500">giorno {idx + 1} di {giorni.length}</div>
        </div>
        <button onClick={function() { vai(1) }} disabled={idx === giorni.length - 1} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30">
          <ChevronRight size={22} />
        </button>
      </div>

      <SezionePasto titolo="Pranzo" righe={pranzo} aggiorna={props.aggiorna} scarta={props.toggleScarta} cambiaTipo={props.cambiaTipo} />
      <SezionePasto titolo="Cena" righe={cena} aggiorna={props.aggiorna} scarta={props.toggleScarta} cambiaTipo={props.cambiaTipo} />

      {pranzo.length === 0 && cena.length === 0 && (
        <div className="text-center text-gray-400 py-8">Nessuna voce in questo giorno</div>
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
        {props.righe.map(function(v) {
          return <RigaVoce key={v._id} v={v} aggiorna={props.aggiorna} scarta={props.scarta} cambiaTipo={props.cambiaTipo} />
        })}
      </div>
    </div>
  )
}

function RigaVoce(props) {
  var v = props.v
  var scartata = v._scartata
  var isEvento = v._tipo === 'evento'

  var bgClass = scartata ? 'bg-gray-100 border-gray-200 opacity-60'
    : (isEvento ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200')

  return (
    <div className={'rounded-lg border p-3 transition-colors ' + bgClass}>

      <div className="flex items-center justify-between mb-2">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
          <button
            onClick={function() { props.cambiaTipo(v._id, 'prenotazione') }}
            disabled={scartata}
            className={'px-2.5 py-1 font-medium transition-colors ' + (!isEvento ? 'bg-wine-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}
          >
            Prenotazione
          </button>
          <button
            onClick={function() { props.cambiaTipo(v._id, 'evento') }}
            disabled={scartata}
            className={'px-2.5 py-1 font-medium transition-colors inline-flex items-center gap-1 ' + (isEvento ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}
          >
            <Star size={11} /> Evento
          </button>
        </div>
        <button
          onClick={function() { props.scarta(v._id) }}
          className={'p-1.5 rounded ' + (scartata ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-red-50 hover:text-red-600')}
          title={scartata ? 'Ripristina' : 'Scarta'}
        >
          {scartata ? <CheckCircle2 size={18} /> : <Trash2 size={18} />}
        </button>
      </div>

      {isEvento ? (
        <div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={v.titolo || ''}
              disabled={scartata}
              onChange={function(e) { props.aggiorna(v._id, 'titolo', e.target.value) }}
              className="flex-1 min-w-0 px-2 py-1.5 border border-amber-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              type="number"
              value={v.adulti == null ? '' : v.adulti}
              placeholder="ad"
              disabled={scartata}
              onChange={function(e) { props.aggiorna(v._id, 'adulti', e.target.value === '' ? null : (parseInt(e.target.value) || 0)) }}
              className="w-14 px-1 py-1.5 border border-amber-200 rounded text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              title="adulti"
            />
            <span className="text-amber-400 text-sm">+</span>
            <input
              type="number"
              value={v.bambini == null ? '' : v.bambini}
              placeholder="bb"
              disabled={scartata}
              onChange={function(e) { props.aggiorna(v._id, 'bambini', e.target.value === '' ? 0 : (parseInt(e.target.value) || 0)) }}
              className="w-14 px-1 py-1.5 border border-amber-200 rounded text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              title="bambini"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-xs text-amber-700">{v.pasto} · andra in event_dates</span>
            {v.adulti == null && (
              <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-800 text-xs px-2 py-0.5 rounded">
                <AlertTriangle size={11} /> ospiti da definire
              </span>
            )}
            {v.note && <span className="text-xs text-gray-500 truncate max-w-full">{v.note}</span>}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={v.nome_libero || ''}
              disabled={scartata}
              onChange={function(e) { props.aggiorna(v._id, 'nome_libero', e.target.value) }}
              className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
            />
            <input
              type="text"
              value={v.orario || ''}
              disabled={scartata}
              onChange={function(e) { props.aggiorna(v._id, 'orario', e.target.value) }}
              className={
                'w-16 px-2 py-1.5 border rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-wine-500 ' +
                (v.orario_default ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200')
              }
            />
            <input
              type="number"
              value={v.adulti}
              disabled={scartata}
              onChange={function(e) { props.aggiorna(v._id, 'adulti', parseInt(e.target.value) || 0) }}
              className="w-12 px-1 py-1.5 border border-gray-200 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-wine-500"
              title="adulti"
            />
            <span className="text-gray-300 text-sm">+</span>
            <input
              type="number"
              value={v.bambini}
              disabled={scartata}
              onChange={function(e) { props.aggiorna(v._id, 'bambini', parseInt(e.target.value) || 0) }}
              className="w-12 px-1 py-1.5 border border-gray-200 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-wine-500"
              title="bambini"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {v.orario_default && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">
                <Clock size={11} /> orario di default
              </span>
            )}
            {v.camera && (
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 text-xs px-2 py-0.5 rounded">
                <Bed size={11} /> camera: {v.camera}
              </span>
            )}
            {v.ha_allergeni && (
              <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded">
                <AlertTriangle size={11} /> allergene
              </span>
            )}
            {v.gift_codes && v.gift_codes.length > 0 && (
              <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded">
                <Gift size={11} /> gift {v.gift_codes.join(', ')}
              </span>
            )}
            {v.note && <span className="text-xs text-gray-500 truncate max-w-full">{v.note}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function RevisioneLista(props) {
  return (
    <div className="space-y-4">
      {props.giorni.map(function(data) {
        var righe = props.vociDelGiorno(data)
        if (righe.length === 0) return null

        return (
          <div key={data} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">{dataEstesa(data)}</div>

            {righe.map(function(v) {
              var isEvento = v._tipo === 'evento'
              var badge = null, badgeClass = ''
              if (isEvento) { badge = 'evento'; badgeClass = 'bg-amber-100 text-amber-800' }
              else if (v.ha_allergeni) { badge = 'allergene'; badgeClass = 'bg-red-100 text-red-700' }
              else if (v.camera) { badge = 'camera ' + v.camera; badgeClass = 'bg-amber-100 text-amber-800' }
              else if (v.gift_codes && v.gift_codes.length) { badge = 'gift card'; badgeClass = 'bg-purple-100 text-purple-700' }
              else if (v.orario_default) { badge = 'orario def'; badgeClass = 'bg-blue-100 text-blue-700' }

              var nome = isEvento ? v.titolo : v.nome_libero
              var dettaglio = isEvento
                ? (v.pasto + ' · evento · ' + (v.adulti != null ? (v.adulti + '+' + (v.bambini || 0)) : 'ospiti ?'))
                : ((v.pasto === 'Pranzo' ? 'Pranzo' : 'Cena') + ' · ' + (v.orario || '—') + ' · ' + v.adulti + '+' + v.bambini)

              return (
                <div key={v._id} className={'flex items-center gap-2 px-4 py-2.5 border-t border-gray-100 text-sm ' + (v._scartata ? 'bg-gray-100 opacity-50' : '')}>
                  <button
                    onClick={function() { props.cambiaTipo(v._id, isEvento ? 'prenotazione' : 'evento') }}
                    className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-amber-600"
                    title={isEvento ? 'Rendi prenotazione' : 'Rendi evento'}
                  >
                    <Star size={15} className={isEvento ? 'text-amber-500 fill-amber-500' : ''} />
                  </button>
                  <span className="flex-1 min-w-0 truncate text-gray-900">{nome}</span>
                  <span className="text-gray-500 text-xs whitespace-nowrap">{dettaglio}</span>
                  {badge && (
                    <span className={'text-xs px-2 py-0.5 rounded whitespace-nowrap ' + badgeClass}>{badge}</span>
                  )}
                  <button
                    onClick={function() { props.toggleScarta(v._id) }}
                    className={'p-1 rounded flex-shrink-0 ' + (v._scartata ? 'text-green-600' : 'text-gray-400 hover:text-red-600')}
                    title={v._scartata ? 'Ripristina' : 'Scarta'}
                  >
                    {v._scartata ? <CheckCircle2 size={16} /> : <X size={16} />}
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
