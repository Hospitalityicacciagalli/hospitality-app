import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  STATI, FASCE, oggiIso, formatData, numeroServizio,
  tipologieSimili, tipologiaUguale, normalizzaNome,
  scritturaEventi, SpazioModal
} from './EventiPage'

// ============================================================
// EventoScheda — un evento e i suoi servizi (FASE 1, sez. 0 v61-v67)
//
// /eventi/nuovo            evento nuovo. Accetta ?data=AAAA-MM-GG e
//                          ?fascia=lunch|dinner|both per compilare il
//                          primo servizio (servira' al pulsante "Apri in
//                          Eventi" della pagina del giorno, sessione 2).
// /eventi/:id              evento esistente.
//
// L'EVENTO e' un contenitore di SERVIZI (0.5 v61): data, fascia, spazi,
// i quattro numeri adulti + bambini e l'esclusiva stanno sul servizio.
//
// DUE SCRITTURE DISTINTE, come nel database (migrazione 60):
//   - "Salva" (evento_salva): titolo, tipologia, cliente, note e TUTTI i
//     servizi con i loro spazi, in un colpo solo. I servizi tolti dalla
//     scheda spariscono. Lo stato si sceglie solo alla nascita; la
//     scadenza di un'opzione si puo' correggere anche da qui (migrazione
//     62), e non puo' mai essere dopo il primo servizio.
//   - I pulsanti di STATO (evento_cambia_stato): opzione con scadenza
//     (vale anche come proroga), conferma, ritorno a richiesta,
//     annullamento con motivo, riapertura di un annullato. Si usano solo
//     a modifiche salvate, cosi' non si perde niente per strada.
// Cancellare (evento_elimina) e' possibile solo senza soldi in cassa:
// lo decide il database, la pagina mostra soltanto il pulsante giusto.
//
// Ogni scrittura passa da scritturaEventi (EventiPage.jsx), che presenta
// il gettone di elevazione: firma chi ha inserito il PIN.
//
// ERRORI (12/11/2026, verbale prova veloce): quello che impedisce di
// salvare si controlla in UNA funzione sola, problemiForm() (regola 31).
// Dopo il primo «Salva» che non passa, la barra in basso mostra la LISTA
// dei problemi e si aggiorna da sola man mano che si correggono; toccando
// una voce la pagina scorre al campo da sistemare.
//
// BOZZA (12/11/2026): mentre si compila, la scheda tiene una copia di
// tutto nel browser di quel computer (localStorage, 7 giorni). Tornando
// sullo stesso evento (o su «Nuovo evento») la bozza si riprende da sola,
// con un riquadro giallo e il pulsante «Scarta bozza». Sparisce con Salva,
// Crea evento, Scarta ed «Esci senza salvare». Protegge da ogni uscita:
// menu, F5, scheda chiusa, freccia «indietro» del browser.
//
// Il cliente si sceglie cercandolo. "Nuovo cliente" porta a Clienti ->
// Nuovo NELLA STESSA SCHEDA, con ?ritorno=<questa pagina>: salvato il
// cliente, CustomerForm torna qui con ?cliente=<id>, la bozza si riprende
// e il cliente risulta gia' scelto. La creazione dei clienti, con il
// controllo dei doppioni e i consensi, resta in una copia sola (regola 31).
// ============================================================

var CAMPI_NUMERO = [
  { key: 'ipotetici',        label: 'Ipotetici' },
  { key: 'minimo_garantito', label: 'Minimo garantito' },
  { key: 'definitivi',       label: 'Definitivi' },
  { key: 'effettivi',        label: 'Effettivi' }
]

var NOMI_NUMERI = [
  'ipotetici_adulti', 'ipotetici_bambini',
  'minimo_garantito_adulti', 'minimo_garantito_bambini',
  'definitivi_adulti', 'definitivi_bambini',
  'effettivi_adulti', 'effettivi_bambini'
]

function aStringa(v) {
  if (v === null || v === undefined) return ''
  return String(v)
}

function soloCifre(v) {
  return String(v || '').replace(/[^0-9]/g, '').slice(0, 5)
}

// La data del primo servizio. Le date sono AAAA-MM-GG: si confrontano
// come testo.
function primaDataServizi(servizi) {
  var p = ''
  var elenco = servizi || []
  for (var i = 0; i < elenco.length; i++) {
    var d = elenco[i].data
    if (d && (!p || d < p)) p = d
  }
  return p
}

// REGOLA (verbale Eventi fase 1, passo 25): la scadenza di un'opzione
// non puo' essere DOPO il primo servizio. Un'opzione che scade a evento
// gia' cominciato non ha senso, e un evento spostato o accorciato non
// deve lasciarla indietro. Lo stesso controllo vive nel database
// (migrazione 62, eventi_controlla_scadenza): questo serve a dirlo
// chiaramente prima di provare a salvare.
function messaggioScadenza(scadenza, primo) {
  return 'La scadenza dell\'opzione (' + formatData(scadenza) + ') e\' dopo il primo servizio (' +
    formatData(primo) + '). Anticipa la scadenza oppure correggi le date dei servizi: finche\' non sono coerenti l\'evento non si salva.'
}

// ---- BOZZA nel browser (localStorage) --------------------------------
// Una chiave per evento: bozza_evento_<id> oppure bozza_evento_nuovo.
// Dentro: { salvata_il: ISO, form: {...} }. Dopo 7 giorni non vale piu'.
// localStorage puo' mancare o rifiutare (navigazione privata, spazio
// pieno): ogni accesso e' protetto, e senza bozza la scheda funziona
// come prima.
var BOZZA_PREFISSO = 'bozza_evento_'
var BOZZA_DURATA_MS = 7 * 24 * 60 * 60 * 1000

function chiaveBozza(idEvento) {
  return BOZZA_PREFISSO + (idEvento || 'nuovo')
}

function leggiBozza(chiave) {
  try {
    var testo = window.localStorage.getItem(chiave)
    if (!testo) return null
    var b = JSON.parse(testo)
    if (!b || !b.form || !b.salvata_il) return null
    if (Date.now() - new Date(b.salvata_il).getTime() > BOZZA_DURATA_MS) {
      window.localStorage.removeItem(chiave)
      return null
    }
    return b
  } catch (e) {
    return null
  }
}

function scriviBozza(chiave, form) {
  try {
    window.localStorage.setItem(chiave, JSON.stringify({ salvata_il: new Date().toISOString(), form: form }))
  } catch (e) {
    // spazio pieno o browser che non lo permette: niente bozza
  }
}

function togliBozza(chiave) {
  try { window.localStorage.removeItem(chiave) } catch (e) { /* niente */ }
}

// Le bozze scadute di TUTTI gli eventi: si puliscono a ogni apertura.
function pulisciBozzeScadute() {
  try {
    var daTogliere = []
    for (var i = 0; i < window.localStorage.length; i++) {
      var k = window.localStorage.key(i)
      if (k && k.indexOf(BOZZA_PREFISSO) === 0) daTogliere.push(k)
    }
    for (var j = 0; j < daTogliere.length; j++) leggiBozza(daTogliere[j])
  } catch (e) { /* niente */ }
}

function formatOra(iso) {
  var d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  function due(n) { return n < 10 ? '0' + n : '' + n }
  return due(d.getDate()) + '/' + due(d.getMonth() + 1) + ' alle ' + due(d.getHours()) + ':' + due(d.getMinutes())
}

function fasciaValida(f) {
  return f === 'lunch' || f === 'dinner' || f === 'both'
}

