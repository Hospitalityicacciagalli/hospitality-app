import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import {
  Calendar, ChevronLeft, ChevronRight, Plus, X, Clock,
  Users, Coffee, Moon, Trash2, BedDouble, Pencil, Copy, AlertTriangle
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
  // FONTE UNICA dei reparti: tutti, anche quelli fuori dai turni.
  // Servono per nominare il reparto di un turno in conflitto (regola 31: una copia sola).
  var [allDepartments, setAllDepartments] = useState([]);
  var [selectedDept, setSelectedDept] = useState(null);
  var [staff, setStaff] = useState([]);
  var [templates, setTemplates] = useState([]);
  // FONTE UNICA dei turni: TUTTI i reparti della settimana.
  // I turni del reparto selezionato sono un filtro di questi, non una seconda lettura.
  var [allShifts, setAllShifts] = useState([]);
  var [leaves, setLeaves] = useState([]);
  var [covers, setCovers] = useState({}); // { "iso": { lunch: n, dinner: n } }
  var [loading, setLoading] = useState(true);

  // Pop-up giorno (riepilogo + assegna)
  var [dayPanel, setDayPanel] = useState(null); // iso del giorno aperto, o null

  // Pannello del singolo turno: Modifica / Duplica / Elimina
  var [shiftPanel, setShiftPanel] = useState(null);   // il turno toccato, o null
  var [panelMode, setPanelMode] = useState("menu");   // "menu" | "modifica" | "duplica"
  var [panelSaving, setPanelSaving] = useState(false);
  var [editStart, setEditStart] = useState("");
  var [editEnd, setEditEnd] = useState("");
  var [editTemplateId, setEditTemplateId] = useState("");
  var [editNotes, setEditNotes] = useState("");
  var [dupSelected, setDupSelected] = useState([]);

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
    loadShifts(weekStart);
    loadLeaves(weekStart);
    loadCovers(weekStart);
  }, [weekStart]);

  function loadDepartments() {
    setLoading(true);
    supabase.from("staff_departments").select("*").order("sort_order").then(function(result) {
      if (result.error) { alert("Errore caricamento reparti: " + result.error.message); setLoading(false); return; }
      var tutti = result.data || [];
      setAllDepartments(tutti);
      var inShifts = tutti.filter(function(d) { return d.is_active !== false && d.show_in_shifts !== false; });
      if (inShifts.length > 0 && !selectedDept) setSelectedDept(inShifts[0].id);
      setLoading(false);
    });
  }

  // Chi compare nella griglia della settimana mostrata.
  //
  // Un dipendente ATTIVO c'e' sempre. Un dipendente NON attivo compare solo
  // se era sotto contratto in quella settimana: cosi' un cessato sparisce
  // dalle settimane future — non e' piu' assegnabile — ma i turni che ha
  // gia' lavorato restano leggibili nelle settimane passate.
  //
  // ⚠️ Serve contract_end_date valorizzata: chi e' stato disattivato a mano
  // senza una data di fine non ricompare mai, esattamente come prima.
  //
  // E' la stessa regola contratto degli Stipendi (lavoraNelMese in
  // StipendiMesePage, sottoContratto in StipendiGiornatePage), applicata
  // alla settimana invece che al mese.
  function inForzaNellaSettimana(s, ws) {
    if (!s) return false;
    if (s.is_active !== false) return true;
    var fine = s.contract_end_date ? String(s.contract_end_date).slice(0, 10) : null;
    if (!fine) return false;
    var inizio = s.hire_date ? String(s.hire_date).slice(0, 10) : null;
    var weekEnd = addDays(ws, 6);
    if (inizio && inizio > weekEnd) return false;
    if (fine < ws) return false;
    return true;
  }

  function ordinaStaff(lista) {
    return lista.slice().sort(function(a, b) {
      var an = (a.last_name || "") + " " + (a.first_name || "");
      var bn = (b.last_name || "") + " " + (b.first_name || "");
      if (an < bn) return -1;
      if (an > bn) return 1;
      return 0;
    });
  }

  // Lo staff di un reparto = chi ce l'ha come reparto PRINCIPALE (staff_members.department_id)
  // piu' chi ce l'ha fra i reparti AGGIUNTIVI (staff_member_departments, migrazione 45).
  function loadStaff(deptId) {
    supabase.from("staff_member_departments").select("staff_id").eq("department_id", deptId).then(function(resExtra) {
      var extraIds = [];
      if (!resExtra.error && resExtra.data) {
        resExtra.data.forEach(function(r) { extraIds.push(r.staff_id); });
      }
      // La lettura NON filtra piu' su is_active: chi compare nella griglia lo
      // decide inForzaNellaSettimana(), che guarda la settimana mostrata.
      // Una lettura sola, il filtro e' derivato (regola 31).
      supabase.from("staff_members").select("*").eq("department_id", deptId).then(function(resBase) {
        var base = (!resBase.error && resBase.data) ? resBase.data : [];
        if (extraIds.length === 0) { setStaff(ordinaStaff(base)); return; }
        supabase.from("staff_members").select("*").in("id", extraIds).then(function(resAgg) {
          var agg = (!resAgg.error && resAgg.data) ? resAgg.data : [];
          var visti = {};
          var uniti = [];
          base.concat(agg).forEach(function(s) {
            if (visti[s.id]) return;
            visti[s.id] = true;
            uniti.push(s);
          });
          setStaff(ordinaStaff(uniti));
        });
      });
    });
  }

  function loadTemplates(deptId) {
    supabase.from("shift_templates").select("*").eq("department_id", deptId).eq("is_active", true).order("sort_order").then(function(result) {
      if (!result.error) setTemplates(result.data || []);
    });
  }

  // Legge i turni di TUTTI i reparti: serve per accorgersi che una persona
  // assegnata a piu' reparti abbia gia' un turno altrove nello stesso giorno.
  function loadShifts(ws) {
    var weekEnd = addDays(ws, 6);
    var rangeStart = addDays(ws, -1);
    supabase.from("staff_shifts").select("*").gte("shift_date", rangeStart).lte("shift_date", weekEnd).then(function(result) {
      if (!result.error) setAllShifts(result.data || []);
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

  // ---- Viste derivate: nessuna seconda lettura, nessuna seconda copia ----
  var departments = allDepartments.filter(function(d) { return d.is_active !== false && d.show_in_shifts !== false; });
  var shifts = allShifts.filter(function(s) { return s.department_id === selectedDept; });

  var weekDays = [];
  for (var i = 0; i < 7; i++) weekDays.push(addDays(weekStart, i));

  function templateName(id) { var t = templates.find(function(x) { return x.id === id; }); return t ? t.name : null; }
  function staffName(id) { var s = staff.find(function(x) { return x.id === id; }); return s ? (s.first_name + " " + s.last_name) : "—"; }
  function deptName(id) { var d = allDepartments.find(function(x) { return x.id === id; }); return d ? d.name : "altro reparto"; }
  // Sta in questo reparto come AGGIUNTIVO (il principale e' un altro).
  function isAggiuntivo(s) { return s.department_id !== selectedDept; }

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

  // ---- CONTROLLO DEL TURNO — UNA COPIA SOLA ----
  // La usano assegna, modifica e duplica. Non va duplicata: se un giorno cambia
  // una regola, deve cambiare qui e basta (regola 31).
  // Restituisce l'elenco dei problemi, in parole. Vuoto = nessun problema.
  function problemiTurno(staffId, iso, start, end, escludiId) {
    var problemi = [];
    if (isOnLeave(staffId, iso)) problemi.push("in ferie");
    if (isRest(staffId, iso)) problemi.push("segnato riposo");

    var a = timeToHours(start);
    var b = endHours(end);
    allShifts.forEach(function(s) {
      if (escludiId && s.id === escludiId) return;
      if (s.staff_id !== staffId) return;
      if (s.shift_date !== iso) return;
      if (s.entry_type === "riposo") return;
      var c = timeToHours(s.start_time);
      var d = endHours(s.end_time);
      if (a == null || b == null || c == null || d == null) return;
      if (a < d && c < b) {
        problemi.push("gia in turno " + timeShort(s.start_time) + "–" + endLabel(s.end_time) + " in " + deptName(s.department_id));
      }
    });
    return problemi;
  }

  function confermaProblemi(nome, problemi) {
    if (problemi.length === 0) return true;
    return confirm(nome + ": " + problemi.join("; ") + ". Procedere comunque?");
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
    if (!confermaProblemi(staffName(assignStaffId), problemiTurno(assignStaffId, dayPanel, assignStart, assignEnd, null))) return;
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
      loadShifts(weekStart);
    });
  }

  function deleteShift(shiftId) {
    if (!confirm("Eliminare questo turno?")) return;
    supabase.from("staff_shifts").delete().eq("id", shiftId).then(function(result) {
      if (result.error) { alert("Errore: " + result.error.message); return; }
      chiudiShiftPanel();
      loadShifts(weekStart);
    });
  }

  // ---- Pannello del singolo turno: Modifica / Duplica / Elimina ----

  function apriShiftPanel(sh) {
    if (!canManage) return;
    setShiftPanel(sh);
    setPanelMode("menu");
    setEditStart(timeShort(sh.start_time));
    setEditEnd(timeShort(sh.end_time));
    setEditTemplateId(sh.template_id || "");
    setEditNotes(sh.notes || "");
    setDupSelected([]);
  }

  function chiudiShiftPanel() {
    setShiftPanel(null);
    setPanelMode("menu");
    setDupSelected([]);
    setPanelSaving(false);
  }

  function pickEditTemplate(tid) {
    setEditTemplateId(tid);
    var t = templates.find(function(x) { return x.id === tid; });
    if (t) { setEditStart(timeShort(t.start_time)); setEditEnd(timeShort(t.end_time)); }
  }

  function salvaModifica() {
    if (!shiftPanel) return;
    if (!editStart || !editEnd) { alert("Imposta orario di inizio e fine."); return; }
    var problemi = problemiTurno(shiftPanel.staff_id, shiftPanel.shift_date, editStart, editEnd, shiftPanel.id);
    if (!confermaProblemi(staffName(shiftPanel.staff_id), problemi)) return;
    setPanelSaving(true);
    supabase.from("staff_shifts").update({
      start_time:  editStart,
      end_time:    editEnd,
      template_id: editTemplateId || null,
      notes:       editNotes.trim() || null,
      updated_at:  new Date().toISOString()
    }).eq("id", shiftPanel.id).then(function(result) {
      setPanelSaving(false);
      if (result.error) { alert("Errore: " + result.error.message); return; }
      chiudiShiftPanel();
      loadShifts(weekStart);
    });
  }

  function toggleDup(staffId) {
    setDupSelected(function(prev) {
      if (prev.indexOf(staffId) !== -1) {
        return prev.filter(function(x) { return x !== staffId; });
      }
      var next = prev.slice();
      next.push(staffId);
      return next;
    });
  }

  // Candidati alla duplica: SOLO chi ha questo reparto, principale o aggiuntivo.
  function candidatiDuplica() {
    if (!shiftPanel) return [];
    // Mai proporre chi non era in forza nella settimana mostrata: il turno
    // duplicato finirebbe addosso a un cessato.
    return staff.filter(function(s) {
      return s.id !== shiftPanel.staff_id && inForzaNellaSettimana(s, weekStart);
    });
  }

  function duplicaSuSelezionati() {
    if (!shiftPanel) return;
    if (dupSelected.length === 0) { alert("Seleziona almeno un collega."); return; }

    var conProblemi = [];
    dupSelected.forEach(function(sid) {
      var p = problemiTurno(sid, shiftPanel.shift_date, shiftPanel.start_time, shiftPanel.end_time, null);
      if (p.length > 0) conProblemi.push("- " + staffName(sid) + ": " + p.join("; "));
    });
    if (conProblemi.length > 0) {
      if (!confirm("Attenzione:\n" + conProblemi.join("\n") + "\n\nDuplicare comunque il turno per tutti i selezionati?")) return;
    }

    var righe = dupSelected.map(function(sid) {
      return {
        shift_date:    shiftPanel.shift_date,
        department_id: shiftPanel.department_id,
        staff_id:      sid,
        template_id:   shiftPanel.template_id || null,
        start_time:    shiftPanel.start_time,
        end_time:      shiftPanel.end_time,
        notes:         shiftPanel.notes || null,
        entry_type:    "turno"
      };
    });

    setPanelSaving(true);
    supabase.from("staff_shifts").insert(righe).then(function(result) {
      setPanelSaving(false);
      if (result.error) { alert("Errore: " + result.error.message); return; }
      chiudiShiftPanel();
      loadShifts(weekStart);
    });
  }

  // segna/togli riposo per un dipendente nel giorno del pop-up
  function toggleRest(staffId) {
    var existing = shifts.find(function(s) { return s.staff_id === staffId && s.shift_date === dayPanel && s.entry_type === "riposo"; });
    if (existing) {
      supabase.from("staff_shifts").delete().eq("id", existing.id).then(function(result) {
        if (result.error) { alert("Errore: " + result.error.message); return; }
        loadShifts(weekStart);
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
        loadShifts(weekStart);
      });
    }
  }

  // Le righe della griglia sono i presenti nella settimana mostrata,
  // non tutti quelli letti dal database.
  var staffSettimana = staff.filter(function(s) { return inForzaNellaSettimana(s, weekStart); });
  var fixedStaff = staffSettimana.filter(function(s) { return !s.is_extra; });
  var extraStaff = staffSettimana.filter(function(s) { return s.is_extra; });

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
                      var altrove = s && isAggiuntivo(s);
                      return (
                        <div
                          key={sh.id}
                          onClick={function() { apriShiftPanel(sh); }}
                          className={"flex items-center gap-2 rounded " + (canManage ? "cursor-pointer hover:bg-gray-50" : "")}
                          title={canManage ? "Tocca il turno per modificarlo, duplicarlo o eliminarlo" : ""}
                        >
                          <span className="text-xs text-gray-600 truncate text-right" style={{ width: "112px", flexShrink: 0 }}>
                            {altrove && <span className="text-gray-400 mr-0.5">•</span>}
                            {s ? (s.last_name + " " + s.first_name.charAt(0) + ".") : "—"}
                          </span>
                          <div className="relative flex-1 h-6">
                            <div className="absolute h-6 rounded flex items-center px-2 gap-1" style={{ left: left + "%", width: width + "%", backgroundColor: barColor }}>
                              <span className="text-xs text-white font-medium truncate">{timeShort(sh.start_time)}–{endLabel(sh.end_time)}</span>
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
          <span className="flex items-center gap-1.5"><span className="text-gray-400">•</span> in aiuto da un altro reparto</span>
          {canManage && <span className="flex items-center gap-1.5"><Pencil size={12} className="text-gray-400" /> tocca un turno per modificarlo o duplicarlo</span>}
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
                    {(assignExtra ? extraStaff : fixedStaff).length === 0 && (
                      <p className="text-sm text-gray-400">Nessuno disponibile in questo reparto.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {(assignExtra ? extraStaff : fixedStaff).map(function(s) {
                        var scelto = assignStaffId === s.id;
                        return (
                          <button
                            key={s.id}
                            onClick={function() { setAssignStaffId(s.id); }}
                            className={"px-3 py-2 rounded-lg text-sm border transition-colors " + (scelto ? "bg-wine-700 text-white border-wine-700" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100")}
                          >
                            {s.last_name} {s.first_name}
                            {isAggiuntivo(s) && <span className={"ml-1 text-xs " + (scelto ? "text-wine-100" : "text-gray-400")}>· in aiuto</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Turno tipo (scorciatoia)</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={function() { setAssignTemplateId(""); }}
                        className={"px-3 py-2 rounded-lg text-sm border transition-colors " + (assignTemplateId === "" ? "bg-gray-700 text-white border-gray-700" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100")}
                      >
                        Orario manuale
                      </button>
                      {templates.map(function(t) {
                        var scelto = assignTemplateId === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={function() { pickTemplate(t.id); }}
                            className={"px-3 py-2 rounded-lg text-sm border transition-colors " + (scelto ? "bg-wine-700 text-white border-wine-700" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100")}
                          >
                            {t.name} ({timeShort(t.start_time)}–{endLabel(t.end_time)})
                          </button>
                        );
                      })}
                    </div>
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
                        <div className="text-sm font-medium text-gray-800 truncate">
                          {s.last_name} {s.first_name}
                          {s.is_active === false && (
                            <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                              non piu&rsquo; in forza
                            </span>
                          )}
                          {isAggiuntivo(s) && (
                            <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                              in aiuto da {deptName(s.department_id)}
                            </span>
                          )}
                        </div>
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

      {/* PANNELLO DEL SINGOLO TURNO: Modifica · Duplica · Elimina */}
      {shiftPanel && canManage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-screen overflow-y-auto">

            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 truncate">
                  {staffName(shiftPanel.staff_id)}
                </h2>
                <p className="text-xs text-gray-500">
                  {formatDayLabel(shiftPanel.shift_date)} · {timeShort(shiftPanel.start_time)}–{endLabel(shiftPanel.end_time)} · {deptName(shiftPanel.department_id)}
                </p>
              </div>
              <button onClick={chiudiShiftPanel} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X size={20} />
              </button>
            </div>

            <div className="p-5">

              {/* MENU */}
              {panelMode === "menu" && (
                <div className="space-y-2">
                  {shiftPanel.notes && (
                    <p className="text-sm text-gray-500 mb-3">Note: {shiftPanel.notes}</p>
                  )}
                  <button
                    onClick={function() { setPanelMode("modifica"); }}
                    className="w-full flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Pencil size={16} className="text-wine-600" />
                    <span className="font-medium">Modifica</span>
                    <span className="text-gray-400 text-xs">orario, turno tipo, note</span>
                  </button>
                  <button
                    onClick={function() { setPanelMode("duplica"); }}
                    className="w-full flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Copy size={16} className="text-wine-600" />
                    <span className="font-medium">Duplica</span>
                    <span className="text-gray-400 text-xs">stesso orario, altri colleghi</span>
                  </button>
                  <button
                    onClick={function() { deleteShift(shiftPanel.id); }}
                    className="w-full flex items-center gap-3 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={16} />
                    <span className="font-medium">Elimina</span>
                  </button>
                </div>
              )}

              {/* MODIFICA */}
              {panelMode === "modifica" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Turno tipo (scorciatoia)</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={function() { setEditTemplateId(""); }}
                        className={"px-3 py-2 rounded-lg text-sm border transition-colors " + (editTemplateId === "" ? "bg-gray-700 text-white border-gray-700" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100")}
                      >
                        Orario manuale
                      </button>
                      {templates.map(function(t) {
                        var scelto = editTemplateId === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={function() { pickEditTemplate(t.id); }}
                            className={"px-3 py-2 rounded-lg text-sm border transition-colors " + (scelto ? "bg-wine-700 text-white border-wine-700" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100")}
                          >
                            {t.name} ({timeShort(t.start_time)}–{endLabel(t.end_time)})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><Clock size={12} /> Inizio</label>
                      <input type="time" value={editStart} onChange={function(e) { setEditStart(e.target.value); }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><Clock size={12} /> Fine</label>
                      <input type="time" value={editEnd} onChange={function(e) { setEditEnd(e.target.value); }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
                      <p className="text-xs text-gray-400 mt-1">Fine 00:00 = 24:00</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Note (opzionale)</label>
                    <input type="text" value={editNotes} onChange={function(e) { setEditNotes(e.target.value); }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={function() { setPanelMode("menu"); }} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">Indietro</button>
                    <button onClick={salvaModifica} disabled={panelSaving} className="flex-1 bg-wine-700 text-white py-2 rounded-lg text-sm hover:bg-wine-800 transition-colors disabled:opacity-50">
                      {panelSaving ? "Salvataggio..." : "Salva"}
                    </button>
                  </div>
                </div>
              )}

              {/* DUPLICA */}
              {panelMode === "duplica" && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">
                    Stesso giorno, stesso orario ({timeShort(shiftPanel.start_time)}–{endLabel(shiftPanel.end_time)}), stesso reparto.
                    Compaiono solo i colleghi che hanno {deptName(shiftPanel.department_id)} fra i loro reparti.
                  </p>

                  {candidatiDuplica().length === 0 && (
                    <p className="text-sm text-gray-400">Nessun altro collega in questo reparto.</p>
                  )}

                  <div className="space-y-1.5">
                    {candidatiDuplica().map(function(s) {
                      var scelto = dupSelected.indexOf(s.id) !== -1;
                      var problemi = problemiTurno(s.id, shiftPanel.shift_date, shiftPanel.start_time, shiftPanel.end_time, null);
                      return (
                        <button
                          key={s.id}
                          onClick={function() { toggleDup(s.id); }}
                          className={"w-full text-left rounded-lg border px-3 py-2 transition-colors " + (scelto ? "bg-wine-50 border-wine-300" : "bg-white border-gray-200 hover:bg-gray-50")}
                        >
                          <div className="flex items-center gap-2">
                            <span className={"w-4 h-4 rounded border flex-shrink-0 " + (scelto ? "bg-wine-700 border-wine-700" : "border-gray-300")} />
                            <span className="text-sm font-medium text-gray-800 flex-1 min-w-0 truncate">
                              {s.last_name} {s.first_name}
                            </span>
                            {s.is_extra && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex-shrink-0">Extra</span>}
                            {isAggiuntivo(s) && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">in aiuto</span>}
                          </div>
                          {problemi.length > 0 && (
                            <div className="flex items-start gap-1.5 mt-1 ml-6 text-xs text-amber-700">
                              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                              <span>{problemi.join(" · ")}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button onClick={function() { setPanelMode("menu"); }} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">Indietro</button>
                    <button onClick={duplicaSuSelezionati} disabled={panelSaving || dupSelected.length === 0} className="flex-1 bg-wine-700 text-white py-2 rounded-lg text-sm hover:bg-wine-800 transition-colors disabled:opacity-50">
                      {panelSaving ? "Salvataggio..." : "Duplica su " + dupSelected.length}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
