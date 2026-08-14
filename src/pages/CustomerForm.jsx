import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import AllergeniEditor, { validaAllergeni, salvaAllergeni, campiConsensoSalute } from '../components/AllergeniEditor'

function CustomerForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = Boolean(id)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [allergens, setAllergens] = useState([])

  // Dati del form
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

  // Allergeni selezionati: { allergen_id: { selected: bool, severity: string, notes: string } }
  const [selectedAllergens, setSelectedAllergens] = useState({})

  // Consensi GDPR
  const [consents, setConsents] = useState({
    data_processing: false,
    health_data: false,
    marketing: false,
  })

  // Canali marketing selezionati
  const [canaliMarketing, setCanaliMarketing] = useState({
    email: false,
    sms: false,
    telefono: false,
    whatsapp: false,
  })

  // Allergie/intolleranze in testo libero (aggiuntive rispetto agli allergeni strutturati)
  const [allergieLibere, setAllergieLibere] = useState('')

  // Note interne (solo staff)
  const [noteInterne, setNoteInterne] = useState('')

  // Carica la lista allergeni al mount
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
      // Carica dati cliente
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

      // Carica campi aggiuntivi
      setAllergieLibere(customer.allergie_cliente || '')
      setNoteInterne(customer.note_interne || '')
      if (customer.canali_marketing && Array.isArray(customer.canali_marketing)) {
        const canali = { email: false, sms: false, telefono: false, whatsapp: false }
        customer.canali_marketing.forEach(c => { if (canali.hasOwnProperty(c)) canali[c] = true })
        setCanaliMarketing(canali)
      }

      // Carica allergeni del cliente
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

      // Carica consensi
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

  async function handleSubmit(e) {
    e.preventDefault()

    // Validazione base
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

    // Regola sul consenso sanitario: UNA copia sola, in AllergeniEditor.
    const erroreAllergeni = validaAllergeni(selectedAllergens, consents.health_data)
    if (erroreAllergeni) {
      alert(erroreAllergeni)
      return
    }

    setSaving(true)
    try {
      // Prepara i dati (campi vuoti → null per evitare errori di unicità)
      const canaliSelezionati = Object.entries(canaliMarketing)
        .filter(([_, v]) => v)
        .map(([k]) => k)

      const customerData = {
        ...formData,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        allergie_cliente: allergieLibere.trim() || null,
        note_interne: noteInterne.trim() || null,
        canali_marketing: canaliSelezionati.length > 0 ? canaliSelezionati : null,
        // Aggiorna i flag consenso nella tabella customers per accesso rapido
        consenso_privacy: consents.data_processing,
        consenso_privacy_data: consents.data_processing ? new Date().toISOString() : null,
        ...campiConsensoSalute(consents.health_data),
        consenso_marketing: consents.marketing,
        consenso_marketing_data: consents.marketing ? new Date().toISOString() : null,
      }

      let customerId = id

      if (isEditing) {
        // Aggiorna cliente esistente
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
        // Crea nuovo cliente
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

      // Scrittura allergeni: UNA copia sola, in AllergeniEditor.
      const esitoAllergeni = await salvaAllergeni(supabase, customerId, selectedAllergens)
      if (esitoAllergeni.error) throw esitoAllergeni.error

      // Gestione consensi GDPR
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
      {/* Intestazione */}
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
        {/* Dati anagrafici */}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefono
              </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categoria
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note
            </label>
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

        {/* Indirizzo (collassabile) */}
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

        {/* Allergeni: componente condiviso con la modale di ReservationForm */}
        <AllergeniEditor
          allergens={allergens}
          selected={selectedAllergens}
          onSelectedChange={setSelectedAllergens}
          testoLibero={allergieLibere}
          onTestoLiberoChange={setAllergieLibere}
          consensoSalute={consents.health_data}
        />

        {/* Consensi GDPR */}
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

            {/* Canali marketing — visibili solo se marketing spuntato */}
            {consents.marketing && (
              <div className="ml-8 mt-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-800 mb-3">Canali preferiti per le comunicazioni:</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { key: 'email', label: '✉️ Email' },
                    { key: 'sms', label: '💬 SMS' },
                    { key: 'telefono', label: '📞 Telefono' },
                    { key: 'whatsapp', label: '📱 WhatsApp' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={canaliMarketing[key]}
                        onChange={(e) => setCanaliMarketing(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Note interne staff */}
        <div className="bg-gray-50 rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Note interne</h2>
          <p className="text-sm text-gray-500 mb-3">
            Visibili solo al personale. Non condivise con il cliente.
          </p>
          <textarea
            value={noteInterne}
            onChange={(e) => setNoteInterne(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base bg-white"
            placeholder="es. cliente difficile, preferisce tavolo finestra, festeggia compleanno ogni anno..."
          />
        </div>

        {/* Pulsanti azione */}
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
