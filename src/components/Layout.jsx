import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import ConfermaPin from './ConfermaPin';

export default function Layout({ children }) {
  var {
    profile, signOut, canView, canEdit,
    elevato, elevazione, secondiResidui,
    attivaElevazione, terminaElevazione
  } = useAuth();
  var navigate = useNavigate();
  var location = useLocation();
  var [mobileOpen, setMobileOpen] = useState(false);

  // Dispositivo condiviso: letto dal localStorage (impostato in ProfilePage).
  var [sharedDevice, setSharedDevice] = useState(function() {
    try { return localStorage.getItem('icg_shared_device') === '1'; } catch (e) { return false; }
  });

  // Minuti di elevazione, letti da restaurant_settings (default 5).
  var [minutiElevazione, setMinutiElevazione] = useState(5);

  // Modale PIN per elevazione / rinnovo.
  var [showPinModal, setShowPinModal] = useState(false);

  useEffect(function() {
    // Rileggo il flag "dispositivo condiviso" a ogni cambio pagina:
    // cosi' se lo attivi/disattivi nel profilo, il pulsante compare/sparisce.
    try { setSharedDevice(localStorage.getItem('icg_shared_device') === '1'); } catch (e) {}
  }, [location.pathname]);

  useEffect(function() {
    supabase.from('restaurant_settings')
      .select('elevazione_minuti')
      .limit(1)
      .then(function(result) {
        if (!result.error && result.data && result.data.length > 0) {
          var m = result.data[0].elevazione_minuti;
          if (m && m > 0) setMinutiElevazione(m);
        }
      });
  }, []);

  function handleSignOut() {
    signOut().then(function() {
      navigate('/login');
    });
  }

  function openEleva() {
    setShowPinModal(true);
  }

  function onPinConfirmed(info) {
    setShowPinModal(false);
    // Chiunque confermi con nick + PIN ottiene una finestra fresca
    // con i propri rami. Vale sia per l'ingresso sia per l'estensione.
    attivaElevazione(info, minutiElevazione);
  }

  function tornaAlBase() {
    terminaElevazione();
  }

  function formatTempo(sec) {
    if (sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

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

  var navLinkBase = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ';
  var navLinkActive = 'bg-wine-800 text-white';
  var navLinkInactive = 'text-wine-200 hover:bg-wine-800 hover:text-white';

  function navClass(isActive) {
    return navLinkBase + (isActive ? navLinkActive : navLinkInactive);
  }

  // Per il menu Stipendi: e' attivo se siamo su una qualunque sotto-pagina
  var stipendiActive = location.pathname.indexOf('/stipendi') === 0;

  // Per il menu Campagna: attivo su qualunque sotto-pagina campagna.
  var campagnaActive = location.pathname.indexOf('/campagna') === 0;

  var showAdminSection = canView('impostazioni');

  // Percentuale della barra del timer (residuo su totale).
  var totaleSec = minutiElevazione * 60;
  var pct = (elevato && totaleSec > 0) ? Math.max(0, Math.min(100, Math.round(secondiResidui / totaleSec * 100))) : 0;
  var inScadenza = elevato && secondiResidui <= 20;

  var sidebarContent = (
    <div className="flex flex-col h-full">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-wine-800">
        <div className="text-white font-bold text-lg leading-tight">I Cacciagalli</div>
        <div className="text-wine-300 text-xs mt-0.5">Hospitality 2026</div>
      </div>

      {/* Navigazione principale */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">

        <div className="text-wine-400 text-xs font-semibold uppercase tracking-wider px-3 mb-2">Gestione</div>

        {canView('prenotazioni') && (
          <NavLink
            to="/prenotazioni"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">📅</span>
            Prenotazioni
          </NavLink>
        )}

        {canView('importa_prenotazioni') && (
          <NavLink
            to="/prenotazioni/importa"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">📥</span>
            Importa prenotazioni
          </NavLink>
        )}

        {canView('limiti') && (
          <NavLink
            to="/limiti"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🪑</span>
            Limiti coperti
          </NavLink>
        )}

        {canView('clienti') && (
          <NavLink
            to="/clienti"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">👥</span>
            Clienti
          </NavLink>
        )}

        {canView('sale') && (
          <NavLink
            to="/sale"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🗺️</span>
            Sale e Tavoli
          </NavLink>
        )}

        {canView('staff') && (
          <NavLink
            to="/staff"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🏷️</span>
            Staff
          </NavLink>
        )}

        {canView('turni') && (
          <NavLink
            to="/turni"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🗓️</span>
            Turni
          </NavLink>
        )}

        {canView('cassa') && (
          <NavLink
            to="/cassa"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">💰</span>
            Cassa
          </NavLink>
        )}

        {canView('ordini_bordo') && (
          <NavLink
            to="/ordini-bordo"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🍹</span>
            Ordini Bordo
          </NavLink>
        )}

        {canView('listino_bordo') && (
          <NavLink
            to="/listino-bordo"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">📋</span>
            Listino Bordo
          </NavLink>
        )}

        {/* Gift Card ed esperienze — ognuna con permesso dedicato. */}
        {canView('gift_card') && (
          <NavLink
            to="/gift-card"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🎁</span>
            Gift Card
          </NavLink>
        )}

        {canView('wine_tour') && (
          <NavLink
            to="/wine-tour"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🍷</span>
            Wine Tour
          </NavLink>
        )}

        {canView('cooking_class') && (
          <NavLink
            to="/cooking-class"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">👨‍🍳</span>
            Cooking Class
          </NavLink>
        )}

        {/* Stipendi: voce principale + sotto-voci se attivo */}
        {canView('stipendi') && (
          <>
            <NavLink
              to="/stipendi/mese"
              className={function(p) {
                var isActive = p.isActive || location.pathname === '/stipendi';
                return navClass(isActive);
              }}
              onClick={function() { setMobileOpen(false); }}>
              <span className="text-base">💶</span>
              Stipendi
            </NavLink>
            {stipendiActive && (
              <div className="ml-3 pl-3 border-l border-wine-700 space-y-1">
                <NavLink
                  to="/stipendi/mese"
                  className={function(p) {
                    var base = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ';
                    return base + (p.isActive ? 'bg-wine-800 text-white' : 'text-wine-300 hover:text-white');
                  }}
                  onClick={function() { setMobileOpen(false); }}>
                  Mese
                </NavLink>
                <NavLink
                  to="/stipendi/buste"
                  className={function(p) {
                    var base = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ';
                    return base + (p.isActive ? 'bg-wine-800 text-white' : 'text-wine-300 hover:text-white');
                  }}
                  onClick={function() { setMobileOpen(false); }}>
                  Buste paga
                </NavLink>
                <NavLink
                  to="/stipendi/dipendenti"
                  className={function(p) {
                    var isActive = p.isActive || location.pathname.indexOf('/stipendi/dipendenti') === 0;
                    var base = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ';
                    return base + (isActive ? 'bg-wine-800 text-white' : 'text-wine-300 hover:text-white');
                  }}
                  onClick={function() { setMobileOpen(false); }}>
                  Dipendenti
                </NavLink>
              </div>
            )}
          </>
        )}

        {/* Campagna: voce principale + sotto-voci se attivo */}
        {canView('campagna') && (
          <>
            <NavLink
              to="/campagna/riepilogo"
              className={function(p) {
                var isActive = p.isActive || location.pathname === '/campagna';
                return navClass(isActive);
              }}
              onClick={function() { setMobileOpen(false); }}>
              <span className="text-base">🌾</span>
              Campagna
            </NavLink>
            {campagnaActive && (
              <div className="ml-3 pl-3 border-l border-wine-700 space-y-1">
                <NavLink
                  to="/campagna/riepilogo"
                  className={function(p) {
                    var base = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ';
                    return base + (p.isActive ? 'bg-wine-800 text-white' : 'text-wine-300 hover:text-white');
                  }}
                  onClick={function() { setMobileOpen(false); }}>
                  Riepilogo
                </NavLink>
                {canEdit('campagna') && (
                  <NavLink
                    to="/campagna/importa"
                    className={function(p) {
                      var base = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ';
                      return base + (p.isActive ? 'bg-wine-800 text-white' : 'text-wine-300 hover:text-white');
                    }}
                    onClick={function() { setMobileOpen(false); }}>
                    Importa
                  </NavLink>
                )}
                {canEdit('campagna') && (
                  <NavLink
                    to="/campagna/stipendi"
                    className={function(p) {
                      var base = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ';
                      return base + (p.isActive ? 'bg-wine-800 text-white' : 'text-wine-300 hover:text-white');
                    }}
                    onClick={function() { setMobileOpen(false); }}>
                    In stipendi
                  </NavLink>
                )}
              </div>
            )}
          </>
        )}

        {showAdminSection && (
          <>
            <div className="text-wine-400 text-xs font-semibold uppercase tracking-wider px-3 mt-4 mb-2">Amministrazione</div>

            {canView('impostazioni') && (
              <NavLink
                to="/impostazioni"
                className={function(p) { return navClass(p.isActive); }}
                onClick={function() { setMobileOpen(false); }}>
                <span className="text-base">⚙️</span>
                Impostazioni
              </NavLink>
            )}
          </>
        )}

        {canView('utenti') && (
          <NavLink
            to="/utenti"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🔐</span>
            Utenti App
          </NavLink>
        )}

      </nav>

      {/* Sezione profilo utente in fondo */}
      <div className="px-3 py-3 border-t border-wine-800">

        {/* Elevazione: entra / torna al base (solo su dispositivo condiviso) */}
        {elevato ? (
          <button
            onClick={function() { tornaAlBase(); setMobileOpen(false); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors mb-1">
            <span className="text-base">🔒</span>
            Torna al base
          </button>
        ) : (sharedDevice && (
          <button
            onClick={function() { openEleva(); setMobileOpen(false); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium bg-wine-700 text-white hover:bg-wine-600 transition-colors mb-1">
            <span className="text-base">🔓</span>
            Entra con PIN
          </button>
        ))}

        <NavLink
          to="/profilo"
          className={function(p) { return navClass(p.isActive); }}
          onClick={function() { setMobileOpen(false); }}>
          <span className="text-base">👤</span>
          Il mio profilo
        </NavLink>

        <div className="mt-2 px-3 py-2">
          <div className="text-white text-sm font-medium truncate">
            {profile ? (profile.first_name + ' ' + profile.last_name) : '—'}
          </div>
          <div className="text-wine-300 text-xs mt-0.5">
            {profile ? getRoleLabel(profile.role) : '—'}
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-wine-300 hover:bg-wine-800 hover:text-white transition-colors mt-1">
          <span className="text-base">🚪</span>
          Esci
        </button>

      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-gray-50">

      {/* Sidebar desktop */}
      <aside className="hidden lg:flex lg:w-60 flex-col bg-wine-900 fixed inset-y-0 left-0 z-30">
        {sidebarContent}
      </aside>

      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={function() { setMobileOpen(false); }}
        />
      )}

      {/* Sidebar mobile */}
      <aside className={
        'fixed inset-y-0 left-0 z-50 w-60 bg-wine-900 flex flex-col transform transition-transform duration-200 lg:hidden ' +
        (mobileOpen ? 'translate-x-0' : '-translate-x-full')
      }>
        {sidebarContent}
      </aside>

      {/* Contenuto principale */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">

        {/* Fascia ELEVAZIONE attiva */}
        {elevato && (
          <div className={'text-white ' + (inScadenza ? 'bg-red-700' : 'bg-wine-800')}>
            <div className="px-4 py-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">🔓</span>
                <span className="text-sm font-medium truncate">
                  Attivo come {elevazione ? elevazione.nome : ''}
                </span>
                <span className="text-sm font-mono tabular-nums bg-black bg-opacity-20 px-2 py-0.5 rounded ml-1">
                  {formatTempo(secondiResidui)}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {inScadenza && (
                  <button
                    onClick={openEleva}
                    className="text-sm font-medium bg-white text-red-700 px-3 py-1 rounded-lg hover:bg-red-50">
                    Estendi
                  </button>
                )}
                <button
                  onClick={tornaAlBase}
                  className="text-sm font-medium bg-black bg-opacity-25 text-white px-3 py-1 rounded-lg hover:bg-opacity-40">
                  Torna al base
                </button>
              </div>
            </div>
            {/* Barra che si accorcia */}
            <div className="h-1 bg-black bg-opacity-20">
              <div
                className={'h-full transition-all duration-1000 ease-linear ' + (inScadenza ? 'bg-white' : 'bg-amber-400')}
                style={{ width: pct + '%' }}
              />
            </div>
            {inScadenza && (
              <div className="px-4 py-1.5 text-xs bg-black bg-opacity-20">
                La sessione sta per scadere. Premi <span className="font-semibold">Estendi</span> e reinserisci il PIN per continuare.
              </div>
            )}
          </div>
        )}

        {/* Header mobile */}
        <header className="lg:hidden bg-wine-900 px-4 py-3 flex items-center justify-between">
          <button
            onClick={function() { setMobileOpen(true); }}
            className="text-white p-1">
            <div className="w-5 h-0.5 bg-white mb-1"></div>
            <div className="w-5 h-0.5 bg-white mb-1"></div>
            <div className="w-5 h-0.5 bg-white"></div>
          </button>
          <div className="text-white font-semibold text-sm">I Cacciagalli</div>
          <div className="w-7"></div>
        </header>

        {/* Contenuto pagina */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>

      </div>

      {/* Modale PIN: ingresso ed estensione dell'elevazione */}
      <ConfermaPin
        open={showPinModal}
        title={elevato ? 'Estendi la sessione' : 'Entra con PIN'}
        message={elevato
          ? 'Scegli il tuo nome e reinserisci il PIN per estendere la sessione.'
          : 'Scegli il tuo nome e inserisci il tuo PIN a 6 cifre per accedere ai tuoi rami su questo dispositivo condiviso.'}
        onCancel={function() { setShowPinModal(false); }}
        onConfirmed={onPinConfirmed}
      />

    </div>
  );
}
