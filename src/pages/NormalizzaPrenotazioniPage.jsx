import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, BedDouble, Gift, AlertTriangle, Eye, RotateCcw, ChevronRight, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ============================================================
// NORMALIZZA PRENOTAZIONI — l'elenco che INDICA soltanto
//
// Questa pagina non normalizza niente. Dice dove c'e' qualcosa da
// guardare e apre la prenotazione: la proposta, e la decisione, stanno
// dentro il modulo della prenotazione, una alla volta.
//
// Non esiste, e non deve esistere, un pulsante "conferma tutto": cento
// proposte accettate senza guardarne nessuna sono una scrittura
// automatica travestita da conferma.
//
// Il riconoscimento avviene DENTRO il database, nella funzione
// prenotazioni_da_normalizzare (migrazione 53). Qui non si riconosce
// niente: se la regola cambia, cambia in un posto solo (regola 31).
// ============================================================

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function primoDelMese() {
  var d = new Date()
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-01'
}

function ultimoDelMese() {
  var d = new Date()
  var u = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return u.getFullYear() + '-' + pad(u.getMonth() + 1) + '-' + pad(u.getDate())
}

function dataLeggibile(iso) {
  if (!iso) return ''
  var p = iso.split('-')
  var d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]))
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

// ============================================================
// «NIENTE DA FARE» — cosa vuol dire, esattamente.
//
// Una riga non ha piu' niente da fare quando TUTTE queste cose sono vere:
//   - ogni camera riconosciuta e' gia' nel campo Camera (gia_nel_campo)
//   - non c'e' nessun codice gift card riconosciuto nelle note
//   - non c'e' nessuna tipologia gift card senza codice
//   - non e' un ospite dell'albergo senza camera
//
// ⚠ Il limite dichiarato: la funzione SQL dice se un codice gift card
// esiste in archivio, NON dice se e' gia' agganciato a QUESTA
// prenotazione. Percio' una riga con un codice riconosciuto resta
// sempre "da guardare", anche quando il legame c'e' gia'. E' una
// prudenza voluta: il verde deve dire il vero sempre, mai "quasi".
// Cambiarlo vorrebbe dire cambiare la funzione SQL, non questa pagina.
// ============================================================
function nienteDaFare(r) {
  var camere = r.camere_trovate || []
  var gift = r.gift_trovate || []
  var tipologie = r.tipologie_trovate || []
  if (gift.length > 0) return false
  if (tipologie.length > 0) return false
  if (r.ospite_hotel_senza_camera) return false
  for (var i = 0; i < camere.length; i++) {
    if (!camere[i].gia_nel_campo) return false
  }
  return true
}

