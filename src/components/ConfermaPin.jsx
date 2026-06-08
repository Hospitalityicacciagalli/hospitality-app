import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Blocco anti-tentativi: per-DISPOSITIVO (non per-utente, perche' un PIN
// errato non identifica nessuno). Memorizzato in localStorage del browser.
var MAX_FAILS = 7
var LOCK_MINUTES = 3

function nowMs() { return Date.now() }

export default function ConfermaPin(props) {
  // props attese:
  //   open        (bool)        se mostrare la modale
  //   title       (string)      titolo opzionale
  //   message     (string)      testo opzionale
  //   onCancel    (function)    chiamata su Annulla / chiusura
  //   onConfirmed (function)    chiamata con { user_id, nome } su PIN valido

  var [pin, setPin] = useState('')
  var [loading, setLoading] = useState(false)
  var [error, setError] = useState(null)
  var [lockUntil, setLockUntil] = useState(0)
  var [, setTick] = useState(0)

  // All'apertura: azzera campo ed eventuale errore, rilegge il blocco salvato.
  useEffect(function() {
    if (props.open) {
      setPin('')
      setError(null)
      var stored = parseInt(localStorage.getItem('icg_pin_lock_until') || '0', 10)
      setLockUntil(isNaN(stored) ? 0 : stored)
    }
  }, [props.open])

  // Aggiorna il conto alla rovescia mentre il blocco e' attivo.
  useEffect(function() {
    if (lockUntil > nowMs()) {
      var iv = setInterval(function() { setTick(function(t) { return t + 1 }) }, 1000)
      return function() { clearInterval(iv) }
    }
  }, [lockUntil])

  function getFails() {
    var f = parseInt(localStorage.getItem('icg_pin_fail_count') || '0', 10)
    return isNaN(f) ? 0 : f
  }

  function clearLock() {
    localStorage.setItem('icg_pin_fail_count', '0')
    localStorage.removeItem('icg_pin_lock_until')
    setLockUntil(0)
  }

  function isLocked() { return lockUntil > nowMs() }

  function tempoRimasto() {
    var ms = lockUntil - nowMs()
    if (ms < 0) ms = 0
    var s = Math.ceil(ms / 1000)
    var m = Math.floor(s / 60)
    var sec = s % 60
    return (m > 0 ? m + ' min ' : '') + sec + ' s'
  }

  function handleVerify(e) {
    if (e) e.preventDefault()
    setError(null)
    if (isLocked()) return
    if (!/^[0-9]{6}$/.test(pin)) {
      setError('Inserisci il PIN a 6 cifre.')
      return
    }
    setLoading(true)
    supabase.rpc('verify_pin', { p_pin: pin }).then(function(result) {
      setLoading(false)
      if (result.error) {
        setError('Errore di verifica: ' + result.error.message)
        return
      }
      var rows = result.data || []
      if (rows.length > 0) {
        clearLock()
        setPin('')
        if (props.onConfirmed) props.onConfirmed(rows[0])
      } else {
        var f = getFails() + 1
        localStorage.setItem('icg_pin_fail_count', String(f))
        if (f >= MAX_FAILS) {
          var until = nowMs() + LOCK_MINUTES * 60 * 1000
          localStorage.setItem('icg_pin_lock_until', String(until))
          setLockUntil(until)
          setError('Troppi tentativi errati. Inserimento bloccato su questo dispositivo.')
        } else {
          setError('PIN non valido. Tentativi rimasti: ' + (MAX_FAILS - f) + '.')
        }
        setPin('')
      }
    })
  }

  if (!props.open) return null

  var locked = isLocked()

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{props.title || 'Conferma con PIN'}</h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            {props.message || 'Inserisci il tuo PIN personale a 6 cifre per confermare e firmare l\'operazione.'}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>
          )}

          {locked && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              Inserimento bloccato. Riprova tra {tempoRimasto()}.
            </div>
          )}

          <form onSubmit={handleVerify}>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={function(e) { setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6)) }}
              maxLength={6}
              autoFocus
              disabled={locked || loading}
              placeholder="••••••"
              className="w-full px-3 py-3 border border-gray-300 rounded-lg text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-wine-500 disabled:bg-gray-100"
            />
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={function() { if (props.onCancel) props.onCancel() }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={locked || loading}
                className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {loading ? 'Verifica...' : 'Conferma'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
