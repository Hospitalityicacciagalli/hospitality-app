import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { ArrowLeft, Save, UserPlus, Calendar, Briefcase, Phone, Mail, MapPin, Plus, Trash2 } from "lucide-react";

var DAY_NAMES = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

var MEAL_LABELS = {
  both:   "Pranzo e Cena",
  lunch:  "Solo Pranzo",
  dinner: "Solo Cena"
};

var EMPTY_FORM = {
  first_name:        "",
  last_name:         "",
  fiscal_code:       "",
  phone:             "",
  email:             "",
  address:           "",
  city:              "",
  birth_date:        "",
  birth_place:       "",
  department_id:     "",
  job_title:         "",
  contract_type:     "indeterminato",
  hire_date:         "",
  contract_end_date: "",
  weekly_hours:      40,
  notes:             "",
  is_active:         true
};

export default function StaffForm() {
  var navigate = useNavigate();
  var params = useParams();
  var { hasRole } = useAuth();

  var isEdit = !!params.id;

  var [form, setForm] = useState(EMPTY_FORM);
  var [departments, setDepartments] = useState([]);
  var [availability, setAvailability] = useState([]);
  var [loading, setLoading] = useState(isEdit);
  var [saving, setSaving] = useState(false);

  // Nuovo slot disponibilità da aggiungere
  var [newDay, setNewDay] = useState("1");
  var [newMeal, setNewMeal] = useState("both");

  var canManage = hasRole(["super_admin", "direttore"]);

  useEffect(function() {
    loadDepartments();
    if (isEdit) loadStaffMember();
  }, []);

  function loadDepartments() {
    supabase
      .from("staff_departments")
      .select("*")
      .order("name")
      .then(function(result) {
        if (!result.error) setDepartments(result.data || []);
      });
  }

  function loadStaffMember() {
    setLoading(true);
    supabase
      .from("staff_members")
      .select("*")
      .eq("id", params.id)
      .single()
      .then(function(result) {
        if (result.error) {
          alert("Dipendente non trovato");
          navigate("/staff");
          return;
        }
        var d = result.data;
        setForm({
          first_name:        d.first_name || "",
          last_name:         d.last_name || "",
          fiscal_code:       d.fiscal_code || "",
          phone:             d.phone || "",
          email:             d.email || "",
          address:           d.address || "",
          city:              d.city || "",
          birth_date:        d.birth_date || "",
          birth_place:       d.birth_place || "",
          department_id:     d.department_id ? d.department_id.toString() : "",
          job_title:         d.job_title || "",
          contract_type:     d.contract_type || "indeterminato",
          hire_date:         d.hire_date || "",
          contract_end_date: d.contract_end_date || "",
          weekly_hours:      d.weekly_hours || 40,
          notes:             d.notes || "",
          is_active:         d.is_active !== false
        });
        loadAvailability(d.id);
        setLoading(false);
      });
  }

  function loadAvailability(staffId) {
    supabase
      .from("staff_availability")
      .select("*")
      .eq("staff_id", staffId)
      .order("day_of_week")
      .then(function(result) {
        if (!result.error) setAvailability(result.data || []);
      });
  }

  function handleChange(field, value) {
    setForm(function(prev) {
      var next = {};
      for (var k in prev) next[k] = prev[k];
      next[field] = value;
      return next;
    });
  }

  function addAvailability() {
    if (!isEdit) {
      alert("Salva prima il dipendente, poi potrai aggiungere la disponibilità.");
      return;
    }
    var dayNum = parseInt(newDay, 10);
    var exists = availability.find(function(a) {
      return a.day_of_week === dayNum && a.meal_type === newMeal;
    });
    if (exists) {
      alert("Questa combinazione giorno/turno esiste già.");
      return;
    }
    supabase
      .from("staff_availability")
      .insert({ staff_id: params.id, day_of_week: dayNum, meal_type: newMeal })
      .select()
      .then(function(result) {
        if (result.error) {
          alert("Errore: " + result.error.message);
        } else {
          setAvailability(function(prev) { return prev.concat(result.data); });
        }
      });
  }

  function removeAvailability(availId) {
    supabase
      .from("staff_availability")
      .delete()
      .eq("id", availId)
      .then(function(result) {
        if (result.error) {
          alert("Errore: " + result.error.message);
        } else {
          setAvailability(function(prev) { return prev.filter(function(a) { return a.id !== availId; }); });
        }
      });
  }

  function handleSubmit() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      alert("Nome e Cognome sono obbligatori.");
      return;
    }

    setSaving(true);

    var payload = {
      first_name:        form.first_name.trim(),
      last_name:         form.last_name.trim(),
      fiscal_code:       form.fiscal_code.trim() || null,
      phone:             form.phone.trim() || null,
      email:             form.email.trim() || null,
      address:           form.address.trim() || null,
      city:              form.city.trim() || null,
      birth_date:        form.birth_date || null,
      birth_place:       form.birth_place.trim() || null,
      department_id:     form.department_id ? parseInt(form.department_id, 10) : null,
      job_title:         form.job_title.trim() || null,
      contract_type:     form.contract_type || null,
      hire_date:         form.hire_date || null,
      contract_end_date: form.contract_end_date || null,
      weekly_hours:      form.weekly_hours ? parseInt(form.weekly_hours, 10) : 40,
      notes:             form.notes.trim() || null,
      is_active:         form.is_active
    };

    var query = isEdit
      ? supabase.from("staff_members").update(payload).eq("id", params.id)
      : supabase.from("staff_members").insert(payload).select().single();

    query.then(function(result) {
      setSaving(false);
      if (result.error) {
        alert("Errore nel salvataggio: " + result.error.message);
        return;
      }
      var targetId = isEdit ? params.id : result.data.id;
      navigate("/staff/" + targetId);
    });
  }

  if (!canManage) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p>Non hai i permessi per accedere a questa pagina.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-wine-600">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={function() { navigate(isEdit ? "/staff/" + params.id : "/staff"); }}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div className="flex items-center gap-3">
          <div className="bg-wine-100 p-2 rounded-lg">
            <UserPlus className="text-wine-700" size={20} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? "Modifica dipendente" : "Nuovo dipendente"}
          </h1>
        </div>
      </div>

      <div className="space-y-6">

        {/* Sezione: Dati anagrafici */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus size={18} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">Dati anagrafici</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                type="text"
                value={form.first_name}
                onChange={function(e) { handleChange("first_name", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="Mario"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cognome *</label>
              <input
                type="text"
                value={form.last_name}
                onChange={function(e) { handleChange("last_name", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="Rossi"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Codice Fiscale</label>
              <input
                type="text"
                value={form.fiscal_code}
                onChange={function(e) { handleChange("fiscal_code", e.target.value.toUpperCase()); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300 font-mono"
                placeholder="RSSMRA80A01H501Z"
                maxLength={16}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data di nascita</label>
              <input
                type="date"
                value={form.birth_date}
                onChange={function(e) { handleChange("birth_date", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Luogo di nascita</label>
              <input
                type="text"
                value={form.birth_place}
                onChange={function(e) { handleChange("birth_place", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="Napoli"
              />
            </div>
          </div>
        </div>

        {/* Sezione: Contatti */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Phone size={18} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">Contatti</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
              <input
                type="tel"
                value={form.phone}
                onChange={function(e) { handleChange("phone", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="+39 333 1234567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email personale</label>
              <input
                type="email"
                value={form.email}
                onChange={function(e) { handleChange("email", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="mario.rossi@email.it"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo</label>
              <input
                type="text"
                value={form.address}
                onChange={function(e) { handleChange("address", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="Via Roma 1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Città</label>
              <input
                type="text"
                value={form.city}
                onChange={function(e) { handleChange("city", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="Napoli"
              />
            </div>
          </div>
        </div>

        {/* Sezione: Ruolo e Reparto */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={18} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">Ruolo e Reparto</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reparto</label>
              <select
                value={form.department_id}
                onChange={function(e) { handleChange("department_id", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
              >
                <option value="">— Seleziona reparto —</option>
                {departments.map(function(d) {
                  return <option key={d.id} value={d.id.toString()}>{d.name}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mansione</label>
              <input
                type="text"
                value={form.job_title}
                onChange={function(e) { handleChange("job_title", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="es. Cameriere, Chef, Receptionist..."
              />
            </div>
          </div>
        </div>

        {/* Sezione: Contratto */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">Contratto</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo contratto</label>
              <select
                value={form.contract_type}
                onChange={function(e) { handleChange("contract_type", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
              >
                <option value="indeterminato">Indeterminato</option>
                <option value="determinato">Determinato</option>
                <option value="stagionale">Stagionale</option>
                <option value="collaborazione">Collaborazione</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ore settimanali</label>
              <input
                type="number"
                value={form.weekly_hours}
                onChange={function(e) { handleChange("weekly_hours", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                min={1}
                max={48}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data assunzione</label>
              <input
                type="date"
                value={form.hire_date}
                onChange={function(e) { handleChange("hire_date", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Scadenza contratto
                <span className="text-gray-400 font-normal ml-1">(se applicabile)</span>
              </label>
              <input
                type="date"
                value={form.contract_end_date}
                onChange={function(e) { handleChange("contract_end_date", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
              />
            </div>
          </div>
        </div>

        {/* Sezione: Disponibilità settimanale (solo in modifica) */}
        {isEdit && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={18} className="text-wine-600" />
              <h2 className="font-semibold text-gray-800">Disponibilità settimanale</h2>
            </div>

            {/* Disponibilità esistenti */}
            {availability.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">Nessuna disponibilità impostata</p>
            ) : (
              <div className="space-y-2 mb-4">
                {availability.map(function(a) {
                  return (
                    <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-sm text-gray-700">
                        <span className="font-medium">{DAY_NAMES[a.day_of_week]}</span>
                        <span className="text-gray-400 mx-2">—</span>
                        {MEAL_LABELS[a.meal_type] || a.meal_type}
                      </span>
                      <button
                        onClick={function() { removeAvailability(a.id); }}
                        className="p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Aggiungi slot */}
            <div className="flex gap-2 flex-wrap">
              <select
                value={newDay}
                onChange={function(e) { setNewDay(e.target.value); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
              >
                {DAY_NAMES.map(function(name, idx) {
                  return <option key={idx} value={idx.toString()}>{name}</option>;
                })}
              </select>
              <select
                value={newMeal}
                onChange={function(e) { setNewMeal(e.target.value); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
              >
                <option value="both">Pranzo e Cena</option>
                <option value="lunch">Solo Pranzo</option>
                <option value="dinner">Solo Cena</option>
              </select>
              <button
                onClick={addAvailability}
                className="flex items-center gap-1 bg-wine-100 text-wine-700 px-3 py-2 rounded-lg text-sm hover:bg-wine-200 transition-colors"
              >
                <Plus size={15} />
                Aggiungi
              </button>
            </div>
          </div>
        )}

        {/* Sezione: Note e Stato */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={18} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">Note e Stato</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note interne</label>
              <textarea
                value={form.notes}
                onChange={function(e) { handleChange("notes", e.target.value); }}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="Note interne sul dipendente..."
              />
            </div>
            {isEdit && (
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={function(e) { handleChange("is_active", e.target.checked); }}
                  className="w-4 h-4 accent-wine-700"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                  Dipendente attivo
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Bottoni azione */}
        <div className="flex gap-3 pb-8">
          <button
            onClick={function() { navigate(isEdit ? "/staff/" + params.id : "/staff"); }}
            className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl hover:bg-gray-50 transition-colors font-medium"
          >
            Annulla
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-wine-700 text-white py-3 rounded-xl hover:bg-wine-800 transition-colors font-medium disabled:opacity-50"
          >
            <Save size={18} />
            {saving ? "Salvataggio..." : (isEdit ? "Salva modifiche" : "Crea dipendente")}
          </button>
        </div>

      </div>
    </div>
  );
}
