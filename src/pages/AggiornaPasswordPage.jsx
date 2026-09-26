import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ============================================================
// AggiornaPasswordPage — la pagina su cui arriva il link della mail
// «Reset password» (Utenti App -> Reset password).
//
// Come ci si arriva: la Edge Function admin-user-management chiama
// resetPasswordForEmail con redirectTo = /aggiorna-password. Supabase
// manda una mail con un link; aprendolo, il browser arriva qui con i
// dati di accesso temporanei scritti in fondo all'indirizzo (dopo il #).
// Il client Supabase li legge da solo e apre una sessione: da quel
// momento updateUser({ password }) cambia la password di QUELL'utente.
//
// Perche' la pagina vive FUORI dal router e da AuthProvider (come
// /ordina): dentro l'app, un utente con la sessione appena aperta
// verrebbe portato alle Prenotazioni prima di vedere questa pagina, e
// uno senza permessi verrebbe rimbalzato. Qui non serve nessun
// permesso: serve solo il link valido.
//
// Regola 50: lo stato iniziale e' 'verifica', non un falso «pronto».
// Finche' il client non ha finito di leggere il link, non si decide
// niente: getSession() aspetta che la lettura sia conclusa.
// ============================================================

var LUNGHEZZA_MINIMA = 6;

// Se il link e' scaduto o gia' usato, Supabase lo dice nell'indirizzo
// stesso (error_code=otp_expired ecc.). Lo leggiamo per dare un
// messaggio chiaro invece di un generico «non valido».
function leggiErroreDalLink() {
  var testo = '';
  if (typeof window !== 'undefined') {
    testo = (window.location.hash || '') + '&' + (window.location.search || '');
  }
  if (testo.indexOf('error') === -1) return null;
  if (testo.indexOf('otp_expired') !== -1) {
    return 'Il link è scaduto o è già stato usato.';
  }
  return 'Il link non è valido.';
}

export default function AggiornaPasswordPage() {
  // 'verifica' | 'pronto' | 'link_non_valido' | 'fatto'
  var [stato, setStato] = useState('verifica');
  var [motivo, setMotivo] = useState('');
  var [email, setEmail] = useState('');
  var [password, setPassword] = useState('');
  var [conferma, setConferma] = useState('');
  var [errore, setErrore] = useState(null);
  var [salvataggio, setSalvataggio] = useState(false);

  useEffect(function() {
    var erroreLink = leggiErroreDalLink();

    supabase.auth.getSession().then(function(result) {
      var sessione = result && result.data ? result.data.session : null;
      if (sessione && sessione.user) {
        setEmail(sessione.user.email || '');
        setStato('pronto');
        // Toglie i dati del link dalla barra degli indirizzi: non devono
        // restare nella cronologia del browser.
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', '/aggiorna-password');
        }
      } else {
        setMotivo(erroreLink || 'Il link non è valido o è scaduto.');
        setStato('link_non_valido');
      }
    });
  }, []);

  function handleSalva(e) {
    e.preventDefault();
    setErrore(null);

    if (password.length < LUNGHEZZA_MINIMA) {
      setErrore('La password deve essere di almeno ' + LUNGHEZZA_MINIMA + ' caratteri.');
      return;
    }
    if (password !== conferma) {
      setErrore('Le due password non coincidono.');
      return;
    }

    setSalvataggio(true);
    supabase.auth.updateUser({ password: password }).then(function(result) {
      setSalvataggio(false);
      if (result.error) {
        var msg = result.error.message || '';
        if (msg.indexOf('different from the old') !== -1 || msg.indexOf('same') !== -1) {
          setErrore('La nuova password deve essere diversa da quella precedente.');
        } else {
          setErrore('Errore nel salvataggio: ' + msg);
        }
      } else {
        setPassword('');
        setConferma('');
        setStato('fatto');
      }
    });
  }

  function vaiAlProgramma() {
    // Ricarica completa: cosi' AuthProvider parte da zero e trova la
    // sessione dell'utente che ha appena cambiato password.
    window.location.replace('/prenotazioni');
  }

  function vaiAlLogin() {
    window.location.replace('/login');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-sm">
        <div className="px-6 py-4 border-b border-gray-200">
          <h1 className="text-lg font-semibold text-gray-900">Nuova password</h1>
          <p className="text-xs text-gray-500 mt-0.5">i Cacciagalli — Hospitality</p>
        </div>

        <div className="p-6">

          {stato === 'verifica' && (
            <div className="py-6 text-center text-sm text-gray-400">Verifica del link in corso...</div>
          )}

          {stato === 'link_non_valido' && (
            <div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-4">
                {motivo} Chiedi all'amministratore di inviarti una nuova email di reset.
              </div>
              <button
                type="button"
                onClick={vaiAlLogin}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Vai alla pagina di accesso
              </button>
            </div>
          )}

          {stato === 'pronto' && (
            <form onSubmit={handleSalva} className="space-y-4">
              {email && (
                <p className="text-sm text-gray-600">
                  Scegli la nuova password per <strong>{email}</strong>.
                </p>
              )}

              {errore && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{errore}</div>
              )}

              {/* Credenziale vera: type="password" di proposito (regola 38
                  vale solo per il PIN). Il browser puo' salvarla. */}
              <input type="email" value={email} readOnly autoComplete="username" className="hidden" />

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nuova password</label>
                <input
                  type="password"
                  value={password}
                  onChange={function(e) { setPassword(e.target.value); }}
                  autoComplete="new-password"
                  placeholder={'Almeno ' + LUNGHEZZA_MINIMA + ' caratteri'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ripeti la nuova password</label>
                <input
                  type="password"
                  value={conferma}
                  onChange={function(e) { setConferma(e.target.value); }}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                />
              </div>

              <button
                type="submit"
                disabled={salvataggio}
                className="w-full bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {salvataggio ? 'Salvataggio...' : 'Salva la nuova password'}
              </button>
            </form>
          )}

          {stato === 'fatto' && (
            <div>
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 mb-4">
                {'✓ Password aggiornata. Da ora entri con la nuova password.'}
              </div>
              <button
                type="button"
                onClick={vaiAlProgramma}
                className="w-full bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Vai al programma
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
