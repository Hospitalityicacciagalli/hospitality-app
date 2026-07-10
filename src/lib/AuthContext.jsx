import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

var AuthContext = createContext(null)

// ============================================================
// Elenco delle funzioni/menu' del sistema.
// type 'standard' = livelli none/read/write
// type 'cassa'    = livelli none/light/full
// loginReale true = ramo che il PIN NON puo' sbloccare: richiede
//                   il login vero (il database ricontrolla chi sei).
//                   Nella matrice permessi viene mostrato con un
//                   colore diverso.
// Unica fonte di verita': importata anche da UserManagement.
// ============================================================
export var FEATURES = [
  { key: 'prenotazioni',         label: 'Prenotazioni',         type: 'standard' },
  { key: 'importa_prenotazioni', label: 'Importa prenotazioni', type: 'standard' },
  { key: 'limiti',               label: 'Limiti coperti',       type: 'standard' },
  { key: 'alert_prenotazioni',   label: 'Alert prenotazioni',   type: 'standard' },
  { key: 'clienti',              label: 'Clienti',              type: 'standard' },
  { key: 'sale',                 label: 'Sale e Tavoli',        type: 'standard' },
  { key: 'staff',                label: 'Staff',                type: 'standard' },
  { key: 'turni',                label: 'Turni',                type: 'standard' },
  { key: 'cassa',                label: 'Cassa',                type: 'cassa' },
  { key: 'cassaforte',           label: 'Cassaforte',           type: 'standard' },
  { key: 'totali_cassa',         label: 'Totali cassa',         type: 'standard' },
  { key: 'variabili_cassa',      label: 'Variabili cassa',      type: 'standard' },
  { key: 'centri_costo',         label: 'Centri di costo',      type: 'standard' },
  { key: 'ordini_bordo',         label: 'Ordini Bordo',         type: 'standard' },
  { key: 'listino_bordo',        label: 'Listino Bordo',        type: 'standard' },
  { key: 'gift_card',            label: 'Gift Card',            type: 'standard' },
  { key: 'wine_tour',            label: 'Wine Tour',            type: 'standard' },
  { key: 'cooking_class',        label: 'Cooking Class',        type: 'standard' },
  { key: 'stipendi',             label: 'Stipendi',             type: 'standard' },
  { key: 'campagna_riepilogo',   label: 'Campagna · Riepilogo', type: 'standard' },
  { key: 'campagna_importa',     label: 'Campagna · Importa',   type: 'standard' },
  { key: 'campagna_stipendi',    label: 'Campagna · In stipendi', type: 'standard' },
  { key: 'impostazioni',         label: 'Impostazioni',         type: 'standard' },
  { key: 'utenti',               label: 'Utenti App',           type: 'standard', loginReale: true }
]

// Rami che il PIN non puo' sbloccare (richiedono login reale).
// Per ora solo "utenti"; se in futuro se ne aggiungono, basta
// mettere loginReale:true nella riga di FEATURES qui sopra.
export function featureRichiedeLoginReale(feature) {
  for (var i = 0; i < FEATURES.length; i++) {
    if (FEATURES[i].key === feature) return FEATURES[i].loginReale === true
  }
  return false
}

