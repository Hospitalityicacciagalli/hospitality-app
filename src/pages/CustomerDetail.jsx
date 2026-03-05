import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Edit, Trash2, Phone, Mail, MapPin, AlertTriangle, Shield, ShieldCheck, ShieldX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import AllergenBadge from '../components/AllergenBadge'

function makePhoneLink(phone) {
  return "tel:" + phone
}

function makeMailLink(email) {
  return "mailto:" + email
}

function makeEditLink(id) {
  return "/clienti/" + id + "/modifica"
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })
}

function CustomerDetail() {
  var params = useParams()
  var id = params.id
  var navigate = useNavigate()
  var customerState = useState(null)
  var customer = customerState[0]
  var setCustomer = customerState[1]
  var allergensState = useState([])
  var allergens = allergensState[0]
  var setAllergens = allergensState[1]
  var consentsState = useState([])
  var consents = consentsState[0]
  var setConsents = consentsState[1]
  var loadingState = useState(true)
  var loading = loadingState[0]
  var setLoading = loadingState[1]
  var deleteState = useState(false)
  var showDeleteConfirm = deleteState[0]
  var setShowDeleteConfirm = deleteState[1]

  useEffect(function() {
    loadCustomer()
  }, [id])

  function loadCustomer() {
    setLoading(true)
    supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .single()
      .then(function(result) {
        if (result.error) {
          alert("Cliente non trovato.")
          navigate("/clienti")
          return
        }
        setCustomer(result.data)
        return supabase
          .from("customer_allergens")
          .select("severity, notes, allergens ( id, name, description, icon )")
          .eq("customer_id", id)
      })
      .then(function(result) {
        if (result && !result.error) {
          setAllergens(result.data)
        }
        return supabase
          .from("gdpr_consents")
          .select("*")
          .eq("customer_id", id)
      })
      .then(function(result) {
        if (result && !result.error) {
          setConsents(result.data)
        }
        setLoading(false)
      })
  }

  function handleDelete() {
    supabase
      .from("customers")
      .update({ is_active: false })
      .eq("id", id)
      .then(function(result) {
        if (result.error) {
          alert("Errore durante la disattivazione.")
        } else {
          navigate("/clienti")
        }
      })
  }

  var categoryLabels = {
    standard: "Standard",
    vip: "VIP",
    press: "Stampa",
    business: "Business",
    hotel_guest: "Ospite Hotel"
  }

  var categoryColors = {
    standard: "bg-gray-100 text-gray-700",
    vip: "bg-amber-100 text-amber-800",
    press: "bg-purple-100 text-purple-800",
    business: "bg-blue-100 text-blue-800",
    hotel_guest: "bg-green-100 text-green-800"
  }

  var consentLabels = {
    data_processing: "Trattamento dati personali",
    health_data: "Dati sulla salute (allergeni)",
    marketing: "Comunicazioni commerciali",
    profiling: "Profilazione"
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-lg">Caricamento...</div>
      </div>
    )
  }

  if (!customer) return null

  var fullAddress = [customer.address, customer.zip_code, customer.city, customer.province]
    .filter(Boolean)
    .join(", ")

  var catColor = "px-3 py-1 rounded-full text-sm font-medium " + categoryColors[customer.category]
  var catLabel = categoryLabels[customer.category]
  var regDate = "Cliente dal " + formatDate(customer.created_at)
  var editLink = makeEditLink(id)
  var phoneLink = customer.phone ? makePhoneLink(customer.phone) : null
  var mailLink = customer.email ? makeMailLink(customer.email) : null

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={function() { navigate("/clienti") }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {customer.first_name} {customer.last_name}
              </h1>
              <span className={catColor}>
                {catLabel}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              {regDate}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={editLink}
            className="flex items-center gap-2 bg-wine-700 text-white px-4 py-2.5 rounded-lg hover:bg-wine-800 transition-colors font-medium"
          >
            <Edit size={16} />
            <span className="hidden sm:inline">Modifica</span>
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Contatti</h2>
          <div className="space-y-3">
            {phoneLink && (
              
                href={phoneLink}
                className="flex items-center gap-3 text-gray-700 hover:text-wine-700 transition-colors"
              >
                <Phone size={18} className="text-gray-400" />
                <span className="text-base">{customer.phone}</span>
              </a>
            )}
            {mailLink && (
              
                href={mailLink}
                className="flex items-center gap-3 text-gray-700 hover:text-wine-700 transition-colors"
              >
                <Mail size={18} className="text-gray-400" />
                <span className="text-base">{customer.email}</span>
              </a>
            )}
            {fullAddress && (
              <div className="flex items-start gap-3 text-gray-700">
                <MapPin size={18} className="text-gray-400 mt-0.5" />
                <span className="text-base">{fullAddress}</span>
              </div>
            )}
            {!customer.phone && !customer.email && (
              <p className="text-gray-400 italic">Nessun contatto registrato</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={20} className={allergens.length > 0 ? "text-red-500" : "text-gray-300"} />
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

        {customer.notes && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Note</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={20} className="text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Privacy (GDPR)</h2>
          </div>

          <div className="space-y-3">
            {Object.entries(consentLabels).map(function(entry) {
              var type = entry[0]
              var label = entry[1]
              var consent = consents.find(function(c) { return c.consent_type === type })
              var granted = consent ? consent.granted : false
              var dateStr = granted && consent && consent.granted_at ? "(" + formatDate(consent.granted_at) + ")" : null

              return (
                <div key={type} className="flex items-center gap-3">
                  {granted ? (
                    <ShieldCheck size={18} className="text-green-500" />
                  ) : (
                    <ShieldX size={18} className="text-gray-300" />
                  )}
                  <span className={granted ? "text-gray-700" : "text-gray-400"}>
                    {label}
                  </span>
                  {dateStr && (
                    <span className="text-xs text-gray-400">
                      {dateStr}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

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
              <Trash2 size={16} />
              <span>Disattiva Cliente</span>
            </button>
          )}
        </div>
      </div>

      <div className="h-8" />
    </div>
  )
}

export default CustomerDetail
