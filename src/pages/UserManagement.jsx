import { useState, useEffect } from 'react';
import { useAuth, FEATURES, defaultPermissionsForRole } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

var EDGE_FUNCTION_URL = 'https://ddarqzyymrgqmdwiyzde.supabase.co/functions/v1/admin-user-management';

// Opzioni di livello per i selettori della matrice.
var LEVEL_OPTIONS_STANDARD = [
  { value: 'none',  label: 'Nessuno' },
  { value: 'read',  label: 'Solo lettura' },
  { value: 'write', label: 'Lettura e scrittura' }
];
var LEVEL_OPTIONS_CASSA = [
  { value: 'none',  label: 'Nessuno' },
  { value: 'light', label: 'Cassa light' },
  { value: 'full',  label: 'Cassa completa' }
];

export default function UserManagement() {
  var { profile, canView } = useAuth();

  var [users, setUsers] = useState([]);
  var [loading, setLoading] = useState(true);
  var [error, setError] = useState(null);

  // Email utenti (caricate separatamente da auth tramite RPC)
  var [userEmails, setUserEmails] = useState({});

  // Profili-tipo salvabili
  var [profiles, setProfiles] = useState([]);

  // Modale nuovo utente
  var [showNewUserModal, setShowNewUserModal] = useState(false);
  var [newUserForm, setNewUserForm] = useState({
    email: '', password: '', first_name: '', last_name: '', role: 'reception'
  });
  var [newUserLoading, setNewUserLoading] = useState(false);
  var [newUserError, setNewUserError] = useState(null);
  var [newUserSuccess, setNewUserSuccess] = useState(null);

  // Modale modifica utente
  var [showEditModal, setShowEditModal] = useState(false);
  var [editTarget, setEditTarget] = useState(null);
  var [editForm, setEditForm] = useState({ first_name: '', last_name: '', display_name: '', role: 'reception' });
  var [editLoading, setEditLoading] = useState(false);
  var [editError, setEditError] = useState(null);
  var [editSuccess, setEditSuccess] = useState(null);

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

  // Modale permessi
  var [showPermModal, setShowPermModal] = useState(false);
  var [permTarget, setPermTarget] = useState(null);
  var [permMatrix, setPermMatrix] = useState({});
  var [permLoading, setPermLoading] = useState(false);
  var [permError, setPermError] = useState(null);
  var [permSuccess, setPermSuccess] = useState(null);
  var [selectedProfileId, setSelectedProfileId] = useState('');
  var [newProfileName, setNewProfileName] = useState('');
  var [saveProfileLoading, setSaveProfileLoading] = useState(false);

  // Modale reset PIN
  var [showPinModal, setShowPinModal] = useState(false);
  var [pinTarget, setPinTarget] = useState(null);
  var [pinLoading, setPinLoading] = useState(false);
  var [pinMessage, setPinMessage] = useState(null);
  var [pinError, setPinError] = useState(null);

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
    setError(null);
    supabase
      .from('user_profiles')
      .select('id, first_name, last_name, display_name, role, is_active, permissions')
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

  // Carica le email da auth tramite la funzione RPC (solo super_admin).
  function loadEmails() {
    supabase.rpc('admin_list_user_emails').then(function(result) {
      if (!result.error && result.data) {
        var map = {};
        result.data.forEach(function(row) { map[row.id] = row.email; });
        setUserEmails(map);
      }
    });
  }

  function loadProfiles() {
    supabase
      .from('permission_profiles')
      .select('id, name, is_default, permissions')
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })
      .then(function(result) {
        if (!result.error) {
          setProfiles(result.data || []);
        }
      });
  }

  useEffect(function() {
    loadUsers();
    loadEmails();
    loadProfiles();
  }, []);

  // Chiama la Edge Function con il token di autenticazione
  function callEdgeFunction(body, onSuccess, onError, setLoadingFn) {
    setLoadingFn(true);

    // Prima forza un refresh della sessione, poi prende il token aggiornato
    supabase.auth.refreshSession().then(function() {
      supabase.auth.getSession().then(function(sessionResult) {
        var session = sessionResult.data ? sessionResult.data.session : null;
        var token = session ? session.access_token : '';

        if (!token) {
          setLoadingFn(false);
          onError('Sessione non valida. Effettua logout e login di nuovo.');
          return;
        }

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
    });
  }

  // --- CREA NUOVO UTENTE tramite Edge Function ---
  function handleCreateUser(e) {
    e.preventDefault();
    setNewUserError(null);
    setNewUserSuccess(null);

    if (!newUserForm.email || !newUserForm.password || !newUserForm.first_name || !newUserForm.last_name) {
      setNewUserError('Tutti i campi obbligatori devono essere compilati.');
      return;
    }
    if (newUserForm.password.length < 6) {
      setNewUserError('La password deve essere di almeno 6 caratteri.');
      return;
    }

    callEdgeFunction(
      {
        action: 'create_user',
        email: newUserForm.email,
        password: newUserForm.password,
        first_name: newUserForm.first_name,
        last_name: newUserForm.last_name,
        role: newUserForm.role
      },
      function(msg) {
        setNewUserSuccess(msg);
        setNewUserForm({ email: '', password: '', first_name: '', last_name: '', role: 'reception' });
        loadUsers();
        loadEmails();
      },
      function(err) { setNewUserError(err); },
      setNewUserLoading
    );
  }

  // --- MODIFICA UTENTE (anagrafica + ruolo) ---
  function openEditModal(user) {
    setEditTarget(user);
    setEditError(null);
    setEditSuccess(null);
    setEditForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      display_name: user.display_name || '',
      role: user.role || 'reception'
    });
    setShowEditModal(true);
  }

  function setEditField(field, value) {
    setEditForm(function(prev) {
      var next = {};
      for (var k in prev) { next[k] = prev[k]; }
      next[field] = value;
      return next;
    });
  }

  function handleSaveEdit() {
    setEditError(null);
    setEditSuccess(null);

    if (!editForm.first_name.trim() || !editForm.last_name.trim()) {
      setEditError('Nome e cognome sono obbligatori.');
      return;
    }

    setEditLoading(true);
    supabase
      .from('user_profiles')
      .update({
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        display_name: editForm.display_name.trim() ? editForm.display_name.trim() : null,
        role: editForm.role
      })
      .eq('id', editTarget.id)
      .then(function(result) {
        setEditLoading(false);
        if (result.error) {
          setEditError('Errore salvataggio: ' + result.error.message);
        } else {
          setEditSuccess('Dati aggiornati.');
          loadUsers();
        }
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
      { action: 'reset_password_email', userId: resetTarget.id, email: userEmails[resetTarget.id] || '' },
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

  // --- PERMESSI ---
  function openPermModal(user) {
    setPermTarget(user);
    setPermError(null);
    setPermSuccess(null);
    setSelectedProfileId('');
    setNewProfileName('');

    // Parte dai permessi attuali; se mancano, dai default del ruolo.
    var base;
    if (user.permissions && typeof user.permissions === 'object') {
      base = user.permissions;
    } else {
      base = defaultPermissionsForRole(user.role);
    }
    // Copia normalizzata su tutte le funzioni note.
    var matrix = {};
    FEATURES.forEach(function(f) {
      matrix[f.key] = base[f.key] || 'none';
    });
    setPermMatrix(matrix);
    setShowPermModal(true);
  }

  function setFeatureLevel(featureKey, level) {
    setPermMatrix(function(prev) {
      var next = {};
      for (var k in prev) { next[k] = prev[k]; }
      next[featureKey] = level;
      return next;
    });
  }

  function selectAllPermissions() {
    var matrix = {};
    FEATURES.forEach(function(f) {
      matrix[f.key] = f.type === 'cassa' ? 'full' : 'write';
    });
    setPermMatrix(matrix);
  }

  function clearAllPermissions() {
    var matrix = {};
    FEATURES.forEach(function(f) {
      matrix[f.key] = 'none';
    });
    setPermMatrix(matrix);
  }

  function applyProfile(profileId) {
    setSelectedProfileId(profileId);
    if (!profileId) return;
    var found = profiles.find(function(p) { return p.id === profileId; });
    if (!found) return;
    var src = found.permissions || {};
    var matrix = {};
    FEATURES.forEach(function(f) {
      matrix[f.key] = src[f.key] || 'none';
    });
    setPermMatrix(matrix);
  }

  function handleSavePermissions() {
    setPermError(null);
    setPermSuccess(null);
    setPermLoading(true);
    supabase
      .from('user_profiles')
      .update({ permissions: permMatrix })
      .eq('id', permTarget.id)
      .then(function(result) {
        setPermLoading(false);
        if (result.error) {
          setPermError('Errore salvataggio permessi: ' + result.error.message);
        } else {
          setPermSuccess('Permessi salvati.');
          loadUsers();
        }
      });
  }

  function handleSaveAsProfile() {
    setPermError(null);
    setPermSuccess(null);
    var nome = (newProfileName || '').trim();
    if (!nome) {
      setPermError('Inserisci un nome per il nuovo profilo.');
      return;
    }
    setSaveProfileLoading(true);
    supabase
      .from('permission_profiles')
      .insert({ name: nome, permissions: permMatrix })
      .then(function(result) {
        setSaveProfileLoading(false);
        if (result.error) {
          setPermError('Errore salvataggio profilo: ' + result.error.message);
        } else {
          setPermSuccess('Profilo "' + nome + '" creato.');
          setNewProfileName('');
          loadProfiles();
        }
      });
  }

  // --- RESET PIN ---
  function openPinModal(user) {
    setPinTarget(user);
    setPinMessage(null);
    setPinError(null);
    setShowPinModal(true);
  }

  function handleResetPin() {
    setPinMessage(null);
    setPinError(null);
    setPinLoading(true);
    supabase.rpc('reset_pin', { p_user_id: pinTarget.id }).then(function(result) {
      setPinLoading(false);
      if (result.error) {
        setPinError('Errore reset PIN: ' + result.error.message);
      } else {
        setPinMessage('PIN azzerato. L\'utente dovrà impostarne uno nuovo dal proprio profilo.');
      }
    });
  }

  if (!canView('utenti')) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          Accesso negato. Questa pagina è riservata agli amministratori.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestione Utenti App</h1>
          <p className="text-gray-500 mt-1 text-sm">Crea, modifica, blocca, gestisci accessi e permessi</p>
        </div>
        <button
          onClick={function() { setShowNewUserModal(true); setNewUserError(null); setNewUserSuccess(null); }}
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome / Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ruolo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stato</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(function(user) {
                var isSelf = profile && user.id === profile.id;
                var isActive = user.is_active !== false;
                return (
                  <tr key={user.id} className={!isActive ? 'bg-red-50 opacity-70' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {user.display_name || (user.first_name + ' ' + user.last_name)}
                        {isSelf && <span className="ml-2 text-xs text-gray-400">(tu)</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{userEmails[user.id] || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + getRoleBadgeColor(user.role)}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Attivo</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Bloccato</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        <button
                          onClick={function() { openEditModal(user); }}
                          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Modifica
                        </button>
                        {!isSelf && (
                          <>
                            <button
                              onClick={function() { openPermModal(user); }}
                              className="text-xs px-2 py-1 rounded border border-wine-300 text-wine-700 hover:bg-wine-50 transition-colors"
                            >
                              Permessi
                            </button>
                            <button
                              onClick={function() { openResetModal(user); }}
                              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              Reset password
                            </button>
                            <button
                              onClick={function() { openPinModal(user); }}
                              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              Reset PIN
                            </button>
                            {isActive ? (
                              <button
                                onClick={function() { openBanModal(user, 'ban'); }}
                                className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 transition-colors"
                              >
                                Blocca accesso
                              </button>
                            ) : (
                              <button
                                onClick={function() { openBanModal(user, 'unban'); }}
                                className="text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50 transition-colors"
                              >
                                Sblocca accesso
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

      {/* MODALE MODIFICA UTENTE */}
      {showEditModal && editTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Modifica utente</h2>
              <button onClick={function() { setShowEditModal(false); }} className="text-gray-400 hover:text-gray-600 text-xl font-light">x</button>
            </div>
            <div className="p-6 space-y-4">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{editError}</div>
              )}
              {editSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">{'✓ ' + editSuccess}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
                  <input
                    type="text"
                    value={editForm.first_name}
                    onChange={function(e) { setEditField('first_name', e.target.value); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cognome *</label>
                  <input
                    type="text"
                    value={editForm.last_name}
                    onChange={function(e) { setEditField('last_name', e.target.value); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome visualizzato (opzionale)</label>
                <input
                  type="text"
                  value={editForm.display_name}
                  onChange={function(e) { setEditField('display_name', e.target.value); }}
                  placeholder="Se vuoto, viene mostrato Nome + Cognome"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ruolo</label>
                <select
                  value={editForm.role}
                  onChange={function(e) { setEditField('role', e.target.value); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                >
                  {roleOptions.map(function(r) {
                    return <option key={r.value} value={r.value}>{r.label}</option>;
                  })}
                </select>
                <p className="text-xs text-gray-400 mt-1">Il ruolo è ormai solo un'etichetta: gli accessi reali si gestiscono dal pulsante "Permessi".</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="text"
                  value={userEmails[editTarget.id] || '—'}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
                />
                <p className="text-xs text-gray-400 mt-1">La modifica dell'email sarà disponibile in una fase successiva.</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={function() { setShowEditModal(false); }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Chiudi
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={editLoading}
                  className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  {editLoading ? 'Salvataggio...' : 'Salva modifiche'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODALE PERMESSI */}
      {showPermModal && permTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Permessi di {permTarget.display_name || (permTarget.first_name + ' ' + permTarget.last_name)}
              </h2>
              <button onClick={function() { setShowPermModal(false); }} className="text-gray-400 hover:text-gray-600 text-xl font-light">x</button>
            </div>

            <div className="p-6 overflow-y-auto">
              {permError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{permError}</div>
              )}
              {permSuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">{'✓ ' + permSuccess}</div>
              )}

              {/* Applica un profilo-tipo */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Applica un profilo-tipo</label>
                <select
                  value={selectedProfileId}
                  onChange={function(e) { applyProfile(e.target.value); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                >
                  <option value="">— Scegli un profilo —</option>
                  {profiles.map(function(p) {
                    return <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (default)' : ''}</option>;
                  })}
                </select>
                <p className="text-xs text-gray-400 mt-1">Applicare un profilo riempie la matrice qui sotto; puoi comunque modificarla voce per voce prima di salvare.</p>
              </div>

              {/* Scorciatoie */}
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={selectAllPermissions}
                  className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Seleziona tutto
                </button>
                <button
                  type="button"
                  onClick={clearAllPermissions}
                  className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Azzera tutto
                </button>
              </div>

              {/* Matrice funzioni */}
              <div className="space-y-2">
                {FEATURES.map(function(f) {
                  var opts = f.type === 'cassa' ? LEVEL_OPTIONS_CASSA : LEVEL_OPTIONS_STANDARD;
                  return (
                    <div key={f.key} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100">
                      <span className="text-sm text-gray-800">{f.label}</span>
                      <select
                        value={permMatrix[f.key] || 'none'}
                        onChange={function(e) { setFeatureLevel(f.key, e.target.value); }}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 min-w-[170px]"
                      >
                        {opts.map(function(o) {
                          return <option key={o.value} value={o.value}>{o.label}</option>;
                        })}
                      </select>
                    </div>
                  );
                })}
              </div>

              {/* Salva come nuovo profilo */}
              <div className="mt-5 pt-4 border-t border-gray-200">
                <label className="block text-xs font-medium text-gray-700 mb-1">Salva questa configurazione come nuovo profilo-tipo</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newProfileName}
                    onChange={function(e) { setNewProfileName(e.target.value); }}
                    placeholder="Nome profilo (es. Reception)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveAsProfile}
                    disabled={saveProfileLoading}
                    className="px-3 py-2 border border-wine-300 text-wine-700 rounded-lg text-sm hover:bg-wine-50 disabled:opacity-50"
                  >
                    {saveProfileLoading ? 'Salvataggio...' : 'Crea profilo'}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer azioni */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
              <button
                type="button"
                onClick={function() { setShowPermModal(false); }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Chiudi
              </button>
              <button
                type="button"
                onClick={handleSavePermissions}
                disabled={permLoading}
                className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {permLoading ? 'Salvataggio...' : 'Salva permessi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE NUOVO UTENTE */}
      {showNewUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Nuovo utente</h2>
              <button onClick={function() { setShowNewUserModal(false); }} className="text-gray-400 hover:text-gray-600 text-xl font-light">x</button>
            </div>
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {newUserError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{newUserError}</div>
              )}
              {newUserSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">{'✓ ' + newUserSuccess}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
                  <input
                    type="text"
                    value={newUserForm.first_name}
                    onChange={function(e) { var v = e.target.value; setNewUserForm(function(p) { var u = {}; for (var k in p) { u[k] = p[k]; } u.first_name = v; return u; }); }}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cognome *</label>
                  <input
                    type="text"
                    value={newUserForm.last_name}
                    onChange={function(e) { var v = e.target.value; setNewUserForm(function(p) { var u = {}; for (var k in p) { u[k] = p[k]; } u.last_name = v; return u; }); }}
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
                  onChange={function(e) { var v = e.target.value; setNewUserForm(function(p) { var u = {}; for (var k in p) { u[k] = p[k]; } u.email = v; return u; }); }}
                  required
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password iniziale *</label>
                <input
                  type="password"
                  value={newUserForm.password}
                  onChange={function(e) { var v = e.target.value; setNewUserForm(function(p) { var u = {}; for (var k in p) { u[k] = p[k]; } u.password = v; return u; }); }}
                  required
                  placeholder="Almeno 6 caratteri"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ruolo *</label>
                <select
                  value={newUserForm.role}
                  onChange={function(e) { var v = e.target.value; setNewUserForm(function(p) { var u = {}; for (var k in p) { u[k] = p[k]; } u.role = v; return u; }); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                >
                  {roleOptions.map(function(r) {
                    return <option key={r.value} value={r.value}>{r.label}</option>;
                  })}
                </select>
                <p className="text-xs text-gray-400 mt-1">Il nuovo utente parte dai permessi predefiniti del ruolo; potrai personalizzarli con il pulsante "Permessi".</p>
              </div>
              <div className="flex gap-3 pt-2">
                {!newUserSuccess ? (
                  <>
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
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={function() { setShowNewUserModal(false); }}
                    className="flex-1 bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
                  >
                    Chiudi
                  </button>
                )}
              </div>
            </form>
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
              <button onClick={function() { setShowBanModal(false); }} className="text-gray-400 hover:text-gray-600 text-xl font-light">x</button>
            </div>
            <div className="p-6">
              {!banMessage ? (
                <>
                  <p className="text-sm text-gray-600 mb-6">
                    {banTarget.action === 'ban'
                      ? 'Stai per bloccare l\'accesso a '
                      : 'Stai per riabilitare l\'accesso a '}
                    <strong>{banTarget.user.display_name || (banTarget.user.first_name + ' ' + banTarget.user.last_name)}</strong>.
                    {banTarget.action === 'ban'
                      ? ' L\'utente non potrà più effettuare il login fino allo sblocco.'
                      : ' L\'utente potrà tornare ad accedere al sistema.'}
                  </p>
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

      {/* MODALE RESET PASSWORD */}
      {showResetModal && resetTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Reset password</h2>
              <button onClick={function() { setShowResetModal(false); }} className="text-gray-400 hover:text-gray-600 text-xl font-light">x</button>
            </div>
            <div className="p-6">
              {!resetMessage ? (
                <>
                  <p className="text-sm text-gray-600 mb-6">
                    Verrà inviata un'email di reset password a <strong>{resetTarget.display_name || (resetTarget.first_name + ' ' + resetTarget.last_name)}</strong>.
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
                    <div className="text-4xl mb-3">📧</div>
                    <p className="text-sm font-medium text-gray-900">{resetMessage}</p>
                  </div>
                  <button onClick={function() { setShowResetModal(false); }} className="w-full bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium mt-2">Chiudi</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODALE RESET PIN */}
      {showPinModal && pinTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Reset PIN</h2>
              <button onClick={function() { setShowPinModal(false); }} className="text-gray-400 hover:text-gray-600 text-xl font-light">x</button>
            </div>
            <div className="p-6">
              {!pinMessage ? (
                <>
                  <p className="text-sm text-gray-600 mb-6">
                    Stai per azzerare il PIN di <strong>{pinTarget.display_name || (pinTarget.first_name + ' ' + pinTarget.last_name)}</strong>. Dopo il reset l'utente dovrà impostarne uno nuovo dal proprio profilo.
                  </p>
                  {pinError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{pinError}</div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={function() { setShowPinModal(false); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
                    <button
                      onClick={handleResetPin}
                      disabled={pinLoading}
                      className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      {pinLoading ? 'Operazione...' : 'Azzera PIN'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center py-4">
                    <div className="text-4xl mb-3">🔢</div>
                    <p className="text-sm font-medium text-gray-900">{pinMessage}</p>
                  </div>
                  <button onClick={function() { setShowPinModal(false); }} className="w-full bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium mt-2">Chiudi</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
