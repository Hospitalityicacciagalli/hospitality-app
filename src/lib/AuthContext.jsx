import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

var AuthContext = createContext(null)

// ============================================================
// Elenco delle funzioni/menu' del sistema.
// type 'standard' = livelli none/read/write
// type 'cassa'    = livelli none/light/full
// Unica fonte di verita': importata anche da UserManagement.
// ============================================================
export var FEATURES = [
  { key: 'prenotazioni', label: 'Prenotazioni',  type: 'standard' },
  { key: 'clienti',      label: 'Clienti',        type: 'standard' },
  { key: 'sale',         label: 'Sale e Tavoli',  type: 'standard' },
  { key: 'staff',        label: 'Staff',          type: 'standard' },
  { key: 'turni',        label: 'Turni',          type: 'standard' },
  { key: 'cassa',        label: 'Cassa',          type: 'cassa' },
  { key: 'ordini_bordo', label: 'Ordini Bordo',   type: 'standard' },
  { key: 'impostazioni', label: 'Impostazioni',   type: 'standard' },
  { key: 'utenti',       label: 'Utenti App',     type: 'standard' }
]

// ============================================================
// Permessi predefiniti per ruolo.
// Deve coincidere con la migrazione SQL.
// Usato come fallback se un profilo non ha ancora il jsonb popolato.
// ============================================================
export var DEFAULT_PERMS_BY_ROLE = {
  super_admin: { prenotazioni: 'write', clienti: 'write', sale: 'write', staff: 'write', turni: 'write', cassa: 'full',  ordini_bordo: 'write', impostazioni: 'write', utenti: 'write' },
  proprieta:   { prenotazioni: 'write', clienti: 'write', sale: 'read',  staff: 'none',  turni: 'none',  cassa: 'full',  ordini_bordo: 'read',  impostazioni: 'none',  utenti: 'none' },
  direttore:   { prenotazioni: 'write', clienti: 'write', sale: 'read',  staff: 'write', turni: 'write', cassa: 'full',  ordini_bordo: 'write', impostazioni: 'write', utenti: 'none' },
  reception:   { prenotazioni: 'write', clienti: 'write', sale: 'read',  staff: 'read',  turni: 'none',  cassa: 'full',  ordini_bordo: 'write', impostazioni: 'none',  utenti: 'none' },
  sala:        { prenotazioni: 'write', clienti: 'write', sale: 'read',  staff: 'none',  turni: 'none',  cassa: 'full',  ordini_bordo: 'write', impostazioni: 'none',  utenti: 'none' },
  cucina:      { prenotazioni: 'read',  clienti: 'read',  sale: 'none',  staff: 'none',  turni: 'none',  cassa: 'none',  ordini_bordo: 'none',  impostazioni: 'none',  utenti: 'none' }
}

// Pavimento di sicurezza per ruoli non previsti.
var BASE_FALLBACK = { prenotazioni: 'write', clienti: 'write', sale: 'none', staff: 'none', turni: 'none', cassa: 'light', ordini_bordo: 'none', impostazioni: 'none', utenti: 'none' }

export function defaultPermissionsForRole(role) {
  return DEFAULT_PERMS_BY_ROLE[role] || BASE_FALLBACK
}

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
    })

    return function() {
      listener.data.subscription.unsubscribe()
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
    return supabase.auth.signOut().then(function() {
      setSession(null)
      setProfile(null)
    })
  }

  // ----------------------------------------------------------
  // NUOVO SISTEMA — permessi per funzione
  // ----------------------------------------------------------

  function currentPermissions() {
    if (!profile) return {}
    if (profile.permissions && typeof profile.permissions === 'object') {
      return profile.permissions
    }
    return defaultPermissionsForRole(profile.role)
  }

  function permissionLevel(feature) {
    if (!profile) return 'none'
    if (profile.role === 'super_admin') {
      return feature === 'cassa' ? 'full' : 'write'
    }
    var perms = currentPermissions()
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
    canWrite: canWrite
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
