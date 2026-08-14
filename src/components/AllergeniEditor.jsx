import { AlertTriangle, ShieldCheck } from 'lucide-react'

// ---------------------------------------------------------------------------
// EDITOR ALLERGENI CONDIVISO
//
// Usato da CustomerForm (scheda cliente completa) e dalla modale cliente
// dentro ReservationForm. Esiste per un motivo solo: la regola sul consenso
// ai dati sanitari e la scrittura su customer_allergens devono stare in UNA
// copia sola. Se un giorno la regola cambia, cambia qui e basta.
//
// I due livelli di allergeni sono COMPLEMENTARI, non doppioni:
//  - customer_allergens : i 14 allergeni di legge, con la gravita'
//  - customers.allergie_cliente : testo libero per cio' che nell'elenco non c'e'
// Chi mostra gli allergeni deve mostrarli TUTTI E DUE.
// ---------------------------------------------------------------------------

export var SEVERITA = [
  { value: 'allergy',     label: 'Allergia' },
  { value: 'intolerance', label: 'Intolleranza' },
  { value: 'preference',  label: 'Preferenza' }
]

export function severitaLabel(value) {
  var trovata = SEVERITA.filter(function(s) { return s.value === value })
  return trovata.length > 0 ? trovata[0].label : 'Allergia'
}

export function haAllergeniSelezionati(selected) {
  if (!selected) return false
  for (var k in selected) {
    if (selected[k] && selected[k].selected) return true
  }
  return false
}

// UNICA copia della regola: gli allergeni sono dati sanitari.
// Restituisce il messaggio d'errore, oppure null se si puo' salvare.
export function validaAllergeni(selected, consensoSalute) {
  if (haAllergeniSelezionati(selected) && !consensoSalute) {
    return 'Per registrare gli allergeni e necessario il consenso al trattamento dei dati sulla salute.'
  }
  return null
}

// UNICA copia della scrittura: cancella tutto e reinserisce.
// Restituisce una promise che risolve in { error: ... | null }.
export function salvaAllergeni(supabase, customerId, selected) {
  return supabase
    .from('customer_allergens')
    .delete()
    .eq('customer_id', customerId)
    .then(function(res) {
      if (res.error) return { error: res.error }

      var righe = []
      for (var k in selected) {
        if (!selected[k] || !selected[k].selected) continue
        righe.push({
          customer_id: customerId,
          allergen_id: parseInt(k, 10),
          severity: selected[k].severity || 'allergy',
          notes: selected[k].notes || null
        })
      }
      if (righe.length === 0) return { error: null }

      return supabase
        .from('customer_allergens')
        .insert(righe)
        .then(function(r2) { return { error: r2.error || null } })
    })
}

// UNICA copia dei campi di consenso duplicati sulla tabella customers
// (esistono "per accesso rapido" accanto a gdpr_consents: vanno scritti
// sempre insieme, altrimenti i due divergono in silenzio).
export function campiConsensoSalute(consensoSalute) {
  return {
    consenso_allergie: consensoSalute === true,
    consenso_allergie_data: consensoSalute === true ? new Date().toISOString() : null
  }
}

// UNICA copia dello scrittore del consenso su gdpr_consents.
export function salvaConsensoSalute(supabase, customerId, consensoSalute) {
  return supabase
    .from('gdpr_consents')
    .upsert(
      {
        customer_id: customerId,
        consent_type: 'health_data',
        granted: consensoSalute === true,
        granted_at: consensoSalute === true ? new Date().toISOString() : null,
        method: 'digital'
      },
      { onConflict: 'customer_id,consent_type' }
    )
    .then(function(res) { return { error: res.error || null } })
}

// Legge lo stato attuale di un cliente: allergeni strutturati, testo libero
// e consenso sanitario. Una lettura sola, usata da chi apre la modifica.
export function caricaAllergeniCliente(supabase, customerId) {
  return supabase
    .from('customer_allergens')
    .select('allergen_id, severity, notes')
    .eq('customer_id', customerId)
    .then(function(resAll) {
      var selected = {}
      if (!resAll.error && resAll.data) {
        resAll.data.forEach(function(ca) {
          selected[ca.allergen_id] = {
            selected: true,
            severity: ca.severity || 'allergy',
            notes: ca.notes || ''
          }
        })
      }
      return supabase
        .from('gdpr_consents')
        .select('granted')
        .eq('customer_id', customerId)
        .eq('consent_type', 'health_data')
        .then(function(resCons) {
          var consenso = false
          if (!resCons.error && resCons.data && resCons.data.length > 0) {
            consenso = resCons.data[0].granted === true
          }
          return { selected: selected, consensoSalute: consenso }
        })
    })
}

