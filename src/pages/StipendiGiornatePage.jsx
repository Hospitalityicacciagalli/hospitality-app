import { useState, useEffect, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import {
  ChevronLeft, ChevronRight, ChevronDown, CalendarDays,
  AlertTriangle, Download, X, Search, RefreshCw
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import * as XLSX from 'xlsx';

// ============================================================
// PAGINA STIPENDI -> GIORNATE
// Prospetto ANNUALE delle giornate registrate in busta paga.
// Una riga per dipendente (anche cessati), 12 colonne mese,
// piu' maturate / proiezione / target / residuo / media richiesta.
//
// Regole (decise con Florestano, agosto 2026):
//  - Il mese conta se ha la BUSTA DEFINITIVA (busta_definitiva
//    valorizzata). Le sole buste di prova entrano solo con
//    l'interruttore apposito, e si vedono in ambra.
//  - "Ultimo mese" = ultimo mese con busta valida, anche se il
//    calendario e' piu' avanti (le buste si caricano dopo).
//  - Proiezione = maturate + (giornate ultimo mese x mesi restanti).
//  - Media richiesta = (target - maturate) / mesi restanti, 1 dec.
//  - Massimo di un mese = giorni del mese meno le domeniche.
//  - Chi ha il contratto scaduto non viene proiettato.
// ============================================================

var MESI_LUNGHI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
var MESI_CORTI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

function parseNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// Numero senza decimali se e' intero, altrimenti con un decimale.
function fmtGg(n) {
  if (n === null || n === undefined) return '—';
  var num = parseNum(n);
  var arrot = Math.round(num * 10) / 10;
  if (Math.abs(arrot - Math.round(arrot)) < 0.001) return String(Math.round(arrot));
  return String(arrot).replace('.', ',');
}

// Sempre con un decimale (media richiesta).
function fmtUnDec(n) {
  if (n === null || n === undefined) return '—';
  return (Math.round(parseNum(n) * 10) / 10).toFixed(1).replace('.', ',');
}

// Giorni "lavorabili" di un mese = giorni totali meno le domeniche.
// E' il tetto di realta' della proiezione, non una pianificazione turni.
function giorniLavorabili(anno, mese) {
  var totGiorni = new Date(anno, mese, 0).getDate();
  var conta = 0;
  for (var g = 1; g <= totGiorni; g++) {
    var d = new Date(anno, mese - 1, g);
    if (d.getDay() !== 0) conta = conta + 1;
  }
  return conta;
}

function isoSlice(v) {
  if (!v) return null;
  return String(v).slice(0, 10);
}

export default function StipendiGiornatePage() {
  var auth = useAuth();
  var puoScrivere = auth && auth.canEdit ? auth.canEdit('stipendi') : false;

  var oggi = new Date();
  var [anno, setAnno] = useState(oggi.getFullYear());

  var [loading, setLoading] = useState(true);
  var [profili, setProfili] = useState([]);
  var [mesiRighe, setMesiRighe] = useState([]);
  var [targetOverride, setTargetOverride] = useState({});

  var [includiProva, setIncludiProva] = useState(false);
  var [filtroNome, setFiltroNome] = useState('');
  var [collassati, setCollassati] = useState({});

  // Valore momentaneamente digitato nella cella target: staff_id -> stringa
  var [targetEdit, setTargetEdit] = useState({});
  var [salvataggio, setSalvataggio] = useState(null);

  useEffect(function () {
    caricaTutto();
  }, [anno]);

  function caricaTutto() {
    setLoading(true);
    setTargetEdit({});

    var pProfili = supabase
      .from('stip_profili')
      .select('*, staff:staff_members(id, first_name, last_name, is_active, hire_date, contract_end_date)')
      .order('ordine', { ascending: true });

    var pMesi = supabase
      .from('stip_mesi')
      .select('staff_id, mese, giornate_busta, busta_prova, busta_definitiva')
      .eq('anno', anno);

    var pTarget = supabase
      .from('stip_giornate_target')
      .select('staff_id, target')
      .eq('anno', anno);

    Promise.all([pProfili, pMesi, pTarget]).then(function (res) {
      setProfili(res[0].data || []);
      setMesiRighe(res[1].data || []);

      var mapT = {};
      (res[2].data || []).forEach(function (t) {
        mapT[t.staff_id] = parseNum(t.target);
      });
      setTargetOverride(mapT);

      setLoading(false);
    });
  }

  // ----------------------------------------------------------
  // Costruzione della griglia mese per mese
  // ----------------------------------------------------------

  // staff_id -> array di 12 celle { valore, stato }
  // stato: 'definitiva' | 'prova' | 'vuoto'
  function costruisciCelle() {
    var mappa = {};
    mesiRighe.forEach(function (r) {
      if (!mappa[r.staff_id]) {
        mappa[r.staff_id] = [];
        for (var i = 0; i < 12; i++) {
          mappa[r.staff_id].push({ valore: null, stato: 'vuoto' });
        }
      }
      var idx = parseInt(r.mese, 10) - 1;
      if (idx < 0 || idx > 11) return;

      var haDef = r.busta_definitiva !== null && r.busta_definitiva !== undefined;
      var haProva = r.busta_prova !== null && r.busta_prova !== undefined;
      var gg = (r.giornate_busta === null || r.giornate_busta === undefined) ? null : parseNum(r.giornate_busta);

      if (gg === null) {
        mappa[r.staff_id][idx] = { valore: null, stato: 'vuoto' };
      } else if (haDef) {
        mappa[r.staff_id][idx] = { valore: gg, stato: 'definitiva' };
      } else if (haProva) {
        mappa[r.staff_id][idx] = { valore: gg, stato: 'prova' };
      } else {
        mappa[r.staff_id][idx] = { valore: gg, stato: 'prova' };
      }
    });
    return mappa;
  }

  // Il dipendente era sotto contratto in quel mese dell'anno selezionato?
  function sottoContratto(staff, mese) {
    if (!staff) return false;
    var mm = String(mese).padStart(2, '0');
    var primo = anno + '-' + mm + '-01';
    var ultimo = anno + '-' + mm + '-31';
    var assunto = isoSlice(staff.hire_date);
    var cessato = isoSlice(staff.contract_end_date);
    if (assunto && assunto > ultimo) return false;
    if (cessato && cessato < primo) return false;
    return true;
  }

  // Ultimo mese dell'anno in cui il contratto e' ancora vivo (1..12).
  function ultimoMeseUtile(staff) {
    var cessato = isoSlice(staff ? staff.contract_end_date : null);
    if (!cessato) return 12;
    if (cessato < anno + '-01-01') return 0;
    if (cessato > anno + '-12-31') return 12;
    return parseInt(cessato.slice(5, 7), 10);
  }

  function calcolaRiga(profilo, celle) {
    var staff = profilo.staff;

    var vale = function (cella) {
      if (!cella || cella.valore === null) return false;
      if (cella.stato === 'definitiva') return true;
      if (cella.stato === 'prova' && includiProva) return true;
      return false;
    };

    var maturate = 0;
    var ultimoMese = 0;
    var ultimoValore = 0;
    for (var i = 0; i < 12; i++) {
      if (vale(celle[i])) {
        maturate = maturate + celle[i].valore;
        ultimoMese = i + 1;
        ultimoValore = celle[i].valore;
      }
    }

    var fineUtile = ultimoMeseUtile(staff);
    var mesiRestanti = fineUtile > ultimoMese ? (fineUtile - ultimoMese) : 0;

    // Tetto massimo di giornate nei mesi restanti.
    var maxRestanti = 0;
    for (var m = ultimoMese + 1; m <= fineUtile; m++) {
      maxRestanti = maxRestanti + giorniLavorabili(anno, m);
    }

    var proiezione = null;
    if (ultimoMese > 0) {
      proiezione = maturate + (ultimoValore * mesiRestanti);
    }

    var over = targetOverride[profilo.staff_id];
    var suggerito = profilo.giornate_target_annue === null || profilo.giornate_target_annue === undefined
      ? null
      : parseNum(profilo.giornate_target_annue);
    var target = (over !== undefined && over !== null) ? over : suggerito;
    var haOverride = over !== undefined && over !== null;

    var residuo = target === null ? null : (target - maturate);
    var media = (target === null || mesiRestanti <= 0) ? null : (residuo / mesiRestanti);
    var impossibile = (residuo !== null && mesiRestanti > 0 && residuo > maxRestanti);
    var massimoRaggiungibile = maturate + maxRestanti;

    // Contratto finito: nessuna proiezione ha senso.
    var chiuso = mesiRestanti <= 0;

    // Buchi: mesi sotto contratto, prima dell'ultimo caricato, senza busta.
    var buchi = [];
    for (var b = 1; b <= ultimoMese; b++) {
      if (celle[b - 1].stato === 'vuoto' && sottoContratto(staff, b)) {
        buchi.push(b);
      }
    }

    return {
      profilo: profilo,
      staff: staff,
      celle: celle,
      maturate: maturate,
      ultimoMese: ultimoMese,
      ultimoValore: ultimoValore,
      mesiRestanti: mesiRestanti,
      fineUtile: fineUtile,
      maxRestanti: maxRestanti,
      proiezione: proiezione,
      target: target,
      suggerito: suggerito,
      haOverride: haOverride,
      residuo: residuo,
      media: media,
      impossibile: impossibile,
      massimoRaggiungibile: massimoRaggiungibile,
      chiuso: chiuso,
      buchi: buchi
    };
  }

  // ----------------------------------------------------------
  // Salvataggio del target
  // ----------------------------------------------------------
  function salvaTarget(staffId, testo) {
    if (!puoScrivere) return;

    var pulito = String(testo === null || testo === undefined ? '' : testo).trim();

    if (pulito === '') {
      setSalvataggio('Rimuovo...');
      supabase
        .from('stip_giornate_target')
        .delete()
        .eq('staff_id', staffId)
        .eq('anno', anno)
        .then(function (res) {
          setSalvataggio(null);
          if (res.error) {
            window.alert('Errore nel salvataggio: ' + res.error.message);
            return;
          }
          var copia = {};
          for (var k in targetOverride) {
            if (k !== String(staffId)) copia[k] = targetOverride[k];
          }
          setTargetOverride(copia);
        });
      return;
    }

    var valore = parseNum(pulito);
    if (valore < 0) valore = 0;
    if (valore > 366) valore = 366;

    setSalvataggio('Salvo...');
    supabase
      .from('stip_giornate_target')
      .upsert([{ staff_id: staffId, anno: anno, target: valore, aggiornato_il: new Date().toISOString() }], { onConflict: 'staff_id,anno' })
      .then(function (res) {
        setSalvataggio(null);
        if (res.error) {
          window.alert('Errore nel salvataggio: ' + res.error.message);
          return;
        }
        var copia = {};
        for (var k in targetOverride) copia[k] = targetOverride[k];
        copia[staffId] = valore;
        setTargetOverride(copia);
      });
  }

  function scriviTarget(staffId, testo) {
    setTargetEdit(function (prev) {
      var copia = {};
      for (var k in prev) copia[k] = prev[k];
      copia[staffId] = testo;
      return copia;
    });
  }

  function confermaTarget(staffId) {
    var testo = targetEdit[staffId];
    if (testo === undefined) return;
    salvaTarget(staffId, testo);
    setTargetEdit(function (prev) {
      var copia = {};
      for (var k in prev) {
        if (k !== String(staffId)) copia[k] = prev[k];
      }
      return copia;
    });
  }

  function portaAlMassimo(riga) {
    var valore = Math.floor(riga.massimoRaggiungibile);
    scriviTarget(riga.profilo.staff_id, String(valore));
    salvaTarget(riga.profilo.staff_id, String(valore));
  }

  // ----------------------------------------------------------
  // Settori
  // ----------------------------------------------------------
  function toggleSettore(settore) {
    setCollassati(function (prev) {
      var copia = {};
      for (var k in prev) copia[k] = prev[k];
      copia[settore] = !copia[settore];
      return copia;
    });
  }

  function apriTutti() {
    setCollassati({});
  }

  function chiudiTutti(lista) {
    var copia = {};
    lista.forEach(function (s) { copia[s] = true; });
    setCollassati(copia);
  }

  function nomeMatch(staff) {
    var f = filtroNome.trim().toLowerCase();
    if (f === '') return true;
    if (!staff) return false;
    var nome = ((staff.last_name || '') + ' ' + (staff.first_name || '')).toLowerCase();
    return nome.indexOf(f) !== -1;
  }

  // ----------------------------------------------------------
  // Preparazione dati per il render
  // ----------------------------------------------------------
  var celleMappa = costruisciCelle();

  // Chi compare: chi ha almeno una riga di stip_mesi nell'anno,
  // oppure chi ha un profilo attivo ed era sotto contratto nell'anno.
  var conDati = {};
  mesiRighe.forEach(function (r) { conDati[r.staff_id] = true; });

  var righeCalcolate = [];
  profili.forEach(function (p) {
    if (!p.staff) return;

    var haDati = !!conDati[p.staff_id];
    var vivoNellAnno = false;
    for (var m = 1; m <= 12; m++) {
      if (sottoContratto(p.staff, m)) { vivoNellAnno = true; break; }
    }
    if (!haDati && !(p.attivo && vivoNellAnno)) return;

    var celle = celleMappa[p.staff_id];
    if (!celle) {
      celle = [];
      for (var i = 0; i < 12; i++) celle.push({ valore: null, stato: 'vuoto' });
    }
    righeCalcolate.push(calcolaRiga(p, celle));
  });

  righeCalcolate.sort(function (a, b) {
    var sa = (a.profilo.settore_paghe || 'zzz').toLowerCase();
    var sb = (b.profilo.settore_paghe || 'zzz').toLowerCase();
    if (sa !== sb) return sa < sb ? -1 : 1;
    var na = ((a.staff.last_name || '') + ' ' + (a.staff.first_name || '')).toLowerCase();
    var nb = ((b.staff.last_name || '') + ' ' + (b.staff.first_name || '')).toLowerCase();
    return na < nb ? -1 : 1;
  });

  var righeVisibili = righeCalcolate.filter(function (r) { return nomeMatch(r.staff); });

  var perSettore = {};
  righeVisibili.forEach(function (r) {
    var settore = r.profilo.settore_paghe || 'Altri';
    if (!perSettore[settore]) perSettore[settore] = [];
    perSettore[settore].push(r);
  });

  function totaliLista(lista) {
    var t = { mesi: [], maturate: 0, proiezione: 0, target: 0, residuo: 0 };
    for (var i = 0; i < 12; i++) t.mesi.push(0);
    lista.forEach(function (r) {
      for (var i = 0; i < 12; i++) {
        var c = r.celle[i];
        var conta = c && c.valore !== null && (c.stato === 'definitiva' || (c.stato === 'prova' && includiProva));
        if (conta) t.mesi[i] = t.mesi[i] + c.valore;
      }
      t.maturate = t.maturate + r.maturate;
      if (r.proiezione !== null) t.proiezione = t.proiezione + r.proiezione;
      if (r.target !== null) t.target = t.target + r.target;
      if (r.residuo !== null) t.residuo = t.residuo + r.residuo;
    });
    return t;
  }

  var totGenerale = totaliLista(righeVisibili);

  // Avviso buste mancanti
  var conBuchi = righeVisibili.filter(function (r) { return r.buchi.length > 0; });

  // Ultimo mese caricato in assoluto (per l'intestazione)
  var ultimoGlobale = 0;
  righeVisibili.forEach(function (r) {
    if (r.ultimoMese > ultimoGlobale) ultimoGlobale = r.ultimoMese;
  });

  // Quante celle sono solo di prova
  var conteggioProva = 0;
  righeCalcolate.forEach(function (r) {
    for (var i = 0; i < 12; i++) {
      if (r.celle[i].stato === 'prova') conteggioProva = conteggioProva + 1;
    }
  });

  // ----------------------------------------------------------
  // Export Excel
  // ----------------------------------------------------------
  function esportaExcel() {
    var aoa = [];
    var testata = ['Settore', 'Nominativo'];
    for (var i = 0; i < 12; i++) testata.push(MESI_CORTI[i]);
    testata.push('Maturate');
    testata.push('Proiezione');
    testata.push('Target');
    testata.push('Residuo');
    testata.push('Media/mese');
    testata.push('Mesi restanti');
    testata.push('Massimo raggiungibile');
    testata.push('Note');
    aoa.push(testata);

    Object.keys(perSettore).forEach(function (settore) {
      perSettore[settore].forEach(function (r) {
        var riga = [];
        riga.push(settore);
        riga.push((r.staff.last_name || '') + ' ' + (r.staff.first_name || ''));
        for (var i = 0; i < 12; i++) {
          var c = r.celle[i];
          var conta = c && c.valore !== null && (c.stato === 'definitiva' || (c.stato === 'prova' && includiProva));
          riga.push(conta ? c.valore : null);
        }
        riga.push(r.maturate);
        riga.push(r.proiezione === null ? null : r.proiezione);
        riga.push(r.target === null ? null : r.target);
        riga.push(r.residuo === null ? null : r.residuo);
        riga.push(r.media === null ? null : Math.round(r.media * 10) / 10);
        riga.push(r.mesiRestanti);
        riga.push(r.massimoRaggiungibile);
        var note = [];
        if (r.chiuso) note.push('contratto chiuso');
        if (r.impossibile) note.push('target non raggiungibile');
        if (r.buchi.length > 0) note.push('buste mancanti: ' + r.buchi.length);
        riga.push(note.join(' - '));
        aoa.push(riga);
      });
    });

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Giornate ' + anno);
    XLSX.writeFile(wb, 'giornate_' + anno + '.xlsx');
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  var settori = Object.keys(perSettore);
  var filtroAttivo = filtroNome.trim() !== '';

  return (
    <div className="p-4 sm:p-6 max-w-full">

      {/* Intestazione + selettore anno */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CalendarDays size={26} className="text-wine-700" />
          Giornate
        </h1>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1">
          <button onClick={function () { setAnno(anno - 1); }} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <div className="px-4 text-sm font-semibold text-gray-900 min-w-[80px] text-center">{anno}</div>
          <button onClick={function () { setAnno(anno + 1); }} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>
        <button
          onClick={caricaTutto}
          className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-xl text-sm font-medium">
          <RefreshCw size={15} />
          Aggiorna
        </button>
        <button
          onClick={esportaExcel}
          className="flex items-center gap-2 bg-wine-700 hover:bg-wine-800 text-white px-3 py-2 rounded-xl text-sm font-medium">
          <Download size={15} />
          Excel
        </button>
        {salvataggio && <span className="text-xs text-gray-500">{salvataggio}</span>}
      </div>

      <p className="text-gray-500 text-sm mb-5">
        Giornate registrate in busta paga, mese per mese. La proiezione ipotizza che nei mesi
        restanti si ripeta il valore dell&rsquo;ultimo mese caricato.
        {ultimoGlobale > 0 && (
          <span> Ultimo mese con buste: <strong className="text-gray-700">{MESI_LUNGHI[ultimoGlobale - 1]}</strong>.</span>
        )}
      </p>

      {/* Riepilogo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Dipendenti nell&rsquo;anno</div>
          <div className="text-lg font-bold text-gray-900 mt-1">{righeVisibili.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Giornate maturate</div>
          <div className="text-lg font-bold text-gray-900 mt-1">{fmtGg(totGenerale.maturate)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Proiezione fine anno</div>
          <div className="text-lg font-bold text-wine-800 mt-1">{fmtGg(totGenerale.proiezione)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Totale target</div>
          <div className="text-lg font-bold text-gray-900 mt-1">{fmtGg(totGenerale.target)}</div>
        </div>
      </div>

      {/* Avviso buste mancanti */}
      {conBuchi.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 min-w-0">
            <p className="font-semibold mb-1">
              {conBuchi.length} {conBuchi.length === 1 ? 'dipendente ha' : 'dipendenti hanno'} buchi nei mesi gia&rsquo; passati
            </p>
            <p className="text-xs text-amber-700 mb-2">
              Mesi in cui la persona era sotto contratto ma non risulta nessuna busta caricata.
              Finche&rsquo; mancano, maturate e proiezione sono sottostimate.
            </p>
            <div className="flex flex-wrap gap-2">
              {conBuchi.map(function (r) {
                var etichette = r.buchi.map(function (m) { return MESI_CORTI[m - 1]; }).join(', ');
                return (
                  <span key={'buco-' + r.profilo.staff_id} className="text-xs bg-white border border-amber-200 rounded-lg px-2 py-1 text-amber-800">
                    {r.staff.last_name} {r.staff.first_name} <span className="text-amber-500">— {etichette}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Barra comandi */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={filtroNome}
            onChange={function (e) { setFiltroNome(e.target.value); }}
            placeholder="Filtra per nominativo"
            className="pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-wine-400 w-56" />
        </div>

        <button
          onClick={function () { setIncludiProva(!includiProva); }}
          className={
            'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ' +
            (includiProva
              ? 'bg-amber-50 border-amber-300 text-amber-800'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')
          }>
          <span className={
            'w-2 h-2 rounded-full ' + (includiProva ? 'bg-amber-500' : 'bg-gray-300')
          }></span>
          Includi buste di prova
          {conteggioProva > 0 && <span className="text-xs text-gray-400">({conteggioProva})</span>}
        </button>

        {settori.length > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-400">Settori:</span>
            <button onClick={apriTutti} className="text-wine-700 hover:underline font-medium">Apri tutti</button>
            <button onClick={function () { chiudiTutti(settori); }} className="text-wine-700 hover:underline font-medium">Chiudi tutti</button>
          </div>
        )}

        {filtroAttivo && (
          <button onClick={function () { setFiltroNome(''); }} className="text-xs text-wine-700 hover:underline">Mostra tutti</button>
        )}
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 mb-2 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-gray-200"></span> busta definitiva
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-200"></span> solo busta di prova
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-white border border-gray-200"></span> nessuna busta
        </span>
        <span>Il massimo di un mese e&rsquo; il numero di giorni meno le domeniche.</span>
      </div>

      {/* Tabella */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border-separate border-spacing-0">
            <thead className="text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="sticky top-0 left-0 z-30 bg-gray-50 border-b border-r-2 border-gray-200 px-3 py-2 text-left w-36 min-w-[9rem] max-w-[9rem]">Nominativo</th>
                {MESI_CORTI.map(function (m, i) {
                  return (
                    <th key={'h-' + m}
                      title={MESI_LUNGHI[i] + ' — massimo ' + giorniLavorabili(anno, i + 1) + ' giornate'}
                      className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-1 py-2 text-center w-10 min-w-[2.5rem]">
                      {m}
                    </th>
                  );
                })}
                <th className="sticky top-0 z-20 bg-gray-100 border-b border-l border-gray-200 px-3 py-2 text-right whitespace-nowrap" title="Somma delle giornate registrate finora">Maturate</th>
                <th className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-3 py-2 text-right whitespace-nowrap" title="Maturate + giornate dell'ultimo mese per i mesi restanti">Proiez.</th>
                <th className="sticky top-0 z-20 bg-wine-50 border-b border-gray-200 px-3 py-2 text-right whitespace-nowrap">Target</th>
                <th className="sticky top-0 z-20 bg-wine-50 border-b border-gray-200 px-3 py-2 text-right whitespace-nowrap" title="Target - Maturate">Residuo</th>
                <th className="sticky top-0 z-20 bg-wine-50 border-b border-gray-200 px-3 py-2 text-right whitespace-nowrap" title="Giornate da registrare in ciascun mese restante">Media/mese</th>
              </tr>
            </thead>
            <tbody>
              {settori.length === 0 && (
                <tr>
                  <td colSpan={18} className="px-3 py-8 text-center text-gray-400 italic">
                    {loading ? 'Caricamento...' : 'Nessun dipendente con dati nel ' + anno + '.'}
                  </td>
                </tr>
              )}

              {settori.map(function (settore) {
                var lista = perSettore[settore];
                var chiuso = !!collassati[settore];
                var st = totaliLista(lista);
                return (
                  <Fragment key={'sett-' + settore}>
                    <tr
                      onClick={function () { toggleSettore(settore); }}
                      className="bg-wine-50 cursor-pointer hover:bg-wine-100 select-none">
                      {chiuso ? (
                        <>
                          <td className="sticky left-0 z-10 bg-wine-50 border-r-2 border-gray-200 px-3 py-1.5 text-xs font-semibold text-wine-800 uppercase tracking-wide w-36 min-w-[9rem] max-w-[9rem]">
                            <div className="flex items-center gap-1 min-w-0">
                              <ChevronRight size={14} className="text-wine-500 flex-shrink-0" />
                              <span className="truncate">{settore} <span className="text-wine-500 font-normal">({lista.length})</span></span>
                            </div>
                          </td>
                          {st.mesi.map(function (v, i) {
                            return (
                              <td key={'sm-' + settore + '-' + i} className="px-1 py-1.5 text-center text-xs font-semibold text-wine-800">
                                {v > 0 ? fmtGg(v) : ''}
                              </td>
                            );
                          })}
                          <td className="px-3 py-1.5 text-right text-xs font-bold text-wine-900 bg-wine-100 border-l border-gray-200 whitespace-nowrap">{fmtGg(st.maturate)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-wine-800 whitespace-nowrap">{fmtGg(st.proiezione)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-wine-800 whitespace-nowrap">{st.target > 0 ? fmtGg(st.target) : ''}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-wine-800 whitespace-nowrap">{st.target > 0 ? fmtGg(st.residuo) : ''}</td>
                          <td className="px-3 py-1.5 text-right text-xs text-wine-500">—</td>
                        </>
                      ) : (
                        <td colSpan={18} className="sticky left-0 z-10 bg-wine-50 px-3 py-1.5 text-xs font-semibold text-wine-800 uppercase tracking-wide">
                          <div className="flex items-center gap-1">
                            <ChevronDown size={14} className="text-wine-500 flex-shrink-0" />
                            {settore} <span className="text-wine-500 font-normal">({lista.length})</span>
                          </div>
                        </td>
                      )}
                    </tr>

                    {!chiuso && lista.map(function (r) {
                      var staffId = r.profilo.staff_id;

                      // Cosa mostra la cella "Media/mese":
                      // 'vuoto' = niente da dire, 'raggiunto' = target gia' coperto,
                      // 'numero' = giornate da fare in ciascun mese restante.
                      var statoMedia = 'vuoto';
                      if (r.target !== null && r.residuo !== null && r.residuo <= 0) {
                        statoMedia = 'raggiunto';
                      } else if (r.media !== null && r.residuo !== null && r.residuo > 0) {
                        statoMedia = 'numero';
                      }

                      // Colore della media richiesta
                      var classeMedia = 'px-3 py-2 text-right whitespace-nowrap font-semibold ';
                      if (statoMedia === 'raggiunto') {
                        classeMedia = classeMedia + 'text-emerald-700 bg-emerald-50';
                      } else if (statoMedia === 'vuoto') {
                        classeMedia = classeMedia + 'text-gray-300';
                      } else if (r.impossibile) {
                        classeMedia = classeMedia + 'text-red-700 bg-red-50';
                      } else if (r.media <= 20) {
                        classeMedia = classeMedia + 'text-emerald-700';
                      } else {
                        classeMedia = classeMedia + 'text-amber-700 bg-amber-50';
                      }

                      var valoreTarget = targetEdit[staffId] !== undefined
                        ? targetEdit[staffId]
                        : (r.target === null ? '' : String(r.target));

                      return (
                        <tr key={'r-' + staffId} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="sticky left-0 z-10 bg-white border-r-2 border-b border-gray-200 px-3 py-2 w-36 min-w-[9rem] max-w-[9rem]">
                            <div className="truncate font-medium text-gray-900"
                              title={(r.staff.last_name || '') + ' ' + (r.staff.first_name || '')}>
                              {r.staff.last_name} {r.staff.first_name}
                            </div>
                            {r.chiuso && (
                              <div className="flex items-center gap-1 text-[10px] text-gray-400 italic">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                                non piu&rsquo; in forza
                              </div>
                            )}
                            {!r.chiuso && r.fineUtile < 12 && (
                              <div className="text-[10px] text-gray-400 italic">
                                fino a {MESI_CORTI[r.fineUtile - 1]}
                              </div>
                            )}
                          </td>

                          {r.celle.map(function (c, i) {
                            var classeCella = 'px-1 py-2 text-center whitespace-nowrap border-b border-gray-100 ';
                            if (c.stato === 'vuoto') {
                              classeCella = classeCella + 'text-gray-300';
                            } else if (c.stato === 'prova') {
                              classeCella = classeCella + (includiProva ? 'bg-amber-50 text-amber-800 italic' : 'bg-amber-50 text-amber-400 italic line-through');
                            } else {
                              classeCella = classeCella + 'text-gray-800';
                            }
                            var titolo = c.stato === 'vuoto'
                              ? MESI_LUNGHI[i] + ': nessuna busta caricata'
                              : (c.stato === 'prova'
                                ? MESI_LUNGHI[i] + ': solo busta di prova' + (includiProva ? ' (inclusa nel calcolo)' : ' (esclusa dal calcolo)')
                                : MESI_LUNGHI[i] + ': busta definitiva');
                            return (
                              <td key={'c-' + staffId + '-' + i} className={classeCella} title={titolo}>
                                {c.valore === null ? '·' : fmtGg(c.valore)}
                              </td>
                            );
                          })}

                          <td className="px-3 py-2 text-right font-bold text-gray-900 bg-gray-50 border-l border-b border-gray-200 whitespace-nowrap">
                            {fmtGg(r.maturate)}
                          </td>

                          <td className="px-3 py-2 text-right text-gray-700 border-b border-gray-100 whitespace-nowrap"
                            title={r.chiuso
                              ? 'Contratto chiuso: nessuna proiezione'
                              : (r.ultimoMese > 0
                                ? 'Ultimo mese ' + MESI_LUNGHI[r.ultimoMese - 1] + ' con ' + fmtGg(r.ultimoValore) + ' giornate x ' + r.mesiRestanti + ' mesi restanti'
                                : 'Nessuna busta caricata')}>
                            {r.chiuso || r.ultimoMese === 0 ? '—' : fmtGg(r.proiezione)}
                          </td>

                          <td className="px-2 py-1 text-right bg-wine-50 border-b border-gray-100 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                step="1"
                                disabled={!puoScrivere}
                                value={valoreTarget}
                                placeholder="—"
                                onChange={function (e) { scriviTarget(staffId, e.target.value); }}
                                onBlur={function () { confermaTarget(staffId); }}
                                className="w-16 text-right bg-white border border-gray-200 hover:border-gray-300 focus:border-wine-400 rounded px-1 py-1 focus:outline-none disabled:bg-transparent disabled:border-transparent" />
                              {r.haOverride && puoScrivere && (
                                <button
                                  onClick={function () { salvaTarget(staffId, ''); }}
                                  title={'Torna al suggerimento del profilo' + (r.suggerito === null ? '' : ' (' + fmtGg(r.suggerito) + ')')}
                                  className="text-gray-300 hover:text-wine-700">
                                  <X size={13} />
                                </button>
                              )}
                            </div>
                          </td>

                          <td className={
                            'px-3 py-2 text-right bg-wine-50 border-b border-gray-100 whitespace-nowrap font-medium ' +
                            (r.residuo === null ? 'text-gray-300' : (r.residuo <= 0 ? 'text-emerald-700' : 'text-gray-800'))
                          }>
                            {r.residuo === null ? '—' : fmtGg(r.residuo)}
                          </td>

                          <td className={classeMedia}>
                            {statoMedia === 'vuoto' && '—'}
                            {statoMedia === 'raggiunto' && '✓ raggiunto'}
                            {statoMedia === 'numero' && (
                              <div className="flex items-center justify-end gap-1.5">
                                <span title={'Massimo possibile nei ' + r.mesiRestanti + ' mesi restanti: ' + fmtGg(r.maxRestanti) + ' giornate'}>
                                  {fmtUnDec(r.media)}
                                </span>
                                {r.impossibile && puoScrivere && (
                                  <button
                                    onClick={function () { portaAlMassimo(r); }}
                                    title={'Non raggiungibile: al massimo ' + fmtGg(r.massimoRaggiungibile) + ' giornate. Tocca per usare questo target.'}
                                    className="text-[10px] bg-red-100 hover:bg-red-200 text-red-700 rounded px-1.5 py-0.5 font-semibold whitespace-nowrap">
                                    max {fmtGg(r.massimoRaggiungibile)}
                                  </button>
                                )}
                                {r.impossibile && !puoScrivere && (
                                  <span className="text-[10px] bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-semibold whitespace-nowrap">
                                    max {fmtGg(r.massimoRaggiungibile)}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}

              {/* Riga totali */}
              {settori.length > 0 && (
                <tr className="bg-gray-100 font-bold">
                  <td className="sticky left-0 z-10 bg-gray-100 border-r-2 border-t border-gray-300 px-3 py-2 text-xs uppercase tracking-wide text-gray-700 w-36 min-w-[9rem] max-w-[9rem]">
                    Totali
                  </td>
                  {totGenerale.mesi.map(function (v, i) {
                    return (
                      <td key={'tm-' + i} className="px-1 py-2 text-center text-xs border-t border-gray-300 text-gray-800">
                        {v > 0 ? fmtGg(v) : ''}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right border-t border-l border-gray-300 bg-gray-200 text-gray-900 whitespace-nowrap">{fmtGg(totGenerale.maturate)}</td>
                  <td className="px-3 py-2 text-right border-t border-gray-300 text-gray-800 whitespace-nowrap">{fmtGg(totGenerale.proiezione)}</td>
                  <td className="px-3 py-2 text-right border-t border-gray-300 text-gray-800 whitespace-nowrap">{fmtGg(totGenerale.target)}</td>
                  <td className="px-3 py-2 text-right border-t border-gray-300 text-gray-800 whitespace-nowrap">{fmtGg(totGenerale.residuo)}</td>
                  <td className="px-3 py-2 text-right border-t border-gray-300 text-gray-400">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="h-8" />
    </div>
  );
}
