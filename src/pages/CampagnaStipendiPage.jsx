import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  ArrowRightLeft, ChevronLeft, ChevronRight, CheckCircle2,
  AlertTriangle, Save
} from 'lucide-react';

// ============================================================
// CAMPAGNA -> RIPORTA IN STIPENDI
// Legge i dati gia' importati (stip_ore_campagna), somma per
// operaio/mese ORE e COSTO, li confronta con quanto e' gia' in
// stip_mesi (ore, conteggio_euro) e permette di riportarli con
// DUE interruttori separati (ore / retribuzione) per ogni operaio.
//
// Direzione unica: campagna -> stipendi. La tabella campagna NON
// viene mai modificata. Su stip_mesi si scrive solo dove scegli tu:
// il campo non selezionato viene riscritto col suo valore attuale
// (quindi resta invariato), cosi' non si azzera mai nulla per errore.
// ============================================================

var MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

function fmtEuro(n) {
  if (n === null || n === undefined || n === '' || isNaN(parseFloat(n))) return '—';
  var num = parseFloat(n);
  return num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function fmtOre(n) {
  if (n === null || n === undefined || n === '' || isNaN(parseFloat(n))) return '—';
  return parseFloat(n).toFixed(2).replace('.', ',');
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export default function CampagnaStipendiPage() {

  var oggi = new Date();
  var [anno, setAnno] = useState(oggi.getFullYear());
  var [mese, setMese] = useState(oggi.getMonth() + 1);

  var [loading, setLoading] = useState(true);
  var [rows, setRows] = useState([]);           // righe di confronto
  var [nonAbbinati, setNonAbbinati] = useState([]);
  var [sel, setSel] = useState({});             // staff_id -> { ore:bool, retrib:bool }
  var [saving, setSaving] = useState(false);
  var [msg, setMsg] = useState(null);

  useEffect(function () { carica(); }, [anno, mese]);

  // ----------------------------------------------------------
  // Caricamento e costruzione del confronto
  // ----------------------------------------------------------
  function carica() {
    setLoading(true);
    setMsg(null);

    var pCamp = supabase
      .from('stip_ore_campagna')
      .select('staff_id, operaio_nome, ore, costo')
      .eq('anno', anno).eq('mese', mese);

    var pStaff = supabase
      .from('staff_members')
      .select('id, first_name, last_name');

    var pMesi = supabase
      .from('stip_mesi')
      .select('staff_id, ore, conteggio_euro')
      .eq('anno', anno).eq('mese', mese);

    Promise.all([pCamp, pStaff, pMesi]).then(function (res) {
      var camp = res[0].data || [];
      var staff = res[1].data || [];
      var mesi = res[2].data || [];

      var staffById = {};
      staff.forEach(function (s) { staffById[s.id] = s; });

      var mesiById = {};
      mesi.forEach(function (m) { mesiById[m.staff_id] = m; });

      // Aggrego la campagna per operaio; i non abbinati (staff_id null) a parte.
      var agg = {};
      var nonAbb = {};
      camp.forEach(function (r) {
        if (!r.staff_id) {
          var nm = r.operaio_nome || '(senza nome)';
          if (!nonAbb[nm]) nonAbb[nm] = { nome: nm, ore: 0, costo: 0 };
          nonAbb[nm].ore += toNum(r.ore);
          nonAbb[nm].costo += toNum(r.costo);
          return;
        }
        if (!agg[r.staff_id]) agg[r.staff_id] = { staff_id: r.staff_id, operaio_nome: r.operaio_nome, ore: 0, costo: 0 };
        agg[r.staff_id].ore += toNum(r.ore);
        agg[r.staff_id].costo += toNum(r.costo);
      });

      var built = [];
      for (var id in agg) {
        var a = agg[id];
        var s = staffById[id];
        var nome = s ? ((s.last_name || '') + ' ' + (s.first_name || '')).trim() : (a.operaio_nome || '?');
        var cur = mesiById[id] || null;
        var curOre = (cur && cur.ore !== null && cur.ore !== undefined) ? parseFloat(cur.ore) : null;
        var curEur = (cur && cur.conteggio_euro !== null && cur.conteggio_euro !== undefined) ? parseFloat(cur.conteggio_euro) : null;

        built.push({
          staff_id: id,
          nome: nome,
          campOre: a.ore,
          campEur: a.costo,
          curOre: curOre,
          curEur: curEur,
          oreVuoto: curOre === null,
          oreUguale: curOre !== null && Math.abs(curOre - a.ore) < 0.005,
          eurVuoto: curEur === null,
          eurUguale: curEur !== null && Math.abs(curEur - a.costo) < 0.005
        });
      }
      built.sort(function (x, y) { return x.nome.toLowerCase() < y.nome.toLowerCase() ? -1 : 1; });

      // Default interruttori: ON se il campo e' vuoto, OFF se gia' valorizzato.
      var s0 = {};
      built.forEach(function (b) {
        s0[b.staff_id] = { ore: b.oreVuoto, retrib: b.eurVuoto };
      });

      var na = [];
      for (var k in nonAbb) na.push(nonAbb[k]);
      na.sort(function (x, y) { return x.nome < y.nome ? -1 : 1; });

      setRows(built);
      setSel(s0);
      setNonAbbinati(na);
      setLoading(false);
    });
  }

  // ----------------------------------------------------------
  // Interruttori
  // ----------------------------------------------------------
  function toggle(id, campo) {
    setSel(function (prev) {
      var c = {};
      for (var k in prev) c[k] = { ore: prev[k].ore, retrib: prev[k].retrib };
      if (!c[id]) c[id] = { ore: false, retrib: false };
      c[id][campo] = !c[id][campo];
      return c;
    });
  }

  function attivaColonna(campo, val) {
    setSel(function (prev) {
      var c = {};
      rows.forEach(function (b) {
        var p = prev[b.staff_id] || { ore: false, retrib: false };
        c[b.staff_id] = { ore: p.ore, retrib: p.retrib };
        c[b.staff_id][campo] = val;
      });
      return c;
    });
  }

  // ----------------------------------------------------------
  // Scrittura su stip_mesi
  // Ogni oggetto ha SEMPRE ore + conteggio_euro: il campo non
  // selezionato viene riscritto col valore attuale (invariato),
  // cosi' l'upsert non azzera l'altro campo.
  // ----------------------------------------------------------
  function applica() {
    var payload = [];
    rows.forEach(function (b) {
      var s = sel[b.staff_id] || {};
      if (!s.ore && !s.retrib) return;
      payload.push({
        staff_id: b.staff_id,
        anno: anno,
        mese: mese,
        ore: s.ore ? b.campOre : b.curOre,
        conteggio_euro: s.retrib ? b.campEur : b.curEur
      });
    });

    if (payload.length === 0) {
      setMsg({ tipo: 'err', testo: 'Non hai selezionato nessun dato da riportare.' });
      return;
    }

    setSaving(true);
    setMsg(null);
    supabase
      .from('stip_mesi')
      .upsert(payload, { onConflict: 'staff_id,anno,mese' })
      .then(function (res) {
        setSaving(false);
        if (res.error) {
          setMsg({ tipo: 'err', testo: 'Errore nel salvataggio: ' + res.error.message });
          return;
        }
        setMsg({ tipo: 'ok', testo: 'Riportati ' + payload.length + ' operai su ' + MESI[mese - 1] + ' ' + anno + '.' });
        carica();
      });
  }

  function mesePrec() { setMese(mese <= 1 ? 12 : mese - 1); }
  function meseProx() { setMese(mese >= 12 ? 1 : mese + 1); }
  function annoPrec() { setAnno(anno - 1); }
  function annoProx() { setAnno(anno + 1); }

  // Quanti cambiamenti effettivi sono selezionati
  var nSelezionati = 0;
  rows.forEach(function (b) {
    var s = sel[b.staff_id] || {};
    if (s.ore || s.retrib) nSelezionati++;
  });

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  // Un interruttore-pillola
  function Switch(props) {
    return (
      <button
        onClick={props.onClick}
        className={
          'px-3 py-1 rounded-full text-xs font-semibold transition-colors ' +
          (props.on ? 'bg-wine-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')
        }>
        {props.on ? 'Riporta' : 'Lascia'}
      </button>
    );
  }

  // Blocco di confronto per un campo (ore o retribuzione)
  function Campo(props) {
    // props: label, cur, camp, vuoto, uguale, unit, on, onToggle
    var badge = null;
    if (props.uguale) {
      badge = <span className="text-xs text-gray-400">già uguale</span>;
    } else if (props.vuoto) {
      badge = <span className="text-xs text-emerald-600 font-medium">vuoto</span>;
    } else {
      badge = <span className="text-xs text-amber-600 font-medium">diverso</span>;
    }
    return (
      <div className="flex items-center justify-between gap-3 py-1.5">
        <div className="min-w-0">
          <div className="text-xs text-gray-500">{props.label}</div>
          <div className="text-sm text-gray-800">
            <span className={props.vuoto ? 'text-gray-400' : ''}>
              {props.unit === 'euro' ? '€ ' + fmtEuro(props.cur) : fmtOre(props.cur) + ' h'}
            </span>
            <ArrowRightLeft size={12} className="inline mx-1.5 text-gray-300" />
            <span className="font-semibold text-wine-800">
              {props.unit === 'euro' ? '€ ' + fmtEuro(props.camp) : fmtOre(props.camp) + ' h'}
            </span>
            <span className="ml-2">{badge}</span>
          </div>
        </div>
        <Switch on={props.on} onClick={props.onToggle} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-full">

      {/* Intestazione + periodo */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowRightLeft size={24} className="text-wine-700" />
            Campagna — Riporta in stipendi
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Confronta ore e retribuzione del mese con quanto già inserito negli stipendi e scegli, per ogni operaio, cosa riportare.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1">
            <button onClick={mesePrec} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <div className="px-3 text-sm font-semibold text-gray-900 min-w-[96px] text-center">{MESI[mese - 1]}</div>
            <button onClick={meseProx} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>
          <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1">
            <button onClick={annoPrec} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <div className="px-3 text-sm font-semibold text-gray-900 min-w-[56px] text-center">{anno}</div>
            <button onClick={annoProx} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Esito salvataggio */}
      {msg && (
        <div className={
          'mb-4 p-3 rounded-xl text-sm flex items-center gap-2 ' +
          (msg.tipo === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800')
        }>
          {msg.tipo === 'ok' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {msg.testo}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          Caricamento...
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500 text-sm">
          Nessun dato di campagna importato per {MESI[mese - 1]} {anno}.
          {nonAbbinati.length === 0 && ' Importa prima il mese dalla pagina "Importa".'}
        </div>
      ) : (
        <>
          {/* Azioni rapide + Applica */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1.5">
                Ore:
                <button onClick={function () { attivaColonna('ore', true); }} className="underline hover:text-wine-700">tutte</button>
                <button onClick={function () { attivaColonna('ore', false); }} className="underline hover:text-wine-700">nessuna</button>
              </span>
              <span className="flex items-center gap-1.5">
                Retribuzione:
                <button onClick={function () { attivaColonna('retrib', true); }} className="underline hover:text-wine-700">tutte</button>
                <button onClick={function () { attivaColonna('retrib', false); }} className="underline hover:text-wine-700">nessuna</button>
              </span>
            </div>
            <button
              onClick={applica}
              disabled={saving || nSelezionati === 0}
              className={
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ' +
                (saving || nSelezionati === 0 ? 'bg-wine-300 text-white' : 'bg-wine-700 hover:bg-wine-800 text-white')
              }>
              <Save size={16} />
              {saving ? 'Salvataggio...' : 'Applica ai selezionati' + (nSelezionati ? ' (' + nSelezionati + ')' : '')}
            </button>
          </div>

          {/* Schede operai */}
          <div className="space-y-3">
            {rows.map(function (b) {
              var s = sel[b.staff_id] || { ore: false, retrib: false };
              return (
                <div key={b.staff_id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-base font-semibold text-gray-900 mb-1">{b.nome}</div>
                  <div className="divide-y divide-gray-50">
                    <Campo
                      label="Ore" unit="ore"
                      cur={b.curOre} camp={b.campOre}
                      vuoto={b.oreVuoto} uguale={b.oreUguale}
                      on={s.ore} onToggle={function () { toggle(b.staff_id, 'ore'); }}
                    />
                    <Campo
                      label="Retribuzione" unit="euro"
                      cur={b.curEur} camp={b.campEur}
                      vuoto={b.eurVuoto} uguale={b.eurUguale}
                      on={s.retrib} onToggle={function () { toggle(b.staff_id, 'retrib'); }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Non abbinati */}
          {nonAbbinati.length > 0 && (
            <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
              <div className="flex items-center gap-2 font-semibold mb-1">
                <AlertTriangle size={18} className="text-amber-600" />
                Operai non abbinati a un dipendente ({nonAbbinati.length})
              </div>
              <p className="text-amber-800">
                Questi nomi della campagna non hanno un dipendente collegato, quindi non hanno una riga stipendio dove riportare i dati.
                Sistemali nell'anagrafica Staff e reimporta il mese.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {nonAbbinati.map(function (n) {
                  return (
                    <span key={n.nome} className="inline-block bg-white border border-amber-300 rounded-lg px-2 py-0.5 text-xs">
                      {n.nome} ({fmtOre(n.ore)} h)
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
