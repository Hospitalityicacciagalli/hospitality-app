import { useState, useEffect, useRef } from 'react'
import { X, Search, Users, Trash2, Undo2, AlertTriangle, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import ConfermaPin from './ConfermaPin'
import StoricoCliente from './StoricoCliente'

// ============================================================
// FUSIONE ED ELIMINAZIONE DEI CLIENTI — migrazione 68 (25/11/2026)
// Disegno: 0.6 v76 sessione 2; decisioni di Florestano del 24-25/11.
//
// Un file solo, quattro pezzi (regola 31: una copia di ogni cosa):
//   * FusioneClienti (default) — finestra «Unisci»: N schede in una,
//     scelta della scheda che resta e dei valori campo per campo.
//   * EliminaCliente — finestra «Elimina»: scheda mai usata → si
//     cancella davvero; scheda usata → si sposta su un'altra.
//   * SchedeUnite — riquadro della scheda cliente con le fusioni fatte
//     in questa scheda e il pulsante «Annulla».
//   * chiamaFirmato — ogni scrittura passa da qui e presenta il gettone.
//
// LA REGOLA NON STA QUI: chi si sposta, gli scontri (stessa
// prenotazione, stesso allergene, stesso consenso), la lapide e
// l'annullamento li fa il database (clienti_fondi, cliente_elimina,
// fusione_annulla). Queste finestre mostrano, fanno scegliere e firmano.
//
// FIRMA (decisione 1 del 24/11): il database rifiuta SEMPRE senza
// gettone. Se la postazione è già elevata col PIN si usa quel gettone;
// altrimenti si apre la finestra PIN per QUESTA sola operazione (come
// la firma delle richieste degli eventi) e la postazione resta com'era.
//
// Nessun menù nativo: solo pulsanti tappabili (blocco dell'iPad).
// ============================================================

// I campi che si scelgono nella fusione: gli stessi che clienti_fondi
// accetta (la lista vive anche lì: se ne aggiungi uno, aggiungilo in
// tutti e due i posti).
var CAMPI = [
  { k: 'first_name', etichetta: 'Nome' },
  { k: 'last_name', etichetta: 'Cognome' },
  { k: 'phone', etichetta: 'Telefono' },
  { k: 'email', etichetta: 'Email' },
  { k: 'address', etichetta: 'Indirizzo' },
  { k: 'zip_code', etichetta: 'CAP' },
  { k: 'city', etichetta: 'Città' },
  { k: 'province', etichetta: 'Provincia' },
  { k: 'country', etichetta: 'Nazione' },
  { k: 'category', etichetta: 'Categoria' },
  { k: 'preferred_language', etichetta: 'Lingua' },
  { k: 'preferenza_posto', etichetta: 'Posto preferito' },
  { k: 'allergie_cliente', etichetta: 'Allergie (testo libero)', testo: ' · ' },
  { k: 'notes', etichetta: 'Note', testo: '\n' },
  { k: 'note_interne', etichetta: 'Note interne', testo: '\n' }
]

var UNISCI = '__unisci__'

var ETICHETTE_CATEGORIA = {
  standard: 'Standard', vip: 'VIP', press: 'Stampa', business: 'Business', hotel_guest: 'Ospite Hotel'
}

var ETICHETTE_ORIGINE = {
  manual: 'inserita a mano',
  hotel_in_cloud: 'da Hotel in Cloud',
  import_excel: 'import Excel',
  import: 'import',
  website: 'dal sito'
}

// Stesse parole del messaggio di cliente_elimina (migrazione 68).
var ETICHETTE_USI = {
  reservations: 'prenotazioni da intestatario',
  prenotazione_clienti: 'presenze nelle prenotazioni',
  eventi: 'eventi',
  hic_clienti_legame: 'collegamento a Hotel in Cloud',
  customers: 'schede unite in questa',
  customers_fusioni: 'fusioni in cui è rimasta',
  customers_fusioni_schede: 'verbali di fusione',
  customers_fusioni_legami: 'righe di verbali di fusione',
  customer_allergens: 'allergeni',
  gdpr_consents: 'consensi privacy',
  customers_non_fusioni: 'segnata come «persona diversa» da'
}

export function nomeScheda(c) {
  if (!c) return ''
  var s = ((c.last_name || '') + ' ' + (c.first_name || '')).trim()
  return s || '(senza nome)'
}

function dataBreve(iso) {
  if (!iso) return ''
  var d = new Date(iso)
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function valoreMostrato(campo, v) {
  if (campo === 'category') return ETICHETTE_CATEGORIA[v] || v
  return v
}

function pulito(v) {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

// ------------------------------------------------------------
// chiamaFirmato — chiama una funzione del database presentando il
// gettone. firmaSingola = il gettone viene da una firma per questa sola
// operazione: se il database lo rifiuta non si tocca l'elevazione.
// Restituisce { data, errore }.
// ------------------------------------------------------------
export function chiamaFirmato(auth, funzione, parametri, gettone, firmaSingola) {
  var p = { p_gettone: gettone }
  for (var k in parametri) { p[k] = parametri[k] }
  return supabase.rpc(funzione, p).then(function(res) {
    if (res.error) {
      var msg = res.error.message || 'Errore sconosciuto'
      if (msg.indexOf('Elevazione') === 0) {
        if (!firmaSingola && auth.terminaElevazione) auth.terminaElevazione(false)
        msg = msg + ' Ripeti l\'operazione: niente è stato cambiato.'
      }
      return { data: null, errore: msg }
    }
    return { data: res.data, errore: null }
  })
}

// La firma: gettone dell'elevazione se c'è, altrimenti PIN per questa
// sola operazione. Restituisce [chiediPin, conPin(azione), finestra].
function useFirma(auth, setErrore) {
  var [chiediPin, setChiediPin] = useState(false)
  var azioneRef = useRef(null)

  function conFirma(azione) {
    var g = auth.gettoneElevazione ? auth.gettoneElevazione() : null
    if (g) { azione(g, false); return }
    azioneRef.current = azione
    setChiediPin(true)
  }

  function onPin(info) {
    setChiediPin(false)
    var a = azioneRef.current
    azioneRef.current = null
    if (!info || !info.gettone) { setErrore('La firma col PIN non è arrivata: riprova.'); return }
    if (a) a(info.gettone, true)
  }

  function annulla() {
    azioneRef.current = null
    setChiediPin(false)
  }

  return { chiediPin: chiediPin, conFirma: conFirma, onPin: onPin, annulla: annulla }
}

// ------------------------------------------------------------
// SceltaScheda — cerca una scheda attiva (cognome, nome, telefono,
// email). props: escludi (array di id), onScegli(scheda), segnaposto
// ------------------------------------------------------------
function SceltaScheda(props) {
  var [testo, setTesto] = useState('')
  var [risultati, setRisultati] = useState([])
  var ultimaRef = useRef(0)

  function cerca(v) {
    setTesto(v)
    var t = v.trim().replace(/[,()]/g, ' ')
    if (t.length < 2) { setRisultati([]); return }
    var mia = ultimaRef.current + 1
    ultimaRef.current = mia
    supabase.from('customers')
      .select('*')
      .eq('is_active', true)
      .or('last_name.ilike.%' + t + '%,first_name.ilike.%' + t + '%,phone.ilike.%' + t + '%,email.ilike.%' + t + '%')
      .order('last_name')
      .limit(12)
      .then(function(res) {
        if (mia !== ultimaRef.current) return
        if (res.error) { setRisultati([]); return }
        var escl = props.escludi || []
        setRisultati((res.data || []).filter(function(c) { return escl.indexOf(c.id) === -1 }))
      })
  }

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          value={testo}
          onChange={function(e) { cerca(e.target.value) }}
          placeholder={props.segnaposto || 'Cerca per cognome, nome, telefono o email'}
          className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-wine-500"
        />
      </div>
      {risultati.length > 0 && (
        <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
          {risultati.map(function(c) {
            return (
              <button
                key={c.id}
                type="button"
                onClick={function() { props.onScegli(c); setTesto(''); setRisultati([]) }}
                className="w-full text-left px-3 py-2.5 hover:bg-wine-50 active:bg-wine-100"
              >
                <div className="font-medium text-gray-900">{nomeScheda(c)}</div>
                <div className="text-xs text-gray-500">
                  {[c.phone, c.email, ETICHETTE_ORIGINE[c.source] || c.source, 'creata il ' + dataBreve(c.created_at)].filter(Boolean).join(' · ')}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Riepilogo di chi usa una scheda, in parole.
function TestoUsi(props) {
  var righe = props.usi || []
  if (righe.length === 0) return <span className="text-gray-400">nessun uso</span>
  return (
    <span>
      {righe.map(function(u, i) {
        return (
          <span key={u.tabella + u.colonna}>
            {i > 0 ? ' · ' : ''}{(ETICHETTE_USI[u.tabella] || u.tabella) + ': ' + u.righe}
          </span>
        )
      })}
    </span>
  )
}

function caricaUsi(id) {
  return supabase.rpc('cliente_usi', { p_cliente: id }).then(function(res) {
    return res.error ? [] : (res.data || [])
  })
}

// ------------------------------------------------------------
// I valori proposti campo per campo.
//   opzioni = i valori diversi, non vuoti, delle schede (prima quello
//             della scheda che resta)
//   scelta  = quello della scheda che resta se c'è; se no il primo; per
//             i testi liberi con più valori: «unisci i testi»
// ------------------------------------------------------------
function opzioniCampo(campo, schede, superstiteId) {
  var ordinate = schede.slice().sort(function(a, b) {
    if (a.id === superstiteId) return -1
    if (b.id === superstiteId) return 1
    return 0
  })
  var visti = {}
  var out = []
  for (var i = 0; i < ordinate.length; i++) {
    var v = pulito(ordinate[i][campo.k])
    if (v === '') continue
    var chiave = campo.k === 'category' ? v : v.toLowerCase()
    if (visti[chiave]) continue
    visti[chiave] = true
    out.push({ valore: v, da: ordinate[i] })
  }
  return out
}

function sceltePredefinite(schede, superstiteId) {
  var scelte = {}
  for (var i = 0; i < CAMPI.length; i++) {
    var c = CAMPI[i]
    var op = opzioniCampo(c, schede, superstiteId)
    if (op.length === 0) continue
    if (op.length > 1 && c.testo) scelte[c.k] = UNISCI
    else scelte[c.k] = op[0].valore
  }
  return scelte
}

function valoreFinale(campo, scelta, opzioni) {
  if (scelta === UNISCI) {
    return opzioni.map(function(o) { return o.valore }).join(campo.testo)
  }
  return scelta
}

// ============================================================
// FusioneClienti — finestra «Unisci»
// props: open, scheda (la scheda da cui si parte), onClose,
//        onFatto(idSuperstite)
// ============================================================
export default function FusioneClienti(props) {
  var auth = useAuth()
  var [passo, setPasso] = useState('scegli')
  var [altre, setAltre] = useState([])
  var [candidati, setCandidati] = useState([])
  var [superstiteId, setSuperstiteId] = useState(null)
  var [scelte, setScelte] = useState({})
  var [usi, setUsi] = useState({})
  var [noFra, setNoFra] = useState([])
  var [nota, setNota] = useState('')
  var [storicoAperto, setStoricoAperto] = useState(null)
  var [errore, setErrore] = useState(null)
  var [salvando, setSalvando] = useState(false)
  var firma = useFirma(auth, setErrore)

  var scheda = props.scheda

  useEffect(function() {
    if (!props.open || !scheda) return
    setPasso('scegli')
    setAltre([])
    setSuperstiteId(scheda.id)
    setScelte({})
    setUsi({})
    setNoFra([])
    setNota('')
    setStoricoAperto(null)
    setErrore(null)
    setSalvando(false)
    setCandidati([])
    // Possibili doppioni: la stessa regola della finestra di creazione
    // (hic_candidati_cliente), qui con TUTTI i livelli, DEBOLE compreso.
    supabase.rpc('hic_candidati_cliente', {
      p_first_name: scheda.first_name || null,
      p_last_name: scheda.last_name || null,
      p_phone: scheda.phone || null,
      p_email: scheda.email || null,
      p_hic_customer_id: null,
      p_escludi_id: scheda.id
    }).then(function(res) {
      if (!res.error) setCandidati(res.data || [])
    })
  }, [props.open, scheda ? scheda.id : null])

  if (!props.open || !scheda) return null

  var schede = [scheda].concat(altre)
  var idsInGioco = schede.map(function(c) { return c.id })

  function aggiungi(c) {
    if (idsInGioco.indexOf(c.id) !== -1) return
    setAltre(function(prev) { return prev.concat([c]) })
  }

  function aggiungiCandidato(cand) {
    supabase.from('customers').select('*').eq('id', cand.customer_id).maybeSingle().then(function(res) {
      if (res.error || !res.data) { setErrore('Non trovo più quella scheda: ricarica la pagina.'); return }
      if (res.data.is_active === false) { setErrore('Quella scheda è disattivata o già unita a un\'altra.'); return }
      aggiungi(res.data)
    })
  }

  function togli(id) {
    setAltre(function(prev) { return prev.filter(function(c) { return c.id !== id }) })
  }

  function vaiAlConfronto() {
    setErrore(null)
    setScelte(sceltePredefinite(schede, superstiteId))
    var ids = idsInGioco
    // chi usa ogni scheda
    Promise.all(ids.map(function(id) { return caricaUsi(id) })).then(function(elenchi) {
      var m = {}
      for (var i = 0; i < ids.length; i++) m[ids[i]] = elenchi[i]
      setUsi(m)
    })
    // i «no» già registrati fra queste schede (decisione 5)
    supabase.from('customers_non_fusioni')
      .select('a_id, b_id, motivo, deciso_da_nome, deciso_il')
      .in('a_id', ids)
      .in('b_id', ids)
      .then(function(res) { setNoFra(res.error ? [] : (res.data || [])) })
    setPasso('confronta')
  }

  function scegliSuperstite(id) {
    setSuperstiteId(id)
    setScelte(sceltePredefinite(schede, id))
  }

  function campiDaInviare() {
    var sup = null
    for (var i = 0; i < schede.length; i++) if (schede[i].id === superstiteId) sup = schede[i]
    var out = {}
    for (var j = 0; j < CAMPI.length; j++) {
      var c = CAMPI[j]
      if (!(c.k in scelte)) continue
      var op = opzioniCampo(c, schede, superstiteId)
      var v = valoreFinale(c, scelte[c.k], op)
      if (pulito(v) !== pulito(sup[c.k])) out[c.k] = v
    }
    return out
  }

  function conferma() {
    setErrore(null)
    var assorbite = idsInGioco.filter(function(id) { return id !== superstiteId })
    if (assorbite.length === 0) { setErrore('Scegli almeno una scheda da unire.'); return }
    var campi = campiDaInviare()
    firma.conFirma(function(gettone, firmaSingola) {
      setSalvando(true)
      chiamaFirmato(auth, 'clienti_fondi', {
        p_superstite: superstiteId,
        p_assorbite: assorbite,
        p_campi: campi,
        p_modo: 'fusione',
        p_nota: nota.trim() || null
      }, gettone, firmaSingola).then(function(r) {
        setSalvando(false)
        if (r.errore) { setErrore(r.errore); return }
        if (props.onFatto) props.onFatto(superstiteId)
      })
    })
  }

  var superstite = null
  for (var s = 0; s < schede.length; s++) if (schede[s].id === superstiteId) superstite = schede[s]

  var candidatiVisibili = candidati.filter(function(c) { return idsInGioco.indexOf(c.customer_id) === -1 })

  function nomeDaId(id) {
    for (var i = 0; i < schede.length; i++) if (schede[i].id === id) return nomeScheda(schede[i])
    return id
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-2 sm:p-6">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-wine-700" />
            <h2 className="text-lg font-semibold text-gray-900">Unisci schede della stessa persona</h2>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {passo === 'scegli' && (
            <div className="space-y-5">
              <div>
                <div className="text-sm font-semibold text-gray-800 mb-2">Schede da unire</div>
                <div className="flex flex-wrap gap-2">
                  {schede.map(function(c) {
                    var questa = c.id === scheda.id
                    return (
                      <span key={c.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-wine-50 border border-wine-200 text-sm text-wine-900">
                        {nomeScheda(c)}
                        <span className="text-xs text-wine-700">{ETICHETTE_ORIGINE[c.source] || c.source}</span>
                        {!questa && (
                          <button type="button" onClick={function() { togli(c.id) }} className="p-0.5 rounded-full hover:bg-wine-100">
                            <X size={14} />
                          </button>
                        )}
                      </span>
                    )
                  })}
                </div>
              </div>

              {candidatiVisibili.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-gray-800 mb-2">Possibili doppioni trovati dal programma</div>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {candidatiVisibili.map(function(c) {
                      var classe = c.livello === 'DEBOLE'
                        ? 'text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600'
                        : 'text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800'
                      return (
                        <button
                          key={c.customer_id}
                          type="button"
                          onClick={function() { aggiungiCandidato(c) }}
                          className="w-full text-left px-3 py-2.5 hover:bg-wine-50 flex items-center gap-3"
                        >
                          <span className={classe}>{c.livello === 'DEBOLE' ? 'debole' : (c.livello === 'FORTE' ? 'forte' : 'certo')}</span>
                          <span className="flex-1 min-w-0">
                            <span className="font-medium text-gray-900">{nomeScheda(c)}</span>
                            <span className="block text-xs text-gray-500">{[c.motivo, c.phone, c.email].filter(Boolean).join(' · ')}</span>
                          </span>
                          <span className="text-sm text-wine-700 font-medium">Aggiungi</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="text-sm font-semibold text-gray-800 mb-2">Cerca un'altra scheda</div>
                <SceltaScheda escludi={idsInGioco} onScegli={aggiungi} />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button type="button" onClick={props.onClose} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={vaiAlConfronto}
                  disabled={altre.length === 0}
                  className="px-4 py-2.5 bg-wine-700 text-white rounded-lg text-sm font-medium hover:bg-wine-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confronta le {schede.length} schede
                </button>
              </div>
            </div>
          )}

          {passo === 'confronta' && (
            <div className="space-y-5">
              <div>
                <div className="text-sm font-semibold text-gray-800 mb-2">Quale scheda resta?</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {schede.map(function(c) {
                    var scelta = c.id === superstiteId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={function() { scegliSuperstite(c.id) }}
                        className={scelta
                          ? 'text-left p-3 rounded-lg border-2 border-wine-600 bg-wine-50'
                          : 'text-left p-3 rounded-lg border border-gray-200 hover:border-wine-300'}
                      >
                        <div className="flex items-center gap-2">
                          {scelta && <Check size={16} className="text-wine-700" />}
                          <span className="font-semibold text-gray-900">{nomeScheda(c)}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {(ETICHETTE_ORIGINE[c.source] || c.source) + ' · creata il ' + dataBreve(c.created_at)}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {usi[c.id] ? <TestoUsi usi={usi[c.id]} /> : 'lettura…'}
                        </div>
                        <div className="text-xs mt-2 font-medium">
                          {scelta ? <span className="text-wine-700">Resta questa</span> : <span className="text-gray-400">Diventa «unita»</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {noFra.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    <AlertTriangle size={16} /> Queste schede erano state segnate come persone diverse
                  </div>
                  {noFra.map(function(n) {
                    return (
                      <div key={n.a_id + n.b_id}>
                        {nomeDaId(n.a_id) + ' e ' + nomeDaId(n.b_id)}
                        {n.motivo ? (' — «' + n.motivo + '»') : ''}
                        {n.deciso_da_nome ? (' (' + n.deciso_da_nome + ', ' + dataBreve(n.deciso_il) + ')') : ''}
                      </div>
                    )
                  })}
                  <div className="mt-1">Unendole, quel «no» viene tolto (resta scritto nel verbale della fusione).</div>
                </div>
              )}

              <div>
                <div className="text-sm font-semibold text-gray-800 mb-2">I dati della scheda che resta</div>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {CAMPI.map(function(c) {
                    var op = opzioniCampo(c, schede, superstiteId)
                    if (op.length === 0) return null
                    var attuale = scelte[c.k]
                    if (op.length === 1) {
                      var daAltra = superstite && pulito(superstite[c.k]) === ''
                      return (
                        <div key={c.k} className="px-3 py-2 flex gap-3 text-sm">
                          <span className="w-36 flex-shrink-0 text-gray-500">{c.etichetta}</span>
                          <span className="flex-1 min-w-0 text-gray-900 whitespace-pre-wrap break-words">
                            {valoreMostrato(c.k, op[0].valore)}
                            {daAltra && <span className="text-xs text-wine-700">{'  (da ' + nomeScheda(op[0].da) + ')'}</span>}
                          </span>
                        </div>
                      )
                    }
                    return (
                      <div key={c.k} className="px-3 py-2 flex flex-col sm:flex-row gap-2 sm:gap-3 text-sm bg-amber-50/40">
                        <span className="w-36 flex-shrink-0 text-gray-700 font-medium pt-1.5">{c.etichetta}</span>
                        <div className="flex-1 min-w-0 flex flex-wrap gap-2">
                          {op.map(function(o) {
                            var sel = attuale === o.valore
                            return (
                              <button
                                key={o.valore}
                                type="button"
                                onClick={function() { setScelte(function(prev) { var n = Object.assign({}, prev); n[c.k] = o.valore; return n }) }}
                                className={sel
                                  ? 'text-left px-3 py-1.5 rounded-lg border-2 border-wine-600 bg-wine-50 text-gray-900 whitespace-pre-wrap break-words max-w-full'
                                  : 'text-left px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:border-wine-300 whitespace-pre-wrap break-words max-w-full'}
                              >
                                {valoreMostrato(c.k, o.valore)}
                              </button>
                            )
                          })}
                          {c.testo && (
                            <button
                              type="button"
                              onClick={function() { setScelte(function(prev) { var n = Object.assign({}, prev); n[c.k] = UNISCI; return n }) }}
                              className={attuale === UNISCI
                                ? 'px-3 py-1.5 rounded-lg border-2 border-wine-600 bg-wine-50 text-gray-900'
                                : 'px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:border-wine-300'}
                            >
                              Unisci i testi
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Prenotazioni (da intestatario e da collegato), eventi, allergeni, consensi privacy e collegamento a Hotel in Cloud
                  delle altre schede passano a quella che resta. Se due schede hanno lo stesso allergene vale il più grave e le note
                  si uniscono; se hanno lo stesso consenso vale la decisione più recente. Le altre schede diventano «unite» e
                  spariscono dalle ricerche. Si può annullare dal riquadro «Schede unite in questa».
                </p>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-800 mb-2">Storico delle schede</div>
                <div className="space-y-2">
                  {schede.map(function(c) {
                    var aperto = storicoAperto === c.id
                    return (
                      <div key={c.id} className="border border-gray-200 rounded-lg">
                        <button
                          type="button"
                          onClick={function() { setStoricoAperto(aperto ? null : c.id) }}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span>{nomeScheda(c)}</span>
                          {aperto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        {aperto && (
                          <div className="p-2 border-t border-gray-100">
                            <StoricoCliente clienteId={c.id} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-800 mb-1">Nota (facoltativa, resta nel verbale)</div>
                <input
                  type="text"
                  value={nota}
                  onChange={function(e) { setNota(e.target.value) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base"
                />
              </div>

              {errore && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{errore}</div>
              )}

              <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-gray-100">
                <button type="button" onClick={function() { setPasso('scegli'); setErrore(null) }} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                  Indietro
                </button>
                <button
                  type="button"
                  onClick={conferma}
                  disabled={salvando}
                  className="px-4 py-2.5 bg-wine-700 text-white rounded-lg text-sm font-medium hover:bg-wine-800 disabled:opacity-50"
                >
                  {salvando ? 'Unione in corso…' : ('Unisci in «' + nomeScheda(superstite) + '» (firma col PIN)')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfermaPin
        open={firma.chiediPin}
        title="Firma l'unione delle schede"
        message="Scegli il tuo nome e inserisci il PIN: l'unione si registra a tuo nome. La postazione resta com'era."
        onCancel={firma.annulla}
        onConfirmed={firma.onPin} />
    </div>
  )
}

// ============================================================
// EliminaCliente — finestra «Elimina»
// props: open, scheda, onClose, onFatto(esito, idDestinazione),
//        onApriFusione()
// ============================================================
export function EliminaCliente(props) {
  var auth = useAuth()
  var [usi, setUsi] = useState(null)
  var [destinazione, setDestinazione] = useState(null)
  var [errore, setErrore] = useState(null)
  var [salvando, setSalvando] = useState(false)
  var [sicuro, setSicuro] = useState(false)
  var firma = useFirma(auth, setErrore)
  var scheda = props.scheda

  useEffect(function() {
    if (!props.open || !scheda) return
    setUsi(null)
    setDestinazione(null)
    setErrore(null)
    setSalvando(false)
    setSicuro(false)
    caricaUsi(scheda.id).then(function(r) { setUsi(r) })
  }, [props.open, scheda ? scheda.id : null])

  if (!props.open || !scheda) return null

  var usiVeri = (usi || []).filter(function(u) { return u.conta_come_uso })
  var datiPersonali = (usi || []).filter(function(u) { return !u.conta_come_uso })
  var usata = usiVeri.length > 0
  var haHic = (usi || []).some(function(u) { return u.tabella === 'hic_clienti_legame' })

  function elimina() {
    setErrore(null)
    if (usata && !destinazione) { setErrore('Scegli la scheda su cui spostare quello che contiene.'); return }
    firma.conFirma(function(gettone, firmaSingola) {
      setSalvando(true)
      chiamaFirmato(auth, 'cliente_elimina', {
        p_id: scheda.id,
        p_destinazione: usata ? destinazione.id : null
      }, gettone, firmaSingola).then(function(r) {
        setSalvando(false)
        if (r.errore) { setErrore(r.errore); return }
        var esito = r.data && r.data.esito ? r.data.esito : 'eliminata'
        if (props.onFatto) props.onFatto(esito, usata ? destinazione.id : null)
      })
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-2 sm:p-6">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Trash2 size={20} className="text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900">{'Elimina «' + nomeScheda(scheda) + '»'}</h2>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm text-gray-700">
          {usi === null && <div className="text-gray-500">Controllo chi usa questa scheda…</div>}

          {usi !== null && haHic && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
                Questa scheda è collegata a un ospite di Hotel in Cloud: è una persona, non si elimina.
                Se è un doppione, uniscila alla scheda giusta.
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={props.onClose} className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50">Chiudi</button>
                {props.onApriFusione && (
                  <button type="button" onClick={props.onApriFusione} className="px-4 py-2.5 bg-wine-700 text-white rounded-lg font-medium hover:bg-wine-800">
                    Unisci a un'altra scheda
                  </button>
                )}
              </div>
            </div>
          )}

          {usi !== null && !haHic && !usata && (
            <div className="space-y-3">
              <p>
                Questa scheda <b>non è usata</b> da nessuna prenotazione, evento o verbale: viene <b>cancellata per sempre</b>,
                insieme ai suoi dati personali{datiPersonali.length > 0 ? ' (' : ''}
                {datiPersonali.length > 0 && <TestoUsi usi={datiPersonali} />}
                {datiPersonali.length > 0 ? ')' : ''}. Resta scritto solo chi l'ha eliminata e quando.
              </p>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={sicuro} onChange={function(e) { setSicuro(e.target.checked) }} className="w-4 h-4" />
                Ho capito: non si può annullare.
              </label>
            </div>
          )}

          {usi !== null && !haHic && usata && (
            <div className="space-y-3">
              <p>
                Questa scheda è usata (<TestoUsi usi={usiVeri} />). Non si cancella: prenotazioni ed eventi passano alla scheda
                che scegli qui sotto, e questa diventa «unita» e sparisce dalle ricerche.
              </p>
              <p className="text-gray-500">
                Allergeni e consensi privacy di questa scheda <b>non</b> passano: restano nascosti con lei. Si può annullare dal
                riquadro «Schede unite in questa» della scheda scelta.
              </p>
              {destinazione ? (
                <div className="flex items-center justify-between gap-2 p-3 rounded-lg border-2 border-wine-600 bg-wine-50">
                  <div>
                    <div className="font-semibold text-gray-900">{nomeScheda(destinazione)}</div>
                    <div className="text-xs text-gray-500">{[destinazione.phone, destinazione.email].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button type="button" onClick={function() { setDestinazione(null) }} className="text-sm text-wine-700 font-medium">Cambia</button>
                </div>
              ) : (
                <SceltaScheda escludi={[scheda.id]} onScegli={setDestinazione} segnaposto="Cerca la scheda su cui spostare prenotazioni ed eventi" />
              )}
            </div>
          )}

          {errore && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800">{errore}</div>}

          {usi !== null && !haHic && (
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={props.onClose} className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
              <button
                type="button"
                onClick={elimina}
                disabled={salvando || (usata ? !destinazione : !sicuro)}
                className="px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {salvando ? 'In corso…' : (usata ? 'Sposta ed elimina (firma col PIN)' : 'Elimina per sempre (firma col PIN)')}
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfermaPin
        open={firma.chiediPin}
        title="Firma l'eliminazione"
        message="Scegli il tuo nome e inserisci il PIN: l'eliminazione si registra a tuo nome. La postazione resta com'era."
        onCancel={firma.annulla}
        onConfirmed={firma.onPin} />
    </div>
  )
}

// ============================================================
// SchedeUnite — le fusioni in cui questa scheda è rimasta, con
// «Annulla». Non mostra niente se non ce ne sono.
// props: clienteId, onCambiato()
// ============================================================
export function SchedeUnite(props) {
  var auth = useAuth()
  var puoScrivere = auth.canEdit('clienti')
  var [fusioni, setFusioni] = useState([])
  var [schedePerFusione, setSchedePerFusione] = useState({})
  var [confermaId, setConfermaId] = useState(null)
  var [errore, setErrore] = useState(null)
  var [esito, setEsito] = useState(null)
  var [salvando, setSalvando] = useState(false)
  var firma = useFirma(auth, setErrore)

  useEffect(function() {
    carica()
  }, [props.clienteId])

  function carica() {
    var mio = props.clienteId
    supabase.from('customers_fusioni')
      .select('id, tipo, nota, fuso_da_nome, fuso_il, annullata_il, annullata_da_nome')
      .eq('sopravvissuto_id', mio)
      .order('fuso_il', { ascending: false })
      .then(function(res) {
        if (res.error || mio !== props.clienteId) return
        var f = res.data || []
        setFusioni(f)
        if (f.length === 0) { setSchedePerFusione({}); return }
        supabase.from('customers_fusioni_schede')
          .select('fusione_id, perdente_id, scheda_prima')
          .in('fusione_id', f.map(function(x) { return x.id }))
          .then(function(res2) {
            var m = {}
            var righe = res2.error ? [] : (res2.data || [])
            for (var i = 0; i < righe.length; i++) {
              if (!m[righe[i].fusione_id]) m[righe[i].fusione_id] = []
              m[righe[i].fusione_id].push(righe[i])
            }
            setSchedePerFusione(m)
          })
      })
  }

  function annulla(fusioneId) {
    setErrore(null)
    setEsito(null)
    firma.conFirma(function(gettone, firmaSingola) {
      setSalvando(true)
      chiamaFirmato(auth, 'fusione_annulla', { p_fusione: fusioneId }, gettone, firmaSingola).then(function(r) {
        setSalvando(false)
        setConfermaId(null)
        if (r.errore) { setErrore(r.errore); return }
        var d = r.data || {}
        setEsito('Fatto: ' + (d.riportate || 0) + ' righe riportate com\'erano' +
          (d.saltate ? (' · ' + d.saltate + ' non si potevano riportare perché cambiate nel frattempo') : '') + '.')
        carica()
        if (props.onCambiato) props.onCambiato()
      })
    })
  }

  if (fusioni.length === 0 && !esito) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users size={20} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">Schede unite in questa</h2>
      </div>

      {esito && <div className="mb-3 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">{esito}</div>}
      {errore && <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{errore}</div>}

      <div className="space-y-3">
        {fusioni.map(function(f) {
          var perse = schedePerFusione[f.id] || []
          var nomi = perse.map(function(p) {
            var sp = p.scheda_prima || {}
            return nomeScheda(sp) + (sp.source ? (' (' + (ETICHETTE_ORIGINE[sp.source] || sp.source) + ')') : '')
          }).join(', ')
          var annullata = !!f.annullata_il
          return (
            <div key={f.id} className={annullata ? 'p-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-500' : 'p-3 rounded-lg border border-gray-200'}>
              <div className="text-sm">
                <span className="font-medium">{dataBreve(f.fuso_il)}</span>
                {' · '}
                {f.tipo === 'spostamento' ? 'Eliminata spostando qui i suoi dati: ' : 'Unita a questa: '}
                <span className="font-medium">{nomi || '…'}</span>
                {f.fuso_da_nome ? (' · firmata da ' + f.fuso_da_nome) : ''}
              </div>
              {f.nota && <div className="text-xs text-gray-500 mt-1">{'Nota: ' + f.nota}</div>}
              {annullata && (
                <div className="text-xs mt-1">{'Annullata il ' + dataBreve(f.annullata_il) + (f.annullata_da_nome ? (' da ' + f.annullata_da_nome) : '')}</div>
              )}
              {!annullata && puoScrivere && (
                confermaId === f.id ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-gray-700">Le schede tornano separate, ognuna con quello che aveva. Le prenotazioni nate dopo restano qui.</span>
                    <button
                      type="button"
                      onClick={function() { annulla(f.id) }}
                      disabled={salvando}
                      className="px-3 py-1.5 bg-wine-700 text-white rounded-lg font-medium hover:bg-wine-800 disabled:opacity-50"
                    >
                      {salvando ? 'In corso…' : 'Sì, annulla (firma col PIN)'}
                    </button>
                    <button type="button" onClick={function() { setConfermaId(null) }} className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={function() { setConfermaId(f.id); setErrore(null); setEsito(null) }}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm text-wine-700 font-medium hover:underline"
                  >
                    <Undo2 size={14} /> {f.tipo === 'spostamento' ? 'Annulla l\'eliminazione' : 'Annulla la fusione'}
                  </button>
                )
              )}
            </div>
          )
        })}
      </div>

      <ConfermaPin
        open={firma.chiediPin}
        title="Firma l'annullamento"
        message="Scegli il tuo nome e inserisci il PIN: l'annullamento si registra a tuo nome. La postazione resta com'era."
        onCancel={firma.annulla}
        onConfirmed={firma.onPin} />
    </div>
  )
}
