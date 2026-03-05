import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Plus, Phone, Mail, AlertTriangle, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'

function CustomerList() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const navigate = useNavigate()

  useEffect(() => {
    loadCustomers()
  }, [])

  async function loadCustomers() {
    setLoading(true)
    try {
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .eq('is_active', true)
        .order('last_name', { ascending: true })

      if (customersError) throw customersError

      const { data: allergensData, error: allergensError } = await supabase
        .from('customer_allergens')
        .select(`
          customer_id,
          severity,
          allergen_id,
          allergens (
            id,
            name,
            icon
          )
        `)

      if (allergensError) throw allergensError

      const customersWithAllergens = customersData.map(customer => ({
        ...customer,
        allergens: allergensData
          .filter(a => a.customer_id === customer.id)
          .map(a => ({
            ...a.allergens,
            severity: a.severity
          }))
      }))

      setCustomers(customersWithAllergens)
    } catch (error) {
      console.error('Errore nel caricamento clienti:', error)
      alert('Errore nel caricamento dei clienti. Riprova.')
    } finally {
      setLoading(false)
    }
  }

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch =
      searchTerm === '' ||
      customer.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (customer.phone && customer.phone.includes(searchTerm)) ||
      (customer.email && customer.email.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesCategory =
      categoryFilter === 'all' || customer.category === categoryFilter

    return matchesSearch && matchesCategory
  })

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-lg">Caricamento clienti...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clienti</h1>
          <p className="text-gray-500 mt-1">{customers.length} clienti registrati</p>
        </div>
        <Link
          to="/clienti/nuovo"
          className="inline-flex items-center gap-2 bg-wine-700 text-white px-5 py-3 rounded-xl hover:bg-wine-800 transition-colors font-medium shadow-sm"
        >
          <Plus size={20} />
          <span>Nuovo Cliente</span>
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Cerca per nome, telefono o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 focus:border-transparent text-base"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white text-base"
          >
            <option value="all">Tutte le categorie</option>
            <option value="standard">Standard</option>
            <option value="vip">VIP</option>
            <option value="press">Stampa</option>
            <option value="business">Business</option>
            <option value="hotel_guest">Ospite Hotel</option>
          </select>
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500 text-lg">
            {searchTerm || categoryFilter !== 'all'
              ? 'Nessun cliente trovato con questi criteri'
              : 'Nessun cliente registrato. Inizia aggiungendo il primo!'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCustomers.map((customer) => (
            <div
              key={customer.id}
              onClick={() => navigate(`/clienti/${customer.id}`)}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:border-wine-300 hover:shadow-md transition-all cursor-pointer active:bg-gray-50"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center font-bold text-lg flex-shrink-0">
                  {customer.first_name[0]}{customer.last_name[0]}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">
                      {customer.last_name} {customer.first_name}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors[customer.category]}`}>
                      {categoryLabels[customer.category]}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                    {customer.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={14} />
                        {customer.phone}
                      </span>
                    )}
                    {customer.email && (
                      <span className="hidden sm:flex items-center gap-1">
                        <Mail size={14} />
                        {customer.email}
                      </span>
                    )}
                  </div>

                  {customer.allergens.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                      {customer.allergens.map((allergen) => (
                        <span
                          key={allergen.id}
                          className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded"
                          title={allergen.name}
                        >
                          {allergen.icon} {allergen.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <ChevronRight size={20} className="text-gray-400 flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CustomerList
