import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { ArrowLeft, Edit, Trash2, Phone, Mail, MapPin, AlertTriangle, Shield, ShieldCheck, ShieldX, Users, EyeOff, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import AllergenBadge from '../components/AllergenBadge'
import StoricoCliente from '../components/StoricoCliente'
import FusioneClienti, { EliminaCliente, SchedeUnite, nomeScheda } from '../components/FusioneClienti'

// ============================================================
// SCHEDA CLIENTE
// 23/11/2026 (migrazione 67): riquadro «Storico» (StoricoCliente).
// 25/11/2026 (migrazione 68, sessione «fusione ed eliminazione»):
//   * «Unisci con altre schede» e «Elimina scheda» (components/
//     FusioneClienti.jsx), firmati col PIN;
//   * riquadro «Schede unite in questa» con «Annulla»;
//   * chi apre l'indirizzo di una scheda UNITA (lapide, merged_into)
//     viene portato alla scheda che è rimasta, con una riga che lo dice;
//   * «Disattiva» solo con Clienti = modifica (era senza controllo);
//     una scheda disattivata mostra la striscia grigia e «Riattiva»
//     (regola 48: chi sa togliere deve saper rimettere);
//   * «Modifica» solo con Clienti = modifica (la rotta lo chiedeva già).
// Tutti i pulsanti si proteggono con canEdit('clienti') (regola 35).
// ============================================================

var categoryLabels = {
  standard: 'Standard',
  vip: 'VIP',
  press: 'Stampa',
  business: 'Business',
  hotel_guest: 'Ospite Hotel'
}

var categoryColors = {
  standard: 'bg-gray-100 text-gray-700',
  vip: 'bg-amber-100 text-amber-800',
  press: 'bg-purple-100 text-purple-800',
  business: 'bg-blue-100 text-blue-800',
  hotel_guest: 'bg-green-100 text-green-800'
}

var consentLabels = {
  data_processing: 'Trattamento dati personali',
  health_data: 'Dati sulla salute (allergeni)',
  marketing: 'Comunicazioni commerciali',
  profiling: 'Profilazione'
}

function CustomerDetail() {
  var params = useParams()
  var id = params.id
  var navigate = useNavigate()
  var location = useLocation()
  var auth = useAuth()
  var puoScrivere = auth.canEdit('clienti')
  var [customer, setCustomer] = useState(null)
  var [allergens, setAllergens] = useState([])
  var [consents, setConsents] = useState([])
  var [loading, setLoading] = useState(true)
  var [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  var [apriFusione, setApriFusione] = useState(false)
  var [apriElimina, setApriElimina] = useState(false)
  var [versione, setVersione] = useState(0)
  var [messaggio, setMessaggio] = useState(null)
  var [errore, setErrore] = useState(null)

  var unitaDa = location.state && location.state.unitaDa ? location.state.unitaDa : null

  useEffect(function() {
    setApriFusione(false)
    setApriElimina(false)
    setShowDeleteConfirm(false)
    setErrore(null)
    loadCustomer()
  }, [id])

  async function loadCustomer() {
    setLoading(true)
    try {
      var customerResult = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single()

      if (customerResult.error) throw customerResult.error

      // Scheda unita a un'altra (lapide): si va alla scheda rimasta.
      if (customerResult.data.merged_into) {
        navigate('/clienti/' + customerResult.data.merged_into, {
          replace: true,
          state: { unitaDa: nomeScheda(customerResult.data) }
        })
        return
      }
      setCustomer(customerResult.data)

      var allergensResult = await supabase
        .from('customer_allergens')
        .select(`
          severity,
          notes,
          allergens (
            id,
            name,
            description,
            icon
          )
        `)
        .eq('customer_id', id)

      if (allergensResult.error) throw allergensResult.error
      setAllergens(allergensResult.data)

      var consentsResult = await supabase
        .from('gdpr_consents')
        .select('*')
        .eq('customer_id', id)

      if (consentsResult.error) throw consentsResult.error
      setConsents(consentsResult.data)

    } catch (error) {
      console.error('Errore:', error)
      alert('Cliente non trovato.')
      navigate('/clienti')
    } finally {
      setLoading(false)
    }
  }

  function ricarica() {
    setVersione(function(v) { return v + 1 })
    loadCustomer()
  }

  async function cambiaAttiva(attiva) {
    setErrore(null)
    setMessaggio(null)
    var result = await supabase
      .from('customers')
      .update({ is_active: attiva })
      .eq('id', id)
    if (result.error) {
      console.error('Errore:', result.error)
      setErrore(attiva ? 'Non sono riuscito a riattivare la scheda.' : 'Non sono riuscito a disattivare la scheda.')
      return
    }
    setShowDeleteConfirm(false)
    if (attiva) {
      setMessaggio('Scheda riattivata: compare di nuovo nelle ricerche.')
      ricarica()
    } else {
      navigate('/clienti')
    }
  }

  function dopoFusione(superstiteId) {
    setApriFusione(false)
    if (superstiteId === id) {
      setMessaggio('Schede unite. Si può annullare dal riquadro «Schede unite in questa».')
      ricarica()
    } else {
      navigate('/clienti/' + superstiteId, { state: { unitaDa: nomeScheda(customer) } })
    }
  }

  function dopoEliminazione(esito, destinazioneId) {
    setApriElimina(false)
    if (esito === 'spostata' && destinazioneId) {
      navigate('/clienti/' + destinazioneId, { state: { unitaDa: nomeScheda(customer) } })
    } else {
      navigate('/clienti')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-lg">Caricamento...</div>
      </div>
    )
  }

  if (!customer) return null

  var disattivata = customer.is_active === false

  return (
    <div className="max-w-3xl mx-auto">
      {/* Intestazione */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={function() { navigate('/clienti') }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className={disattivata ? 'text-2xl font-bold text-gray-500' : 'text-2xl font-bold text-gray-900'}>
                {customer.first_name} {customer.last_name}
              </h1>
              <span className={'px-3 py-1 rounded-full text-sm font-medium ' + (categoryColors[customer.category] || '')}>
                {categoryLabels[customer.category]}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              Cliente dal {new Date(customer.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {puoScrivere && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {!disattivata && (
              <button
                type="button"
                onClick={function() { setMessaggio(null); setApriFusione(true) }}
                className="flex items-center gap-2 border border-wine-300 text-wine-800 px-3 py-2.5 rounded-lg hover:bg-wine-50 transition-colors font-medium"
              >
                <Users size={16} />
                <span className="hidden sm:inline">Unisci</span>
              </button>
            )}
            <Link
              to={'/clienti/' + id + '/modifica'}
              className="flex items-center gap-2 bg-wine-700 text-white px-4 py-2.5 rounded-lg hover:bg-wine-800 transition-colors font-medium"
            >
              <Edit size={16} />
              <span className="hidden sm:inline">Modifica</span>
            </Link>
          </div>
        )}
      </div>

      {unitaDa && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          {'La scheda «' + unitaDa + '» è stata unita a questa: i suoi dati ora sono qui.'}
        </div>
      )}
      {messaggio && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">{messaggio}</div>
      )}
      {errore && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{errore}</div>
      )}
      {disattivata && (
        <div className="mb-4 p-3 rounded-lg bg-gray-100 border border-gray-300 text-sm text-gray-700 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2"><EyeOff size={16} /> Scheda disattivata: non compare nelle ricerche.</span>
          {puoScrivere && (
            <button
              type="button"
              onClick={function() { cambiaAttiva(true) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-wine-700 text-white rounded-lg font-medium hover:bg-wine-800"
            >
              <RotateCcw size={14} /> Riattiva
            </button>
          )}
        </div>
      )}

      <div className="space-y-6">
        {/* Contatti */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Contatti</h2>
          <div className="space-y-3">
            {customer.phone && (
              <a
                href={'tel:' + customer.phone}
                className="flex items-center gap-3 text-gray-700 hover:text-wine-700 transition-colors"
              >
                <Phone size={18} className="text-gray-400" />
                <span className="text-base">{customer.phone}</span>
              </a>
            )}
            {customer.email && (
              <a
                href={'mailto:' + customer.email}
                className="flex items-center gap-3 text-gray-700 hover:text-wine-700 transition-colors"
              >
                <Mail size={18} className="text-gray-400" />
                <span className="text-base">{customer.email}</span>
              </a>
            )}
            {(customer.address || customer.city) && (
              <div className="flex items-start gap-3 text-gray-700">
                <MapPin size={18} className="text-gray-400 mt-0.5" />
                <span className="text-base">
                  {[customer.address, customer.zip_code, customer.city, customer.province]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </div>
            )}
            {!customer.phone && !customer.email && (
              <p className="text-gray-400 italic">Nessun contatto registrato</p>
            )}
          </div>
        </div>

        {/* Allergeni */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={20} className={allergens.length > 0 ? 'text-red-500' : 'text-gray-300'} />
            <h2 className="text-lg font-semibold text-gray-900">Allergeni / Intolleranze</h2>
          </div>

          {allergens.length === 0 ? (
            <p className="text-gray-400 italic">Nessun allergene segnalato</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allergens.map(function(item, index) {
                return (
                  <AllergenBadge
                    key={index}
                    allergen={item.allergens}
                    severity={item.severity}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Note */}
        {customer.notes && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Note</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
          </div>
        )}

        {/* Storico (migrazione 67) */}
        <StoricoCliente key={id + '-' + versione} clienteId={id} />

        {/* Schede unite in questa (migrazione 68) */}
        <SchedeUnite key={'unite-' + id + '-' + versione} clienteId={id} onCambiato={ricarica} />

        {/* Consensi GDPR */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={20} className="text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Privacy (GDPR)</h2>
          </div>

          <div className="space-y-3">
            {Object.keys(consentLabels).map(function(type) {
              var label = consentLabels[type]
              var consent = null
              for (var i = 0; i < consents.length; i++) {
                if (consents[i].consent_type === type) { consent = consents[i]; break }
              }
              var granted = consent ? !!consent.granted : false

              return (
                <div key={type} className="flex items-center gap-3">
                  {granted ? (
                    <ShieldCheck size={18} className="text-green-500" />
                  ) : (
                    <ShieldX size={18} className="text-gray-300" />
                  )}
                  <span className={granted ? 'text-gray-700' : 'text-gray-400'}>
                    {label}
                  </span>
                  {granted && consent.granted_at && (
                    <span className="text-xs text-gray-400">
                      ({new Date(consent.granted_at).toLocaleDateString('it-IT')})
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Zona pericolosa: solo con Clienti = modifica */}
        {puoScrivere && (
          <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
            <h2 className="text-lg font-semibold text-red-700 mb-2">Zona Pericolosa</h2>
            <div className="space-y-4 text-sm text-gray-500">
              {!disattivata && (
                <div>
                  <p className="mb-2">
                    <b className="text-gray-700">Disattiva:</b> la scheda sparisce dalle ricerche ma resta com'è, con tutto il suo storico.
                    Si riattiva dalla scheda stessa (elenco clienti, «Mostra anche le disattivate»).
                  </p>
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-red-600 font-medium">Sei sicuro?</span>
                      <button
                        onClick={function() { cambiaAttiva(false) }}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                      >
                        Sì, disattiva
                      </button>
                      <button
                        onClick={function() { setShowDeleteConfirm(false) }}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                      >
                        Annulla
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={function() { setShowDeleteConfirm(true) }}
                      className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm"
                    >
                      <EyeOff size={16} />
                      <span>Disattiva Cliente</span>
                    </button>
                  )}
                </div>
              )}

              <div>
                <p className="mb-2">
                  <b className="text-gray-700">Elimina:</b> se la scheda non è usata da niente si cancella per sempre, con allergeni e
                  consensi privacy. Se è usata, prenotazioni ed eventi passano alla scheda che scegli. Serve la firma col PIN.
                </p>
                <button
                  type="button"
                  onClick={function() { setApriElimina(true) }}
                  className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm"
                >
                  <Trash2 size={16} />
                  <span>Elimina scheda…</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <FusioneClienti
        open={apriFusione}
        scheda={customer}
        onClose={function() { setApriFusione(false) }}
        onFatto={dopoFusione} />

      <EliminaCliente
        open={apriElimina}
        scheda={customer}
        onClose={function() { setApriElimina(false) }}
        onFatto={dopoEliminazione}
        onApriFusione={function() { setApriElimina(false); setApriFusione(true) }} />

      {/* Spazio in fondo per scroll su iPad */}
      <div className="h-8" />
    </div>
  )
}

export default CustomerDetail
