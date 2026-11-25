import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Plus, Phone, Mail, AlertTriangle, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { caricaABlocchi } from '../lib/caricaABlocchi'

// ============================================================
// ELENCO CLIENTI
// 25/11/2026 (migrazione 68, sessione «fusione ed eliminazione»):
//   * clienti e allergeni si caricano A BLOCCHI di 1.000
//     (lib/caricaABlocchi.js): oltre le 1.000 righe Supabase taglia in
//     silenzio, e le schede erano 865 e crescevano di ~8 al giorno;
//   * interruttore «Mostra anche le disattivate»: le disattivate
//     compaiono in grigio con la scritta «Disattivata»; dalla loro
//     scheda si riattivano (regola 48). Le LAPIDI delle fusioni
//     (merged_into valorizzato) non compaiono MAI;
//   * «Nuovo Cliente» solo a chi ha Clienti = modifica (la rotta
//     /clienti/nuovo lo chiedeva già: il pulsante portava a un rifiuto).
// Riscritto nella forma del progetto (var, niente funzioni freccia).
// Il filtro per categoria è un menù nativo: va bene, questa è una
// pagina e non una finestra modale.
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

function iniziali(c) {
  var a = (c.first_name || '').trim()
  var b = (c.last_name || '').trim()
  return (a ? a[0] : '') + (b ? b[0] : '')
}

function CustomerList() {
  var auth = useAuth()
  var puoScrivere = auth.canEdit('clienti')
  var [customers, setCustomers] = useState([])
  var [loading, setLoading] = useState(true)
  var [searchTerm, setSearchTerm] = useState('')
  var [categoryFilter, setCategoryFilter] = useState('all')
  var [mostraDisattivate, setMostraDisattivate] = useState(false)
  var navigate = useNavigate()

  useEffect(function() {
    loadCustomers()
  }, [mostraDisattivate])

  function loadCustomers() {
    setLoading(true)
    var conDisattivate = mostraDisattivate
    caricaABlocchi(function() {
      var q = supabase.from('customers').select('*')
      if (conDisattivate) {
        // attive + disattivate, mai le lapidi
        q = q.is('merged_into', null)
      } else {
        q = q.eq('is_active', true)
      }
      return q.order('last_name', { ascending: true }).order('id', { ascending: true })
    }).then(function(resClienti) {
      if (resClienti.error) throw resClienti.error
      return caricaABlocchi(function() {
        return supabase.from('customer_allergens')
          .select('id, customer_id, severity, allergen_id, allergens ( id, name, icon )')
          .order('id', { ascending: true })
      }).then(function(resAllergeni) {
        if (resAllergeni.error) throw resAllergeni.error
        var perCliente = {}
        var righe = resAllergeni.data || []
        for (var i = 0; i < righe.length; i++) {
          var a = righe[i]
          if (!perCliente[a.customer_id]) perCliente[a.customer_id] = []
          perCliente[a.customer_id].push(Object.assign({}, a.allergens, { severity: a.severity }))
        }
        var clienti = (resClienti.data || []).map(function(c) {
          return Object.assign({}, c, { allergens: perCliente[c.id] || [] })
        })
        setCustomers(clienti)
        setLoading(false)
      })
    }).catch(function(error) {
      console.error('Errore nel caricamento clienti:', error)
      setLoading(false)
      alert('Errore nel caricamento dei clienti. Riprova.')
    })
  }

  var cerca = searchTerm.toLowerCase()
  var filteredCustomers = customers.filter(function(customer) {
    var matchesSearch =
      cerca === '' ||
      (customer.first_name || '').toLowerCase().indexOf(cerca) !== -1 ||
      (customer.last_name || '').toLowerCase().indexOf(cerca) !== -1 ||
      (customer.phone && customer.phone.indexOf(searchTerm) !== -1) ||
      (customer.email && customer.email.toLowerCase().indexOf(cerca) !== -1)
    var matchesCategory = categoryFilter === 'all' || customer.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  var nAttive = 0
  for (var k = 0; k < customers.length; k++) {
    if (customers[k].is_active !== false) nAttive++
  }
  var nDisattivate = customers.length - nAttive

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-lg">Caricamento clienti...</div>
      </div>
    )
  }

  return (
    <div>
      {/* Intestazione */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clienti</h1>
          <p className="text-gray-500 mt-1">
            {nAttive} clienti registrati
            {mostraDisattivate && (' · ' + nDisattivate + ' disattivati')}
          </p>
        </div>
        {puoScrivere && (
          <Link
            to="/clienti/nuovo"
            className="inline-flex items-center gap-2 bg-wine-700 text-white px-5 py-3 rounded-xl hover:bg-wine-800 transition-colors font-medium shadow-sm"
          >
            <Plus size={20} />
            <span>Nuovo Cliente</span>
          </Link>
        )}
      </div>

      {/* Barra ricerca e filtri */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Cerca per nome, telefono o email..."
              value={searchTerm}
              onChange={function(e) { setSearchTerm(e.target.value) }}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 focus:border-transparent text-base"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={function(e) { setCategoryFilter(e.target.value) }}
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

        <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={mostraDisattivate}
            onChange={function(e) { setMostraDisattivate(e.target.checked) }}
            className="w-4 h-4"
          />
          Mostra anche le disattivate
        </label>
      </div>

      {/* Lista clienti */}
      {filteredCustomers.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Users className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 text-lg">
            {searchTerm || categoryFilter !== 'all'
              ? 'Nessun cliente trovato con questi criteri'
              : 'Nessun cliente registrato. Inizia aggiungendo il primo!'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCustomers.map(function(customer) {
            var disattivata = customer.is_active === false
            return (
              <div
                key={customer.id}
                onClick={function() { navigate('/clienti/' + customer.id) }}
                className={disattivata
                  ? 'bg-gray-50 rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-all cursor-pointer opacity-70'
                  : 'bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:border-wine-300 hover:shadow-md transition-all cursor-pointer active:bg-gray-50'}
              >
                <div className="flex items-center gap-4">
                  <div className={disattivata
                    ? 'w-12 h-12 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center font-bold text-lg flex-shrink-0'
                    : 'w-12 h-12 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center font-bold text-lg flex-shrink-0'}>
                    {iniziali(customer)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={disattivata ? 'font-semibold text-gray-500' : 'font-semibold text-gray-900'}>
                        {customer.last_name} {customer.first_name}
                      </h3>
                      {disattivata ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                          Disattivata
                        </span>
                      ) : (
                        <span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + (categoryColors[customer.category] || '')}>
                          {categoryLabels[customer.category]}
                        </span>
                      )}
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
                        {customer.allergens.map(function(allergen) {
                          return (
                            <span
                              key={allergen.id}
                              className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded"
                              title={allergen.name}
                            >
                              {allergen.icon} {allergen.name}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <ChevronRight size={20} className="text-gray-400 flex-shrink-0" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Necessario per l'icona quando la lista è vuota
function Users(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

export default CustomerList