export default function EventoScheda() {
  var auth = useAuth()
  var navigate = useNavigate()
  var params = useParams()
  var location = useLocation()
  var id = params.id || null
  var nuovo = !id
  var puoModificare = auth.canEdit('eventi')

  var contatore = useRef(0)
  function nuovaChiave() {
    contatore.current = contatore.current + 1
    return 'n' + contatore.current
  }

  function servizioVuoto(data, fascia) {
    var s = {
      chiave: nuovaChiave(),
      id: null,
      nome: '',
      data: data || '',
      fascia: fasciaValida(fascia) ? fascia : '',
      ora_inizio: '',
      ora_fine: '',
      ospiti_storici: null,
      occupa_coperti: true,
      esclusiva: false,
      note: '',
      sale: []
    }
    for (var i = 0; i < NOMI_NUMERI.length; i++) s[NOMI_NUMERI[i]] = ''
    return s
  }

  var [loading, setLoading] = useState(true)
  var [errore, setErrore] = useState(null)
  var [messaggio, setMessaggio] = useState(null)
  var [salvando, setSalvando] = useState(false)

  var [form, setForm] = useState(null)
  var [fotografia, setFotografia] = useState('')
  var [evento, setEvento] = useState(null)
  var [haSoldi, setHaSoldi] = useState(null)

  var [tipologie, setTipologie] = useState([])
  var [sale, setSale] = useState([])
  var [utenti, setUtenti] = useState({})

  var [cercaTesto, setCercaTesto] = useState('')
  var [risultati, setRisultati] = useState([])
  var [cambiaCliente, setCambiaCliente] = useState(false)

  var [modaleStato, setModaleStato] = useState(null)
  var [scadenzaInput, setScadenzaInput] = useState('')
  var [motivoInput, setMotivoInput] = useState('')
  var [riapriStato, setRiapriStato] = useState('')
  var [erroreModale, setErroreModale] = useState(null)
  var [lavoraModale, setLavoraModale] = useState(false)

  var [modaleElimina, setModaleElimina] = useState(false)
  var [hoCapito, setHoCapito] = useState(false)

  var [spazioPer, setSpazioPer] = useState(null)

  // tentato: e' gia' stato premuto Salva con dei problemi -> la barra in
  // basso mostra la lista viva. confermaSimile: il testo di una tipologia
  // nuova che assomiglia a una esistente e per cui e' stata chiesta la
  // seconda conferma. appenaCreato: dopo «Crea evento» la scheda si
  // ricarica (stesso componente, regola 57) e deve dire «Evento salvato.».
  var [tentato, setTentato] = useState(false)
  var [confermaSimile, setConfermaSimile] = useState('')
  var appenaCreato = useRef(false)

  // bozzaRipresa: la bozza che e' stata rimessa nella scheda ({ salvata_il,
  // dopo: true se l'evento e' stato modificato nel database DOPO la bozza}).
  // chiaveAttiva: la chiave della bozza a cui appartiene il modulo che si
  // vede. Vale null mentre si carica e dopo un salvataggio: cosi' durante
  // il passaggio da «nuovo» all'evento creato (regola 57) il modulo
  // vecchio non finisce nella bozza dell'evento nuovo.
  var [bozzaRipresa, setBozzaRipresa] = useState(null)
  var chiaveAttiva = useRef(null)

  // Uscita dalla scheda con modifiche non salvate (verbale passo 23).
  // uscitaVerso = la pagina dove volevi andare, in attesa di conferma.
  // modificatoRef tiene "ci sono modifiche?" per gli ascoltatori qui
  // sotto, che nascono una volta sola e non vedono le variabili nuove.
  var [uscitaVerso, setUscitaVerso] = useState(null)
  var modificatoRef = useRef(false)

  useEffect(function() { carica() }, [id])

  // Ogni modifica finisce nella bozza; tornati uguali al salvato, la bozza
  // sparisce.
  useEffect(function() {
    if (loading || !form || !chiaveAttiva.current) return
    if (JSON.stringify(form) !== fotografia) scriviBozza(chiaveAttiva.current, form)
    else togliBozza(chiaveAttiva.current)
  }, [form, fotografia, loading])

  // Due strade per perdere le modifiche:
  //  - chiudere o ricaricare la scheda del browser: il browser mostra il
  //    suo avviso (il testo lo decide lui, non si puo' cambiare);
  //  - toccare una voce del menu' laterale: il clic si ferma prima che
  //    arrivi al menu' e si apre la finestra «Modifiche non salvate».
  // La freccia "indietro" del browser NON si puo' fermare con il router
  // che usa il programma: resta l'unica uscita senza avviso.
  useEffect(function() {
    function primaDiChiudere(e) {
      if (!modificatoRef.current) return
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    function suClick(e) {
      if (!modificatoRef.current) return
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null
      if (!a) return
      if (a.getAttribute('target') === '_blank') return
      var url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      setUscitaVerso(url.pathname + url.search)
    }
    window.addEventListener('beforeunload', primaDiChiudere)
    document.addEventListener('click', suClick, true)
    return function() {
      window.removeEventListener('beforeunload', primaDiChiudere)
      document.removeEventListener('click', suClick, true)
    }
  }, [])

  function vai(percorso) {
    if (modificatoRef.current) { setUscitaVerso(percorso); return }
    navigate(percorso)
  }

  // La scadenza che vale per il controllo: quella scelta alla nascita
  // per un evento nuovo in opzione, quella della scheda per un evento
  // esistente che e' in opzione. Negli altri stati non c'e' scadenza.
  function scadenzaVigente(f) {
    if (nuovo) return f.stato === 'opzione' ? f.scadenza : ''
    return evento && evento.stato === 'opzione' ? f.scadenza : ''
  }

  // I problemi che impediscono di salvare, in UNA copia sola (regola 31):
  // la usa salva() per decidere e la barra in basso per mostrarli.
  // dove = l'id del riquadro a cui la pagina scorre toccando la voce.
  function problemiForm(f) {
    var lista = []
    if (!f.titolo.trim()) lista.push({ testo: 'Manca il titolo.', dove: 'campo-titolo' })
    var clienteObbligatorio = nuovo || (evento && evento.provenienza === 'modulo')
    if (clienteObbligatorio && !f.cliente) lista.push({ testo: 'Manca il cliente.', dove: 'campo-cliente' })
    if (f.tipologiaTesto.trim() && !tipologiaUguale(f.tipologiaTesto, tipologie)) {
      lista.push({ testo: 'La tipologia "' + f.tipologiaTesto.trim() + '" non e\' nell\'elenco: sceglila fra i suggerimenti oppure aggiungila.', dove: 'campo-tipologia' })
    }
    if (nuovo && f.stato === 'opzione' && !f.scadenza) {
      lista.push({ testo: 'Manca la scadenza dell\'opzione.', dove: 'campo-scadenza' })
    }
    var scad = scadenzaVigente(f)
    var primo = primaDataServizi(f.servizi)
    if (scad && primo && scad > primo) {
      lista.push({ testo: 'La scadenza dell\'opzione (' + formatData(scad) + ') e\' dopo il primo servizio (' + formatData(primo) + ').', dove: nuovo ? 'campo-scadenza' : 'campo-stato' })
    }
    if (f.servizi.length === 0) lista.push({ testo: 'Serve almeno un servizio.', dove: null })
    for (var i = 0; i < f.servizi.length; i++) {
      var sv = f.servizi[i]
      var n = i + 1
      if (!sv.data) lista.push({ testo: 'Servizio ' + n + ': manca la data.', dove: 'servizio-' + sv.chiave })
      if (!fasciaValida(sv.fascia)) lista.push({ testo: 'Servizio ' + n + ': scegli pranzo, cena o giornata intera.', dove: 'servizio-' + sv.chiave })
    }
    return lista
  }

  function vaiAlCampo(dove) {
    if (!dove) return
    var el = document.getElementById(dove)
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // ----------------------------------------------------------
  // CARICAMENTO
  // ----------------------------------------------------------
  function caricaElenchi() {
    return Promise.all([
      supabase.from('eventi_tipologie').select('id, nome, attiva, ordine').order('ordine', { ascending: true }),
      supabase.from('sale').select('id, nome, ordine, attiva, solo_eventi').order('ordine', { ascending: true }),
      supabase.from('user_profiles').select('id, display_name, first_name, last_name')
    ]).then(function(res) {
      if (!res[0].error) setTipologie(res[0].data || [])
      if (!res[1].error) setSale(res[1].data || [])
      if (!res[2].error) {
        var m = {}
        var u = res[2].data || []
        for (var i = 0; i < u.length; i++) {
          m[u[i].id] = u[i].display_name || ((u[i].first_name || '') + ' ' + (u[i].last_name || '')).trim()
        }
        setUtenti(m)
      }
      return res
    })
  }

  function carica() {
    setLoading(true)
    setErrore(null)
    setMessaggio(null)
    setTentato(false)
    setConfermaSimile('')
    setBozzaRipresa(null)
    chiaveAttiva.current = null
    pulisciBozzeScadute()
    setCambiaCliente(false)
    setCercaTesto('')
    setRisultati([])

    if (nuovo) {
      var q = new URLSearchParams(location.search)
      caricaElenchi().then(function() {
        var f = {
          titolo: '',
          tipologiaTesto: '',
          cliente: null,
          note: '',
          stato: 'richiesta',
          scadenza: '',
          servizi: [servizioVuoto(q.get('data') || '', q.get('fascia') || '')]
        }
        setEvento(null)
        setHaSoldi(false)
        setFotografia(JSON.stringify(f))
        setForm(riprendiBozza(f, null))
        setLoading(false)
        clienteDalRitorno()
      })
      return
    }

    Promise.all([
      supabase.from('eventi')
        .select('id, titolo, tipologia_id, stato, cliente_id, scadenza_opzione, note, annullato_il, motivo_annullamento, provenienza, created_at, created_by, updated_at, updated_by, customers(id, first_name, last_name, phone, email), eventi_servizi(id, nome, data, fascia, ora_inizio, ora_fine, ipotetici_adulti, ipotetici_bambini, minimo_garantito_adulti, minimo_garantito_bambini, definitivi_adulti, definitivi_bambini, effettivi_adulti, effettivi_bambini, ospiti_storici, occupa_coperti, esclusiva, note, ordine, eventi_servizi_sale(sala_id))')
        .eq('id', id)
        .maybeSingle(),
      supabase.rpc('evento_ha_soldi', { p_evento_id: id }),
      caricaElenchi()
    ]).then(function(res) {
      setLoading(false)
      if (res[0].error) {
        setErrore('Errore nel caricamento: ' + res[0].error.message)
        return
      }
      var ev = res[0].data
      if (!ev) {
        setErrore('Evento non trovato: forse e\' stato cancellato.')
        return
      }
      setEvento(ev)
      setHaSoldi(res[1].error ? null : res[1].data === true)

      var tipTesto = ''
      var tl = res[2][0].data || []
      for (var i = 0; i < tl.length; i++) {
        if (tl[i].id === ev.tipologia_id) tipTesto = tl[i].nome
      }

      var servizi = (ev.eventi_servizi || []).slice()
      servizi.sort(function(a, b) {
        if ((a.ordine || 0) !== (b.ordine || 0)) return (a.ordine || 0) - (b.ordine || 0)
        return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0)
      })
      var sv = []
      for (var j = 0; j < servizi.length; j++) {
        var s = servizi[j]
        var x = {
          chiave: nuovaChiave(),
          id: s.id,
          nome: s.nome || '',
          data: s.data || '',
          fascia: s.fascia || '',
          ora_inizio: s.ora_inizio ? String(s.ora_inizio).slice(0, 5) : '',
          ora_fine: s.ora_fine ? String(s.ora_fine).slice(0, 5) : '',
          ospiti_storici: s.ospiti_storici,
          occupa_coperti: s.occupa_coperti !== false,
          esclusiva: s.esclusiva === true,
          note: s.note || '',
          sale: (s.eventi_servizi_sale || []).map(function(r) { return r.sala_id })
        }
        for (var k = 0; k < NOMI_NUMERI.length; k++) x[NOMI_NUMERI[k]] = aStringa(s[NOMI_NUMERI[k]])
        sv.push(x)
      }
      if (sv.length === 0) sv.push(servizioVuoto('', ''))

      var f = {
        titolo: ev.titolo || '',
        tipologiaTesto: tipTesto,
        cliente: ev.customers || null,
        note: ev.note || '',
        stato: ev.stato,
        scadenza: ev.scadenza_opzione || '',
        servizi: sv
      }
      setFotografia(JSON.stringify(f))
      setForm(riprendiBozza(f, ev.updated_at))
      if (appenaCreato.current) {
        appenaCreato.current = false
        setMessaggio('Evento salvato.')
      }
      clienteDalRitorno()
    })
  }

  // Se per questo evento c'e' una bozza valida la rimette nella scheda
  // (con chiavi dei servizi NUOVE: quelle salvate potrebbero ripetersi);
  // altrimenti restituisce il modulo letto. Da qui in poi le modifiche
  // vanno nella bozza di questo evento.
  function riprendiBozza(f, aggiornatoIl) {
    var chiave = chiaveBozza(id)
    chiaveAttiva.current = chiave
    var b = leggiBozza(chiave)
    if (!b) return f
    var g = {}
    for (var k in b.form) g[k] = b.form[k]
    g.servizi = (b.form.servizi || []).map(function(sv) {
      var c = {}
      for (var h in sv) c[h] = sv[h]
      c.chiave = nuovaChiave()
      return c
    })
    if (g.servizi.length === 0) return f
    setBozzaRipresa({
      salvata_il: b.salvata_il,
      dopo: !!(aggiornatoIl && new Date(aggiornatoIl).getTime() > new Date(b.salvata_il).getTime())
    })
    return g
  }

  function scartaBozza() {
    togliBozza(chiaveBozza(id))
    setBozzaRipresa(null)
    carica()
  }

  // Ritorno da Clienti -> Nuovo: ?cliente=<id> nell'indirizzo. Si legge il
  // cliente, lo si mette nella scheda e si toglie il parametro, cosi' un
  // ricaricamento non lo rimette.
  function clienteDalRitorno() {
    var q = new URLSearchParams(location.search)
    var cid = q.get('cliente')
    if (!cid) return
    navigate(location.pathname, { replace: true })
    supabase.from('customers')
      .select('id, first_name, last_name, phone, email')
      .eq('id', cid)
      .maybeSingle()
      .then(function(res) {
        if (res.error || !res.data) {
          setErrore('Non trovo il cliente appena registrato: cercalo per nome.')
          return
        }
        imposta('cliente', res.data)
        setCambiaCliente(false)
        setMessaggio('Cliente "' + res.data.last_name + ' ' + res.data.first_name + '" scelto per l\'evento. Ricordati di salvare.')
      })
  }

  // ----------------------------------------------------------
  // MODIFICHE AL MODULO
  // ----------------------------------------------------------
  function imposta(campo, valore) {
    setForm(function(prev) {
      var u = {}
      for (var k in prev) u[k] = prev[k]
      u[campo] = valore
      return u
    })
  }

  function impostaServizio(chiave, campo, valore) {
    setForm(function(prev) {
      var u = {}
      for (var k in prev) u[k] = prev[k]
      u.servizi = prev.servizi.map(function(s) {
        if (s.chiave !== chiave) return s
        var c = {}
        for (var h in s) c[h] = s[h]
        c[campo] = valore
        return c
      })
      return u
    })
  }

  function aggiungiServizio() {
    setForm(function(prev) {
      var u = {}
      for (var k in prev) u[k] = prev[k]
      var ultimo = prev.servizi.length > 0 ? prev.servizi[prev.servizi.length - 1] : null
      u.servizi = prev.servizi.concat([servizioVuoto(ultimo ? ultimo.data : '', '')])
      return u
    })
  }

  function togliServizio(chiave) {
    setForm(function(prev) {
      if (prev.servizi.length <= 1) return prev
      var u = {}
      for (var k in prev) u[k] = prev[k]
      u.servizi = prev.servizi.filter(function(s) { return s.chiave !== chiave })
      return u
    })
  }

  function toggleSala(chiave, salaId) {
    setForm(function(prev) {
      var u = {}
      for (var k in prev) u[k] = prev[k]
      u.servizi = prev.servizi.map(function(s) {
        if (s.chiave !== chiave) return s
        var c = {}
        for (var h in s) c[h] = s[h]
        if (s.sale.indexOf(salaId) >= 0) c.sale = s.sale.filter(function(x) { return x !== salaId })
        else c.sale = s.sale.concat([salaId])
        return c
      })
      return u
    })
  }

  // ----------------------------------------------------------
  // CLIENTE
  // ----------------------------------------------------------
  function cercaClienti(testo) {
    setCercaTesto(testo)
    var t = testo.trim()
    if (t.length < 2) { setRisultati([]); return }
    supabase.from('customers')
      .select('id, first_name, last_name, phone, email')
      .eq('is_active', true)
      .or('last_name.ilike.%' + t + '%,first_name.ilike.%' + t + '%,phone.ilike.%' + t + '%,email.ilike.%' + t + '%')
      .order('last_name')
      .limit(10)
      .then(function(res) {
        if (!res.error) setRisultati(res.data || [])
      })
  }

  function scegliCliente(c) {
    imposta('cliente', c)
    setCambiaCliente(false)
    setCercaTesto('')
    setRisultati([])
  }

  // Stessa scheda: la bozza e' gia' salvata dall'effetto qui sopra, e
  // CustomerForm torna qui. Si naviga direttamente (non con vai()): non
  // e' un'uscita che perde dati, quindi niente finestra «Modifiche non
  // salvate».
  function apriNuovoCliente() {
    if (chiaveAttiva.current && JSON.stringify(form) !== fotografia) scriviBozza(chiaveAttiva.current, form)
    navigate('/clienti/nuovo?ritorno=' + encodeURIComponent(location.pathname))
  }

  // ----------------------------------------------------------
  // TIPOLOGIA
  // ----------------------------------------------------------
  function aggiungiTipologia() {
    var nome = form.tipologiaTesto.trim()
    if (!nome) return
    setErrore(null)
    scritturaEventi(auth, 'tipologia_salva', {
      p_id: null, p_nome: nome, p_attiva: true, p_ordine: null
    }).then(function(r) {
      if (r.errore) { setErrore(r.errore); return }
      caricaElenchi()
      setMessaggio('Tipologia "' + nome + '" aggiunta all\'elenco.')
    })
  }

  // ----------------------------------------------------------
  // SALVA (evento_salva)
  // ----------------------------------------------------------
  function salva() {
    setErrore(null)
    setMessaggio(null)
    var f = form

    // Un controllo solo (problemiForm): se c'e' qualcosa da sistemare la
    // barra in basso lo elenca e si aggiorna da sola.
    if (problemiForm(f).length > 0) {
      setTentato(true)
      return
    }

    var tipologiaId = ''
    if (f.tipologiaTesto.trim()) tipologiaId = tipologiaUguale(f.tipologiaTesto, tipologie).id

    var servizi = []
    for (var i = 0; i < f.servizi.length; i++) {
      var s = f.servizi[i]
      var x = {
        id: s.id || '',
        nome: s.nome.trim(),
        data: s.data,
        fascia: s.fascia,
        ora_inizio: s.ora_inizio || '',
        ora_fine: s.ora_fine || '',
        occupa_coperti: s.occupa_coperti,
        esclusiva: s.esclusiva,
        note: s.note.trim(),
        sale: s.sale
      }
      for (var k = 0; k < NOMI_NUMERI.length; k++) x[NOMI_NUMERI[k]] = s[NOMI_NUMERI[k]]
      servizi.push(x)
    }

    var dati = {
      id: nuovo ? '' : id,
      titolo: f.titolo.trim(),
      tipologia_id: tipologiaId,
      cliente_id: f.cliente ? f.cliente.id : '',
      note: f.note.trim(),
      servizi: servizi
    }
    if (nuovo) {
      dati.stato = f.stato
      dati.scadenza_opzione = f.stato === 'opzione' ? f.scadenza : ''
    } else if (evento && evento.stato === 'opzione') {
      // Dalla migrazione 62 la scadenza di un'opzione si puo' correggere
      // anche dalla scheda, insieme ai servizi: e' l'unico modo di
      // spostare in un colpo solo l'evento e la sua scadenza.
      dati.scadenza_opzione = f.scadenza
    }

    setSalvando(true)
    scritturaEventi(auth, 'evento_salva', { p_evento: dati }).then(function(r) {
      setSalvando(false)
      if (r.errore) { setErrore(r.errore); return }
      togliBozza(chiaveBozza(id))
      chiaveAttiva.current = null
      setBozzaRipresa(null)
      if (nuovo) {
        appenaCreato.current = true
        navigate('/eventi/' + r.data, { replace: true })
      } else {
        carica()
        setTimeout(function() { setMessaggio('Evento salvato.') }, 0)
      }
    })
  }

  // ----------------------------------------------------------
  // STATO (evento_cambia_stato)
  // ----------------------------------------------------------
  function apriModaleStato(tipo) {
    setErroreModale(null)
    setLavoraModale(false)
    setScadenzaInput(evento && evento.scadenza_opzione ? evento.scadenza_opzione : '')
    setMotivoInput('')
    setRiapriStato('')
    setModaleStato(tipo)
  }

  function confermaStato() {
    var stato = modaleStato
    var scad = null
    var motivo = null
    if (modaleStato === 'riapri') {
      if (!riapriStato) { setErroreModale('Scegli in che stato riaprire l\'evento.'); return }
      stato = riapriStato
    }
    if (stato === 'opzione') {
      if (!scadenzaInput) { setErroreModale('Scegli la data di scadenza dell\'opzione.'); return }
      scad = scadenzaInput
      var primoSalvato = primaDataServizi(evento ? evento.eventi_servizi : [])
      if (primoSalvato && scad > primoSalvato) {
        setErroreModale('La scadenza non puo\' essere dopo il primo servizio (' + formatData(primoSalvato) + '): scegli una data entro quel giorno.')
        return
      }
    }
    if (stato === 'annullato') {
      if (!motivoInput.trim()) { setErroreModale('Scrivi il motivo dell\'annullamento.'); return }
      motivo = motivoInput.trim()
    }
    setLavoraModale(true)
    setErroreModale(null)
    scritturaEventi(auth, 'evento_cambia_stato', {
      p_evento_id: id, p_stato: stato, p_scadenza: scad, p_motivo: motivo
    }).then(function(r) {
      setLavoraModale(false)
      if (r.errore) { setErroreModale(r.errore); return }
      setModaleStato(null)
      carica()
    })
  }

  // ----------------------------------------------------------
  // ELIMINA (evento_elimina)
  // ----------------------------------------------------------
  function elimina() {
    setLavoraModale(true)
    setErroreModale(null)
    scritturaEventi(auth, 'evento_elimina', { p_evento_id: id }).then(function(r) {
      setLavoraModale(false)
      if (r.errore) { setErroreModale(r.errore); return }
      setModaleElimina(false)
      navigate('/eventi', { replace: true })
    })
  }

  // ----------------------------------------------------------
  // DISEGNO
  // ----------------------------------------------------------
  // ⚠️ "!nuovo && !evento": dopo «Crea evento» si passa da /eventi/nuovo
  // a /eventi/<id>. Le due pagine sono lo STESSO componente, che React
  // non smonta: per un attimo c'e' gia' l'id ma l'evento non e' ancora
  // caricato, e il disegno leggeva evento.stato su null. Pagina bianca
  // (verbale Eventi fase 1, passo 20). Finche' l'evento non arriva si
  // mostra «Caricamento...».
  if (loading || !form || (!nuovo && !evento)) {
    modificatoRef.current = false
    return (
      <div className="p-4 lg:p-6 max-w-3xl mx-auto">
        {errore ? (
          <div>
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{errore}</div>
            <button type="button" onClick={function() { navigate('/eventi') }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              Torna a Eventi
            </button>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-gray-400">Caricamento...</div>
        )}
      </div>
    )
  }

  var modificato = JSON.stringify(form) !== fotografia
  modificatoRef.current = modificato
  var problemiVivi = tentato ? problemiForm(form) : []
  var disab = !puoModificare
  var oggi = oggiIso()
  var statoAttuale = nuovo ? null : evento.stato
  var scaduta = statoAttuale === 'opzione' && evento.scadenza_opzione && evento.scadenza_opzione < oggi
  var primaServizio = primaDataServizi(form.servizi)
  var scadForm = scadenzaVigente(form)
  var scadenzaIncoerente = !!(scadForm && primaServizio && scadForm > primaServizio)
  var scadenzaCambiata = !nuovo && statoAttuale === 'opzione' && form.scadenza !== (evento.scadenza_opzione || '')

  var tipologieAttive = tipologie.filter(function(t) { return t.attiva !== false })
  var tipUguale = tipologiaUguale(form.tipologiaTesto, tipologie)
  var tipSimili = tipUguale ? [] : tipologieSimili(form.tipologiaTesto, tipologieAttive, null)
  var testoTip = normalizzaNome(form.tipologiaTesto)
  var suggerimenti = []
  if (!tipUguale) {
    for (var i = 0; i < tipologieAttive.length && suggerimenti.length < 8; i++) {
      var tn = normalizzaNome(tipologieAttive[i].nome)
      if (!testoTip || tn.indexOf(testoTip) >= 0) suggerimenti.push(tipologieAttive[i])
    }
  }

  var inputClasse = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 disabled:bg-gray-100'
  var numClasse = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-wine-500 disabled:bg-gray-100'

  function bottoneScelta(attivo, testo, onClick, disabilitato) {
    return (
      <button type="button" onClick={onClick} disabled={disabilitato}
        className={'px-3 py-2 rounded-lg text-sm font-medium border ' +
          (attivo ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50') +
          (disabilitato ? ' opacity-60' : '')}>
        {testo}
      </button>
    )
  }

  function bottoneStato(testo, tipo, rosso) {
    return (
      <button type="button" onClick={function() { apriModaleStato(tipo) }} disabled={modificato}
        className={'px-3 py-2 rounded-lg text-sm font-medium border disabled:opacity-50 ' +
          (rosso ? 'border-red-300 text-red-700 bg-white hover:bg-red-50' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50')}>
        {testo}
      </button>
    )
  }

  var titoloModale = {
    opzione: statoAttuale === 'opzione' ? 'Proroga l\'opzione' : 'Metti in opzione',
    confermato: 'Conferma l\'evento',
    richiesta: 'Torna a richiesta',
    annullato: 'Annulla l\'evento',
    riapri: 'Riapri l\'evento'
  }

  return (
    <div className={'p-4 lg:p-6 max-w-3xl mx-auto ' + (problemiVivi.length > 0 ? 'pb-56' : 'pb-28')}>

      <div className="flex items-center justify-between gap-3 mb-4">
        <button type="button" onClick={function() { vai('/eventi') }}
          className="text-sm text-wine-700 hover:text-wine-900">
          ← Eventi
        </button>
        {!nuovo && (
          scaduta ? (
            <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-red-600 text-white">Opzione scaduta</span>
          ) : (
            <span className={'inline-block px-3 py-1 rounded-full text-sm font-medium ' + STATI[statoAttuale].classe}>{STATI[statoAttuale].label}</span>
          )
        )}
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-4">{nuovo ? 'Nuovo evento' : (evento.titolo || 'Evento')}</h1>

      {!puoModificare && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
          Sola lettura: per modificare serve il permesso Eventi in modifica (anche col PIN).
        </div>
      )}
      {errore && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{errore}</div>
      )}
      {messaggio && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">{messaggio}</div>
      )}
      {bozzaRipresa && modificato && (
        <div className={'mb-4 p-3 border rounded-lg text-sm flex items-start justify-between gap-3 ' + (bozzaRipresa.dopo ? 'bg-red-50 border-red-300 text-red-800' : 'bg-yellow-50 border-yellow-300 text-yellow-900')}>
          <div>
            <div className="font-semibold">Ripresa la bozza non salvata del {formatOra(bozzaRipresa.salvata_il)}.</div>
            {bozzaRipresa.dopo ? (
              <div>Attenzione: l'evento e' stato modificato da qualcuno DOPO questa bozza. Salvando, la bozza sostituisce quelle modifiche: controlla prima, oppure scarta la bozza.</div>
            ) : (
              <div>Quello che vedi non e' ancora salvato: premi Salva quando hai finito.</div>
            )}
          </div>
          <button type="button" onClick={scartaBozza}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50 flex-shrink-0">
            Scarta bozza
          </button>
        </div>
      )}

      {/* ===================== STATO (evento esistente) ===================== */}
      {!nuovo && (
        <div id="campo-stato" className="mb-4 p-4 bg-white border border-gray-200 rounded-lg">
          <div className="text-sm text-gray-700">
            Stato: <span className="font-semibold">{STATI[statoAttuale].label}</span>
            {statoAttuale === 'opzione' && evento.scadenza_opzione && (
              <span>{' '}· scade {formatData(evento.scadenza_opzione, true)}</span>
            )}
          </div>
          {statoAttuale === 'annullato' && (
            <div className="text-sm text-red-700 mt-1">
              Annullato il {formatData(evento.annullato_il)}: {evento.motivo_annullamento}
            </div>
          )}
          {scaduta && (
            <div className="text-sm text-red-700 mt-1">
              L'opzione e' scaduta e continua a tenere occupati i posti: va chiusa (proroga, conferma o annullamento).
            </div>
          )}
          {statoAttuale === 'opzione' && puoModificare && (scadenzaIncoerente || scadenzaCambiata) && (
            <div className={'mt-3 p-3 rounded-lg border text-sm ' + (scadenzaIncoerente ? 'bg-red-50 border-red-300 text-red-800' : 'bg-amber-50 border-amber-300 text-amber-900')}>
              {scadenzaIncoerente ? (
                <div className="mb-2">
                  <div className="font-semibold">La scadenza dell'opzione e' dopo il primo servizio.</div>
                  <div>
                    Scadenza {formatData(scadForm)}, primo servizio {formatData(primaServizio)}. Scegli tu:
                    anticipa qui la scadenza, oppure correggi le date dei servizi. Finche' non sono coerenti
                    l'evento non si salva.
                  </div>
                </div>
              ) : (
                <div className="mb-2 font-semibold">Scadenza cambiata: si salva con «Salva», insieme al resto.</div>
              )}
              <label className="block text-xs font-medium mb-1">Scadenza dell'opzione</label>
              <input type="date" value={form.scadenza} max={primaServizio || undefined}
                onChange={function(e) { imposta('scadenza', e.target.value) }}
                className={inputClasse} />
            </div>
          )}
          {puoModificare && (
            <div className="flex flex-wrap gap-2 mt-3">
              {statoAttuale === 'richiesta' && bottoneStato('Metti in opzione', 'opzione')}
              {statoAttuale === 'opzione' && bottoneStato('Proroga opzione', 'opzione')}
              {statoAttuale === 'confermato' && bottoneStato('Rimetti in opzione', 'opzione')}
              {statoAttuale !== 'confermato' && statoAttuale !== 'annullato' && bottoneStato('Conferma', 'confermato')}
              {(statoAttuale === 'opzione' || statoAttuale === 'confermato') && bottoneStato('Torna a richiesta', 'richiesta')}
              {statoAttuale !== 'annullato' && bottoneStato('Annulla evento', 'annullato', true)}
              {statoAttuale === 'annullato' && bottoneStato('Riapri evento', 'riapri')}
            </div>
          )}
          {puoModificare && modificato && (
            <div className="text-xs text-amber-700 mt-2">Salva prima le modifiche: poi potrai cambiare lo stato.</div>
          )}
        </div>
      )}

      {/* ===================== TESTATA ===================== */}
      <div className="mb-4 p-4 bg-white border border-gray-200 rounded-lg space-y-4">
        <div id="campo-titolo">
          <label className="block text-xs font-medium text-gray-700 mb-1">Titolo</label>
          <input type="text" value={form.titolo} disabled={disab}
            onChange={function(e) { imposta('titolo', e.target.value) }}
            placeholder="es. Matrimonio Rossi - Bianchi"
            className={inputClasse} />
        </div>

        {/* Tipologia */}
        <div id="campo-tipologia">
          <label className="block text-xs font-medium text-gray-700 mb-1">Tipologia</label>
          <input type="text" value={form.tipologiaTesto} disabled={disab}
            onChange={function(e) { imposta('tipologiaTesto', e.target.value) }}
            placeholder="Scrivi o scegli qui sotto"
            className={inputClasse} />
          {!disab && suggerimenti.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {suggerimenti.map(function(t) {
                return (
                  <button key={t.id} type="button" onClick={function() { imposta('tipologiaTesto', t.nome) }}
                    className="px-3 py-1 rounded-full text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                    {t.nome}
                  </button>
                )
              })}
            </div>
          )}
          {!disab && form.tipologiaTesto.trim() && !tipUguale && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
              {tipSimili.length > 0 && (
                <div className="mb-2">
                  Esiste gia':{' '}
                  {tipSimili.map(function(t) {
                    return (
                      <button key={t.id} type="button" onClick={function() { imposta('tipologiaTesto', t.nome) }}
                        className="ml-1 px-2 py-0.5 rounded-full border border-amber-400 bg-white text-amber-900 text-sm">
                        usa "{t.nome}"
                      </button>
                    )
                  })}
                </div>
              )}
              {tipSimili.length > 0 && confermaSimile === form.tipologiaTesto.trim() ? (
                <div className="p-2 bg-white border border-amber-400 rounded-lg">
                  <div className="font-semibold mb-1">
                    Sicuro? "{form.tipologiaTesto.trim()}" assomiglia a {tipSimili.map(function(t) { return '"' + t.nome + '"' }).join(', ')}.
                  </div>
                  <div className="mb-2">Aggiungila solo se e' davvero una tipologia diversa.</div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={function() { setConfermaSimile(''); aggiungiTipologia() }}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white">
                      Si', aggiungi "{form.tipologiaTesto.trim()}"
                    </button>
                    <button type="button" onClick={function() { setConfermaSimile('') }}
                      className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                      No
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  "{form.tipologiaTesto.trim()}" non e' nell'elenco.{' '}
                  <button type="button"
                    onClick={function() {
                      if (tipSimili.length > 0) setConfermaSimile(form.tipologiaTesto.trim())
                      else aggiungiTipologia()
                    }}
                    className="ml-1 underline font-medium">
                    Aggiungi all'elenco
                  </button>
                </div>
              )}
            </div>
          )}
          {tipUguale && tipUguale.attiva === false && (
            <div className="mt-1 text-xs text-gray-500">Tipologia spenta: resta su questo evento, ma non viene piu' proposta.</div>
          )}
        </div>

        {/* Cliente */}
        <div id="campo-cliente">
          <label className="block text-xs font-medium text-gray-700 mb-1">Cliente</label>
          {form.cliente && !cambiaCliente ? (
            <div className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-lg">
              <div className="min-w-0">
                <div className="font-medium text-gray-900">{form.cliente.last_name} {form.cliente.first_name}</div>
                <div className="text-sm text-gray-500 truncate">{form.cliente.phone || form.cliente.email || ''}</div>
              </div>
              {!disab && (
                <button type="button" onClick={function() { setCambiaCliente(true) }}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex-shrink-0">
                  Cambia
                </button>
              )}
            </div>
          ) : (
            <div>
              {!form.cliente && !nuovo && evento.provenienza === 'event_dates' && (
                <div className="mb-2 text-xs text-gray-500">Evento arrivato dall'archivio: il cliente non e' obbligatorio.</div>
              )}
              {!disab && (
                <div>
                  <input type="text" value={cercaTesto}
                    onChange={function(e) { cercaClienti(e.target.value) }}
                    placeholder="Cerca per cognome, nome, telefono o email..."
                    className={inputClasse} />
                  {risultati.length > 0 && (
                    <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                      {risultati.map(function(c) {
                        return (
                          <button key={c.id} type="button" onClick={function() { scegliCliente(c) }}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                            <div className="font-medium text-gray-900 text-sm">{c.last_name} {c.first_name}</div>
                            <div className="text-xs text-gray-500 truncate">{c.phone || c.email || ''}</div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {cercaTesto.trim().length >= 2 && risultati.length === 0 && (
                    <div className="mt-2 text-sm text-gray-500">Nessun cliente trovato.</div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <button type="button" onClick={apriNuovoCliente}
                      className="px-3 py-1.5 border border-wine-300 rounded-lg text-sm text-wine-700 hover:bg-wine-50 font-medium">
                      + Nuovo cliente
                    </button>
                    {form.cliente && (
                      <button type="button" onClick={function() { setCambiaCliente(false); setCercaTesto(''); setRisultati([]) }}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                        Lascia quello di prima
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    "Nuovo cliente" apre la scheda Clienti: registrato il cliente, si torna qui con tutto quello che hai scritto e il cliente gia' scelto.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stato iniziale (solo evento nuovo) */}
        {nuovo && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Stato di partenza</label>
            <div className="flex flex-wrap gap-2">
              {bottoneScelta(form.stato === 'richiesta', 'Richiesta', function() { imposta('stato', 'richiesta') }, disab)}
              {bottoneScelta(form.stato === 'opzione', 'Opzione', function() { imposta('stato', 'opzione') }, disab)}
              {bottoneScelta(form.stato === 'confermato', 'Confermato', function() { imposta('stato', 'confermato') }, disab)}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {form.stato === 'richiesta' ? 'La richiesta non occupa posti e non ha scadenza.' : ''}
              {form.stato === 'opzione' ? 'L\'opzione occupa i posti fino alla scadenza (e anche dopo, finche\' non la chiudi).' : ''}
              {form.stato === 'confermato' ? 'Confermato: di solito dopo la caparra.' : ''}
            </p>
            {form.stato === 'opzione' && (
              <div id="campo-scadenza" className="mt-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Scadenza dell'opzione</label>
                <input type="date" value={form.scadenza} disabled={disab} max={primaServizio || undefined}
                  onChange={function(e) { imposta('scadenza', e.target.value) }}
                  className={inputClasse} />
                {scadenzaIncoerente && (
                  <div className="mt-2 p-3 bg-red-50 border border-red-300 rounded-lg text-sm text-red-800">
                    {messaggioScadenza(scadForm, primaServizio)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
          <textarea value={form.note} disabled={disab} rows={3}
            onChange={function(e) { imposta('note', e.target.value) }}
            className={inputClasse} />
        </div>
      </div>

      {/* ===================== SERVIZI ===================== */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-gray-900">Servizi</h2>
        {!disab && (
          <button type="button" onClick={aggiungiServizio}
            className="px-3 py-1.5 border border-wine-300 rounded-lg text-sm text-wine-700 hover:bg-wine-50 font-medium">
            + Aggiungi servizio
          </button>
        )}
      </div>

      {form.servizi.map(function(s, idx) {
        var n = numeroServizio({
          effettivi_adulti: s.effettivi_adulti === '' ? null : parseInt(s.effettivi_adulti, 10),
          effettivi_bambini: s.effettivi_bambini === '' ? null : parseInt(s.effettivi_bambini, 10),
          definitivi_adulti: s.definitivi_adulti === '' ? null : parseInt(s.definitivi_adulti, 10),
          definitivi_bambini: s.definitivi_bambini === '' ? null : parseInt(s.definitivi_bambini, 10),
          ipotetici_adulti: s.ipotetici_adulti === '' ? null : parseInt(s.ipotetici_adulti, 10),
          ipotetici_bambini: s.ipotetici_bambini === '' ? null : parseInt(s.ipotetici_bambini, 10),
          ospiti_storici: s.ospiti_storici
        })
        var saleVisibili = sale.filter(function(x) { return x.attiva !== false || s.sale.indexOf(x.id) >= 0 })
        return (
          <div key={s.chiave} id={'servizio-' + s.chiave} className="mb-4 p-4 bg-white border border-gray-200 rounded-lg space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-gray-800">Servizio {idx + 1}</div>
              {!disab && form.servizi.length > 1 && (
                <button type="button" onClick={function() { togliServizio(s.chiave) }}
                  className="px-3 py-1 border border-red-300 rounded-lg text-sm text-red-700 hover:bg-red-50">
                  Togli
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nome del servizio (facoltativo)</label>
              <input type="text" value={s.nome} disabled={disab}
                onChange={function(e) { impostaServizio(s.chiave, 'nome', e.target.value) }}
                placeholder="es. Cena della sera prima, Light lunch, Aperitivo"
                className={inputClasse} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Data</label>
                <input type="date" value={s.data} disabled={disab}
                  onChange={function(e) { impostaServizio(s.chiave, 'data', e.target.value) }}
                  className={inputClasse} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Dalle (facoltativo)</label>
                <input type="time" value={s.ora_inizio} disabled={disab}
                  onChange={function(e) { impostaServizio(s.chiave, 'ora_inizio', e.target.value) }}
                  className={inputClasse} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Alle (facoltativo)</label>
                <input type="time" value={s.ora_fine} disabled={disab}
                  onChange={function(e) { impostaServizio(s.chiave, 'ora_fine', e.target.value) }}
                  className={inputClasse} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fascia</label>
              <div className="flex flex-wrap gap-2">
                {FASCE.map(function(fa) {
                  return (
                    <span key={fa.key}>
                      {bottoneScelta(s.fascia === fa.key, fa.label, function() { impostaServizio(s.chiave, 'fascia', fa.key) }, disab)}
                    </span>
                  )
                })}
              </div>
              {s.fascia === 'both' && (
                <p className="mt-1 text-xs text-gray-500">Giornata intera: conta sia a pranzo sia a cena.</p>
              )}
            </div>

            {/* I quattro numeri, adulti + bambini */}
            <div>
              <div className="grid grid-cols-3 gap-2 items-center text-xs font-medium text-gray-600 mb-1">
                <div>Ospiti</div>
                <div className="text-center">Adulti</div>
                <div className="text-center">Bambini</div>
              </div>
              {CAMPI_NUMERO.map(function(c) {
                return (
                  <div key={c.key} className="grid grid-cols-3 gap-2 items-center mb-1.5">
                    <div className="text-sm text-gray-700">{c.label}</div>
                    <input type="text" inputMode="numeric" value={s[c.key + '_adulti']} disabled={disab}
                      onChange={function(e) { impostaServizio(s.chiave, c.key + '_adulti', soloCifre(e.target.value)) }}
                      className={numClasse} />
                    <input type="text" inputMode="numeric" value={s[c.key + '_bambini']} disabled={disab}
                      onChange={function(e) { impostaServizio(s.chiave, c.key + '_bambini', soloCifre(e.target.value)) }}
                      className={numClasse} />
                  </div>
                )
              })}
              {s.ospiti_storici !== null && s.ospiti_storici !== undefined && (
                <div className="mt-1 text-xs text-gray-500">
                  Dall'archivio: {s.ospiti_storici} ospiti in totale, senza divisione fra adulti e bambini.
                </div>
              )}
              <div className="mt-2 text-sm">
                {n !== null ? (
                  <span className="text-gray-700">Ospiti contati: <span className="font-semibold">{n}</span> <span className="text-xs text-gray-500">(l'ultimo numero noto: effettivi, poi definitivi, poi ipotetici; il minimo garantito non conta)</span></span>
                ) : (
                  <span className="text-amber-700">Senza numero</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Coperti del turno</label>
                <div className="flex flex-wrap gap-2">
                  {bottoneScelta(s.occupa_coperti, 'Li occupa', function() { impostaServizio(s.chiave, 'occupa_coperti', true) }, disab)}
                  {bottoneScelta(!s.occupa_coperti, 'Non li occupa', function() { impostaServizio(s.chiave, 'occupa_coperti', false) }, disab)}
                </div>
              </div>
              <div>
                {/* Sessione 2 (14/11): «Esclusiva» diceva troppo poco. Da oggi
                    questa spunta chiede la firma su OGNI prenotazione del turno,
                    quindi vale solo per l'INTERA STRUTTURA. «Pergola in
                    esclusiva» NON e' questa spunta: l'esclusiva di un solo
                    spazio e' un cantiere a parte (per ora va nelle note). */}
                <label className="block text-xs font-medium text-gray-700 mb-1">Intera struttura in esclusiva</label>
                <div className="flex flex-wrap gap-2">
                  {bottoneScelta(!s.esclusiva, 'No', function() { impostaServizio(s.chiave, 'esclusiva', false) }, disab)}
                  {bottoneScelta(s.esclusiva, 'Sì — ristorante chiuso al pubblico', function() { impostaServizio(s.chiave, 'esclusiva', true) }, disab)}
                </div>
                {!s.esclusiva && (
                  <div className="text-xs text-gray-500 mt-1">Solo una sala (es. Pergola) in esclusiva? Lascia «No» e scrivilo nelle note: per gli spazi in esclusiva arriva una funzione dedicata.</div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Spazi</label>
              <div className="flex flex-wrap gap-2">
                {saleVisibili.map(function(x) {
                  var scelta = s.sale.indexOf(x.id) >= 0
                  return (
                    <button key={x.id} type="button" disabled={disab}
                      onClick={function() { toggleSala(s.chiave, x.id) }}
                      className={'px-3 py-1.5 rounded-full text-sm border ' +
                        (scelta ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50') +
                        (disab ? ' opacity-60' : '')}>
                      {scelta ? '✓ ' : ''}{x.nome}{x.solo_eventi ? ' · eventi' : ''}{x.attiva === false ? ' (spento)' : ''}
                    </button>
                  )
                })}
                {!disab && (
                  <button type="button" onClick={function() { setSpazioPer(s.chiave) }}
                    className="px-3 py-1.5 rounded-full text-sm border border-dashed border-wine-400 text-wine-700 hover:bg-wine-50">
                    + Nuovo spazio
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Note del servizio</label>
              <textarea value={s.note} disabled={disab} rows={2}
                onChange={function(e) { impostaServizio(s.chiave, 'note', e.target.value) }}
                className={inputClasse} />
            </div>
          </div>
        )
      })}

      {/* ===================== INFORMAZIONI ===================== */}
      {!nuovo && (
        <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 space-y-1">
          {evento.provenienza === 'event_dates' && <div>Arrivato dall'archivio eventi (event_dates).</div>}
          <div>Creato il {formatData(evento.created_at)}{evento.created_by && utenti[evento.created_by] ? ' da ' + utenti[evento.created_by] : ''}</div>
          {evento.updated_at && (
            <div>Ultima modifica il {formatData(evento.updated_at)}{evento.updated_by && utenti[evento.updated_by] ? ' da ' + utenti[evento.updated_by] : ''}</div>
          )}
        </div>
      )}

      {/* ===================== ELIMINA ===================== */}
      {!nuovo && puoModificare && (
        <div className="mb-4 p-4 bg-white border border-gray-200 rounded-lg">
          {haSoldi === true && (
            <div className="text-sm text-gray-700">
              Questo evento ha incassi collegati in cassa: <span className="font-medium">non si cancella, si puo' solo annullare</span>.
            </div>
          )}
          {haSoldi === false && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600">Inserito per errore? Senza soldi collegati si puo' cancellare.</div>
              <button type="button" onClick={function() { setHoCapito(false); setErroreModale(null); setModaleElimina(true) }}
                className="px-3 py-2 border border-red-300 rounded-lg text-sm text-red-700 hover:bg-red-50 flex-shrink-0">
                Elimina evento
              </button>
            </div>
          )}
          {haSoldi === null && (
            <div className="text-sm text-gray-500">Non sono riuscito a controllare i soldi collegati: la cancellazione non e' proposta.</div>
          )}
        </div>
      )}

      {/* ===================== BARRA SALVA ===================== */}
      {puoModificare && (
        <div className={'fixed bottom-0 left-0 right-0 lg:left-60 border-t-2 px-4 py-3 z-20 ' + (modificato ? 'bg-amber-100 border-amber-400' : 'bg-white border-gray-200')}>
          <div className="max-w-3xl mx-auto flex items-end justify-between gap-3">
            {problemiVivi.length > 0 ? (
              <div className="text-sm text-red-700 min-w-0 flex-1">
                <div className="font-semibold mb-1">
                  {problemiVivi.length === 1 ? 'Per salvare manca ancora una cosa:' : 'Per salvare mancano ancora ' + problemiVivi.length + ' cose:'}
                </div>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {problemiVivi.map(function(pr, i) {
                    return (
                      <button key={i} type="button" onClick={function() { vaiAlCampo(pr.dove) }}
                        className="block w-full text-left underline decoration-red-300 hover:text-red-900">
                        {'• ' + pr.testo}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (errore ? (
              <div className="text-sm text-red-700 font-semibold min-w-0 flex-1">{errore}</div>
            ) : (
              <div className={'text-sm ' + (scadenzaIncoerente ? 'text-red-700 font-semibold' : (modificato ? 'text-amber-900 font-semibold' : 'text-gray-500'))}>
                {scadenzaIncoerente
                  ? 'Scadenza dell\'opzione dopo il primo servizio: correggi prima di salvare'
                  : (modificato ? '⚠️ Modifiche non salvate' : (nuovo ? '' : 'Tutto salvato'))}
              </div>
            ))}
            <div className="flex gap-2">
              {!nuovo && modificato && (
                <button type="button" onClick={function() { togliBozza(chiaveBozza(id)); carica() }} disabled={salvando}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  Scarta
                </button>
              )}
              <button type="button" onClick={salva} disabled={salvando || (!nuovo && !modificato) || scadenzaIncoerente}
                className="bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-5 py-2 rounded-lg text-sm font-medium">
                {salvando ? 'Salvataggio...' : (nuovo ? 'Crea evento' : 'Salva')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODALE STATO ===================== */}
      {modaleStato && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{titoloModale[modaleStato]}</h2>
            </div>
            <div className="p-6 space-y-4">
              {erroreModale && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{erroreModale}</div>
              )}

              {modaleStato === 'riapri' && (
                <div>
                  <p className="text-sm text-gray-600 mb-2">
                    L'annullamento del {formatData(evento.annullato_il)} ("{evento.motivo_annullamento}") restera' scritto nelle note.
                  </p>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Riapri come</label>
                  <div className="flex flex-wrap gap-2">
                    {bottoneScelta(riapriStato === 'richiesta', 'Richiesta', function() { setRiapriStato('richiesta') }, false)}
                    {bottoneScelta(riapriStato === 'opzione', 'Opzione', function() { setRiapriStato('opzione') }, false)}
                    {bottoneScelta(riapriStato === 'confermato', 'Confermato', function() { setRiapriStato('confermato') }, false)}
                  </div>
                </div>
              )}

              {(modaleStato === 'opzione' || (modaleStato === 'riapri' && riapriStato === 'opzione')) && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Scadenza dell'opzione</label>
                  <input type="date" value={scadenzaInput}
                    onChange={function(e) { setScadenzaInput(e.target.value) }}
                    className={inputClasse} />
                  {modaleStato === 'opzione' && statoAttuale === 'opzione' && (
                    <p className="mt-1 text-xs text-gray-500">Una nuova data vale come proroga.</p>
                  )}
                </div>
              )}

              {modaleStato === 'annullato' && (
                <div>
                  <p className="text-sm text-gray-600 mb-2">
                    L'evento resta visibile (filtro Annullati), con il motivo; gli eventuali soldi restano collegati. Si potra' riaprire.
                  </p>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Motivo</label>
                  <textarea value={motivoInput} rows={3}
                    onChange={function(e) { setMotivoInput(e.target.value) }}
                    className={inputClasse} />
                </div>
              )}

              {modaleStato === 'confermato' && (
                <p className="text-sm text-gray-600">L'evento passa a confermato; l'eventuale scadenza dell'opzione si toglie.</p>
              )}
              {modaleStato === 'richiesta' && (
                <p className="text-sm text-gray-600">L'evento torna richiesta: smette di occupare posti e perde la scadenza.</p>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={function() { setModaleStato(null) }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  Indietro
                </button>
                <button type="button" onClick={confermaStato} disabled={lavoraModale}
                  className={'flex-1 text-white px-4 py-2 rounded-lg text-sm font-medium ' +
                    (modaleStato === 'annullato' ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-300' : 'bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300')}>
                  {lavoraModale ? 'Attendere...' : 'Conferma'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODALE ELIMINA ===================== */}
      {modaleElimina && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Elimina evento</h2>
            </div>
            <div className="p-6 space-y-4">
              {erroreModale && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{erroreModale}</div>
              )}
              <p className="text-sm text-gray-700">
                L'evento <span className="font-semibold">{evento.titolo}</span> e tutti i suoi servizi spariscono per sempre.
                Se l'evento e' solo saltato, usa invece "Annulla evento".
              </p>
              <button type="button" onClick={function() { setHoCapito(!hoCapito) }}
                className={'w-full text-left px-3 py-2 rounded-lg text-sm border ' +
                  (hoCapito ? 'bg-red-50 border-red-300 text-red-800' : 'bg-white border-gray-300 text-gray-700')}>
                {hoCapito ? '☑' : '☐'} Ho capito: e' stato inserito per errore
              </button>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={function() { setModaleElimina(false) }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  Indietro
                </button>
                <button type="button" onClick={elimina} disabled={!hoCapito || lavoraModale}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  {lavoraModale ? 'Attendere...' : 'Elimina'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== USCITA CON MODIFICHE NON SALVATE ===================== */}
      {uscitaVerso && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Modifiche non salvate</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700">
                Hai cambiato qualcosa in questa scheda e non l'hai salvato. Se esci adesso, le modifiche si perdono.
              </p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={function() { setUscitaVerso(null) }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  Resta qui
                </button>
                <button type="button"
                  onClick={function() {
                    var dove = uscitaVerso
                    togliBozza(chiaveBozza(id))
                    chiaveAttiva.current = null
                    modificatoRef.current = false
                    setUscitaVerso(null)
                    navigate(dove)
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  Esci senza salvare
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SpazioModal
        open={spazioPer !== null}
        spazio={null}
        onClose={function() { setSpazioPer(null) }}
        onSaved={function(nuovoId) {
          var chiave = spazioPer
          setSpazioPer(null)
          caricaElenchi().then(function() {
            if (nuovoId && chiave) toggleSala(chiave, nuovoId)
          })
        }}
      />
    </div>
  )
}