// ============================================================
// Permessi predefiniti per ruolo.
// Deve coincidere con la migrazione SQL.
// Usato come fallback se un profilo non ha ancora il jsonb popolato.
// ============================================================
export var DEFAULT_PERMS_BY_ROLE = {
  super_admin: { prenotazioni: 'write', importa_prenotazioni: 'write', limiti: 'write', alert_prenotazioni: 'write', clienti: 'write', sale: 'write', staff: 'write', turni: 'write', cassa: 'full',  cassaforte: 'write', totali_cassa: 'write', variabili_cassa: 'write', centri_costo: 'write', ordini_bordo: 'write', listino_bordo: 'write', gift_card: 'write', wine_tour: 'write', cooking_class: 'write', stipendi: 'write', campagna_riepilogo: 'write', campagna_importa: 'write', campagna_stipendi: 'write', impostazioni: 'write', utenti: 'write' },
  proprieta:   { prenotazioni: 'write', importa_prenotazioni: 'none',  limiti: 'write', alert_prenotazioni: 'write', clienti: 'write', sale: 'read',  staff: 'none',  turni: 'none',  cassa: 'full',  cassaforte: 'write', totali_cassa: 'write', variabili_cassa: 'write', centri_costo: 'write', ordini_bordo: 'read',  listino_bordo: 'none',  gift_card: 'write', wine_tour: 'write', cooking_class: 'write', stipendi: 'write', campagna_riepilogo: 'write', campagna_importa: 'write', campagna_stipendi: 'write', impostazioni: 'none',  utenti: 'none' },
  direttore:   { prenotazioni: 'write', importa_prenotazioni: 'write', limiti: 'write', alert_prenotazioni: 'write', clienti: 'write', sale: 'read',  staff: 'write', turni: 'write', cassa: 'full',  cassaforte: 'write', totali_cassa: 'write', variabili_cassa: 'write', centri_costo: 'write', ordini_bordo: 'write', listino_bordo: 'write', gift_card: 'write', wine_tour: 'write', cooking_class: 'write', stipendi: 'none',  campagna_riepilogo: 'write', campagna_importa: 'write', campagna_stipendi: 'write', impostazioni: 'write', utenti: 'none' },
  reception:   { prenotazioni: 'write', importa_prenotazioni: 'none',  limiti: 'none', alert_prenotazioni: 'none',  clienti: 'write', sale: 'read',  staff: 'read',  turni: 'none',  cassa: 'full',  cassaforte: 'none',  totali_cassa: 'none', variabili_cassa: 'none', centri_costo: 'none', ordini_bordo: 'write', listino_bordo: 'write', gift_card: 'write', wine_tour: 'write', cooking_class: 'write', stipendi: 'none',  campagna_riepilogo: 'none', campagna_importa: 'none', campagna_stipendi: 'none', impostazioni: 'none',  utenti: 'none' },
  sala:        { prenotazioni: 'write', importa_prenotazioni: 'none',  limiti: 'none', alert_prenotazioni: 'none',  clienti: 'write', sale: 'read',  staff: 'none',  turni: 'none',  cassa: 'full',  cassaforte: 'none',  totali_cassa: 'none', variabili_cassa: 'none', centri_costo: 'none', ordini_bordo: 'write', listino_bordo: 'write', gift_card: 'read',  wine_tour: 'read',  cooking_class: 'read',  stipendi: 'none',  campagna_riepilogo: 'none', campagna_importa: 'none', campagna_stipendi: 'none', impostazioni: 'none',  utenti: 'none' },
  cucina:      { prenotazioni: 'read',  importa_prenotazioni: 'none',  limiti: 'none', alert_prenotazioni: 'none',  clienti: 'read',  sale: 'none',  staff: 'none',  turni: 'none',  cassa: 'none',  cassaforte: 'none',  totali_cassa: 'none', variabili_cassa: 'none', centri_costo: 'none', ordini_bordo: 'none',  listino_bordo: 'none',  gift_card: 'none',  wine_tour: 'none',  cooking_class: 'none',  stipendi: 'none',  campagna_riepilogo: 'none', campagna_importa: 'none', campagna_stipendi: 'none', impostazioni: 'none',  utenti: 'none' }
}

// Pavimento di sicurezza per ruoli non previsti.
var BASE_FALLBACK = { prenotazioni: 'write', importa_prenotazioni: 'none', limiti: 'none', alert_prenotazioni: 'none', clienti: 'write', sale: 'none', staff: 'none', turni: 'none', cassa: 'light', cassaforte: 'none', totali_cassa: 'none', variabili_cassa: 'none', centri_costo: 'none', ordini_bordo: 'none', listino_bordo: 'none', gift_card: 'none', wine_tour: 'none', cooking_class: 'none', stipendi: 'none', campagna_riepilogo: 'none', campagna_importa: 'none', campagna_stipendi: 'none', impostazioni: 'none', utenti: 'none' }

export function defaultPermissionsForRole(role) {
  return DEFAULT_PERMS_BY_ROLE[role] || BASE_FALLBACK
}

// Durata di default dell'elevazione se Impostazioni non fornisce un valore.
var ELEVAZIONE_DEFAULT_MINUTI = 5

