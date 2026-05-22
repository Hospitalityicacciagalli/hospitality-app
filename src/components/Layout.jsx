import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function Layout({ children }) {
  var { profile, signOut, hasRole } = useAuth();
  var navigate = useNavigate();
  var [mobileOpen, setMobileOpen] = useState(false);

  function handleSignOut() {
    signOut().then(function() { navigate('/login'); });
  }

  function getRoleLabel(role) {
    var labels = {
      super_admin: 'Super Admin', proprieta: 'Proprietà', direttore: 'Direttore',
      reception: 'Reception', sala: 'Sala', cucina: 'Cucina'
    };
    return labels[role] || role;
  }

  var navBase = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ';
  var navActive = 'bg-wine-800 text-white';
  var navInactive = 'text-wine-200 hover:bg-wine-800 hover:text-white';
  function navClass(isActive) { return navBase + (isActive ? navActive : navInactive); }

  var sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-wine-800">
        <div className="text-white font-bold text-lg leading-tight">I Cacciagalli</div>
        <div className="text-wine-300 text-xs mt-0.5">Hospitality 2026</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="text-wine-400 text-xs font-semibold uppercase tracking-wider px-3 mb-2">Gestione</div>

        <NavLink to="/prenotazioni" className={function(p) { return navClass(p.isActive); }} onClick={function() { setMobileOpen(false); }}>
          <span className="text-base">📅</span>Prenotazioni
        </NavLink>

        <NavLink to="/clienti" className={function(p) { return navClass(p.isActive); }} onClick={function() { setMobileOpen(false); }}>
          <span className="text-base">👥</span>Clienti
        </NavLink>

        {hasRole(['super_admin','direttore','reception','sala']) && (
          <NavLink to="/staff" className={function(p) { return navClass(p.isActive); }} onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🏷️</span>Staff
          </NavLink>
        )}

        {hasRole(['super_admin','proprieta','direttore','reception','sala']) && (
          <NavLink to="/cassa" className={function(p) { return navClass(p.isActive); }} onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">💰</span>Cassa
          </NavLink>
        )}

        {hasRole(['super_admin','direttore','reception']) && (
          <NavLink to="/gift-card" className={function(p) { return navClass(p.isActive); }} onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🎁</span>Gift Card
          </NavLink>
        )}

        {hasRole(['super_admin','direttore']) && (
          <>
            <div className="text-wine-400 text-xs font-semibold uppercase tracking-wider px-3 mt-4 mb-2">Amministrazione</div>

            <NavLink to="/gestione-sale" className={function(p) { return navClass(p.isActive); }} onClick={function() { setMobileOpen(false); }}>
              <span className="text-base">🪑</span>Sale e Tavoli
            </NavLink>

            <NavLink to="/impostazioni" className={function(p) { return navClass(p.isActive); }} onClick={function() { setMobileOpen(false); }}>
              <span className="text-base">⚙️</span>Impostazioni
            </NavLink>
          </>
        )}

        {hasRole(['super_admin']) && (
          <NavLink to="/utenti" className={function(p) { return navClass(p.isActive); }} onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🔐</span>Utenti App
          </NavLink>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-wine-800">
        <NavLink to="/profilo" className={function(p) { return navClass(p.isActive); }} onClick={function() { setMobileOpen(false); }}>
          <span className="text-base">👤</span>Il mio profilo
        </NavLink>
        <div className="mt-2 px-3 py-2">
          <div className="text-white text-sm font-medium truncate">
            {profile ? (profile.first_name + ' ' + profile.last_name) : '—'}
          </div>
          <div className="text-wine-300 text-xs mt-0.5">{profile ? getRoleLabel(profile.role) : '—'}</div>
        </div>
        <button onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-wine-300 hover:bg-wine-800 hover:text-white transition-colors mt-1">
          <span className="text-base">🚪</span>Esci
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="hidden lg:flex lg:w-60 flex-col bg-wine-900 fixed inset-y-0 left-0 z-30">{sidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={function() { setMobileOpen(false); }} />
      )}

      <aside className={'fixed inset-y-0 left-0 z-50 w-60 bg-wine-900 flex flex-col transform transition-transform duration-200 lg:hidden ' + (mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
        {sidebarContent}
      </aside>

      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        <header className="lg:hidden bg-wine-900 px-4 py-3 flex items-center justify-between">
          <button onClick={function() { setMobileOpen(true); }} className="text-white p-1">
            <div className="w-5 h-0.5 bg-white mb-1"></div>
            <div className="w-5 h-0.5 bg-white mb-1"></div>
            <div className="w-5 h-0.5 bg-white"></div>
          </button>
          <div className="text-white font-semibold text-sm">I Cacciagalli</div>
          <div className="w-7"></div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
