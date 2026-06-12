import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Calendar, ChevronLeft, ChevronRight, Upload, Copy, Save,
  AlertTriangle, CheckCircle2, FileText, RefreshCw, Check
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ============================================================
// PAGINA STIPENDI -> BUSTE PAGA
// Legge i PDF Zucchetti (cedolino di prova e LUL definitivo),
// abbina ogni cedolino al dipendente per codice fiscale,
// confronta il netto proposto con il maturato del mese,
// proietta le giornate sull'anno e genera le istruzioni per
// la consulente. Salva busta_prova / busta_definitiva /
// giornate_busta / istruzioni_consulente su stip_mesi.
// ============================================================

var MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

function fmtEuro(n) {
  if (n === null || n === undefined || n === '' || isNaN(parseFloat(n))) return '0,00';
  var num = parseFloat(n);
  return num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function parseNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// Converte un importo all'italiana ("1.356,00" / "13,00000") in numero.
function parseEuro(s) {
  if (s === null || s === undefined) return null;
  var t = String(s).replace(/\./g, '').replace(',', '.');
  var n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function normCF(s) {
  if (!s) return '';
  return String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normName(s) {
  if (!s) return '';
  return String(s).toUpperCase().replace(/[^A-Z]/g, '');
}

function fmtGiorni(g) {
  if (g === null || g === undefined || g === '') return '—';
  var n = parseNum(g);
  return Math.round(n * 100) / 100 === Math.round(n) ? String(Math.round(n)) : String(n);
}

// ------------------------------------------------------------
// Parsing di una singola pagina del PDF Zucchetti
// Riceve il testo della pagina (item.str uniti da spazio).
// Ritorna { codice, nome, cf, giornate, netto, tfr, mese, anno } o null.
// ------------------------------------------------------------
function parsePagina(text) {
  if (/RIEPILOGO\s+GENERALE/i.test(text)) return null;

  // Riga dipendente: 0000NNN  COGNOME NOME  CODICEFISCALE
  var emp = text.match(/(0000\d{3})\s+([A-Z'’ ]+?)\s+([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])(?![A-Z0-9])/);
  if (!emp) return null;

  var codice = emp[1];
  var nome = emp[2].replace(/\s+/g, ' ').trim();
  var cf = emp[3];

  // Periodo
  var per = text.match(/(Gennaio|Febbraio|Marzo|Aprile|Maggio|Giugno|Luglio|Agosto|Settembre|Ottobre|Novembre|Dicembre)\s+(\d{4})/i);
  var meseNum = null, annoNum = null;
  if (per) {
    var idx = MESI.map(function (m) { return m.toLowerCase(); }).indexOf(per[1].toLowerCase());
    if (idx !== -1) meseNum = idx + 1;
    annoNum = parseInt(per[2], 10);
  }

  // Giornate dalla riga 000002 RETRIBUZIONE D <base> <giorni>,00000 GG
  var ggM = text.match(/000002\s+RETRIBUZIONE\s+D\s+[\d.,]+\s+([\d.,]+)\s+GG/);
  var giornate = ggM ? parseEuro(ggM[1]) : null;

  // Netto del mese: l'unico importo seguito da € (prendo l'ultimo per sicurezza)
  var euroAll = [];
  var reEuro = /([\d.]+,\d{2})\s*€/g;
  var mm;
  while ((mm = reEuro.exec(text)) !== null) { euroAll.push(mm[1]); }
  var netto = euroAll.length ? parseEuro(euroAll[euroAll.length - 1]) : null;

  // Quota TFR (presente sul cedolino di prova)
  var tfrM = text.match(/Quota\s+T\.?\s*F\.?\s*R\.?\s+([\d.]+,\d{2})/i);
  var tfr = tfrM ? parseEuro(tfrM[1]) : null;

  return {
    codice: codice,
    nome: nome,
    cf: cf,
    giornate: giornate,
    netto: netto,
    tfr: tfr,
    mese: meseNum,
    anno: annoNum
  };
}

export default function BustePagaPage() {
  var navigate = useNavigate();

  var oggi = new Date();
  var [anno, setAnno] = useState(oggi.getFullYear());
  var [mese, setMese] = useState(oggi.getMonth() + 1);

  var [loading, setLoading] = useState(true);

  // Dati dal database per il mese/anno selezionato
  var [staffByCF, setStaffByCF] = useState({});
  var [staffByName, setStaffByName] = useState({});
  var [profiloByStaff, setProfiloByStaff] = useState({});
  var [rigaByStaff, setRigaByStaff] = useState({});
  var [giornatePrecByStaff, setGiornatePrecByStaff] = useState({});

  // Risultato del parsing PDF
  var [parsedRaw, setParsedRaw] = useState(null);   // array o null
  var [modo, setModo] = useState(null);             // 'prova' | 'definitivo'
  var [pdfPeriodo, setPdfPeriodo] = useState(null); // { mese, anno }
  var [parseError, setParseError] = useState(null);
  var [parseLoading, setParseLoading] = useState(false);

  // Modifiche dell'utente (per CF): giornate corrette + nota consulente
  var [edits, setEdits] = useState({});

  var [saving, setSaving] = useState(false);
  var [savedMsg, setSavedMsg] = useState(null);
  var [copiato, setCopiato] = useState(false);

  useEffect(function () {
    loadMonthData();
  }, [anno, mese]);

  function loadMonthData() {
    setLoading(true);

    var pStaff = supabase
      .from('staff_members')
      .select('id, first_name, last_name, fiscal_code')
      .eq('is_active', true);

    var pProfili = supabase
      .from('stip_profili')
      .select('staff_id, tipo, settore_paghe, giornate_target_annue, attivo');

    // Tutte le righe dell'anno: il mese corrente + i mesi precedenti (per il cumulato giornate)
    var pMesi = supabase
      .from('stip_mesi')
      .select('*')
      .eq('anno', anno);

    Promise.all([pStaff, pProfili, pMesi]).then(function (results) {
      var staff = results[0].data || [];
      var profili = results[1].data || [];
      var mesiAnno = results[2].data || [];

      var byCF = {};
      var byName = {};
      staff.forEach(function (s) {
        if (s.fiscal_code) byCF[normCF(s.fiscal_code)] = s;
        byName[normName((s.last_name || '') + (s.first_name || ''))] = s;
        byName[normName((s.first_name || '') + (s.last_name || ''))] = s;
      });
      setStaffByCF(byCF);
      setStaffByName(byName);

      var profMap = {};
      profili.forEach(function (p) { profMap[p.staff_id] = p; });
      setProfiloByStaff(profMap);

      var rigaMap = {};
      var precMap = {};
      mesiAnno.forEach(function (r) {
        if (r.mese === mese) {
          rigaMap[r.staff_id] = r;
        }
        if (r.mese < mese) {
          precMap[r.staff_id] = (precMap[r.staff_id] || 0) + parseNum(r.giornate_busta);
        }
      });
      setRigaByStaff(rigaMap);
      setGiornatePrecByStaff(precMap);

      setLoading(false);
    });
  }

  // ----------------------------------------------------------
  // Caricamento e parsing PDF
  // ----------------------------------------------------------
  function handleFile(e, modoFile) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setParseLoading(true);
    setParseError(null);
    setSavedMsg(null);

    file.arrayBuffer().then(function (buffer) {
      return pdfjsLib.getDocument({ data: buffer }).promise;
    }).then(function (pdf) {
      var tasks = [];
      for (var i = 1; i <= pdf.numPages; i++) {
        tasks.push(pdf.getPage(i).then(function (page) { return page.getTextContent(); }));
      }
      return Promise.all(tasks);
    }).then(function (contents) {
      var rows = [];
      var seen = {};
      for (var i = 0; i < contents.length; i++) {
        var items = contents[i].items || [];
        var pageText = '';
        for (var j = 0; j < items.length; j++) {
          pageText += items[j].str + ' ';
        }
        var parsed = parsePagina(pageText);
        if (parsed) {
          var key = normCF(parsed.cf);
          seen[key] = parsed; // se duplicato, vince l'ultimo
        }
      }
      for (var k in seen) { rows.push(seen[k]); }

      if (rows.length === 0) {
        setParseLoading(false);
        setParseError('Non ho riconosciuto nessun cedolino. Verifica che sia un PDF Zucchetti con testo (non una scansione).');
        return;
      }

      // Periodo del PDF (dal primo cedolino utile)
      var per = null;
      for (var r = 0; r < rows.length; r++) {
        if (rows[r].mese) { per = { mese: rows[r].mese, anno: rows[r].anno }; break; }
      }
      setPdfPeriodo(per);

      setParsedRaw(rows);
      setModo(modoFile);
      setEdits({});
      setParseLoading(false);
    }).catch(function (err) {
      console.error('Errore lettura PDF:', err);
      setParseLoading(false);
      setParseError('Errore nella lettura del PDF. Riprova con il file originale.');
    });
  }

  // ----------------------------------------------------------
  // Costruzione righe da mostrare (parsing + dati DB + modifiche)
  // ----------------------------------------------------------
  function buildRows() {
    if (!parsedRaw) return { matched: [], unmatched: [] };

    var matched = [];
    var unmatched = [];

    parsedRaw.forEach(function (p) {
      var staff = staffByCF[normCF(p.cf)];
      if (!staff) staff = staffByName[normName(p.nome)];

      if (!staff) {
        unmatched.push(p);
        return;
      }

      var prof = profiloByStaff[staff.id] || null;
      var riga = rigaByStaff[staff.id] || null;

      var maturato = riga
        ? parseNum(riga.conteggio_euro) + parseNum(riga.extra) + parseNum(riga.riporto_precedente) + parseNum(riga.tfr)
        : null;

      var ed = edits[normCF(p.cf)] || {};
      var corrette = ed.corrette !== undefined && ed.corrette !== null
        ? ed.corrette
        : (p.giornate !== null && p.giornate !== undefined ? p.giornate : '');
      var nota = ed.nota !== undefined ? ed.nota : '';

      var prec = giornatePrecByStaff[staff.id] || 0;
      var cumulato = prec + parseNum(corrette);
      var proiezione = mese > 0 ? Math.round((cumulato / mese) * 12) : 0;
      var target = prof && prof.giornate_target_annue ? parseNum(prof.giornate_target_annue) : null;

      matched.push({
        parsed: p,
        staff: staff,
        prof: prof,
        riga: riga,
        maturato: maturato,
        corrette: corrette,
        nota: nota,
        cumulato: cumulato,
        proiezione: proiezione,
        target: target
      });
    });

    // Ordina per cognome
    matched.sort(function (a, b) {
      var na = (a.staff.last_name + ' ' + a.staff.first_name).toLowerCase();
      var nb = (b.staff.last_name + ' ' + b.staff.first_name).toLowerCase();
      return na < nb ? -1 : 1;
    });

    return { matched: matched, unmatched: unmatched };
  }

  function setCorrette(cf, value) {
    setEdits(function (prev) {
      var copy = {};
      for (var k in prev) copy[k] = prev[k];
      var cur = copy[cf] || {};
      copy[cf] = { corrette: value === '' ? '' : parseNum(value), nota: cur.nota };
      return copy;
    });
  }

  function setNota(cf, value) {
    setEdits(function (prev) {
      var copy = {};
      for (var k in prev) copy[k] = prev[k];
      var cur = copy[cf] || {};
      copy[cf] = { corrette: cur.corrette, nota: value };
      return copy;
    });
  }

  function semaforo(row) {
    if (row.target === null) return { color: 'gray', label: 'target n/d' };
    var ratio = row.target > 0 ? row.proiezione / row.target : 1;
    var color = ratio >= 0.98 ? 'emerald' : (ratio >= 0.90 ? 'amber' : 'red');
    return { color: color, label: row.proiezione + ' su ' + row.target };
  }

  // Testo istruzioni per la consulente (solo modalita' prova)
  function testoIstruzioni(matched) {
    var righe = [];
    matched.forEach(function (row) {
      var nome = row.staff.last_name + ' ' + row.staff.first_name;
      var prop = row.parsed.giornate;
      var corr = parseNum(row.corrette);
      var parti = [];
      if (prop !== null && prop !== undefined && Math.abs(corr - parseNum(prop)) > 0.001) {
        parti.push('registra ' + fmtGiorni(corr) + ' giornate invece di ' + fmtGiorni(prop));
      }
      if (row.nota && row.nota.trim()) {
        parti.push(row.nota.trim());
      }
      if (parti.length > 0) {
        righe.push('- ' + nome + ': ' + parti.join('; '));
      }
    });
    if (righe.length === 0) return '';
    var intestazione = 'Istruzioni buste paga ' + MESI[mese - 1] + ' ' + anno + ':';
    return intestazione + '\n' + righe.join('\n');
  }

  function copiaTesto(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () {
        setCopiato(true);
        setTimeout(function () { setCopiato(false); }, 1800);
      });
    }
  }

  // ----------------------------------------------------------
  // Salvataggio su stip_mesi (upsert per (staff_id, anno, mese))
  // ----------------------------------------------------------
  function salva(matched) {
    var payload = [];
    matched.forEach(function (row) {
      if (row.parsed.netto === null || row.parsed.netto === undefined) return; // cedolino vuoto: salto

      if (modo === 'prova') {
        payload.push({
          staff_id: row.staff.id,
          anno: anno,
          mese: mese,
          busta_prova: row.parsed.netto,
          giornate_busta: row.corrette === '' ? null : parseNum(row.corrette),
          istruzioni_consulente: (row.nota && row.nota.trim()) ? row.nota.trim() : null
        });
      } else {
        payload.push({
          staff_id: row.staff.id,
          anno: anno,
          mese: mese,
          busta_definitiva: row.parsed.netto,
          giornate_busta: row.parsed.giornate === null ? null : parseNum(row.parsed.giornate)
        });
      }
    });

    if (payload.length === 0) {
      setSavedMsg({ tipo: 'err', testo: 'Nessun cedolino con netto da salvare.' });
      return;
    }

    setSaving(true);
    setSavedMsg(null);
    supabase
      .from('stip_mesi')
      .upsert(payload, { onConflict: 'staff_id,anno,mese' })
      .then(function (res) {
        setSaving(false);
        if (res.error) {
          setSavedMsg({ tipo: 'err', testo: 'Errore salvataggio: ' + res.error.message });
          return;
        }
        setSavedMsg({
          tipo: 'ok',
          testo: 'Salvati ' + payload.length + ' cedolini su ' + MESI[mese - 1] + ' ' + anno +
            (modo === 'prova' ? ' (busta di prova).' : ' (busta definitiva).')
        });
        loadMonthData();
      });
  }

  // Navigazione mese
  function meseProx() {
    if (mese === 12) { setAnno(anno + 1); setMese(1); } else { setMese(mese + 1); }
    resetParsing();
  }
  function mesePrec() {
    if (mese === 1) { setAnno(anno - 1); setMese(12); } else { setMese(mese - 1); }
    resetParsing();
  }
  function resetParsing() {
    setParsedRaw(null);
    setModo(null);
    setEdits({});
    setPdfPeriodo(null);
    setParseError(null);
    setSavedMsg(null);
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  var built = buildRows();
  var matched = built.matched;
  var unmatched = built.unmatched;
  var istruzioni = modo === 'prova' ? testoIstruzioni(matched) : '';

  var periodoDiverso = pdfPeriodo && pdfPeriodo.mese && (pdfPeriodo.mese !== mese || pdfPeriodo.anno !== anno);

  return (
    <div className="p-4 sm:p-6 max-w-full">

      {/* Intestazione + selettore mese */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText size={26} className="text-wine-700" />
            Stipendi — Buste Paga
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Carica i cedolini PDF Zucchetti, controlla netti e giornate, prepara le istruzioni per la consulente.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1">
          <button onClick={mesePrec} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <div className="px-4 text-sm font-semibold text-gray-900 min-w-[160px] text-center">
            {MESI[mese - 1]} {anno}
          </div>
          <button onClick={meseProx} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* Aree di caricamento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <label className={
          'flex items-center gap-3 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors ' +
          (modo === 'prova' ? 'border-wine-400 bg-wine-50' : 'border-gray-200 hover:border-wine-300 hover:bg-gray-50')
        }>
          <div className="w-10 h-10 rounded-lg bg-wine-100 text-wine-700 flex items-center justify-center flex-shrink-0">
            <Upload size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">Carica busta di prova</div>
            <div className="text-xs text-gray-500">Stampa di controllo per il confronto e le istruzioni</div>
          </div>
          <input type="file" accept="application/pdf" className="hidden"
            onChange={function (e) { handleFile(e, 'prova'); }} />
        </label>

        <label className={
          'flex items-center gap-3 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors ' +
          (modo === 'definitivo' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50')
        }>
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
            <Upload size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">Carica LUL definitivo</div>
            <div className="text-xs text-gray-500">Aggiorna la busta definitiva e ricalcola i resti</div>
          </div>
          <input type="file" accept="application/pdf" className="hidden"
            onChange={function (e) { handleFile(e, 'definitivo'); }} />
        </label>
      </div>

      {parseLoading && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-500 text-sm mb-5">
          Lettura del PDF in corso...
        </div>
      )}

      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{parseError}</p>
        </div>
      )}

      {periodoDiverso && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Il PDF sembra del periodo <strong>{MESI[pdfPeriodo.mese - 1]} {pdfPeriodo.anno}</strong>, ma stai
            lavorando su <strong>{MESI[mese - 1]} {anno}</strong>. Controlla il mese selezionato in alto.
          </p>
        </div>
      )}

      {savedMsg && (
        <div className={
          'rounded-xl p-4 mb-5 flex items-start gap-3 ' +
          (savedMsg.tipo === 'ok' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200')
        }>
          {savedMsg.tipo === 'ok'
            ? <CheckCircle2 size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
            : <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />}
          <p className={'text-sm ' + (savedMsg.tipo === 'ok' ? 'text-green-800' : 'text-red-800')}>{savedMsg.testo}</p>
        </div>
      )}

      {loading && (
        <div className="text-center text-gray-400 text-sm py-8">Caricamento dati del mese...</div>
      )}

      {/* Tabella confronto */}
      {!loading && parsedRaw && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-semibold text-gray-700">
              {matched.length} cedolini abbinati
              <span className={'ml-2 text-xs px-2 py-0.5 rounded-full font-medium ' +
                (modo === 'prova' ? 'bg-wine-100 text-wine-700' : 'bg-blue-100 text-blue-700')}>
                {modo === 'prova' ? 'Busta di prova' : 'LUL definitivo'}
              </span>
            </div>
            <button
              onClick={function () { salva(matched); }}
              disabled={saving}
              className="flex items-center gap-2 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Save size={15} />
              {saving ? 'Salvataggio...' : (modo === 'prova' ? 'Salva busta di prova' : 'Salva busta definitiva')}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Dipendente</th>
                  <th className="px-3 py-2 text-right">{modo === 'prova' ? 'Netto proposto' : 'Netto definitivo'}</th>
                  <th className="px-3 py-2 text-right">Maturato</th>
                  <th className="px-3 py-2 text-right" title="Netto - Maturato">Diff.</th>
                  <th className="px-3 py-2 text-right">TFR</th>
                  <th className="px-3 py-2 text-right">{modo === 'prova' ? 'Giornate prop.' : 'Giornate'}</th>
                  {modo === 'prova' && <th className="px-3 py-2 text-right">Giornate corrette</th>}
                  <th className="px-3 py-2 text-right" title="Proiezione fine anno su target">Proiezione</th>
                  {modo === 'prova' && <th className="px-3 py-2 text-left">Nota consulente</th>}
                </tr>
              </thead>
              <tbody>
                {matched.map(function (row) {
                  var p = row.parsed;
                  var vuoto = p.netto === null || p.netto === undefined;
                  var diff = (row.maturato !== null && !vuoto) ? (parseNum(p.netto) - row.maturato) : null;
                  var sem = semaforo(row);
                  return (
                    <tr key={p.cf} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">
                        {row.staff.last_name} {row.staff.first_name}
                        {vuoto && <span className="ml-2 text-xs text-gray-400 italic">(non lavorato)</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {vuoto ? '—' : fmtEuro(p.netto)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                        {row.maturato === null ? '—' : fmtEuro(row.maturato)}
                      </td>
                      <td className={
                        'px-3 py-2 text-right whitespace-nowrap font-medium ' +
                        (diff === null ? 'text-gray-300' : (Math.abs(diff) < 0.01 ? 'text-gray-400' : (diff > 0 ? 'text-emerald-600' : 'text-red-600')))
                      }>
                        {diff === null ? '—' : (Math.abs(diff) < 0.01 ? '—' : (diff > 0 ? '+' : '') + fmtEuro(diff))}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">
                        {p.tfr === null || p.tfr === undefined ? '—' : fmtEuro(p.tfr)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                        {fmtGiorni(p.giornate)}
                      </td>
                      {modo === 'prova' && (
                        <td className="px-2 py-1 text-right">
                          <input type="number" step="0.5"
                            value={row.corrette === '' ? '' : row.corrette}
                            onChange={function (e) { setCorrette(p.cf, e.target.value); }}
                            className="w-16 text-right bg-transparent border border-gray-200 hover:border-gray-300 focus:border-wine-400 rounded px-1 py-1 focus:outline-none" />
                        </td>
                      )}
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span className={
                          'inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ' +
                          (sem.color === 'emerald' ? 'bg-emerald-100 text-emerald-700' :
                            sem.color === 'amber' ? 'bg-amber-100 text-amber-700' :
                              sem.color === 'red' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500')
                        }>
                          <span className={
                            'w-1.5 h-1.5 rounded-full ' +
                            (sem.color === 'emerald' ? 'bg-emerald-500' :
                              sem.color === 'amber' ? 'bg-amber-500' :
                                sem.color === 'red' ? 'bg-red-500' : 'bg-gray-400')
                          }></span>
                          {sem.label}
                        </span>
                      </td>
                      {modo === 'prova' && (
                        <td className="px-2 py-1">
                          <input type="text" placeholder="es. aggiungi TFR"
                            value={row.nota}
                            onChange={function (e) { setNota(p.cf, e.target.value); }}
                            className="w-44 bg-transparent border border-gray-200 hover:border-gray-300 focus:border-wine-400 rounded px-2 py-1 text-sm focus:outline-none" />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dipendenti non abbinati */}
      {!loading && parsedRaw && unmatched.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-amber-800">
              {unmatched.length} cedolini non abbinati a nessun dipendente
            </h3>
          </div>
          <p className="text-xs text-amber-700 mb-2">
            Codice fiscale non trovato in anagrafica. Aggiungi il dipendente in Staff (anche da UniLav) e ricarica il PDF.
          </p>
          <div className="flex flex-wrap gap-2">
            {unmatched.map(function (p) {
              return (
                <span key={p.cf} className="text-xs bg-white border border-amber-200 rounded-lg px-2 py-1 text-amber-800">
                  {p.nome} <span className="text-amber-500">— {p.cf}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Testo istruzioni consulente */}
      {!loading && parsedRaw && modo === 'prova' && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Testo per la consulente</h3>
            <button
              onClick={function () { copiaTesto(istruzioni); }}
              disabled={!istruzioni}
              className="flex items-center gap-1.5 text-sm text-wine-700 hover:text-wine-800 disabled:text-gray-300 font-medium">
              {copiato ? <Check size={15} /> : <Copy size={15} />}
              {copiato ? 'Copiato' : 'Copia'}
            </button>
          </div>
          {istruzioni ? (
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 border border-gray-100 rounded-lg p-3">
              {istruzioni}
            </pre>
          ) : (
            <p className="text-sm text-gray-400 italic">
              Nessuna correzione da segnalare: modifica le "Giornate corrette" o aggiungi una nota per generare il testo.
            </p>
          )}
        </div>
      )}

      {!loading && !parsedRaw && !parseLoading && (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-400">
          <FileText size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Carica un cedolino di prova o un LUL definitivo per iniziare il confronto.</p>
        </div>
      )}

      <div className="h-8" />
    </div>
  );
}
