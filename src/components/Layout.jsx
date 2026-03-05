import { Outlet, NavLink } from 'react-router-dom'
import { Users, Calendar, UtensilsCrossed, Menu, X } from 'lucide-react'
import { useState } from 'react'

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = [
    { to: '/clienti', icon: Users, label: 'Clienti' },
    // Moduli futuri - li attiveremo man mano
    // { to: '/prenotazioni', icon: Calendar, label: 'Prenotazioni' },
    // { to: '/menu', icon: UtensilsCrossed, label: 'Menù' },
  ]

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Overlay mobile quando sidebar è aperta */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-64 bg-wine-800 text-white transform transition-transform duration-200 ease-in-out
          lg:relative lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo / Titolo */}
        <div className="p-6 border-b border-wine-700">
          <h1 className="text-xl font-bold">I Cacciagalli</h1>
          <p className="text-wine-200 text-sm mt-1">Gestionale</p>
        </div>

        {/* Navigazione */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-wine-700 text-white'
                    : 'text-wine-200 hover:bg-wine-700 hover:text-white'
                }`
              }
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Contenuto principale */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header mobile */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <Menu size={24} />
          </button>
          <h1 className="text-lg font-semibold text-gray-800">I Cacciagalli</h1>
        </header>

        {/* Area contenuto */}
        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
