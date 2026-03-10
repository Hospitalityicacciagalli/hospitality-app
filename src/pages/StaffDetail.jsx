import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import {
  ArrowLeft, Edit, Phone, Mail, MapPin, Calendar,
  Briefcase, Clock, CheckCircle, XCircle, AlertTriangle,
  Plus, ChevronDown, ChevronUp, User
} from "lucide-react";

var DAY_NAMES = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
var DAY_NAMES_FULL = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

var CONTRACT_LABELS = {
  indeterminato:  "Indeterminato",
  determinato:    "Determinato",
  stagionale:     "Stagionale",
  collaborazione: "Collaborazione"
};

var LEAVE_TYPE_LABELS = {
  ferie:    "Ferie",
  permesso: "Permesso",
  malattia: "Malattia",
  altro:    "Altro"
};

var LEAVE_STATUS_COLORS = {
  richiesta:  "bg-yellow-100 text-yellow-800",
  approvata:  "bg-green-100 text-green-800",
  rifiutata:  "bg-red-100 text-red-800"
};

var MEAL_LABELS = {
  both:   "Pranzo e Cena",
  lunch:  "Solo Pranzo",
  dinner: "Solo Cena"
};

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

function formatDateShort(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysUntilExpiry(dateStr) {
  if (!dateStr) return null;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var end = new Date(dateStr);
  return Math.round((end - today) / (1000 * 60 * 60 * 24));
}

function leaveDays(start, end) {
  if (!start || !end) return 0;
  var s = new Date(start);
  var e = new Date(end);
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

export default function StaffDetail() {
  var navigate = useNavigate();
  var params = useParams();
  var { hasRole, profile } = useAuth();

  var [member, setMember] = useState(null);
  var [availability, setAvailability] = useState([]);
  var [leaves, setLeaves] = useState([]);
  var [loading, setLoading] = useState(true);

  // Form nuova assenza
  var [showLeaveForm, setShowLeaveForm] = useState(false);
  var [leaveType, setLeaveType] = useState("ferie");
  var [leaveStart, setLeaveStart] = useState("");
  var [leaveEnd, setLeaveEnd] = useState("");
  var [leaveNotes, setLeaveNotes] = useState("");
  var [savingLeave, setSavingLeave] = useState(false);

  var [showPastLeaves, setShowPastLeaves] = useState(false);

  var canManage = hasRole(["super_admin", "direttore"]);
  var canApprove = hasRole(["super_admin", "direttore"]);

  useEffect(function() {
    loadMember();
  }, []);

  function loadMember() {
    setLoading(true);
    supabase
      .from("staff_members")
      .select("*, staff_departments(id, name, color)")
      .eq("id", params.id)
      .single()
      .then(function(result) {
        if (result.error) {
          alert("Dipendente non trovato");
          navigate("/staff");
          return;
        }
        setMember(result.data);
        loadAvailability();
        loadLeaves();
        setLoading(false);
      });
  }

  function loadAvailability() {
    supabase
      .from("staff_availability")
      .select("*")
      .eq("staff_id", params.id)
      .order("day_of_week")
      .then(function(result) {
        if (!result.error) setAvailability(result.data || []);
      });
  }

  function loadLeaves() {
    supabase
      .from("staff_leaves")
      .select("*")
      .eq("staff_id", params.id)
      .order("start_date", { ascending: false })
      .then(function(result) {
        if (!result.error) setLeaves(result.data || []);
      });
  }

  function submitLeave() {
    if (!leaveStart || !leaveEnd) {
      alert("Inserisci data inizio e fine.");
      return;
    }
    if (leaveEnd < leaveStart) {
      alert("La data di fine non può essere prima della data di inizio.");
      return;
    }
    setSavingLeave(true);
    supabase
      .from("staff_leaves")
      .insert({
        staff_id:   params.id,
        leave_type: leaveType,
        start_date: leaveStart,
        end_date:   leaveEnd,
        notes:      leaveNotes.trim() || null,
        status:     "richiesta"
      })
      .select()
      .then(function(result) {
        setSavingLeave(false);
        if (result.error) {
          alert("Errore: " + result.error.message);
          return;
        }
        setLeaves(function(prev) { return result.data.concat(prev); });
        setShowLeaveForm(false);
        setLeaveType("ferie");
        setLeaveStart("");
        setLeaveEnd("");
        setLeaveNotes("");
      });
  }

  function approveLeave(leaveId) {
    supabase
      .from("staff_leaves")
      .update({ status: "approvata", approved_by: profile.id, approved_at: new Date().toISOString() })
      .eq("id", leaveId)
      .then(function(result) {
        if (result.error) { alert("Errore: " + result.error.message); return; }
        loadLeaves();
      });
  }

  function rejectLeave(leaveId) {
    var note = prompt("Motivo del rifiuto (opzionale):");
    supabase
      .from("staff_leaves")
      .update({ status: "rifiutata", rejection_note: note || null })
      .eq("id", leaveId)
      .then(function(result) {
        if (result.error) { alert("Errore: " + result.error.message); return; }
        loadLeaves();
      });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-wine-600">Caricamento...</div>
      </div>
    );
  }

  if (!member) return null;

  var days = daysUntilExpiry(member.contract_end_date);
  var contractExpiring = days !== null && days >= 0 && days <= 60;
  var contractExpired  = days !== null && days < 0;

  var today = new Date().toISOString().split("T")[0];
  var upcomingLeaves = leaves.filter(function(l) { return l.end_date >= today; });
  var pastLeaves     = leaves.filter(function(l) { return l.end_date < today; });

  return (
    <div className="max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={function() { navigate("/staff"); }}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div className="flex-1 flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
            style={{ backgroundColor: member.staff_departments ? member.staff_departments.color : "#6b7280" }}
          >
            {member.first_name.charAt(0)}{member.last_name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {member.first_name} {member.last_name}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              {member.job_title && <span className="text-sm text-gray-500">{member.job_title}</span>}
              {member.staff_departments && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: member.staff_departments.color }}
                >
                  {member.staff_departments.name}
                </span>
              )}
              {!member.is_active && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Non attivo</span>
              )}
            </div>
          </div>
        </div>
        {canManage && (
          <button
            onClick={function() { navigate("/staff/" + params.id + "/modifica"); }}
            className="flex items-center gap-2 bg-wine-700 text-white px-4 py-2 rounded-lg hover:bg-wine-800 transition-colors text-sm"
          >
            <Edit size={15} />
            Modifica
          </button>
        )}
      </div>

      {/* Alert contratto */}
      {contractExpiring && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg">
          <AlertTriangle size={18} className="flex-shrink-0" />
          <span className="text-sm font-medium">Contratto in scadenza il {formatDateShort(member.contract_end_date)} ({days} giorni)</span>
        </div>
      )}
      {contractExpired && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          <AlertTriangle size={18} className="flex-shrink-0" />
          <span className="text-sm font-medium">Contratto scaduto il {formatDateShort(member.contract_end_date)}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Dati anagrafici */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <User size={16} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">Dati anagrafici</h2>
          </div>
          <dl className="space-y-2 text-sm">
            {member.fiscal_code && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Codice Fiscale</dt>
                <dd className="font-mono font-medium text-gray-800">{member.fiscal_code}</dd>
              </div>
            )}
            {member.birth_date && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Data nascita</dt>
                <dd className="text-gray-800">{formatDate(member.birth_date)}</dd>
              </div>
            )}
            {member.birth_place && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Luogo nascita</dt>
                <dd className="text-gray-800">{member.birth_place}</dd>
              </div>
            )}
            {member.phone && (
              <div className="flex justify-between">
                <dt className="text-gray-500 flex items-center gap-1"><Phone size={12} /> Telefono</dt>
                <dd className="text-gray-800">{member.phone}</dd>
              </div>
            )}
            {member.email && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 flex items-center gap-1"><Mail size={12} /> Email</dt>
                <dd className="text-gray-800 truncate">{member.email}</dd>
              </div>
            )}
            {(member.address || member.city) && (
              <div className="flex justify-between">
                <dt className="text-gray-500 flex items-center gap-1"><MapPin size={12} /> Indirizzo</dt>
                <dd className="text-gray-800 text-right">{[member.address, member.city].filter(Boolean).join(", ")}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Contratto */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={16} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">Contratto</h2>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Tipo</dt>
              <dd className="font-medium text-gray-800">{CONTRACT_LABELS[member.contract_type] || member.contract_type || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Ore settimanali</dt>
              <dd className="text-gray-800">{member.weekly_hours || "—"}</dd>
            </div>
            {member.hire_date && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Data assunzione</dt>
                <dd className="text-gray-800">{formatDate(member.hire_date)}</dd>
              </div>
            )}
            {member.contract_end_date && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Scadenza</dt>
                <dd className={"font-medium " + (contractExpired ? "text-red-600" : contractExpiring ? "text-amber-600" : "text-gray-800")}>
                  {formatDate(member.contract_end_date)}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Disponibilità settimanale */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">Disponibilità settimanale</h2>
          </div>
          {availability.length === 0 ? (
            <p className="text-sm text-gray-400">Nessuna disponibilità impostata</p>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {DAY_NAMES.map(function(dayShort, idx) {
                var slots = availability.filter(function(a) { return a.day_of_week === idx; });
                var hasSlot = slots.length > 0;
                return (
                  <div key={idx} className="text-center">
                    <div className={"text-xs font-medium mb-1 " + (hasSlot ? "text-wine-700" : "text-gray-300")}>
                      {dayShort}
                    </div>
                    {slots.map(function(s) {
                      return (
                        <div
                          key={s.id}
                          className="text-xs bg-wine-100 text-wine-700 rounded px-1 py-0.5 mb-1"
                          title={MEAL_LABELS[s.meal_type]}
                        >
                          {s.meal_type === "both" ? "P+C" : s.meal_type === "lunch" ? "P" : "C"}
                        </div>
                      );
                    })}
                    {!hasSlot && <div className="text-gray-200 text-xs">—</div>}
                  </div>
                );
              })}
            </div>
          )}
          {canManage && (
            <button
              onClick={function() { navigate("/staff/" + params.id + "/modifica"); }}
              className="mt-3 text-xs text-wine-600 hover:text-wine-800 underline"
            >
              Modifica disponibilità
            </button>
          )}
        </div>

        {/* Note */}
        {member.notes && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={16} className="text-wine-600" />
              <h2 className="font-semibold text-gray-800">Note interne</h2>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{member.notes}</p>
          </div>
        )}

      </div>

      {/* Sezione Ferie e Assenze */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">Ferie e Assenze</h2>
          </div>
          {canManage && (
            <button
              onClick={function() { setShowLeaveForm(!showLeaveForm); }}
              className="flex items-center gap-1 bg-wine-100 text-wine-700 px-3 py-1.5 rounded-lg text-sm hover:bg-wine-200 transition-colors"
            >
              <Plus size={14} />
              Nuova richiesta
            </button>
          )}
        </div>

        {/* Form nuova assenza */}
        {showLeaveForm && (
          <div className="mb-4 bg-wine-50 border border-wine-200 rounded-xl p-4">
            <h3 className="font-medium text-wine-800 mb-3 text-sm">Nuova richiesta assenza</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  value={leaveType}
                  onChange={function(e) { setLeaveType(e.target.value); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                >
                  <option value="ferie">Ferie</option>
                  <option value="permesso">Permesso</option>
                  <option value="malattia">Malattia</option>
                  <option value="altro">Altro</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
                <input
                  type="text"
                  value={leaveNotes}
                  onChange={function(e) { setLeaveNotes(e.target.value); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                  placeholder="Opzionale"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Data inizio</label>
                <input
                  type="date"
                  value={leaveStart}
                  onChange={function(e) { setLeaveStart(e.target.value); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Data fine</label>
                <input
                  type="date"
                  value={leaveEnd}
                  onChange={function(e) { setLeaveEnd(e.target.value); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={function() { setShowLeaveForm(false); }}
                className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={submitLeave}
                disabled={savingLeave}
                className="flex-1 bg-wine-700 text-white py-2 rounded-lg text-sm hover:bg-wine-800 transition-colors disabled:opacity-50"
              >
                {savingLeave ? "Salvataggio..." : "Salva richiesta"}
              </button>
            </div>
          </div>
        )}

        {/* Assenze correnti e future */}
        {upcomingLeaves.length === 0 && !showLeaveForm ? (
          <p className="text-sm text-gray-400">Nessuna assenza registrata</p>
        ) : (
          <div className="space-y-2">
            {upcomingLeaves.map(function(leave) {
              return (
                <div key={leave.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">
                        {LEAVE_TYPE_LABELS[leave.leave_type] || leave.leave_type}
                      </span>
                      <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + (LEAVE_STATUS_COLORS[leave.status] || "bg-gray-100 text-gray-600")}>
                        {leave.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatDateShort(leave.start_date)} → {formatDateShort(leave.end_date)}
                      <span className="ml-2 text-gray-400">({leaveDays(leave.start_date, leave.end_date)} giorni)</span>
                    </div>
                    {leave.notes && <div className="text-xs text-gray-400 mt-0.5">{leave.notes}</div>}
                  </div>
                  {canApprove && leave.status === "richiesta" && (
                    <div className="flex gap-1">
                      <button
                        onClick={function() { approveLeave(leave.id); }}
                        className="p-1.5 hover:bg-green-100 rounded text-gray-400 hover:text-green-600 transition-colors"
                        title="Approva"
                      >
                        <CheckCircle size={16} />
                      </button>
                      <button
                        onClick={function() { rejectLeave(leave.id); }}
                        className="p-1.5 hover:bg-red-100 rounded text-gray-400 hover:text-red-600 transition-colors"
                        title="Rifiuta"
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Storico assenze passate */}
        {pastLeaves.length > 0 && (
          <div className="mt-4">
            <button
              onClick={function() { setShowPastLeaves(!showPastLeaves); }}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              {showPastLeaves ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              Storico ({pastLeaves.length} assenze passate)
            </button>
            {showPastLeaves && (
              <div className="mt-2 space-y-2">
                {pastLeaves.map(function(leave) {
                  return (
                    <div key={leave.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 opacity-60">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-700">
                            {LEAVE_TYPE_LABELS[leave.leave_type] || leave.leave_type}
                          </span>
                          <span className={"text-xs px-2 py-0.5 rounded-full " + (LEAVE_STATUS_COLORS[leave.status] || "bg-gray-100 text-gray-600")}>
                            {leave.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {formatDateShort(leave.start_date)} → {formatDateShort(leave.end_date)}
                          <span className="ml-2">({leaveDays(leave.start_date, leave.end_date)} giorni)</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
