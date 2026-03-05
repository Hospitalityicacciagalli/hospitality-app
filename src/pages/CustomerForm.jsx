import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'

function CustomerForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = Boolean(id)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [allergens, setAllergens] = useState([])

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    province: '',
    zip_code: '',
    country: 'Italia',
    notes: '',
    category: 'standard',
    source: 'manual',
  })

  const [selectedAllergens, setSelectedAllergens] = useState({})

  const [consents, setConsents] = useState({
    data_processing: false,
    health_data: false,
    marketing: false,
  })

  useEffect(() => {
    loadAllergens()
    if (isEditing) {
      loadCustomer()
    }
  }, [id])

  async function loadAllergens() {
    const { data, error } = await supabase
      .from('allergens')
      .select('*')
      .order('id')

    if (error) {
      console.error('Errore caricamento allergeni:', error)
      return
    }
    setAllergens(data)
  }

  async function loadCustomer() {
    setLoading(true)
    try {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single()

      if (customerError) throw customerError

      setFormData({
        first_name: customer.first_name || '',
        last_name: customer.last_name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        address: customer.address || '',
        city: customer.city || '',
        province: customer.province || '',
        zip_code: customer.zip_code || '',
        country: customer.country || 'Italia',
        notes: customer.notes || '',
        category: customer.category || 'standard',
        source: customer.source || 'manual',
      })

      const { data: customerAllergens, error: allergensError } = await supabase
        .from('customer_allergens')
        .select('*')
        .eq('customer_id', id)

      if (allergensError) throw allergensError

      const selected = {}
      customerAllergens.forEach(ca => {
        selected[ca.allergen_id] = {
          selected: true,
          severity: ca.severity,
          notes: ca.notes || '',
        }
      })
      setSelectedAllergens(selected)

      const { data: gdprData, error: gdprError } = await supabase
        .from('gdpr_consents')
        .select('*')
        .eq('customer_id', id)

      if (gdprError) throw gdprError

      const loadedConsents = { data_processing: false, health_data: false, marketing: false }
      gdprData.forEach(c => {
        if (loadedConsents.hasOwnProperty(c.consent_type)) {
          loadedConsents[c.consent_type] = c.granted
        }
      })
      setConsents(loadedConsents)

    } catch (error) {
      console.error('Errore caricamento cliente:', error)
      alert('Errore nel caricamento del cliente.')
      navigate('/clienti')
    } finally {
      setLoading(false)
    }
  }

  function handleInputChange(e) {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  function toggleAllergen(allergenId) {
    setSelectedAllergens(prev => {
      const current = prev[allergenId]
      if (current && current.selected) {
        const updated = { ...prev }
        delete updated[allergenId]
        return updated
      } else {
        return {
          ...prev,
          [allergenId]: { selected: true, severity: 'allergy', notes: '' }
        }
      }
    })
  }

  function updateAllergenSeverity(allergenId, severity) {
    setSelectedAllergens(prev => ({
      ...prev,
      [allergenId]: { ...prev[allergenId], severity }
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      alert('Nome e cognome sono obbligatori.')
      return
    }

    if (!formData.phone && !formData.email) {
      alert('Inserisci almeno un telefono o una email per identificare il cliente.')
      return
    }

    if (!consents.data_processing) {
      alert('Il consenso al trattamento dati è obbligatorio per registrare il cliente.')
      return
    }

    const hasAllergens = Object.keys(selectedAllergens).length > 0
    if (hasAllergens && !consents.health_data) {
      alert('Per registrare gli allergeni è necessario il consenso al trattamento dei dati sulla salute.')
      return
    }

    setSaving(true)
    try {
      const customerData = {
        ...formData,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
      }

      let customerId = id

      if (isEditing) {
        const { error } = await supabase
          .from('customers')
          .update(customerData)
          .eq('id', id)

        if (error) {
          if (error.code === '23505') {
            alert('Esiste già un cliente con questo telefono o email.')
            setSaving(false)
            return
          }
          throw error
        }
      } else {
        const { data, error } = await supabase
          .from('customers')
          .insert(customerData)
          .select()
          .single()

        if (error) {
          if (error.code === '23505') {
            alert('Esiste già un cliente con questo telefono o email.')
            setSaving(false)
            return
          }
          throw error
        }
        customerId = data.id
      }

      await supabase
        .from('customer_allergens')
        .delete()
        .eq('customer_id', customerId)

      const allergenRecords = Object.entries(selectedAllergens)
        .filter(([_, value]) => value.selected)
        .map(([allergenId, value]) => ({
          customer_id: customerId,
          allergen_id: parseInt(allergenId),
          severity: value.severity,
          notes: value.notes || null,
        }))

      if (allergenRecords.length > 0) {
        const { error: allergenError } = await supabase
          .from('customer_allergens')
          .insert(allergenRecords)

        if (allergenError) throw allergenError
      }

      for (const [consentType, granted] of Object.entries(consents)) {
        const { error: consentError } = await supabase
          .from('gdpr_consents')
          .upsert(
            {
              customer_id: customerId,
              consent_type: consentType,
              granted,
              granted_at: granted ? new Date().toISOString() : null,
              method: 'digital',
            },
            { onConflict: 'customer_id,consent_type' }
          )

        if (consentError) throw consentError
      }

      navigate(`/clienti/${customerId}`)
    } catch (error) {
      console.error('Errore salvataggio:', error)
      alert('Errore nel salvataggio. Riprova.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-lg">Caricamento...</div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditing ? 'Modifica Cliente' : 'Nuovo Cliente'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Dati Anagrafici</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                placeholder="Mario"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cognome <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                placeholder="Rossi"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                placeholder="+39 333 1234567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                placeholder="mario.rossi@email.com"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              className="w-full sm:w-auto px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white text-base"
            >
              <option value="standard">Standard</option>
              <option value="vip">VIP</option>
              <option value="press">Stampa</option>
              <option value="business">Business</option>
              <option value="hotel_guest">Ospite Hotel</option>
            </select>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
              placeholder="Note libere sul cliente (preferenze, occasioni speciali, ecc.)"
            />
          </div>
        </div>

        <details className="bg-white rounded-xl shadow-sm border border-gray-200">
          <summary className="p-6 cursor-pointer text-lg font-semibold text-gray-900 hover:text-wine-700">
            Indirizzo (opzionale)
          </summary>
          <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                placeholder="Via Roma 1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Città</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
              <input
                type="text"
                name="province"
                value={formData.province}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                maxLength={2}
                placeholder="CE"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CAP</label>
              <input
                type="text"
                name="zip_code"
                value={formData.zip_code}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                maxLength={5}
              />
            </div>
          </div>
        </details>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={20} className="text-orange-500" />
            <h2 className="text-lg font-semibold text-gray-900">Allergeni / Intolleranze</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Seleziona gli allergeni che il cliente deve evitare (Reg. UE 1169/2011)
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {allergens.map((allergen) => {
              const isSelected = selectedAllergens[allergen.id]?.selected
              return (
                <div
                  key={allergen.id}
                  className={`border rounded-lg p-3 transition-all ${
                    isSelected
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected || false}
                      onChange={() => toggleAllergen(allergen.id)}
                      className="w-5 h-5 rounded border-gray-300 text-wine-600 focus:ring-wine-500"
                    />
                    <span className="text-xl">{allergen.icon}</span>
                    <span className="font-medium text-gray-900">{allergen.name}</span>
                  </label>

                  {isSelected && (
                    <div className="mt-2 ml-8">
                      <select
                        value={selectedAllergens[allergen.id]?.severity || 'allergy'}
                        onChange={(e) => updateAllergenSeverity(allergen.id, e.target.value)}
                        className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-wine-500"
                      >
                        <option value="allergy">Allergia</option>
                        <option value="intolerance">Intolleranza</option>
                        <option value="preference">Preferenza alimentare</option>
                      </select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Consensi Privacy (GDPR)</h2>

          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consents.data_processing}
                onChange={(e) => setConsents(prev => ({ ...prev, data_processing: e.target.checked }))}
                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-wine-600 focus:ring-wine-500"
              />
              <div>
                <span className="font-medium text-gray-900">
                  Trattamento dati personali <span className="text-red-500">*</span>
                </span>
                <p className="text-sm text-gray-500">
                  Consenso al trattamento dei dati personali ai sensi del GDPR (obbligatorio)
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consents.health_data}
                onChange={(e) => setConsents(prev => ({ ...prev, health_data: e.target.checked }))}
                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-wine-600 focus:ring-wine-500"
              />
              <div>
                <span className="font-medium text-gray-900">
                  Dati sulla salute {Object.keys(selectedAllergens).length > 0 && <span className="text-red-500">*</span>}
                </span>
                <p className="text-sm text-gray-500">
                  Consenso al trattamento dei dati relativi ad allergie e intolleranze (art. 9 GDPR)
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consents.marketing}
                onChange={(e) => setConsents(prev => ({ ...prev, marketing: e.target.checked }))}
                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-wine-600 focus:ring-wine-500"
              />
              <div>
                <span className="font-medium text-gray-900">Comunicazioni commerciali</span>
                <p className="text-sm text-gray-500">
                  Consenso all'invio di comunicazioni promozionali e newsletter (facoltativo)
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pb-8">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-wine-700 text-white px-6 py-4 rounded-xl hover:bg-wine-800 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-base"
          >
            <Save size={20} />
            <span>{saving ? 'Salvataggio...' : (isEditing ? 'Salva Modifiche' : 'Registra Cliente')}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-4 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium text-gray-700 text-base"
          >
            Annulla
          </button>
        </div>
      </form>
    </div>
  )
}

export default CustomerForm
