import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ============================================================
// EventiPage — modulo Eventi, FASE 1 (sez. 0 v61-v67)
//
// Tre linguette:
//   Eventi     — elenco (da oggi in avanti; i passati a richiesta;
//                gli annullati solo col loro filtro)
//   Spazi      — la tabella sale: si aggiungono e si modificano solo
//                gli spazi "solo per eventi" (piscina, giardino...);
//                le sale del ristorante restano a Sale e Tavoli
//   Tipologie  — aggiungi, rinomina, spegni, elimina. Dal 12/11/2026
//                (migrazione 63) tipologie e spazi «solo per eventi» si
//                ELIMINANO: se qualche evento li usa, chi elimina sceglie
//                la sostituta (o nessuna) e il database sposta e cancella
//                in un'operazione sola (EliminaModal, qui sotto)
//
// LETTURA: direttamente dalle tabelle (regole di accesso col permesso
// 'eventi', migrazione 59).
// SCRITTURA: SOLO tramite le funzioni del database della migrazione 60,
// che ricevono il GETTONE di elevazione (regola 55) e controllano il
// permesso Eventi di CHI FIRMA. Le tabelle non accettano scritture
// dirette da nessuno.
//
// Questo file esporta anche gli strumenti usati da EventoScheda.jsx
// (una copia sola, regola 31): scritturaEventi, numeroServizio,
// tipologieSimili, normalizzaNome, oggiIso, formatData, STATI, FASCE,
// SpazioModal.
// ============================================================

// ------------------------------------------------------------
// STRUMENTI CONDIVISI
// ------------------------------------------------------------

export var STATI = {
  richiesta:  { label: 'Richiesta',  classe: 'bg-gray-100 text-gray-700' },
  opzione:    { label: 'Opzione',    classe: 'bg-amber-100 text-amber-800' },
  confermato: { label: 'Confermato', classe: 'bg-green-100 text-green-800' },
  annullato:  { label: 'Annullato',  classe: 'bg-red-100 text-red-700' }
}

export var FASCE = [
  { key: 'lunch',  label: 'Pranzo' },
  { key: 'dinner', label: 'Cena' },
  { key: 'both',   label: 'Giornata intera' }
]

export function etichettaFascia(f) {
  for (var i = 0; i < FASCE.length; i++) {
    if (FASCE[i].key === f) return FASCE[i].label
  }
  return f || ''
}

function pad(n) { return n < 10 ? '0' + n : '' + n }

// Data di oggi in ora locale, 'YYYY-MM-DD' (niente slittamento UTC).
export function oggiIso() {
  var d = new Date()
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

var GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

// 'YYYY-MM-DD' -> 'gg/mm/aaaa'; conGiorno: 'sab 14/03/2026'
export function formatData(iso, conGiorno) {
  if (!iso) return ''
  var p = String(iso).slice(0, 10).split('-')
  if (p.length !== 3) return String(iso)
  var testo = p[2] + '/' + p[1] + '/' + p[0]
  if (conGiorno) {
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10))
    testo = GIORNI[d.getDay()] + ' ' + testo
  }
  return testo
}

// Il numero di ospiti di un servizio: l'ULTIMO NOTO, con la stessa
// regola della funzione coperti_eventi del database (migrazione 60):
// effettivi -> definitivi -> ipotetici -> ospiti storici; adulti +
// bambini; il minimo garantito NON e' una presenza. null = senza numero.
// ⚠️ La copia che conta e' quella del database: questa serve solo a
// mostrare il numero nella pagina. Se cambia la regola la', va cambiata qui.
export function numeroServizio(s) {
  function coppia(a, b) {
    var vuotoA = a === null || a === undefined
    var vuotoB = b === null || b === undefined
    if (vuotoA && vuotoB) return null
    return (a || 0) + (b || 0)
  }
  var n = coppia(s.effettivi_adulti, s.effettivi_bambini)
  if (n === null) n = coppia(s.definitivi_adulti, s.definitivi_bambini)
  if (n === null) n = coppia(s.ipotetici_adulti, s.ipotetici_bambini)
  if (n === null && s.ospiti_storici !== null && s.ospiti_storici !== undefined) n = s.ospiti_storici
  if (n === 0) return null
  return n
}

