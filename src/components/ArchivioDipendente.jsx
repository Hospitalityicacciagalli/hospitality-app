import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Archive, ArchiveRestore, Trash2, AlertTriangle, X } from "lucide-react";

// ============================================================
// ARCHIVIA / RIATTIVA / ELIMINA UN DIPENDENTE
// ============================================================
//
// Nato il 30/10/2026 (doppione AMHED / Ahmed Juned). Usato da StaffList
// e StaffDetail: le regole stanno qui, in una copia sola (regola 31).
//
// ARCHIVIARE = is_active a false, SENZA data di cessazione. E' un fatto
// di vista ("non me lo mostrare"), non un fatto di lavoro: niente date,
// niente motivi. Serve soprattutto agli extra venuti una volta.
//   - Turni: sparisce da tutte le settimane (inForzaNellaSettimana vuole
//     una contract_end_date per mostrare un non attivo), ma i turni gia'
//     fatti restano leggibili col suo nome.
//   - Stipendi: esce da Dipendenti e non viene piu' proposto nei mesi
//     nuovi; dove ha gia' dati salvati resta visibile (hasDati).
//   - Bloccato se ha un contratto ancora in corso (strada giusta:
//     Cessazione) o turni assegnati da oggi in poi (sparirebbero dalla
//     griglia restando nel database, dove nessuno li vede).
//
// ELIMINARE = cancellazione vera, solo per le schede inserite per errore.
//   - Bloccata se la scheda ha una STORIA: turni, assenze, pagamenti,
//     ferie godute, ore di campagna, mesi di stipendio con dati veri.
//   - Si cancellano insieme le IMPOSTAZIONI vuote: profilo paghe, righe
//     di stipendio e tariffa, obiettivo giornate, disponibilita', reparti
//     aggiuntivi, mesi di stipendio creati in automatico senza dati.
//   - Prima si prova a cancellare la sola scheda: se il database ha le
//     cancellazioni a cascata basta quello; se risponde "ci sono righe
//     collegate" (23503) si tolgono le impostazioni e si riprova.
//   - Ogni scrittura chiede indietro le righe toccate: zero righe senza
//     errore = il database ha rifiutato in silenzio (permessi), e lo si dice.

var STORIA = [
  { tabella: "staff_shifts",         uno: "turno",                                     molti: "turni" },
  { tabella: "staff_leaves",         uno: "assenza o richiesta di ferie",              molti: "assenze o richieste di ferie" },
  { tabella: "stip_movimenti",       uno: "pagamento (bonifico, contanti o anticipo)", molti: "pagamenti (bonifici, contanti o anticipi)" },
  { tabella: "stip_ferie_movimenti", uno: "registrazione di ferie godute",             molti: "registrazioni di ferie godute" },
  { tabella: "stip_ore_campagna",    uno: "giornata di ore in campagna",               molti: "giornate di ore in campagna" }
];

var IMPOSTAZIONI = [
  { tabella: "stip_profili",             uno: "profilo paghe",                   molti: "profili paghe" },
  { tabella: "stip_stipendi_storico",    uno: "riga di stipendio mensile",       molti: "righe di stipendio mensile" },
  { tabella: "stip_tariffe_storico",     uno: "tariffa oraria",                  molti: "tariffe orarie" },
  { tabella: "stip_giornate_target",     uno: "obiettivo di giornate annue",     molti: "obiettivi di giornate annue" },
  { tabella: "staff_availability",       uno: "disponibilita' settimanale",      molti: "disponibilita' settimanali" },
  { tabella: "staff_member_departments", uno: "reparto aggiuntivo",              molti: "reparti aggiuntivi" }
];

var MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
  "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function oggiIso() {
  var d = new Date();
  return d.getFullYear() + "-" +
    (d.getMonth() + 1 < 10 ? "0" : "") + (d.getMonth() + 1) + "-" +
    (d.getDate() < 10 ? "0" : "") + d.getDate();
}

