import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Sprout, ChevronLeft, ChevronRight, Users, Clock, Euro, Tag,
  Filter, Bookmark, Save, X, Trash2, TrendingUp, Grid3x3
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line
} from 'recharts';

// ============================================================
// CAMPAGNA -> RIEPILOGO (dashboard ricca)
// Legge stip_ore_campagna (popolata dall'import) e mostra:
//   - KPI di sintesi
//   - filtri per operaio e per ambito (liste tappabili, no <select>)
//   - grafici: costi per ambito (ciambella), andamento mese per mese
//     (linea), confronto operai (barre), incrocio operaio x ambito (heatmap)
//   - viste salvate CONDIVISE (tabella campagna_viste): nome + filtri +
//     grafici scelti. Comuni a tutti: chiunque crea, usa, cancella.
//   - tabelle di dettaglio per operaio e per ambito
// Grafici con recharts. Colori wine-*.
// ============================================================

var MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
var MESI_BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

// Palette: sfumature wine + toni caldi "da campagna" (oro/terra),
// cosi' anche con molti ambiti le fette restano distinguibili.
var PALETTE = [
  '#7a1c3d', '#cc2d5c', '#ec7896', '#ab1f4a', '#df4b74', '#f4a9ba',
  '#8f1d42', '#b8860b', '#d4a017', '#9a6a4f', '#c98a6a', '#7d5a5a',
  '#a67c7c', '#5c3d3d', '#e0b0b0', '#caa15a'
];
var WINE_MAIN = '#cc2d5c';
var WINE_DARK = '#ab1f4a';

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

function kFmt(v) {
  if (v >= 1000) return '€' + Math.round(v / 1000) + 'k';
  return '€' + Math.round(v);
}

// Colore cella heatmap in base all'intensita' (0..1).
function cellColor(ratio) {
  if (!ratio || ratio <= 0) return '#f7f7f7';
  var alpha = 0.14 + ratio * 0.86;
  return 'rgba(204, 45, 92, ' + alpha.toFixed(3) + ')';
}

