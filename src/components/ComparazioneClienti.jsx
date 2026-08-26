import { useState } from 'react'
import { AlertTriangle, UserPlus, Link2, X } from 'lucide-react'

// ============================================================
// COMPARAZIONE N A 1 — 8-bis, fase 2
//
// Una copia sola, montata in DUE porte (regola 31):
//   - ReservationForm, creazione rapida del cliente
//   - CustomerForm, creazione completa
//
// La regola che decide chi e' un candidato NON sta qui: sta in SQL,
// nella funzione hic_candidati_cliente della migrazione 50. Questo file
// la mostra e basta. Se un giorno la regola cambia, cambia in un posto
// solo e le due porte si adeguano insieme.
//
// ⚠️ I candidati DEBOLI non arrivano mai qui: cercaCandidatiForti() li
// scarta. Alimentano solo la pagina di fusione (fase 3). Un DEBOLE e'
// "stesso nome e cognome e nient altro": mostrarlo in creazione
// fermerebbe l'operatore su due omonimi che non c'entrano niente.
//
// ⚠️ Nessuna fusione, qui. Le azioni sono due: usare la scheda trovata,
// oppure crearne una nuova lo stesso. Fondere e' la fase 3, e senza il
// verbale di fusione non sarebbe possibile tornare indietro.
// ============================================================

// Cerca i candidati e restituisce SOLO quelli che meritano di fermare
// l'operatore. Da chiamare PRIMA di salvare: se torna un elenco vuoto,
// il salvataggio prosegue e l'utente non vede niente.
//
// dati: { first_name, last_name, phone, email }
// hicCustomerId: id cliente di Hotel in Cloud quando si arriva dal
//                pulsante Camere, altrimenti null
// escludiId:     la scheda che si sta modificando, da non proporre a se'
//                stessa, altrimenti null
export function cercaCandidatiForti(supabase, dati, hicCustomerId, escludiId) {
  var parametri = {
    p_first_name: (dati && dati.first_name) ? dati.first_name : null,
    p_last_name: (dati && dati.last_name) ? dati.last_name : null,
    p_phone: (dati && dati.phone) ? dati.phone : null,
    p_email: (dati && dati.email) ? dati.email : null,
    p_hic_customer_id: hicCustomerId || null,
    p_escludi_id: escludiId || null
  }
  return supabase.rpc('hic_candidati_cliente', parametri).then(function(result) {
    if (result.error) {
      // Un guasto nella ricerca non deve impedire di lavorare: si
      // prosegue come se non ci fossero candidati, e si annota in
      // console. Meglio un doppione che una prenotazione persa.
      console.error('Ricerca candidati fallita:', result.error)
      return []
    }
    var righe = result.data || []
    var forti = []
    for (var i = 0; i < righe.length; i++) {
      if (righe[i].livello === 'CERTEZZA' || righe[i].livello === 'FORTE') {
        forti.push(righe[i])
      }
    }
    return forti
  })
}

function valoreOppureTrattino(v) {
  if (v === null || v === undefined) return '—'
  var s = String(v).trim()
  return s === '' ? '—' : s
}

// Righe di confronto fra i dati digitati e la scheda trovata.
// Il campo che coincide si accende: e' il motivo per cui la scheda e'
// finita in elenco, e va visto in un colpo d'occhio.
function RigaConfronto(props) {
  var classi = props.combacia
    ? 'flex items-start gap-2 py-1.5 px-2 rounded bg-amber-50'
    : 'flex items-start gap-2 py-1.5 px-2 rounded'
  return (
    <div className={classi}>
      <span className="text-xs text-gray-500 w-20 flex-shrink-0 pt-0.5">{props.etichetta}</span>
      <span className="text-sm text-gray-900 flex-1 break-words">{valoreOppureTrattino(props.valore)}</span>
    </div>
  )
}

