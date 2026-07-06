import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import {
  Calendar, ChevronLeft, ChevronRight, Plus, X, Clock,
  Users, Coffee, Moon, Trash2, BedDouble
} from "lucide-react";

// Timeline visibile: dalle 6:00 alle 24:00
var TL_START = 6;
var TL_END = 24;
var TL_SPAN = TL_END - TL_START;

var DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

function pad(n) { return n < 10 ? "0" + n : "" + n; }
function toISO(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function parseISO(s) { var p = s.split("-"); return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)); }
function addDays(iso, n) { var d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
function mondayOf(iso) {
  var d = parseISO(iso);
  var day = d.getDay();
  var diff = (day === 0) ? -6 : (1 - day);
  d.setDate(d.getDate() + diff);
  return toISO(d);
}
function formatDayLabel(iso) { var d = parseISO(iso); return d.getDate() + "/" + pad(d.getMonth() + 1); }

function timeToHours(t) {
  if (!t) return null;
  var p = t.split(":");
  return parseInt(p[0], 10) + (parseInt(p[1], 10) || 0) / 60;
}
// Fine 00:00 = 24 (fine giornata)
function endHours(t) { var h = timeToHours(t); if (h === 0) return 24; return h; }
function timeShort(t) { if (!t) return ""; return t.substring(0, 5); }
function endLabel(t) { if (timeToHours(t) === 0) return "24:00"; return timeShort(t); }
function pct(h) {
  var clamped = Math.max(TL_START, Math.min(TL_END, h));
  return ((clamped - TL_START) / TL_SPAN) * 100;
}

export default function ShiftsPage() {
  // canManage guarda il PERMESSO granulare "turni" (scrittura), non il ruolo:
  // cosi' funziona per chiunque abbia turni=write e anche con l'elevazione PIN.
  var { canEdit } = useAuth();
  var canManage = canEdit("turni");

  var [weekStart, setWeekStart] = useState(mondayOf(toISO(new Date())));
  var [departments, setDepartments] = useState([]);
  var [selectedDept, setSelectedDept] = useState(null);
  var [staff, setStaff] = useState([]);
  var [templates, setTemplates] = useState([]);
  var [shifts, setShifts] = useState([]);
  var [leaves, setLeaves] = useState([]);
  var [covers, setCovers] = useState({}); // { "iso": { lunch: n, dinner: n } }
  var [loading, setLoading] = useState(true);

  // Pop-up giorno (riepilogo + assegna)
  var [dayPanel, setDayPanel] = useState(null); // iso del giorno aperto, o null

  // Modale assegnazione turno (dentro il pop-up giorno)
  var [showAssign, setShowAssign] = useState(false);
  var [assignStaffId, setAssignStaffId] = useState("");
  var [assignTemplateId, setAssignTemplateId] = useState("");
  var [assignStart, setAssignStart] = useState("");
  var [assignEnd, setAssignEnd] = useState("");
  var [assignNotes, setAssignNotes] = useState("");
  var [assignExtra, setAssignExtra] = useState(false);
  var [savingAssign, setSavingAssign] = useState(false);

  useEffect(function() { loadDepartments(); }, []);

  useEffect(function() {
    if (selectedDept) {
      loadStaff(selectedDept);
      loadTemplates(selectedDept);
    }
  }, [selectedDept]);

  useEffect(function() {
    if (selectedDept) {
      loadShifts(selectedDept, weekStart);
      loadLeaves(weekStart);
      loadCovers(weekStart);
    }
  }, [selectedDept, weekStart]);

  function loadDepartments() {
    setLoading(true);
    supabase.from("staff_departments").select("*").order("sort_order").then(function(result) {
      if (result.error) { alert("Errore caricamento reparti: " + result.error.message); setLoading(false); return; }
      var inShifts = (result.data || []).filter(function(d) { return d.is_active !== false && d.show_in_shifts !== false; });
      setDepartments(inShifts);
      if (inShifts.length > 0 && !selectedDept) setSelectedDept(inShifts[0].id);
      setLoading(false);
    });
  }

  function loadStaff(deptId) {
    supabase.from("staff_members").select("*").eq("department_id", deptId).eq("is_active", true).order("last_name").then(function(result) {
      if (!result.error) setStaff(result.data || []);
    });
  }

  function loadTemplates(deptId) {
    supabase.from("shift_templates").select("*").eq("department_id", deptId).eq("is_active", true).order("sort_order").then(function(result) {
      if (!result.error) setTemplates(result.data || []);
    });
  }

  function loadShifts(deptId, ws) {
    var weekEnd = addDays(ws, 6);
    var rangeStart = addDays(ws, -1);
    supabase.from("staff_shifts").select("*").eq("department_id", deptId).gte("shift_date", rangeStart).lte("shift_date", weekEnd).then(function(result) {
      if (!result.error) setShifts(result.data || []);
    });
  }

  function loadLeaves(ws) {
    var weekEnd = addDays(ws, 6);
    supabase.from("staff_leaves").select("*").eq("status", "approvata").lte("start_date", weekEnd).gte("end_date", addDays(ws, -1)).then(function(result) {
      if (!result.error) setLeaves(result.data || []);
    });
  }

  // Coperti del ristorante (prenotazioni + eventi) per ogni giorno della settimana
  function loadCovers(ws) {
    var weekEnd = addDays(ws, 6);
    var acc = {};
    supabase.from("reservations").select("reservation_date, meal_type, guests_count, status").gte("reservation_date", ws).lte("reservation_date", weekEnd).then(function(result) {
      if (!result.error && result.data) {
        result.data.forEach(function(r) {
          if (r.status === "cancelled") return;
          if (!acc[r.reservation_date]) acc[r.reservation_date] = { lunch: 0, dinner: 0 };
          if (r.meal_type === "lunch") acc[r.reservation_date].lunch += (r.guests_count || 0);
          else if (r.meal_type === "dinner") acc[r.reservation_date].dinner += (r.guests_count || 0);
        });
      }
      return supabase.from("event_dates").select("event_date, meal_type, covers_reserved").gte("event_date", ws).lte("event_date", weekEnd);
    }).then(function(result) {
      if (result && !result.error && result.data) {
        result.data.forEach(function(e) {
          var c = e.covers_reserved || 0;
          if (!c) return;
          if (!acc[e.event_date]) acc[e.event_date] = { lunch: 0, dinner: 0 };
          if (e.meal_type === "lunch") acc[e.event_date].lunch += c;
          else if (e.meal_type === "dinner") acc[e.event_date].dinner += c;
          else if (e.meal_type === "both") { acc[e.event_date].lunch += c; acc[e.event_date].dinner += c; }
        });
      }
      setCovers(acc);
    });
  }

  var weekDays = [];
  for (var i = 0; i < 7; i++) weekDays.push(addDays(weekStart, i));

  function templateName(id) { var t = templates.find(function(x) { return x.id === id; }); return t ? t.name : null; }
  function staffName(id) { var s = staff.find(function(x) { return x.id === id; }); return s ? (s.first_name + " " + s.last_name) : "—"; }

  // turni veri (entry_type === 'turno') di un giorno
  function workShiftsOfDay(iso) {
    return shifts.filter(function(s) { return s.shift_date === iso && s.entry_type !== "riposo"; });
  }
  // riposi marcati di un giorno
  function restsOfDay(iso) {
    return shifts.filter(function(s) { return s.shift_date === iso && s.entry_type === "riposo"; });
  }
  function isRest(staffId, iso) {
    return shifts.some(function(s) { return s.staff_id === staffId && s.shift_date === iso && s.entry_type === "riposo"; });
  }
  function hasWork(staffId, iso) {
    return shifts.some(function(s) { return s.staff_id === staffId && s.shift_date === iso && s.entry_type !== "riposo"; });
  }
  function isOnLeave(staffId, iso) {
    return leaves.some(function(l) { return l.staff_id === staffId && l.start_date <= iso && l.end_date >= iso; });
  }

  // turno del giorno di calendario precedente
  function yesterdayInfo(staffId, iso) {
    var y = addDays(iso, -1);
    if (isOnLeave(staffId, y)) return "ferie";
    if (isRest(staffId, y)) return "riposo";
    var found = shifts.find(function(s) { return s.staff_id === staffId && s.shift_date === y && s.entry_type !== "riposo"; });
    if (!found) return null;
    var tn = templateName(found.template_id);
    return tn ? tn : (timeShort(found.start_time) + "–" + endLabel(found.end_time));
  }

  function weekWorkCount(staffId) {
    return shifts.filter(function(s) {
      return s.staff_id === staffId && s.entry_type !== "riposo" && s.shift_date >= weekStart && s.shift_date <= addDays(weekStart, 6);
    }).length;
  }

  function coverageData(iso) {
    var dayShifts = workShiftsOfDay(iso);
    var step = 0.5;
    var maxc = 1;
    var marks = [];
    for (var h = TL_START; h < TL_END; h += step) {
      var c = 0;
      dayShifts.forEach(function(s) {
        var a = timeToHours(s.start_time);
        var b = endHours(s.end_time);
        if (a != null && b != null && h >= a && h < b) c++;
      });
      if (c > maxc) maxc = c;
      marks.push({ h: h, c: c });
    }
    return marks.map(function(m) {
      return { left: pct(m.h), width: (100 / (TL_SPAN * 2)) - 0.2, height: (m.c / maxc) * 100, gap: m.c === 0 };
    });
  }

  // ---- Azioni ----

  function openAssignFor() {
    setAssignStaffId("");
    setAssignTemplateId("");
    setAssignStart("");
    setAssignEnd("");
    setAssignNotes("");
    setAssignExtra(false);
    setShowAssign(true);
  }

  function pickTemplate(tid) {
    setAssignTemplateId(tid);
    var t = templates.find(function(x) { return x.id === tid; });
    if (t) { setAssignStart(timeShort(t.start_time)); setAssignEnd(timeShort(t.end_time)); }
  }

  function saveAssign() {
    if (!assignStaffId) { alert("Seleziona un dipendente."); return; }
    if (!assignStart || !assignEnd) { alert("Imposta orario di inizio e fine."); return; }
    if (isOnLeave(assignStaffId, dayPanel)) {
      if (!confirm(staffName(assignStaffId) + " risulta in ferie in questo giorno. Assegnare comunque?")) return;
    }
    if (isRest(assignStaffId, dayPanel)) {
      if (!confirm(staffName(assignStaffId) + " è segnato come riposo in questo giorno. Assegnare comunque il turno?")) return;
    }
    setSavingAssign(true);
    supabase.from("staff_shifts").insert({
      shift_date: dayPanel,
      department_id: selectedDept,
      staff_id: assignStaffId,
      template_id: assignTemplateId || null,
      start_time: assignStart,
      end_time: assignEnd,
      notes: assignNotes.trim() || null,
      entry_type: "turno"
    }).then(function(result) {
      setSavingAssign(false);
      if (result.error) { alert("Errore: " + result.error.message); return; }
      setShowAssign(false);
      loadShifts(selectedDept, weekStart);
    });
  }

  function deleteShift(shiftId) {
    if (!confirm("Eliminare questo turno?")) return;
    supabase.from("staff_shifts").delete().eq("id", shiftId).then(function(result) {
      if (result.error) { alert("Errore: " + result.error.message); return; }
      loadShifts(selectedDept, weekStart);
    });
  }

  // segna/togli riposo per un dipendente nel giorno del pop-up
  function toggleRest(staffId) {
    var existing = shifts.find(function(s) { return s.staff_id === staffId && s.shift_date === dayPanel && s.entry_type === "riposo"; });
    if (existing) {
      supabase.from("staff_shifts").delete().eq("id", existing.id).then(function(result) {
        if (result.error) { alert("Errore: " + result.error.message); return; }
        loadShifts(selectedDept, weekStart);
      });
    } else {
      if (hasWork(staffId, dayPanel)) {
        if (!confirm(staffName(staffId) + " ha già un turno in questo giorno. Segnare comunque il riposo?")) return;
      }
      supabase.from("staff_shifts").insert({
        shift_date: dayPanel,
        department_id: selectedDept,
        staff_id: staffId,
        entry_type: "riposo"
      }).then(function(result) {
        if (result.error) { alert("Errore: " + result.error.message); return; }
        loadShifts(selectedDept, weekStart);
      });
    }
  }

  var fixedStaff = staff.filter(function(s) { return !s.is_extra; });
  var extraStaff = staff.filter(function(s) { return s.is_extra; });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-wine-600">Caricamento turni...</div>
      </div>
    );
  }

  var currentDept = departments.find(function(d) { return d.id === selectedDept; });
  var panelIdx = dayPanel ? weekDays.indexOf(dayPanel) : -1;

  return (
    <div className="max-w-5xl mx-auto pb-10">

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="bg-wine-100 p-2 rounded-lg">
          <Calendar className="text-wine-700" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Turni del personale</h1>
          <p className="text-sm text-gray-500">Pianificazione settimanale per reparto</p>
        </div>
      </div>

      {/* Barra controlli */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button onClick={function() { setWeekStart(addDays(weekStart, -7)); }} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors" title="Settimana precedente">
            <ChevronLeft size={16} />
          </button>
          <div className="text-sm font-medium text-gray-800 min-w-44 text-center">
            {formatDayLabel(weekStart)} – {formatDayLabel(addDays(weekStart, 6))}
          </div>
          <button onClick={function() { setWeekStart(addDays(weekStart, 7)); }} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors" title="Settimana successiva">
            <ChevronRight size={16} />
          </button>
          <button onClick={function() { setWeekStart(mondayOf(toISO(new Date()))); }} className="text-xs text-wine-600 hover:text-wine-800 underline ml-1">
            Oggi
          </button>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Reparto</span>
          <select value={selectedDept || ""} onChange={function(e) { setSelectedDept(parseInt(e.target.value, 10)); }} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300">
            {departments.map(function(d) { return <option key={d.id} value={d.id}>{d.name}</option>; })}
          </select>
        </div>
      </div>

      {departments.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          Nessun reparto attivo nelle viste turni. Vai in Impostazioni → Reparti del personale e attiva "Mostra nelle viste turni".
        </div>
      )}

      {/* Griglia settimanale */}
      {currentDept && (
        <div className="space-y-3">
          {weekDays.map(function(iso, idx) {
            var dayShifts = workShiftsOfDay(iso);
            var dayRests = restsOfDay(iso);
            var cov = coverageData(iso);
            var isToday = iso === toISO(new Date());
            var dayCovers = covers[iso] || { lunch: 0, dinner: 0 };

            return (
              <div key={iso} className={"bg-white rounded-xl border p-4 " + (isToday ? "border-wine-300" : "border-gray-200")}>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800">{DAY_NAMES[idx]} {formatDayLabel(iso)}</span>
                  {isToday && <span className="text-xs bg-wine-100 text-wine-700 px-2 py-0.5 rounded-full">oggi</span>}
                  <span className="text-xs text-gray-400">· {dayShifts.length} in turno</span>
                  {dayRests.length > 0 && <span className="text-xs text-gray-400">· {dayRests.length} riposo</span>}
                  <div className="flex-1" />
                  {/* Coperti pranzo / cena */}
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-lg" title="Coperti prenotati a pranzo">
                      <Coffee size={12} /> {dayCovers.lunch}
                    </span>
                    <span className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg" title="Coperti prenotati a cena">
                      <Moon size={12} /> {dayCovers.dinner}
                    </span>
                  </div>
                  {canManage && (
                    <button onClick={function() { setDayPanel(iso); }} className="flex items-center gap-1 bg-wine-100 text-wine-700 px-3 py-1.5 rounded-lg text-xs hover:bg-wine-200 transition-colors">
                      <Users size={13} /> Riepilogo e assegna
                    </button>
                  )}
                </div>

                {/* Scala oraria */}
                <div className="relative h-4 mb-1" style={{ marginLeft: "120px" }}>
                  {[6, 9, 12, 15, 18, 21, 24].map(function(h) {
                    return <span key={h} className="absolute text-xs text-gray-300" style={{ left: pct(h) + "%", transform: "translateX(-50%)" }}>{h}</span>;
                  })}
                </div>

                {/* Barre turni */}
                {dayShifts.length === 0 ? (
                  <p className="text-sm text-gray-300 py-3" style={{ marginLeft: "120px" }}>Nessun turno assegnato</p>
                ) : (
                  <div className="space-y-1.5">
                    {dayShifts.map(function(sh) {
                      var s = staff.find(function(x) { return x.id === sh.staff_id; });
                      var isExtra = s && s.is_extra;
                      var a = timeToHours(sh.start_time);
                      var b = endHours(sh.end_time);
                      var left = pct(a);
                      var width = pct(b) - pct(a);
                      var barColor = isExtra ? "#f59e0b" : (currentDept.color || "#7c3aed");
                      return (
                        <div key={sh.id} className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 truncate text-right" style={{ width: "112px", flexShrink: 0 }}>
                            {s ? (s.last_name + " " + s.first_name.charAt(0) + ".") : "—"}
                          </span>
                          <div className="relative flex-1 h-6">
                            <div className="absolute h-6 rounded flex items-center px-2 gap-1" style={{ left: left + "%", width: width + "%", backgroundColor: barColor }}>
                              <span className="text-xs text-white font-medium truncate">{timeShort(sh.start_time)}–{endLabel(sh.end_time)}</span>
                              {canManage && (
                                <button onClick={function() { deleteShift(sh.id); }} className="ml-auto text-white opacity-70 hover:opacity-100" title="Elimina turno">
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Riposi del giorno */}
                {dayRests.length > 0 && (
                  <div className="mt-2 space-y-1" style={{ marginLeft: "120px" }}>
                    {dayRests.map(function(r) {
                      var s = staff.find(function(x) { return x.id === r.staff_id; });
                      return (
                        <div key={r.id} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-500 rounded px-2 py-0.5 text-xs mr-2">
                          <BedDouble size={11} />
                          {s ? (s.last_name + " " + s.first_name.charAt(0) + ".") : "—"} · riposo
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Istogramma copertura personale */}
                <div className="flex items-end gap-2 mt-3">
                  <span className="text-xs text-gray-300 text-right" style={{ width: "112px", flexShrink: 0 }}>copertura</span>
                  <div className="relative flex-1 h-10 border-b border-gray-200">
                    {cov.map(function(bar, bi) {
                      return <div key={bi} className="absolute bottom-0 rounded-t" style={{ left: bar.left + "%", width: bar.width + "%", height: bar.gap ? "0%" : bar.height + "%", backgroundColor: "#85B7EB" }} />;
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legenda */}
      {currentDept && (
        <div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-2.5 rounded" style={{ backgroundColor: currentDept.color || "#7c3aed" }} /> dipendente fisso</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-2.5 rounded" style={{ backgroundColor: "#f59e0b" }} /> personale extra</span>
          <span className="flex items-center gap-1.5"><Coffee size={12} className="text-amber-600" /> coperti pranzo</span>
          <span className="flex items-center gap-1.5"><Moon size={12} className="text-indigo-600" /> coperti cena</span>
        </div>
      )}

      {/* POP-UP GIORNO: riepilogo + assegna + riposo */}
      {dayPanel && currentDept && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {panelIdx >= 0 ? DAY_NAMES[panelIdx] : ""} {formatDayLabel(dayPanel)} — {currentDept.name}
                </h2>
                <p className="text-xs text-gray-500">Ieri = {formatDayLabel(addDays(dayPanel, -1))}</p>
              </div>
              <button onClick={function() { setDayPanel(null); setShowAssign(false); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-5">

              {/* Pulsante assegna turno */}
              {!showAssign && (
                <button onClick={openAssignFor} className="w-full mb-4 flex items-center justify-center gap-2 bg-wine-700 text-white py-2.5 rounded-lg text-sm hover:bg-wine-800 transition-colors">
                  <Plus size={16} /> Assegna turno
                </button>
              )}

              {/* Form assegnazione (inline nel pop-up) */}
              {showAssign && (
                <div className="mb-4 bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex gap-2">
                    <button onClick={function() { setAssignExtra(false); setAssignStaffId(""); }} className={"flex-1 py-2 rounded-lg text-sm font-medium border transition-colors " + (!assignExtra ? "bg-wine-700 text-white border-wine-700" : "border-gray-200 text-gray-600 hover:bg-white")}>
                      Dipendente fisso
                    </button>
                    <button onClick={function() { setAssignExtra(true); setAssignStaffId(""); }} className={"flex-1 py-2 rounded-lg text-sm font-medium border transition-colors " + (assignExtra ? "bg-amber-500 text-white border-amber-500" : "border-gray-200 text-gray-600 hover:bg-white")}>
                      Personale extra
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dipendente</label>
                    <select value={assignStaffId} onChange={function(e) { setAssignStaffId(e.target.value); }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300">
                      <option value="">— Seleziona —</option>
                      {(assignExtra ? extraStaff : fixedStaff).map(function(s) { return <option key={s.id} value={s.id}>{s.last_name} {s.first_name}</option>; })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Turno tipo (scorciatoia)</label>
                    <select value={assignTemplateId} onChange={function(e) { pickTemplate(e.target.value); }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300">
                      <option value="">— Orario manuale —</option>
                      {templates.map(function(t) { return <option key={t.id} value={t.id}>{t.name} ({timeShort(t.start_time)}–{endLabel(t.end_time)})</option>; })}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><Clock size={12} /> Inizio</label>
                      <input type="time" value={assignStart} onChange={function(e) { setAssignStart(e.target.value); }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><Clock size={12} /> Fine</label>
                      <input type="time" value={assignEnd} onChange={function(e) { setAssignEnd(e.target.value); }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
                      <p className="text-xs text-gray-400 mt-1">Fine 00:00 = 24:00</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Note (opzionale)</label>
                    <input type="text" value={assignNotes} onChange={function(e) { setAssignNotes(e.target.value); }} placeholder="es. copre evento privato" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={function() { setShowAssign(false); }} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-white transition-colors">Annulla</button>
                    <button onClick={saveAssign} disabled={savingAssign} className="flex-1 bg-wine-700 text-white py-2 rounded-lg text-sm hover:bg-wine-800 transition-colors disabled:opacity-50">{savingAssign ? "Salvataggio..." : "Assegna"}</button>
                  </div>
                </div>
              )}

              {/* Riepilogo dipendenti fissi per questo giorno */}
              <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                <Users size={13} /> Dipendenti fissi
              </div>
              <div className="space-y-1">
                {fixedStaff.length === 0 && <p className="text-sm text-gray-400">Nessun dipendente fisso in questo reparto.</p>}
                {fixedStaff.map(function(s) {
                  var y = yesterdayInfo(s.id, dayPanel);
                  var cnt = weekWorkCount(s.id);
                  var onLeave = isOnLeave(s.id, dayPanel);
                  var rest = isRest(s.id, dayPanel);
                  var work = hasWork(s.id, dayPanel);

                  var statusEl;
                  if (onLeave) statusEl = <span className="text-xs text-gray-400">in ferie</span>;
                  else if (work) statusEl = <span className="text-xs text-teal-600">in turno</span>;
                  else if (rest) statusEl = <span className="text-xs text-gray-500">riposo</span>;
                  else statusEl = <span className="text-xs text-gray-300">—</span>;

                  return (
                    <div key={s.id} className="flex items-center gap-2 py-2 px-2 rounded-lg border border-gray-100">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{s.last_name} {s.first_name}</div>
                        <div className="text-xs text-gray-400">
                          ieri: {y === "ferie" ? "ferie" : (y === "riposo" ? "riposo" : (y ? y : "—"))}
                          <span className="mx-1.5">·</span>
                          {cnt} turni sett.
                        </div>
                      </div>
                      <div className="w-16 text-center flex-shrink-0">{statusEl}</div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={function() { toggleRest(s.id); }}
                          className={"px-2 py-1 rounded-lg text-xs border transition-colors flex items-center gap-1 " + (rest ? "bg-gray-200 text-gray-700 border-gray-300" : "border-gray-200 text-gray-500 hover:bg-gray-50")}
                          title={rest ? "Togli riposo" : "Segna riposo"}
                        >
                          <BedDouble size={12} /> {rest ? "Riposo ✓" : "Riposo"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
