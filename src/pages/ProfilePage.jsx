import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

export default function ProfilePage() {
  var { user, profile } = useAuth();

  var [currentPassword, setCurrentPassword] = useState('');
  var [newPassword, setNewPassword] = useState('');
  var [confirmPassword, setConfirmPassword] = useState('');
  var [loading, setLoading] = useState(false);
  var [successMsg, setSuccessMsg] = useState(null);
  var [errorMsg, setErrorMsg] = useState(null);

  // --- PIN operazioni ---
  var [pin, setPin] = useState('');
  var [confirmPin, setConfirmPin] = useState('');
  var [pinLoading, setPinLoading] = useState(false);
  var [pinSuccess, setPinSuccess] = useState(null);
  var [pinError, setPinError] = useState(null);
  var [pinJustSet, setPinJustSet] = useState(false);

  var hasPin = pinJustSet || (profile && profile.pin_hash ? true : false);

  function getRoleLabel(role) {
    var labels = {
      super_admin: 'Super Admin',
      proprieta: 'Proprietà',
      direttore: 'Direttore',
      reception: 'Reception',
      sala: 'Sala',
      cucina: 'Cucina'
    };
    return labels[role] || role;
  }

  function handleChangePassword(e) {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    if (!newPassword || !confirmPassword) {
      setErrorMsg('Inserisci la nuova password e la conferma.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('La nuova password deve essere di almeno 6 caratteri.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('La nuova password e la conferma non corrispondono.');
      return;
    }

    setLoading(true);

    // Prima fa re-login per verificare la password attuale
    supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    }).then(function(signInResult) {
      if (signInResult.error) {
        setLoading(false);
        setErrorMsg('Password attuale non corretta.');
        return;
      }

      // Poi aggiorna con la nuova password
      supabase.auth.updateUser({ password: newPassword }).then(function(updateResult) {
        setLoading(false);
        if (updateResult.error) {
          setErrorMsg('Errore aggiornamento password: ' + updateResult.error.message);
        } else {
          setSuccessMsg('Password aggiornata con successo!');
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        }
      });
    });
  }

  function handleSetPin(e) {
    e.preventDefault();
    setPinSuccess(null);
    setPinError(null);

    if (!/^[0-9]{6}$/.test(pin)) {
      setPinError('Il PIN deve essere di 6 cifre numeriche.');
      return;
    }
    if (pin !== confirmPin) {
      setPinError('Il PIN e la conferma non corrispondono.');
      return;
    }

    setPinLoading(true);
    supabase.rpc('set_pin', { p_pin: pin }).then(function(result) {
      setPinLoading(false);
      if (result.error) {
        var msg = result.error.message || 'Errore impostazione PIN.';
        if (msg.indexOf('in uso') !== -1) {
          setPinError('Questo PIN è già in uso da un altro utente. Scegline un altro.');
        } else if (msg.indexOf('6 cifre') !== -1) {
          setPinError('Il PIN deve essere di 6 cifre numeriche.');
        } else {
          setPinError('Errore impostazione PIN: ' + msg);
        }
      } else {
        setPinSuccess(hasPin ? 'PIN aggiornato con successo!' : 'PIN impostato con successo!');
        setPin('');
        setConfirmPin('');
        setPinJustSet(true);
      }
    });
  }

  return (
    <div className="p-6 max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Il mio profilo</h1>
        <p className="text-gray-500 mt-1 text-sm">Visualizza i tuoi dati, modifica la password e il PIN</p>
      </div>

      {/* Dati utente */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Dati account</h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <span className="text-sm text-gray-500">Nome</span>
            <span className="text-sm font-medium text-gray-900">
              {profile ? (profile.display_name || (profile.first_name + ' ' + profile.last_name)) : '—'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <span className="text-sm text-gray-500">Email</span>
            <span className="text-sm font-medium text-gray-900">{user ? user.email : '—'}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-gray-500">Ruolo</span>
            <span className="text-sm font-medium text-gray-900">
              {profile ? getRoleLabel(profile.role) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Cambio password */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Cambia password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{errorMsg}</div>
          )}
          {successMsg && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">{'✓ ' + successMsg}</div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Password attuale *</label>
            <input
              type="password"
              value={currentPassword}
              onChange={function(e) { setCurrentPassword(e.target.value); }}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nuova password *</label>
            <input
              type="password"
              value={newPassword}
              onChange={function(e) { setNewPassword(e.target.value); }}
              required
              placeholder="Almeno 6 caratteri"
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Conferma nuova password *</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={function(e) { setConfirmPassword(e.target.value); }}
              required
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? 'Aggiornamento...' : 'Aggiorna password'}
          </button>
        </form>
      </div>

      {/* PIN operazioni */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">PIN operazioni</h2>
          {hasPin ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">PIN impostato</span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Nessun PIN</span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Il PIN di 6 cifre ti identifica quando confermi un'operazione su una postazione condivisa. Deve essere diverso da quello di ogni altra persona. Non condividerlo con nessuno.
        </p>
        <form onSubmit={handleSetPin} className="space-y-4">
          {pinError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{pinError}</div>
          )}
          {pinSuccess && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">{'✓ ' + pinSuccess}</div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{hasPin ? 'Nuovo PIN (6 cifre) *' : 'PIN (6 cifre) *'}</label>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={function(e) { setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6)); }}
              required
              maxLength={6}
              placeholder="••••••"
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-wine-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Conferma PIN *</label>
            <input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={function(e) { setConfirmPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6)); }}
              required
              maxLength={6}
              placeholder="••••••"
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-wine-500"
            />
          </div>
          <button
            type="submit"
            disabled={pinLoading}
            className="w-full bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {pinLoading ? 'Salvataggio...' : (hasPin ? 'Aggiorna PIN' : 'Imposta PIN')}
          </button>
        </form>
      </div>
    </div>
  );
}
