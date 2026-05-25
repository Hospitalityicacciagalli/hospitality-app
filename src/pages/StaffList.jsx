import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { Users, Plus, Search, ChevronRight, AlertTriangle, Phone, Mail, UserCheck } from "lucide-react";

var CONTRACT_LABELS = {
  indeterminato: "Indeterminato",
  determinato:   "Determinato",
  stagionale:    "Stagionale",
  collaborazione: "Collaborazione"
};

var CONTRACT_COLORS = {
  indeterminato: "bg-green-100 text-green-800",
  determinato:   "bg-blue-100 text-blue-800",
  stagionale:    "bg-yellow-100 text-yellow-800",
  collaborazione: "bg-purple-100 text-purple-800"
};

function daysUntilExpiry(dateStr) {
  if (!dateStr) return null;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var end = new Date(dateStr);
  var diff = Math.round((end - today) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function StaffList() {
  var navigate = useNavigate();
  var { hasRole } = useAuth();

  var [staff, setStaff] = useState([]);
  var [departments, setDepartments] = useState([]);
  var [loading, setLoading] = useState(true);
  var [search, setSearch] = useState("");
  var [filterDept, setFilterDept] = useState("all");
  var [filterActive, setFilterActive] = useState("active");
  var [filterType, setFilterType] = useState("all");

  var canManage = hasRole(["super_admin", "direttore"]);

  useEffect(function() {
    loadDepartments();
    loadStaff();
  }, []);

  function loadDepartments() {
    supabase
      .from("staff_departments")
      .select("*")
      .order("sort_order")
      .then(function(result) {
        if (!result.error) setDepartments(result.data || []);
      });
  }

  function loadStaff() {
    setLoading(true);
    supabase
      .from("staff_members")
      .select("*, staff_departments(id, name, color)")
      .order("last_name")
      .then(function(result) {
        if (result.error) {
          alert("Errore nel caricamento staff: " + result.error.message);
        } else {
          setStaff(result.data || []);
        }
        setLoading(false);
      });
  }

  var filtered = staff.filter(function(s) {
    var matchSearch =
      search === "" ||
      (s.first_name + " " + s.last_name).toLowerCase().indexOf(search.toLowerCase()) !== -1 ||
      (s.job_title_value && s.job_title_value.toLowerCase().indexOf(search.toLowerCase()) !== -1);

    var matchDept =
      filterDept === "all" ||
      (s.department_id && s.department_id.toString() === filterDept);

    var matchActive =
      filterActive === "all" ||
      (filterActive === "active" && s.is_active) ||
      (filterActive === "inactive" && !s.is_active);

    var matchType =
      filterType === "all" ||
      (filterType === "strutturati" && !s.is_extra) ||
      (filterType === "extra" && s.is_extra);

    return matchSearch && matchDept && matchActive && matchType;
  });

  var expiringCount = staff.filter(function(s) {
    var days = daysUntilExpiry(s.contract_end_date);
    return s.is_active && days !== null && days >= 0 && days <= 60;
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-wine-600 text-lg">Caricamento staff...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-wine-100 p-2 rounded-lg">
            <Users className="text-wine-700" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
            <p className="text-sm text-gray-500">{staff.filter(function(s) { return s.is_active; }).length} dipendenti attivi</p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={function() { navigate("/staff/nuovo"); }}
            className="flex items-center gap-2 bg-wine-700 text-white px-4 py-2 rounded-lg hover:bg-wine-800 transition-colors"
          >
            <Plus size={18} />
            Nuovo dipendente
          </button>
        )}
      </div>

      {/* Avviso contratti in scadenza */}
      {expiringCount > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg">
          <AlertTriangle size={18} className="flex-shrink-0" />
          <span className="text-sm font-medium">
            {expiringCount} contratto{expiringCount > 1 ? "i" : ""} in scadenza nei prossimi 60 giorni
          </span>
        </div>
      )}

      {/* Filtri */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3">
        {/* Ricerca */}
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cerca per nome o ruolo..."
            value={search}
            onChange={function(e) { setSearch(e.target.value); }}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
          />
        </div>

        {/* Filtro reparto */}
        <select
          value={filterDept}
          onChange={function(e) { setFilterDept(e.target.value); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
        >
          <option value="all">Tutti i reparti</option>
          {departments.map(function(d) {
            return <option key={d.id} value={d.id.toString()}>{d.name}</option>;
          })}
        </select>

        {/* Filtro tipo (strutturati / extra) */}
        <select
          value={filterType}
          onChange={function(e) { setFilterType(e.target.value); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
        >
          <option value="all">Tutti i tipi</option>
          <option value="strutturati">Solo strutturati</option>
          <option value="extra">Solo extra</option>
        </select>

        {/* Filtro stato */}
        <select
          value={filterActive}
          onChange={function(e) { setFilterActive(e.target.value); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
        >
          <option value="active">Attivi</option>
          <option value="inactive">Non attivi</option>
          <option value="all">Tutti</option>
        </select>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg">Nessun dipendente trovato</p>
          {canManage && (
            <button
              onClick={function() { navigate("/staff/nuovo"); }}
              className="mt-4 text-wine-600 hover:text-wine-800 text-sm underline"
            >
              Aggiungi il primo dipendente
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(function(member) {
            var days = daysUntilExpiry(member.contract_end_date);
            var expiring = days !== null && days >= 0 && days <= 60;
            var expired = days !== null && days < 0;

            return (
              <div
                key={member.id}
                onClick={function() { navigate("/staff/" + member.id); }}
                className={"bg-white rounded-xl border cursor-pointer hover:shadow-md transition-all " + (member.is_active ? "border-gray-200" : "border-gray-100 opacity-60")}
              >
                <div className="flex items-center gap-4 p-4">

                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ backgroundColor: member.staff_departments ? member.staff_departments.color : "#6b7280" }}
                  >
                    {member.first_name.charAt(0)}{member.last_name.charAt(0)}
                  </div>

                  {/* Info principale */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">
                        {member.last_name} {member.first_name}
                      </span>
                      {member.is_extra && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <UserCheck size={10} />
                          Extra
                        </span>
                      )}
                      {!member.is_active && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Non attivo</span>
                      )}
                      {expiring && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <AlertTriangle size={10} />
                          Scade in {days} giorni
                        </span>
                      )}
                      {expired && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          Contratto scaduto
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {member.job_title_value && (
                        <span className="text-sm text-gray-500">{member.job_title_value}</span>
                      )}
                      {member.staff_departments && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: member.staff_departments.color }}
                        >
                          {member.staff_departments.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Contatti */}
                  <div className="hidden md:flex flex-col gap-1 text-xs text-gray-400 min-w-32">
                    {member.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={11} /> {member.phone}
                      </span>
                    )}
                    {member.email && (
                      <span className="flex items-center gap-1 truncate max-w-40">
                        <Mail size={11} /> {member.email}
                      </span>
                    )}
                  </div>

                  {/* Contratto */}
                  {member.contract_type && (
                    <span className={"hidden sm:inline-block text-xs px-2 py-1 rounded-full font-medium " + (CONTRACT_COLORS[member.contract_type] || "bg-gray-100 text-gray-600")}>
                      {CONTRACT_LABELS[member.contract_type] || member.contract_type}
                    </span>
                  )}

                  <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