function NormalizzaPrenotazioniPage() {
  var navigate = useNavigate()

  var [dal, setDal] = useState(primoDelMese())
  var [al, setAl] = useState(ultimoDelMese())
  var [mostraViste, setMostraViste] = useState(false)

  var [righe, setRighe] = useState([])
  var [totale, setTotale] = useState(0)
  var [cercato, setCercato] = useState(false)
  var [loading, setLoading] = useState(false)
  var [errore, setErrore] = useState('')

  var LIMITE = 200

  function cerca() {
    if (!dal || !al) { setErrore('Scegli tutte e due le date.'); return }
    if (dal > al) { setErrore('La prima data viene dopo la seconda.'); return }
    setErrore('')
    setLoading(true)
    supabase.rpc('prenotazioni_da_normalizzare', {
      p_dal: dal,
      p_al: al,
      p_mostra_viste: mostraViste,
      p_limite: LIMITE
    }).then(function(result) {
      setLoading(false)
      setCercato(true)
      if (result.error) {
        setErrore('Errore: ' + result.error.message)
        setRighe([])
        setTotale(0)
        return
      }
      var dati = result.data || []
      setRighe(dati)
      setTotale(dati.length > 0 ? Number(dati[0].totale) : 0)
    })
  }

  // Regola 48: se l'elenco sa togliere una prenotazione (segnandola come
  // guardata), deve saperla anche rimettere dentro.
  function rimettiInElenco(riga) {
    supabase.from('reservations')
      .update({ normalizzata_il: null })
      .eq('id', riga.id)
      .then(function(result) {
        if (result.error) { alert('Errore: ' + result.error.message); return }
        cerca()
      })
  }

  function apri(riga) {
    navigate('/prenotazioni/' + riga.id + '/modifica?normalizza=1')
  }

  function turnoLabel(m) {
    return m === 'lunch' ? 'Pranzo' : 'Cena'
  }

  // Quante righe hanno ancora lavoro e quante sono gia' a posto.
  var quanteAPosto = 0
  for (var q = 0; q < righe.length; q++) {
    if (nienteDaFare(righe[q])) quanteAPosto = quanteAPosto + 1
  }
  var quanteDaGuardare = righe.length - quanteAPosto

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Normalizza prenotazioni</h1>
        <p className="text-sm text-gray-500 mt-1">
          Le prenotazioni prese col vecchio metodo hanno la camera e il codice della gift card
          scritti a mano nelle note. Qui vedi dove, e apri una alla volta.
        </p>
      </div>

      {/* Le due date */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dal giorno</label>
            <input type="date" value={dal} onChange={function(e) { setDal(e.target.value) }}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Al giorno</label>
            <input type="date" value={al} onChange={function(e) { setAl(e.target.value) }}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base" />
          </div>
        </div>

        <button type="button"
          onClick={function() { setMostraViste(!mostraViste) }}
          className={"mt-4 w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors " +
            (mostraViste ? 'border-wine-400 bg-wine-50' : 'border-gray-200 hover:bg-gray-50')}>
          <span className={"w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 " +
            (mostraViste ? 'bg-wine-700 border-wine-700 text-white' : 'border-gray-300')}>
            {mostraViste ? <Eye size={13} /> : null}
          </span>
          <span className="text-sm text-gray-700">
            Mostra anche quelle che ho gia guardato
          </span>
        </button>

        <button type="button" onClick={cerca} disabled={loading}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-wine-700 text-white px-5 py-3 rounded-xl hover:bg-wine-800 transition-colors font-medium disabled:opacity-50">
          <Search size={18} />
          {loading ? 'Cerco...' : 'Cerca'}
        </button>

        <p className="text-xs text-gray-400 mt-3">
          Un mese alla volta e la misura giusta: intervalli larghi rendono l elenco lungo
          e la ricerca lenta.
        </p>
      </div>

      {errore !== '' && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {errore}
        </div>
      )}

      {/* Avviso di elenco tagliato: mai una lista incompleta senza dirlo. */}
      {cercato && totale >= LIMITE && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-2">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Ce ne sono almeno {LIMITE}: questo elenco e tagliato. Stringi le date per vederle tutte.
          </p>
        </div>
      )}

      {cercato && righe.length === 0 && errore === '' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500">
            In questo periodo non c e niente da riconoscere.
          </p>
        </div>
      )}

      {righe.length > 0 && (
        <p className="text-sm text-gray-500 mb-3">
          {righe.length} {righe.length === 1 ? 'prenotazione' : 'prenotazioni'}
          {quanteAPosto > 0
            ? ' — ' + quanteDaGuardare + ' da guardare, ' + quanteAPosto + ' gia a posto'
            : ' da guardare'}
        </p>
      )}

      <div className="space-y-3">
        {righe.map(function(r) {
          var camere = r.camere_trovate || []
          var gift = r.gift_trovate || []
          var tipologie = r.tipologie_trovate || []
          var aPosto = nienteDaFare(r)

          return (
            <div key={r.id}
              className={aPosto
                ? 'bg-white rounded-xl shadow-sm border border-green-300 p-4'
                : 'bg-white rounded-xl shadow-sm border border-gray-200 p-4'}>

              {/* Il segno verde: questa riga non chiede niente a nessuno. */}
              {aPosto && (
                <div className="mb-2 inline-flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-800 rounded-full px-3 py-1 text-xs font-medium">
                  <CheckCircle2 size={14} />
                  Niente da fare
                </div>
              )}

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{r.nome}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {dataLeggibile(r.reservation_date)} · {turnoLabel(r.meal_type)}
                    {r.requested_time ? ' · ' + String(r.requested_time).substring(0, 5) : ''}
                  </p>
                  {r.camera_attuale !== '' && (
                    <p className="text-xs text-wine-700 mt-0.5">
                      Camera gia scritta: {r.camera_attuale}
                    </p>
                  )}
                </div>
                <button type="button" onClick={function() { apri(r) }}
                  className={aPosto
                    ? 'inline-flex items-center gap-1 bg-white text-wine-700 border border-wine-300 px-4 py-2 rounded-lg hover:bg-wine-50 transition-colors text-sm font-medium flex-shrink-0'
                    : 'inline-flex items-center gap-1 bg-wine-700 text-white px-4 py-2 rounded-lg hover:bg-wine-800 transition-colors text-sm font-medium flex-shrink-0'}>
                  Apri
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="mt-3 space-y-1.5">

                {camere.map(function(c, i) {
                  return (
                    <div key={'c' + i} className="flex items-start gap-2 text-sm">
                      <BedDouble size={15} className="text-wine-600 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700 min-w-0">
                        <span className="font-medium">{c.nome}</span>
                        {c.gia_nel_campo ? ' (gia nel campo Camera)' : ''}
                        <span className="text-gray-400"> — nelle note: “{c.contesto}”</span>
                      </span>
                    </div>
                  )
                })}

                {gift.map(function(g, i) {
                  return (
                    <div key={'g' + i} className="flex items-start gap-2 text-sm">
                      <Gift size={15} className="text-wine-600 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700 min-w-0">
                        Codice <span className="font-medium">{g.codice}</span>
                        {g.tipologia ? ' — ' + g.tipologia : ''}
                        {g.usata ? ' (gia segnata come utilizzata)' : ''}
                      </span>
                    </div>
                  )
                })}

                {gift.length === 0 && tipologie.map(function(t, i) {
                  return (
                    <div key={'t' + i} className="flex items-start gap-2 text-sm">
                      <Gift size={15} className="text-gray-400 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-500 min-w-0">
                        Nelle note c e “{t}”, ma nessun codice: la gift card va cercata a mano.
                      </span>
                    </div>
                  )
                })}

                {r.ospite_hotel_senza_camera && (
                  <div className="flex items-start gap-2 text-sm">
                    <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <span className="text-amber-800 min-w-0">
                      Ospite dell albergo, ma la camera non c e ne nel campo ne nelle note.
                    </span>
                  </div>
                )}

              </div>

              {r.normalizzata_il && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-400">Gia guardata</span>
                  <button type="button" onClick={function() { rimettiInElenco(r) }}
                    className="inline-flex items-center gap-1 text-xs text-wine-700 hover:text-wine-900">
                    <RotateCcw size={13} />
                    Rimetti in elenco
                  </button>
                </div>
              )}

            </div>
          )
        })}
      </div>

      <div className="h-8" />
    </div>
  )
}

export default NormalizzaPrenotazioniPage
