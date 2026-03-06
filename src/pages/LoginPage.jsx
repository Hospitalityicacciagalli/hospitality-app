import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'

function LoginPage() {
  var emailState = useState('')
  var email = emailState[0]
  var setEmail = emailState[1]

  var passwordState = useState('')
  var password = passwordState[0]
  var setPassword = passwordState[1]

  var loadingState = useState(false)
  var loading = loadingState[0]
  var setLoading = loadingState[1]

  var errorState = useState('')
  var error = errorState[0]
  var setError = errorState[1]

  var auth = useAuth()

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    auth.signIn(email, password).then(function(result) {
      if (result.error) {
        if (result.error.message === 'Invalid login credentials') {
          setError('Email o password non corretti.')
        } else {
          setError('Errore di accesso. Riprova.')
        }
      }
      setLoading(false)
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo e titolo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-wine-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-3xl font-bold">C</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">I Cacciagalli</h1>
          <p className="text-gray-500 mt-1">Gestionale Hospitality</p>
        </div>

        {/* Form di login */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Accedi</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={function(e) { setEmail(e.target.value) }}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                placeholder="tuaemail@esempio.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={function(e) { setPassword(e.target.value) }}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-base"
                placeholder="La tua password"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-wine-700 text-white py-3 rounded-lg hover:bg-wine-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed text-base"
            >
              {loading ? 'Accesso in corso...' : 'Accedi'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Accesso riservato allo staff autorizzato
        </p>
      </div>
    </div>
  )
}

export default LoginPage