export default function CampagnaRiepilogoPage() {

  var oggi = new Date();
  var [anno, setAnno] = useState(oggi.getFullYear());
  var [vista, setVista] = useState('anno');   // 'mese' | 'anno'
  var [mese, setMese] = useState(oggi.getMonth() + 1);

  var [righe, setRighe] = useState([]);       // righe grezze dell'anno
  var [loading, setLoading] = useState(true);

  // Filtri (array vuoto = tutti, nessun filtro applicato)
  var [operaiSel, setOperaiSel] = useState([]);
  var [ambitiSel, setAmbitiSel] = useState([]);
  var [filtroAperto, setFiltroAperto] = useState(null); // 'operai' | 'ambiti' | 'viste' | null

  // Quali grafici mostrare
  var [grafici, setGrafici] = useState({ ambito: true, andamento: true, operai: true, heatmap: true });

  // Viste salvate condivise
  var [viste, setViste] = useState([]);
  var [showSalva, setShowSalva] = useState(false);
  var [nomeVista, setNomeVista] = useState('');
  var [salvando, setSalvando] = useState(false);

  // ----------------------------------------------------------
  // Caricamento righe dell'anno selezionato
  // ----------------------------------------------------------
  useEffect(function () {
    setLoading(true);
    supabase
      .from('stip_ore_campagna')
      .select('operaio_nome, staff_id, ore, costo, ambito, mese')
      .eq('anno', anno)
      .then(function (res) {
        setRighe(res.data || []);
        setLoading(false);
      });
  }, [anno]);

  // ----------------------------------------------------------
  // Caricamento viste salvate
  // ----------------------------------------------------------
  function caricaViste() {
    supabase
      .from('campagna_viste')
      .select('*')
      .order('nome')
      .then(function (res) {
        setViste(res.data || []);
      });
  }
  useEffect(caricaViste, []);

  // ----------------------------------------------------------
  // Elenchi distinti per i filtri (da tutte le righe dell'anno)
  // ----------------------------------------------------------
  var setOp = {};
  var setAm = {};
  righe.forEach(function (r) {
    setOp[r.operaio_nome || '(senza nome)'] = true;
    setAm[r.ambito || 'Non Specificato'] = true;
  });
  var tuttiOperai = Object.keys(setOp).sort();
  var tuttiAmbiti = Object.keys(setAm).sort();

  // ----------------------------------------------------------
  // Predicati filtri
  // ----------------------------------------------------------
  function passaFiltri(r) {
    if (operaiSel.length > 0 && operaiSel.indexOf(r.operaio_nome || '(senza nome)') === -1) return false;
    if (ambitiSel.length > 0 && ambitiSel.indexOf(r.ambito || 'Non Specificato') === -1) return false;
    return true;
  }

  // Righe filtrate per operaio/ambito (tutto l'anno) -> usato dall'andamento
  var righeAnno = righe.filter(passaFiltri);
  // Ulteriore filtro per mese se vista = 'mese' -> usato da KPI/pie/barre/heatmap/tabelle
  var righeFiltrate = righeAnno.filter(function (r) {
    return vista === 'anno' ? true : r.mese === mese;
  });

  // ----------------------------------------------------------
  // Aggregazioni principali
  // ----------------------------------------------------------
  var totOre = 0, totCosto = 0;
  var perOperaio = {};
  var perAmbito = {};

  righeFiltrate.forEach(function (r) {
    var ore = parseFloat(r.ore) || 0;
    var costo = parseFloat(r.costo) || 0;
    totOre += ore;
    totCosto += costo;

    var op = r.operaio_nome || '(senza nome)';
    if (!perOperaio[op]) perOperaio[op] = { nome: op, ore: 0, costo: 0 };
    perOperaio[op].ore += ore;
    perOperaio[op].costo += costo;

    var am = r.ambito || 'Non Specificato';
    if (!perAmbito[am]) perAmbito[am] = { nome: am, ore: 0, costo: 0 };
    perAmbito[am].ore += ore;
    perAmbito[am].costo += costo;
  });

  function toSortedArray(map) {
    var arr = [];
    for (var k in map) arr.push(map[k]);
    arr.sort(function (a, b) { return b.costo - a.costo; });
    return arr;
  }

  var operai = toSortedArray(perOperaio);
  var ambiti = toSortedArray(perAmbito);
  var maxCostoOperaio = operai.length ? operai[0].costo : 0;
  var maxCostoAmbito = ambiti.length ? ambiti[0].costo : 0;
  var totGiornate = totOre / 8;
  var euroOra = totOre > 0 ? totCosto / totOre : 0;

  // ----------------------------------------------------------
  // Dati per i grafici recharts
  // ----------------------------------------------------------
  var pieAmbiti = ambiti.map(function (a) { return { name: a.nome, value: Math.round(a.costo) }; });
  var barOperai = operai.slice(0, 15).map(function (o) { return { name: o.nome, costo: Math.round(o.costo) }; });

  // Andamento mensile (tutto l'anno, filtri operaio/ambito applicati)
  var buckets = [];
  for (var m = 1; m <= 12; m++) buckets.push({ mese: MESI_BREVI[m - 1], costo: 0, ore: 0 });
  righeAnno.forEach(function (r) {
    var idx = (r.mese || 1) - 1;
    if (idx >= 0 && idx < 12) {
      buckets[idx].costo += parseFloat(r.costo) || 0;
      buckets[idx].ore += parseFloat(r.ore) || 0;
    }
  });
  var andamento = buckets.map(function (b) { return { mese: b.mese, costo: Math.round(b.costo) }; });

  // Heatmap operaio x ambito
  var perCella = {};
  var opCosto = {};
  var amCosto = {};
  righeFiltrate.forEach(function (r) {
    var op = r.operaio_nome || '(senza nome)';
    var am = r.ambito || 'Non Specificato';
    var key = op + '|||' + am;
    var c = parseFloat(r.costo) || 0;
    perCella[key] = (perCella[key] || 0) + c;
    opCosto[op] = (opCosto[op] || 0) + c;
    amCosto[am] = (amCosto[am] || 0) + c;
  });
  var heatOperai = Object.keys(opCosto).sort(function (a, b) { return opCosto[b] - opCosto[a]; });
  var heatAmbiti = Object.keys(amCosto).sort(function (a, b) { return amCosto[b] - amCosto[a]; });
  var maxCella = 0;
  for (var kk in perCella) { if (perCella[kk] > maxCella) maxCella = perCella[kk]; }

  // ----------------------------------------------------------
  // Handlers periodo / filtri / viste
  // ----------------------------------------------------------
  function annoPrec() { setAnno(anno - 1); }
  function annoProx() { setAnno(anno + 1); }
  function mesePrec() { setMese(mese <= 1 ? 12 : mese - 1); }
  function meseProx() { setMese(mese >= 12 ? 1 : mese + 1); }

  function toggleOperaio(nome) {
    setOperaiSel(function (prev) {
      var i = prev.indexOf(nome);
      if (i === -1) return prev.concat([nome]);
      var out = prev.slice(); out.splice(i, 1); return out;
    });
  }
  function toggleAmbito(nome) {
    setAmbitiSel(function (prev) {
      var i = prev.indexOf(nome);
      if (i === -1) return prev.concat([nome]);
      var out = prev.slice(); out.splice(i, 1); return out;
    });
  }
  function toggleGrafico(k) {
    setGrafici(function (prev) {
      var u = {}; for (var x in prev) { u[x] = prev[x]; }
      u[k] = !prev[k];
      return u;
    });
  }
  function apriFiltro(nome) {
    setFiltroAperto(function (prev) { return prev === nome ? null : nome; });
  }

  function salvaVista() {
    var nome = nomeVista.trim();
    if (!nome) return;
    setSalvando(true);
    var config = {
      vista: vista,
      mese: mese,
      operai: operaiSel,
      ambiti: ambitiSel,
      grafici: grafici
    };
    supabase
      .from('campagna_viste')
      .insert({ nome: nome, configurazione: config })
      .then(function (res) {
        setSalvando(false);
        if (!res.error) {
          setShowSalva(false);
          setNomeVista('');
          caricaViste();
        }
      });
  }

  function applicaVista(v) {
    var c = v.configurazione || {};
    if (c.vista) setVista(c.vista);
    if (c.mese) setMese(c.mese);
    setOperaiSel(Array.isArray(c.operai) ? c.operai : []);
    setAmbitiSel(Array.isArray(c.ambiti) ? c.ambiti : []);
    if (c.grafici) {
      setGrafici({
        ambito: c.grafici.ambito !== false,
        andamento: c.grafici.andamento !== false,
        operai: c.grafici.operai !== false,
        heatmap: c.grafici.heatmap !== false
      });
    }
    setFiltroAperto(null);
  }

  function eliminaVista(v) {
    supabase.from('campagna_viste').delete().eq('id', v.id).then(function () { caricaViste(); });
  }

  var etichettaPeriodo = vista === 'anno'
    ? ('gen–dic ' + anno)
    : (MESI[mese - 1] + ' ' + anno);

  // ----------------------------------------------------------
  // Sotto-componenti
  // ----------------------------------------------------------
  function KpiCard(props) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
          {props.icon}
          {props.label}
        </div>
        <div className="text-2xl font-bold text-gray-900 mt-1">{props.value}</div>
      </div>
    );
  }

  function Tabella(props) {
    var righeT = props.righe;
    var maxC = props.max;
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          {props.icon}
          <h2 className="text-sm font-semibold text-gray-900">{props.titolo}</h2>
        </div>
        {righeT.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-400">Nessun dato nel periodo.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {righeT.map(function (r) {
              var pct = maxC > 0 ? Math.round(r.costo / maxC * 100) : 0;
              return (
                <div key={r.nome} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-sm font-medium text-gray-800 truncate">{r.nome}</span>
                    <span className="text-sm font-semibold text-gray-900 flex-shrink-0">€ {fmtEuro(r.costo)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-wine-500 rounded-full" style={{ width: pct + '%' }} />
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 w-28 text-right">
                      {fmtNum(r.ore)} ore · {fmtNum(r.ore / 8)} gg
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function CardGrafico(props) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          {props.icon}
          <h2 className="text-sm font-semibold text-gray-900">{props.titolo}</h2>
        </div>
        {props.children}
      </div>
    );
  }

  var haDati = righeFiltrate.length > 0;

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  return (
    <div className="p-4 sm:p-6 max-w-full">

      {/* Intestazione + controlli periodo */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sprout size={26} className="text-wine-700" />
            Campagna — Dashboard
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Ore e costi degli operai della campagna. Filtra, confronta, salva le tue viste.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1">
            <button
              onClick={function () { setVista('mese'); }}
              className={'px-3 py-1.5 text-sm rounded-lg font-medium ' + (vista === 'mese' ? 'bg-wine-700 text-white' : 'text-gray-600 hover:bg-gray-100')}>
              Mese
            </button>
            <button
              onClick={function () { setVista('anno'); }}
              className={'px-3 py-1.5 text-sm rounded-lg font-medium ' + (vista === 'anno' ? 'bg-wine-700 text-white' : 'text-gray-600 hover:bg-gray-100')}>
              Anno
            </button>
          </div>

          {vista === 'mese' && (
            <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1">
              <button onClick={mesePrec} className="p-2 hover:bg-gray-100 rounded-lg">
                <ChevronLeft size={18} className="text-gray-600" />
              </button>
              <div className="px-3 text-sm font-semibold text-gray-900 min-w-[96px] text-center">
                {MESI[mese - 1]}
              </div>
              <button onClick={meseProx} className="p-2 hover:bg-gray-100 rounded-lg">
                <ChevronRight size={18} className="text-gray-600" />
              </button>
            </div>
          )}

          <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1">
            <button onClick={annoPrec} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <div className="px-3 text-sm font-semibold text-gray-900 min-w-[56px] text-center">
              {anno}
            </div>
            <button onClick={annoProx} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Barra filtri + viste salvate */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1">
              <Filter size={13} /> Filtri
            </span>
            <button
              onClick={function () { apriFiltro('operai'); }}
              className={'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ' + (filtroAperto === 'operai' ? 'bg-wine-700 text-white' : 'bg-wine-50 text-wine-800 hover:bg-wine-100')}>
              <Users size={13} />
              Operai · {operaiSel.length === 0 ? 'tutti' : operaiSel.length}
            </button>
            <button
              onClick={function () { apriFiltro('ambiti'); }}
              className={'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ' + (filtroAperto === 'ambiti' ? 'bg-wine-700 text-white' : 'bg-wine-50 text-wine-800 hover:bg-wine-100')}>
              <Tag size={13} />
              Ambiti · {ambitiSel.length === 0 ? 'tutti' : ambitiSel.length}
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-gray-500 bg-gray-50">
              {etichettaPeriodo}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={function () { apriFiltro('viste'); }}
              className={'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border ' + (filtroAperto === 'viste' ? 'bg-gray-100 border-gray-300 text-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
              <Bookmark size={15} />
              Viste salvate
            </button>
            <button
              onClick={function () { setNomeVista(''); setShowSalva(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-wine-700 text-white hover:bg-wine-800">
              <Save size={15} />
              Salva vista
            </button>
          </div>
        </div>

        {/* Pannello filtro operai */}
        {filtroAperto === 'operai' && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500">Scegli uno o più operai (nessuno = tutti)</span>
              {operaiSel.length > 0 && (
                <button onClick={function () { setOperaiSel([]); }} className="text-xs text-wine-700 hover:underline">Azzera</button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {tuttiOperai.map(function (nome) {
                var on = operaiSel.indexOf(nome) !== -1;
                return (
                  <button
                    key={nome}
                    onClick={function () { toggleOperaio(nome); }}
                    className={'rounded-full px-3 py-1.5 text-xs font-medium border ' + (on ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')}>
                    {nome}
                  </button>
                );
              })}
              {tuttiOperai.length === 0 && <span className="text-xs text-gray-400">Nessun operaio nell'anno selezionato.</span>}
            </div>
          </div>
        )}

        {/* Pannello filtro ambiti */}
        {filtroAperto === 'ambiti' && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500">Scegli uno o più ambiti (nessuno = tutti)</span>
              {ambitiSel.length > 0 && (
                <button onClick={function () { setAmbitiSel([]); }} className="text-xs text-wine-700 hover:underline">Azzera</button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {tuttiAmbiti.map(function (nome) {
                var on = ambitiSel.indexOf(nome) !== -1;
                return (
                  <button
                    key={nome}
                    onClick={function () { toggleAmbito(nome); }}
                    className={'rounded-full px-3 py-1.5 text-xs font-medium border ' + (on ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')}>
                    {nome}
                  </button>
                );
              })}
              {tuttiAmbiti.length === 0 && <span className="text-xs text-gray-400">Nessun ambito nell'anno selezionato.</span>}
            </div>
          </div>
        )}

        {/* Pannello viste salvate */}
        {filtroAperto === 'viste' && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs font-medium text-gray-500">Viste salvate (comuni a tutti)</span>
            <div className="mt-2 space-y-1">
              {viste.length === 0 && (
                <div className="text-xs text-gray-400 py-2">Nessuna vista salvata. Imposta filtri e grafici, poi premi "Salva vista".</div>
              )}
              {viste.map(function (v) {
                return (
                  <div key={v.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <button onClick={function () { applicaVista(v); }} className="flex-1 text-left text-sm font-medium text-gray-800 hover:text-wine-700 truncate">
                      {v.nome}
                    </button>
                    <button onClick={function () { applicaVista(v); }} className="text-xs text-wine-700 font-medium hover:underline flex-shrink-0">Apri</button>
                    <button onClick={function () { eliminaVista(v); }} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          Caricamento...
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <KpiCard icon={<Euro size={14} />} label="Costo totale" value={'€ ' + fmtEuro(totCosto)} />
            <KpiCard icon={<Clock size={14} />} label="Ore" value={fmtNum(totOre)} />
            <KpiCard icon={<Clock size={14} />} label="Giornate" value={fmtNum(totGiornate)} />
            <KpiCard icon={<Users size={14} />} label="Operai" value={operai.length} />
            <KpiCard icon={<Euro size={14} />} label="€ / ora" value={fmtNum(euroOra)} />
          </div>

          {/* Interruttori grafici */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Grafici</span>
            {[
              { k: 'ambito', l: 'Per ambito' },
              { k: 'andamento', l: 'Andamento' },
              { k: 'operai', l: 'Operai' },
              { k: 'heatmap', l: 'Operaio × ambito' }
            ].map(function (g) {
              var on = grafici[g.k];
              return (
                <button
                  key={g.k}
                  onClick={function () { toggleGrafico(g.k); }}
                  className={'rounded-full px-3 py-1 text-xs font-medium border ' + (on ? 'bg-wine-100 text-wine-800 border-wine-200' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50')}>
                  {g.l}
                </button>
              );
            })}
          </div>

          {!haDati && (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm mb-4">
              Nessun dato per il periodo e i filtri selezionati.
            </div>
          )}

          {/* Grafici */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

            {grafici.ambito && haDati && (
              <CardGrafico titolo="Costi per ambito" icon={<Tag size={16} className="text-wine-700" />}>
                <div className="flex items-center gap-4 flex-wrap">
                  <div style={{ width: 190, height: 190 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieAmbiti} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2}>
                          {pieAmbiti.map(function (e, i) { return <Cell key={i} fill={PALETTE[i % PALETTE.length]} />; })}
                        </Pie>
                        <Tooltip formatter={function (v) { return '€ ' + fmtEuro(v); }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 min-w-[140px] text-xs space-y-1.5">
                    {ambiti.slice(0, 8).map(function (a, i) {
                      var pct = totCosto > 0 ? Math.round(a.costo / totCosto * 100) : 0;
                      return (
                        <div key={a.nome} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 truncate">
                            <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                            <span className="truncate text-gray-700">{a.nome}</span>
                          </span>
                          <span className="text-gray-500 flex-shrink-0">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardGrafico>
            )}

            {grafici.andamento && (
              <CardGrafico titolo="Andamento mese per mese" icon={<TrendingUp size={16} className="text-wine-700" />}>
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={andamento} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="mese" fontSize={11} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                      <YAxis tickFormatter={kFmt} fontSize={11} width={46} tickLine={false} axisLine={false} />
                      <Tooltip formatter={function (v) { return '€ ' + fmtEuro(v); }} />
                      <Line type="monotone" dataKey="costo" name="Costo" stroke={WINE_DARK} strokeWidth={2.5} dot={{ r: 3, fill: WINE_DARK }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardGrafico>
            )}

            {grafici.operai && haDati && (
              <CardGrafico titolo="Confronto operai" icon={<Users size={16} className="text-wine-700" />}>
                <div style={{ width: '100%', height: Math.max(180, barOperai.length * 38 + 30) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barOperai} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                      <CartesianGrid horizontal={false} stroke="#f0f0f0" />
                      <XAxis type="number" tickFormatter={kFmt} fontSize={11} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                      <YAxis type="category" dataKey="name" width={96} fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip formatter={function (v) { return '€ ' + fmtEuro(v); }} />
                      <Bar dataKey="costo" name="Costo" fill={WINE_MAIN} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardGrafico>
            )}

            {grafici.heatmap && haDati && (
              <CardGrafico titolo="Incrocio operaio × ambito" icon={<Grid3x3 size={16} className="text-wine-700" />}>
                <p className="text-xs text-gray-400 -mt-2 mb-3">Intensità = costo. Passa il dito su una cella per il valore.</p>
                <div className="overflow-x-auto">
                  <table className="border-separate" style={{ borderSpacing: '3px' }}>
                    <thead>
                      <tr>
                        <th className="text-left"></th>
                        {heatAmbiti.map(function (am) {
                          return (
                            <th key={am} className="text-[10px] font-medium text-gray-500 align-bottom px-1" style={{ minWidth: 34 }}>
                              <div className="truncate max-w-[52px]" title={am}>{am}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {heatOperai.map(function (op) {
                        return (
                          <tr key={op}>
                            <td className="text-[11px] text-gray-600 pr-2 whitespace-nowrap max-w-[90px] truncate" title={op}>{op}</td>
                            {heatAmbiti.map(function (am) {
                              var val = perCella[op + '|||' + am] || 0;
                              var ratio = maxCella > 0 ? val / maxCella : 0;
                              return (
                                <td key={am} style={{ padding: 0 }}>
                                  <div
                                    title={op + ' · ' + am + ' · € ' + fmtEuro(val)}
                                    className="rounded"
                                    style={{ width: 34, height: 26, background: cellColor(ratio) }}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardGrafico>
            )}

          </div>

          {/* Tabelle dettaglio */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Tabella
              titolo="Dettaglio per operaio"
              icon={<Users size={16} className="text-wine-700" />}
              righe={operai}
              max={maxCostoOperaio}
            />
            <Tabella
              titolo="Dettaglio per ambito"
              icon={<Tag size={16} className="text-wine-700" />}
              righe={ambiti}
              max={maxCostoAmbito}
            />
          </div>
        </>
      )}

      {/* Modale salva vista */}
      {showSalva && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Salva vista</h2>
              <button onClick={function () { setShowSalva(false); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                Salvo gli attuali filtri e i grafici scelti con un nome. La vista sarà disponibile a tutti.
              </p>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nome della vista</label>
              <input
                type="text"
                value={nomeVista}
                onChange={function (e) { setNomeVista(e.target.value); }}
                placeholder="Es. Solo Vigna — anno"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
              />
              <div className="flex gap-3 mt-5">
                <button
                  onClick={function () { setShowSalva(false); }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  Annulla
                </button>
                <button
                  onClick={salvaVista}
                  disabled={salvando || !nomeVista.trim()}
                  className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  {salvando ? 'Salvo...' : 'Salva'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}