export default function ComparazioneClienti(props) {
  // props attese:
  //   open        (bool)      se mostrare il pannello
  //   dati        (oggetto)   { first_name, last_name, phone, email }
  //   candidati   (array)     esito di cercaCandidatiForti()
  //   salvando    (bool)      disabilita i pulsanti durante la scrittura
  //   onUsa       (function)  chiamata con la riga candidata scelta
  //   onCreaComunque (function)
  //   onAnnulla   (function)

  var [scelto, setScelto] = useState(null)

  if (!props.open) return null

  var candidati = props.candidati || []
  var dati = props.dati || {}
  var uno = candidati.length === 1

  var telDigitato = (dati.phone || '').replace(/[^0-9]/g, '')
  var mailDigitata = (dati.email || '').trim().toLowerCase()

  function combaciaTelefono(c) {
    if (telDigitato === '') return false
    var t = (c.phone || '').replace(/[^0-9]/g, '')
    if (t === '') return false
    // Confronto morbido lato browser: serve solo ad accendere la riga.
    // La regola vera l'ha gia' applicata hic_normalizza_telefono in SQL.
    return t.slice(-9) === telDigitato.slice(-9)
  }

  function combaciaEmail(c) {
    if (mailDigitata === '') return false
    return (c.email || '').trim().toLowerCase() === mailDigitata
  }

  function usa(c) {
    setScelto(c.customer_id)
    if (props.onUsa) props.onUsa(c)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-start sm:items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-4">

        <div className="px-5 py-4 border-b border-gray-200 flex items-start gap-3">
          <AlertTriangle size={22} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              {uno ? 'Forse questa persona e gia registrata' : 'Forse questa persona e gia registrata'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {uno
                ? 'Ho trovato una scheda che potrebbe essere la stessa persona. Guarda e decidi.'
                : 'Ho trovato ' + candidati.length + ' schede che potrebbero essere la stessa persona. Guarda e decidi.'}
            </p>
          </div>
          <button
            type="button"
            onClick={function() { if (props.onAnnulla) props.onAnnulla() }}
            disabled={props.salvando}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5">

          {/* Quello che si sta scrivendo adesso */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Stai inserendo</p>
            <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
              <RigaConfronto etichetta="Nome" valore={(dati.first_name || '') + ' ' + (dati.last_name || '')} combacia={false} />
              <RigaConfronto etichetta="Telefono" valore={dati.phone} combacia={false} />
              <RigaConfronto etichetta="Email" valore={dati.email} combacia={false} />
            </div>
          </div>

          {/* Le schede trovate */}
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            {uno ? 'Scheda gia in archivio' : 'Schede gia in archivio'}
          </p>

          <div className="space-y-3">
            {candidati.map(function(c) {
              var evidenziata = scelto === c.customer_id
              var classiCard = evidenziata
                ? 'border border-wine-400 rounded-lg p-3 bg-wine-50'
                : 'border border-gray-200 rounded-lg p-3'
              var classiEtichetta = c.livello === 'CERTEZZA'
                ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800'
                : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800'

              return (
                <div key={c.customer_id} className={classiCard}>

                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <p className="font-semibold text-gray-900">
                      {c.last_name} {c.first_name}
                    </p>
                    <span className={classiEtichetta}>
                      {c.livello === 'CERTEZZA' ? <Link2 size={12} /> : null}
                      {c.motivo}
                    </span>
                  </div>

                  <RigaConfronto etichetta="Telefono" valore={c.phone} combacia={combaciaTelefono(c)} />
                  <RigaConfronto etichetta="Email" valore={c.email} combacia={combaciaEmail(c)} />

                  <button
                    type="button"
                    onClick={function() { usa(c) }}
                    disabled={props.salvando}
                    className="mt-3 w-full flex items-center justify-center gap-2 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2.5 rounded-lg text-sm font-medium"
                  >
                    Usa questa scheda
                  </button>

                </div>
              )
            })}
          </div>

          {/* La via d'uscita: crearne una nuova lo stesso.
              ⚠️ Non e' un errore ne' una forzatura: due familiari
              condividono davvero un numero, e da agosto il database non
              lo impedisce piu'. Il pulsante non deve sembrare una
              trasgressione, ma nemmeno la strada piu' comoda. */}
          <div className="mt-5 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={function() { if (props.onCreaComunque) props.onCreaComunque() }}
              disabled={props.salvando}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 font-medium"
            >
              <UserPlus size={16} />
              {props.salvando ? 'Salvataggio...' : 'Crea comunque una scheda nuova'}
            </button>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Due persone della stessa famiglia possono avere lo stesso numero o la stessa email.
            </p>
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={function() { if (props.onAnnulla) props.onAnnulla() }}
              disabled={props.salvando}
              className="w-full px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              Torna indietro e correggi
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
