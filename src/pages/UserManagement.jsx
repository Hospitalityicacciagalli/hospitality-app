import { useState, useEffect } from 'react'
import { ArrowLeft, UserPlus, Shield, ShieldCheck, ShieldX } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

var roleLabels = {
  super_admin: 'Super Admin',
  proprieta: 'Proprieta',
  direttore: 'Direttore',
  reception: 'Reception',
  sala: 'Sala',
  cucina: 'Cucina',
  staff_sala: 'Staff Sala',
  staff_cucina: 'Staff Cucina',
  staff_accoglienza: 'Staff Accoglienza'
}

var roleColors = {
  super_admin: 'bg-red-100 text-red-800',
  proprieta: 'bg-purple-100 text-purple-800',
  direttore: 'bg-blue-100 text-blue-800',
  reception: 'bg-green-100 text-green-800',
  sala: 'bg-amber-100 text-amber-800',
  cucina: 'bg-orange-100 text-orange-800',
  staff_sala: 'bg-gray-100 text-gray-700',
  staff_cucina: 'bg-gray-100 text-gray-700',
  staff_accoglienza: 'bg-gray-100 text-gray-700'
}

function UserManagement() {
  var auth = useAuth()
  var navigate = useNavigate()

  var usersState = useState([])
  var users = usersState[0]
  var setUsers = usersState[1]

  var loadingState = useState(true)
  var loading = loadingState[0]
  var setLoading = loadingState[1]

  var showFormState = useState(false)
  var showForm = showFormState[0]
  var setShowForm = showFormState[1]

  var savingState = useState(false)
  var saving = savingState[0]
  var setSaving = savingState[1]

  var formState = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'reception'
  })
  var formData = formState[0]
  var setFormData = formState[1]

  useEffect(function() {
    if (!auth.hasRole(['super_admin'])) {
      navigate('/')
      return
    }
    loadUsers()
  }, [])

  function loadUsers() {
    setLoading(true)
    supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: true })
      .then(function(result) {
        if (!result.error) {
          setUsers(result.data || [])
        }
        setLoading(false)
      })
  }

  function handleInputChange(e) {
    var name = e.target.name
    var value = e.target.value
    setFormData(function(prev) {
      var updated = {}
      for (var key in prev) { updated[key] = prev[key] }
      updated[name] = value
      return updated
    })
  }

  function createUser(e) {
    e.preventDefault()

    if (!formData.email || !formData.password || !formData.first_name || !formData.last_name) {
      alert('Compila tutti i campi.')
      return
    }

    if (formData.password.length < 6) {
      alert('La password deve avere almeno 6 caratteri.')
      return
    }

    setSaving(true)

    // Usa la funzione admin di Supabase per creare l'utente
    // Nota: questo richiede la service_role key, quindi usiamo
    // la funzione signUp standard e poi aggiorniamo il profilo
    supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          first_name: formData.first_name,
          last_name: formData.last_name,
          display_name: formData.first_name + ' ' + formData.last_name,
          role: formData.role
        }
      }
    }).then(function(result) {
      if (result.error) {
        if (result.error.message.indexOf('already registered') !== -1) {
          alert('Questa email e gia registrata.')
        } else {
          alert('Errore nella creazione: ' + result.error.message)
        }
        setSaving(false)
        return
      }

      // Successo
      alert('Utente ' + formData.first_name + ' ' + formData.last_name + ' creato con successo! Ruolo: ' + roleLabels[formData.role])
      setFormData({
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        role: 'reception'
      })
      setShowForm(false)
      setSaving(false)
      loadUsers()
    })
  }

  function toggleUserActive(userId, currentActive) {
    supabase
      .from('user_profiles')
      .update({ is_active: !currentActive })
      .eq('id', userId)
      .then(function(result) {
        if (result.error) {
          alert('Errore aggiornamento.')
        } else {
          loadUsers()
        }
      })
  }

  function updateUserRole(userId, newRole) {
    supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', userId)
      .then(function(result) {
        if (result.error) {
          alert('Errore aggiornamento ruolo.')
        } else {
          loadUsers()
        }
      })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-lg">Caricamento...</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Intestazione */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={function() { navigate('/') }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestione Utenti</h1>
            <p className="text-gray-500 mt-1">{users.length + " utenti registrati"}</p>
          </div>
        </div>
        <button
          onClick={function() { setShowForm(!showForm) }}
          className="inline-flex items-center gap-2 bg-wine-700 text-white px-5 py-3 rounded-xl hover:bg-wine-800 transition-colors font-medium shadow-sm"
        >
          <UserPlus size={20} />
          <span>Nuovo Utente</span>
        </button>
      </div>

      {/* Form nuovo utente */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Crea Nuovo Utente</h2>
          <form onSubmit={createUser} className="space-y-4">
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
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                  placeholder="mario.rossi@icacciagalli.it"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                  placeholder="Minimo 6 caratteri"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ruolo <span className="text-red-500">*</span>
              </label>
              <select
                name="role"
                value={formData.role}
                onChange={handleInputChange}
                className="w-full sm:w-auto px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white text-base"
              >
                <option value="super_admin">Super Admin - Accesso completo</option>
                <option value="proprieta">Proprieta - Lettura + clienti e prenotazioni</option>
                <option value="direttore">Direttore - Tutto tranne configurazioni</option>
                <option value="reception">Reception - Clienti, prenotazioni, eventi</option>
                <option value="sala">Sala - Prenotazioni e clienti</option>
                <option value="cucina">Cucina - Solo lettura</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-wine-700 text-white px-6 py-3 rounded-lg hover:bg-wine-800 transition-colors font-medium disabled:opacity-50"
              >
                {saving ? 'Creazione...' : 'Crea Utente'}
              </button>
              <button
                type="button"
                onClick={function() { setShowForm(false) }}
                className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Annulla
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista utenti */}
      <div className="space-y-2">
        {users.map(function(user) {
          var isCurrentUser = auth.profile && auth.profile.id === user.id
          return (
            <div
              key={user.id}
              className={"bg-white rounded-xl shadow-sm border p-4 " + (user.is_active ? "border-gray-200" : "border-red-200 opacity-60")}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className={"w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg " + (user.is_active ? "bg-wine-100 text-wine-700" : "bg-gray-200 text-gray-500")}>
                    {user.first_name[0]}{user.last_name[0]}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">
                        {user.first_name} {user.last_name}
                      </h3>
                      {isCurrentUser && (
                        <span className="text-xs text-wine-600">(tu)</span>
                      )}
                      <span className={"px-2 py-0.5 rounded-full text-xs font-medium " + (roleColors[user.role] || 'bg-gray-100 text-gray-700')}>
                        {roleLabels[user.role] || user.role}
                      </span>
                      {!user.is_active && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          Disattivato
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {"Creato il " + new Date(user.created_at).toLocaleDateString('it-IT')}
                    </p>
                  </div>
                </div>

                {/* Azioni */}
                {!isCurrentUser && (
                  <div className="flex items-center gap-2">
                    <select
                      value={user.role}
                      onChange={function(e) { updateUserRole(user.id, e.target.value) }}
                      className="text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-wine-500"
                    >
                      <option value="super_admin">Super Admin</option>
                      <option value="proprieta">Proprieta</option>
                      <option value="direttore">Direttore</option>
                      <option value="reception">Reception</option>
                      <option value="sala">Sala</option>
                      <option value="cucina">Cucina</option>
                    </select>

                    <button
                      onClick={function() { toggleUserActive(user.id, user.is_active) }}
                      className={"text-sm px-3 py-2 rounded-lg border transition-colors " + (user.is_active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50")}
                    >
                      {user.is_active ? 'Disattiva' : 'Riattiva'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="h-8" />
    </div>
  )
}

export default UserManagement