// Nome confrontabile: minuscole, senza accenti, solo lettere e cifre.
export function normalizzaNome(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function distanza(a, b) {
  var m = a.length
  var n = b.length
  var prec = []
  var i, j
  for (j = 0; j <= n; j++) prec.push(j)
  for (i = 1; i <= m; i++) {
    var cor = [i]
    for (j = 1; j <= n; j++) {
      var costo = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1
      cor.push(Math.min(prec[j] + 1, cor[j - 1] + 1, prec[j - 1] + costo))
    }
    prec = cor
  }
  return prec[n]
}

// Tipologie che ASSOMIGLIANO al nome scritto (non quelle identiche):
// maiuscole e accenti non contano; una lettera di differenza fino a 6
// lettere, due oltre; oppure una comincia con l'altra (da 4 lettere).
// E' un avviso, mai un blocco (0.4 v61, punto 0.9.3).
export function tipologieSimili(nome, elenco, escludiId) {
  var a = normalizzaNome(nome)
  var out = []
  if (a.length < 3) return out
  for (var i = 0; i < elenco.length; i++) {
    var t = elenco[i]
    if (escludiId && t.id === escludiId) continue
    var b = normalizzaNome(t.nome)
    if (!b || b === a) continue
    var soglia = Math.max(a.length, b.length) <= 6 ? 1 : 2
    var simile = distanza(a, b) <= soglia
    if (!simile && a.length >= 4 && b.length >= 4) {
      simile = a.indexOf(b) === 0 || b.indexOf(a) === 0
    }
    if (simile) out.push(t)
  }
  return out
}

// Tipologia con lo STESSO nome (maiuscole/accenti/spazi a parte).
export function tipologiaUguale(nome, elenco) {
  var a = normalizzaNome(nome)
  if (!a) return null
  for (var i = 0; i < elenco.length; i++) {
    if (normalizzaNome(elenco[i].nome) === a) return elenco[i]
  }
  return null
}

// Chiama una funzione di scrittura degli Eventi presentando il gettone.
// Ogni scrittura passa da qui: una copia sola del modo di firmare.
//   auth      = useAuth()
//   funzione  = nome della funzione SQL (evento_salva, ...)
//   parametri = gli altri parametri (p_gettone lo aggiunge questa)
// Restituisce { data, errore } con errore gia' in italiano per la pagina.
// Se il database dice che l'elevazione non vale piu', la si spegne
// anche qui: la pagina non deve continuare a mostrare poteri che il
// database non riconosce.
export function scritturaEventi(auth, funzione, parametri) {
  var p = { p_gettone: auth.gettoneElevazione() }
  for (var k in parametri) { p[k] = parametri[k] }
  return supabase.rpc(funzione, p).then(function(res) {
    if (res.error) {
      var msg = res.error.message || 'Errore sconosciuto'
      if (msg.indexOf('Elevazione') === 0) {
        auth.terminaElevazione(false)
        msg = msg + ' Inserisci di nuovo il PIN e ripeti l\'operazione: niente e\' stato salvato.'
      }
      return { data: null, errore: msg }
    }
    return { data: res.data, errore: null }
  })
}

// ------------------------------------------------------------
// SpazioModal — nuovo spazio / modifica di uno spazio "solo eventi".
// Usata qui (linguetta Spazi) e in EventoScheda ("Nuovo spazio").
// props: open, spazio (null = nuovo), onClose, onSaved(id)
// ------------------------------------------------------------
export function SpazioModal(props) {
  var auth = useAuth()
  var [nome, setNome] = useState('')
  var [soloEventi, setSoloEventi] = useState(true)
  var [attiva, setAttiva] = useState(true)
  var [errore, setErrore] = useState(null)
  var [salvando, setSalvando] = useState(false)

  useEffect(function() {
    if (props.open) {
      setNome(props.spazio ? props.spazio.nome : '')
      setSoloEventi(props.spazio ? props.spazio.solo_eventi === true : true)
      setAttiva(props.spazio ? props.spazio.attiva !== false : true)
      setErrore(null)
      setSalvando(false)
    }
  }, [props.open])

  if (!props.open) return null

  var nuovo = !props.spazio
  var passaAlRistorante = !nuovo && props.spazio.solo_eventi === true && !soloEventi

  function salva() {
    if (!nome.trim()) {
      setErrore('Scrivi il nome dello spazio.')
      return
    }
    setSalvando(true)
    setErrore(null)
    scritturaEventi(auth, 'spazio_salva', {
      p_id: nuovo ? null : props.spazio.id,
      p_nome: nome.trim(),
      p_solo_eventi: soloEventi,
      p_attiva: attiva,
      p_ordine: null
    }).then(function(r) {
      setSalvando(false)
      if (r.errore) { setErrore(r.errore); return }
      if (props.onSaved) props.onSaved(r.data)
    })
  }

  function scelta(attivo, testo, onClick) {
    return (
      <button type="button" onClick={onClick}
        className={'flex-1 px-3 py-2 rounded-lg text-sm font-medium border ' +
          (attivo ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}>
        {testo}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{nuovo ? 'Nuovo spazio' : 'Modifica spazio'}</h2>
        </div>
        <div className="p-6 space-y-4">
          {errore && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{errore}</div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nome</label>
            <input type="text" value={nome} onChange={function(e) { setNome(e.target.value) }}
              placeholder="es. Piscina, Giardino, Biolago"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Uso</label>
            <div className="flex gap-2">
              {scelta(soloEventi, 'Solo per eventi', function() { setSoloEventi(true) })}
              {scelta(!soloEventi, 'Anche ristorante', function() { setSoloEventi(false) })}
            </div>
            {passaAlRistorante && (
              <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                Lo spazio passa al ristorante: da quel momento non si modifica piu' da Eventi, ma da Sale e Tavoli.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Stato</label>
            <div className="flex gap-2">
              {scelta(attiva, 'Attivo', function() { setAttiva(true) })}
              {scelta(!attiva, 'Spento', function() { setAttiva(false) })}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={function() { if (props.onClose) props.onClose() }}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              Annulla
            </button>
            <button type="button" onClick={salva} disabled={salvando}
              className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {salvando ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// TipologiaModal — nuova tipologia o rinomina (solo in questa pagina).
// props: open, tipologia (null = nuova), elenco, onClose, onSaved
// ------------------------------------------------------------
function TipologiaModal(props) {
  var auth = useAuth()
  var [nome, setNome] = useState('')
  var [errore, setErrore] = useState(null)
  var [salvando, setSalvando] = useState(false)

  useEffect(function() {
    if (props.open) {
      setNome(props.tipologia ? props.tipologia.nome : '')
      setErrore(null)
      setSalvando(false)
    }
  }, [props.open])

  if (!props.open) return null

  var escludi = props.tipologia ? props.tipologia.id : null
  var simili = tipologieSimili(nome, props.elenco, escludi)
  var uguale = tipologiaUguale(nome, props.elenco)
  if (uguale && escludi && uguale.id === escludi) uguale = null

  function salva() {
    if (!nome.trim()) { setErrore('Scrivi il nome della tipologia.'); return }
    if (uguale) { setErrore('Esiste gia\' la tipologia "' + uguale.nome + '".'); return }
    // L'avviso «Assomiglia a» si vede gia' mentre scrivi, e il pulsante
    // dice gia' «Salva comunque»: premerlo e' la conferma (verbale
    // Eventi fase 1, passo 12).
    setSalvando(true)
    setErrore(null)
    scritturaEventi(auth, 'tipologia_salva', {
      p_id: props.tipologia ? props.tipologia.id : null,
      p_nome: nome.trim(),
      p_attiva: props.tipologia ? props.tipologia.attiva : true,
      p_ordine: null
    }).then(function(r) {
      setSalvando(false)
      if (r.errore) { setErrore(r.errore); return }
      if (props.onSaved) props.onSaved(r.data)
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{props.tipologia ? 'Rinomina tipologia' : 'Nuova tipologia'}</h2>
        </div>
        <div className="p-6 space-y-4">
          {errore && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{errore}</div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nome</label>
            <input type="text" value={nome}
              onChange={function(e) { setNome(e.target.value) }}
              placeholder="es. Matrimonio, Battesimo, Aziendale"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>
          {simili.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
              Assomiglia a: <span className="font-semibold">{simili.map(function(t) { return t.nome }).join(', ')}</span>.
              {' Se e\' davvero una tipologia diversa, premi «Salva comunque».'}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={function() { if (props.onClose) props.onClose() }}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              Annulla
            </button>
            <button type="button" onClick={salva} disabled={salvando}
              className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {salvando ? 'Salvataggio...' : (simili.length > 0 ? 'Salva comunque' : 'Salva')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// LA PAGINA
// ------------------------------------------------------------
var FILTRI = [
  { key: 'attivi',     label: 'Tutti' },
  { key: 'richiesta',  label: 'Richieste' },
  { key: 'opzione',    label: 'Opzioni' },
  { key: 'confermato', label: 'Confermati' },
  { key: 'annullato',  label: 'Annullati' }
]

// Riassunto di un evento per l'elenco: prima e ultima data, numero di
// servizi, ospiti SERVIZIO PER SERVIZIO, servizi senza numero.
//
// Gli ospiti non si sommano (decisione di Florestano, verbale Eventi
// fase 1, passo 21): in un evento di piu' giorni sono quasi sempre le
// stesse persone, e un totale le conterebbe due volte. Si mostrano in
// ordine di data: «30 + 25 ospiti». Un servizio solo: «30 ospiti».
function riassunto(ev) {
  var servizi = (ev.eventi_servizi || []).slice()
  servizi.sort(function(a, b) {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1
    return (a.ordine || 0) - (b.ordine || 0)
  })
  var prima = null
  var ultima = null
  var numeri = []
  var senzaNumero = 0
  for (var i = 0; i < servizi.length; i++) {
    var s = servizi[i]
    if (!prima || s.data < prima) prima = s.data
    if (!ultima || s.data > ultima) ultima = s.data
    var n = numeroServizio(s)
    if (n === null) senzaNumero++
    else numeri.push(n)
  }
  var ospiti = numeri.length > 0 ? numeri.join(' + ') + ' ospiti' : ''
  return { prima: prima, ultima: ultima, nServizi: servizi.length, ospiti: ospiti, senzaNumero: senzaNumero }
}

// ------------------------------------------------------------
// EliminaModal — elimina una tipologia o uno spazio «solo per eventi»
// (migrazione 63, verbale prova veloce del 12/11 passi 5-6).
// Mostra gli eventi che lo usano e chiede con che cosa sostituirlo
// (oppure «nessuna»/«nessuno»). Il database sposta e cancella in
// un'operazione sola: o riesce tutto o non cambia niente.
// props: open, tipo ('tipologia' | 'spazio'), oggetto ({ id, nome }),
//        alternative (elenco da cui scegliere la sostituta),
//        onClose, onDone(testoEsito)
// ------------------------------------------------------------
function EliminaModal(props) {
  var auth = useAuth()
  var [usi, setUsi] = useState(null)
  var [erroreUsi, setErroreUsi] = useState(null)
  var [sostituta, setSostituta] = useState(null)
  var [errore, setErrore] = useState(null)
  var [lavora, setLavora] = useState(false)

  var tipologia = props.tipo === 'tipologia'
  var idOggetto = props.oggetto ? props.oggetto.id : null

  useEffect(function() {
    if (!props.open || !idOggetto) return
    setUsi(null)
    setErroreUsi(null)
    setSostituta(null)
    setErrore(null)
    setLavora(false)
    var q
    if (tipologia) {
      q = supabase.from('eventi')
        .select('id, titolo, stato, eventi_servizi(data)')
        .eq('tipologia_id', idOggetto)
    } else {
      q = supabase.from('eventi_servizi_sale')
        .select('servizio_id, eventi_servizi(id, data, evento_id, eventi(id, titolo, stato))')
        .eq('sala_id', idOggetto)
    }
    q.then(function(res) {
      if (res.error) { setErroreUsi('Non riesco a leggere gli eventi che lo usano: ' + res.error.message); return }
      setUsi(raggruppaUsi(res.data || [], tipologia))
    })
  }, [props.open, idOggetto])

  if (!props.open || !props.oggetto) return null

  var alternative = (props.alternative || []).filter(function(x) { return x.id !== idOggetto })
  var nome = props.oggetto.nome
  var nessuno = tipologia ? 'Nessuna' : 'Nessuno'

  function conferma() {
    setLavora(true)
    setErrore(null)
    var funzione = tipologia ? 'tipologia_elimina' : 'spazio_elimina'
    var parametri = tipologia
      ? { p_id: idOggetto, p_sostituta: sostituta }
      : { p_id: idOggetto, p_sostituto: sostituta }
    scritturaEventi(auth, funzione, parametri).then(function(r) {
      setLavora(false)
      if (r.errore) { setErrore(r.errore); return }
      var testo = (tipologia ? 'Tipologia' : 'Spazio') + ' "' + nome + '" ' + (tipologia ? 'eliminata.' : 'eliminato.')
      var n = r.data || 0
      if (n > 0) {
        var nomeSost = ''
        for (var i = 0; i < alternative.length; i++) {
          if (alternative[i].id === sostituta) nomeSost = alternative[i].nome
        }
        var cosa = tipologia ? (n === 1 ? '1 evento' : n + ' eventi') : (n === 1 ? '1 servizio' : n + ' servizi')
        testo = testo + ' ' + cosa + (nomeSost ? ' ora con "' + nomeSost + '".' : (tipologia ? ' ora senza tipologia.' : ' senza questo spazio.'))
      }
      if (props.onDone) props.onDone(testo)
    })
  }

  var inUso = usi && usi.length > 0

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{tipologia ? 'Elimina la tipologia' : 'Elimina lo spazio'} «{nome}»</h2>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          {errore && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{errore}</div>
          )}
          {erroreUsi && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{erroreUsi}</div>
          )}
          {!usi && !erroreUsi && (
            <div className="text-sm text-gray-400">Controllo gli eventi che {tipologia ? 'la' : 'lo'} usano...</div>
          )}
          {usi && !inUso && (
            <div className="text-sm text-gray-700">
              Nessun evento {tipologia ? 'la' : 'lo'} usa. Eliminando, sparisce dall'elenco per sempre.
            </div>
          )}
          {inUso && (
            <div>
              <div className="text-sm text-gray-700 mb-2">
                {tipologia ? 'La usano' : 'Lo usano'} <span className="font-semibold">{usi.length === 1 ? '1 evento' : usi.length + ' eventi'}</span>:
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                {usi.map(function(u) {
                  var st = STATI[u.stato] || STATI.richiesta
                  return (
                    <div key={u.id} className="px-3 py-2 border-b border-gray-100 last:border-0 flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{u.titolo}</div>
                        <div className="text-xs text-gray-500">{u.prima ? formatData(u.prima, true) : 'senza data'}</div>
                      </div>
                      <span className={'inline-block px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ' + st.classe}>{st.label}</span>
                    </div>
                  )
                })}
              </div>
              <div className="text-sm text-gray-700 mb-2">
                {tipologia ? 'Su questi eventi metti al suo posto:' : 'Sui loro servizi metti al suo posto:'}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={function() { setSostituta(null) }}
                  className={'px-3 py-1.5 rounded-lg text-sm border ' + (sostituta === null ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}>
                  {nessuno}
                </button>
                {alternative.map(function(a) {
                  var scelto = sostituta === a.id
                  return (
                    <button key={a.id} type="button" onClick={function() { setSostituta(a.id) }}
                      className={'px-3 py-1.5 rounded-lg text-sm border ' + (scelto ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50') + (a.attiva === false ? ' opacity-60' : '')}>
                      {a.nome}{a.attiva === false ? ' (spent' + (tipologia ? 'a' : 'o') + ')' : ''}
                    </button>
                  )
                })}
              </div>
              {sostituta === null && (
                <div className="mt-2 text-xs text-amber-800">
                  {tipologia ? 'Questi eventi resteranno senza tipologia.' : 'Questi servizi perderanno solo questo spazio (gli altri spazi restano).'}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button type="button" onClick={props.onClose} disabled={lavora}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Annulla
          </button>
          <button type="button" onClick={conferma} disabled={lavora || !usi}
            className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {lavora ? 'Elimino...' : 'Elimina'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Dalle righe lette (eventi per una tipologia, legami servizio-spazio
// per uno spazio) un evento per riga, con la data del primo servizio.
function raggruppaUsi(righe, tipologia) {
  var mappa = {}
  var elenco = []
  function aggiungi(ev, data) {
    if (!ev) return
    var u = mappa[ev.id]
    if (!u) {
      u = { id: ev.id, titolo: ev.titolo, stato: ev.stato, prima: null }
      mappa[ev.id] = u
      elenco.push(u)
    }
    if (data && (!u.prima || data < u.prima)) u.prima = data
  }
  for (var i = 0; i < righe.length; i++) {
    var r = righe[i]
    if (tipologia) {
      var serv = r.eventi_servizi || []
      if (serv.length === 0) aggiungi(r, null)
      for (var j = 0; j < serv.length; j++) aggiungi(r, serv[j].data)
    } else {
      var s = r.eventi_servizi
      if (s && s.eventi) aggiungi(s.eventi, s.data)
    }
  }
  elenco.sort(function(a, b) { return (a.prima || '') < (b.prima || '') ? -1 : ((a.prima || '') > (b.prima || '') ? 1 : 0) })
  return elenco
}

export default function EventiPage() {
  var auth = useAuth()
  var navigate = useNavigate()
  var puoModificare = auth.canEdit('eventi')

  var [tab, setTab] = useState('eventi')
  var [eventi, setEventi] = useState([])
  var [tipologie, setTipologie] = useState([])
  var [sale, setSale] = useState([])
  var [loading, setLoading] = useState(true)
  var [errore, setErrore] = useState(null)
  var [filtro, setFiltro] = useState('attivi')
  var [mostraPassati, setMostraPassati] = useState(false)

  var [spazioModal, setSpazioModal] = useState({ open: false, spazio: null })
  var [tipologiaModal, setTipologiaModal] = useState({ open: false, tipologia: null })
  var [eliminaModal, setEliminaModal] = useState({ open: false, tipo: null, oggetto: null })
  var [erroreRiga, setErroreRiga] = useState(null)
  var [messaggioRiga, setMessaggioRiga] = useState(null)

  useEffect(function() { carica() }, [])

  // Gli eventi sono poche centinaia: si leggono tutti e si filtrano qui.
  // ⚠️ Supabase taglia in silenzio a 1.000 righe (17.9): quando gli eventi
  // supereranno qualche centinaio, il filtro "da oggi" va spostato nella
  // query.
  function carica() {
    setLoading(true)
    setErrore(null)
    Promise.all([
      supabase.from('eventi')
        .select('id, titolo, stato, scadenza_opzione, tipologia_id, cliente_id, provenienza, annullato_il, motivo_annullamento, customers(first_name, last_name), eventi_servizi(id, data, fascia, nome, ordine, ipotetici_adulti, ipotetici_bambini, definitivi_adulti, definitivi_bambini, effettivi_adulti, effettivi_bambini, ospiti_storici)')
        .order('created_at', { ascending: true }),
      supabase.from('eventi_tipologie').select('id, nome, attiva, ordine').order('ordine', { ascending: true }),
      supabase.from('sale').select('id, nome, ordine, attiva, solo_eventi').order('ordine', { ascending: true })
    ]).then(function(res) {
      setLoading(false)
      for (var i = 0; i < res.length; i++) {
        if (res[i].error) {
          setErrore('Errore nel caricamento: ' + res[i].error.message)
          return
        }
      }
      setEventi(res[0].data || [])
      setTipologie(res[1].data || [])
      setSale(res[2].data || [])
    })
  }

  var oggi = oggiIso()

  function nomeTipologia(id) {
    for (var i = 0; i < tipologie.length; i++) {
      if (tipologie[i].id === id) return tipologie[i].nome
    }
    return ''
  }

  function opzioneScaduta(ev) {
    return ev.stato === 'opzione' && ev.scadenza_opzione && ev.scadenza_opzione < oggi
  }

  // --- Elenco eventi -----------------------------------------
  var righe = []
  var nScadute = 0
  for (var i = 0; i < eventi.length; i++) {
    var ev = eventi[i]
    if (opzioneScaduta(ev)) nScadute++
    var ok
    if (filtro === 'attivi') ok = ev.stato !== 'annullato'
    else ok = ev.stato === filtro
    if (!ok) continue
    righe.push({ ev: ev, r: riassunto(ev) })
  }
  var futuri = []
  var passati = []
  for (var j = 0; j < righe.length; j++) {
    if (righe[j].r.ultima && righe[j].r.ultima >= oggi) futuri.push(righe[j])
    else passati.push(righe[j])
  }
  futuri.sort(function(a, b) { return (a.r.prima || '') < (b.r.prima || '') ? -1 : ((a.r.prima || '') > (b.r.prima || '') ? 1 : 0) })
  passati.sort(function(a, b) { return (a.r.ultima || '') > (b.r.ultima || '') ? -1 : ((a.r.ultima || '') < (b.r.ultima || '') ? 1 : 0) })

  function rigaEvento(x) {
    var ev = x.ev
    var r = x.r
    var st = STATI[ev.stato] || STATI.richiesta
    var scaduta = opzioneScaduta(ev)
    var cliente = ev.customers ? (ev.customers.last_name + ' ' + ev.customers.first_name) : ''
    var date = r.prima === r.ultima ? formatData(r.prima, true) : formatData(r.prima, true) + ' → ' + formatData(r.ultima, true)
    return (
      <button key={ev.id} type="button" onClick={function() { navigate('/eventi/' + ev.id) }}
        className="w-full text-left px-4 py-3 bg-white hover:bg-gray-50 border-b border-gray-100 last:border-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium text-gray-900 truncate">{ev.titolo}</div>
            <div className="text-sm text-gray-600">{date}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {nomeTipologia(ev.tipologia_id)}
              {nomeTipologia(ev.tipologia_id) && cliente ? ' · ' : ''}
              {cliente}
              {ev.provenienza === 'event_dates' ? ((nomeTipologia(ev.tipologia_id) || cliente) ? ' · ' : '') + 'archivio' : ''}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            {scaduta ? (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-600 text-white">Opzione scaduta</span>
            ) : (
              <span className={'inline-block px-2 py-0.5 rounded-full text-xs font-medium ' + st.classe}>{st.label}</span>
            )}
            {ev.stato === 'opzione' && ev.scadenza_opzione && (
              <div className="text-xs text-gray-500 mt-1">scade {formatData(ev.scadenza_opzione)}</div>
            )}
            <div className="text-xs text-gray-500 mt-1">
              {r.nServizi === 1 ? '1 servizio' : r.nServizi + ' servizi'}
              {r.ospiti ? ' · ' + r.ospiti : ''}
            </div>
            {r.senzaNumero > 0 && (
              <div className="text-xs text-amber-700">{r.senzaNumero === 1 ? '1 senza numero' : r.senzaNumero + ' senza numero'}</div>
            )}
          </div>
        </div>
      </button>
    )
  }

  // --- Tipologie: spegni / accendi -----------------------------
  function cambiaAttivaTipologia(t) {
    setErroreRiga(null)
    scritturaEventi(auth, 'tipologia_salva', {
      p_id: t.id, p_nome: t.nome, p_attiva: !t.attiva, p_ordine: null
    }).then(function(r) {
      if (r.errore) { setErroreRiga(r.errore); return }
      carica()
    })
  }

  function linguetta(key, label) {
    var attiva = tab === key
    return (
      <button type="button" onClick={function() { setTab(key); setErroreRiga(null); setMessaggioRiga(null) }}
        className={'px-4 py-2 text-sm font-medium border-b-2 ' +
          (attiva ? 'border-wine-700 text-wine-800' : 'border-transparent text-gray-500 hover:text-gray-800')}>
        {label}
      </button>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Eventi</h1>
        {tab === 'eventi' && puoModificare && (
          <button type="button" onClick={function() { navigate('/eventi/nuovo') }}
            className="bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium">
            + Nuovo evento
          </button>
        )}
        {tab === 'spazi' && puoModificare && (
          <button type="button" onClick={function() { setSpazioModal({ open: true, spazio: null }) }}
            className="bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium">
            + Nuovo spazio
          </button>
        )}
        {tab === 'tipologie' && puoModificare && (
          <button type="button" onClick={function() { setTipologiaModal({ open: true, tipologia: null }) }}
            className="bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium">
            + Nuova tipologia
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {linguetta('eventi', 'Eventi')}
        {linguetta('spazi', 'Spazi')}
        {linguetta('tipologie', 'Tipologie')}
      </div>

      {errore && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{errore}</div>
      )}
      {erroreRiga && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{erroreRiga}</div>
      )}
      {messaggioRiga && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">{messaggioRiga}</div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Caricamento...</div>
      ) : (
        <div>

          {/* ================= LINGUETTA EVENTI ================= */}
          {tab === 'eventi' && (
            <div>
              {nScadute > 0 && (
                <button type="button" onClick={function() { setFiltro('opzione'); setMostraPassati(true) }}
                  className="w-full text-left mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                  <span className="font-semibold">{nScadute === 1 ? '1 opzione scaduta' : nScadute + ' opzioni scadute'}</span>
                  {' '}da chiudere (proroga, conferma o annullamento). Tocca per vederle.
                </button>
              )}

              <div className="flex flex-wrap gap-2 mb-3">
                {FILTRI.map(function(f) {
                  var attivo = filtro === f.key
                  return (
                    <button key={f.key} type="button" onClick={function() { setFiltro(f.key) }}
                      className={'px-3 py-1.5 rounded-full text-sm border ' +
                        (attivo ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}>
                      {f.label}
                    </button>
                  )
                })}
              </div>
              <div className="mb-4">
                <button type="button" onClick={function() { setMostraPassati(!mostraPassati) }}
                  className={'px-3 py-1.5 rounded-lg text-sm border ' +
                    (mostraPassati ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}>
                  {mostraPassati ? '✓ ' : ''}Mostra anche i passati
                </button>
              </div>

              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Da oggi in avanti</div>
              {futuri.length === 0 ? (
                <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg text-sm text-gray-500">Nessun evento.</div>
              ) : (
                <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
                  {futuri.map(rigaEvento)}
                </div>
              )}

              {mostraPassati && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Passati (dal piu' recente)</div>
                  {passati.length === 0 ? (
                    <div className="p-4 bg-white border border-gray-200 rounded-lg text-sm text-gray-500">Nessun evento.</div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      {passati.map(rigaEvento)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================= LINGUETTA SPAZI ================= */}
          {tab === 'spazi' && (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Da qui si aggiungono, si modificano e si eliminano gli spazi <span className="font-medium">solo per eventi</span>.
                Le sale del ristorante si vedono per completezza, ma si gestiscono da Sale e Tavoli.
              </p>
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                {sale.map(function(s) {
                  return (
                    <div key={s.id} className={'px-4 py-3 border-b border-gray-100 last:border-0 flex items-center justify-between gap-3 ' + (s.attiva === false ? 'opacity-60' : '')}>
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900">{s.nome}</div>
                        <div className="text-xs text-gray-500">
                          {s.solo_eventi ? 'Solo per eventi' : 'Ristorante'}
                          {s.attiva === false ? ' · spento' : ''}
                        </div>
                      </div>
                      {s.solo_eventi && puoModificare ? (
                        <div className="flex gap-2 flex-shrink-0">
                          <button type="button" onClick={function() { setSpazioModal({ open: true, spazio: s }) }}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                            Modifica
                          </button>
                          <button type="button" onClick={function() { setErroreRiga(null); setMessaggioRiga(null); setEliminaModal({ open: true, tipo: 'spazio', oggetto: s }) }}
                            className="px-3 py-1.5 border border-red-300 rounded-lg text-sm text-red-700 hover:bg-red-50">
                            Elimina
                          </button>
                        </div>
                      ) : (
                        !s.solo_eventi && <span className="text-xs text-gray-400 flex-shrink-0">Sale e Tavoli</span>
                      )}
                    </div>
                  )
                })}
                {sale.length === 0 && (
                  <div className="p-4 text-sm text-gray-500">Nessuno spazio.</div>
                )}
              </div>
            </div>
          )}

          {/* ================= LINGUETTA TIPOLOGIE ================= */}
          {tab === 'tipologie' && (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Una tipologia spenta non viene piu' proposta, ma resta sugli eventi che la usano.
                Una tipologia eliminata sparisce: se qualche evento la usa, scegli tu con che cosa sostituirla.
              </p>
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                {tipologie.map(function(t) {
                  return (
                    <div key={t.id} className={'px-4 py-3 border-b border-gray-100 last:border-0 flex items-center justify-between gap-3 ' + (t.attiva === false ? 'opacity-60' : '')}>
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900">{t.nome}</div>
                        {t.attiva === false && <div className="text-xs text-gray-500">spenta</div>}
                      </div>
                      {puoModificare && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button type="button" onClick={function() { setTipologiaModal({ open: true, tipologia: t }) }}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                            Rinomina
                          </button>
                          <button type="button" onClick={function() { cambiaAttivaTipologia(t) }}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                            {t.attiva === false ? 'Accendi' : 'Spegni'}
                          </button>
                          <button type="button" onClick={function() { setErroreRiga(null); setMessaggioRiga(null); setEliminaModal({ open: true, tipo: 'tipologia', oggetto: t }) }}
                            className="px-3 py-1.5 border border-red-300 rounded-lg text-sm text-red-700 hover:bg-red-50">
                            Elimina
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {tipologie.length === 0 && (
                  <div className="p-4 text-sm text-gray-500">Nessuna tipologia. Si possono aggiungere da qui o direttamente dalla scheda di un evento.</div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      <SpazioModal
        open={spazioModal.open}
        spazio={spazioModal.spazio}
        onClose={function() { setSpazioModal({ open: false, spazio: null }) }}
        onSaved={function() { setSpazioModal({ open: false, spazio: null }); carica() }}
      />
      <TipologiaModal
        open={tipologiaModal.open}
        tipologia={tipologiaModal.tipologia}
        elenco={tipologie}
        onClose={function() { setTipologiaModal({ open: false, tipologia: null }) }}
        onSaved={function() { setTipologiaModal({ open: false, tipologia: null }); carica() }}
      />
      <EliminaModal
        open={eliminaModal.open}
        tipo={eliminaModal.tipo}
        oggetto={eliminaModal.oggetto}
        alternative={eliminaModal.tipo === 'tipologia' ? tipologie : sale}
        onClose={function() { setEliminaModal({ open: false, tipo: null, oggetto: null }) }}
        onDone={function(testo) { setEliminaModal({ open: false, tipo: null, oggetto: null }); setMessaggioRiga(testo); carica() }}
      />
    </div>
  )
}
