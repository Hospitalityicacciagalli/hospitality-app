import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────
// CASSAFORTE — pagina dedicata, sotto permesso 'cassaforte'.
// Il saldo si CALCOLA dai giri (versa/preleva) registrati dalle casse,
// cosi' se un giro viene annullato il saldo si corregge da solo.
// Sola lettura: i versamenti/prelievi si fanno con un "Giro" dalla cassa.
// ─────────────────────────────────────────────────────────────

var ID_RECEPTION = 'd375c1de-04b9-490e-ab8f-5f11a6cb969f';
var ID_RISTORANTE = '4805dd45-da57-4442-9a09-a0141804cc9a';

function arrotonda(n) { return Math.round((n || 0) * 100) / 100; }
function formatEuro(n) { return arrotonda(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }); }
function nomeCassa(id) { return id === ID_RISTORANTE ? 'Ristorante' : (id === ID_RECEPTION ? 'Reception' : '—'); }
function dataLeggibile(iso) {
  if (!iso) return '';
  var d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function CassafortePage() {
  var [giri, setGiri] = useState([]);
  var [loading, setLoading] = useState(true);

  useEffect(function() {
    supabase.from('cassa2_movimenti').select('*')
      .eq('tipo', 'giro').eq('annullato', false)
      .order('data', { ascending: false }).order('creato_il', { ascending: false })
      .then(function(r) {
        setLoading(false);
        setGiri(r.data || []);
      });
  }, []);

  var saldo = 0, totVersa = 0, totPreleva = 0;
  giri.forEach(function(g) {
    if (g.giro_tipo === 'versa_cassaforte') { saldo += g.importo; totVersa += g.importo; }
    if (g.giro_tipo === 'preleva_cassaforte') { saldo -= g.importo; totPreleva += g.importo; }
  });
  saldo = arrotonda(saldo);

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-5">Cassaforte</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-wine-50 border border-wine-200 rounded-xl p-5 sm:col-span-1">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Saldo attuale</div>
          <div className="text-3xl font-semibold text-wine-800">{formatEuro(saldo)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Totale versato</div>
          <div className="text-2xl font-semibold text-green-700">{formatEuro(totVersa)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Totale prelevato</div>
          <div className="text-2xl font-semibold text-red-600">{formatEuro(totPreleva)}</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">Movimenti</h2>
          <span className="text-xs text-gray-400">i versamenti/prelievi si fanno con un "Giro" dalla cassa</span>
        </div>
        {loading ? (
          <div className="text-sm text-gray-400 py-6 text-center">Caricamento...</div>
        ) : giri.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">Nessun movimento di cassaforte.</div>
        ) : (
          <div className="space-y-2">
            {giri.map(function(g) {
              var isVersa = g.giro_tipo === 'versa_cassaforte';
              return (
                <div key={g.id} className={'flex items-center gap-3 p-3 rounded-lg border ' + (isVersa ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50')}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">{isVersa ? 'Versamento' : 'Prelievo'} · {nomeCassa(g.cassa_id)}</div>
                    <div className="text-xs text-gray-500">{dataLeggibile(g.data)}{g.da_causale ? ' · ' + g.da_causale : ''}{g.nota ? ' · ' + g.nota : ''}</div>
                  </div>
                  <div className={'font-semibold ' + (isVersa ? 'text-green-700' : 'text-red-700')}>{isVersa ? '+' : '-'}{formatEuro(g.importo)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
