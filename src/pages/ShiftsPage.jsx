import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import {
  Calendar, ChevronLeft, ChevronRight, Plus, X, Clock,
  Users, AlertTriangle, Trash2, UserCheck, Pencil
} from "lucide-react";

// Timeline visibile: dalle 6:00 alle 24:00
var TL_START = 6;
var TL_END = 24;
var TL_SPAN = TL_END - TL_START;

var DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
var DAY_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

// ---- Helper date (lavoriamo con stringhe YYYY-MM-DD per evitare problemi di fuso) ----

function pad(n) { return n < 10 ? "0" + n : "" + n; }

function toISO(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function parseISO(s) {
  var p = s.split("-");
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}

function addDays(iso, n) {
  var d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// Lunedì della settimana che contiene la data data
function mondayOf(iso) {
  var d = parseISO(iso);
  var day = d.getDay(); // 0=dom, 1=lun, ...
  var diff = (day === 0) ? -6 : (1 - day);
  d.setDate(d.getDate() + diff);
  return toISO(d);
}

function formatDayLabel(iso) {
  var d = parseISO(iso);
  return d.getDate() + "/" + pad(d.getMonth() + 1);
}

// "12:00:00" o "12:00" -> ore decimali (12.0). "15:30" -> 15.5
function timeToHours(t) {
  if (!t) return null;
  var p = t.split(":");
  return parseInt(p[0], 10) + (parseInt(p[1], 10) || 0) / 60;
}

function timeShort(t) {
  if (!t) return "";
  return t.substring(0, 5);
}

// Posizione % sulla timeline per una ora decimale
function pct(h) {
  var clamped = Math.max(TL_START, Math.min(TL_END, h));
  return ((clamped - TL_START) / TL_SPAN) * 100;
}

export default function ShiftsPage() {
  var { hasRole } = useAuth();
  var canManage = hasRole(["super_admin", "direttore"]);

  var [weekStart, setWeekStart] = useState(mondayOf(toISO(new Date())));
  var [departments, setDepartments] = useState([]);
  var [selectedDept, setSelectedDept] = useState(null);
  var [staff, setStaff] = useState([]);
  var [templates, setTemplates] = useState([]);
  var [shifts, setShifts] = useState([]);
  var [leaves, setLeaves] = useState([]);
  var [loading, setLoading] = useState(true);

  // Modale assegnazione
  var [showAssign, setShowAssign] = useState(false);
  var [assignDate, setAssignDate] = useState(null);
  var [assignStaffId, setAssignStaffId] = useState("");
  var [assignTemplateId, setAssignTemplateId] = useState("");
  var [assignStart, setAssignStart] = useState("");
  var [assignEnd, setAssignEnd] = useState("");
  var [assignNotes, setAssignNotes] = useState("");
  var [assignExtra, setAssignExtra] = useState(false);
  var [savingAssign, setSavingAssign] = useState(false);

  // ---- Caricamenti ----

  useEffect(function() {
    loadDepartments();
  }, []);

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
    }
  }, [selectedDept, weekStart]);

  function loadDepartments() {
    setLoading(true);
    supabase
      .from("staff_departments")
      .select("*")
      .order("sort_order")
      .then(function(result) {
        if (result.error) {
          alert("Errore caricamento reparti: " + result.error.message);
          setLoading(false);
          return;
        }
        var all = result.data || [];
        var inShifts = all.filter(function(d) {
          return d.is_active !== false && d.show_in_shifts !== false;
        });
        setDepartments(inShifts);
        if (inShifts.length > 0 && !selectedDept) {
          setSelectedDept(inShifts[0].id);
        }
        setLoading(false);
      });
  }

  function loadStaff(deptId) {
    supabase
      .from("staff_members")
      .select("*")
      .eq("department_id", deptId)
      .eq("is_active", true)
      .order("last_name")
      .then(function(result) {
        if (!result.error) setStaff(result.data || []);
      });
  }

  function loadTemplates(deptId) {
    supabase
      .from("shift_templates")
      .select("*")
      .eq("department_id", deptId)
      .eq("is_active", true)
      .order("sort_order")
      .then(function(result) {
        if (!result.error) setTemplates(result.data || []);
      });
  }

  function loadShifts(deptId, ws) {
    var weekEnd = addDays(ws, 6);
    // Carichiamo anche il giorno prima del lunedì (per la colonna "ieri")
    var rangeStart = addDays(ws, -1);
    supabase
      .from("staff_shifts")
      .select("*")
      .eq("department_id", deptId)
      .gte("shift_date", rangeStart)
      .lte("shift_date", weekEnd)
      .then(function(result) {
        if (!result.error) setShifts(result.data || []);
      });
  }

  function loadLeaves(ws) {
    var weekEnd = addDays(ws, 6);
    supabase
      .from("staff_leaves")
      .select("*")
      .eq("status", "approvata")
      .lte("start_date", weekEnd)
      .gte("end_date", ws)
      .then(function(result) {
        if (!result.error) setLeaves(result.data || []);
      });
  }

  // ---- Dati derivati ----

  var weekDays = [];
  for (var i = 0; i < 7; i++) weekDays.push(addDays(weekStart, i));

  function staffName(id) {
    var s = staff.find(function(x) { return x.id === id; });
    return s ? (s.first_name + " " + s.last_name) : "—";
  }

  function templateName(id) {
    var t = templates.find(function(x) { return x.id === id; });
    return t ? t.name : null;
  }

  // turni di un certo giorno
  function shiftsOfDay(iso) {
    return shifts.filter(function(s) { return s.shift_date === iso; });
  }

  // un dipendente è in ferie in questa data?
  function isOnLeave(staffId, iso) {
    return leaves.some(function(l) {
      return l.staff_id === staffId && l.start_date <= iso && l.end_date >= iso;
    });
  }

  // turno "di ieri" di un dipendente (giorno di calendario precedente)
  function yesterdayShift(staffId, iso) {
    var y = addDays(iso, -1);
    var found = shifts.find(function(s) { return s.staff_id === staffId && s.shift_date === y; });
    if (!found) {
      if (isOnLeave(staffId, y)) return "ferie";
      return null;
    }
    var tn = templateName(found.template_id);
    return tn ? tn : (timeShort(found.start_time) + "–" + timeShort(found.end_time));
  }

  // quanti turni ha un dipendente nella settimana visualizzata
  function weekShiftCount(staffId) {
    return shifts.filter(function(s) {
      return s.staff_id === staffId && s.shift_date >= weekStart && s.shift_date <= addDays(weekStart, 6);
    }).length;
  }

  // ha almeno un giorno senza turni nella settimana? (riposo dedotto)
  function hasRestDay(staffId) {
    var worked = {};
    shifts.forEach(function(s) {
      if (s.staff_id === staffId && s.shift_date >= weekStart && s.shift_date <= addDays(weekStart, 6)) {
        worked[s.shift_date] = true;
      }
    });
    var count = 0;
    weekDays.forEach(function(d) { if (worked[d]) count++; });
    return count < 7;
  }

  // copertura: per ogni mezza ora quante persone sono in turno
  function coverageBars(iso) {
    var dayShifts = shiftsOfDay(iso);
    var bars = [];
    var step = 0.5;
    var maxc = 1;
    var marks = [];
    for (var h = TL_START; h < TL_END; h += step) {
      var c = 0;
      dayShifts.forEach(function(s) {
        var a = timeToHours(s.start_time);
        var b = timeToHours(s.end_time);
        if (a != null && b != null && h >= a && h < b) c++;
      });
      if (c > maxc) maxc = c;
      marks.push({ h: h, c: c });
    }
    marks.forEach(function(m) {
      bars.push({
        left: pct(m.h),
        width: (100 / (TL_SPAN * 2)) - 0.2,
        height: (m.c / maxc) * 100,
        count: m.c,
        gap: m.c === 0
      });
    });
    return { bars: bars, max: maxc };
  }

  // ---- Azioni ----

  function openAssign(iso) {
    setAssignDate(iso);
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
    if (t) {
      setAssignStart(timeShort(t.start_time));
      setAssignEnd(timeShort(t.end_time));
    }
  }

  function saveAssign() {
    if (!assignStaffId) { alert("Seleziona un dipendente."); return; }
    if (!assignStart || !assignEnd) { alert("Imposta orario di inizio e fine."); return; }

    // Avviso ferie (non blocca)
    if (isOnLeave(assignStaffId, assignDate)) {
      var proceed = confirm(staffName(assignStaffId) + " risulta in ferie in questo giorno. Vuoi assegnare comunque il turno?");
      if (!proceed) return;
    }

    setSavingAssign(true);
    supabase
      .from("staff_shifts")
      .insert({
        shift_date:    assignDate,
        department_id: selectedDept,
        staff_id:      assignStaffId,
        template_id:   assignTemplateId || null,
        start_time:    assignStart,
        end_time:      assignEnd,
        notes:         assignNotes.trim() || null
      })
      .then(function(result) {
        setSavingAssign(false);
        if (result.error) {
          alert("Errore: " + result.error.message);
          return;
        }
        setShowAssign(false);
        loadShifts(selectedDept, weekStart);
      });
  }

  function deleteShift(shiftId) {
    if (!confirm("Eliminare questo turno?")) return;
    supabase
      .from("staff_shifts")
      .delete()
      .eq("id", shiftId)
      .then(function(result) {
        if (result.error) { alert("Errore: " + result.error.message); return; }
        loadShifts(selectedDept, weekStart);
      });
  }

  // dipendenti fissi (non extra) del reparto, per lo specchietto
  var fixedStaff = staff.filter(function(s) { return !s.is_extra; });
  var extraStaff = staff.filter(function(s) { return s.is_extra; });

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-wine-600">Caricamento turni...</div>
      </div>
    );
  }

  var currentDept = departments.find(function(d) { return d.id === selectedDept; });

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
        {/* Navigazione settimana */}
        <div className="flex items-center gap-2">
          <button
            onClick={function() { setWeekStart(addDays(weekStart, -7)); }}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            title="Settimana precedente"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-sm font-medium text-gray-800 min-w-44 text-center">
            {formatDayLabel(weekStart)} – {formatDayLabel(addDays(weekStart, 6))}
          </div>
          <button
            onClick={function() { setWeekStart(addDays(weekStart, 7)); }}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            title="Settimana successiva"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={function() { setWeekStart(mondayOf(toISO(new Date()))); }}
            className="text-xs text-wine-600 hover:text-wine-800 underline ml-1"
          >
            Oggi
          </button>
        </div>

        <div className="flex-1" />

        {/* Selettore reparto */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Reparto</span>
          <select
            value={selectedDept || ""}
            onChange={function(e) { setSelectedDept(parseInt(e.target.value, 10)); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
          >
            {departments.map(function(d) {
              return <option key={d.id} value={d.id}>{d.name}</option>;
            })}
          </select>
        </div>
      </div>

      {departments.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          Nessun reparto attivo nelle viste turni. Vai in Impostazioni → Reparti del personale e attiva "Mostra nelle viste turni".
        </div>
      )}

      {/* Specchietto dipendenti fissi del reparto */}
      {currentDept && fixedStaff.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Users size={16} className="text-wine-600" />
            <span className="text-sm font-medium text-gray-800">Dipendenti fissi — {currentDept.name}</span>
            <span className="text-xs text-gray-400">(carico settimanale)</span>
          </div>
          <div className="px-4 py-2 hidden sm:grid grid-cols-12 gap-2 text-xs text-gray-400 border-b border-gray-100">
            <span className="col-span-4">Dipendente</span>
            <span className="col-span-4">Ieri</span>
            <span className="col-span-2 text-center">Turni sett.</span>
            <span className="col-span-2 text-center">Riposo</span>
          </div>
          <div>
            {fixedStaff.map(function(s) {
              var y = yesterdayShift(s.id, weekStart);
              var cnt = weekShiftCount(s.id);
              var rest = hasRestDay(s.id);
              var cntColor = cnt >= 6 ? "bg-amber-100 text-amber-700" : "bg-teal-50 text-teal-700";
              return (
                <div key={s.id} className="px-4 py-2.5 grid grid-cols-12 gap-2 items-center text-sm border-b border-gray-50 last:border-0">
                  <span className="col-span-6 sm:col-span-4 font-medium text-gray-800 truncate">
                    {s.last_name} {s.first_name}
                  </span>
                  <span className="col-span-6 sm:col-span-4 text-gray-500 text-xs truncate">
                    {y === "ferie"
                      ? <span className="text-gray-400">ferie</span>
                      : (y ? y : <span className="text-gray-300">— riposo</span>)}
                  </span>
                  <span className="col-span-6 sm:col-span-2 text-center">
                    <span className={"inline-block px-2 py-0.5 rounded-full text-xs font-medium " + cntColor}>{cnt}</span>
                  </span>
                  <span className="col-span-6 sm:col-span-2 text-center text-xs">
                    {rest
                      ? <span className="text-teal-600">sì</span>
                      : <span className="text-red-500">no</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Griglia settimanale: una card per giorno */}
      {currentDept && (
        <div className="space-y-3">
          {weekDays.map(function(iso, idx) {
            var dayShifts = shiftsOfDay(iso);
            var cov = coverageBars(iso);
            var isToday = iso === toISO(new Date());

            return (
              <div key={iso} className={"bg-white rounded-xl border p-4 " + (isToday ? "border-wine-300" : "border-gray-200")}>
                {/* Intestazione giorno */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-semibold text-gray-800">{DAY_NAMES[idx]} {formatDayLabel(iso)}</span>
                  {isToday && <span className="text-xs bg-wine-100 text-wine-700 px-2 py-0.5 rounded-full">oggi</span>}
                  <span className="text-xs text-gray-400">· {dayShifts.length} in turno</span>
                  <div className="flex-1" />
                  {canManage && (
                    <button
                      onClick={function() { openAssign(iso); }}
                      className="flex items-center gap-1 bg-wine-100 text-wine-700 px-3 py-1.5 rounded-lg text-xs hover:bg-wine-200 transition-colors"
                    >
                      <Plus size={13} /> Assegna turno
                    </button>
                  )}
                </div>

                {/* Righe di scala oraria */}
                <div className="relative h-4 mb-1" style={{ marginLeft: "120px" }}>
                  {[6, 9, 12, 15, 18, 21, 24].map(function(h) {
                    return (
                      <span key={h} className="absolute text-xs text-gray-300" style={{ left: pct(h) + "%", transform: "translateX(-50%)" }}>{h}</span>
                    );
                  })}
                </div>

                {/* Barre dipendenti */}
                {dayShifts.length === 0 ? (
                  <p className="text-sm text-gray-300 py-3" style={{ marginLeft: "120px" }}>Nessun turno assegnato</p>
                ) : (
                  <div className="space-y-1.5">
                    {dayShifts.map(function(sh) {
                      var s = staff.find(function(x) { return x.id === sh.staff_id; });
                      var isExtra = s && s.is_extra;
                      var onLeave = isOnLeave(sh.staff_id, iso);
                      var a = timeToHours(sh.start_time);
                      var b = timeToHours(sh.end_time);
                      var left = pct(a);
                      var width = pct(b) - pct(a);
                      var barColor = isExtra ? "#f59e0b" : (currentDept.color || "#7c3aed");
                      return (
                        <div key={sh.id} className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 truncate text-right" style={{ width: "112px", flexShrink: 0 }}>
                            {s ? (s.last_name + " " + s.first_name.charAt(0) + ".") : "—"}
                          </span>
                          <div className="relative flex-1 h-6">
                            {onLeave ? (
                              <div
                                className="absolute h-6 rounded flex items-center px-2"
                                style={{ left: "0%", width: "100%", background: "repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 6px, #e5e7eb 6px, #e5e7eb 12px)" }}
                              >
                                <span className="text-xs text-gray-400">in ferie</span>
                              </div>
                            ) : (
                              <div
                                className="absolute h-6 rounded flex items-center px-2 gap-1 group"
                                style={{ left: left + "%", width: width + "%", backgroundColor: barColor }}
                              >
                                <span className="text-xs text-white font-medium truncate">
                                  {timeShort(sh.start_time)}–{timeShort(sh.end_time)}
                                </span>
                                {canManage && (
                                  <button
                                    onClick={function() { deleteShift(sh.id); }}
                                    className="ml-auto text-white opacity-70 hover:opacity-100"
                                    title="Elimina turno"
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Istogramma copertura */}
                <div className="flex items-end gap-2 mt-3">
                  <span className="text-xs text-gray-300 text-right" style={{ width: "112px", flexShrink: 0 }}>copertura</span>
                  <div className="relative flex-1 h-10 border-b border-gray-200">
                    {cov.bars.map(function(bar, bi) {
                      return (
                        <div
                          key={bi}
                          className="absolute bottom-0 rounded-t"
                          style={{
                            left: bar.left + "%",
                            width: bar.width + "%",
                            height: bar.gap ? "0%" : bar.height + "%",
                            backgroundColor: "#85B7EB"
                          }}
                        />
                      );
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
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-2.5 rounded" style={{ backgroundColor: currentDept.color || "#7c3aed" }} /> dipendente fisso
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-2.5 rounded" style={{ backgroundColor: "#f59e0b" }} /> personale extra
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-2.5 rounded" style={{ backgroundColor: "#85B7EB" }} /> copertura
          </span>
        </div>
      )}

      {/* MODALE ASSEGNAZIONE */}
      {showAssign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Assegna turno — {assignDate ? formatDayLabel(assignDate) : ""}
              </h2>
              <button onClick={function() { setShowAssign(false); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">

              {/* Scelta fisso / extra */}
              <div className="flex gap-2">
                <button
                  onClick={function() { setAssignExtra(false); setAssignStaffId(""); }}
                  className={"flex-1 py-2 rounded-lg text-sm font-medium border transition-colors " + (!assignExtra ? "bg-wine-700 text-white border-wine-700" : "border-gray-200 text-gray-600 hover:bg-gray-50")}
                >
                  Dipendente fisso
                </button>
                <button
                  onClick={function() { setAssignExtra(true); setAssignStaffId(""); }}
                  className={"flex-1 py-2 rounded-lg text-sm font-medium border transition-colors " + (assignExtra ? "bg-amber-500 text-white border-amber-500" : "border-gray-200 text-gray-600 hover:bg-gray-50")}
                >
                  Personale extra
                </button>
              </div>

              {/* Dipendente */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dipendente</label>
                <select
                  value={assignStaffId}
                  onChange={function(e) { setAssignStaffId(e.target.value); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                >
                  <option value="">— Seleziona —</option>
                  {(assignExtra ? extraStaff : fixedStaff).map(function(s) {
                    return <option key={s.id} value={s.id}>{s.last_name} {s.first_name}</option>;
                  })}
                </select>
                {(assignExtra ? extraStaff : fixedStaff).length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Nessun {assignExtra ? "extra" : "dipendente fisso"} in questo reparto.
                  </p>
                )}
              </div>

              {/* Turno tipo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Turno tipo (scorciatoia)</label>
                <select
                  value={assignTemplateId}
                  onChange={function(e) { pickTemplate(e.target.value); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                >
                  <option value="">— Orario manuale —</option>
                  {templates.map(function(t) {
                    return <option key={t.id} value={t.id}>{t.name} ({timeShort(t.start_time)}–{timeShort(t.end_time)})</option>;
                  })}
                </select>
                {templates.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">Nessun turno tipo: imposta gli orari a mano qui sotto.</p>
                )}
              </div>

              {/* Orari */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><Clock size={12} /> Inizio</label>
                  <input
                    type="time"
                    value={assignStart}
                    onChange={function(e) { setAssignStart(e.target.value); }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><Clock size={12} /> Fine</label>
                  <input
                    type="time"
                    value={assignEnd}
                    onChange={function(e) { setAssignEnd(e.target.value); }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                  />
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (opzionale)</label>
                <input
                  type="text"
                  value={assignNotes}
                  onChange={function(e) { setAssignNotes(e.target.value); }}
                  placeholder="es. copre evento privato"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={function() { setShowAssign(false); }}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={saveAssign}
                  disabled={savingAssign}
                  className="flex-1 bg-wine-700 text-white py-2.5 rounded-lg text-sm hover:bg-wine-800 transition-colors disabled:opacity-50"
                >
                  {savingAssign ? "Salvataggio..." : "Assegna"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