function formatIt(iso) {
  if (!iso) return "";
  var p = String(iso).slice(0, 10).split("-");
  if (p.length !== 3) return String(iso);
  return p[2] + "/" + p[1] + "/" + p[0];
}

function numNonZero(v) {
  if (v === null || v === undefined || v === "") return false;
  var n = parseFloat(String(v).replace(",", "."));
  return !isNaN(n) && n !== 0;
}

function testoVuoto(v) {
  return v === null || v === undefined || String(v).trim() === "";
}

// Un mese di stipendio ha dati VERI se c'e' qualcosa che una persona ha
// scritto o caricato. Il solo conteggio_euro non conta: per i "resort"
// lo scrive in automatico StipendiMesePage aprendo la pagina.
function meseConDati(r) {
  return !testoVuoto(r.busta_prova)
    || !testoVuoto(r.busta_definitiva)
    || numNonZero(r.ore)
    || numNonZero(r.extra)
    || numNonZero(r.tfr)
    || numNonZero(r.riporto_precedente)
    || numNonZero(r.giornate_busta)
    || !testoVuoto(r.note)
    || !testoVuoto(r.extra_note)
    || !testoVuoto(r.istruzioni_consulente);
}

function frase(n, voce) {
  return n + " " + (n === 1 ? voce.uno : voce.molti);
}

// attivo     = is_active vero
// cessato    = non attivo con una data di cessazione (anche futura)
// archiviato = non attivo senza data di cessazione
export function statoArchivio(m) {
  if (!m) return "attivo";
  if (m.is_active !== false) return "attivo";
  if (m.data_cessazione) return "cessato";
  return "archiviato";
}

