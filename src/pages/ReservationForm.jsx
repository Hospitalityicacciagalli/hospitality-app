import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

export default function ReservationForm() {
  var { id } = useParams();
  var [searchParams] = useSearchParams();
  var navigate = useNavigate();
  var { canWrite } = useAuth();

  var isEdit = Boolean(id);

  // --- Stato form prenotazione ---
  var [form, setForm] = useState({
    customer_id: '',
    reservation_date: searchParams.get('date') || new Date().toISOString().split('T')[0],
    meal_type: '',
    requested_time: '',
    guests_count: 2,
    adults_count: 2,
    children_count: 0,
    status: 'confirmed',
    table_info: '',
    notes: '',
    special_requests: '',
    source: 'manual'
  });

  // --- Stato ricerca cliente ---
  var [customerSearch, setCustomerSearch] = useState('');
  var [customerResults, setCustomerResults] = useState([]);
  var [selectedCustomer, setSelectedCustomer] = useState(null);
  var [searchingCustomer, setSearchingCustomer] = useState(false);

  // --- Stato turni da config_options ---
  var [mealTypes, setMealTypes] = useState([]);
  var [loadingMealTypes, setLoadingMealTypes] = useState(true);

  // --- Stato disponibilita ---
  var [availability, setAvailability] = useState(null);
  var [checkingAvailability, setCheckingAvailability] = useState(false);

  // --- Stato salvataggio ---
  var [loading, setLoading] = useState(false);
  var [error, setError] = useState(null);
  var [initialLoading, setInitialLoading] = useState(isEdit);

  // --- Stato modale cliente rapido ---
  var [showQuickCustomer, setShowQuickCustomer] = useState(false);
  var [quickForm, setQuickForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    category: 'standard',
    notes: ''
  });
  var [quickLoading, setQuickLoading] = useState(false);
  var [quickError, setQuickError] = useState(null);

  var statusOptions = [
    { value: 'confirmed', label: 'Confermata' },
    { value: 'arrived', label: 'Arrivato' },
    { value: 'seated', label: 'A tavola' },
    { value: 'completed', label: 'Completata' },
    { value: 'cancelled', label: 'Cancellata' },
    { value: 'no_show', label: 'No show' }
  ];

  var sourceOptions = [
    { value: 'manual', label: 'Manuale' },
    { value: 'phone', label: 'Telefono' },
    { value: 'email', label: 'Email' },
    { value: 'website', label: 'Sito web' },
    { value: 'hotel_in_cloud', label: 'Hotel in Cloud' }
  ];

  var categoryOptions = [
    { value: 'standard', label: 'Standard' },
    { value: 'vip', label: 'VIP' },
    { value: 'press', label: 'Press' },
    { value: 'business', label: 'Business' },
    { value: 'hotel_guest', label: 'Ospite hotel' }
  ];

  // --- Carica turni da config_options ---
  useEffect(function() {
    supabase
      .from('config_options')
      .select('value, label, color')
      .eq('category', 'meal_type')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(function(result) {
        setLoadingMealTypes(false);
        if (!result.error && result.data && result.data.length > 0) {
          setMealTypes(result.data);
        } else {
          // Fallback se config_options non ha meal_type
          setMealTypes([
            { value: 'lunch', label: 'Pranzo' },
            { value: 'dinner', label: 'Cena' }
          ]);
        }
      });
  }, []);

  // --- Carica prenotazione esistente in modifica ---
  useEffect(function() {
    if (!isEdit) return;
    supabase
      .from('reservations')
      .select('*, customers(*)')
      .eq('id', id)
      .single()
      .then(function(result) {
        setInitialLoading(false);
        if (result.error) {
          setError('Errore caricamento prenotazione: ' + result.error.message);
          return;
        }
        var r = result.data;
        setForm({
          customer_id: r.customer_id || '',
          reservation_date: r.reservation_date || '',
          meal_type: r.meal_type || '',
          requested_time: r.requested_time || '',
          guests_count: r.guests_count || 2,
          adults_count: r.adults_count || 2,
          children_count: r.children_count || 0,
          status: r.status || 'confirmed',
          table_info: r.table_info || '',
          notes: r.notes || '',
          special_requests: r.special_requests || '',
          source: r.source || 'manual'
        });
        if (r.customers) {
          setSelectedCustomer(r.customers);
          setCustomerSearch(r.customers.first_name + ' ' + r.customers.last_name);
        }
      });
  }, [id, isEdit]);

  // --- Rilevamento automatico turno dall'orario ---
  function detectMealTypeFromTime(timeStr) {
    if (!timeStr) return '';
    var parts = timeStr.split(':');
    var hours = parseInt(parts[0], 10);
    var minutes = parseInt(parts[1] || '0', 10);
    var totalMinutes = hours * 60 + minutes;

    // Mappa turni noti agli intervalli
    var timeRanges = {
      breakfast: { from: 0,    to: 659  }, // < 11:00
      lunch:     { from: 660,  to: 959  }, // 11:00 - 15:59
      aperitivo: { from: 960,  to: 1169 }, // 16:00 - 19:29
      dinner:    { from: 1170, to: 1439 }  // >= 19:30
    };

    // Cerca prima nei turni attivi caricati da config_options
    var detected = '';
    var rangeKeys = Object.keys(timeRanges);
    for (var i = 0; i < rangeKeys.length; i++) {
      var key = rangeKeys[i];
      var range = timeRanges[key];
      if (totalMinutes >= range.from && totalMinutes <= range.to) {
        // Verifica che questo turno sia disponibile in config_options
        var found = mealTypes.find(function(m) { return m.value === key; });
        if (found) {
          detected = key;
          break;
        }
      }
    }
    return detected;
  }

  // --- Aggiorna orario e rileva turno automaticamente ---
  function handleTimeChange(timeValue) {
    var detected = detectMealTypeFromTime(timeValue);
    setForm(function(prev) {
      return Object.assign({}, prev, {
        requested_time: timeValue,
        meal_type: detected || prev.meal_type
      });
    });
  }

  // --- Controllo disponibilita coperti ---
  function checkAvailability(date, mealType, guestsCount, reservationId) {
    if (!date || !mealType || !guestsCount) return;
    setCheckingAvailability(true);

    supabase
      .from('restaurant_settings')
      .select('*')
      .single()
      .then(function(settingsResult) {
        if (settingsResult.error) {
          setCheckingAvailability(false);
          return;
        }
        var settings = settingsResult.data;
        var maxCovers = mealType === 'lunch' ? settings.max_covers_lunch : settings.max_covers_dinner;

        return supabase
          .from('reservations')
          .select('guests_count')
          .eq('reservation_date', date)
          .eq('meal_type', mealType)
          .not('status', 'in', '(cancelled,no_show)')
          .then(function(resResult) {
            setCheckingAvailability(false);
            if (resResult.error) return;

            var totalBooked = 0;
            resResult.data.forEach(function(r) {
              // In modifica, escludi la prenotazione corrente
              totalBooked += r.guests_count || 0;
            });

            // In modifica togli i coperti della prenotazione attuale
            if (isEdit) {
              // Approssimazione: verra ricalcolato al salvataggio
            }

            setAvailability({
              maxCovers: maxCovers,
              booked: totalBooked,
              remaining: maxCovers - totalBooked,
              requested: parseInt(guestsCount, 10)
            });
          });
      });
  }

  // Controlla disponibilita quando cambiano data, turno o coperti
  useEffect(function() {
    if (form.reservation_date && form.meal_type && form.guests_count) {
      checkAvailability(form.reservation_date, form.meal_type, form.guests_count, id);
    }
  }, [form.reservation_date, form.meal_type, form.guests_count]);

  // --- Ricerca cliente ---
  useEffect(function() {
    if (!customerSearch || customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }
    // Non ricercare se il testo corrisponde al cliente già selezionato
    if (selectedCustomer) {
      var fullName = selectedCustomer.first_name + ' ' + selectedCustomer.last_name;
      if (customerSearch === fullName) return;
    }

    setSearchingCustomer(true);
    var searchLower = customerSearch.toLowerCase();

    supabase
      .from('customers')
      .select('id, first_name, last_name, phone, email, category')
      .eq('is_active', true)
      .or('first_name.ilike.%' + customerSearch + '%,last_name.ilike.%' + customerSearch + '%,phone.ilike.%' + customerSearch + '%')
      .limit(8)
      .then(function(result) {
        setSearchingCustomer(false);
        if (!result.error) {
          setCustomerResults(result.data || []);
        }
      });
  }, [customerSearch]);

  function selectCustomer(customer) {
    setSelectedCustomer(customer);
    setForm(function(prev) { return Object.assign({}, prev, { customer_id: customer.id }); });
    setCustomerSearch(customer.first_name + ' ' + customer.last_name);
    setCustomerResults([]);
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setForm(function(prev) { return Object.assign({}, prev, { customer_id: '' }); });
    setCustomerSearch('');
    setCustomerResults([]);
  }

  // --- Modale cliente rapido ---
  function openQuickCustomer() {
    setQuickForm({
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      category: 'standard',
      notes: ''
    });
    setQuickError(null);
    setShowQuickCustomer(true);
  }

  function handleQuickCustomerSubmit(e) {
    e.preventDefault();
    setQuickError(null);

    if (!quickForm.first_name.trim() || !quickForm.last_name.trim()) {
      setQuickError('Nome e Cognome sono obbligatori.');
      return;
    }

    setQuickLoading(true);

    var newCustomer = {
      first_name: quickForm.first_name.trim(),
      last_name: quickForm.last_name.trim(),
      phone: quickForm.phone.trim() || null,
      email: quickForm.email.trim() || null,
      category: quickForm.category,
      notes: quickForm.notes.trim() || null,
      is_active: true,
      source: 'manual'
    };

    supabase
      .from('customers')
      .insert(newCustomer)
      .select()
      .single()
      .then(function(result) {
        setQuickLoading(false);
        if (result.error) {
          if (result.error.code === '23505') {
            setQuickError('Esiste già un cliente con questo telefono o email. Cerca il cliente nella lista.');
          } else {
            setQuickError('Errore creazione cliente: ' + result.error.message);
          }
          return;
        }
        // Cliente creato: selezionalo automaticamente e chiudi la modale
        selectCustomer(result.data);
        setShowQuickCustomer(false);
      });
  }

  // --- Salva prenotazione ---
  function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!form.customer_id) {
      setError('Seleziona un cliente prima di salvare.');
      return;
    }
    if (!form.reservation_date) {
      setError('Inserisci la data della prenotazione.');
      return;
    }
    if (!form.meal_type) {
      setError('Seleziona il turno.');
      return;
    }

    setLoading(true);

    var payload = {
      customer_id: form.customer_id,
      reservation_date: form.reservation_date,
      meal_type: form.meal_type,
      requested_time: form.requested_time || null,
      guests_count: parseInt(form.guests_count, 10) || 2,
      adults_count: parseInt(form.adults_count, 10) || 2,
      children_count: parseInt(form.children_count, 10) || 0,
      status: form.status,
      table_info: form.table_info || null,
      notes: form.notes || null,
      special_requests: form.special_requests || null,
      source: form.source
    };

    var operation;
    if (isEdit) {
      operation = supabase.from('reservations').update(payload).eq('id', id);
    } else {
      operation = supabase.from('reservations').insert(payload);
    }

    operation.then(function(result) {
      setLoading(false);
      if (result.error) {
        setError('Errore salvataggio: ' + result.error.message);
      } else {
        navigate('/prenotazioni');
      }
    });
  }

  function updateGuestCounts(field, value) {
    var intVal = parseInt(value, 10) || 0;
    if (intVal < 0) intVal = 0;

    var newForm = Object.assign({}, form, { [field]: intVal });

    if (field === 'adults_count' || field === 'children_count') {
      newForm.guests_count = newForm.adults_count + newForm.children_count;
    } else if (field === 'guests_count') {
      newForm.adults_count = intVal;
      newForm.children_count = 0;
    }

    setForm(newForm);
  }

  if (initialLoading) {
    return <div className="p-6 text-center text-gray-400">Caricamento...</div>;
  }

  if (!canWrite('reservations')) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          Non hai i permessi per modificare le prenotazioni.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">

      <div className="flex items-center gap-3 mb-6">
        <button onClick={function() { navigate(-1); }} className="text-gray-400 hover:text-gray-600 text-sm">← Indietro</button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? 'Modifica prenotazione' : 'Nuova prenotazione'}
        </h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* SEZIONE CLIENTE */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Cliente</h2>

          {selectedCustomer ? (
            <div className="flex items-center justify-between p-3 bg-wine-50 border border-wine-200 rounded-lg">
              <div>
                <p className="font-medium text-gray-900 text-sm">
                  {selectedCustomer.first_name + ' ' + selectedCustomer.last_name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedCustomer.phone || ''}{selectedCustomer.phone && selectedCustomer.email ? ' · ' : ''}{selectedCustomer.email || ''}
                </p>
              </div>
              <button
                type="button"
                onClick={clearCustomer}
                className="text-xs text-gray-400 hover:text-gray-600 ml-4"
              >
                Cambia
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                value={customerSearch}
                onChange={function(e) { setCustomerSearch(e.target.value); setSelectedCustomer(null); }}
                placeholder="Cerca per nome, cognome o telefono..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
              />
              {searchingCustomer && (
                <p className="text-xs text-gray-400 mt-1">Ricerca in corso...</p>
              )}
              {customerResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                  {customerResults.map(function(c) {
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={function() { selectCustomer(c); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                      >
                        <p className="text-sm font-medium text-gray-900">{c.first_name + ' ' + c.last_name}</p>
                        <p className="text-xs text-gray-400">{c.phone || c.email || ''}</p>
                      </button>
                    );
                  })}
                </div>
              )}
              {customerSearch.length >= 2 && customerResults.length === 0 && !searchingCustomer && (
                <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-sm text-gray-500 mb-2">Nessun cliente trovato.</p>
                  <button
                    type="button"
                    onClick={openQuickCustomer}
                    className="text-sm font-medium text-wine-700 hover:text-wine-900 underline"
                  >
                    + Registra nuovo cliente
                  </button>
                </div>
              )}
              {customerSearch.length === 0 && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={openQuickCustomer}
                    className="text-sm text-wine-700 hover:text-wine-900 underline"
                  >
                    + Registra nuovo cliente
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SEZIONE DATA E TURNO */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Data e turno</h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Data *</label>
              <input
                type="date"
                value={form.reservation_date}
                onChange={function(e) { setForm(function(prev) { return Object.assign({}, prev, { reservation_date: e.target.value }); }); }}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Orario</label>
              <input
                type="time"
                value={form.requested_time}
                onChange={function(e) { handleTimeChange(e.target.value); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Turno *</label>
            {loadingMealTypes ? (
              <div className="text-xs text-gray-400 py-2">Caricamento turni...</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {mealTypes.map(function(mt) {
                  var isSelected = form.meal_type === mt.value;
                  return (
                    <button
                      key={mt.value}
                      type="button"
                      onClick={function() { setForm(function(prev) { return Object.assign({}, prev, { meal_type: mt.value }); }); }}
                      className={
                        'px-4 py-2 rounded-lg text-sm font-medium border transition-colors ' +
                        (isSelected
                          ? 'bg-wine-700 border-wine-700 text-white'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-wine-400')
                      }
                    >
                      {mt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {availability && (
            <div className={'mt-3 p-2 rounded-lg text-xs ' + (availability.remaining >= availability.requested ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
              {availability.remaining >= availability.requested
                ? 'Disponibilità: ' + availability.remaining + ' coperti liberi su ' + availability.maxCovers
                : 'Attenzione: solo ' + availability.remaining + ' coperti liberi su ' + availability.maxCovers + ' (richiesti: ' + availability.requested + ')'
              }
            </div>
          )}
        </div>

        {/* SEZIONE COPERTI */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Coperti</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Adulti</label>
              <input
                type="number"
                min="0"
                value={form.adults_count}
                onChange={function(e) { updateGuestCounts('adults_count', e.target.value); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 text-center"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Bambini</label>
              <input
                type="number"
                min="0"
                value={form.children_count}
                onChange={function(e) { updateGuestCounts('children_count', e.target.value); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 text-center"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Totale</label>
              <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-center bg-gray-50 font-semibold text-gray-900">
                {form.guests_count}
              </div>
            </div>
          </div>
        </div>

        {/* SEZIONE DETTAGLI */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Dettagli</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Stato</label>
              <select
                value={form.status}
                onChange={function(e) { setForm(function(prev) { return Object.assign({}, prev, { status: e.target.value }); }); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
              >
                {statusOptions.map(function(s) {
                  return <option key={s.value} value={s.value}>{s.label}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Provenienza</label>
              <select
                value={form.source}
                onChange={function(e) { setForm(function(prev) { return Object.assign({}, prev, { source: e.target.value }); }); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
              >
                {sourceOptions.map(function(s) {
                  return <option key={s.value} value={s.value}>{s.label}</option>;
                })}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">Tavolo</label>
            <input
              type="text"
              value={form.table_info}
              onChange={function(e) { setForm(function(prev) { return Object.assign({}, prev, { table_info: e.target.value }); }); }}
              placeholder="Es. Tavolo 5, terrazza, sala privata..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
            />
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">Richieste speciali</label>
            <textarea
              value={form.special_requests}
              onChange={function(e) { setForm(function(prev) { return Object.assign({}, prev, { special_requests: e.target.value }); }); }}
              rows="2"
              placeholder="Allergie, intolleranze, occasioni speciali..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Note interne</label>
            <textarea
              value={form.notes}
              onChange={function(e) { setForm(function(prev) { return Object.assign({}, prev, { notes: e.target.value }); }); }}
              rows="2"
              placeholder="Note visibili solo allo staff..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 resize-none"
            />
          </div>
        </div>

        {/* BOTTONI AZIONE */}
        <div className="flex gap-3 pb-6">
          <button
            type="button"
            onClick={function() { navigate(-1); }}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 font-medium"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? 'Salvataggio...' : (isEdit ? 'Salva modifiche' : 'Crea prenotazione')}
          </button>
        </div>

      </form>

      {/* ==================== MODALE CLIENTE RAPIDO ==================== */}
      {showQuickCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Nuovo cliente rapido</h2>
                <p className="text-xs text-gray-400 mt-0.5">Il cliente verrà creato e selezionato automaticamente</p>
              </div>
              <button
                type="button"
                onClick={function() { setShowQuickCustomer(false); }}
                className="text-gray-400 hover:text-gray-600 text-xl font-light"
              >✕</button>
            </div>

            <form onSubmit={handleQuickCustomerSubmit} className="p-6 space-y-4">

              {quickError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{quickError}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nome <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={quickForm.first_name}
                    onChange={function(e) { setQuickForm(Object.assign({}, quickForm, { first_name: e.target.value })); }}
                    required
                    autoFocus
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cognome <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={quickForm.last_name}
                    onChange={function(e) { setQuickForm(Object.assign({}, quickForm, { last_name: e.target.value })); }}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Telefono <span className="text-gray-400 font-normal">(consigliato)</span>
                </label>
                <input
                  type="tel"
                  value={quickForm.phone}
                  onChange={function(e) { setQuickForm(Object.assign({}, quickForm, { phone: e.target.value })); }}
                  placeholder="+39 ..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={quickForm.email}
                  onChange={function(e) { setQuickForm(Object.assign({}, quickForm, { email: e.target.value })); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Categoria</label>
                <select
                  value={quickForm.category}
                  onChange={function(e) { setQuickForm(Object.assign({}, quickForm, { category: e.target.value })); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                >
                  {categoryOptions.map(function(c) {
                    return <option key={c.value} value={c.value}>{c.label}</option>;
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Note rapide</label>
                <textarea
                  value={quickForm.notes}
                  onChange={function(e) { setQuickForm(Object.assign({}, quickForm, { notes: e.target.value })); }}
                  rows="2"
                  placeholder="Informazioni utili da ricordare..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 resize-none"
                />
              </div>

              <p className="text-xs text-gray-400">
                Allergeni, GDPR e dati completi potranno essere aggiunti in seguito da Anagrafica Clienti.
              </p>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={function() { setShowQuickCustomer(false); }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={quickLoading}
                  className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  {quickLoading ? 'Creazione...' : 'Crea e seleziona'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
