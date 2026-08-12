import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { ArrowLeft, Save, UserPlus, Calendar, Briefcase, Phone, MapPin, Plus, Trash2, UserCheck, FileText, AlertTriangle, CheckCircle, UserX } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

var DAY_NAMES = ["Domenica", "Lunedi", "Martedi", "Mercoledi", "Giovedi", "Venerdi", "Sabato"];

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
  job_title_value:   "",
  contract_type:     "",
  hire_date:         "",
  contract_end_date: "",
  weekly_hours:      40,
  notes:             "",
  is_active:         true,
  is_extra:          false
};

// ============================================================
// FUNZIONI DI SUPPORTO PER LA LETTURA DELLA UNILAV
// ============================================================

function grab(text, regex) {
  var m = text.match(regex);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function toIsoDate(it) {
  var m = it.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return "";
  return m[3] + "-" + m[2] + "-" + m[1];
}

function formatIsoToIt(iso) {
  var m = (iso || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || "";
  return m[3] + "/" + m[2] + "/" + m[1];
}

function cleanComune(raw) {
  if (!raw) return "";
  var parts = raw.split("-");
  var kept = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (!p) continue;
    if (/^[A-Z]\d{3}$/i.test(p)) continue;
    if (/^\d{5}$/.test(p)) continue;
    kept.push(p);
  }
  return toTitleCase(kept.join(" - "));
}

function toTitleCase(s) {
  if (!s) return "";
  var lower = s.toLowerCase();
  var out = "";
  var capitalizeNext = true;
  for (var i = 0; i < lower.length; i++) {
    var ch = lower[i];
    if (capitalizeNext && /[a-zà-ù]/.test(ch)) {
      out += ch.toUpperCase();
      capitalizeNext = false;
    } else {
      out += ch;
    }
    if (ch === " " || ch === "'" || ch === "-" || ch === ".") capitalizeNext = true;
  }
  return out;
}

// Analizza il testo della UniLav e capisce se e' un'assunzione o una cessazione.
// La cessazione e' identificata dalla presenza della "Sezione 7 - Cessazione".
function parseUnilav(fullText) {
  var text = fullText.replace(/\s+/g, " ");
  var upper = text.toUpperCase();

  var isCessazione = upper.indexOf("SEZIONE 7") !== -1 && upper.indexOf("CESSAZIONE") !== -1;

  var idx2 = upper.indexOf("SEZIONE 2");
  var workerText = idx2 !== -1 ? text.slice(idx2) : text;

  var cfMatch = workerText.match(/[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/);

  var common = {
    tipo_comunicazione: isCessazione ? "cessazione" : "assunzione",
    fiscal_code:        cfMatch ? cfMatch[0] : "",
    last_name:          toTitleCase(grab(workerText, /Cognome\s+(.+?)\s+Nome\s/i)),
    first_name:         toTitleCase(grab(workerText, /\sNome\s+(.+?)\s+(?:Sesso|Cittadinanza|Data di nascita)/i)),
    birth_date:         toIsoDate(grab(workerText, /Data di nascita\s+(\d{2}\/\d{2}\/\d{4})/i)),
    birth_place:        cleanComune(grab(workerText, /Comune di nascita\s+(.+?)\s+Comune domicilio/i)),
    city:               cleanComune(grab(workerText, /Comune domicilio\s+(.+?)\s+Indirizzo domicilio/i)),
    address:            toTitleCase(grab(workerText, /Indirizzo domicilio\s+(.+?)\s+(?:Livello|Sezione)/i)),
    tipologia:          grab(text, /Tipologia contrattuale\s+(.+?)\s+(?:Socio|Lavoratore|Lavoro Stagionale)/i),
    tipo_lavorazione:   grab(text, /Tipo lavorazione\s+(.+?)\s+Giornate lavorative/i),
    giornate_previste:  grab(text, /Giornate lavorative previste\s+(\d+)/i),
    ore_settimanali:    grab(text, /Ore settimanali medie\s+([\d.,]+)/i),
    qualifica:          grab(text, /Qualifica professionale\s+(.+?)\s+(?:Retribuzione|Sezione)/i),
    retribuzione:       grab(text, /Retribuzione\s+([\d.,]+)\s+Lavoro in agricoltura/i)
  };

  if (isCessazione) {
    common.data_cessazione = toIsoDate(grab(text, /Data cessazione\s+(\d{2}\/\d{2}\/\d{4})/i));
    common.motivo_cessazione = grab(text, /Motivo cessazione\s+(.+?)\s+Sezione/i);
    common.hire_date = toIsoDate(grab(text, /Data inizio\s+(\d{2}\/\d{2}\/\d{4})/i));
  } else {
    common.hire_date = toIsoDate(grab(text, /Data inizio\s+(\d{2}\/\d{2}\/\d{4})/i));
    common.contract_end_date = toIsoDate(grab(text, /Data fine\s+(\d{2}\/\d{2}\/\d{4})/i));
  }

  return common;
}

export default function StaffForm() {
  var navigate = useNavigate();
  var params = useParams();
  var { hasRole } = useAuth();

  var isEdit = !!params.id;

  var [form, setForm] = useState(EMPTY_FORM);
  var [mealTypes, setMealTypes] = useState([]);
  var [contractTypes, setContractTypes] = useState([]);
  var [departments, setDepartments] = useState([]);
  var [jobTitles, setJobTitles] = useState([]);
  var [availability, setAvailability] = useState([]);
  // Reparti AGGIUNTIVI (migrazione 45). Il reparto principale resta form.department_id
  // e non va mai ripetuto qui: e' l'unica regola che tiene il dato in una copia sola.
  var [repartiExtra, setRepartiExtra] = useState([]);
  var [repartiExtraIniziali, setRepartiExtraIniziali] = useState([]);
  var [loading, setLoading] = useState(isEdit);
  var [saving, setSaving] = useState(false);

  var [newDay, setNewDay] = useState("1");
  var [newMeal, setNewMeal] = useState("");

  var [unilavLoading, setUnilavLoading] = useState(false);
  var [unilavError, setUnilavError] = useState(null);
  var [unilavInfo, setUnilavInfo] = useState(null);
  var [duplicate, setDuplicate] = useState(null);
  var [cessazione, setCessazione] = useState(null);
  var [cessazioneSaving, setCessazioneSaving] = useState(false);
  var [cessazioneDone, setCessazioneDone] = useState(false);

  var canManage = hasRole(["super_admin", "direttore"]);

  useEffect(function() {
    loadConfigOptions();
    loadDepartments();
    if (isEdit) loadStaffMember();
  }, []);

  function loadConfigOptions() {
    supabase
      .from("config_options")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(function(result) {
        if (result.error) return;
        var data = result.data || [];
        var meals     = data.filter(function(o) { return o.category === "meal_type"; });
        var contracts = data.filter(function(o) { return o.category === "contract_type"; });
        var jobs      = data.filter(function(o) { return o.category === "job_title"; });
        setMealTypes(meals);
        setContractTypes(contracts);
        setJobTitles(jobs);
        if (meals.length > 0) setNewMeal(meals[0].value);
      });
  }

  function loadDepartments() {
    supabase
      .from("staff_departments")
      .select("*")
      .order("sort_order")
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
          job_title_value:   d.job_title_value || "",
          contract_type:     d.contract_type || "",
          hire_date:         d.hire_date || "",
          contract_end_date: d.contract_end_date || "",
          weekly_hours:      d.weekly_hours || 40,
          notes:             d.notes || "",
          is_active:         d.is_active !== false,
          is_extra:          d.is_extra === true
        });
        loadAvailability(d.id);
        loadRepartiExtra(d.id);
        setLoading(false);
      });
  }

  function loadRepartiExtra(staffId) {
    supabase
      .from("staff_member_departments")
      .select("department_id")
      .eq("staff_id", staffId)
      .then(function(result) {
        if (result.error) return;
        var ids = (result.data || []).map(function(r) { return r.department_id; });
        setRepartiExtra(ids);
        setRepartiExtraIniziali(ids);
      });
  }

  function toggleRepartoExtra(deptId) {
    setRepartiExtra(function(prev) {
      if (prev.indexOf(deptId) !== -1) {
        return prev.filter(function(x) { return x !== deptId; });
      }
      var next = prev.slice();
      next.push(deptId);
      return next;
    });
  }

  // Scrive solo le differenze: toglie quelli rimossi, aggiunge quelli nuovi.
  function sincronizzaRepartiExtra(staffId, desiderati, fine) {
    var daTogliere = repartiExtraIniziali.filter(function(id) { return desiderati.indexOf(id) === -1; });
    var daAggiungere = desiderati.filter(function(id) { return repartiExtraIniziali.indexOf(id) === -1; });

    function passoAggiunta() {
      if (daAggiungere.length === 0) { fine(null); return; }
      var righe = daAggiungere.map(function(id) {
        return { staff_id: staffId, department_id: id };
      });
      supabase.from("staff_member_departments").insert(righe).then(function(res) {
        fine(res.error ? res.error : null);
      });
    }

    if (daTogliere.length === 0) { passoAggiunta(); return; }
    supabase
      .from("staff_member_departments")
      .delete()
      .eq("staff_id", staffId)
      .in("department_id", daTogliere)
      .then(function(res) {
        if (res.error) { fine(res.error); return; }
        passoAggiunta();
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

  // ============================================================
  // LETTURA UNILAV
  // ============================================================

  function handleUnilavFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;

    setUnilavLoading(true);
    setUnilavError(null);
    setUnilavInfo(null);
    setDuplicate(null);
    setCessazione(null);
    setCessazioneDone(false);

    file.arrayBuffer().then(function(buffer) {
      return pdfjsLib.getDocument({ data: buffer }).promise;
    }).then(function(pdf) {
      var tasks = [];
      for (var i = 1; i <= pdf.numPages; i++) {
        tasks.push(
          pdf.getPage(i).then(function(page) {
            return page.getTextContent();
          })
        );
      }
      return Promise.all(tasks);
    }).then(function(contents) {
      var fullText = "";
      for (var i = 0; i < contents.length; i++) {
        var items = contents[i].items || [];
        for (var j = 0; j < items.length; j++) {
          fullText += items[j].str + " ";
        }
      }

      var parsed = parseUnilav(fullText);

      if (!parsed.fiscal_code && !parsed.last_name) {
        setUnilavLoading(false);
        setUnilavError("Non sono riuscito a riconoscere i dati. Verifica che sia una ricevuta UniLav in PDF (non una scansione).");
        return;
      }

      if (parsed.tipo_comunicazione === "cessazione") {
        handleUnilavCessazione(parsed);
      } else {
        applyParsedData(parsed);
        checkDuplicate(parsed);
        setUnilavInfo(parsed);
        setUnilavLoading(false);
      }
    }).catch(function(err) {
      setUnilavLoading(false);
      setUnilavError("Errore nella lettura del PDF: " + (err && err.message ? err.message : "file non valido"));
    });
  }

  function handleUnilavCessazione(parsed) {
    if (!parsed.fiscal_code) {
      setUnilavLoading(false);
      setUnilavError("La UniLav di cessazione non contiene un codice fiscale leggibile.");
      return;
    }
    supabase
      .from("staff_members")
      .select("id, first_name, last_name, is_active, contract_end_date")
      .eq("fiscal_code", parsed.fiscal_code)
      .then(function(result) {
        setUnilavLoading(false);
        if (result.error || !result.data || result.data.length === 0) {
          setUnilavError("Nessun dipendente trovato con codice fiscale " + parsed.fiscal_code + ". Inserisci prima il dipendente in anagrafica.");
          return;
        }
        var d = result.data[0];
        setCessazione({
          staff_id:           d.id,
          name:               d.first_name + " " + d.last_name,
          is_active:          d.is_active !== false,
          previous_end_date:  d.contract_end_date,
          data_cessazione:    parsed.data_cessazione,
          motivo_cessazione:  parsed.motivo_cessazione
        });
      });
  }

  function confirmCessazione() {
    if (!cessazione) return;
    setCessazioneSaving(true);

    var noteCessazione = "Cessazione registrata da UniLav: " + formatIsoToIt(cessazione.data_cessazione);
    if (cessazione.motivo_cessazione) {
      noteCessazione += " - " + cessazione.motivo_cessazione;
    }

    supabase
      .from("staff_members")
      .select("notes")
      .eq("id", cessazione.staff_id)
      .single()
      .then(function(readRes) {
        var existingNotes = (readRes.data && readRes.data.notes) ? readRes.data.notes : "";
        var newNotes = existingNotes
          ? (existingNotes + "\n" + noteCessazione)
          : noteCessazione;

        return supabase
          .from("staff_members")
          .update({
            contract_end_date: cessazione.data_cessazione,
            is_active:         false,
            notes:             newNotes
          })
          .eq("id", cessazione.staff_id);
      })
      .then(function(updRes) {
        setCessazioneSaving(false);
        if (updRes && updRes.error) {
          alert("Errore: " + updRes.error.message);
          return;
        }
        setCessazioneDone(true);
      });
  }

  function applyParsedData(parsed) {
    var contractValue = "";
    var tip = (parsed.tipologia || "").toLowerCase();
    if (tip) {
      var i;
      if (tip.indexOf("indeterminato") !== -1) {
        for (i = 0; i < contractTypes.length; i++) {
          if (contractTypes[i].label.toLowerCase().indexOf("indeterminato") !== -1) {
            contractValue = contractTypes[i].value;
            break;
          }
        }
      } else if (tip.indexOf("determinato") !== -1) {
        for (i = 0; i < contractTypes.length; i++) {
          var lbl = contractTypes[i].label.toLowerCase();
          if (lbl.indexOf("determinato") !== -1 && lbl.indexOf("indeterminato") === -1) {
            contractValue = contractTypes[i].value;
            break;
          }
        }
      }
    }

    setForm(function(prev) {
      var next = {};
      for (var k in prev) next[k] = prev[k];
      if (parsed.first_name)        next.first_name = parsed.first_name;
      if (parsed.last_name)         next.last_name = parsed.last_name;
      if (parsed.fiscal_code)       next.fiscal_code = parsed.fiscal_code;
      if (parsed.birth_date)        next.birth_date = parsed.birth_date;
      if (parsed.birth_place)       next.birth_place = parsed.birth_place;
      if (parsed.address)           next.address = parsed.address;
      if (parsed.city)              next.city = parsed.city;
      if (parsed.hire_date)         next.hire_date = parsed.hire_date;
      if (parsed.contract_end_date) next.contract_end_date = parsed.contract_end_date;
      if (contractValue)            next.contract_type = contractValue;
      return next;
    });
  }

  function checkDuplicate(parsed) {
    if (parsed.fiscal_code) {
      supabase
        .from("staff_members")
        .select("id, first_name, last_name, is_active, fiscal_code")
        .eq("fiscal_code", parsed.fiscal_code)
        .then(function(result) {
          if (!result.error && result.data && result.data.length > 0) {
            var d = result.data[0];
            setDuplicate({ id: d.id, name: d.first_name + " " + d.last_name, is_active: d.is_active !== false, byName: false });
          } else {
            checkDuplicateByName(parsed);
          }
        });
    } else {
      checkDuplicateByName(parsed);
    }
  }

  function checkDuplicateByName(parsed) {
    if (!parsed.first_name || !parsed.last_name) return;
    supabase
      .from("staff_members")
      .select("id, first_name, last_name, is_active")
      .ilike("first_name", parsed.first_name)
      .ilike("last_name", parsed.last_name)
      .then(function(result) {
        if (!result.error && result.data && result.data.length > 0) {
          var d = result.data[0];
          setDuplicate({ id: d.id, name: d.first_name + " " + d.last_name, is_active: d.is_active !== false, byName: true });
        }
      });
  }

  function getMealLabel(value) {
    var found = mealTypes.find(function(m) { return m.value === value; });
    return found ? found.label : value;
  }

  function addAvailability() {
    if (!isEdit) {
      alert("Salva prima il dipendente, poi potrai aggiungere la disponibilita.");
      return;
    }
    if (!newMeal) {
      alert("Seleziona un turno.");
      return;
    }
    var dayNum = parseInt(newDay, 10);
    var exists = availability.find(function(a) {
      return a.day_of_week === dayNum && a.meal_type === newMeal;
    });
    if (exists) {
      alert("Questa combinazione giorno/turno esiste gia.");
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
      job_title_value:   form.job_title_value || null,
      contract_type:     form.contract_type || null,
      hire_date:         form.hire_date || null,
      contract_end_date: form.contract_end_date || null,
      weekly_hours:      form.weekly_hours ? parseInt(form.weekly_hours, 10) : 40,
      notes:             form.notes.trim() || null,
      is_active:         form.is_active,
      is_extra:          form.is_extra
    };

    var query = isEdit
      ? supabase.from("staff_members").update(payload).eq("id", params.id)
      : supabase.from("staff_members").insert(payload).select().single();

    query.then(function(result) {
      if (result.error) {
        setSaving(false);
        alert("Errore nel salvataggio: " + result.error.message);
        return;
      }
      var targetId = isEdit ? params.id : result.data.id;
      // Il reparto principale non finisce mai fra gli aggiuntivi.
      var principale = payload.department_id;
      var desiderati = repartiExtra.filter(function(id) { return id !== principale; });
      sincronizzaRepartiExtra(targetId, desiderati, function(err) {
        setSaving(false);
        if (err) {
          alert("Dipendente salvato, ma i reparti aggiuntivi non sono stati aggiornati: " + err.message);
        }
        navigate("/staff/" + targetId);
      });
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

        {/* Compilazione automatica da UniLav — solo in inserimento */}
        {!isEdit && (
          <div className="bg-white rounded-xl border border-wine-200 p-6">
            <div className="flex items-center gap-2 mb-2">
              <FileText size={18} className="text-wine-600" />
              <h2 className="font-semibold text-gray-800">Compilazione automatica da UniLav</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Carica il PDF della ricevuta di Comunicazione Obbligatoria (UniLav). Il sistema
              riconosce automaticamente se si tratta di un'assunzione o di una cessazione:
              nel primo caso precompila il modulo, nel secondo aggiorna la scheda del dipendente
              esistente. Potrai controllare e correggere tutto prima di confermare.
            </p>

            <label className="inline-flex items-center gap-2 bg-wine-700 text-white px-4 py-2.5 rounded-lg hover:bg-wine-800 transition-colors font-medium text-sm cursor-pointer">
              <FileText size={16} />
              {unilavLoading ? "Lettura in corso..." : "Carica PDF UniLav"}
              <input type="file" accept="application/pdf" className="hidden"
                onChange={handleUnilavFile} disabled={unilavLoading} />
            </label>

            {unilavError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {unilavError}
              </div>
            )}

            {/* CESSAZIONE — riquadro azzurro per confermare la chiusura del rapporto */}
            {cessazione && !cessazioneDone && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <UserX size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-800">
                      UniLav di cessazione riconosciuta
                    </p>
                    <div className="text-sm text-blue-700 mt-2 space-y-1">
                      <p><span className="text-blue-500">Dipendente:</span> <span className="font-medium">{cessazione.name}</span></p>
                      <p><span className="text-blue-500">Data cessazione:</span> <span className="font-medium">{formatIsoToIt(cessazione.data_cessazione)}</span></p>
                      {cessazione.motivo_cessazione && (
                        <p><span className="text-blue-500">Motivo:</span> {cessazione.motivo_cessazione}</p>
                      )}
                      {!cessazione.is_active && (
                        <p className="text-amber-700 mt-2">Nota: il dipendente risulta gia' non attivo.</p>
                      )}
                    </div>
                    <p className="text-sm text-blue-600 mt-3">
                      Confermando aggiornero' la sua scheda: scadenza contratto = data cessazione,
                      stato = non attivo, e aggiungero' una nota con motivo e data.
                    </p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button
                        onClick={confirmCessazione}
                        disabled={cessazioneSaving}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50">
                        {cessazioneSaving ? "Salvataggio..." : "Conferma cessazione"}
                      </button>
                      <button
                        onClick={function() { navigate("/staff/" + cessazione.staff_id); }}
                        className="border border-blue-300 text-blue-700 px-3 py-1.5 rounded-lg text-sm hover:bg-blue-100 transition-colors">
                        Apri la scheda
                      </button>
                      <button
                        onClick={function() { setCessazione(null); }}
                        className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                        Annulla
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CESSAZIONE — conferma avvenuta */}
            {cessazioneDone && cessazione && (
              <div className="mt-4 p-4 bg-green-50 border border-green-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <CheckCircle size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-800">
                      Cessazione registrata con successo per {cessazione.name}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={function() { navigate("/staff/" + cessazione.staff_id); }}
                        className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700 transition-colors">
                        Apri la scheda
                      </button>
                      <button
                        onClick={function() { navigate("/staff"); }}
                        className="border border-green-300 text-green-700 px-3 py-1.5 rounded-lg text-sm hover:bg-green-100 transition-colors">
                        Torna alla lista staff
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* DUPLICATO IN ASSUNZIONE */}
            {duplicate && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">
                      {duplicate.byName
                        ? "Attenzione: esiste gia' un dipendente con lo stesso nome"
                        : "Attenzione: questo codice fiscale e' gia' in anagrafica"}
                    </p>
                    <p className="text-sm text-amber-700 mt-1">
                      {duplicate.name}
                      {!duplicate.is_active && " (attualmente non attivo)"}
                      {". Se e' la stessa persona, conviene aggiornare la sua scheda invece di crearne una nuova."}
                    </p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button
                        onClick={function() { navigate("/staff/" + duplicate.id + "/modifica"); }}
                        className="bg-amber-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-amber-700 transition-colors">
                        Apri la scheda esistente
                      </button>
                      <button
                        onClick={function() { setDuplicate(null); }}
                        className="border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg text-sm hover:bg-amber-100 transition-colors">
                        Ignora e crea comunque
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CONFERMA ASSUNZIONE */}
            {unilavInfo && unilavInfo.tipo_comunicazione === "assunzione" && !duplicate && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800 flex items-center gap-2">
                  <CheckCircle size={16} className="flex-shrink-0" />
                  Dati letti e inseriti nel modulo. Controllali e completa i campi mancanti.
                </p>
              </div>
            )}

            {/* DATI INDICATIVI */}
            {unilavInfo && unilavInfo.tipo_comunicazione === "assunzione" && (
              <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Dati indicativi dalla UniLav (solo riferimento, non salvati)
                </p>
                <div className="text-sm text-gray-600 space-y-1">
                  {unilavInfo.tipo_lavorazione && (
                    <p><span className="text-gray-400">Tipo lavorazione:</span> {unilavInfo.tipo_lavorazione}</p>
                  )}
                  {unilavInfo.qualifica && (
                    <p><span className="text-gray-400">Qualifica:</span> {unilavInfo.qualifica}</p>
                  )}
                  {unilavInfo.giornate_previste && (
                    <p><span className="text-gray-400">Giornate previste:</span> {unilavInfo.giornate_previste}</p>
                  )}
                  {unilavInfo.ore_settimanali && (
                    <p><span className="text-gray-400">Ore settimanali medie:</span> {unilavInfo.ore_settimanali}</p>
                  )}
                  {unilavInfo.retribuzione && (
                    <p><span className="text-gray-400">Retribuzione dichiarata:</span> {unilavInfo.retribuzione}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dati anagrafici */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus size={18} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">Dati anagrafici</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input type="text" value={form.first_name}
                onChange={function(e) { handleChange("first_name", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="Mario" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cognome *</label>
              <input type="text" value={form.last_name}
                onChange={function(e) { handleChange("last_name", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="Rossi" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Codice Fiscale</label>
              <input type="text" value={form.fiscal_code}
                onChange={function(e) { handleChange("fiscal_code", e.target.value.toUpperCase()); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300 font-mono"
                placeholder="RSSMRA80A01H501Z" maxLength={16} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data di nascita</label>
              <input type="date" value={form.birth_date}
                onChange={function(e) { handleChange("birth_date", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Luogo di nascita</label>
              <input type="text" value={form.birth_place}
                onChange={function(e) { handleChange("birth_place", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="Napoli" />
            </div>
          </div>
        </div>

        {/* Contatti */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Phone size={18} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">Contatti</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
              <input type="tel" value={form.phone}
                onChange={function(e) { handleChange("phone", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="+39 333 1234567" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email personale</label>
              <input type="email" value={form.email}
                onChange={function(e) { handleChange("email", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="mario.rossi@email.it" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo</label>
              <input type="text" value={form.address}
                onChange={function(e) { handleChange("address", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="Via Roma 1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Citta</label>
              <input type="text" value={form.city}
                onChange={function(e) { handleChange("city", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="Napoli" />
            </div>
          </div>
        </div>

        {/* Ruolo e Reparto */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={18} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">Ruolo e Reparto</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reparto</label>
              <select value={form.department_id}
                onChange={function(e) { handleChange("department_id", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300">
                <option value="">— Seleziona reparto —</option>
                {departments.map(function(d) {
                  return <option key={d.id} value={d.id.toString()}>{d.name}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mansione</label>
              <select value={form.job_title_value}
                onChange={function(e) { handleChange("job_title_value", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300">
                <option value="">— Seleziona mansione —</option>
                {jobTitles.map(function(j) {
                  return <option key={j.id} value={j.value}>{j.label}</option>;
                })}
              </select>
            </div>
          </div>

          {/* Reparti aggiuntivi (migrazione 45) */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Collabora anche con</label>
            <p className="text-xs text-gray-500 mb-2">
              Comparira nella disponibilita di questi reparti nella pagina Turni, oltre al suo reparto
              principale. Il turno appartiene sempre al reparto in cui viene creato. Puoi sceglierne
              quanti vuoi.
            </p>
            {!form.department_id && (
              <p className="text-sm text-gray-400">Scegli prima il reparto principale.</p>
            )}
            {form.department_id && (
              <div className="flex flex-wrap gap-2">
                {departments.filter(function(d) {
                  return d.is_active !== false && d.id.toString() !== form.department_id;
                }).map(function(d) {
                  var attivo = repartiExtra.indexOf(d.id) !== -1;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={function() { toggleRepartoExtra(d.id); }}
                      className={"px-3 py-2 rounded-lg text-sm border transition-colors flex items-center gap-2 " + (attivo ? "bg-wine-700 text-white border-wine-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")}
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color || "#9ca3af" }} />
                      {d.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Flag personale extra */}
          <div className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <input type="checkbox" id="is_extra" checked={form.is_extra}
              onChange={function(e) { handleChange("is_extra", e.target.checked); }}
              className="w-4 h-4 accent-amber-600 mt-0.5" />
            <label htmlFor="is_extra" className="text-sm">
              <span className="font-medium text-amber-800 flex items-center gap-1">
                <UserCheck size={14} />
                Personale extra / avventizio
              </span>
              <span className="text-amber-700 text-xs">
                Attivalo per chi viene chiamato occasionalmente. Resta comunque in archivio per tenerne lo storico.
              </span>
            </label>
          </div>
        </div>

        {/* Contratto */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">Contratto</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo contratto</label>
              <select value={form.contract_type}
                onChange={function(e) { handleChange("contract_type", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300">
                <option value="">— Seleziona —</option>
                {contractTypes.map(function(c) {
                  return <option key={c.id} value={c.value}>{c.label}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ore settimanali</label>
              <input type="number" value={form.weekly_hours}
                onChange={function(e) { handleChange("weekly_hours", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                min={1} max={48} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data assunzione</label>
              <input type="date" value={form.hire_date}
                onChange={function(e) { handleChange("hire_date", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Scadenza contratto <span className="text-gray-400 font-normal">(se applicabile)</span>
              </label>
              <input type="date" value={form.contract_end_date}
                onChange={function(e) { handleChange("contract_end_date", e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
            </div>
          </div>
        </div>

        {/* Disponibilita — solo in modifica */}
        {isEdit && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={18} className="text-wine-600" />
              <h2 className="font-semibold text-gray-800">Disponibilita settimanale</h2>
            </div>
            {availability.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">Nessuna disponibilita impostata</p>
            ) : (
              <div className="space-y-2 mb-4">
                {availability.map(function(a) {
                  return (
                    <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-sm text-gray-700">
                        <span className="font-medium">{DAY_NAMES[a.day_of_week]}</span>
                        <span className="text-gray-400 mx-2">—</span>
                        {getMealLabel(a.meal_type)}
                      </span>
                      <button onClick={function() { removeAvailability(a.id); }}
                        className="p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <select value={newDay} onChange={function(e) { setNewDay(e.target.value); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300">
                {DAY_NAMES.map(function(name, idx) {
                  return <option key={idx} value={idx.toString()}>{name}</option>;
                })}
              </select>
              <select value={newMeal} onChange={function(e) { setNewMeal(e.target.value); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300">
                {mealTypes.length === 0 && <option value="">Nessun turno configurato</option>}
                {mealTypes.map(function(m) {
                  return <option key={m.id} value={m.value}>{m.label}</option>;
                })}
              </select>
              <button onClick={addAvailability}
                className="flex items-center gap-1 bg-wine-100 text-wine-700 px-3 py-2 rounded-lg text-sm hover:bg-wine-200 transition-colors">
                <Plus size={15} />
                Aggiungi
              </button>
            </div>
            {mealTypes.length === 0 && (
              <p className="text-xs text-amber-600 mt-2">Nessun turno configurato. Aggiungili in Impostazioni prima di procedere.</p>
            )}
          </div>
        )}

        {/* Note e Stato */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={18} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">Note e Stato</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note interne</label>
              <textarea value={form.notes}
                onChange={function(e) { handleChange("notes", e.target.value); }}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                placeholder="Note interne sul dipendente..." />
            </div>
            {isEdit && (
              <div className="flex items-center gap-3">
                <input type="checkbox" id="is_active" checked={form.is_active}
                  onChange={function(e) { handleChange("is_active", e.target.checked); }}
                  className="w-4 h-4 accent-wine-700" />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">Dipendente attivo</label>
              </div>
            )}
          </div>
        </div>

        {/* Bottoni */}
        <div className="flex gap-3 pb-8">
          <button onClick={function() { navigate(isEdit ? "/staff/" + params.id : "/staff"); }}
            className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl hover:bg-gray-50 transition-colors font-medium">
            Annulla
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-wine-700 text-white py-3 rounded-xl hover:bg-wine-800 transition-colors font-medium disabled:opacity-50">
            <Save size={18} />
            {saving ? "Salvataggio..." : (isEdit ? "Salva modifiche" : "Crea dipendente")}
          </button>
        </div>

      </div>
    </div>
  );
}
