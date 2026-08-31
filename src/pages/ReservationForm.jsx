import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Save, Search, AlertTriangle, UserPlus, Check, Users, ChevronRight, Gift, Edit3, BedDouble, Wand2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import AllergeniEditor, { validaAllergeni, salvaAllergeni, campiConsensoSalute, salvaConsensoSalute, caricaAllergeniCliente, severitaLabel } from '../components/AllergeniEditor'
import { useAuth } from '../lib/AuthContext'
import ConfermaPin from '../components/ConfermaPin'
import ComparazioneClienti, { cercaCandidatiForti } from '../components/ComparazioneClienti'

// Etichette dei tre gruppi del pulsante "Camere". L'ordine lo decide gia'
// hic_ospiti_giorno in SQL (ordine_gruppo 1/2/3): qui si traduce e basta.
var GRUPPI_CAMERE = [
  { chiave: 'arriva', titolo: 'Arriva oggi' },
  { chiave: 'resta',  titolo: 'Gia in casa' },
  { chiave: 'lascia', titolo: 'Lascia la camera stamattina' }
]

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function formatDateISO(date) {
  var y = date.getFullYear()
  var m = String(date.getMonth() + 1).padStart(2, '0')
  var d = String(date.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function dataBreve(iso) {
  if (!iso) return ''
  var p = ('' + iso).split('-')
  if (p.length !== 3) return iso
  return p[2] + '/' + p[1] + '/' + p[0]
}

function due(n) { return n < 10 ? '0' + n : '' + n }

function fmtLogData(ts) {
  if (!ts) return ''
  var d = new Date(ts)
  return due(d.getDate()) + '/' + due(d.getMonth() + 1) + ' ' + due(d.getHours()) + ':' + due(d.getMinutes())
}

var HOURS = []
for (var h = 7; h <= 23; h++) { HOURS.push(h) }
var MINUTES = ['00', '15', '30', '45']

var MEAL_TYPES = [
  { value: 'lunch', label: 'Pranzo' },
  { value: 'dinner', label: 'Cena' }
]

var categoryColors = {
  standard: 'bg-gray-100 text-gray-700',
  vip: 'bg-amber-100 text-amber-800',
  press: 'bg-purple-100 text-purple-800',
  business: 'bg-blue-100 text-blue-800',
  hotel_guest: 'bg-green-100 text-green-800'
}

var categoryLabels = {
  standard: 'Standard',
  vip: 'VIP',
  press: 'Stampa',
  business: 'Business',
  hotel_guest: 'Ospite Hotel'
}

// Derivato da categoryLabels: le etichette restano in una copia sola.
var CATEGORIE_CLIENTE = Object.keys(categoryLabels).map(function(k) {
  return { value: k, label: categoryLabels[k] }
})

function ReservationForm() {
  var params = useParams()
  var id = params.id
  var searchParamsResult = useSearchParams()
  var searchParams = searchParamsResult[0]
  var navigate = useNavigate()
  var isEditing = Boolean(id)

  var { user, profile, elevato, elevazione, attivaElevazione, canEdit } = useAuth()

  var [showPinModal, setShowPinModal] = useState(false)
  var [pendingData, setPendingData] = useState(null)

  var [loading, setLoading] = useState(false)
  var [saving, setSaving] = useState(false)

  // Stato alert della fascia (coperti degli altri, alert manuale, spunta ok direttore)
  var [copertiAltri, setCopertiAltri] = useState(0)
  var [alertManuale, setAlertManuale] = useState(null)
  var [copertiEvento, setCopertiEvento] = useState(0)
  var [eventoSenzaNumero, setEventoSenzaNumero] = useState(false)
  var [okDirettore, setOkDirettore] = useState(false)

  // Coperti prima della modifica (per il log), storia della prenotazione,
  // e minuti di durata della sessione "Entra con PIN".
  var [copertiPrima, setCopertiPrima] = useState(null)
  var [storia, setStoria] = useState([])
  var [minutiElevazione, setMinutiElevazione] = useState(5)

  var [customerSearch, setCustomerSearch] = useState('')
  var [searchResults, setSearchResults] = useState([])
  var [selectedCustomer, setSelectedCustomer] = useState(null)
  var [customerAllergens, setCustomerAllergens] = useState([])
  var [showSearch, setShowSearch] = useState(true)

  var [showListaClienti, setShowListaClienti] = useState(false)
  var [listaClienti, setListaClienti] = useState([])
  var [loadingLista, setLoadingLista] = useState(false)
  var [filtroLista, setFiltroLista] = useState('')

  var [availability, setAvailability] = useState(null)
  var [selectedHour, setSelectedHour] = useState('')
  var [selectedMinute, setSelectedMinute] = useState('00')

  var [showQuickCustomer, setShowQuickCustomer] = useState(false)
  // La modale cliente serve sia a CREARE sia a MODIFICARE: una modale sola,
  // altrimenti due quasi-gemelle divergono al primo campo aggiunto.
  var [quickMode, setQuickMode] = useState('crea')
  var [quickCustomerId, setQuickCustomerId] = useState(null)
  var [elencoAllergeni, setElencoAllergeni] = useState([])
  var [quickAllergeni, setQuickAllergeni] = useState({})
  var [quickConsensoSalute, setQuickConsensoSalute] = useState(false)
  // Testo libero allergie del cliente selezionato, per il riquadro rosso
  var [allergieLibereCliente, setAllergieLibereCliente] = useState('')
  var [quickForm, setQuickForm] = useState({ first_name: '', last_name: '', phone: '', email: '', category: 'standard', notes: '' })
  var [quickLoading, setQuickLoading] = useState(false)
  var [quickError, setQuickError] = useState(null)

  // ----------------------------------------------------------
  // 8-BIS FASE 2 — comparazione N a 1 e pulsante "Camere"
  //
  // hicIdInAttesa: l'id cliente di Hotel in Cloud dell'ospite che si sta
  // promuovendo dal pannello Camere. Vale null in tutti gli altri casi.
  // Serve a scrivere il legame DOPO che la scheda e' stata creata o
  // scelta: prima non esiste ancora niente da legare.
  // ----------------------------------------------------------
  var [showComparazione, setShowComparazione] = useState(false)
  var [candidati, setCandidati] = useState([])
  var [hicIdInAttesa, setHicIdInAttesa] = useState(null)

  var [showCamere, setShowCamere] = useState(false)
  var [ospitiGiorno, setOspitiGiorno] = useState([])
  var [loadingCamere, setLoadingCamere] = useState(false)
  var [erroreCamere, setErroreCamere] = useState(null)

  // ----------------------------------------------------------
  // PRENOTAZIONE A PIU' CLIENTI (migrazione 52)
  //
  // L'intestatario resta reservations.customer_id e risponde alla
  // domanda "chi ha prenotato". La tabella prenotazione_clienti risponde
  // a una domanda diversa: "chi siede a questo tavolo, e in che camera
  // dorme". Sono due fatti, non due copie dello stesso fatto.
  //
  // ⚠️ I COPERTI NON SI DEDUCONO DA QUI. guests_count resta scritto a
  // mano e continua a voler dire "quante persone siedono a tavola": a
  // tavola siede anche chi non ha una scheda. Collegare tre clienti a una
  // prenotazione da nove non cambia nessuno dei conteggi di capienza.
  // ----------------------------------------------------------
  var [clientiCollegati, setClientiCollegati] = useState([])
  var [cameraIntestatario, setCameraIntestatario] = useState('')

  // Specchio dell'intestatario: le richiamate del pannello Camere
  // leggerebbero uno selectedCustomer vecchio, e il primo ospite della
  // fila finirebbe per sovrascrivere se stesso.
  var intestatarioRef = useRef(null)

  // Fila del pannello Camere: gli ospiti spuntati che non hanno ancora
  // una scheda si trascrivono UNO ALLA VOLTA, perche' creare una scheda
  // vuole una persona davanti (una riga su cinque arriva senza cognome
  // utilizzabile, e la comparazione puo' interrompere).
  var filaRef = useRef([])
  var filaTotaleRef = useRef(0)
  var filaFattiRef = useRef(0)
  var ospiteCorrenteRef = useRef(null)
  var [filaInfo, setFilaInfo] = useState(null)
  var [avvisoFila, setAvvisoFila] = useState(null)
  var [selezioneCamere, setSelezioneCamere] = useState({})

  // La lista clienti serve a due gesti diversi: scegliere l'intestatario
  // (come sempre) oppure aggiungere un commensale gia' in archivio.
  var [modoAggiunta, setModoAggiunta] = useState(false)

  var initialDate = searchParams.get('date') || formatDateISO(new Date())
  var initialMeal = searchParams.get('meal') || 'dinner'

  // ----------------------------------------------------------
  // GIFT CARD (?gift=<id>&pasto=<n>) — la prenotazione nasce da un buono.
  // Tutto quello che arriva dalla gift card e' un SUGGERIMENTO: cliente,
  // persone e note si possono cambiare (il buono puo' essere ceduto).
  // ----------------------------------------------------------
  var giftId = searchParams.get('gift')
  var pastoNum = searchParams.get('pasto')
  var [giftCard, setGiftCard] = useState(null)
  var [giftTipologia, setGiftTipologia] = useState(null)
  var [giftApplicata, setGiftApplicata] = useState(false)
  var [giftClienteNuovo, setGiftClienteNuovo] = useState(false)
  // Legame gift card di una prenotazione GIA' esistente (in modifica):
  // va conservato, altrimenti il salvataggio lo azzererebbe.
  var [giftCardIdEsistente, setGiftCardIdEsistente] = useState(null)

  // ----------------------------------------------------------
  // NORMALIZZA PRENOTAZIONE (migrazione 53)
  //
  // Il programma riconosce, Florestano decide. Questo pannello non
  // scrive mai da solo: riempie i campi del modulo, e il salvataggio
  // resta quello di sempre, con la sua firma e il suo log.
  //
  // Il riconoscimento NON e' qui: arriva dalla funzione SQL
  // prenotazioni_da_normalizzare, la stessa che alimenta la pagina
  // dell'elenco. Una regola, una copia (regola 31).
  // ----------------------------------------------------------
  var [normAperto, setNormAperto] = useState(false)
  var [normLoading, setNormLoading] = useState(false)
  var [normErrore, setNormErrore] = useState('')
  var [normProposte, setNormProposte] = useState(null)
  var [normCercata, setNormCercata] = useState(false)
  // Diventa vero appena tocchi qualcosa nel pannello: al salvataggio
  // scrive normalizzata_il, e la prenotazione esce dall'elenco.
  var [normSegna, setNormSegna] = useState(false)

  var [formData, setFormData] = useState({
    reservation_date: initialDate,
    meal_type: initialMeal,
    adults_count: 2,
    children_count: 0,
    table_info: '',
    camera: '',
    allergie_prenotazione: '',
    notes: '',
    special_requests: '',
    source: 'manual'
  })

  var totalGuests = formData.adults_count + formData.children_count
  var hasAllergiePrenotazione = Boolean(formData.allergie_prenotazione && formData.allergie_prenotazione.trim().length > 0)

  useEffect(function() {
    if (isEditing) loadReservation()
  }, [id])

  // Arrivando dall'elenco (?normalizza=1) il pannello si apre da solo:
  // altrimenti l'elenco ti porterebbe qui e dovresti cercare il pulsante.
  useEffect(function() {
    if (!isEditing || loading) return
    if (searchParams.get('normalizza') !== '1') return
    if (normCercata) return
    apriNormalizza()
  }, [loading])

  // Carica la gift card di partenza e propone i suoi dati.
  useEffect(function() {
    if (!giftId || isEditing || giftApplicata) return
    supabase.from('gift_card')
      .select('*, gift_card_tipologie(*)')
      .eq('id', giftId)
      .single()
      .then(function(result) {
        if (result.error || !result.data) return
        var gc = result.data
        var tip = gc.gift_card_tipologie || null
        setGiftCard(gc)
        setGiftTipologia(tip)
        setGiftApplicata(true)
        applicaSuggerimentiGift(gc, tip)
      })
  }, [giftId, isEditing, giftApplicata])

  // Nome + cognome del beneficiario (le gift vecchie hanno tutto nel nome).
  function beneficiarioGift(gc) {
    if (!gc) return { nome: '', cognome: '' }
    return {
      nome: (gc.beneficiario_nome || '').trim(),
      cognome: (gc.beneficiario_cognome || '').trim()
    }
  }

  // Etichetta del pasto scelto in Gift Card (?pasto=1|2).
  function etichettaPasto(tip) {
    if (!tip) return ''
    if (pastoNum === '1') return tip.tipologia_pasto_1 || ''
    if (pastoNum === '2') return tip.tipologia_pasto_2 || ''
    return ''
  }

  // Precompila persone e note; propone il cliente beneficiario.
  // NON crea nulla di nascosto: se il cliente non esiste, apre il form di
  // creazione rapida gia' compilato e la conferma resta all'operatore.
  function applicaSuggerimentiGift(gc, tip) {
    var ben = beneficiarioGift(gc)
    var pasto = etichettaPasto(tip)

    // Note suggerite: contesto del buono + accessori che viaggiano sul pasto.
    var righe = []
    righe.push('Gift card ' + gc.codice + (tip ? ' - ' + tip.nome : ''))
    if (pasto) righe.push('Pasto: ' + pasto)
    if (tip && tip.degustazione_vini_1) righe.push('Vini inclusi: ' + tip.degustazione_vini_1)
    if (tip && tip.degustazione_vini_2) righe.push('Vini inclusi: ' + tip.degustazione_vini_2)
    var noteGift = righe.join('\n')

    setFormData(function(prev) {
      var u = Object.assign({}, prev)
      if (gc.numero_persone && gc.numero_persone > 0) {
        u.adults_count = gc.numero_persone
        u.children_count = 0
      }
      u.notes = prev.notes ? (prev.notes + '\n' + noteGift) : noteGift
      return u
    })

    // Cliente: prima lo cerco in anagrafica; se c'e', lo propongo selezionato.
    if (ben.nome && ben.cognome) {
      supabase.from('customers')
        .select('*')
        .ilike('first_name', ben.nome)
        .ilike('last_name', ben.cognome)
        .limit(1)
        .then(function(res) {
          if (!res.error && res.data && res.data.length > 0) {
            selectCustomer(res.data[0])
          } else {
            proponiNuovoCliente(gc, tip, ben)
          }
        })
    } else {
      proponiNuovoCliente(gc, tip, ben)
    }
  }

  // Apre la creazione rapida cliente GIA' COMPILATA col beneficiario.
  // La vecchia stringa identificativa resta nelle note, per tracciabilita'.
  function proponiNuovoCliente(gc, tip, ben) {
    if (!ben.nome && !ben.cognome) return
    setQuickForm({
      first_name: ben.nome || (gc.committente_nome || ''),
      last_name: ben.cognome || '',
      phone: (gc.committente_contatto || '').trim(),
      email: '',
      category: 'standard',
      notes: 'Beneficiario gift card ' + (tip ? tip.nome + ' ' : '') + gc.codice
    })
    setQuickError(null)
    setGiftClienteNuovo(true)
    setShowQuickCustomer(true)
  }

  useEffect(function() {
    if (formData.reservation_date && formData.meal_type) checkAvailability()
  }, [formData.reservation_date, formData.meal_type, totalGuests])

  useEffect(function() {
    refreshAlertState()
  }, [formData.reservation_date, formData.meal_type])

  useEffect(function() {
    supabase.from('restaurant_settings')
      .select('elevazione_minuti')
      .limit(1)
      .then(function(result) {
        if (!result.error && result.data && result.data.length > 0) {
          var m = result.data[0].elevazione_minuti
          if (m && m > 0) setMinutiElevazione(m)
        }
      })
  }, [])

  useEffect(function() {
    if (isEditing) caricaStoria()
  }, [id])

  useEffect(function() {
    if (selectedHour !== '') {
      var h = parseInt(selectedHour)
      var detected = h >= 11 && h <= 15 ? 'lunch' : (h >= 19 && h <= 23 ? 'dinner' : null)
      if (detected) {
        setFormData(function(prev) {
          var u = {}; for (var k in prev) { u[k] = prev[k] }
          u.meal_type = detected
          return u
        })
      }
    }
  }, [selectedHour])

  function loadReservation() {
    setLoading(true)
    supabase.from('reservations')
      .select('*, customers(id, first_name, last_name, phone, email, category)')
      .eq('id', id).single()
      .then(function(result) {
        if (result.error) { alert('Prenotazione non trovata.'); navigate('/prenotazioni'); return }
        var res = result.data
        if (res.gift_card_id) {
          setGiftCardIdEsistente(res.gift_card_id)
          supabase.from('gift_card')
            .select('*, gift_card_tipologie(*)')
            .eq('id', res.gift_card_id)
            .single()
            .then(function(g) {
              if (!g.error && g.data) {
                setGiftCard(g.data)
                setGiftTipologia(g.data.gift_card_tipologie || null)
              }
            })
        }
        setFormData({
          reservation_date: res.reservation_date,
          meal_type: res.meal_type === 'lunch' || res.meal_type === 'dinner' ? res.meal_type : 'dinner',
          adults_count: res.adults_count || res.guests_count,
          children_count: res.children_count || 0,
          table_info: res.table_info || '',
          camera: res.camera || '',
          allergie_prenotazione: res.allergie_prenotazione || '',
          notes: res.notes || '',
          special_requests: res.special_requests || '',
          source: res.source || 'manual'
        })
        if (res.requested_time) {
          var timeParts = res.requested_time.split(':')
          setSelectedHour(timeParts[0])
          var mins = parseInt(timeParts[1])
          var closest = '00'
          if (mins >= 8 && mins < 23) closest = '15'
          else if (mins >= 23 && mins < 38) closest = '30'
          else if (mins >= 38 && mins < 53) closest = '45'
          setSelectedMinute(closest)
        }
        intestatarioRef.current = res.customers
        setSelectedCustomer(res.customers)
        setShowSearch(false)
        caricaLegamiClienti(res.id, res.customer_id)
        // In modifica la spunta "Ok direttore" parte SEMPRE vuota: e' una
        // decisione fresca a ogni salvataggio. Qui memorizzo solo i coperti
        // di partenza, che servono al log (da X a Y).
        var prima = (typeof res.guests_count === 'number')
          ? res.guests_count
          : ((res.adults_count || 0) + (res.children_count || 0))
        setCopertiPrima(prima)
        loadCustomerAllergens(res.customers.id)
        setLoading(false)
      })
  }

  // Legge chi siede a questo tavolo. La riga dell'intestatario porta solo
  // la SUA camera; le altre diventano l'elenco dei collegati.
  function caricaLegamiClienti(prenotazioneId, intestatarioId) {
    supabase.from('prenotazione_clienti')
      .select('cliente_id, camera, ordine, customers(id, first_name, last_name, phone, email, category, allergie_cliente)')
      .eq('prenotazione_id', prenotazioneId)
      .order('ordine', { ascending: true })
      .then(function(result) {
        if (result.error || !result.data) return
        var righe = result.data
        var collegati = []
        for (var i = 0; i < righe.length; i++) {
          var r = righe[i]
          if (r.cliente_id === intestatarioId) {
            setCameraIntestatario(r.camera || '')
            continue
          }
          var c = r.customers
          if (!c) continue
          collegati.push({
            cliente_id: r.cliente_id,
            first_name: c.first_name,
            last_name: c.last_name,
            phone: c.phone || '',
            email: c.email || '',
            category: c.category || 'standard',
            camera: r.camera || '',
            allergeni: [],
            allergie_libere: c.allergie_cliente || ''
          })
        }
        setClientiCollegati(collegati)
        for (var j = 0; j < collegati.length; j++) {
          caricaAllergeniCollegato(collegati[j].cliente_id)
        }
      })
  }

  function searchCustomers(query) {
    setCustomerSearch(query)
    if (query.length < 2) { setSearchResults([]); return }
    supabase.from('customers')
      .select('id, first_name, last_name, phone, email, category')
      .eq('is_active', true)
      .or('last_name.ilike.%' + query + '%,first_name.ilike.%' + query + '%,phone.ilike.%' + query + '%,email.ilike.%' + query + '%')
      .order('last_name').limit(10)
      .then(function(result) {
        if (!result.error) setSearchResults(result.data || [])
      })
  }

  function apriListaClienti() {
    setShowListaClienti(true)
    setFiltroLista('')
    if (listaClienti.length > 0) return
    setLoadingLista(true)
    supabase.from('customers')
      .select('id, first_name, last_name, phone, email, category')
      .eq('is_active', true)
      .order('last_name', { ascending: true })
      .then(function(result) {
        setLoadingLista(false)
        if (!result.error) setListaClienti(result.data || [])
      })
  }

  function selectCustomer(customer) {
    intestatarioRef.current = customer
    setSelectedCustomer(customer)
    setShowSearch(false)
    setShowListaClienti(false)
    setSearchResults([])
    setCustomerSearch('')
    loadCustomerAllergens(customer.id)
  }

  // ----------------------------------------------------------
  // CLIENTI COLLEGATI
  // ----------------------------------------------------------

  // Aggiunge un cliente all'elenco dei collegati, con la sua camera.
  // Se e' gia' presente (o e' l'intestatario) non fa nulla: la stessa
  // persona non si collega due volte, come il vincolo in banca dati.
  function aggiungiCollegato(cliente, camera) {
    var intest = intestatarioRef.current
    if (intest && intest.id === cliente.id) {
      if (camera) setCameraIntestatario(camera)
      return
    }
    setClientiCollegati(function(prev) {
      for (var i = 0; i < prev.length; i++) {
        if (prev[i].cliente_id === cliente.id) {
          if (camera && !prev[i].camera) {
            var copia = prev.slice()
            copia[i] = Object.assign({}, prev[i], { camera: camera })
            return copia
          }
          return prev
        }
      }
      return prev.concat([{
        cliente_id: cliente.id,
        first_name: cliente.first_name,
        last_name: cliente.last_name,
        phone: cliente.phone || '',
        email: cliente.email || '',
        category: cliente.category || 'standard',
        camera: camera || '',
        allergeni: [],
        allergie_libere: (cliente.allergie_cliente || '')
      }])
    })
    caricaAllergeniCollegato(cliente.id)
  }

  // Gli allergeni di un collegato servono a due cose: mostrarli nel
  // riquadro rosso e far accendere has_allergen_alerts. Si leggono
  // ENTRAMBI i livelli, strutturato e testo libero: sono complementari.
  function caricaAllergeniCollegato(clienteId) {
    supabase.from('customer_allergens')
      .select('severity, allergens(id, name, icon)')
      .eq('customer_id', clienteId)
      .then(function(result) {
        if (result.error) return
        setClientiCollegati(function(prev) {
          var copia = prev.slice()
          for (var i = 0; i < copia.length; i++) {
            if (copia[i].cliente_id === clienteId) {
              copia[i] = Object.assign({}, copia[i], { allergeni: result.data || [] })
            }
          }
          return copia
        })
      })
    supabase.from('customers')
      .select('allergie_cliente')
      .eq('id', clienteId)
      .single()
      .then(function(result) {
        if (result.error || !result.data) return
        setClientiCollegati(function(prev) {
          var copia = prev.slice()
          for (var i = 0; i < copia.length; i++) {
            if (copia[i].cliente_id === clienteId) {
              copia[i] = Object.assign({}, copia[i], { allergie_libere: result.data.allergie_cliente || '' })
            }
          }
          return copia
        })
      })
  }

  // Toglie una camera dal riepilogo della prenotazione, e solo quella.
  //
  // ⚠️ Corrispondenza esatta su un pezzo intero, mai una ricerca dentro il
  // testo: il riepilogo contiene anche camere scritte a mano per ospiti
  // che una scheda non ce l'hanno, e quelle non si toccano. Il pannello
  // ha sempre saputo aggiungere una camera; questo e' il gesto opposto,
  // che mancava (regola 46 letta al contrario: dove va a finire un dato
  // quando se ne va).
  function togliCamera(nomeCamera) {
    var pulito = (nomeCamera || '').trim()
    if (pulito === '') return
    setFormData(function(p) {
      var u = Object.assign({}, p)
      var attuale = (u.camera || '').trim()
      if (attuale === '') return u
      var pezzi = attuale.split(',')
      var restano = []
      for (var i = 0; i < pezzi.length; i++) {
        var pezzo = pezzi[i].trim()
        if (pezzo === '') continue
        if (pezzo.toLowerCase() === pulito.toLowerCase()) continue
        restano.push(pezzo)
      }
      u.camera = restano.join(', ')
      return u
    })
  }

  function togliCollegato(clienteId) {
    // La camera si toglie qui, fuori dall'aggiornamento dell'elenco:
    // dentro, React puo' rieseguire la funzione e la ripulitura
    // verrebbe fatta due volte.
    for (var i = 0; i < clientiCollegati.length; i++) {
      if (clientiCollegati[i].cliente_id === clienteId && clientiCollegati[i].camera) {
        togliCamera(clientiCollegati[i].camera)
      }
    }
    setClientiCollegati(function(prev) {
      var out = []
      for (var j = 0; j < prev.length; j++) {
        if (prev[j].cliente_id !== clienteId) out.push(prev[j])
      }
      return out
    })
  }

  // Un cliente arriva dal pannello Camere: se non c'e' ancora un
  // intestatario diventa lui, altrimenti si aggiunge ai collegati.
  function assegnaClienteDaCamere(cliente, camera) {
    if (!intestatarioRef.current) {
      if (camera) setCameraIntestatario(camera)
      selectCustomer(cliente)
      return
    }
    aggiungiCollegato(cliente, camera)
  }

  // Almeno uno fra intestatario e collegati ha un allergene registrato?
  // ⚠️ Prima della migrazione 52 questo controllo guardava SOLO il
  // cliente selezionato: con tre clienti collegati, un allergene del
  // secondo non avrebbe acceso la spia in sala.
  function qualcunoHaAllergeni() {
    if (customerAllergens.length > 0) return true
    if (allergieLibereCliente && allergieLibereCliente.trim() !== '') return true
    for (var i = 0; i < clientiCollegati.length; i++) {
      if (clientiCollegati[i].allergeni && clientiCollegati[i].allergeni.length > 0) return true
      if (clientiCollegati[i].allergie_libere && clientiCollegati[i].allergie_libere.trim() !== '') return true
    }
    return false
  }

  // Carica ENTRAMBI i livelli di allergeni: quelli strutturati e il testo
  // libero. Sono complementari, non doppioni: il testo libero contiene proprio
  // cio' che nell'elenco di legge non ci sta.
  function loadCustomerAllergens(customerId) {
    supabase.from('customer_allergens')
      .select('severity, allergens(id, name, icon)')
      .eq('customer_id', customerId)
      .then(function(result) {
        if (!result.error) setCustomerAllergens(result.data || [])
      })
    supabase.from('customers')
      .select('allergie_cliente')
      .eq('id', customerId)
      .single()
      .then(function(result) {
        if (!result.error && result.data) setAllergieLibereCliente(result.data.allergie_cliente || '')
        else setAllergieLibereCliente('')
      })
  }

  function caricaElencoAllergeni() {
    if (elencoAllergeni.length > 0) return
    supabase.from('allergens').select('*').order('id').then(function(result) {
      if (!result.error) setElencoAllergeni(result.data || [])
    })
  }

  function checkAvailability() {
    supabase.rpc('check_availability', {
      p_date: formData.reservation_date,
      p_meal_type: formData.meal_type,
      p_guests: totalGuests
    }).then(function(result) {
      if (!result.error && result.data && result.data.length > 0) setAvailability(result.data[0])
    })
  }

  // Carica i coperti gia' presenti nella fascia (esclusa questa prenotazione
  // se siamo in modifica) e l'eventuale alert manuale attivo su quella fascia.
  function refreshAlertState() {
    var d = formData.reservation_date
    var m = formData.meal_type
    if (!d || !m) { setCopertiAltri(0); setAlertManuale(null); setCopertiEvento(0); setEventoSenzaNumero(false); return }

    supabase.from('reservations')
      .select('id, guests_count')
      .eq('reservation_date', d)
      .eq('meal_type', m)
      .not('status', 'eq', 'cancelled')
      .then(function(result) {
        var somma = 0
        if (!result.error && result.data) {
          for (var i = 0; i < result.data.length; i++) {
            var row = result.data[i]
            if (isEditing && row.id === id) continue
            somma += (row.guests_count || 0)
          }
        }
        setCopertiAltri(somma)
      })

    supabase.from('alert_prenotazioni')
      .select('testo, attivo')
      .eq('data', d)
      .eq('fascia', m)
      .eq('attivo', true)
      .maybeSingle()
      .then(function(result) {
        if (!result.error && result.data) setAlertManuale(result.data)
        else setAlertManuale(null)
      })

    // Coperti degli eventi del giorno sul turno (un evento "both" vale su
    // entrambi i turni). Se un evento non ha il numero, lo segnaliamo.
    supabase.from('event_dates')
      .select('covers_reserved, meal_type')
      .eq('event_date', d)
      .then(function(result) {
        var somma = 0
        var senza = false
        if (!result.error && result.data) {
          for (var i = 0; i < result.data.length; i++) {
            var ev = result.data[i]
            if (ev.meal_type !== m && ev.meal_type !== 'both') continue
            var cr = ev.covers_reserved
            if (cr == null || cr === '' || Number(cr) === 0) senza = true
            else somma += (parseInt(cr, 10) || 0)
          }
        }
        setCopertiEvento(somma)
        setEventoSenzaNumero(senza)
      })
  }

  function handleInputChange(e) {
    var name = e.target.name
    var value = e.target.value
    if (name === 'adults_count' || name === 'children_count') {
      value = parseInt(value) || 0
      if (value < 0) value = 0
    }
    setFormData(function(prev) {
      var u = {}; for (var k in prev) { u[k] = prev[k] }
      u[name] = value
      return u
    })
  }

  function openQuickCustomer() {
    setQuickMode('crea')
    setQuickCustomerId(null)
    // Creazione "a mano": nessun ospite di Hotel in Cloud da legare.
    setHicIdInAttesa(null)
    setQuickForm({ first_name: '', last_name: '', phone: '', email: '', category: 'standard', notes: '', allergie_cliente: '' })
    setQuickAllergeni({})
    setQuickConsensoSalute(false)
    setQuickError(null)
    caricaElencoAllergeni()
    setShowQuickCustomer(true)
  }

  // Modifica di un cliente esistente senza uscire dalla prenotazione in corso.
  function openEditCustomer(customer) {
    setQuickMode('modifica')
    setQuickCustomerId(customer.id)
    setHicIdInAttesa(null)
    setQuickError(null)
    setQuickAllergeni({})
    setQuickConsensoSalute(false)
    caricaElencoAllergeni()
    setShowListaClienti(false)
    setShowQuickCustomer(true)
    setQuickLoading(true)
    // Riga completa e fresca: gli elenchi in memoria hanno solo alcune colonne.
    supabase.from('customers').select('*').eq('id', customer.id).single().then(function(result) {
      if (result.error || !result.data) {
        setQuickLoading(false)
        setQuickError('Cliente non trovato.')
        return
      }
      var c = result.data
      setQuickForm({
        first_name: c.first_name || '',
        last_name:  c.last_name || '',
        phone:      c.phone || '',
        email:      c.email || '',
        category:   c.category || 'standard',
        notes:      c.notes || '',
        allergie_cliente: c.allergie_cliente || ''
      })
      caricaAllergeniCliente(supabase, customer.id).then(function(stato) {
        setQuickAllergeni(stato.selected)
        setQuickConsensoSalute(stato.consensoSalute)
        setQuickLoading(false)
      })
    })
  }

  // Passo 1 del salvataggio: si controlla quello che si puo' controllare,
  // poi si CERCA se questa persona e' gia' in archivio.
  //
  // ⚠️ Se non c'e' nessun candidato forte — il caso quasi sempre — non
  // compare niente e si salva dritto. Il pannello si apre solo quando c'e'
  // davvero qualcosa da guardare.
  function handleQuickCustomerSubmit(e) {
    e.preventDefault()
    setQuickError(null)
    if (!quickForm.first_name.trim() || !quickForm.last_name.trim()) { setQuickError('Nome e Cognome sono obbligatori.'); return }

    // Regola sul consenso sanitario: UNA copia sola, in AllergeniEditor.
    var erroreAllergeni = validaAllergeni(quickAllergeni, quickConsensoSalute)
    if (erroreAllergeni) { setQuickError(erroreAllergeni); return }

    setQuickLoading(true)
    cercaCandidatiForti(
      supabase,
      {
        first_name: quickForm.first_name.trim(),
        last_name: quickForm.last_name.trim(),
        phone: quickForm.phone.trim(),
        email: quickForm.email.trim()
      },
      hicIdInAttesa,
      // In modifica, la scheda non deve proporre se stessa.
      quickMode === 'modifica' ? quickCustomerId : null
    ).then(function(trovati) {
      if (trovati.length === 0) {
        eseguiSalvataggioCliente()
        return
      }
      setQuickLoading(false)
      setCandidati(trovati)
      setShowComparazione(true)
    })
  }

  // Passo 2: la scrittura vera. Ci si arriva o senza aver visto niente,
  // oppure dopo che l'operatore ha guardato i candidati e ha scelto di
  // creare comunque una scheda nuova.
  function eseguiSalvataggioCliente() {
    setQuickError(null)

    var dati = {
      first_name: quickForm.first_name.trim(),
      last_name: quickForm.last_name.trim(),
      phone: quickForm.phone.trim() || null,
      email: quickForm.email.trim() || null,
      category: quickForm.category,
      notes: quickForm.notes.trim() || null,
      allergie_cliente: (quickForm.allergie_cliente || '').trim() || null
    }
    var campiConsenso = campiConsensoSalute(quickConsensoSalute)
    for (var k in campiConsenso) { dati[k] = campiConsenso[k] }

    setQuickLoading(true)

    var scrittura
    if (quickMode === 'modifica' && quickCustomerId) {
      scrittura = supabase.from('customers').update(dati).eq('id', quickCustomerId).select().single()
    } else {
      dati.is_active = true
      // Da dove nasce la scheda. "hotel_in_cloud" solo quando la persona
      // arriva dal pannello Camere: e' un dato che serve a capire, un
      // domani, quante schede ha prodotto il ponte con HiC.
      dati.source = hicIdInAttesa ? 'hotel_in_cloud' : 'manual'
      scrittura = supabase.from('customers').insert(dati).select().single()
    }

    scrittura.then(function(result) {
      if (result.error) {
        setQuickLoading(false)
        // ⚠️ Il messaggio "esiste gia un cliente con questo telefono o
        // email" viveva qui ed e' stato tolto: dalla migrazione 48 i
        // vincoli unique_email / unique_phone non esistono piu', quindi
        // il codice 23505 non puo' piu' arrivare da un doppione. Il
        // doppione ora si intercetta PRIMA, con la comparazione.
        setQuickError('Errore: ' + result.error.message)
        return
      }
      var cliente = result.data
      // Scrittura allergeni e consenso: UNA copia sola, in AllergeniEditor.
      salvaAllergeni(supabase, cliente.id, quickAllergeni).then(function(esito) {
        if (esito.error) {
          setQuickLoading(false)
          setQuickError('Cliente salvato, ma gli allergeni no: ' + esito.error.message)
          return
        }
        salvaConsensoSalute(supabase, cliente.id, quickConsensoSalute).then(function() {
          scriviLegameHic(cliente.id).then(function() {
            dopoClienteAssegnato(cliente)
          })
        })
      })
    })
  }

  // Unico punto di uscita dalla modale cliente, sia che la scheda sia
  // appena nata sia che si sia scelta una scheda gia' in archivio.
  //
  // ⚠️ Fuori dal pannello Camere il comportamento e' quello di sempre:
  // il cliente diventa (o torna a essere) l'intestatario. La strada
  // nuova vale SOLO quando si sta scorrendo la fila delle camere.
  function dopoClienteAssegnato(cliente) {
    var o = ospiteCorrenteRef.current
    setQuickLoading(false)
    setShowComparazione(false)
    setCandidati([])
    setHicIdInAttesa(null)
    setListaClienti([])

    if (!o) {
      selectCustomer(cliente)
      setShowQuickCustomer(false)
      return
    }

    assegnaClienteDaCamere(cliente, o.unita || '')
    ospiteCorrenteRef.current = null

    if (filaRef.current.length > 0) { avanzaFila(); return }
    setFilaInfo(null)
    setShowQuickCustomer(false)
    filaTotaleRef.current = 0
    filaFattiRef.current = 0
  }

  // Costruisce il ponte fra l'ospite di Hotel in Cloud e la scheda del
  // ristorante. Non fa niente se non si arriva dal pannello Camere.
  //
  // ⚠️ Si scrive anche quando la scheda dello specchio non esiste: il
  // legame punta all'id di HiC, non alla scheda (nessuna chiave esterna,
  // "legame morbido" della migrazione 48). Cosi' il giorno in cui quella
  // persona riprenota e rientra nel perimetro, il ponte e' gia' in piedi.
  //
  // ⚠️ Non passiamo "origine": la colonna ha gia' il suo valore di
  // partenza. Firma chi sta agendo davvero, elevazione compresa, usando
  // firmaCorrente() invece di una seconda copia della stessa regola.
  function scriviLegameHic(customerId) {
    if (!hicIdInAttesa || !customerId) return Promise.resolve()
    var firma = firmaCorrente()
    return supabase.from('hic_clienti_legame').upsert({
      hic_customer_id: hicIdInAttesa,
      customer_id: customerId,
      creato_da: firma.user_id,
      creato_da_nome: firma.nome
    }, { onConflict: 'hic_customer_id' }).then(function(esito) {
      if (esito.error) {
        // Il cliente e' salvato: il legame mancante non deve far
        // sembrare fallita l'operazione. Si annota e si prosegue.
        console.error('Legame con Hotel in Cloud non scritto:', esito.error)
      }
    })
  }

  // ----------------------------------------------------------
  // AZIONI DELLA COMPARAZIONE
  // Due sole, di proposito. Fondere due schede e' un'altra cosa e sta
  // nella pagina di fusione: senza un verbale non si potrebbe tornare
  // indietro, e una fusione senza ritorno non si offre di sfuggita
  // dentro una prenotazione.
  // ----------------------------------------------------------
  function usaSchedaTrovata(candidato) {
    setQuickLoading(true)
    // Se si arriva dal pannello Camere e la scheda scelta non era gia'
    // legata, il ponte si costruisce adesso: e' proprio questo il gesto
    // che collega l'ospite dell'albergo al cliente del ristorante.
    scriviLegameHic(candidato.customer_id).then(function() {
      dopoClienteAssegnato({
        id: candidato.customer_id,
        first_name: candidato.first_name,
        last_name: candidato.last_name,
        phone: candidato.phone,
        email: candidato.email,
        category: candidato.category
      })
    })
  }

  function creaComunqueNuova() {
    setShowComparazione(false)
    setCandidati([])
    eseguiSalvataggioCliente()
  }

  function annullaComparazione() {
    setShowComparazione(false)
    setCandidati([])
    setQuickLoading(false)
  }

  // ----------------------------------------------------------
  // PULSANTE "CAMERE"
  //
  // Chi sta in casa il giorno della prenotazione, in tre gruppi.
  // ⚠️ La traduzione fra il GIORNO scelto e le NOTTI da leggere sta
  // dentro hic_ospiti_giorno, in SQL: notte D per chi arriva e chi
  // resta, notte D-1 per chi lascia la camera stamattina. Qui non si
  // calcola nessuna data, altrimenti la stessa regola vivrebbe in due
  // copie e prima o poi divergerebbero.
  // ----------------------------------------------------------
  function apriCamere() {
    setShowCamere(true)
    setErroreCamere(null)
    setSelezioneCamere({})
    setAvvisoFila(null)
    setLoadingCamere(true)
    supabase.rpc('hic_ospiti_giorno', { p_giorno: formData.reservation_date })
      .then(function(result) {
        setLoadingCamere(false)
        if (result.error) {
          setErroreCamere('Non riesco a leggere le camere: ' + result.error.message)
          setOspitiGiorno([])
          return
        }
        setOspitiGiorno(result.data || [])
      })
  }

  function nomeOspite(o) {
    var n = [o.cognome_proposto, o.nome_proposto].filter(Boolean).join(' ')
    if (n !== '') return n
    return o.ospite || 'Nome non disponibile'
  }

  // Spunta o toglie la spunta a un ospite. Non fa niente altro: la
  // decisione si vede prima di uscire, e si conferma tutta insieme.
  function toggleOspite(chiave, o) {
    setSelezioneCamere(function(prev) {
      var u = {}
      for (var k in prev) { if (k !== chiave) u[k] = prev[k] }
      if (!prev[chiave]) u[chiave] = o
      return u
    })
  }

  // Conferma della selezione. Chi ha gia' una scheda si collega subito;
  // per gli altri si apre la fila di trascrizione, una scheda alla volta.
  function confermaCamere() {
    var scelti = []
    for (var k in selezioneCamere) { scelti.push(selezioneCamere[k]) }
    setShowCamere(false)
    setAvvisoFila(null)
    if (scelti.length === 0) return

    // ⚠️ La camera si scrive SUBITO nel riepilogo della prenotazione,
    // prima ancora che le schede cliente esistano. E' un dato della
    // PRENOTAZIONE: la persona stasera dorme in Aorivola, fra un mese in
    // un'altra camera o da nessuna parte. Se aspettassimo il salvataggio
    // del cliente, un annullamento a meta' strada la farebbe sparire.
    for (var i = 0; i < scelti.length; i++) { impostaCamera(scelti[i].unita) }

    var conScheda = []
    var senzaScheda = []
    for (var j = 0; j < scelti.length; j++) {
      if (scelti[j].cliente_id) { conScheda.push(scelti[j]) } else { senzaScheda.push(scelti[j]) }
    }

    collegaConScheda(conScheda, 0, function() {
      if (senzaScheda.length === 0) return
      avviaFila(senzaScheda)
    })
  }

  // Gli ospiti che hanno gia' una scheda si collegano uno dopo l'altro,
  // in sequenza e non in parallelo: il primo che arriva puo' diventare
  // l'intestatario, e l'ordine deve essere quello dell'elenco.
  function collegaConScheda(elenco, indice, poi) {
    if (indice >= elenco.length) { poi(); return }
    var o = elenco[indice]
    supabase.from('customers')
      .select('id, first_name, last_name, phone, email, category, allergie_cliente')
      .eq('id', o.cliente_id)
      .single()
      .then(function(result) {
        if (result.error || !result.data) {
          console.error('Scheda collegata non trovata:', o.cliente_id)
        } else {
          assegnaClienteDaCamere(result.data, o.unita || '')
        }
        collegaConScheda(elenco, indice + 1, poi)
      })
  }

  function avviaFila(elenco) {
    filaRef.current = elenco.slice()
    filaTotaleRef.current = elenco.length
    filaFattiRef.current = 0
    avanzaFila()
  }

  // Prende il prossimo ospite della fila e apre la creazione scheda.
  // Quando la fila e' finita chiude tutto.
  function avanzaFila() {
    if (filaRef.current.length === 0) {
      ospiteCorrenteRef.current = null
      setFilaInfo(null)
      setShowQuickCustomer(false)
      return
    }
    var o = filaRef.current.shift()
    filaFattiRef.current = filaFattiRef.current + 1
    ospiteCorrenteRef.current = o
    setFilaInfo({
      indice: filaFattiRef.current,
      totale: filaTotaleRef.current,
      nome: nomeOspite(o),
      camera: o.unita || ''
    })
    apriCreazioneOspite(o)
  }

  // Interruzione della fila: quello che e' gia' stato creato RESTA
  // collegato. Non si torna indietro cancellando schede appena nate: in
  // questo programma le cancellazioni silenziose non esistono.
  function interrompiFila() {
    var mancanti = filaRef.current.length
    var fatti = filaFattiRef.current > 0 ? filaFattiRef.current - 1 : 0
    filaRef.current = []
    ospiteCorrenteRef.current = null
    setFilaInfo(null)
    setShowQuickCustomer(false)
    if (mancanti > 0 || filaTotaleRef.current > 0) {
      setAvvisoFila('Trascrizione interrotta: ' + fatti + ' schede su ' + filaTotaleRef.current +
        ' create. Riapri Camere per le altre.')
    }
    filaTotaleRef.current = 0
    filaFattiRef.current = 0
  }

  // Da un ospite dell'albergo a una scheda del ristorante.
  //
  // ⚠️ Non crea niente da sola: apre il pannello con i campi gia'
  // riempiti, che restano modificabili. Una riga su cinque arriva senza
  // cognome utilizzabile, e quel campo vuoto deve vederlo una persona
  // prima che la scheda nasca storpia.
  function apriCreazioneOspite(o) {
    setQuickMode('crea')
    setQuickCustomerId(null)
    setHicIdInAttesa(o.hic_customer_id || null)
    setQuickForm({
      first_name: o.nome_proposto || '',
      last_name: o.cognome_proposto || '',
      phone: o.telefono_proposto || '',
      // Un indirizzo di canale identifica una pratica, non una persona:
      // non lo copiamo nella scheda del cliente.
      email: (o.email_proposta && !o.email_e_alias) ? o.email_proposta : '',
      category: 'hotel_guest',
      notes: '',
      allergie_cliente: ''
    })
    setQuickAllergeni({})
    setQuickConsensoSalute(false)
    setQuickError(null)
    caricaElencoAllergeni()
    setShowQuickCustomer(true)
  }

  // Scrive il nome della camera nel modulo. Se ce n'e' gia' una diversa,
  // le somma invece di sostituirla: e' il primo mattone della
  // prenotazione multipla, e intanto evita che selezionare un secondo
  // ospite cancelli in silenzio la camera del primo.
  function impostaCamera(nomeCamera) {
    var pulito = (nomeCamera || '').trim()
    if (pulito === '') return
    setFormData(function(p) {
      var u = Object.assign({}, p)
      var attuale = (u.camera || '').trim()
      if (attuale === '') {
        u.camera = pulito
        return u
      }
      var pezzi = attuale.split(',')
      for (var i = 0; i < pezzi.length; i++) {
        if (pezzi[i].trim().toLowerCase() === pulito.toLowerCase()) return u
      }
      u.camera = attuale + ', ' + pulito
      return u
    })
  }

  function isSharedDevice() {
    try {
      return localStorage.getItem('icg_shared_device') === '1'
    } catch (e) {
      return false
    }
  }

  // Chiede al database che cosa riconosce in QUESTA prenotazione.
  // Si passa dalla stessa funzione dell'elenco, con mostra_viste = true:
  // qui la prenotazione la stai gia' guardando, che sia gia' stata
  // guardata prima non deve nasconderla.
  function apriNormalizza() {
    setNormAperto(true)
    setNormLoading(true)
    setNormErrore('')
    setNormCercata(true)
    supabase.rpc('prenotazioni_da_normalizzare', {
      p_dal: formData.reservation_date,
      p_al: formData.reservation_date,
      p_mostra_viste: true,
      p_limite: 500
    }).then(function(result) {
      setNormLoading(false)
      if (result.error) {
        setNormErrore('Non sono riuscito a leggere: ' + result.error.message)
        setNormProposte(null)
        return
      }
      var trovata = null
      var dati = result.data || []
      for (var i = 0; i < dati.length; i++) {
        if (dati[i].id === id) { trovata = dati[i]; break }
      }
      setNormProposte(trovata)
    })
  }

  // La camera si AGGIUNGE: il campo somma senza doppioni, ed e' il gesto
  // giusto quando una camera c'e' gia'. Chi vuole sostituire lo dice.
  function normAggiungiCamera(nome) {
    impostaCamera(nome)
    setNormSegna(true)
  }

  function normSostituisciCamera(nome) {
    setFormData(function(p) {
      var out = {}; for (var k in p) { out[k] = p[k] }
      out.camera = nome
      return out
    })
    setNormSegna(true)
  }

  // ⚠️ Si scrive SOLO il lato prenotazione. La tabella gift_card non si
  // tocca: li' il legame viaggia insieme a "usata" e alla data di
  // utilizzo, e marcare come consumato un buono che nessuno ha deciso di
  // consumare sarebbe un danno silenzioso.
  function normAgganciaGift(g) {
    setGiftCardIdEsistente(g.gift_card_id)
    setNormSegna(true)
  }

  function normStaccaGift() {
    setGiftCardIdEsistente(null)
    setNormSegna(true)
  }

  function normNienteDaFare() {
    setNormSegna(true)
  }

  function buildReservationData() {
    var requestedTime = null
    if (selectedHour !== '') requestedTime = pad(parseInt(selectedHour)) + ':' + selectedMinute + ':00'
    // ⚠️ Guarda TUTTI i clienti della prenotazione, non solo
    // l'intestatario: con tre collegati, l'allergene del secondo deve
    // accendere la spia in sala come quello del primo.
    var haAllergeni = Boolean(qualcunoHaAllergeni() || hasAllergiePrenotazione)
    var dati = {
      customer_id: selectedCustomer.id,
      gift_card_id: giftCard ? giftCard.id : (giftCardIdEsistente || null),
      reservation_date: formData.reservation_date,
      meal_type: formData.meal_type,
      requested_time: requestedTime,
      guests_count: totalGuests,
      adults_count: formData.adults_count,
      children_count: formData.children_count,
      table_info: formData.table_info || null,
      // Da quale camera arriva l'ospite. Testo, quindi regge anche piu'
      // camere insieme. Resta modificabile a mano: il pannello propone,
      // non impone.
      camera: (formData.camera || '').trim() || null,
      allergie_prenotazione: (formData.allergie_prenotazione || '').trim() || null,
      notes: formData.notes || null,
      special_requests: formData.special_requests || null,
      source: formData.source,
      has_allergen_alerts: haAllergeni
    }
    // Regola 46: quello che il pannello mostra finisce nei campi qui
    // sopra; l'unica cosa che il pannello scrive di suo e' la data in cui
    // l'hai guardata, che serve solo a togliere la prenotazione
    // dall'elenco. Nessun conteggio, nessuna data di servizio, nessuno
    // stato: gli otto punti che contano i coperti non vedono niente.
    if (normSegna) dati.normalizzata_il = new Date().toISOString()
    return dati
  }

  // Chi firma il salvataggio, adesso:
  //  - se sei "entrato con PIN" (sessione attiva) -> l'utente elevato;
  //  - altrimenti l'utente loggato (postazione personale).
  function firmaCorrente() {
    if (elevato && elevazione) {
      return { user_id: elevazione.user_id, nome: elevazione.nome }
    }
    return {
      user_id: user ? user.id : null,
      nome: profile ? (profile.display_name || (profile.first_name + ' ' + profile.last_name)) : null
    }
  }

  // Serve il PIN? Solo su postazione condivisa quando NON c'e' gia' una
  // sessione attiva. Il PIN, oltre a firmare, apre la sessione: i
  // salvataggi successivi non lo richiederanno finche' la sessione dura.
  function servePin() {
    return isSharedDevice() && !elevato
  }

  // Carica la storia (log) della prenotazione in modifica.
  function caricaStoria() {
    if (!id) return
    supabase.from('prenotazioni_log')
      .select('*')
      .eq('prenotazione_id', id)
      .order('created_at', { ascending: true })
      .then(function(result) {
        if (!result.error && result.data) setStoria(result.data)
      })
  }

  // Scrive una riga nel log. Non blocca l'operazione se fallisce:
  // la prenotazione e' gia' salvata.
  function scriviLog(prenotazioneId, firma) {
    var clienteNome = selectedCustomer
      ? (selectedCustomer.first_name + ' ' + selectedCustomer.last_name)
      : (formData.nome_libero || null)
    var riga = {
      prenotazione_id: prenotazioneId,
      azione: isEditing ? 'modifica' : 'creazione',
      coperti_prima: isEditing ? copertiPrima : null,
      coperti_dopo: totalGuests,
      ok_direttore: okDirettore === true,
      cliente_nome: clienteNome,
      data_prenotazione: formData.reservation_date,
      fascia: formData.meal_type,
      autore_id: firma.user_id,
      autore_nome: firma.nome || null
    }
    return supabase.from('prenotazioni_log').insert(riga)
  }

  // Applica al payload la firma (autore in creazione, modificatore in
  // modifica) e lo stato della spunta "Ok direttore" di QUESTO salvataggio.
  function applicaFirmaEOk(base, firma) {
    var out = {}; for (var k in base) { out[k] = base[k] }

    if (isEditing) {
      out.modificata_da = firma.user_id
      out.modificata_da_nome = firma.nome || null
      out.modificata_at = new Date().toISOString()
    } else {
      out.creata_da = firma.user_id
      out.creata_da_nome = firma.nome || null
    }

    if (okDirettore) {
      out.ok_direttore = true
      out.ok_direttore_da = firma.user_id
      out.ok_direttore_da_nome = firma.nome || null
      out.ok_direttore_at = new Date().toISOString()
    } else {
      out.ok_direttore = false
      out.ok_direttore_da = null
      out.ok_direttore_da_nome = null
      out.ok_direttore_at = null
    }

    return out
  }

  // Salva la prenotazione e poi scrive il log, sempre con la stessa firma.
  function eseguiSalvataggio(base, firma) {
    setSaving(true)
    var payload = applicaFirmaEOk(base, firma)
    var promise = isEditing
      ? supabase.from('reservations').update(payload).eq('id', id).select('id').single()
      : supabase.from('reservations').insert(payload).select('id').single()

    promise.then(function(result) {
      if (result.error) { setSaving(false); alert('Errore nel salvataggio. Riprova.'); return }
      var savedId = (result.data && result.data.id) ? result.data.id : id
      salvaLegamiClienti(savedId, firma).then(function() {
        scriviLog(savedId, firma).then(function() {
          setSaving(false)
          navigate('/prenotazioni/giorno/' + formData.reservation_date)
        })
      })
    })
  }

  // Scrive chi siede a questo tavolo. L'intestatario e' sempre la riga
  // con ordine 0: e' la stessa persona di reservations.customer_id, ma
  // qui ci sta per portarsi dietro la SUA camera e il suo posto in
  // stampa, non per ripetere il fatto di essere l'intestatario.
  //
  // ⚠️ Prima si scrivono le righe nuove, poi si tolgono quelle rimaste
  // indietro. Nell'ordine inverso, un errore a meta' strada lascerebbe la
  // prenotazione senza nessun cliente collegato.
  function salvaLegamiClienti(prenotazioneId, firma) {
    if (!prenotazioneId || !selectedCustomer) return Promise.resolve()

    var righe = [{
      prenotazione_id: prenotazioneId,
      cliente_id: selectedCustomer.id,
      camera: (cameraIntestatario || '').trim() || null,
      ordine: 0,
      creata_da: firma.user_id,
      creata_da_nome: firma.nome || null
    }]
    var ids = ['"' + selectedCustomer.id + '"']
    for (var i = 0; i < clientiCollegati.length; i++) {
      var cc = clientiCollegati[i]
      righe.push({
        prenotazione_id: prenotazioneId,
        cliente_id: cc.cliente_id,
        camera: (cc.camera || '').trim() || null,
        ordine: i + 1,
        creata_da: firma.user_id,
        creata_da_nome: firma.nome || null
      })
      ids.push('"' + cc.cliente_id + '"')
    }

    return supabase.from('prenotazione_clienti')
      .upsert(righe, { onConflict: 'prenotazione_id,cliente_id' })
      .then(function(esito) {
        if (esito.error) {
          // La prenotazione e' salvata: il legame mancante non deve far
          // sembrare fallita l'operazione, ma non si nasconde nemmeno.
          console.error('Clienti collegati non scritti:', esito.error)
          alert('Prenotazione salvata, ma i clienti collegati no: ' + esito.error.message)
          return
        }
        return supabase.from('prenotazione_clienti')
          .delete()
          .eq('prenotazione_id', prenotazioneId)
          .not('cliente_id', 'in', '(' + ids.join(',') + ')')
          .then(function(pulizia) {
            if (pulizia.error) console.error('Legami vecchi non rimossi:', pulizia.error)
          })
      })
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!selectedCustomer) { alert('Seleziona un cliente per la prenotazione.'); return }
    if (!formData.reservation_date) { alert('Seleziona una data.'); return }
    if (formData.adults_count < 1) { alert('Il numero di adulti deve essere almeno 1.'); return }
    if (bloccato) { alert('Questa fascia e in alert: spunta "Ok direttore" per poter salvare.'); return }

    var base = buildReservationData()

    // Postazione condivisa senza sessione attiva: chiedo il PIN, che firma
    // e apre la sessione. Il salvataggio prosegue dentro handlePinConfirmed.
    if (servePin()) {
      setPendingData(base)
      setShowPinModal(true)
      return
    }

    // Sessione attiva o postazione personale: firma automatica.
    eseguiSalvataggio(base, firmaCorrente())
  }

  function handlePinConfirmed(info) {
    setShowPinModal(false)
    // Il PIN apre la sessione: i prossimi salvataggi non lo richiederanno
    // finche' la sessione dura.
    attivaElevazione(info, minutiElevazione)
    var base = pendingData
    setPendingData(null)
    eseguiSalvataggio(base, { user_id: info.user_id, nome: info.nome })
  }

  var clientiFiltrati = listaClienti.filter(function(c) {
    if (!filtroLista) return true
    var f = filtroLista.toLowerCase()
    return (c.last_name + ' ' + c.first_name + ' ' + (c.phone || '')).toLowerCase().indexOf(f) !== -1
  })

  var mealLabel = formData.meal_type === 'lunch' ? 'Pranzo' : 'Cena'

  // Quanti ospiti sono spuntati nel pannello Camere, e quanti di questi
  // dovranno passare dalla creazione scheda.
  var nSelezionatiCamere = 0
  var nDaCreareCamere = 0
  for (var kSel in selezioneCamere) {
    nSelezionatiCamere = nSelezionatiCamere + 1
    if (!selezioneCamere[kSel].cliente_id) nDaCreareCamere = nDaCreareCamere + 1
  }

  // ⚠️ AVVISO, NON BLOCCO, e in una direzione sola.
  // Nove persone a tavola e tre schede riconosciute e' la normalita': chi
  // non ha una scheda siede lo stesso. L'unica situazione impossibile e'
  // l'opposto: piu' schede collegate che coperti dichiarati.
  var nClientiCollegatiTotali = (selectedCustomer ? 1 : 0) + clientiCollegati.length
  var avvisoCoperti = nClientiCollegatiTotali > totalGuests

  // --- Calcolo stato alert della fascia ---
  var limite = (availability && typeof availability.max_covers === 'number') ? availability.max_covers : null
  var copertiDopo = copertiAltri + totalGuests + copertiEvento
  var overLimit = (limite !== null) && (copertiDopo > limite)
  var fasciaInAlert = overLimit || Boolean(alertManuale)
  // L'avviso manuale rende obbligatorio l'ok solo in creazione; l'oltre-limite
  // lo rende obbligatorio sia in creazione sia in modifica.
  var serveOk = overLimit || (Boolean(alertManuale) && !isEditing)
  var bloccato = serveOk && !okDirettore
  var mostraSpunta = fasciaInAlert

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-lg">Caricamento...</div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={function() { navigate(-1) }} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditing ? 'Modifica Prenotazione' : 'Nuova Prenotazione'}
        </h1>
      </div>

      {/* Fascia GIFT CARD: la prenotazione nasce da un buono regalo.
          I dati precompilati sono suggerimenti e restano modificabili. */}
      {giftCard && (
        <div className="mb-6 bg-wine-50 border border-wine-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <Gift size={18} className="text-wine-700 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-wine-900">
                Gift Card {giftCard.codice}
                {giftTipologia ? ' \u2014 ' + giftTipologia.nome : ''}
              </p>
              {etichettaPasto(giftTipologia) && (
                <p className="text-xs text-wine-800 mt-0.5">
                  Servizio: {etichettaPasto(giftTipologia)}
                </p>
              )}
              <p className="text-xs text-wine-800 mt-0.5">
                {(giftCard.beneficiario_nome || giftCard.beneficiario_cognome)
                  ? 'Beneficiario: ' + ((giftCard.beneficiario_nome || '') + ' ' + (giftCard.beneficiario_cognome || '')).trim()
                  : 'Beneficiario non indicato sulla gift card'}
                {giftCard.numero_persone ? ' \u00B7 ' + giftCard.numero_persone + ' persone' : ''}
                {giftCard.committente_contatto ? ' \u00B7 ' + giftCard.committente_contatto : ''}
              </p>
              {giftTipologia && (giftTipologia.degustazione_vini_1 || giftTipologia.degustazione_vini_2) && (
                <p className="text-xs text-wine-700 mt-1">
                  Vini inclusi: {[giftTipologia.degustazione_vini_1, giftTipologia.degustazione_vini_2].filter(Boolean).join(' \u00B7 ')}
                </p>
              )}
              {!isEditing && (
                <p className="text-xs text-wine-600 mt-1.5">
                  Cliente, persone e note sono proposti dalla gift card: controllali e modificali se serve.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          NORMALIZZA PRENOTAZIONE
          Il pannello propone, tu decidi, e niente e' salvato finche' non
          premi Salva. Si apre da solo arrivando dall'elenco.
          ============================================================ */}
      {isEditing && canEdit('prenotazioni') && (
        <div className="mb-6">
          {!normAperto ? (
            <button type="button" onClick={apriNormalizza}
              className="w-full inline-flex items-center justify-center gap-2 bg-white border border-wine-300 text-wine-800 px-5 py-3 rounded-xl hover:bg-wine-50 transition-colors font-medium">
              <Wand2 size={18} />
              Normalizza questa prenotazione
            </button>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-wine-200 p-5">

              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Wand2 size={18} className="text-wine-700" />
                  <h2 className="text-base font-semibold text-gray-900">Cosa riconosco nelle note</h2>
                </div>
                <button type="button" onClick={function() { setNormAperto(false) }}
                  className="p-1 rounded hover:bg-gray-100 text-gray-400">
                  <X size={18} />
                </button>
              </div>

              {normLoading && <p className="text-sm text-gray-500">Leggo...</p>}

              {normErrore !== '' && (
                <p className="text-sm text-red-600">{normErrore}</p>
              )}

              {!normLoading && normErrore === '' && !normProposte && (
                <div>
                  <p className="text-sm text-gray-600">
                    Non c e niente da riconoscere in questa prenotazione.
                  </p>
                  {!normSegna && (
                    <button type="button" onClick={normNienteDaFare}
                      className="mt-3 text-sm text-wine-700 hover:text-wine-900 underline">
                      Segnala come guardata, cosi non torna nell elenco
                    </button>
                  )}
                </div>
              )}

              {!normLoading && normProposte && (
                <div className="space-y-4">

                  {(normProposte.camere_trovate || []).map(function(c, i) {
                    var giaUguale = (formData.camera || '').toLowerCase().split(',').map(function(x) { return x.trim() }).indexOf(c.nome.toLowerCase()) !== -1
                    return (
                      <div key={'nc' + i} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <BedDouble size={16} className="text-wine-600 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900">
                              Nelle note c e <span className="font-semibold">{c.nome}</span>: e la camera?
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5 break-words">
                              ...{c.contesto}...
                            </p>
                            {formData.camera && !giaUguale && (
                              <p className="text-xs text-amber-700 mt-1">
                                Nel campo Camera c e gia: {formData.camera}
                              </p>
                            )}
                          </div>
                        </div>
                        {giaUguale ? (
                          <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                            <Check size={13} /> Gia nel campo Camera
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2 mt-3">
                            <button type="button" onClick={function() { normAggiungiCamera(c.nome) }}
                              className="px-3 py-2 rounded-lg bg-wine-700 text-white text-sm hover:bg-wine-800">
                              {formData.camera ? 'Aggiungila' : 'Si, e la camera'}
                            </button>
                            {formData.camera && (
                              <button type="button" onClick={function() { normSostituisciCamera(c.nome) }}
                                className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
                                Sostituisci quella che c e
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {canEdit('gift_card') && (normProposte.gift_trovate || []).map(function(g, i) {
                    var giaAgganciata = giftCardIdEsistente === g.gift_card_id
                    var altraAgganciata = Boolean(giftCardIdEsistente) && !giaAgganciata
                    return (
                      <div key={'ng' + i} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <Gift size={16} className="text-wine-600 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900">
                              Nelle note c e il codice <span className="font-semibold">{g.codice}</span>
                              {g.tipologia ? ' \u2014 ' + g.tipologia : ''}
                            </p>
                            {g.usata && (
                              <p className="text-xs text-amber-700 mt-1">
                                Questa gift card risulta gia utilizzata.
                              </p>
                            )}
                            {altraAgganciata && (
                              <p className="text-xs text-amber-700 mt-1">
                                A questa prenotazione e gia agganciata un altra gift card: agganciando
                                questa, quella viene staccata.
                              </p>
                            )}
                          </div>
                        </div>
                        {giaAgganciata ? (
                          <div className="flex flex-wrap gap-2 mt-3">
                            <p className="text-xs text-green-700 flex items-center gap-1">
                              <Check size={13} /> Gia agganciata
                            </p>
                            <button type="button" onClick={normStaccaGift}
                              className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
                              Staccala
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={function() { normAgganciaGift(g) }}
                            className="mt-3 px-3 py-2 rounded-lg bg-wine-700 text-white text-sm hover:bg-wine-800">
                            Aggancia questa gift card
                          </button>
                        )}
                      </div>
                    )
                  })}

                  {canEdit('gift_card') && (normProposte.gift_trovate || []).length === 0
                    && (normProposte.tipologie_trovate || []).map(function(t, i) {
                    return (
                      <div key={'nt' + i} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <Gift size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-gray-700 min-w-0">
                            Nelle note c e <span className="font-semibold">{t}</span>, ma nessun codice.
                            Il buono c e, il codice no: va cercato a mano nella pagina Gift Card.
                          </p>
                        </div>
                      </div>
                    )
                  })}

                  {normProposte.ospite_hotel_senza_camera && (
                    <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800 min-w-0">
                        Questo cliente e un ospite dell albergo, ma la camera non c e ne nel campo
                        ne nelle note. Se la sai, scrivila nel campo Camera qui sotto.
                      </p>
                    </div>
                  )}

                  {!normSegna && (
                    <button type="button" onClick={normNienteDaFare}
                      className="text-sm text-gray-500 hover:text-gray-700 underline">
                      Non c e niente da fare qui: segnala come guardata
                    </button>
                  )}

                </div>
              )}

              {normSegna && (
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-start gap-2">
                  <AlertTriangle size={15} className="text-wine-700 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-wine-800">
                    Niente e ancora salvato: premi <span className="font-semibold">Salva</span> in fondo
                    alla pagina.
                  </p>
                </div>
              )}

            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Selezione cliente */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Cliente</h2>

          {selectedCustomer && !showSearch ? (
            <div>
              <div className="flex items-center justify-between p-4 bg-wine-50 rounded-lg border border-wine-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-wine-200 text-wine-800 flex items-center justify-center font-bold text-sm">
                    {selectedCustomer.first_name[0]}{selectedCustomer.last_name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{selectedCustomer.first_name} {selectedCustomer.last_name}</p>
                    <p className="text-sm text-gray-500">
                      {cameraIntestatario
                        ? ('Camera ' + cameraIntestatario)
                        : (selectedCustomer.phone || selectedCustomer.email || 'Nessun contatto')}
                    </p>
                    {selectedCustomer.category && selectedCustomer.category !== 'standard' && (
                      <span className={"px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 inline-block " + categoryColors[selectedCustomer.category]}>
                        {categoryLabels[selectedCustomer.category]}
                      </span>
                    )}
                  </div>
                  <Check size={20} className="text-green-600 ml-2" />
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button type="button"
                    onClick={function() { openEditCustomer(selectedCustomer) }}
                    className="flex items-center gap-1 text-sm text-wine-600 hover:text-wine-800 font-medium">
                    <Edit3 size={14} />
                    Modifica
                  </button>
                  {!isEditing && (
                    <button type="button"
                      onClick={function() { setShowSearch(true); intestatarioRef.current = null; setSelectedCustomer(null); setCustomerAllergens([]); setAllergieLibereCliente(''); setCameraIntestatario('') }}
                      className="text-sm text-wine-600 hover:text-wine-800 font-medium">
                      Cambia
                    </button>
                  )}
                </div>
              </div>

              {(customerAllergens.length > 0 || allergieLibereCliente) && (
                <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-red-600" />
                    <span className="text-sm font-medium text-red-800">Allergeni registrati sul profilo cliente</span>
                  </div>
                  {customerAllergens.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {customerAllergens.map(function(ca, idx) {
                        return <span key={idx} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">{ca.allergens.icon} {ca.allergens.name} ({severitaLabel(ca.severity)})</span>
                      })}
                    </div>
                  )}
                  {allergieLibereCliente && (
                    <p className="text-sm text-red-800 whitespace-pre-wrap mt-2 pt-2 border-t border-red-200">
                      {allergieLibereCliente}
                    </p>
                  )}
                </div>
              )}

              {/* Clienti collegati: chi altro siede a questo tavolo.
                  ⚠️ Non sono coperti. Il numero degli ospiti resta quello
                  scritto a mano nei Dettagli. */}
              {clientiCollegati.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Altri clienti a questo tavolo ({clientiCollegati.length})
                  </p>
                  <div className="space-y-2">
                    {clientiCollegati.map(function(cc) {
                      return (
                        <div key={cc.cliente_id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                {cc.first_name[0]}{cc.last_name[0]}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate">
                                  {cc.first_name} {cc.last_name}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                  {cc.camera ? ('Camera ' + cc.camera) : (cc.phone || cc.email || 'Nessun contatto')}
                                </p>
                              </div>
                            </div>
                            <button type="button" onClick={function() { togliCollegato(cc.cliente_id) }}
                              className="text-sm text-gray-500 hover:text-red-600 font-medium flex-shrink-0">
                              Togli
                            </button>
                          </div>
                          {(cc.allergeni.length > 0 || (cc.allergie_libere && cc.allergie_libere.trim() !== '')) && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <div className="flex items-center gap-1 mb-1">
                                <AlertTriangle size={13} className="text-red-600" />
                                <span className="text-xs font-medium text-red-800">Allergeni</span>
                              </div>
                              {cc.allergeni.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {cc.allergeni.map(function(ca, idx) {
                                    return (
                                      <span key={idx} className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                                        {ca.allergens.icon} {ca.allergens.name} ({severitaLabel(ca.severity)})
                                      </span>
                                    )
                                  })}
                                </div>
                              )}
                              {cc.allergie_libere && cc.allergie_libere.trim() !== '' && (
                                <p className="text-xs text-red-800 whitespace-pre-wrap mt-1">{cc.allergie_libere}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {avvisoFila && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  {avvisoFila}
                </div>
              )}

              {/* Da qui si aggiungono gli altri commensali: dal pannello
                  Camere (chi dorme in casa) o dall anagrafica. */}
              <div className="flex gap-2 flex-wrap mt-4">
                <button type="button" onClick={apriCamere}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 font-medium">
                  <BedDouble size={16} />
                  Camere
                </button>
                <button type="button" onClick={function() { setModoAggiunta(true); apriListaClienti() }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 font-medium">
                  <UserPlus size={16} />
                  Aggiungi cliente
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Cerca per nome, telefono o email..."
                  value={customerSearch}
                  onChange={function(e) { searchCustomers(e.target.value) }}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                  autoFocus
                />
              </div>

              {searchResults.length > 0 && (
                <div className="mb-3 border border-gray-200 rounded-lg overflow-hidden">
                  {searchResults.map(function(customer) {
                    return (
                      <button key={customer.id} type="button" onClick={function() { selectCustomer(customer) }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {customer.first_name[0]}{customer.last_name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900">{customer.last_name} {customer.first_name}</p>
                          <p className="text-sm text-gray-500 truncate">{customer.phone || customer.email || ''}</p>
                        </div>
                        {customer.category && customer.category !== 'standard' && (
                          <span className={"px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 " + categoryColors[customer.category]}>
                            {categoryLabels[customer.category]}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={apriListaClienti}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 font-medium">
                  <Users size={16} />
                  Lista clienti
                </button>
                <button type="button" onClick={openQuickCustomer}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-wine-300 text-sm text-wine-700 hover:bg-wine-50 font-medium">
                  <UserPlus size={16} />
                  Nuovo cliente
                </button>
                {/* Chi dorme qui il giorno della prenotazione. Il pannello
                    segue la data scelta sopra: cambiando data cambia
                    l'elenco. */}
                <button type="button" onClick={apriCamere}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 font-medium">
                  <BedDouble size={16} />
                  Camere
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dettagli prenotazione */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Dettagli Prenotazione</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
              <input type="date" name="reservation_date" value={formData.reservation_date}
                onChange={handleInputChange} required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Turno *
                {selectedHour !== '' && <span className="text-xs text-wine-600 ml-1">(rilevato dall'orario)</span>}
              </label>
              <div className="flex gap-2">
                {MEAL_TYPES.map(function(mt) {
                  var isSelected = formData.meal_type === mt.value
                  return (
                    <button key={mt.value} type="button"
                      onClick={function() {
                        setFormData(function(prev) {
                          var u = {}; for (var k in prev) { u[k] = prev[k] }
                          u.meal_type = mt.value
                          return u
                        })
                      }}
                      className={'flex-1 px-4 py-3 rounded-lg text-sm font-medium border transition-colors ' + (isSelected ? 'bg-wine-700 border-wine-700 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-wine-400')}>
                      {mt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Orario di arrivo</label>
              <div className="flex items-center gap-2">
                <select value={selectedHour} onChange={function(e) { setSelectedHour(e.target.value) }}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white text-base">
                  <option value="">Ore</option>
                  {HOURS.map(function(h) { return <option key={h} value={h}>{pad(h)}</option> })}
                </select>
                <span className="text-xl font-bold text-gray-400">:</span>
                <select value={selectedMinute} onChange={function(e) { setSelectedMinute(e.target.value) }}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white text-base"
                  disabled={selectedHour === ''}>
                  {MINUTES.map(function(m) { return <option key={m} value={m}>{m}</option> })}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fonte</label>
              <select name="source" value={formData.source} onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white text-base">
                <option value="manual">Inserimento manuale</option>
                <option value="phone">Telefono</option>
                <option value="email">Email</option>
                <option value="website">Sito web</option>
                <option value="hotel_in_cloud">Hotel in Cloud</option>
              </select>
            </div>
          </div>

          {/* Ospiti */}
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Numero ospiti</h3>
            <div className="grid grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Adulti *</label>
                <input type="number" name="adults_count" value={formData.adults_count}
                  onChange={handleInputChange} min="1" max="200" required
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base text-center" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Bambini</label>
                <input type="number" name="children_count" value={formData.children_count}
                  onChange={handleInputChange} min="0" max="200"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base text-center" />
              </div>
              <div className="text-center">
                <label className="block text-sm text-gray-600 mb-1">Totale</label>
                <div className="px-4 py-3 bg-wine-100 text-wine-800 rounded-lg font-bold text-lg">{totalGuests}</div>
              </div>
            </div>

            {/* ⚠️ Avviso, non blocco. Piu' schede collegate che coperti
                dichiarati e' l'unica combinazione impossibile: chi non ha
                una scheda a tavola ci sta lo stesso, il contrario no. */}
            {avvisoCoperti && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-900">
                    {'Hai collegato ' + nClientiCollegatiTotali + ' clienti ma gli ospiti dichiarati sono ' +
                      totalGuests + '. Controlla il numero: i coperti restano quelli scritti qui.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Alert fascia / disponibilita */}
          {fasciaInAlert ? (
            <div className="mt-4 p-4 rounded-lg border bg-amber-50 border-amber-300">
              <div className="flex items-start gap-2">
                <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900">
                    {mealLabel + " del " + dataBreve(formData.reservation_date) + " \u2014 fascia in alert"}
                  </p>
                  {overLimit && (
                    <p className="text-sm text-amber-800 mt-0.5">
                      {"Con questa prenotazione: " + copertiDopo + " coperti" + (limite !== null ? " su un limite di " + limite : "") + "."}
                    </p>
                  )}
                  {alertManuale && (
                    <p className="text-sm text-amber-800 mt-0.5">
                      {"Avviso del direttore: " + (alertManuale.testo || "\u2014")}
                    </p>
                  )}
                  {eventoSenzaNumero && (
                    <p className="text-sm text-amber-800 mt-0.5">
                      Un evento su questo turno non ha il numero ospiti: il totale potrebbe essere piu alto.
                    </p>
                  )}

                  {mostraSpunta && (
                    <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={okDirettore}
                        onChange={function(e) { setOkDirettore(e.target.checked) }}
                        className="w-5 h-5 rounded border-gray-300 text-wine-700 focus:ring-wine-500"
                      />
                      <span className={"text-sm font-medium " + (serveOk && !okDirettore ? "text-red-700" : "text-amber-900")}>
                        {serveOk ? "Ok direttore (obbligatorio per salvare)" : "Ok direttore (facoltativo)"}
                      </span>
                    </label>
                  )}
                  {bloccato && (
                    <p className="text-xs text-red-600 mt-1">
                      {"Spunta \u201cOk direttore\u201d per poter salvare la prenotazione."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : eventoSenzaNumero ? (
            <div className="mt-4 p-3 rounded-lg border bg-indigo-50 border-indigo-200">
              <p className="text-sm font-medium text-indigo-800">
                Un evento su questo turno non ha il numero ospiti: il totale potrebbe essere piu alto del previsto.
              </p>
            </div>
          ) : (limite !== null && (
            <div className="mt-4 p-3 rounded-lg border bg-green-50 border-green-200">
              <p className="text-sm font-medium text-green-800">
                {mealLabel + ": ancora " + Math.max(0, limite - copertiDopo) + " coperti disponibili su " + limite}
              </p>
            </div>
          ))}

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

          {/* Camera dell albergo.
              Il pannello "Camere" la propone, ma resta un campo come gli
              altri: si scrive, si corregge, si svuota. Chi prende una
              prenotazione al telefono da un ospite in casa puo scriverla
              a mano senza passare dal pannello. */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Camera</label>
            <div className="relative">
              <BedDouble size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" name="camera" value={formData.camera} onChange={handleInputChange}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                placeholder="es. Aorivola" />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Da compilare solo se gli ospiti dormono in struttura. Per piu camere, separale con una virgola.
            </p>
          </div>

          {/* Note */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea name="notes" value={formData.notes} onChange={handleInputChange} rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
              placeholder="Note interne sulla prenotazione, preferenze posto, richieste particolari..." />
          </div>

          {/* Richieste speciali */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Richieste speciali</label>
            <textarea name="special_requests" value={formData.special_requests} onChange={handleInputChange} rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
              placeholder="es. compleanno, menu vegano, seggiolone..." />
          </div>
        </div>

        {/* Storia della prenotazione (log, sola lettura) */}
        {isEditing && storia.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Storia</h2>
            <ul className="space-y-2">
              {storia.map(function(ev) {
                var chi = ev.autore_nome || 'Qualcuno'
                var frase = ev.azione === 'creazione'
                  ? chi + ' ha creato la prenotazione' + (ev.cliente_nome ? ' per ' + ev.cliente_nome : '') + ' di ' + (ev.coperti_dopo != null ? ev.coperti_dopo : '?') + ' coperti' + (ev.ok_direttore ? ' con ok del direttore' : '')
                  : chi + ' ha modificato' + (ev.cliente_nome ? ' la prenotazione di ' + ev.cliente_nome : ' la prenotazione') + ' da ' + (ev.coperti_prima != null ? ev.coperti_prima : '?') + ' a ' + (ev.coperti_dopo != null ? ev.coperti_dopo : '?') + ' coperti' + (ev.ok_direttore ? ' con ok del direttore' : '')
                return (
                  <li key={ev.id} className="flex items-start gap-2 text-sm">
                    <span className="text-gray-400 font-mono text-xs mt-0.5 flex-shrink-0 whitespace-nowrap">{fmtLogData(ev.created_at)}</span>
                    <span className="text-gray-700">{frase}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Pulsanti */}
        <div className="flex flex-col sm:flex-row gap-3 pb-8">
          <button type="submit" disabled={saving || !selectedCustomer || bloccato}
            className="flex-1 flex items-center justify-center gap-2 bg-wine-700 text-white px-6 py-4 rounded-xl hover:bg-wine-800 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-base">
            <Save size={20} />
            <span>{saving ? 'Salvataggio...' : (isEditing ? 'Salva Modifiche' : 'Conferma Prenotazione')}</span>
          </button>
          <button type="button" onClick={function() { navigate(-1) }}
            className="px-6 py-4 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium text-gray-700 text-base">
            Annulla
          </button>
        </div>

      </form>

      {/* Modale lista clienti */}
      {showListaClienti && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col max-h-screen sm:max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">
                {modoAggiunta ? 'Aggiungi un cliente' : 'Seleziona cliente'}
              </h2>
              <button type="button" onClick={function() { setShowListaClienti(false); setModoAggiunta(false) }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <input type="text" placeholder="Filtra per nome o telefono..."
                value={filtroLista}
                onChange={function(e) { setFiltroLista(e.target.value) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                autoFocus />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingLista ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-gray-400 text-sm">Caricamento...</p>
                </div>
              ) : clientiFiltrati.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Nessun cliente trovato</div>
              ) : (
                clientiFiltrati.map(function(customer) {
                  return (
                    <div key={customer.id} className="flex items-stretch border-b border-gray-100 last:border-0">
                      <button type="button" onClick={function() {
                          if (modoAggiunta) {
                            aggiungiCollegato(customer, '')
                            setShowListaClienti(false)
                            setModoAggiunta(false)
                            return
                          }
                          selectCustomer(customer)
                        }}
                        className="flex-1 min-w-0 text-left px-5 py-3.5 hover:bg-gray-50 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {customer.first_name[0]}{customer.last_name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900">{customer.last_name} {customer.first_name}</p>
                          <p className="text-xs text-gray-500 truncate">{customer.phone || customer.email || ''}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {customer.category && customer.category !== 'standard' && (
                            <span className={"px-2 py-0.5 rounded-full text-xs font-medium " + categoryColors[customer.category]}>
                              {categoryLabels[customer.category]}
                            </span>
                          )}
                          <ChevronRight size={16} className="text-gray-300" />
                        </div>
                      </button>
                      <button type="button" onClick={function() { openEditCustomer(customer) }}
                        title="Modifica cliente"
                        className="px-4 flex items-center text-gray-400 hover:text-wine-700 hover:bg-gray-50 border-l border-gray-100">
                        <Edit3 size={16} />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex-shrink-0">
              <button type="button" onClick={function() { setShowListaClienti(false); openQuickCustomer() }}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-wine-300 text-wine-700 rounded-lg text-sm font-medium hover:bg-wine-50">
                <UserPlus size={16} />
                Registra nuovo cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale cliente rapido */}
      {showQuickCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {filaInfo
                    ? ('Scheda ' + filaInfo.indice + ' di ' + filaInfo.totale)
                    : (quickMode === 'modifica' ? 'Modifica cliente' : 'Nuovo cliente')}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {filaInfo
                    ? (filaInfo.nome + (filaInfo.camera ? ' - camera ' + filaInfo.camera : ''))
                    : (quickMode === 'modifica'
                      ? 'Le correzioni valgono per tutta l anagrafica, non solo per questa prenotazione'
                      : 'Il cliente verra creato e selezionato automaticamente')}
                </p>
              </div>
              <button type="button" onClick={function() {
                  if (filaInfo) { interrompiFila(); setGiftClienteNuovo(false); return }
                  setShowQuickCustomer(false); setGiftClienteNuovo(false)
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleQuickCustomerSubmit} className="p-6 space-y-4">
              {quickError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{quickError}</div>}
              {giftClienteNuovo && (
                <div className="p-3 bg-wine-50 border border-wine-200 rounded-lg text-xs text-wine-800">
                  Il beneficiario della gift card non risulta in anagrafica. I dati qui sotto
                  sono proposti dal buono: correggili se serve, poi conferma per creare il cliente.
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
                  <input type="text" value={quickForm.first_name}
                    onChange={function(e) { var v = e.target.value; setQuickForm(function(p) { var u = Object.assign({}, p); u.first_name = v; return u }) }}
                    required autoFocus className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cognome *</label>
                  <input type="text" value={quickForm.last_name}
                    onChange={function(e) { var v = e.target.value; setQuickForm(function(p) { var u = Object.assign({}, p); u.last_name = v; return u }) }}
                    required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Telefono</label>
                <input type="tel" value={quickForm.phone} placeholder="+39..."
                  onChange={function(e) { var v = e.target.value; setQuickForm(function(p) { var u = Object.assign({}, p); u.phone = v; return u }) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={quickForm.email}
                  onChange={function(e) { var v = e.target.value; setQuickForm(function(p) { var u = Object.assign({}, p); u.email = v; return u }) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Categoria</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIE_CLIENTE.map(function(c) {
                    var attiva = quickForm.category === c.value
                    return (
                      <button key={c.value} type="button"
                        onClick={function() { setQuickForm(function(p) { var u = Object.assign({}, p); u.category = c.value; return u }) }}
                        className={"px-3 py-2 rounded-lg text-sm border transition-colors " + (attiva ? "bg-wine-700 text-white border-wine-700" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50")}>
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
                <textarea value={quickForm.notes} rows={2} placeholder="Informazioni utili..."
                  onChange={function(e) { var v = e.target.value; setQuickForm(function(p) { var u = Object.assign({}, p); u.notes = v; return u }) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 resize-none" />
              </div>
              <div className="pt-2 border-t border-gray-100">
                <AllergeniEditor
                  compatto
                  allergens={elencoAllergeni}
                  selected={quickAllergeni}
                  onSelectedChange={setQuickAllergeni}
                  testoLibero={quickForm.allergie_cliente}
                  onTestoLiberoChange={function(v) { setQuickForm(function(p) { var u = Object.assign({}, p); u.allergie_cliente = v; return u }) }}
                  consensoSalute={quickConsensoSalute}
                  onConsensoChange={setQuickConsensoSalute}
                />
              </div>
              <p className="text-xs text-gray-400">Indirizzo, marketing e altri consensi si gestiscono da Anagrafica Clienti.</p>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={function() {
                    if (filaInfo) { interrompiFila(); return }
                    setShowQuickCustomer(false)
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
                <button type="submit" disabled={quickLoading}
                  className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  {quickLoading ? 'Salvataggio...' : (quickMode === 'modifica' ? 'Salva modifiche' : 'Crea e seleziona')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pannello "Camere": chi sta in casa il giorno della prenotazione */}
      {showCamere && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col max-h-screen sm:max-h-[85vh]">

            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Camere</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Chi sta in casa il {dataBreve(formData.reservation_date)}
                </p>
              </div>
              <button type="button" onClick={function() { setShowCamere(false) }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {erroreCamere && (
                <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{erroreCamere}</div>
              )}

              {loadingCamere ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-gray-400 text-sm">Caricamento...</p>
                </div>
              ) : ospitiGiorno.length === 0 && !erroreCamere ? (
                <div className="text-center py-10 px-6">
                  <p className="text-gray-500 text-sm">Nessuna camera occupata in questa data.</p>
                  <p className="text-gray-400 text-xs mt-2">
                    I dati arrivano dall ultimo aggiornamento di Hotel in Cloud.
                  </p>
                </div>
              ) : (
                GRUPPI_CAMERE.map(function(g) {
                  var righe = ospitiGiorno.filter(function(o) { return o.gruppo === g.chiave })
                  if (righe.length === 0) return null
                  return (
                    <div key={g.chiave}>
                      <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 sticky top-0">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {g.titolo} <span className="text-gray-400">({righe.length})</span>
                        </p>
                      </div>
                      {righe.map(function(o) {
                        var collegato = Boolean(o.cliente_id)
                        var chiave = g.chiave + '-' + o.reservation_id
                        var spuntato = Boolean(selezioneCamere[chiave])
                        return (
                          <button
                            key={chiave}
                            type="button"
                            onClick={function() { toggleOspite(chiave, o) }}
                            className={
                              "w-full text-left px-5 py-3.5 border-b border-gray-100 last:border-0 flex items-center gap-3 " +
                              (spuntato ? "bg-wine-50" : "hover:bg-gray-50")
                            }
                          >
                            <div className={
                              "w-6 h-6 rounded border flex items-center justify-center flex-shrink-0 " +
                              (spuntato ? "bg-wine-700 border-wine-700" : "bg-white border-gray-300")
                            }>
                              {spuntato && <Check size={14} className="text-white" />}
                            </div>
                            <div className="w-14 flex-shrink-0">
                              <span className="inline-block px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-medium">
                                {o.unita || '-'}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">
                                {nomeOspite(o)}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {collegato
                                  ? 'Gia collegato a ' + (o.cliente_nome || 'una scheda')
                                  : (o.n_ospiti ? o.n_ospiti + ' ospiti in camera' : 'Serve creare la scheda cliente')}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex-shrink-0 space-y-3">
              <p className="text-xs text-gray-400 text-center">
                Chi arriva e chi resta dorme la notte di questa data. Chi lascia la camera
                ha dormito la notte precedente.
              </p>
              {nSelezionatiCamere > 0 && nDaCreareCamere > 0 && (
                <p className="text-xs text-gray-500 text-center">
                  {nDaCreareCamere === 1
                    ? 'Una delle persone spuntate non ha una scheda: te la faccio compilare dopo la conferma.'
                    : ('Di queste, ' + nDaCreareCamere + ' non hanno una scheda: te le faccio compilare una alla volta dopo la conferma.')}
                </p>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={function() { setShowCamere(false) }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  Annulla
                </button>
                <button type="button" onClick={confermaCamere} disabled={nSelezionatiCamere === 0}
                  className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-gray-200 disabled:text-gray-400 text-white px-4 py-2.5 rounded-lg text-sm font-medium">
                  {nSelezionatiCamere === 0 ? 'Conferma' : ('Conferma (' + nSelezionatiCamere + ')')}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      <ComparazioneClienti
        open={showComparazione}
        dati={{
          first_name: quickForm.first_name,
          last_name: quickForm.last_name,
          phone: quickForm.phone,
          email: quickForm.email
        }}
        candidati={candidati}
        salvando={quickLoading}
        onUsa={usaSchedaTrovata}
        onCreaComunque={creaComunqueNuova}
        onAnnulla={annullaComparazione}
      />

      <ConfermaPin
        open={showPinModal}
        title={isEditing ? 'Conferma modifica' : 'Conferma prenotazione'}
        message={isEditing
          ? 'Inserisci il tuo PIN a 6 cifre per registrare la modifica a tuo nome. Resterai attivo per qualche minuto senza doverlo reinserire.'
          : 'Inserisci il tuo PIN a 6 cifre per formalizzare la prenotazione a tuo nome. Resterai attivo per qualche minuto senza doverlo reinserire.'}
        onCancel={function() { setShowPinModal(false); setPendingData(null) }}
        onConfirmed={handlePinConfirmed}
      />

    </div>
  )
}

export default ReservationForm
