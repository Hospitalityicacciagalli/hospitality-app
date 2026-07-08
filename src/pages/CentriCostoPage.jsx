import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

// ─────────────────────────────────────────────────────────────
// CENTRI DI COSTO — dashboard + revisore
// Fonte: spese della cassa nuova (cassa2_movimenti, tipo='spesa').
//  - Dashboard: totali per centro, filtri (periodo/cassa/centro),
//    barre, KPI, export CSV (apre in Excel).
//  - Revisore: tabella modificabile riga per riga per assegnare/
//    correggere il centro; le righe SENZA centro sono in giallo.
// ─────────────────────────────────────────────────────────────

var ID_RECEPTION = 'd375c1de-04b9-490e-ab8f-5f11a6cb969f';
var ID_RISTORANTE = '4805dd45-da57-4442-9a09-a0141804cc9a';

var MESI = ['Anno', 'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

var PAGAMENTI = { contanti: 'Contanti', carta: 'Carta', bonifico: 'Bonifico', assegno: 'Assegno' };

function arrotonda(n) { return Math.round((n || 0) * 100) / 100; }
function formatEuro(n) { return arrotonda(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }); }
function nomeCassa(id) { return id === ID_RISTORANTE ? 'Ristorante' : (id === ID_RECEPTION ? 'Reception' : '—'); }
function due(n) { return n < 10 ? '0' + n : '' + n; }
function ultimoGiorno(anno, mese) { return new Date(anno, mese, 0).getDate(); }
function dataLeggibile(iso) {
  if (!iso) return '';
  var d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ── modale scelta centro per una spesa (revisore) ──
function ModaleAssegnaCentro(props) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Assegna centro</h3>
          <button onClick={props.onChiudi} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4">
          <div className="text-sm text-gray-500 mb-3">
            {dataLeggibile(props.spesa.data)} · {nomeCassa(props.spesa.cassa_id)} · {formatEuro(props.spesa.importo)}
            {props.spesa.da_causale ? ' · ' + props.spesa.da_causale : ''}
          </div>
          <div className="space-y-1">
            <button onClick={function() { props.onScegli(null); }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100">
              Nessuno (rimuovi centro)
            </button>
            {props.centri.map(function(c) {
              var sel = c.id === props.spesa.centro_di_costo_id;
              return (
                <button key={c.id} onClick={function() { props.onScegli(c.id); }}
                  className={'w-full text-left px-3 py-2 rounded-lg text-sm border ' + (sel ? 'border-wine-700 bg-wine-700 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50')}>
                  {c.nome}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CentriCostoPage() {
  var auth = useAuth();
  var puoScrivere = auth.canEdit('centri_costo');

  var oggi = new Date();
  var [anno, setAnno] = useState(oggi.getFullYear());
  var [mese, setMese] = useState(oggi.getMonth() + 1); // 0 = anno intero
  var [cassaFiltro, setCassaFiltro] = useState(''); // '' tutte
  var [centroFiltro, setCentroFiltro] = useState(''); // '' tutti, '__senza__', oppure id
  var [soloSenza, setSoloSenza] = useState(false);

  var [sezione, setSezione] = useState('dashboard');
  var [spese, setSpese] = useState([]);
  var [centri, setCentri] = useState([]);
  var [loading, setLoading] = useState(false);
  var [spesaInModifica, setSpesaInModifica] = useState(null);
  var [msg, setMsg] = useState('');

  useEffect(function() {
    supabase.from('centri_di_costo').select('*').then(function(r) {
      if (r.data) {
        var d = r.data.slice().sort(function(a, b) {
          var oa = a.ordine != null ? a.ordine : 9999, ob = b.ordine != null ? b.ordine : 9999;
          if (oa !== ob) return oa - ob;
          return (a.nome || '') < (b.nome || '') ? -1 : 1;
        });
        setCentri(d);
      }
    });
  }, []);

  useEffect(function() {
    setLoading(true);
    var start, end;
    if (mese === 0) { start = anno + '-01-01'; end = anno + '-12-31'; }
    else { start = anno + '-' + due(mese) + '-01'; end = anno + '-' + due(mese) + '-' + due(ultimoGiorno(anno, mese)); }
    supabase.from('cassa2_movimenti').select('*')
      .eq('tipo', 'spesa').eq('annullato', false)
      .gte('data', start).lte('data', end)
      .order('data', { ascending: true })
      .then(function(r) {
        setLoading(false);
        setSpese(r.data || []);
      });
  }, [anno, mese]);

  function nomeCentro(id) {
    for (var i = 0; i < centri.length; i++) { if (centri[i].id === id) return centri[i].nome; }
    return '—';
  }
  function labelPagamento(v) { return PAGAMENTI[v] || (v || ''); }

  // filtro comune (cassa + centro)
  function passaFiltri(m) {
    if (cassaFiltro && m.cassa_id !== cassaFiltro) return false;
    if (centroFiltro === '__senza__' && m.centro_di_costo_id) return false;
    if (centroFiltro && centroFiltro !== '__senza__' && m.centro_di_costo_id !== centroFiltro) return false;
    return true;
  }

  var speseFiltrate = spese.filter(passaFiltri);

  // aggregazione per centro
  var perCentro = {};
  var totale = 0, senzaTot = 0, senzaCount = 0;
  speseFiltrate.forEach(function(m) {
    totale += m.importo;
    var key = m.centro_di_costo_id || '__senza__';
    if (!perCentro[key]) perCentro[key] = { id: m.centro_di_costo_id, tot: 0, n: 0 };
    perCentro[key].tot += m.importo;
    perCentro[key].n += 1;
    if (!m.centro_di_costo_id) { senzaTot += m.importo; senzaCount += 1; }
  });
  totale = arrotonda(totale);
  var righeAgg = Object.keys(perCentro).map(function(k) {
    var r = perCentro[k];
    return { key: k, nome: k === '__senza__' ? 'Senza centro' : nomeCentro(r.id), tot: arrotonda(r.tot), n: r.n, senza: k === '__senza__' };
  }).sort(function(a, b) { return b.tot - a.tot; });
  var maxTot = 0;
  righeAgg.forEach(function(r) { if (r.tot > maxTot) maxTot = r.tot; });

  function aggiornaCentro(spesa, nuovoId) {
    supabase.from('cassa2_movimenti').update({ centro_di_costo_id: nuovoId }).eq('id', spesa.id).select().then(function(r) {
      if (r.error) { setMsg('Errore: ' + r.error.message); return; }
      setSpese(function(prev) { return prev.map(function(m) { return m.id === spesa.id ? Object.assign({}, m, { centro_di_costo_id: nuovoId }) : m; }); });
      setSpesaInModifica(null);
    });
  }

  function esportaCSV() {
    var head = ['Data', 'Cassa', 'Centro di costo', 'Importo', 'Pagamento', 'Causale', 'Nota'];
    var lines = [head.join(';')];
    speseFiltrate.forEach(function(m) {
      var centro = m.centro_di_costo_id ? nomeCentro(m.centro_di_costo_id) : 'SENZA CENTRO';
      var vals = [m.data, nomeCassa(m.cassa_id), centro, String(arrotonda(m.importo)).replace('.', ','), labelPagamento(m.pagamento), (m.da_causale || ''), (m.nota || '')];
      vals = vals.map(function(v) {
        v = (v == null ? '' : String(v));
        if (/[";\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
        return v;
      });
      lines.push(vals.join(';'));
    });
    var csv = '\ufeff' + lines.join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'spese_centri_' + anno + (mese ? ('_' + due(mese)) : '') + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // lista per il revisore (con eventuale "solo senza centro")
  var speseRevisore = speseFiltrate.filter(function(m) { return soloSenza ? !m.centro_di_costo_id : true; });

  var centriAttivi = centri.filter(function(c) { return c.attivo !== false; });

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">

      <h1 className="text-xl font-semibold text-gray-900 mb-4">Centri di costo</h1>

      {/* periodo */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={function() { setAnno(anno - 1); }} className="px-2 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">&lsaquo;</button>
          <span className="text-lg font-semibold text-gray-800 w-16 text-center">{anno}</span>
          <button onClick={function() { setAnno(anno + 1); }} className="px-2 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">&rsaquo;</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MESI.map(function(label, idx) {
            var sel = mese === idx;
            return (
              <button key={idx} onClick={function() { setMese(idx); }}
                className={'px-3 py-1.5 rounded-lg text-sm border ' + (sel ? 'border-wine-700 bg-wine-700 text-white' : 'border-gray-300 bg-white text-gray-600 hover:border-wine-400')}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* filtri cassa + centro */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3 space-y-3">
        <div>
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Cassa</div>
          <div className="flex flex-wrap gap-2">
            {[{ v: '', l: 'Tutte' }, { v: ID_RECEPTION, l: 'Reception' }, { v: ID_RISTORANTE, l: 'Ristorante' }].map(function(o) {
              var sel = cassaFiltro === o.v;
              return <button key={o.l} onClick={function() { setCassaFiltro(o.v); }}
                className={'px-3 py-1.5 rounded-lg text-sm border ' + (sel ? 'border-wine-700 bg-wine-700 text-white' : 'border-gray-300 bg-white text-gray-600 hover:border-wine-400')}>{o.l}</button>;
            })}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Centro</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={function() { setCentroFiltro(''); }}
              className={'px-3 py-1.5 rounded-lg text-sm border ' + (centroFiltro === '' ? 'border-wine-700 bg-wine-700 text-white' : 'border-gray-300 bg-white text-gray-600 hover:border-wine-400')}>Tutti</button>
            <button onClick={function() { setCentroFiltro('__senza__'); }}
              className={'px-3 py-1.5 rounded-lg text-sm border ' + (centroFiltro === '__senza__' ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100')}>Senza centro</button>
            {centriAttivi.map(function(c) {
              var sel = centroFiltro === c.id;
              return <button key={c.id} onClick={function() { setCentroFiltro(c.id); }}
                className={'px-3 py-1.5 rounded-lg text-sm border ' + (sel ? 'border-wine-700 bg-wine-700 text-white' : 'border-gray-300 bg-white text-gray-600 hover:border-wine-400')}>{c.nome}</button>;
            })}
          </div>
        </div>
      </div>

      {msg && (
        <div className={'mb-3 p-3 rounded-lg text-sm ' + (msg.indexOf('Errore') === 0 ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800')}>{msg}</div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Spese totali</div>
          <div className="text-2xl font-semibold text-red-600">{formatEuro(totale)}</div>
          <div className="text-xs text-gray-400 mt-1">{speseFiltrate.length} movimenti</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Centri usati</div>
          <div className="text-2xl font-semibold text-gray-900">{righeAgg.filter(function(r) { return !r.senza; }).length}</div>
        </div>
        <div className={'rounded-xl p-4 border ' + (senzaCount > 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white')}>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Senza centro</div>
          <div className={'text-2xl font-semibold ' + (senzaCount > 0 ? 'text-amber-700' : 'text-gray-900')}>{formatEuro(senzaTot)}</div>
          <div className="text-xs text-gray-400 mt-1">{senzaCount} da assegnare</div>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {[{ id: 'dashboard', label: 'Dashboard' }, { id: 'revisore', label: 'Revisore' }].map(function(t) {
          var sel = t.id === sezione;
          return <button key={t.id} onClick={function() { setSezione(t.id); }}
            className={'px-4 py-2 text-sm font-medium border-b-2 ' + (sel ? 'border-wine-700 text-wine-800' : 'border-transparent text-gray-500 hover:text-gray-700')}>{t.label}</button>;
        })}
      </div>

      {/* ─────────── DASHBOARD ─────────── */}
      {sezione === 'dashboard' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-500">{loading ? 'Caricamento...' : 'Ripartizione per centro'}</div>
            <button onClick={esportaCSV} className="px-4 py-2 border-2 border-wine-700 text-wine-700 hover:bg-wine-50 rounded-lg text-sm font-medium">
              ⬇ Esporta CSV (Excel)
            </button>
          </div>

          {righeAgg.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-400 text-sm">Nessuna spesa nel periodo/filtri scelti.</div>
          ) : (
            <div className="space-y-2">
              {righeAgg.map(function(r) {
                var pct = maxTot > 0 ? Math.round(r.tot / maxTot * 100) : 0;
                var pctTot = totale > 0 ? Math.round(r.tot / totale * 100) : 0;
                return (
                  <div key={r.key} className={'rounded-lg border p-3 ' + (r.senza ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white')}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={'text-sm font-medium ' + (r.senza ? 'text-amber-800' : 'text-gray-800')}>{r.nome}</span>
                      <span className="text-sm font-semibold text-gray-900">{formatEuro(r.tot)} <span className="text-xs text-gray-400 font-normal">· {pctTot}% · {r.n} mov.</span></span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={'h-full rounded-full ' + (r.senza ? 'bg-amber-400' : 'bg-wine-600')} style={{ width: pct + '%' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────── REVISORE ─────────── */}
      {sezione === 'revisore' && (
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={soloSenza} onChange={function(e) { setSoloSenza(e.target.checked); }} className="w-4 h-4 accent-amber-600" />
              Mostra solo le spese senza centro
            </label>
            <button onClick={esportaCSV} className="px-4 py-2 border-2 border-wine-700 text-wine-700 hover:bg-wine-50 rounded-lg text-sm font-medium">
              ⬇ Esporta CSV (Excel)
            </button>
          </div>

          {!puoScrivere && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">Sola consultazione: non hai il permesso di modificare i centri.</div>
          )}

          {speseRevisore.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-400 text-sm">
              {soloSenza ? 'Tutte le spese hanno un centro. 👍' : 'Nessuna spesa nel periodo/filtri scelti.'}
            </div>
          ) : (
            <div className="space-y-2">
              {speseRevisore.map(function(m) {
                var manca = !m.centro_di_costo_id;
                return (
                  <div key={m.id} className={'flex items-center gap-3 p-3 rounded-lg border ' + (manca ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white')}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">
                        {dataLeggibile(m.data)} · {nomeCassa(m.cassa_id)} · {formatEuro(m.importo)}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {labelPagamento(m.pagamento)}{m.da_causale ? ' · ' + m.da_causale : ''}{m.nota ? ' · ' + m.nota : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={'text-sm px-2 py-1 rounded ' + (manca ? 'bg-amber-200 text-amber-800' : 'bg-gray-100 text-gray-700')}>
                        {manca ? 'senza centro' : nomeCentro(m.centro_di_costo_id)}
                      </span>
                      {puoScrivere && (
                        <button onClick={function() { setSpesaInModifica(m); }}
                          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">Cambia</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {spesaInModifica && (
        <ModaleAssegnaCentro
          spesa={spesaInModifica}
          centri={centriAttivi}
          onScegli={function(id) { aggiornaCentro(spesaInModifica, id); }}
          onChiudi={function() { setSpesaInModifica(null); }} />
      )}

    </div>
  );
}
