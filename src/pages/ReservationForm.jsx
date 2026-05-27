@ -50,14 +50,12 @@ function ReservationForm() {
  var [loading, setLoading] = useState(false)
  var [saving, setSaving] = useState(false)

  // Ricerca cliente
  var [customerSearch, setCustomerSearch] = useState('')
  var [searchResults, setSearchResults] = useState([])
  var [selectedCustomer, setSelectedCustomer] = useState(null)
  var [customerAllergens, setCustomerAllergens] = useState([])
  var [showSearch, setShowSearch] = useState(true)

  // Lista completa clienti
  var [showListaClienti, setShowListaClienti] = useState(false)
  var [listaClienti, setListaClienti] = useState([])
  var [loadingLista, setLoadingLista] = useState(false)
@ -67,7 +65,6 @@ function ReservationForm() {
  var [selectedHour, setSelectedHour] = useState('')
  var [selectedMinute, setSelectedMinute] = useState('00')

  // Form rapido cliente
  var [showQuickCustomer, setShowQuickCustomer] = useState(false)
  var [quickForm, setQuickForm] = useState({ first_name: '', last_name: '', phone: '', email: '', category: 'standard', notes: '' })
  var [quickLoading, setQuickLoading] = useState(false)
@ -82,12 +79,14 @@ function ReservationForm() {
    adults_count: 2,
    children_count: 0,
    table_info: '',
    allergie_prenotazione: '',
    notes: '',
    special_requests: '',
    source: 'manual'
  })

  var totalGuests = formData.adults_count + formData.children_count
  var hasAllergiePrenotazione = formData.allergie_prenotazione && formData.allergie_prenotazione.trim().length > 0

  useEffect(function() {
    if (isEditing) loadReservation()
@ -97,7 +96,6 @@ function ReservationForm() {
    if (formData.reservation_date && formData.meal_type) checkAvailability()
  }, [formData.reservation_date, formData.meal_type, totalGuests])

  // Rileva turno dall'orario
  useEffect(function() {
    if (selectedHour !== '') {
      var h = parseInt(selectedHour)
@ -126,6 +124,7 @@ function ReservationForm() {
          adults_count: res.adults_count || res.guests_count,
          children_count: res.children_count || 0,
          table_info: res.table_info || '',
          allergie_prenotazione: res.allergie_prenotazione || '',
          notes: res.notes || '',
          special_requests: res.special_requests || '',
          source: res.source || 'manual'
@ -246,7 +245,7 @@ function ReservationForm() {
        }
        selectCustomer(result.data)
        setShowQuickCustomer(false)
        setListaClienti([]) // forza ricarica lista la prossima volta
        setListaClienti([])
      })
  }

@ -262,6 +261,8 @@ function ReservationForm() {
    var requestedTime = null
    if (selectedHour !== '') requestedTime = pad(parseInt(selectedHour)) + ':' + selectedMinute + ':00'

    var haAllergeni = customerAllergens.length > 0 || hasAllergiePrenotazione

    var reservationData = {
      customer_id: selectedCustomer.id,
      reservation_date: formData.reservation_date,
@ -271,10 +272,11 @@ function ReservationForm() {
      adults_count: formData.adults_count,
      children_count: formData.children_count,
      table_info: formData.table_info || null,
      allergie_prenotazione: formData.allergie_prenotazione.trim() || null,
      notes: formData.notes || null,
      special_requests: formData.special_requests || null,
      source: formData.source,
      has_allergen_alerts: customerAllergens.length > 0
      has_allergen_alerts: haAllergeni
    }

    var promise = isEditing
@ -288,13 +290,14 @@ function ReservationForm() {
    })
  }

  // Filtra lista clienti
  var clientiFiltrati = listaClienti.filter(function(c) {
    if (!filtroLista) return true
    var f = filtroLista.toLowerCase()
    return (c.last_name + ' ' + c.first_name + ' ' + (c.phone || '')).toLowerCase().indexOf(f) !== -1
  })

  var mealLabel = formData.meal_type === 'lunch' ? 'Pranzo' : 'Cena'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
@ -303,8 +306,6 @@ function ReservationForm() {
    )
  }

  var mealLabel = formData.meal_type === 'lunch' ? 'Pranzo' : 'Cena'

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-4 mb-6">
@ -353,7 +354,7 @@ function ReservationForm() {
                <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-red-600" />
                    <span className="text-sm font-medium text-red-800">Attenzione: allergeni segnalati</span>
                    <span className="text-sm font-medium text-red-800">Allergeni registrati sul profilo cliente</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {customerAllergens.map(function(ca, idx) {
@ -365,7 +366,6 @@ function ReservationForm() {
            </div>
          ) : (
            <div>
              {/* Ricerca */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
@ -378,7 +378,6 @@ function ReservationForm() {
                />
              </div>

              {/* Risultati ricerca */}
              {searchResults.length > 0 && (
                <div className="mb-3 border border-gray-200 rounded-lg overflow-hidden">
                  {searchResults.map(function(customer) {
@ -403,7 +402,6 @@ function ReservationForm() {
                </div>
              )}

              {/* Pulsanti azioni */}
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={apriListaClienti}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 font-medium">
@ -521,6 +519,30 @@ function ReservationForm() {
            </div>
          )}

          {/* Allergeni prenotazione */}
          <div className="mt-4">
            <label className={"block text-sm font-medium mb-1 " + (hasAllergiePrenotazione ? 'text-red-600' : 'text-gray-700')}>
              {hasAllergiePrenotazione
                ? <span className="flex items-center gap-1.5"><AlertTriangle size={15} className="text-red-500" />Allergeni / Intolleranze segnalati per questa prenotazione</span>
                : 'Allergeni / Intolleranze per questa prenotazione'}
            </label>
            <textarea
              name="allergie_prenotazione"
              value={formData.allergie_prenotazione}
              onChange={handleInputChange}
              rows={2}
              placeholder="Es. un ospite celiaco, intolleranza al lattosio, allergia ai crostacei..."
              className={"w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 text-base transition-colors " + (hasAllergiePrenotazione ? 'border-red-400 bg-red-50 focus:ring-red-400' : 'border-gray-200 focus:ring-wine-500')}
            />
            {hasAllergiePrenotazione && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} />
                Questa prenotazione verra segnalata con alert allergeni
              </p>
            )}
          </div>

          {/* Note */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea name="notes" value={formData.notes} onChange={handleInputChange} rows={2}
@ -528,6 +550,7 @@ function ReservationForm() {
              placeholder="Note interne sulla prenotazione, preferenze posto, richieste particolari..." />
          </div>

          {/* Richieste speciali */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Richieste speciali</label>
            <textarea name="special_requests" value={formData.special_requests} onChange={handleInputChange} rows={2}
@ -561,14 +584,11 @@ function ReservationForm() {
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <input
                type="text"
                placeholder="Filtra per nome o telefono..."
              <input type="text" placeholder="Filtra per nome o telefono..."
                value={filtroLista}
                onChange={function(e) { setFiltroLista(e.target.value) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                autoFocus
              />
                autoFocus />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingLista ? (
@ -622,7 +642,8 @@ function ReservationForm() {
                <h2 className="text-lg font-semibold text-gray-900">Nuovo cliente</h2>
                <p className="text-xs text-gray-400 mt-0.5">Il cliente verra creato e selezionato automaticamente</p>
              </div>
              <button type="button" onClick={function() { setShowQuickCustomer(false) }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
              <button type="button" onClick={function() { setShowQuickCustomer(false) }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleQuickCustomerSubmit} className="p-6 space-y-4">
              {quickError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{quickError}</div>}