export function AuthProvider(props) {
  var sessionState = useState(null)
  var session = sessionState[0]
  var setSession = sessionState[1]

  var profileState = useState(null)
  var profile = profileState[0]
  var setProfile = profileState[1]

  var loadingState = useState(true)
  var loading = loadingState[0]
  var setLoading = loadingState[1]

  // ----------------------------------------------------------
  // Stato ELEVAZIONE (Funzione C)
  //   elevazione = null quando si e' al base.
  //   Quando attiva: { user_id, nome, role, permissions, scadenza }
  //   scadenza e' un timestamp (ms) oltre il quale si torna al base.
  // ----------------------------------------------------------
  var elevazioneState = useState(null)
  var elevazione = elevazioneState[0]
  var setElevazione = elevazioneState[1]

  // Secondi residui prima della scadenza (per la barra/timer nel Layout).
  var secondiResiduiState = useState(0)
  var secondiResidui = secondiResiduiState[0]
  var setSecondiResidui = secondiResiduiState[1]

  var elevazioneTimerRef = useRef(null)

  useEffect(function() {
    supabase.auth.getSession().then(function(result) {
      setSession(result.data.session)
      if (result.data.session) {
        loadProfile(result.data.session.user.id)
      } else {
        setLoading(false)
      }
    })

    var listener = supabase.auth.onAuthStateChange(function(event, newSession) {
      setSession(newSession)
      if (newSession) {
        loadProfile(newSession.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
      // Solo un vero logout (o assenza di sessione) annulla l'elevazione.
      // Gli eventi di routine (rinnovo del token, ritorno in primo piano)
      // NON devono spegnerla, altrimenti la finestra cade da sola.
      if (event === 'SIGNED_OUT' || !newSession) {
        terminaElevazione()
      }
    })

    return function() {
      listener.data.subscription.unsubscribe()
      if (elevazioneTimerRef.current) clearInterval(elevazioneTimerRef.current)
    }
  }, [])

  function loadProfile(userId) {
    supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()
      .then(function(result) {
        if (!result.error) {
          setProfile(result.data)
        }
        setLoading(false)
      })
  }

  function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email: email, password: password })
  }

  function signOut() {
    terminaElevazione()
    return supabase.auth.signOut().then(function() {
      setSession(null)
      setProfile(null)
    })
  }

  // ----------------------------------------------------------
  // ELEVAZIONE — avvio, rinnovo, termine, tic del timer
  // ----------------------------------------------------------

  // Fa partire (o rinnova) il tic al secondo che aggiorna i secondi
  // residui e, alla scadenza, riporta automaticamente al base.
  function avviaTimer(scadenza) {
    if (elevazioneTimerRef.current) clearInterval(elevazioneTimerRef.current)
    function aggiorna() {
      var ms = scadenza - Date.now()
      if (ms <= 0) {
        setSecondiResidui(0)
        terminaElevazione()
      } else {
        setSecondiResidui(Math.ceil(ms / 1000))
      }
    }
    aggiorna()
    elevazioneTimerRef.current = setInterval(aggiorna, 1000)
  }

  // Attiva l'elevazione con i dati verificati (info) e la durata in minuti.
  // info = { user_id, nome, role, permissions } (da verify_pin_utente).
  function attivaElevazione(info, minuti) {
    var durata = (minuti && minuti > 0) ? minuti : ELEVAZIONE_DEFAULT_MINUTI
    var scadenza = Date.now() + durata * 60 * 1000
    var dato = {
      user_id: info.user_id,
      nome: info.nome,
      role: info.role,
      permissions: (info.permissions && typeof info.permissions === 'object') ? info.permissions : null,
      scadenza: scadenza
    }
    setElevazione(dato)
    avviaTimer(scadenza)
  }

  // Estende la finestra ripartendo da adesso (usato al rinnovo col PIN).
  function rinnovaElevazione(minuti) {
    if (!elevazione) return
    var durata = (minuti && minuti > 0) ? minuti : ELEVAZIONE_DEFAULT_MINUTI
    var scadenza = Date.now() + durata * 60 * 1000
    setElevazione(function(prev) {
      if (!prev) return prev
      var u = {}; for (var k in prev) { u[k] = prev[k] }
      u.scadenza = scadenza
      return u
    })
    avviaTimer(scadenza)
  }

  // Torna al base: spegne l'elevazione e ferma il timer.
  function terminaElevazione() {
    if (elevazioneTimerRef.current) {
      clearInterval(elevazioneTimerRef.current)
      elevazioneTimerRef.current = null
    }
    setSecondiResidui(0)
    setElevazione(null)
  }

  var elevato = elevazione !== null

  // ----------------------------------------------------------
  // PERMESSI per funzione.
  // Se elevati, si guardano ruolo/permessi dell'utente elevato;
  // altrimenti quelli del profilo base loggato.
  // ----------------------------------------------------------

  // Ruolo/permessi "efficaci": elevazione se attiva, altrimenti base.
  function ruoloEfficace() {
    if (elevato) return elevazione.role
    return profile ? profile.role : null
  }

  function permessiEfficaci() {
    if (elevato) {
      if (elevazione.permissions) return elevazione.permissions
      return defaultPermissionsForRole(elevazione.role)
    }
    if (!profile) return {}
    if (profile.permissions && typeof profile.permissions === 'object') {
      return profile.permissions
    }
    return defaultPermissionsForRole(profile.role)
  }

  // Mantengo currentPermissions per compatibilita' con chi la usa gia'.
  function currentPermissions() {
    return permessiEfficaci()
  }

  function permissionLevel(feature) {
    var role = ruoloEfficace()
    if (!role) return 'none'
    if (role === 'super_admin') {
      return feature === 'cassa' ? 'full' : 'write'
    }
    var perms = permessiEfficaci()
    return perms[feature] || 'none'
  }

  function canView(feature) {
    return permissionLevel(feature) !== 'none'
  }

  function canEdit(feature) {
    var lvl = permissionLevel(feature)
    if (feature === 'cassa') return lvl === 'full'
    return lvl === 'write'
  }

  // ----------------------------------------------------------
  // RETROCOMPATIBILITA' — vecchio sistema a ruoli (pagine non migrate)
  // Nota: hasRole/canWrite guardano SEMPRE il profilo base loggato,
  // non l'elevazione. I rami che dipendono da questi controlli sono
  // quelli "login reale" (es. utenti): il PIN non li sblocca, ed e'
  // esattamente il comportamento voluto.
  // ----------------------------------------------------------
  function hasRole(roles) {
    if (!profile) return false
    if (typeof roles === 'string') roles = [roles]
    return roles.indexOf(profile.role) !== -1
  }

  function canWrite(module) {
    if (!profile) return false
    var role = profile.role

    if (role === 'super_admin') return true

    if (module === 'customers' || module === 'reservations' || module === 'customer_allergens') {
      return ['proprieta', 'direttore', 'reception', 'sala'].indexOf(role) !== -1
    }

    if (module === 'gdpr_consents') {
      return ['proprieta', 'direttore', 'reception'].indexOf(role) !== -1
    }

    if (module === 'restaurant_settings' || module === 'restaurant_closures') {
      return ['direttore'].indexOf(role) !== -1
    }

    if (module === 'event_dates') {
      return ['direttore', 'reception'].indexOf(role) !== -1
    }

    if (module === 'user_profiles') {
      return false
    }

    return false
  }

  var user = session ? session.user : null

  var value = {
    session: session,
    user: user,
    profile: profile,
    loading: loading,
    signIn: signIn,
    signOut: signOut,
    permissionLevel: permissionLevel,
    canView: canView,
    canEdit: canEdit,
    currentPermissions: currentPermissions,
    hasRole: hasRole,
    canWrite: canWrite,
    // --- Elevazione (Funzione C) ---
    elevazione: elevazione,
    elevato: elevato,
    secondiResidui: secondiResidui,
    attivaElevazione: attivaElevazione,
    rinnovaElevazione: rinnovaElevazione,
    terminaElevazione: terminaElevazione
  }

  return (
    <AuthContext.Provider value={value}>
      {props.children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  var context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve essere usato dentro AuthProvider')
  }
  return context
}