// ---------------------------------------------------------------------------
// Il componente
//
// props:
//   allergens              elenco della tabella allergens
//   selected               mappa { allergen_id: { selected, severity, notes } }
//   onSelectedChange(m)    obbligatoria
//   testoLibero            stringa
//   onTestoLiberoChange(v) obbligatoria
//   consensoSalute         booleano
//   onConsensoChange(b)    facoltativa: se assente, la casella del consenso
//                          NON viene disegnata (chi chiama la gestisce altrove)
//   compatto               true dentro una modale
// ---------------------------------------------------------------------------
function AllergeniEditor(props) {
  var allergens = props.allergens || []
  var selected = props.selected || {}
  var compatto = props.compatto === true

  function copiaSelezione() {
    var agg = {}
    for (var k in selected) { agg[k] = selected[k] }
    return agg
  }

  function toggle(id) {
    var agg = copiaSelezione()
    if (agg[id] && agg[id].selected) {
      delete agg[id]
    } else {
      agg[id] = { selected: true, severity: 'allergy', notes: '' }
    }
    props.onSelectedChange(agg)
  }

  function setSeverita(id, sev) {
    var agg = copiaSelezione()
    var precedenti = agg[id] || {}
    agg[id] = { selected: true, severity: sev, notes: precedenti.notes || '' }
    props.onSelectedChange(agg)
  }

  var mostraAvvisoConsenso = haAllergeniSelezionati(selected) && props.consensoSalute !== true

  return (
    <div className={compatto ? '' : 'space-y-6'}>

      {/* Allergeni strutturati */}
      <div className={compatto ? '' : 'bg-white rounded-xl shadow-sm border border-gray-200 p-6'}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={compatto ? 16 : 20} className="text-orange-500" />
          <h2 className={compatto ? 'text-sm font-semibold text-gray-900' : 'text-lg font-semibold text-gray-900'}>
            Allergeni / Intolleranze
          </h2>
        </div>
        <p className={compatto ? 'text-xs text-gray-500 mb-3' : 'text-sm text-gray-500 mb-4'}>
          Seleziona gli allergeni che il cliente deve evitare (Reg. UE 1169/2011)
        </p>

        <div className={compatto ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
          {allergens.map(function(allergen) {
            var voce = selected[allergen.id]
            var isSelected = Boolean(voce && voce.selected)
            return (
              <div
                key={allergen.id}
                className={'border rounded-lg p-3 transition-all ' + (isSelected ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300')}
              >
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={function() { toggle(allergen.id) }}
                    className="w-5 h-5 rounded border-gray-300 text-wine-600 focus:ring-wine-500"
                  />
                  <span className="text-xl">{allergen.icon}</span>
                  <span className="font-medium text-gray-900">{allergen.name}</span>
                </label>

                {/* Gravita': pulsanti tappabili, mai un select nativo (iPad) */}
                {isSelected && (
                  <div className="mt-2 ml-8 flex flex-wrap gap-2">
                    {SEVERITA.map(function(s) {
                      var attiva = (voce.severity || 'allergy') === s.value
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={function() { setSeverita(allergen.id, s.value) }}
                          className={'px-3 py-1.5 rounded-lg text-xs border transition-colors ' + (attiva ? 'bg-wine-700 text-white border-wine-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')}
                        >
                          {s.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Testo libero */}
      <div className={compatto ? 'mt-3' : 'bg-orange-50 rounded-xl shadow-sm border border-orange-200 p-6'}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={compatto ? 14 : 18} className="text-orange-500" />
          <h2 className={compatto ? 'text-sm font-semibold text-gray-900' : 'text-lg font-semibold text-gray-900'}>
            Note allergie aggiuntive
          </h2>
        </div>
        <p className={compatto ? 'text-xs text-gray-500 mb-2' : 'text-sm text-gray-500 mb-3'}>
          Descrizione libera di allergie, intolleranze o esigenze dietetiche particolari.
          Questa nota apparira nelle stampe di cucina e nel riquadro rosso in prenotazione.
        </p>
        <textarea
          value={props.testoLibero || ''}
          onChange={function(e) { props.onTestoLiberoChange(e.target.value) }}
          rows={compatto ? 2 : 3}
          className={'w-full px-4 py-3 border border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ' + (compatto ? 'text-sm' : 'text-base')}
          placeholder="es. 1 celiaco grave, 2 intolleranti al lattosio, 1 vegano..."
        />
      </div>

      {/* Consenso sanitario: disegnato solo se chi chiama lo gestisce qui */}
      {props.onConsensoChange && (
        <div className={'rounded-lg border p-3 ' + (mostraAvvisoConsenso ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200') + (compatto ? ' mt-3' : '')}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={props.consensoSalute === true}
              onChange={function(e) { props.onConsensoChange(e.target.checked) }}
              className="w-5 h-5 mt-0.5 rounded border-gray-300 text-wine-600 focus:ring-wine-500 flex-shrink-0"
            />
            <span className="text-sm text-gray-700">
              <span className="font-medium flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-gray-400" />
                Consenso ai dati sulla salute
                {haAllergeniSelezionati(selected) && <span className="text-red-500">*</span>}
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Il cliente autorizza la registrazione di allergie e intolleranze. Senza questo consenso gli allergeni non possono essere salvati.
              </span>
            </span>
          </label>
        </div>
      )}

    </div>
  )
}

export default AllergeniEditor
