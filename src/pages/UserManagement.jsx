import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

var EDGE_FUNCTION_URL = 'https://ddarqzyymrgqmdwiyzde.supabase.co/functions/v1/admin-user-management';

export default function UserManagement() {
  var { profile, hasRole } = useAuth();

  var [users, setUsers] = useState([]);
  var [loading, setLoading] = useState(true);
  var [error, setError] = useState(null);

  // Modale nuovo utente
  var [showNewUserModal, setShowNewUserModal] = useState(false);
  var [newUserForm, setNewUserForm] = useState({
    email: '', password: '', first_name: '', last_name: '', role: 'reception'
  });
  var [newUserLoading, setNewUserLoading] = useState(false);
  var [newUserError, setNewUserError] = useState(null);

  // Modale reset password email
  var [showResetModal, setShowResetModal] = useState(false);
  var [resetTarget, setResetTarget] = useState(null);
  var [resetLoading, setResetLoading] = useState(false);
  var [resetMessage, setResetMessage] = useState(null);
  var [resetError, setResetError] = useState(null);

  // Modale blocco/sblocco
  var [showBanModal, setShowBanModal] = useState(false);
  var [banTarget, setBanTarget] = useState(null);
  var [banLoading, setBanLoading] = useState(false);
  var [banMessage, setBanMessage] = useState(null);
  var [banError, setBanError] = useState(null);

  var roleOptions = [
    { value: 'super_admin', label: 'Super Admin' },
    { value: 'proprieta', label: 'Proprietà' },
    { value: 'direttore', label: 'Direttore' },
    { value: 'reception', label: 'Reception' },
    { value: 'sala', label: 'Sala' },
    { value: 'cucina', label: 'Cucina' }
  ];

  function getRoleLabel(role) {
    var found = roleOptions.find(function(r) { return r.value === role; });
    return found ? found.label : role;
  }

  function getRoleBadgeColor(role) {
    var colors = {
      super_admin: 'bg-red-100 text-red-800',
      proprieta: 'bg-purple-100 text-purple-800',
      direttore: 'bg-wine-100 text-wine-800',
      reception: 'bg-blue-100 text-blue-800',
      sala: 'bg-green-100 text-green-800',
      cucina: 'bg-yellow-100 text-yellow-800'
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  }

  function loadUsers() {
    setLoading(true);
    supabase
      .from('profiles')
      .select('*')
      .order('last_name', { ascending: true })
      .then(function(result) {
        setLoading(false);
        if (result.error) {
          setError('Errore caricamento utenti: ' + result.error.message);
        } else {
          setUsers(result.data || []);
        }
      });
  }

  useEffect(function() {
    loadUsers();
  }, []);

  // Chiama la Edge Function con autenticazione
  function callEdgeFunction(body, onSuccess, onError, setLoadingFn) {
    setLoadingFn(true);
    supabase.auth.getSession().then(function(sessionResult) {
      var token = sessionResult.data.session ? sessionResult.data.session.access_token : '';
      fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(body)
      })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          setLoadingFn(false);
          if (data.error) {
            onError(data.error);
          } else {
            onSuccess(data.message);
          }
        })
        .catch(function(err) {
          setLoadingFn(false);
          onError('Errore di rete: ' + err.message);
        });
    });
  }

  // --- CREA NUOVO UTENTE ---
  function handleCreateUser(e) {
    e.preventDefault();
    setNewUserError(null);

    if (!newUserForm.email || !newUserForm.password || !newUserForm.first_name || !newUserForm.last_name) {
      setNewUserError('Tutti i campi obbligatori devono essere compilati.');
      return;
    }
    if (newUserForm.password.length < 6) {
      setNewUserError('La password deve essere di almeno 6 caratteri.');
      return;
    }

    setNewUserLoading(true);
    supabase.auth.admin.createUser({
      email: newUserForm.email,
      password: newUserForm.password,
      email_confirm: true,
      user_metadata: {
        first_name: newUserForm.first_name,
        last_name: newUserForm.last_name
      }
    }).then(function(result) {
      if (result.error) {
        setNewUserLoading(false);
        setNewUserError('Errore creazione utente: ' + result.error.message);
        return;
      }
      var userId = result.data.user.id;
      return supabase.from('profiles').upsert({
        id: userId,
        email: newUserForm.email,
        first_name: newUserForm.first_name,
        last_name: newUserForm.last_name,
        role: newUserForm.role
      });
    }).then(function(profileResult) {
      setNewUserLoading(false);
      if (profileResult && profileResult.error) {
        setNewUserError('Utente creato ma errore nel profilo: ' + profileResult.error.message);
      } else {
        setShowNewUserModal(false);
        setNewUserForm({ email: '', password: '', first_name: '', last_name: '', role: 'reception' });
        loadUsers();
      }
    }).catch(function(err) {
      setNewUserLoading(false);
      setNewUserError('Errore imprevisto: ' + err.message);
    });
  }

  // --- RESET PASSWORD VIA EMAIL ---
  function openResetModal(user) {
    setResetTarget(user);
    setResetMessage(null);
    setResetError(null);
    setShowResetModal(true);
  }

  function handleResetPassword() {
    setResetMessage(null);
    setResetError(null);
    callEdgeFunction(
      { action: 'reset_password_email', email: resetTarget.email },
      function(msg) { setResetMessage(msg); },
      function(err) { setResetError(err); },
      setResetLoading
    );
  }

  // --- BLOCCA / SBLOCCA UTENTE ---
  function openBanModal(user, action) {
    setBanTarget({ user: user, action: action });
    setBanMessage(null);
    setBanError(null);
    setShowBanModal(true);
  }

  function handleBanAction() {
    setBanMessage(null);
    setBanError(null);
    var action = banTarget.action === 'ban' ? 'ban_user' : 'unban_user';
    callEdgeFunction(
      { action: action, userId: banTarget.user.id },
      function(msg) {
        setBanMessage(msg);
        loadUsers();
      },
      function(err) { setBanError(err); },
      setBanLoading
    );
  }

  if (!hasRole(['super_admin'])) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          Accesso negato. Questa pagina è riservata al Super Admin.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestione Utenti App</h1>
          <p className="text-gray-500 mt-1 text-sm">Crea, blocca e gestisci gli accessi al sistema</p>
        </div>
        <button
          onClick={function() { setShowNewUserModal(true); setNewUserError(null); }}
          className="bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Nuovo utente
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Caricamento utenti...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ruolo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stato</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(function(user) {
                var isSelf = profile && user.id === profile.id;
                var isBanned = user.is_banned === true;
                return (
                  <tr key={user.id} className={isBanned ? 'bg-red-50 opacity-70' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {user.first_name + ' ' + user.last_name}
                      {isSelf && <span className="ml-2 text-xs text-gray-400">(tu)</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + getRoleBadgeColor(user.role)}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isBanned ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Bloccato
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Attivo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {!isSelf && (
                          <>
                            <button
                              onClick={function() { openResetModal(user); }}
                              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                              Invia reset password
                            </button>
                            {isBanned ? (
                              <button
                                onClick={function() { openBanModal(user, 'unban'); }}
                                className="text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50 transition-colors"
                              >
                                Sblocca accesso
                              </button>
                            ) : (
                              <button
                                onClick={function() { openBanModal(user, 'ban'); }}
                                className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 transition-colors"
                              >
                                Blocca accesso
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODALE NUOVO UTENTE */}
      {showNewUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Nuovo utente</h2>
              <button
                onClick={function() { setShowNewUserModal(false); }}
                className="text-gray-400 hover:text-gray-600 text-xl font-light"
              >✕</button>
            </div>
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {newUserError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{newUserError}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
                  <input
                    type="text"
                    value={newUserForm.first_name}
                    onChange={function(e) { setNewUserForm(Object.assign({}, newUserForm, { first_name: e.target.value })); }}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cognome *</label>
                  <input
                    type="text"
                    value={newUserForm.last_name}
                    onChange={function(e) { setNewUserForm(Object.assign({}, newUserForm, { last_name: e.target.value })); }}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={newUserForm.email}
                  onChange={function(e) { setNewUserForm(Object.assign({}, newUserForm, { email: e.target.value })); }}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password iniziale *</label>
                <input
                  type="password"
                  value={newUserForm.password}
                  onChange={function(e) { setNewUserForm(Object.assign({}, newUserForm, { password: e.target.value })); }}
                  required
                  placeholder="Almeno 6 caratteri"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ruolo *</label>
                <select
                  value={newUserForm.role}
                  onChange={function(e) { setNewUserForm(Object.assign({}, newUserForm, { role: e.target.value })); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                >
                  {roleOptions.map(function(r) {
                    return <option key={r.value} value={r.value}>{r.label}</option>;
                  })}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={function() { setShowNewUserModal(false); }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={newUserLoading}
                  className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  {newUserLoading ? 'Creazione...' : 'Crea utente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODALE RESET PASSWORD */}
      {showResetModal && resetTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Reset password</h2>
              <button onClick={function() { setShowResetModal(false); }} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
            </div>
            <div className="p-6">
              {!resetMessage ? (
                <>
                  <p className="text-sm text-gray-600 mb-1">
                    Verrà inviata una email di reset a:
                  </p>
                  <p className="text-sm font-semibold text-gray-900 mb-4">{resetTarget.email}</p>
                  <p className="text-xs text-gray-400 mb-6">
                    L'utente riceverà un link per impostare una nuova password. Il link è valido per 24 ore.
                  </p>
                  {resetError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{resetError}</div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={function() { setShowResetModal(false); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
                    <button
                      onClick={handleResetPassword}
                      disabled={resetLoading}
                      className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      {resetLoading ? 'Invio...' : 'Invia email'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center py-4">
                    <div className="text-4xl mb-3">✉️</div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Email inviata!</p>
                    <p className="text-xs text-gray-500">{resetMessage}</p>
                  </div>
                  <button onClick={function() { setShowResetModal(false); }} className="w-full bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium mt-2">Chiudi</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODALE BLOCCA/SBLOCCA */}
      {showBanModal && banTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {banTarget.action === 'ban' ? 'Blocca accesso' : 'Sblocca accesso'}
              </h2>
              <button onClick={function() { setShowBanModal(false); }} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
            </div>
            <div className="p-6">
              {!banMessage ? (
                <>
                  {banTarget.action === 'ban' ? (
                    <p className="text-sm text-gray-600 mb-6">
                      Stai per bloccare l'accesso a <strong>{banTarget.user.first_name + ' ' + banTarget.user.last_name}</strong>. L'utente non potrà più effettuare il login fino allo sblocco.
                    </p>
                  ) : (
                    <p className="text-sm text-gray-600 mb-6">
                      Stai per riabilitare l'accesso a <strong>{banTarget.user.first_name + ' ' + banTarget.user.last_name}</strong>. L'utente potrà tornare ad accedere al sistema.
                    </p>
                  )}
                  {banError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{banError}</div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={function() { setShowBanModal(false); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
                    <button
                      onClick={handleBanAction}
                      disabled={banLoading}
                      className={
                        'flex-1 text-white px-4 py-2 rounded-lg text-sm font-medium ' +
                        (banTarget.action === 'ban'
                          ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-300'
                          : 'bg-green-600 hover:bg-green-700 disabled:bg-green-300')
                      }
                    >
                      {banLoading ? 'Operazione...' : (banTarget.action === 'ban' ? 'Blocca' : 'Sblocca')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center py-4">
                    <div className="text-4xl mb-3">{banTarget.action === 'ban' ? '🔒' : '🔓'}</div>
                    <p className="text-sm font-medium text-gray-900">{banMessage}</p>
                  </div>
                  <button onClick={function() { setShowBanModal(false); }} className="w-full bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium mt-2">Chiudi</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
