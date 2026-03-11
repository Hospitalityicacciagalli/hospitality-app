import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

export default function ProfilePage() {
  var { profile } = useAuth();

  var [currentPassword, setCurrentPassword] = useState('');
  var [newPassword, setNewPassword] = useState('');
  var [confirmPassword, setConfirmPassword] = useState('');
  var [loading, setLoading] = useState(false);
  var [message, setMessage] = useState(null);
  var [error, setError] = useState(null);

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

  function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (!newPassword || !confirmPassword) {
      setError('Inserisci la nuova password e la conferma.');
      return;
    }

    if (newPassword.length < 6) {
      setError('La nuova password deve essere di almeno 6 caratteri.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('La nuova password e la conferma non coincidono.');
      return;
    }

    if (newPassword === currentPassword) {
      setError('La nuova password deve essere diversa da quella attuale.');
      return;
    }

    setLoading(true);

    supabase.auth.updateUser({ password: newPassword })
      .then(function(result) {
        setLoading(false);
        if (result.error) {
          setError('Errore durante il cambio password: ' + result.error.message);
        } else {
          setMessage('Password aggiornata con successo!');
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        }
      });
  }

  return (
    <div className="max-w-2xl mx-auto p-6">

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Il mio profilo</h1>
        <p className="text-gray-500 mt-1">Gestisci le tue informazioni e la tua password</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Informazioni account</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 w-24">Nome</span>
            <span className="text-sm font-medium text-gray-900">
              {profile ? (profile.first_name + ' ' + profile.last_name) : '—'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 w-24">Email</span>
            <span className="text-sm font-medium text-gray-900">
              {profile ? profile.email : '—'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 w-24">Ruolo</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-wine-100 text-wine-800">
              {profile ? getRoleLabel(profile.role) : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Cambia password</h2>
        <p className="text-sm text-gray-500 mb-6">Scegli una password sicura di almeno 6 caratteri.</p>

        {message && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
            ✓ {message}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password attuale
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={function(e) { setCurrentPassword(e.target.value); }}
              placeholder="Inserisci la password attuale"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">Campo informativo — non verificato dal sistema per motivi di sicurezza.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nuova password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={function(e) { setNewPassword(e.target.value); }}
              placeholder="Almeno 6 caratteri"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Conferma nuova password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={function(e) { setConfirmPassword(e.target.value); }}
              placeholder="Ripeti la nuova password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 focus:border-transparent"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Aggiornamento in corso...' : 'Aggiorna password'}
            </button>
          </div>

        </form>
      </div>

    </div>
  );
}
