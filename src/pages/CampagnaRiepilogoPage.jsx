import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Sprout, ChevronLeft, ChevronRight, Users, Clock, Euro, Tag
} from 'lucide-react';

// ============================================================
// CAMPAGNA -> RIEPILOGO (dashboard)
// Legge stip_ore_campagna (popolata dall'import) e mostra i costi
// per operaio e per ambito, per mese selezionato o per anno intero.
// Versione 1: KPI + due tabelle con barre proporzionali.
// (Diagrammi, filtri avanzati e viste salvabili: prossimo passo.)
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

export default function CampagnaRiepilogoPage() {

  var oggi = new Date();
  var [anno, setAnno] = useState(oggi.getFullYear());
  var [vista, setVista] = useState('anno');   // 'mese' | 'anno'
  var [mese, setMese] = useState(oggi.getMonth() + 1);

  var [righe, setRighe] = useState([]);       // righe grezze dell'anno
  var [loading, setLoading] = useState(true);

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
  // Aggregazioni (filtrate per mese se vista = 'mese')
  // ----------------------------------------------------------
  var righeFiltrate = righe.filter(function (r) {
    return vista === 'anno' ? true : r.mese === mese;
  });

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

  function annoPrec() { setAnno(anno - 1); }
  function annoProx() { setAnno(anno + 1); }
  function mesePrec() { setMese(mese <= 1 ? 12 : mese - 1); }
  function meseProx() { setMese(mese >= 12 ? 1 : mese + 1); }

  // ----------------------------------------------------------
  // Render
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

  return (
    <div className="p-4 sm:p-6 max-w-full">

      {/* Intestazione + controlli periodo */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sprout size={26} className="text-wine-700" />
            Campagna — Riepilogo
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Ore e costi degli operai della campagna, per operaio e per ambito.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle Mese / Anno */}
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

          {/* Selettore mese, solo in vista mese */}
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

          {/* Selettore anno */}
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

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          Caricamento...
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <KpiCard icon={<Euro size={14} />} label="Costo totale" value={'€ ' + fmtEuro(totCosto)} />
            <KpiCard icon={<Clock size={14} />} label="Ore" value={fmtNum(totOre)} />
            <KpiCard icon={<Clock size={14} />} label="Giornate" value={fmtNum(totGiornate)} />
            <KpiCard icon={<Users size={14} />} label="Operai" value={operai.length} />
          </div>

          {/* Tabelle */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Tabella
              titolo="Per operaio"
              icon={<Users size={16} className="text-wine-700" />}
              righe={operai}
              max={maxCostoOperaio}
            />
            <Tabella
              titolo="Per ambito"
              icon={<Tag size={16} className="text-wine-700" />}
              righe={ambiti}
              max={maxCostoAmbito}
            />
          </div>
        </>
      )}

    </div>
  );
}
