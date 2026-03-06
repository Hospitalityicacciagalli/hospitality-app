import { Outlet, NavLink } from 'react-router-dom'
import { Users, CalendarDays, Menu, LogOut, Settings, Shield } from 'lucide-react'
import { useState } from 'react'
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

function Layout() {
  var sidebarState = useState(false)
  var sidebarOpen = sidebarState[0]
  var setSidebarOpen = sidebarState[1]

  var auth = useAuth()
  var profile = auth.profile

  var navItems = [
    { to: '/clienti', icon: Users, label: 'Clienti' },
    { to: '/prenotazioni', icon: CalendarDays, label: 'Prenotazioni' },
  ]

  // Aggiungi voce Utenti solo per Super Admin
  if (auth.hasRole(['super_admin'])) {
    navItems.push({ to: '/utenti', icon: Shield, label: 'Utenti' })
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={function() { setSidebarOpen(false) }}
        />
      )}

      <aside
        className={
          "fixed inset-y-0 left-0 z-30 w-64 bg-wine-800 text-white transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 flex flex-col " +
          (sidebarOpen ? "translate-x-0" : "-translate-x-full")
        }
      >
        {/* Logo */}
        <div className="p-6 border-b border-wine-700">
          <h1 className="text-xl font-bold">I Cacciagalli</h1>
          <p className="text-wine-200 text-sm mt-1">Gestionale</p>
        </div>

        {/* Navigazione */}
        <nav className="p-4 space-y-1 flex-1">
          {navItems.map(function(item) {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={function() { setSidebarOpen(false) }}
                className={function(props) {
                  return "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors " +
                    (props.isActive
                      ? "bg-wine-700 text-white"
                      : "text-wine-200 hover:bg-wine-700 hover:text-white")
                }}
              >
                <item.icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* Profilo utente e logout in fondo */}
        {profile && (
          <div className="p-4 border-t border-wine-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-wine-600 flex items-center justify-center text-sm font-bold">
                {profile.first_name[0]}{profile.last_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {profile.first_name} {profile.last_name}
                </p>
                <p className="text-xs text-wine-300">
                  {roleLabels[profile.role] || profile.role}
                </p>
              </div>
            </div>
            <button
              onClick={function() { auth.signOut() }}
              className="flex items-center gap-2 w-full px-4 py-2 text-wine-200 hover:text-white hover:bg-wine-700 rounded-lg transition-colors text-sm"
            >
              <LogOut size={16} />
              <span>Esci</span>
            </button>
          </div>
        )}
      </aside>

      {/* Contenuto principale */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between lg:hidden">
          <div className="flex items-center gap-4">
            <button
              onClick={function() { setSidebarOpen(true) }}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              <Menu size={24} />
            </button>
            <h1 className="text-lg font-semibold text-gray-800">I Cacciagalli</h1>
          </div>
          {profile && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center text-xs font-bold">
                {profile.first_name[0]}{profile.last_name[0]}
              </div>
            </div>
          )}
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
