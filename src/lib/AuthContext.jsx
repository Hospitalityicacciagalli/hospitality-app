import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

var AuthContext = createContext(null)

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
    // Controlla la sessione attuale
    supabase.auth.getSession().then(function(result) {
      setSession(result.data.session)
      if (result.data.session) {
        loadProfile(result.data.session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Ascolta cambiamenti di autenticazione
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

  var value = {
    session: session,
    profile: profile,
    loading: loading,
    signIn: signIn,
    signOut: signOut,
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
