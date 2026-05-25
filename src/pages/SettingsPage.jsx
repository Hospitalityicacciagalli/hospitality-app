import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { Settings, Plus, Pencil, Check, X, Building2, Clock, Trash2 } from "lucide-react";

var CATEGORIES = [
  {
    key:         "meal_type",
    label:       "Turni",
    description: "Turni di servizio usati nella disponibilita settimanale dello staff",
    hasColor:    true,
    placeholder: "es. Brunch"
  },
  {
    key:         "contract_type",
    label:       "Tipi di contratto",
    description: "Tipologie contrattuali disponibili nelle schede staff",
    hasColor:    false,
    placeholder: "es. Apprendistato"
  },
  {
    key:         "job_title",
    label:       "Mansioni",
    description: "Ruoli lavorativi assegnabili ai dipendenti",
    hasColor:    false,
    placeholder: "es. Barista"
  }
];

var DEFAULT_COLORS = [
  "#7c3aed", "#dc2626", "#0891b2", "#92400e",
  "#10b981", "#f59e0b", "#6366f1", "#f97316",
  "#0ea5e9", "#84cc16", "#ec4899", "#14b8a6"
];

function ColorPicker(props) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {DEFAULT_COLORS.map(function(c) {
        return (
          <button
            key={c}
            onClick={function() { props.onChange(c); }}
            className={"w-6 h-6 rounded-full border-2 transition-all " + (props.value === c ? "border-gray-800 scale-110" : "border-transparent hover:scale-105")}
            style={{ backgroundColor: c }}
          />
        );
      })}
    </div>
  );
}

