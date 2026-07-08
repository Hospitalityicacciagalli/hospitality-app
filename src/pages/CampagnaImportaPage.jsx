import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet, Upload, CheckCircle2, AlertTriangle,
  Users, Clock, RefreshCw, Info
} from 'lucide-react';

// ============================================================
// CAMPAGNA -> IMPORTA
// Legge il file Excel "Ore Operai Campagna", foglio "Registro"
// (che l'Excel compila da solo con i valori gia' calcolati:
// data, operaio, ore, ambito, paga giornaliera, costo).
// Raggruppa le righe per mese, mostra un'anteprima e permette di
// SOSTITUIRE un mese alla volta in stip_ore_campagna
// (cancella le righe di quel anno+mese, poi reinserisce).
// Nessun ricalcolo: importiamo i valori cosi' come stanno nel file.
// ============================================================

var MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

function fmtEuro(n) {
  if (n === null || n === undefined || n === '' || isNaN(parseFloat(n))) return '0,00';
  var num = parseFloat(n);
  return num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function fmtNum(n, dec) {
  if (dec === undefined) dec = 2;
  if (n === null || n === undefined || n === '' || isNaN(parseFloat(n))) return '0';
  return parseFloat(n).toFixed(dec).replace('.', ',');
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// Nome normalizzato per l'abbinamento allo staff (come nelle buste paga).
function normName(s) {
  if (!s) return '';
  return String(s).toUpperCase().replace(/[^A-Z]/g, '');
}

// Data JS -> 'YYYY-MM-DD' (l'Italia e' avanti su UTC: nessun off-by-one).
function toISODate(d) {
  var y = d.getFullYear();
  var m = d.getMonth() + 1;
  var g = d.getDate();
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (g < 10 ? '0' + g : g);
}

export default function CampagnaImportaPage() {

  // Staff per l'abbinamento nome -> dipendente
  var [staffByName, setStaffByName] = useState({});
  // Ambiti ufficiali: mappa nome-minuscolo -> nome canonico (per uniformare le maiuscole)
  var [ambitoCanon, setAmbitoCanon] = useState({});
  var [loadingStaff, setLoadingStaff] = useState(true);

  // Risultato della lettura del file, raggruppato per mese
  var [gruppi, setGruppi] = useState(null);   // array o null
  var [nonAbbinati, setNonAbbinati] = useState([]); // nomi non trovati nello staff
  var [totFile, setTotFile] = useState(null); // { righe, anni }
  var [parseError, setParseError] = useState(null);
  var [parseLoading, setParseLoading] = useState(false);

  // Conteggi gia' presenti in DB, per (anno-mese)
  var [presenti, setPresenti] = useState({});

  // Stato per ogni mese: chiave 'anno-mese' -> 'busy' | 'ok' | 'err:...'
  var [statoMese, setStatoMese] = useState({});

  // ----------------------------------------------------------
  // Caricamento staff (una volta)
  // ----------------------------------------------------------
  useEffect(function () {
    var pStaff = supabase.from('staff_members').select('id, first_name, last_name');
    var pAmbiti = supabase.from('stip_ambiti').select('nome');

    Promise.all([pStaff, pAmbiti]).then(function (results) {
      var staff = (results[0].data) || [];
      var ambiti = (results[1].data) || [];

      var byName = {};
      staff.forEach(function (s) {
        byName[normName((s.last_name || '') + (s.first_name || ''))] = s;
        byName[normName((s.first_name || '') + (s.last_name || ''))] = s;
      });
      setStaffByName(byName);

      var canon = {};
      ambiti.forEach(function (a) {
        if (a.nome) canon[String(a.nome).trim().toLowerCase()] = a.nome;
      });
      setAmbitoCanon(canon);

      setLoadingStaff(false);
    });
  }, []);

  // Rilegge quanti record ci sono gia' in DB per gli anni del file.
  function ricaricaPresenti(anni) {
    if (!anni || anni.length === 0) { setPresenti({}); return; }
    supabase
      .from('stip_ore_campagna')
      .select('anno, mese')
      .in('anno', anni)
      .then(function (res) {
        var cnt = {};
        (res.data || []).forEach(function (r) {
          var k = r.anno + '-' + r.mese;
          cnt[k] = (cnt[k] || 0) + 1;
        });
        setPresenti(cnt);
      });
  }

  // ----------------------------------------------------------
  // Lettura del file Excel (foglio "Registro")
  // ----------------------------------------------------------
  function handleFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setParseLoading(true);
    setParseError(null);
    setGruppi(null);
    setNonAbbinati([]);
    setTotFile(null);
    setStatoMese({});

    file.arrayBuffer().then(function (buffer) {
      var wb = XLSX.read(buffer, { type: 'array', cellDates: true });

      var ws = wb.Sheets['Registro'];
      if (!ws) {
        setParseLoading(false);
        setParseError('Nel file non c\u2019\u00e8 il foglio "Registro". Carica il file "Ore Operai Campagna" completo.');
        return;
      }

      var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });

      // Trovo la riga di intestazione (quella con "Data" e "Operaio").
      var headerRow = -1;
      for (var i = 0; i < aoa.length; i++) {
        var row = aoa[i] || [];
        var has = {};
        for (var c = 0; c < row.length; c++) {
          if (row[c] != null) has[String(row[c]).trim().toLowerCase()] = c;
        }
        if (has['data'] !== undefined && has['operaio'] !== undefined) {
          headerRow = i;
          break;
        }
      }
      if (headerRow === -1) {
        setParseLoading(false);
        setParseError('Non trovo le intestazioni (Data, Operaio, Ore\u2026) nel foglio Registro.');
        return;
      }

      // Mappa nome-colonna -> indice
      var idx = {};
      var hr = aoa[headerRow];
      for (var h = 0; h < hr.length; h++) {
        if (hr[h] != null) idx[String(hr[h]).trim().toLowerCase()] = h;
      }
      function cell(row, nome) {
        var i2 = idx[nome];
        return (i2 === undefined) ? null : row[i2];
      }

      var gruppiMap = {};        // 'anno-mese' -> gruppo
      var anniSet = {};
      var nonTrovati = {};
      var righeTot = 0;

      for (var r = headerRow + 1; r < aoa.length; r++) {
        var rr = aoa[r] || [];
        var dataCell = cell(rr, 'data');
        var operaio = cell(rr, 'operaio');
        if (!(dataCell instanceof Date) || !operaio || String(operaio).trim() === '') continue;

        var ore = toNum(cell(rr, 'ore'));
        if (ore <= 0) continue; // riga senza ore effettive: salto

        var d = dataCell;
        var anno = d.getFullYear();
        var mese = d.getMonth() + 1;
        var key = anno + '-' + mese;

        var nome = String(operaio).trim();
        var staff = staffByName[normName(nome)] || null;
        if (!staff) nonTrovati[nome] = true;

        var ambito = cell(rr, 'ambito');
        ambito = (ambito == null || String(ambito).trim() === '') ? 'Non Specificato' : String(ambito).trim();
        // Uniformo maiuscole/minuscole sul nome ufficiale (es. "cantina" -> "Cantina").
        var canon = ambitoCanon[ambito.toLowerCase()];
        if (canon) ambito = canon;

        var descr = cell(rr, 'lavoro svolto');
        descr = (descr == null || String(descr).trim() === '') ? null : String(descr).trim();

        var record = {
          staff_id: staff ? staff.id : null,
          operaio_nome: nome,
          data: toISODate(d),
          ore: ore,
          descrizione: descr,
          ambito: ambito,
          paga_gg: cell(rr, 'paga gg') == null ? null : toNum(cell(rr, 'paga gg')),
          costo: cell(rr, 'costo') == null ? null : toNum(cell(rr, 'costo'))
        };

        if (!gruppiMap[key]) {
          gruppiMap[key] = { anno: anno, mese: mese, records: [], operai: {}, ore: 0, costo: 0 };
        }
        var g = gruppiMap[key];
        g.records.push(record);
        g.operai[nome] = true;
        g.ore += ore;
        g.costo += record.costo || 0;

        anniSet[anno] = true;
        righeTot++;
      }

      var gruppiArr = [];
      for (var k in gruppiMap) { gruppiArr.push(gruppiMap[k]); }
      gruppiArr.sort(function (a, b) {
        if (a.anno !== b.anno) return a.anno - b.anno;
        return a.mese - b.mese;
      });

      var anni = [];
      for (var y in anniSet) { anni.push(parseInt(y, 10)); }

      if (gruppiArr.length === 0) {
        setParseLoading(false);
        setParseError('Il foglio Registro non contiene giornate con ore. Compila prima le schede nell\u2019Excel.');
        return;
      }

      var nt = [];
      for (var n in nonTrovati) { nt.push(n); }
      nt.sort();

      setGruppi(gruppiArr);
      setNonAbbinati(nt);
      setTotFile({ righe: righeTot, anni: anni });
      setParseLoading(false);
      ricaricaPresenti(anni);

    }).catch(function (err) {
      console.error('Errore lettura Excel:', err);
      setParseLoading(false);
      setParseError('Errore nella lettura del file. Assicurati che sia il file .xlsx originale.');
    });
  }

  // ----------------------------------------------------------
  // Import (sostituzione) di un singolo mese
  // ----------------------------------------------------------
  function importaMese(g) {
    var key = g.anno + '-' + g.mese;
    setStatoMese(function (prev) {
      var copy = {}; for (var k in prev) copy[k] = prev[k];
      copy[key] = 'busy';
      return copy;
    });

    // 1) cancello le righe esistenti di quel anno+mese
    supabase
      .from('stip_ore_campagna')
      .delete()
      .eq('anno', g.anno)
      .eq('mese', g.mese)
      .then(function (delRes) {
        if (delRes.error) {
          setStatoMese(function (prev) {
            var copy = {}; for (var k in prev) copy[k] = prev[k];
            copy[key] = 'err:' + delRes.error.message;
            return copy;
          });
          return;
        }
        // 2) inserisco le nuove
        supabase
          .from('stip_ore_campagna')
          .insert(g.records)
          .then(function (insRes) {
            if (insRes.error) {
              setStatoMese(function (prev) {
                var copy = {}; for (var k in prev) copy[k] = prev[k];
                copy[key] = 'err:' + insRes.error.message;
                return copy;
              });
              return;
            }
            setStatoMese(function (prev) {
              var copy = {}; for (var k in prev) copy[k] = prev[k];
              copy[key] = 'ok';
              return copy;
            });
            if (totFile) ricaricaPresenti(totFile.anni);
          });
      });
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  return (
    <div className="p-4 sm:p-6 max-w-full">

      {/* Intestazione */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileSpreadsheet size={26} className="text-wine-700" />
          Campagna — Importa ore
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Carica il file Excel "Ore Operai Campagna". Leggo il foglio Registro e importo i dati mese per mese.
          Ogni import <span className="font-semibold">sostituisce</span> il mese scelto (non aggiunge).
        </p>
      </div>

      {/* Area di caricamento */}
      <label className={
        'flex items-center gap-3 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors mb-5 ' +
        'border-gray-200 hover:border-wine-300 hover:bg-gray-50'
      }>
        <div className="w-10 h-10 rounded-lg bg-wine-100 text-wine-700 flex items-center justify-center flex-shrink-0">
          <Upload size={18} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">Carica il file Excel della campagna</div>
          <div className="text-xs text-gray-500">Formato .xlsx — leggo automaticamente il foglio "Registro"</div>
        </div>
        <input type="file" accept=".xlsx,.xls" className="hidden"
          disabled={loadingStaff}
          onChange={handleFile} />
      </label>

      {parseLoading && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-500 text-sm mb-5">
          Lettura del file in corso...
        </div>
      )}

      {parseError && (
        <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <span>{parseError}</span>
        </div>
      )}

      {/* Riepilogo file + non abbinati */}
      {totFile && (
        <div className="mb-5 p-4 bg-wine-50 border border-wine-200 rounded-xl text-sm text-wine-900 flex items-start gap-2">
          <Info size={18} className="flex-shrink-0 mt-0.5 text-wine-700" />
          <span>
            Lette <span className="font-semibold">{totFile.righe}</span> giornate
            {totFile.anni.length ? ' (anno ' + totFile.anni.join(', ') + ')' : ''}.
            Scegli i mesi da importare qui sotto.
          </span>
        </div>
      )}

      {nonAbbinati.length > 0 && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold mb-1">
            <AlertTriangle size={18} className="text-amber-600" />
            Operai non abbinati a un dipendente ({nonAbbinati.length})
          </div>
          <p className="mb-2 text-amber-800">
            Questi nomi del file non corrispondono a nessun dipendente in anagrafica. Le loro righe vengono
            comunque importate (col nome), ma non compariranno negli stipendi finché non li abbini. Controlla
            l'anagrafica Staff (nome e cognome) e reimporta.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {nonAbbinati.map(function (nome) {
              return (
                <span key={nome} className="inline-block bg-white border border-amber-300 rounded-lg px-2 py-0.5 text-xs">
                  {nome}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Elenco mesi */}
      {gruppi && (
        <div className="space-y-3">
          {gruppi.map(function (g) {
            var key = g.anno + '-' + g.mese;
            var stato = statoMese[key];
            var giaPresenti = presenti[key] || 0;
            var nOperai = Object.keys(g.operai).length;
            var giornate = g.ore / 8;
            var busy = stato === 'busy';
            var ok = stato === 'ok';
            var err = stato && stato.indexOf('err:') === 0 ? stato.slice(4) : null;

            return (
              <div key={key} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-gray-900">
                      {MESI[g.mese - 1]} {g.anno}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Users size={13} /> {nOperai} operai
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={13} /> {fmtNum(g.ore)} ore · {fmtNum(giornate)} gg
                      </span>
                      <span className="font-medium text-gray-700">€ {fmtEuro(g.costo)}</span>
                      {giaPresenti > 0 && !ok && (
                        <span className="inline-block bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                          già presente: {giaPresenti} righe
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {ok ? (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
                        <CheckCircle2 size={18} /> Importato
                      </span>
                    ) : (
                      <button
                        onClick={function () { importaMese(g); }}
                        disabled={busy}
                        className={
                          'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ' +
                          (busy ? 'bg-wine-300 text-white' : 'bg-wine-700 hover:bg-wine-800 text-white')
                        }>
                        {busy ? (
                          <span>Importazione...</span>
                        ) : (
                          <>
                            <RefreshCw size={16} />
                            {giaPresenti > 0 ? 'Sostituisci' : 'Importa'}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {err && (
                  <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                    Errore: {err}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
