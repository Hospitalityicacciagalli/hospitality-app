import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { ArrowLeft, FileText, UserX, AlertTriangle, CheckCircle, Search, Calendar, Hash } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ============================================================
// CESSAZIONE DIPENDENTE — pagina dedicata (migrazione 47)
//
// Prima di questa pagina la cessazione si registrava dentro
// "Nuovo dipendente": si caricava la UniLav e il modulo capiva da se'
// che era una cessazione. Funzionava, ma scriveva solo tre cose
// (contract_end_date, is_active, una frase nelle note) e obbligava a
// entrare da una pagina che dichiarava l'esatto contrario di quello
// che stavi facendo.
//
// ⚠️ COSA SCRIVE, e perche':
//   data_cessazione          la data vera. Governa tutto il resto.
//   cessazione_codice        DI, LB, ... — filtrabile
//   cessazione_motivo        DIMISSIONI, LICENZIAMENTO ... — leggibile
//   cessazione_protocollo    il numero della Comunicazione Obbligatoria
//   cessazione_origine       'unilav' oppure 'manuale'
//   cessazione_registrata_*  quando e da chi
//   contract_end_date_prevista   il campo MEMORIA: cosa il contratto
//                                prevedeva prima che la cessazione lo
//                                accorciasse. Nessun calcolo lo legge.
//   contract_end_date        SOSTITUITA con la data di cessazione: e' la
//                            fine vera, e tutte le pagine che la leggono
//                            devono vedere quella (regola 31, una copia).
//   is_active = false        governa Staff e Turni.
//
// ⚠️ NON tocca stip_profili.attivo. Quel flag e' un AND davanti al
// filtro delle pagine Mese e Giornate: spegnerlo alla cessazione
// nasconderebbe il dipendente proprio nel mese in cui devi caricargli
// l'ultima busta (quella del TFR), che si carica il mese DOPO.
// "Cessato" e "fuori dal giro paghe" sono due cose diverse.
// ============================================================

function pad(n) { return n < 10 ? "0" + n : "" + n; }