function CategorySection(props) {
  var cat = props.category;
  var items = props.items;
  var onRefresh = props.onRefresh;

  var [adding, setAdding] = useState(false);
  var [newLabel, setNewLabel] = useState("");
  var [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  var [saving, setSaving] = useState(false);
  var [editingId, setEditingId] = useState(null);
  var [editLabel, setEditLabel] = useState("");
  var [editColor, setEditColor] = useState("");

  function generateValue(label) {
    return label.toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .substring(0, 50);
  }

  function addItem() {
    if (!newLabel.trim()) return;
    setSaving(true);
    var value = generateValue(newLabel);
    var maxOrder = items.reduce(function(max, i) { return Math.max(max, i.sort_order || 0); }, 0);
    supabase
      .from("config_options")
      .insert({
        category:   cat.key,
        value:      value,
        label:      newLabel.trim(),
        color:      cat.hasColor ? newColor : null,
        sort_order: maxOrder + 1,
        is_active:  true
      })
      .then(function(result) {
        setSaving(false);
        if (result.error) {
          alert("Errore: " + result.error.message);
          return;
        }
        setNewLabel("");
        setNewColor(DEFAULT_COLORS[0]);
        setAdding(false);
        onRefresh();
      });
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditLabel(item.label);
    setEditColor(item.color || DEFAULT_COLORS[0]);
  }

  function saveEdit(item) {
    if (!editLabel.trim()) return;
    var payload = { label: editLabel.trim() };
    if (cat.hasColor) payload.color = editColor;
    supabase
      .from("config_options")
      .update(payload)
      .eq("id", item.id)
      .then(function(result) {
        if (result.error) {
          alert("Errore: " + result.error.message);
          return;
        }
        setEditingId(null);
        onRefresh();
      });
  }

  function toggleActive(item) {
    supabase
      .from("config_options")
      .update({ is_active: !item.is_active })
      .eq("id", item.id)
      .then(function(result) {
        if (result.error) {
          alert("Errore: " + result.error.message);
          return;
        }
        onRefresh();
      });
  }

  var activeItems = items.filter(function(i) { return i.is_active; });
  var inactiveItems = items.filter(function(i) { return !i.is_active; });

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">{cat.label}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{cat.description}</p>
          </div>
          {!adding && (
            <button
              onClick={function() { setAdding(true); }}
              className="flex items-center gap-1 bg-wine-100 text-wine-700 px-3 py-1.5 rounded-lg text-sm hover:bg-wine-200 transition-colors flex-shrink-0"
            >
              <Plus size={14} />
              Aggiungi
            </button>
          )}
        </div>

        {adding && (
          <div className="mt-3 bg-gray-50 rounded-lg p-3">
            <input
              type="text"
              value={newLabel}
              onChange={function(e) { setNewLabel(e.target.value); }}
              placeholder={cat.placeholder}
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
            />
            {cat.hasColor && <ColorPicker value={newColor} onChange={setNewColor} />}
            <div className="flex gap-2 mt-3">
              <button
                onClick={function() { setAdding(false); setNewLabel(""); }}
                className="flex-1 border border-gray-200 text-gray-600 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={addItem}
                disabled={saving || !newLabel.trim()}
                className="flex-1 bg-wine-700 text-white py-1.5 rounded-lg text-sm hover:bg-wine-800 transition-colors disabled:opacity-50"
              >
                {saving ? "Salvataggio..." : "Salva"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-3 space-y-1">
        {activeItems.length === 0 && (
          <p className="text-sm text-gray-400 py-2">Nessuna voce configurata</p>
        )}
        {activeItems.map(function(item) {
          var isEditing = editingId === item.id;
          return (
            <div key={item.id} className="flex items-center gap-3 py-1.5">
              {cat.hasColor && (
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: isEditing ? editColor : (item.color || "#9ca3af") }}
                />
              )}
              {isEditing ? (
                <div className="flex-1">
                  <input
                    type="text"
                    value={editLabel}
                    onChange={function(e) { setEditLabel(e.target.value); }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                  />
                  {cat.hasColor && <ColorPicker value={editColor} onChange={setEditColor} />}
                </div>
              ) : (
                <span className="flex-1 text-sm text-gray-700">{item.label}</span>
              )}
              <div className="flex items-center gap-1 flex-shrink-0">
                {isEditing ? (
                  <>
                    <button
                      onClick={function() { saveEdit(item); }}
                      className="p-1.5 hover:bg-green-100 rounded text-gray-400 hover:text-green-600 transition-colors"
                      title="Salva"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={function() { setEditingId(null); }}
                      className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
                      title="Annulla"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={function() { startEdit(item); }}
                      className="p-1.5 hover:bg-wine-100 rounded text-gray-400 hover:text-wine-600 transition-colors"
                      title="Rinomina"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={function() { toggleActive(item); }}
                      className="p-1.5 hover:bg-red-100 rounded text-gray-400 hover:text-red-500 transition-colors"
                      title="Disattiva"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {inactiveItems.length > 0 && (
        <div className="border-t border-gray-100 px-5 py-3">
          <p className="text-xs text-gray-400 mb-2">Disattivate ({inactiveItems.length})</p>
          <div className="space-y-1">
            {inactiveItems.map(function(item) {
              return (
                <div key={item.id} className="flex items-center gap-3 opacity-50">
                  {cat.hasColor && (
                    <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-300" />
                  )}
                  <span className="flex-1 text-sm text-gray-400 line-through">{item.label}</span>
                  <button
                    onClick={function() { toggleActive(item); }}
                    className="text-xs text-wine-600 hover:text-wine-800 underline"
                  >
                    Riattiva
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ShiftTemplates(props) {
  var departmentId = props.departmentId;

  var [templates, setTemplates] = useState([]);
  var [loading, setLoading] = useState(true);

  var [adding, setAdding] = useState(false);
  var [newName, setNewName] = useState("");
  var [newStart, setNewStart] = useState("");
  var [newEnd, setNewEnd] = useState("");
  var [saving, setSaving] = useState(false);

  var [editingId, setEditingId] = useState(null);
  var [editName, setEditName] = useState("");
  var [editStart, setEditStart] = useState("");
  var [editEnd, setEditEnd] = useState("");

  useEffect(function() {
    loadTemplates();
  }, []);

  function timeForInput(t) {
    if (!t) return "";
    return t.substring(0, 5);
  }

  function loadTemplates() {
    setLoading(true);
    supabase
      .from("shift_templates")
      .select("*")
      .eq("department_id", departmentId)
      .order("sort_order")
      .then(function(result) {
        if (!result.error) setTemplates(result.data || []);
        setLoading(false);
      });
  }

  function addTemplate() {
    if (!newName.trim() || !newStart || !newEnd) {
      alert("Inserisci nome, orario inizio e orario fine.");
      return;
    }
    setSaving(true);
    var maxOrder = templates.reduce(function(max, t) { return Math.max(max, t.sort_order || 0); }, 0);
    supabase
      .from("shift_templates")
      .insert({
        department_id: departmentId,
        name:          newName.trim(),
        start_time:    newStart,
        end_time:      newEnd,
        sort_order:    maxOrder + 1,
        is_active:     true
      })
      .then(function(result) {
        setSaving(false);
        if (result.error) {
          alert("Errore: " + result.error.message);
          return;
        }
        setNewName("");
        setNewStart("");
        setNewEnd("");
        setAdding(false);
        loadTemplates();
      });
  }

  function startEdit(t) {
    setEditingId(t.id);
    setEditName(t.name || "");
    setEditStart(timeForInput(t.start_time));
    setEditEnd(timeForInput(t.end_time));
  }

  function saveEdit(t) {
    if (!editName.trim() || !editStart || !editEnd) {
      alert("Inserisci nome, orario inizio e orario fine.");
      return;
    }
    supabase
      .from("shift_templates")
      .update({ name: editName.trim(), start_time: editStart, end_time: editEnd })
      .eq("id", t.id)
      .then(function(result) {
        if (result.error) {
          alert("Errore: " + result.error.message);
          return;
        }
        setEditingId(null);
        loadTemplates();
      });
  }

  function deleteTemplate(t) {
    if (!confirm("Eliminare il turno tipo \"" + t.name + "\"?")) return;
    supabase
      .from("shift_templates")
      .delete()
      .eq("id", t.id)
      .then(function(result) {
        if (result.error) {
          alert("Errore: " + result.error.message);
          return;
        }
        loadTemplates();
      });
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
          <Clock size={12} /> Turni tipo
        </span>
        {!adding && (
          <button
            onClick={function() { setAdding(true); }}
            className="text-xs text-wine-600 hover:text-wine-800 flex items-center gap-1"
          >
            <Plus size={12} /> Aggiungi turno tipo
          </button>
        )}
      </div>

      {loading && <p className="text-xs text-gray-400">Caricamento...</p>}

      {!loading && templates.length === 0 && !adding && (
        <p className="text-xs text-gray-400">Nessun turno tipo. Aggiungine uno per usarlo come scorciatoia nella pianificazione.</p>
      )}

      <div className="space-y-1">
        {templates.map(function(t) {
          var isEditing = editingId === t.id;
          if (isEditing) {
            return (
              <div key={t.id} className="bg-white border border-gray-200 rounded-lg p-2">
                <input
                  type="text"
                  value={editName}
                  onChange={function(e) { setEditName(e.target.value); }}
                  placeholder="Nome (es. Mattina)"
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-wine-300"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={editStart}
                    onChange={function(e) { setEditStart(e.target.value); }}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                  />
                  <span className="text-gray-400 text-sm">&rarr;</span>
                  <input
                    type="time"
                    value={editEnd}
                    onChange={function(e) { setEditEnd(e.target.value); }}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                  />
                  <button
                    onClick={function() { saveEdit(t); }}
                    className="p-1.5 hover:bg-green-100 rounded text-gray-400 hover:text-green-600 transition-colors"
                    title="Salva"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={function() { setEditingId(null); }}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
                    title="Annulla"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          }
          return (
            <div key={t.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
              <span className="text-sm font-medium text-gray-700">{t.name}</span>
              <span className="text-xs text-gray-500">
                {timeForInput(t.start_time)}&ndash;{timeForInput(t.end_time)}
              </span>
              <div className="flex-1" />
              <button
                onClick={function() { startEdit(t); }}
                className="p-1 hover:bg-wine-100 rounded text-gray-400 hover:text-wine-600 transition-colors"
                title="Modifica"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={function() { deleteTemplate(t); }}
                className="p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-600 transition-colors"
                title="Elimina"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>

      {adding && (
        <div className="mt-2 bg-white border border-gray-200 rounded-lg p-2">
          <input
            type="text"
            value={newName}
            onChange={function(e) { setNewName(e.target.value); }}
            placeholder="Nome (es. Mattina, Pomeriggio, Cross)"
            autoFocus
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-wine-300"
          />
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={newStart}
              onChange={function(e) { setNewStart(e.target.value); }}
              className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
            />
            <span className="text-gray-400 text-sm">&rarr;</span>
            <input
              type="time"
              value={newEnd}
              onChange={function(e) { setNewEnd(e.target.value); }}
              className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
            />
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={function() { setAdding(false); setNewName(""); setNewStart(""); setNewEnd(""); }}
              className="flex-1 border border-gray-200 text-gray-600 py-1 rounded-lg text-xs hover:bg-gray-50 transition-colors"
            >
              Annulla
            </button>
            <button
              onClick={addTemplate}
              disabled={saving}
              className="flex-1 bg-wine-700 text-white py-1 rounded-lg text-xs hover:bg-wine-800 transition-colors disabled:opacity-50"
            >
              {saving ? "Salvataggio..." : "Salva turno tipo"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DepartmentSection() {
  var [departments, setDepartments] = useState([]);
  var [loading, setLoading] = useState(true);

  var [adding, setAdding] = useState(false);
  var [newName, setNewName] = useState("");
  var [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  var [saving, setSaving] = useState(false);

  var [editingId, setEditingId] = useState(null);
  var [editName, setEditName] = useState("");
  var [editColor, setEditColor] = useState("");
  var [editShowInShifts, setEditShowInShifts] = useState(true);

  useEffect(function() {
    loadDepartments();
  }, []);

  function loadDepartments() {
    setLoading(true);
    supabase
      .from("staff_departments")
      .select("*")
      .order("sort_order")
      .then(function(result) {
        if (result.error) {
          alert("Errore nel caricamento reparti: " + result.error.message);
          setLoading(false);
          return;
        }
        setDepartments(result.data || []);
        setLoading(false);
      });
  }

  function addDepartment() {
    if (!newName.trim()) return;
    setSaving(true);
    var maxOrder = departments.reduce(function(max, d) { return Math.max(max, d.sort_order || 0); }, 0);
    supabase
      .from("staff_departments")
      .insert({
        name:           newName.trim(),
        color:          newColor,
        sort_order:     maxOrder + 1,
        is_active:      true,
        show_in_shifts: true,
        min_staff:      1
      })
      .then(function(result) {
        setSaving(false);
        if (result.error) {
          alert("Errore: " + result.error.message);
          return;
        }
        setNewName("");
        setNewColor(DEFAULT_COLORS[0]);
        setAdding(false);
        loadDepartments();
      });
  }

  function startEdit(dept) {
    setEditingId(dept.id);
    setEditName(dept.name || "");
    setEditColor(dept.color || DEFAULT_COLORS[0]);
    setEditShowInShifts(dept.show_in_shifts !== false);
  }

  function saveEdit(dept) {
    if (!editName.trim()) return;
    supabase
      .from("staff_departments")
      .update({ name: editName.trim(), color: editColor, show_in_shifts: editShowInShifts })
      .eq("id", dept.id)
      .then(function(result) {
        if (result.error) {
          alert("Errore: " + result.error.message);
          return;
        }
        setEditingId(null);
        loadDepartments();
      });
  }

  function toggleActive(dept) {
    supabase
      .from("staff_departments")
      .update({ is_active: dept.is_active === false })
      .eq("id", dept.id)
      .then(function(result) {
        if (result.error) {
          alert("Errore: " + result.error.message);
          return;
        }
        loadDepartments();
      });
  }

  var activeDepts = departments.filter(function(d) { return d.is_active !== false; });
  var inactiveDepts = departments.filter(function(d) { return d.is_active === false; });

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-wine-600" />
            <div>
              <h2 className="font-semibold text-gray-800">Reparti del personale</h2>
              <p className="text-xs text-gray-500 mt-0.5">Reparti e relativi turni tipo per la gestione dei turni</p>
            </div>
          </div>
          {!adding && (
            <button
              onClick={function() { setAdding(true); }}
              className="flex items-center gap-1 bg-wine-100 text-wine-700 px-3 py-1.5 rounded-lg text-sm hover:bg-wine-200 transition-colors flex-shrink-0"
            >
              <Plus size={14} />
              Aggiungi
            </button>
          )}
        </div>

        {adding && (
          <div className="mt-3 bg-gray-50 rounded-lg p-3">
            <input
              type="text"
              value={newName}
              onChange={function(e) { setNewName(e.target.value); }}
              placeholder="es. Cantina"
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
            />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <p className="text-xs text-gray-400 mt-2">Dopo averlo creato, aggiungi i turni tipo con la matita.</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={function() { setAdding(false); setNewName(""); }}
                className="flex-1 border border-gray-200 text-gray-600 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={addDepartment}
                disabled={saving || !newName.trim()}
                className="flex-1 bg-wine-700 text-white py-1.5 rounded-lg text-sm hover:bg-wine-800 transition-colors disabled:opacity-50"
              >
                {saving ? "Salvataggio..." : "Salva"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-3 space-y-3">
        {loading && <p className="text-sm text-gray-400 py-2">Caricamento reparti...</p>}
        {!loading && activeDepts.length === 0 && (
          <p className="text-sm text-gray-400 py-2">Nessun reparto configurato</p>
        )}
        {activeDepts.map(function(dept) {
          var isEditing = editingId === dept.id;

          return (
            <div key={dept.id} className="border border-gray-100 rounded-lg p-3">
              {isEditing ? (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nome reparto</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={function(e) { setEditName(e.target.value); }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                  />
                  <ColorPicker value={editColor} onChange={setEditColor} />
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={"sis_" + dept.id}
                      checked={editShowInShifts}
                      onChange={function(e) { setEditShowInShifts(e.target.checked); }}
                      className="w-4 h-4 accent-wine-700"
                    />
                    <label htmlFor={"sis_" + dept.id} className="text-sm text-gray-700">
                      Mostra nelle viste turni
                    </label>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={function() { setEditingId(null); }}
                      className="flex-1 border border-gray-200 text-gray-600 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={function() { saveEdit(dept); }}
                      disabled={!editName.trim()}
                      className="flex-1 bg-wine-700 text-white py-1.5 rounded-lg text-sm hover:bg-wine-800 transition-colors disabled:opacity-50"
                    >
                      Salva
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: dept.color || "#9ca3af" }}
                  />
                  <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800">{dept.name}</span>
                    {dept.show_in_shifts === false && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Fuori dai turni</span>
                    )}
                  </div>
                  <button
                    onClick={function() { startEdit(dept); }}
                    className="p-1.5 hover:bg-wine-100 rounded text-gray-400 hover:text-wine-600 transition-colors"
                    title="Modifica"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={function() { toggleActive(dept); }}
                    className="p-1.5 hover:bg-red-100 rounded text-gray-400 hover:text-red-500 transition-colors"
                    title="Disattiva"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {!isEditing && <ShiftTemplates departmentId={dept.id} />}
            </div>
          );
        })}
      </div>

      {inactiveDepts.length > 0 && (
        <div className="border-t border-gray-100 px-5 py-3">
          <p className="text-xs text-gray-400 mb-2">Disattivati ({inactiveDepts.length})</p>
          <div className="space-y-1">
            {inactiveDepts.map(function(dept) {
              return (
                <div key={dept.id} className="flex items-center gap-3 opacity-50">
                  <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-300" />
                  <span className="flex-1 text-sm text-gray-400 line-through">{dept.name}</span>
                  <button
                    onClick={function() { toggleActive(dept); }}
                    className="text-xs text-wine-600 hover:text-wine-800 underline"
                  >
                    Riattiva
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  var { hasRole } = useAuth();
  var [options, setOptions] = useState({});
  var [loading, setLoading] = useState(true);

  var canManage = hasRole(["super_admin"]);

  useEffect(function() {
    loadOptions();
  }, []);

  function loadOptions() {
    setLoading(true);
    supabase
      .from("config_options")
      .select("*")
      .order("sort_order")
      .then(function(result) {
        if (result.error) {
          alert("Errore nel caricamento: " + result.error.message);
          setLoading(false);
          return;
        }
        var grouped = {};
        (result.data || []).forEach(function(item) {
          if (!grouped[item.category]) grouped[item.category] = [];
          grouped[item.category].push(item);
        });
        setOptions(grouped);
        setLoading(false);
      });
  }

  if (!canManage) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Settings size={48} className="mx-auto mb-3 opacity-30" />
        <p>Solo il Super Admin pu&ograve; accedere alle impostazioni.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-wine-600">Caricamento impostazioni...</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">

      <div className="flex items-center gap-3 mb-6">
        <div className="bg-wine-100 p-2 rounded-lg">
          <Settings className="text-wine-700" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Impostazioni</h1>
          <p className="text-sm text-gray-500">Gestisci i valori personalizzabili dell'app</p>
        </div>
      </div>

      <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        Le modifiche sono immediate. Disattivare una voce non elimina i dati esistenti che la usano &mdash; la voce non sar&agrave; pi&ugrave; selezionabile per i nuovi inserimenti.
      </div>

      <div className="space-y-6">
        {CATEGORIES.map(function(cat) {
          return (
            <CategorySection
              key={cat.key}
              category={cat}
              items={options[cat.key] || []}
              onRefresh={loadOptions}
            />
          );
        })}

        <DepartmentSection />
      </div>

    </div>
  );
}
