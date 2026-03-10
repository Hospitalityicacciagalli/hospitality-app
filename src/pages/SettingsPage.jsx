import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { Settings, Plus, Pencil, Check, X, Circle, GripVertical } from "lucide-react";

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
    key:         "staff_department",
    label:       "Reparti",
    description: "Reparti del resort assegnabili ai dipendenti",
    hasColor:    true,
    placeholder: "es. Cantina"
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
          if (result.error.code === "23505") {
            alert("Esiste già una voce con questo nome in questa categoria.");
          } else {
            alert("Errore: " + result.error.message);
          }
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
    supabase
      .from("config_options")
      .update({
        label: editLabel.trim(),
        color: cat.hasColor ? editColor : null
      })
      .eq("id", item.id)
      .then(function(result) {
        if (result.error) { alert("Errore: " + result.error.message); return; }
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
        if (result.error) { alert("Errore: " + result.error.message); return; }
        onRefresh();
      });
  }

  var activeItems   = items.filter(function(i) { return i.is_active; });
  var inactiveItems = items.filter(function(i) { return !i.is_active; });

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

      {/* Header sezione */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="font-semibold text-gray-900">{cat.label}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{cat.description}</p>
        </div>
        <button
          onClick={function() { setAdding(!adding); setNewLabel(""); }}
          className="flex items-center gap-1.5 bg-wine-100 text-wine-700 px-3 py-1.5 rounded-lg text-sm hover:bg-wine-200 transition-colors"
        >
          <Plus size={14} />
          Aggiungi
        </button>
      </div>

      {/* Form aggiunta */}
      {adding && (
        <div className="px-5 py-4 bg-wine-50 border-b border-wine-100">
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <input
                type="text"
                value={newLabel}
                onChange={function(e) { setNewLabel(e.target.value); }}
                onKeyDown={function(e) { if (e.key === "Enter") addItem(); if (e.key === "Escape") setAdding(false); }}
                placeholder={cat.placeholder}
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
              />
              {cat.hasColor && (
                <ColorPicker value={newColor} onChange={function(c) { setNewColor(c); }} />
              )}
            </div>
            <button
              onClick={addItem}
              disabled={saving || !newLabel.trim()}
              className="bg-wine-700 text-white px-3 py-2 rounded-lg hover:bg-wine-800 transition-colors disabled:opacity-40"
            >
              <Check size={16} />
            </button>
            <button
              onClick={function() { setAdding(false); }}
              className="border border-gray-200 text-gray-500 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Lista voci attive */}
      <div className="divide-y divide-gray-50">
        {activeItems.length === 0 && !adding && (
          <div className="px-5 py-4 text-sm text-gray-400">Nessuna voce attiva</div>
        )}
        {activeItems.map(function(item) {
          var isEditing = editingId === item.id;
          return (
            <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">

              {/* Colore (se previsto) */}
              {cat.hasColor && (
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color || "#6b7280" }}
                />
              )}

              {/* Contenuto */}
              {isEditing ? (
                <div className="flex-1">
                  <input
                    type="text"
                    value={editLabel}
                    onChange={function(e) { setEditLabel(e.target.value); }}
                    onKeyDown={function(e) { if (e.key === "Enter") saveEdit(item); if (e.key === "Escape") setEditingId(null); }}
                    autoFocus
                    className="w-full border border-wine-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                  />
                  {cat.hasColor && (
                    <ColorPicker value={editColor} onChange={function(c) { setEditColor(c); }} />
                  )}
                </div>
              ) : (
                <div className="flex-1">
                  <span className="text-sm text-gray-800">{item.label}</span>
                  <span className="text-xs text-gray-300 ml-2">{item.value}</span>
                </div>
              )}

              {/* Azioni */}
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

      {/* Sezioni */}
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
      </div>

    </div>
  );
}
