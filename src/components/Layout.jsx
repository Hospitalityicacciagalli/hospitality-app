import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { Users, Calendar, LogOut, Menu, X, UserCog, Wine, UserCheck, Settings } from "lucide-react";

var ROLE_LABELS = {
  super_admin:       "Super Admin",
  proprieta:         "Proprieta",
  direttore:         "Direttore",
  reception:         "Reception",
  sala:              "Sala",
  cucina:            "Cucina",
  staff_sala:        "Staff Sala",
  staff_cucina:      "Staff Cucina",
  staff_accoglienza: "Staff Accoglienza"
};

export default function Layout(props) {
  var { profile, signOut } = useAuth();
  var navigate = useNavigate();
  var [mobileOpen, setMobileOpen] = useState(false);

  function handleSignOut() {
    signOut();
    navigate("/login");
  }

  function canAccess(roles) {
    if (!profile) return false;
    return roles.indexOf(profile.role) !== -1;
  }

  var canSeeStaff     = canAccess(["super_admin", "direttore", "proprieta"]);
  var canSeeUsers     = canAccess(["super_admin"]);
  var canSeeSettings  = canAccess(["super_admin"]);

  function NavItem(itemProps) {
    return (
      <NavLink
        to={itemProps.to}
        onClick={function() { setMobileOpen(false); }}
        className={function(state) {
          return "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium " +
            (state.isActive
              ? "bg-white text-wine-800 shadow-sm"
              : "text-wine-100 hover:bg-wine-600 hover:text-white");
        }}
      >
        {itemProps.icon}
        {itemProps.label}
      </NavLink>
    );
  }

  var sidebar = (
    <div className="flex flex-col h-full">

      <div className="flex items-center gap-3 px-4 py-5 border-b border-wine-600">
        <div className="bg-white bg-opacity-20 p-2 rounded-lg">
          <Wine size={22} className="text-white" />
        </div>
        <div>
          <div className="text-white font-bold text-base leading-tight">I Cacciagalli</div>
          <div className="text-wine-200 text-xs">Hospitality 2026</div>
        </div>
        <button
          onClick={function() { setMobileOpen(false); }}
          className="ml-auto md:hidden text-wine-200 hover:text-white"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">

        <div className="text-wine-300 text-xs font-semibold uppercase tracking-wider px-4 mb-2">
          Operativo
        </div>
        <NavItem to="/prenotazioni" icon={<Calendar size={18} />} label="Prenotazioni" />
        <NavItem to="/clienti" icon={<Users size={18} />} label="Clienti" />

        {canSeeStaff && (
          <div>
            <div className="text-wine-300 text-xs font-semibold uppercase tracking-wider px-4 mt-4 mb-2">
              Gestione
            </div>
            <NavItem to="/staff" icon={<UserCheck size={18} />} label="Staff" />
          </div>
        )}

        {(canSeeUsers || canSeeSettings) && (
          <div>
            <div className="text-wine-300 text-xs font-semibold uppercase tracking-wider px-4 mt-4 mb-2">
              Amministrazione
            </div>
            {canSeeUsers    && <NavItem to="/utenti"       icon={<UserCog  size={18} />} label="Utenti App" />}
            {canSeeSettings && <NavItem to="/impostazioni" icon={<Settings size={18} />} label="Impostazioni" />}
          </div>
        )}

      </nav>

      {profile && (
        <div className="px-3 py-4 border-t border-wine-600">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-wine-600 bg-opacity-50">
            <div className="w-8 h-8 rounded-full bg-white bg-opacity-20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {profile.first_name ? profile.first_name.charAt(0) : "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">
                {profile.first_name} {profile.last_name}
              </div>
              <div className="text-wine-200 text-xs">
                {ROLE_LABELS[profile.role] || profile.role || "—"}
              </div>
            </div>
            <button onClick={handleSignOut} className="text-wine-200 hover:text-white transition-colors flex-shrink-0" title="Esci">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      <div className="hidden md:flex w-64 bg-wine-700 flex-col flex-shrink-0">
        {sidebar}
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={function() { setMobileOpen(false); }} />
          <div className="relative w-64 bg-wine-700 flex flex-col z-10">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-wine-700 text-white flex-shrink-0">
          <button onClick={function() { setMobileOpen(true); }}><Menu size={22} /></button>
          <div className="flex items-center gap-2">
            <Wine size={18} />
            <span className="font-bold text-sm">I Cacciagalli</span>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {props.children}
        </main>
      </div>

    </div>
  );
}
