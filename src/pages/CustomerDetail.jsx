import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Edit, Trash2, Phone, Mail, MapPin, AlertTriangle, Shield, ShieldCheck, ShieldX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import AllergenBadge from '../components/AllergenBadge'

function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [allergens, setAllergens] = useState([])
  const [consents, setConsents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    loadCustomer()
  }, [id])

  async function loadCustomer() {
    setLoading(true)
    try {
      // Carica dati cliente
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single()

      if (customerError) throw customerError
      setCustomer(customerData)

      // Carica allergeni
      const { data: allergensData, error: allergensError } = await supabase
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

      if (allergensError) throw allergensError
      setAllergens(allergensData)

      // Carica consensi
      const { data: consentsData, error: consentsError } = await supabase
        .from('gdpr_consents')
        .select('*')
        .eq('customer_id', id)

      if (consentsError) throw consentsError
      setConsents(consentsData)

    } catch (error) {
      console.error('Errore:', error)
      alert('Cliente non trovato.')
      navigate('/clienti')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    try {
      // Disattiva il cliente (soft delete)
      const { error } = await supabase
        .from('customers')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      navigate('/clienti')
    } catch (error) {
      console.error('Errore eliminazione:', error)
      alert('Errore durante l\'eliminazione.')
    }
  }

  const categoryLabels = {
    standard: 'Standard',
    vip: 'VIP',
    press: 'Stampa',
    business: 'Business',
    hotel_guest: 'Ospite Hotel',
  }

  const categoryColors = {
    standard: 'bg-gray-100 text-gray-700',
    vip: 'bg-amber-100 text-amber-800',
    press: 'bg-purple-100 text-purple-800',
    business: 'bg-blue-100 text-blue-800',
    hotel_guest: 'bg-green-100 text-green-800',
  }

  const consentLabels = {
    data_processing: 'Trattamento dati personali',
    health_data: 'Dati sulla salute (allergeni)',
    marketing: 'Comunicazioni commerciali',
    profiling: 'Profilazione',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-lg">Caricamento...</div>
      </div>
    )
  }

  if (!customer) return null

  return (
    <div className="max-w-3xl mx-auto">
      {/* Intestazione */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/clienti')}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {customer.first_name} {customer.last_name}
              </h1>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${categoryColors[customer.category]}`}>
                {categoryLabels[customer.category]}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              Cliente dal {new Date(customer.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/clienti/${id}/modifica`}
            className="flex items-center gap-2 bg-wine-700 text-white px-4 py-2.5 rounded-lg hover:bg-wine-800 transition-colors font-medium"
          >
            <Edit size={16} />
            <span className="hidden sm:inline">Modifica</span>
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        {/* Contatti */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Contatti</h2>
          <div className="space-y-3">
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="flex items-center gap-3 text-gray-700 hover:text-wine-700 transition-colors"
              >
                <Phone size={18} className="text-gray-400" />
                <span className="text-base">{customer.phone}</span>
              </a>
            )}
            {customer.email && (
              <a
                href={`mailto:${customer.email}`}
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
              {allergens.map((item, index) => (
                <AllergenBadge
                  key={index}
                  allergen={item.allergens}
                  severity={item.severity}
                />
              ))}
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

        {/* Consensi GDPR */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={20} className="text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Privacy (GDPR)</h2>
          </div>

          <div className="space-y-3">
            {Object.entries(consentLabels).map(([type, label]) => {
              const consent = consents.find(c => c.consent_type === type)
              const granted = consent?.granted || false

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
                  {granted && consent?.granted_at && (
                    <span className="text-xs text-gray-400">
                      ({new Date(consent.granted_at).toLocaleDateString('it-IT')})
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Zona pericolosa: eliminazione */}
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-700 mb-2">Zona Pericolosa</h2>
          <p className="text-sm text-gray-500 mb-4">
            Il cliente verrà disattivato (non cancellato definitivamente, per conformità GDPR).
          </p>

          {showDeleteConfirm ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-600 font-medium">Sei sicuro?</span>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
              >
                Sì, disattiva
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              >
                Annulla
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm"
            >
              <Trash2 size={16} />
              <span>Disattiva Cliente</span>
            </button>
          )}
        </div>
      </div>

      {/* Spazio in fondo per scroll su iPad */}
      <div className="h-8" />
    </div>
  )
}

export default CustomerDetail
