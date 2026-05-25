import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { Settings, Plus, Pencil, Check, X, Circle, GripVertical, Building2, Clock, Users } from "lucide-react";

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
      {/* Intestazione sezione */}
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

        {/* Form aggiunta */}
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

      {/* Elenco voci attive */}
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

      {/* Voci disattivate (collassate) */}
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

// ============================================================
// SEZIONE REPARTI DEL PERSONALE — lavora su staff_departments
// (fasce orarie default + minimo personale + visibilità nei turni)
// ============================================================

function DepartmentSection() {
  var [departments, setDepartments] = useState([]);
  var [loading, setLoading] = useState(true);

  var [adding, setAdding] = useState(false);
  var [newName, setNewName] = useState("");
  var [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  var [saving, setSaving] = useState(false);

  var [editingId, setEditingId] = useState(null);
  var [editForm, setEditForm] = useState({
    name: "", color: "", show_in_shifts: true, default_start: "", default_end: "", min_staff: 1
  });

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

  // Converte un valore time del DB (es. "12:00:00") nel formato input "12:00"
  function timeForInput(t) {
    if (!t) return "";
    return t.substring(0, 5);
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
    setEditForm({
      name:           dept.name || "",
      color:          dept.color || DEFAULT_COLORS[0],
      show_in_shifts: dept.show_in_shifts !== false,
      default_start:  timeForInput(dept.default_start),
      default_end:    timeForInput(dept.default_end),
      min_staff:      dept.min_staff != null ? dept.min_staff : 1
    });
  }

  function editChange(field, value) {
    setEditForm(function(prev) {
      var next = {};
      for (var k in prev) next[k] = prev[k];
      next[field] = value;
      return next;
    });
  }

  function saveEdit(dept) {
    if (!editForm.name.trim()) return;
    var payload = {
      name:           editForm.name.trim(),
      color:          editForm.color,
      show_in_shifts: editForm.show_in_shifts,
      default_start:  editForm.default_start || null,
      default_end:    editForm.default_end || null,
      min_staff:      editForm.min_staff !== "" ? parseInt(editForm.min_staff, 10) : 0
    };
    supabase
      .from("staff_departments")
      .update(payload)
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
      {/* Intestazione sezione */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-wine-600" />
            <div>
              <h2 className="font-semibold text-gray-800">Reparti del personale</h2>
              <p className="text-xs text-gray-500 mt-0.5">Reparti, fasce orarie di default e minimo personale per la gestione turni</p>
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

        {/* Form aggiunta reparto */}
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
            <p className="text-xs text-gray-400 mt-2">Dopo averlo creato, imposta orari e minimo personale con la matita.</p>
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

      {/* Elenco reparti attivi */}
      <div className="px-5 py-3 space-y-2">
        {loading && <p className="text-sm text-gray-400 py-2">Caricamento reparti...</p>}
        {!loading && activeDepts.length === 0 && (
          <p className="text-sm text-gray-400 py-2">Nessun reparto configurato</p>
        )}
        {activeDepts.map(function(dept) {
          var isEditing = editingId === dept.id;

          if (isEditing) {
            return (
              <div key={dept.id} className="bg-gray-50 rounded-lg p-4">
                {/* Nome + colore */}
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome reparto</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={function(e) { editChange("name", e.target.value); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                />
                <ColorPicker value={editForm.color} onChange={function(c) { editChange("color", c); }} />

                {/* Visibilità nelle viste turni */}
                <div className="mt-4 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={"sis_" + dept.id}
                    checked={editForm.show_in_shifts}
                    onChange={function(e) { editChange("show_in_shifts", e.target.checked); }}
                    className="w-4 h-4 accent-wine-700"
                  />
                  <label htmlFor={"sis_" + dept.id} className="text-sm text-gray-700">
                    Mostra nelle viste turni
                  </label>
                </div>

                {/* Orari default + minimo */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                      <Clock size={12} /> Inizio default
                    </label>
                    <input
                      type="time"
                      value={editForm.default_start}
                      onChange={function(e) { editChange("default_start", e.target.value); }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                      <Clock size={12} /> Fine default
                    </label>
                    <input
                      type="time"
                      value={editForm.default_end}
                      onChange={function(e) { editChange("default_end", e.target.value); }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                      <Users size={12} /> Minimo personale
                    </label>
                    <input
                      type="number"
                      value={editForm.min_staff}
                      onChange={function(e) { editChange("min_staff", e.target.value); }}
                      min={0}
                      max={20}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={function() { setEditingId(null); }}
                    className="flex-1 border border-gray-200 text-gray-600 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={function() { saveEdit(dept); }}
                    disabled={!editForm.name.trim()}
                    className="flex-1 bg-wine-700 text-white py-1.5 rounded-lg text-sm hover:bg-wine-800 transition-colors disabled:opacity-50"
                  >
                    Salva
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={dept.id} className="flex items-center gap-3 py-2 px-3 rounded-lg border border-gray-100">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: dept.color || "#9ca3af" }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">{dept.name}</span>
                  {dept.show_in_shifts === false && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Fuori dai turni</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {dept.default_start && dept.default_end
                    ? "Default " + timeForInput(dept.default_start) + "–" + timeForInput(dept.default_end)
                    : "Orari non impostati"}
                  <span className="mx-2">·</span>
                  Min. {dept.min_staff != null ? dept.min_staff : 0} pers.
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
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
            </div>
          );
        })}
      </div>

      {/* Reparti disattivati */}
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
        <p>Solo il Super Admin può accedere alle impostazioni.</p>
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

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-wine-100 p-2 rounded-lg">
          <Settings className="text-wine-700" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Impostazioni</h1>
          <p className="text-sm text-gray-500">Gestisci i valori personalizzabili dell'app</p>
        </div>
      </div>

      {/* Istruzione */}
      <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        Le modifiche sono immediate. Disattivare una voce non elimina i dati esistenti che la usano — la voce non sarà più selezionabile per i nuovi inserimenti.
      </div>

      {/* Sezioni config_options */}
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

        {/* Sezione Reparti del personale (staff_departments) */}
        <DepartmentSection />
      </div>

    </div>
  );
}