export default function ArchivioDipendente(props) {
  var member = props.member;
  var azione = props.azione;
  var navigate = useNavigate();

  var [caricamento, setCaricamento] = useState(azione !== "riattiva");
  var [esame, setEsame] = useState(null);
  var [lavoro, setLavoro] = useState(false);
  var [errore, setErrore] = useState(null);
  var [capito, setCapito] = useState(false);

  var nome = ((member.first_name || "") + " " + (member.last_name || "")).trim();
  var oggi = oggiIso();
  var fineContratto = member.contract_end_date ? String(member.contract_end_date).slice(0, 10) : null;

  useEffect(function() {
    if (azione === "archivia") esaminaArchiviazione();
    if (azione === "elimina") esaminaEliminazione();
  }, []);

  // ── ARCHIVIA ────────────────────────────────────────────────
  function esaminaArchiviazione() {
    supabase
      .from("staff_shifts")
      .select("shift_date")
      .eq("staff_id", member.id)
      .gte("shift_date", oggi)
      .order("shift_date")
      .then(function(res) {
        if (res.error) {
          setErrore("Non sono riuscito a controllare i turni futuri: " + res.error.message);
          setCaricamento(false);
          return;
        }
        var righe = res.data || [];
        var date = [];
        righe.forEach(function(r) {
          var d = String(r.shift_date).slice(0, 10);
          if (date.indexOf(d) === -1) date.push(d);
        });
        setEsame({ turniFuturi: righe.length, dateFuture: date });
        setCaricamento(false);
      });
  }

  function cambiaAttivo(valore, esito) {
    setLavoro(true);
    setErrore(null);
    supabase
      .from("staff_members")
      .update({ is_active: valore })
      .eq("id", member.id)
      .select("id")
      .then(function(res) {
        setLavoro(false);
        if (res.error) {
          setErrore("Errore: " + res.error.message);
          return;
        }
        if (!res.data || res.data.length !== 1) {
          setErrore("Il database non ha modificato la scheda: probabilmente il tuo utente non ha il permesso. Non e' cambiato niente.");
          return;
        }
        props.onDone(esito);
      });
  }

  // ── ELIMINA ─────────────────────────────────────────────────
  function conta(tabella) {
    return supabase
      .from(tabella)
      .select("staff_id", { count: "exact", head: true })
      .eq("staff_id", member.id);
  }

  function esaminaEliminazione() {
    var tutte = STORIA.concat(IMPOSTAZIONI);
    var richieste = tutte.map(function(v) { return conta(v.tabella); });
    richieste.push(
      supabase
        .from("stip_mesi")
        .select("anno, mese, ore, extra, tfr, riporto_precedente, busta_prova, busta_definitiva, giornate_busta, note, extra_note, istruzioni_consulente")
        .eq("staff_id", member.id)
        .order("anno")
        .order("mese")
    );

    Promise.all(richieste).then(function(risultati) {
      var storia = [];
      var pulizia = [];
      for (var i = 0; i < tutte.length; i++) {
        var r = risultati[i];
        if (r.error) {
          setErrore("Non sono riuscito a controllare cosa c'e' collegato (" + tutte[i].tabella + "): " + r.error.message + ". Per sicurezza non elimino niente.");
          setCaricamento(false);
          return;
        }
        var n = r.count || 0;
        if (n === 0) continue;
        if (i < STORIA.length) storia.push(frase(n, tutte[i]));
        else pulizia.push(frase(n, tutte[i]));
      }

      var rm = risultati[tutte.length];
      if (rm.error) {
        setErrore("Non sono riuscito a controllare i mesi di stipendio: " + rm.error.message + ". Per sicurezza non elimino niente.");
        setCaricamento(false);
        return;
      }
      var conDati = [];
      var vuoti = 0;
      (rm.data || []).forEach(function(m) {
        if (meseConDati(m)) conDati.push(MESI[m.mese - 1] + " " + m.anno);
        else vuoti++;
      });
      if (conDati.length > 0) {
        storia.push("dati di stipendio in " + conDati.join(", ") + " (busta, ore, extra, TFR, riporto o note)");
      }
      if (vuoti > 0) {
        pulizia.push(vuoti === 1
          ? "1 mese di stipendio senza dati, creato in automatico"
          : vuoti + " mesi di stipendio senza dati, creati in automatico");
      }

      setEsame({ storia: storia, pulizia: pulizia });
      setCaricamento(false);
    });
  }

  function eseguiEliminazione() {
    setLavoro(true);
    setErrore(null);
    cancellaScheda(function(esito) {
      if (esito === "fatto") { props.onDone("eliminato"); return; }
      if (esito === "collegate") { pulisciPoiCancella(); return; }
      setLavoro(false);
      setErrore(esito);
    });
  }

  // Risponde "fatto", "collegate" oppure il testo dell'errore.
  function cancellaScheda(fine) {
    supabase
      .from("staff_members")
      .delete()
      .eq("id", member.id)
      .select("id")
      .then(function(res) {
        if (res.error) {
          if (res.error.code === "23503") { fine("collegate"); return; }
          fine("Errore: " + res.error.message);
          return;
        }
        if (res.data && res.data.length === 1) { fine("fatto"); return; }
        fine("Il database non ha eliminato la scheda: probabilmente il tuo utente non ha il permesso di eliminare.");
      });
  }

  function pulisciPoiCancella() {
    var tabelle = ["stip_mesi"].concat(IMPOSTAZIONI.map(function(v) { return v.tabella; }));
    var i = 0;
    function passo() {
      if (i >= tabelle.length) {
        cancellaScheda(function(esito) {
          if (esito === "fatto") { props.onDone("eliminato"); return; }
          setLavoro(false);
          setErrore("Ho tolto le impostazioni collegate, ma la scheda non si e' cancellata. "
            + (esito === "collegate" ? "Il database dice che c'e' ancora qualcosa collegato." : esito)
            + " Manda questo messaggio a chi segue il programma.");
        });
        return;
      }
      var t = tabelle[i];
      i++;
      supabase.from(t).delete().eq("staff_id", member.id).then(function(res) {
        if (res.error) {
          setLavoro(false);
          setErrore("Errore togliendo i dati di " + t + ": " + res.error.message + ". La scheda NON e' stata eliminata.");
          return;
        }
        passo();
      });
    }
    passo();
  }

  // ── PRESENTAZIONE ───────────────────────────────────────────
  var titolo = azione === "archivia" ? "Archivia " + nome
    : azione === "riattiva" ? "Riattiva " + nome
    : "Elimina " + nome;

  var contrattoInCorso = azione === "archivia" && fineContratto && fineContratto >= oggi;
  var turniFuturi = azione === "archivia" && esame && esame.turniFuturi > 0;
  var sembraContrattualizzato = azione === "archivia" && member.fiscal_code && member.hire_date && !member.is_extra && !contrattoInCorso;
  var archiviaBloccata = contrattoInCorso || turniFuturi;

  var eliminaBloccata = azione === "elimina" && esame && esame.storia && esame.storia.length > 0;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4"
      onClick={function(e) { e.stopPropagation(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-screen overflow-y-auto">

        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            {azione === "archivia" && <Archive size={20} className="text-gray-600 flex-shrink-0" />}
            {azione === "riattiva" && <ArchiveRestore size={20} className="text-green-600 flex-shrink-0" />}
            {azione === "elimina" && <Trash2 size={20} className="text-red-600 flex-shrink-0" />}
            <h2 className="font-semibold text-gray-900 truncate">{titolo}</h2>
          </div>
          <button onClick={props.onClose} disabled={lavoro}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {caricamento && (
            <p className="text-sm text-gray-500">Controllo in corso...</p>
          )}

          {/* ── ARCHIVIA ── */}
          {azione === "archivia" && !caricamento && (
            <div className="space-y-4">
              {contrattoInCorso && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800">
                  <p className="font-medium">Ha un contratto fino al {formatIt(fineContratto)}.</p>
                  <p className="mt-1">Archiviare non e' la strada giusta: se ha smesso di lavorare registra la Cessazione, che salva data e motivo.</p>
                  <button
                    onClick={function() { navigate("/staff/cessazione"); }}
                    className="mt-3 bg-amber-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-amber-700">
                    Vai a Cessazione
                  </button>
                </div>
              )}

              {turniFuturi && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800">
                  <p className="font-medium">
                    Ha {esame.turniFuturi === 1 ? "1 turno assegnato" : esame.turniFuturi + " turni assegnati"} da oggi in poi
                    {esame.dateFuture.length > 0 && (
                      <span> ({esame.dateFuture.slice(0, 5).map(formatIt).join(", ")}{esame.dateFuture.length > 5 ? "..." : ""})</span>
                    )}.
                  </p>
                  <p className="mt-1">Se lo archivi spariscono dalla griglia ma restano nel database, dove nessuno li vede piu'. Toglili prima dalla pagina Turni, poi torna qui.</p>
                </div>
              )}

              {sembraContrattualizzato && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  Ha codice fiscale e data di assunzione. Se ha un contratto vero e ha smesso di lavorare,
                  la strada giusta e' la Cessazione: l'archiviazione non registra ne' date ne' motivi.
                </div>
              )}

              {!archiviaBloccata && (
                <div className="text-sm text-gray-700">
                  <p className="font-medium mb-2">Cosa succede:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>non compare piu' nella griglia dei Turni, ne' fra i colleghi a cui duplicare un turno;</li>
                    <li>i turni che ha gia' fatto restano, con il suo nome;</li>
                    <li>in Staff passa fra i non attivi, con l'etichetta &laquo;Archiviato&raquo;;</li>
                    <li>in Stipendi esce da Dipendenti e non viene piu' proposto nei mesi nuovi (dove ha gia' dati salvati resta visibile);</li>
                    <li>non si cancella niente: con &laquo;Riattiva&raquo; torna com'era.</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── RIATTIVA ── */}
          {azione === "riattiva" && (
            <div className="text-sm text-gray-700 space-y-3">
              <div>
                <p className="font-medium mb-2">Cosa succede:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>torna nella griglia dei Turni e fra gli attivi in Staff;</li>
                  <li>se ha un profilo paghe, torna in Stipendi.</li>
                </ul>
              </div>
              {fineContratto && fineContratto < oggi && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
                  Il suo ultimo contratto risulta finito il {formatIt(fineContratto)}: da attivo lo ritrovi
                  comunque nei turni di tutte le settimane, finche' non lo archivi di nuovo.
                </div>
              )}
            </div>
          )}

          {/* ── ELIMINA ── */}
          {azione === "elimina" && !caricamento && esame && (
            <div className="space-y-4 text-sm">
              {eliminaBloccata ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
                  <p className="font-medium">Non si puo' eliminare: questa scheda ha una storia.</p>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    {esame.storia.map(function(t, i) { return <li key={i}>{t}</li>; })}
                  </ul>
                  <p className="mt-2">
                    Eliminandola quei dati andrebbero persi o resterebbero senza nome.
                    Se non vuoi piu' vederla nei turni, archiviala.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-gray-700">
                    <p className="font-medium mb-2">Si cancellano per sempre:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>la scheda anagrafica;</li>
                      {esame.pulizia.map(function(t, i) { return <li key={i}>{t};</li>; })}
                    </ul>
                    <p className="mt-2 text-gray-500">Non ci sono turni, assenze, pagamenti, ore o buste collegati.</p>
                  </div>
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 flex items-start gap-2">
                    <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>Non si puo' tornare indietro. Usalo solo per una scheda inserita per errore: per chi non viene piu' c'e' &laquo;Archivia&raquo;.</span>
                  </div>
                  <label className="flex items-center gap-3 p-2 cursor-pointer">
                    <input type="checkbox" checked={capito}
                      onChange={function(e) { setCapito(e.target.checked); }}
                      className="w-5 h-5 accent-wine-700" />
                    <span className="text-gray-700">Ho capito: e' una scheda inserita per errore</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {errore && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {errore}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-gray-100 flex-wrap">
          <button onClick={props.onClose} disabled={lavoro}
            className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50">
            {eliminaBloccata || (azione === "archivia" && archiviaBloccata) ? "Chiudi" : "Annulla"}
          </button>

          {azione === "archivia" && !caricamento && !archiviaBloccata && !errore && (
            <button onClick={function() { cambiaAttivo(false, "archiviato"); }} disabled={lavoro}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-700 text-white py-2.5 rounded-lg hover:bg-gray-800 font-medium disabled:opacity-50">
              <Archive size={16} />
              {lavoro ? "Archiviazione..." : "Archivia"}
            </button>
          )}

          {azione === "riattiva" && (
            <button onClick={function() { cambiaAttivo(true, "riattivato"); }} disabled={lavoro}
              className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-2.5 rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">
              <ArchiveRestore size={16} />
              {lavoro ? "Riattivazione..." : "Riattiva"}
            </button>
          )}

          {azione === "elimina" && eliminaBloccata && props.onCambiaAzione && statoArchivio(member) === "attivo" && (
            <button onClick={function() { props.onCambiaAzione("archivia"); }}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-700 text-white py-2.5 rounded-lg hover:bg-gray-800 font-medium">
              <Archive size={16} />
              Archivia invece
            </button>
          )}

          {azione === "elimina" && !caricamento && esame && !eliminaBloccata && (
            <button onClick={eseguiEliminazione} disabled={lavoro || !capito}
              className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 font-medium disabled:opacity-50">
              <Trash2 size={16} />
              {lavoro ? "Eliminazione..." : "Elimina definitivamente"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