function oggiIso() {
  var d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function toIsoDate(itDate) {
  if (!itDate) return "";
  var p = itDate.split("/");
  if (p.length !== 3) return "";
  return p[2] + "-" + p[1] + "-" + p[0];
}

function formatIt(iso) {
  if (!iso) return "";
  var p = String(iso).slice(0, 10).split("-");
  if (p.length !== 3) return String(iso);
  return p[2] + "/" + p[1] + "/" + p[0];
}

function formatItOra(ts) {
  if (!ts) return "";
  var d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() +
    " alle " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function grab(text, regex) {
  var m = text.match(regex);
  return m ? m[1].trim() : "";
}

// Nome del mese, per spiegare a parole quale sara' l'ultima busta.
var MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function meseAnnoDi(iso) {
  if (!iso) return "";
  var p = String(iso).slice(0, 10).split("-");
  if (p.length !== 3) return "";
  var m = parseInt(p[1], 10);
  return MESI[m - 1] + " " + p[0];
}

// ------------------------------------------------------------
// LETTURA DELLA UNILAV DI CESSAZIONE
//
// La cessazione si riconosce dalla "Sezione 7 - Cessazione".
// ⚠️ Il motivo arriva nella forma "DI - DIMISSIONI": lo spezzo in
// codice e descrizione, cosi' il codice resta filtrabile e la
// descrizione leggibile. Se la forma non e' quella, tengo tutto
// come descrizione e lascio il codice vuoto: meglio un campo vuoto
// di un codice inventato.
// ------------------------------------------------------------
function parseUnilavCessazione(fullText) {
  var text = fullText.replace(/\s+/g, " ");
  var upper = text.toUpperCase();

  var isCessazione = upper.indexOf("SEZIONE 7") !== -1 && upper.indexOf("CESSAZIONE") !== -1;
  if (!isCessazione) return { non_e_cessazione: true };

  var idx2 = upper.indexOf("SEZIONE 2");
  var workerText = idx2 !== -1 ? text.slice(idx2) : text;
  var cfMatch = workerText.match(/[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/);

  var motivoGrezzo = grab(text, /Motivo cessazione\s+(.+?)\s+Sezione/i);
  var codice = "";
  var motivo = motivoGrezzo;
  var mm = motivoGrezzo.match(/^([A-Z0-9]{1,4})\s*-\s*(.+)$/);
  if (mm) {
    codice = mm[1].trim();
    motivo = mm[2].trim();
  }

  return {
    fiscal_code:       cfMatch ? cfMatch[0] : "",
    data_cessazione:   toIsoDate(grab(text, /Data cessazione\s+(\d{2}\/\d{2}\/\d{4})/i)),
    codice:            codice,
    motivo:            motivo,
    protocollo:        grab(text, /Numero Protocollo\s+(\S+)/i),
    data_fine_rapporto: toIsoDate(grab(text, /Data fine\s+(\d{2}\/\d{2}\/\d{4})/i))
  };
}

// Elenco dei motivi piu' frequenti, per la registrazione a mano.
// Non e' la tabella ministeriale completa: sono quelli che capitano.
var MOTIVI_COMUNI = [
  { codice: "DI", motivo: "DIMISSIONI" },
  { codice: "DG", motivo: "DIMISSIONI PER GIUSTA CAUSA" },
  { codice: "LB", motivo: "LICENZIAMENTO PER GIUSTIFICATO MOTIVO SOGGETTIVO" },
  { codice: "LA", motivo: "LICENZIAMENTO PER GIUSTIFICATO MOTIVO OGGETTIVO" },
  { codice: "SC", motivo: "SCADENZA DEL CONTRATTO" },
  { codice: "CM", motivo: "RISOLUZIONE CONSENSUALE" },
  { codice: "PP", motivo: "PERIODO DI PROVA NON SUPERATO" }
];

export default function CessazioneDipendentePage() {
  var navigate = useNavigate();
  var auth = useAuth();
  var canEdit = auth.canEdit;
  var profile = auth.profile;

  var canManage = canEdit("staff");

  var [loading, setLoading] = useState(true);
  var [staff, setStaff] = useState([]);

  // Modo di lavoro: 'scelta' | 'unilav' | 'manuale'
  var [modo, setModo] = useState("scelta");

  // Lettura PDF
  var [pdfLoading, setPdfLoading] = useState(false);
  var [pdfError, setPdfError] = useState(null);

  // La proposta di cessazione in corso, qualunque sia l'origine.
  // { staff_id, membro, origine, data_cessazione, codice, motivo,
  //   protocollo, data_fine_rapporto }
  var [proposta, setProposta] = useState(null);

  // Ricerca nel modo manuale
  var [search, setSearch] = useState("");

  // Campi del modo manuale
  var [mData, setMData] = useState(oggiIso());
  var [mCodice, setMCodice] = useState("DI");
  var [mMotivo, setMMotivo] = useState("DIMISSIONI");
  var [mProtocollo, setMProtocollo] = useState("");
  var [mMotivoLibero, setMMotivoLibero] = useState(false);

  var [saving, setSaving] = useState(false);
  var [done, setDone] = useState(null);

  useEffect(function() {
    loadStaff();
  }, []);

  function loadStaff() {
    setLoading(true);
    supabase
      .from("staff_members")
      .select("id, first_name, last_name, fiscal_code, is_active, hire_date, contract_end_date, contract_end_date_prevista, data_cessazione, cessazione_codice, cessazione_motivo, cessazione_protocollo, cessazione_origine, cessazione_registrata_il, cessazione_registrata_da, staff_departments(id, name, color)")
      .order("last_name")
      .then(function(result) {
        if (result.error) {
          alert("Errore nel caricamento dello staff: " + result.error.message);
          setLoading(false);
          return;
        }
        setStaff(result.data || []);
        setLoading(false);
      });
  }

  // ----------------------------------------------------------
  // STRADA 1 — UNILAV
  // ----------------------------------------------------------
  function handleFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

    setPdfLoading(true);
    setPdfError(null);
    setProposta(null);

    var reader = new FileReader();
    reader.onload = function() {
      var typed = new Uint8Array(reader.result);
      pdfjsLib.getDocument({ data: typed }).promise.then(function(pdf) {
        var pagine = [];
        for (var i = 1; i <= pdf.numPages; i++) pagine.push(pdf.getPage(i));
        return Promise.all(pagine);
      }).then(function(pages) {
        return Promise.all(pages.map(function(p) { return p.getTextContent(); }));
      }).then(function(contenuti) {
        var fullText = contenuti.map(function(c) {
          return c.items.map(function(it) { return it.str; }).join(" ");
        }).join(" ");

        var parsed = parseUnilavCessazione(fullText);
        setPdfLoading(false);

        if (parsed.non_e_cessazione) {
          setPdfError("Questa UniLav non contiene una Sezione 7 - Cessazione. Se e' un'assunzione, usa Staff → Nuovo dipendente.");
          return;
        }
        if (!parsed.fiscal_code) {
          setPdfError("Non sono riuscito a leggere il codice fiscale. Verifica che sia un PDF di testo e non la scansione di un foglio.");
          return;
        }
        if (!parsed.data_cessazione) {
          setPdfError("Ho riconosciuto la cessazione ma non la data. Puoi registrarla a mano.");
          return;
        }

        var membro = null;
        for (var i = 0; i < staff.length; i++) {
          if (staff[i].fiscal_code && staff[i].fiscal_code.toUpperCase() === parsed.fiscal_code.toUpperCase()) {
            membro = staff[i];
            break;
          }
        }
        if (!membro) {
          setPdfError("Nessun dipendente in anagrafica con codice fiscale " + parsed.fiscal_code + ". Va inserito prima in Staff.");
          return;
        }

        setProposta({
          staff_id:           membro.id,
          membro:             membro,
          origine:            "unilav",
          data_cessazione:    parsed.data_cessazione,
          codice:             parsed.codice,
          motivo:             parsed.motivo,
          protocollo:         parsed.protocollo,
          data_fine_rapporto: parsed.data_fine_rapporto
        });
      }).catch(function(err) {
        setPdfLoading(false);
        setPdfError("Errore nella lettura del PDF: " + (err && err.message ? err.message : "file non valido"));
      });
    };
    reader.readAsArrayBuffer(file);
  }

  // ----------------------------------------------------------
  // STRADA 2 — A MANO
  // ----------------------------------------------------------
  function scegliManuale(membro) {
    setProposta({
      staff_id:           membro.id,
      membro:             membro,
      origine:            "manuale",
      data_cessazione:    mData,
      codice:             mCodice,
      motivo:             mMotivo,
      protocollo:         mProtocollo,
      data_fine_rapporto: membro.contract_end_date
    });
  }

  function aggiornaProposta(campo, valore) {
    setProposta(function(prev) {
      if (!prev) return prev;
      var next = {};
      for (var k in prev) { if (prev.hasOwnProperty(k)) next[k] = prev[k]; }
      next[campo] = valore;
      return next;
    });
  }

  // ----------------------------------------------------------
  // SCRITTURA
  // ----------------------------------------------------------
  function conferma() {
    if (!proposta) return;
    if (!proposta.data_cessazione) { alert("Manca la data di cessazione."); return; }

    setSaving(true);

    var membro = proposta.membro;

    // Il campo MEMORIA: cosa il contratto prevedeva prima.
    // Lo scrivo solo se la vecchia scadenza esisteva ed era diversa dalla
    // data di cessazione — altrimenti sarebbe la stessa cosa scritta due
    // volte. Se una memoria c'era gia', la lascio: la piu' vecchia e'
    // quella che racconta la storia intera.
    var memoria = membro.contract_end_date_prevista || null;
    if (!memoria && membro.contract_end_date && membro.contract_end_date !== proposta.data_cessazione) {
      memoria = membro.contract_end_date;
    }

    var chi = profile ? (profile.first_name + " " + profile.last_name) : null;

    var patch = {
      data_cessazione:           proposta.data_cessazione,
      cessazione_codice:         proposta.codice || null,
      cessazione_motivo:         proposta.motivo || null,
      cessazione_protocollo:     proposta.protocollo || null,
      cessazione_origine:        proposta.origine,
      cessazione_registrata_il:  new Date().toISOString(),
      cessazione_registrata_da:  chi,
      contract_end_date_prevista: memoria,
      contract_end_date:         proposta.data_cessazione,
      is_active:                 false
    };

    supabase
      .from("staff_members")
      .update(patch)
      .eq("id", proposta.staff_id)
      .then(function(res) {
        setSaving(false);
        if (res.error) {
          alert("Errore nel salvataggio: " + res.error.message);
          return;
        }
        setDone({
          nome: membro.first_name + " " + membro.last_name,
          staff_id: proposta.staff_id,
          data: proposta.data_cessazione
        });
        setProposta(null);
        loadStaff();
      });
  }

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------
  if (!canManage) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          Non hai il permesso di modificare lo staff.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-wine-600 text-lg">Caricamento...</div>
      </div>
    );
  }

  var candidati = staff.filter(function(s) {
    if (search === "") return true;
    var full = (s.last_name + " " + s.first_name).toLowerCase();
    return full.indexOf(search.toLowerCase()) !== -1;
  });

  // Cessazione gia' registrata sul dipendente scelto: e' quello che
  // rende possibile il dialogo di prevalenza.
  var esistente = null;
  if (proposta && proposta.membro && proposta.membro.data_cessazione) {
    esistente = proposta.membro;
  }

  return (
    <div className="max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={function() { navigate("/staff"); }}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          title="Torna allo staff">
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <div className="bg-gray-100 p-2 rounded-lg">
          <UserX className="text-gray-700" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cessazione dipendente</h1>
          <p className="text-sm text-gray-500">Chiudi il rapporto di lavoro da UniLav o a mano</p>
        </div>
      </div>

      {/* ESITO */}
      {done && (
        <div className="mb-6 p-4 bg-green-50 border border-green-300 rounded-xl">
          <div className="flex items-start gap-2">
            <CheckCircle size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">
                Cessazione registrata per {done.nome} al {formatIt(done.data)}
              </p>
              <p className="text-sm text-green-700 mt-1">
                L&rsquo;ultima busta paga sara&rsquo; quella di <strong>{meseAnnoDi(done.data)}</strong>.
                Fino a che non l&rsquo;avrai caricata, resta in Stipendi &rarr; Dipendenti con un&rsquo;etichetta ambra.
              </p>
              <div className="flex gap-2 mt-3 flex-wrap">
                <button
                  onClick={function() { navigate("/staff/" + done.staff_id); }}
                  className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700 transition-colors">
                  Apri la scheda
                </button>
                <button
                  onClick={function() { setDone(null); setModo("scelta"); }}
                  className="border border-green-300 text-green-700 px-3 py-1.5 rounded-lg text-sm hover:bg-green-100 transition-colors">
                  Registrane un&rsquo;altra
                </button>
                <button
                  onClick={function() { navigate("/staff"); }}
                  className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                  Torna allo staff
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCELTA DELLA STRADA */}
      {!proposta && !done && modo === "scelta" && (
        <div className="space-y-3">
          <button
            onClick={function() { setModo("unilav"); }}
            className="w-full text-left bg-white rounded-xl border border-wine-200 p-5 hover:border-wine-400 hover:shadow-sm transition-all">
            <div className="flex items-center gap-3">
              <div className="bg-wine-100 p-2 rounded-lg flex-shrink-0">
                <FileText size={20} className="text-wine-700" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">Carica la UniLav di cessazione</div>
                <div className="text-sm text-gray-500 mt-0.5">
                  Leggo data, motivo e numero di protocollo dal PDF e trovo il dipendente dal codice fiscale.
                </div>
              </div>
            </div>
          </button>

          <button
            onClick={function() { setModo("manuale"); }}
            className="w-full text-left bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-400 hover:shadow-sm transition-all">
            <div className="flex items-center gap-3">
              <div className="bg-gray-100 p-2 rounded-lg flex-shrink-0">
                <Calendar size={20} className="text-gray-700" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">Registra a mano</div>
                <div className="text-sm text-gray-500 mt-0.5">
                  Scegli il dipendente e inserisci data e motivo, senza caricare nessun documento.
                </div>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* STRADA UNILAV */}
      {!proposta && !done && modo === "unilav" && (
        <div className="bg-white rounded-xl border border-wine-200 p-6">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={18} className="text-wine-600" />
            <h2 className="font-semibold text-gray-800">UniLav di cessazione</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Carica la ricevuta in PDF. Deve contenere la <strong>Sezione 7 - Cessazione</strong>.
            Controllerai tutto prima di confermare.
          </p>

          <label className="inline-flex items-center gap-2 bg-wine-700 text-white px-4 py-2.5 rounded-lg hover:bg-wine-800 transition-colors font-medium text-sm cursor-pointer">
            <FileText size={16} />
            {pdfLoading ? "Lettura in corso..." : "Carica PDF UniLav"}
            <input type="file" accept="application/pdf" className="hidden"
              onChange={handleFile} disabled={pdfLoading} />
          </label>

          {pdfError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {pdfError}
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={function() { setModo("scelta"); setPdfError(null); }}
              className="text-sm text-gray-500 hover:text-gray-700 underline">
              Torna indietro
            </button>
          </div>
        </div>
      )}

      {/* STRADA MANUALE */}
      {!proposta && !done && modo === "manuale" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Dati della cessazione</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Data di cessazione</label>
                <input
                  type="date"
                  value={mData}
                  onChange={function(e) { setMData(e.target.value); }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Numero di protocollo <span className="text-gray-400">(facoltativo)</span>
                </label>
                <input
                  type="text"
                  value={mProtocollo}
                  onChange={function(e) { setMProtocollo(e.target.value); }}
                  placeholder="es. 01844308"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm text-gray-600 mb-2">Motivo</label>
              {!mMotivoLibero && (
                <div className="flex flex-wrap gap-2">
                  {MOTIVI_COMUNI.map(function(m) {
                    var attivo = mCodice === m.codice;
                    return (
                      <button
                        key={m.codice}
                        onClick={function() { setMCodice(m.codice); setMMotivo(m.motivo); }}
                        className={"px-3 py-1.5 rounded-lg text-sm border transition-colors text-left " +
                          (attivo ? "bg-wine-700 text-white border-wine-700" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50")}>
                        <span className="font-mono text-xs opacity-70">{m.codice}</span>
                        <span className="ml-1.5">{m.motivo}</span>
                      </button>
                    );
                  })}
                  <button
                    onClick={function() { setMMotivoLibero(true); }}
                    className="px-3 py-1.5 rounded-lg text-sm border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors">
                    Altro motivo...
                  </button>
                </div>
              )}
              {mMotivoLibero && (
                <div className="grid sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={mCodice}
                    onChange={function(e) { setMCodice(e.target.value.toUpperCase()); }}
                    placeholder="Codice"
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                  />
                  <input
                    type="text"
                    value={mMotivo}
                    onChange={function(e) { setMMotivo(e.target.value); }}
                    placeholder="Descrizione del motivo"
                    className="sm:col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                  />
                  <button
                    onClick={function() { setMMotivoLibero(false); }}
                    className="text-sm text-gray-500 hover:text-gray-700 underline text-left">
                    Torna ai motivi comuni
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-800 mb-3">Chi cessa</h2>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Cerca per nome o cognome..."
                value={search}
                onChange={function(e) { setSearch(e.target.value); }}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
              />
            </div>

            <div className="space-y-1 max-h-96 overflow-y-auto">
              {candidati.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">Nessun dipendente trovato.</p>
              )}
              {candidati.map(function(s) {
                return (
                  <button
                    key={s.id}
                    onClick={function() { scegliManuale(s); }}
                    className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-wine-300 hover:bg-wine-50 transition-colors">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                      style={{ backgroundColor: s.staff_departments ? s.staff_departments.color : "#6b7280" }}>
                      {s.first_name.charAt(0)}{s.last_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        {s.last_name} {s.first_name}
                        {s.data_cessazione && (
                          <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                            gia&rsquo; cessato il {formatIt(s.data_cessazione)}
                          </span>
                        )}
                        {!s.data_cessazione && s.is_active === false && (
                          <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                            non attivo
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {s.staff_departments ? s.staff_departments.name : "senza reparto"}
                        {s.contract_end_date && <span> &middot; contratto fino al {formatIt(s.contract_end_date)}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <button
                onClick={function() { setModo("scelta"); }}
                className="text-sm text-gray-500 hover:text-gray-700 underline">
                Torna indietro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------
          CONFERMA — con il dialogo di prevalenza quando una cessazione
          e' gia' registrata. Nessuna delle due origini e' sacra:
          vince l'ultima scelta fatta da una persona, ma solo dopo che
          le e' stato mostrato cosa sta per sostituire.
      --------------------------------------------------------------- */}
      {proposta && (
        <div className="space-y-4">

          {esistente && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-5">
              <div className="flex items-start gap-2">
                <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900">
                    Per {esistente.first_name} {esistente.last_name} una cessazione e&rsquo; gia&rsquo; registrata
                  </p>
                  <div className="text-sm text-amber-800 mt-2 space-y-0.5">
                    <p>
                      <span className="text-amber-600">Data:</span>{" "}
                      <strong>{formatIt(esistente.data_cessazione)}</strong>
                    </p>
                    {esistente.cessazione_motivo && (
                      <p>
                        <span className="text-amber-600">Motivo:</span>{" "}
                        {esistente.cessazione_codice ? esistente.cessazione_codice + " — " : ""}
                        {esistente.cessazione_motivo}
                      </p>
                    )}
                    {esistente.cessazione_protocollo && (
                      <p><span className="text-amber-600">Protocollo:</span> {esistente.cessazione_protocollo}</p>
                    )}
                    <p>
                      <span className="text-amber-600">Registrata:</span>{" "}
                      {esistente.cessazione_origine === "unilav" ? "da UniLav" : "a mano"}
                      {esistente.cessazione_registrata_da && <span> da {esistente.cessazione_registrata_da}</span>}
                      {esistente.cessazione_registrata_il && <span> il {formatItOra(esistente.cessazione_registrata_il)}</span>}
                    </p>
                  </div>
                  <p className="text-sm text-amber-900 mt-3">
                    L&rsquo;ultima busta paga risulta quella di <strong>{meseAnnoDi(esistente.data_cessazione)}</strong>.
                    Se confermi qui sotto, questi dati vengono <strong>sostituiti</strong> da quelli nuovi.
                    Se vuoi tenerli, annulla.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-blue-300 p-6">
            <div className="flex items-center gap-2 mb-4">
              <UserX size={18} className="text-blue-600" />
              <h2 className="font-semibold text-gray-800">
                {proposta.origine === "unilav" ? "UniLav di cessazione riconosciuta" : "Cessazione da registrare"}
              </h2>
            </div>

            <div className="text-sm space-y-2">
              <div className="flex gap-2">
                <span className="text-gray-500 w-40 flex-shrink-0">Dipendente</span>
                <span className="font-semibold text-gray-900">
                  {proposta.membro.last_name} {proposta.membro.first_name}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500 w-40 flex-shrink-0">Data di cessazione</span>
                <span className="font-semibold text-gray-900">{formatIt(proposta.data_cessazione)}</span>
              </div>
              {proposta.motivo && (
                <div className="flex gap-2">
                  <span className="text-gray-500 w-40 flex-shrink-0">Motivo</span>
                  <span className="text-gray-900">
                    {proposta.codice && <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded mr-1.5">{proposta.codice}</span>}
                    {proposta.motivo}
                  </span>
                </div>
              )}
              {proposta.protocollo && (
                <div className="flex gap-2">
                  <span className="text-gray-500 w-40 flex-shrink-0">Protocollo</span>
                  <span className="text-gray-900 flex items-center gap-1">
                    <Hash size={12} className="text-gray-400" />
                    {proposta.protocollo}
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="text-gray-500 w-40 flex-shrink-0">Origine del dato</span>
                <span className="text-gray-900">
                  {proposta.origine === "unilav" ? "UniLav (lettura automatica)" : "inserimento a mano"}
                </span>
              </div>
            </div>

            {/* Nel modo UniLav i campi restano correggibili: il PDF puo'
                essere letto male, e la persona davanti allo schermo ne sa
                sempre piu' di una espressione regolare. */}
            {proposta.origine === "unilav" && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">Correggi se qualcosa non torna:</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Data di cessazione</label>
                    <input
                      type="date"
                      value={proposta.data_cessazione || ""}
                      onChange={function(e) { aggiornaProposta("data_cessazione", e.target.value); }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Protocollo</label>
                    <input
                      type="text"
                      value={proposta.protocollo || ""}
                      onChange={function(e) { aggiornaProposta("protocollo", e.target.value); }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-300"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* CONSEGUENZE — scritte in italiano, non in nomi di colonne */}
            <div className="mt-5 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-900 mb-2">Cosa succede confermando</p>
              <ul className="text-sm text-blue-800 space-y-1.5 list-disc list-inside">
                <li>
                  L&rsquo;ultima busta paga sara&rsquo; quella di <strong>{meseAnnoDi(proposta.data_cessazione)}</strong>,
                  fosse anche solo per il TFR.
                </li>
                <li>
                  Resta in <strong>Stipendi &rarr; Dipendenti</strong> finche&rsquo; non avrai caricato quella busta,
                  poi sparisce da solo.
                </li>
                <li>
                  Dal {formatIt(proposta.data_cessazione)} non e&rsquo; piu&rsquo; assegnabile nei <strong>Turni</strong>.
                  I turni gia&rsquo; lavorati restano visibili nelle settimane passate.
                </li>
                <li>Esce dall&rsquo;elenco <strong>Staff</strong> fra gli attivi.</li>
                {proposta.membro.contract_end_date && proposta.membro.contract_end_date !== proposta.data_cessazione && (
                  <li>
                    Il contratto era previsto fino al <strong>{formatIt(proposta.membro.contract_end_date)}</strong>:
                    resta scritto nella scheda come scadenza prevista, e la fine vera diventa
                    il {formatIt(proposta.data_cessazione)}.
                  </li>
                )}
              </ul>
            </div>

            <div className="flex gap-2 mt-5 flex-wrap">
              <button
                onClick={conferma}
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
                {saving ? "Salvataggio..." : (esistente ? "Sostituisci i dati esistenti" : "Conferma cessazione")}
              </button>
              <button
                onClick={function() { setProposta(null); setPdfError(null); }}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Annulla
              </button>
              <button
                onClick={function() { navigate("/staff/" + proposta.staff_id); }}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Apri la scheda
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="h-8" />
    </div>
  );
}
