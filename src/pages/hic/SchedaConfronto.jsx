import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { euro, numero, euroBreve, percentuale, variazione } from './formati';

// ============================================================
// SCHEDA CONFRONTO PERIODI
// Fino a sei periodi affiancati. Il periodo scelto nella barra in
// alto NON vale qui (i periodi se li sceglie questa scheda), ma
// perimetro e voci evento SI': confrontare due periodi con perimetri
// diversi vorrebbe dire confrontare mele con pere senza accorgersene.
// Ogni periodo e' una chiamata a hic_totali: le somme le fa sempre
// il database.
// ============================================================

var MAX_PERIODI = 6;

function annoCorrente() {
  return new Date().getFullYear();
}

function periodoAnno(anno) {
  return {
    id: 'anno-' + anno + '-' + Math.random().toString(36).slice(2, 7),
    etichetta: String(anno),
    da: anno + '-01-01',
    a: anno + '-12-31'
  };
}

function periodiIniziali() {
  var y = annoCorrente();
  return [periodoAnno(y - 2), periodoAnno(y - 1), periodoAnno(y)];
}

export default function SchedaConfronto(props) {
  var perimetro = props.perimetro;
  var eventi = props.eventi;

  var [periodi, setPeriodi] = useState(periodiIniziali);
  var [risultati, setRisultati] = useState({});
  var [caricamento, setCaricamento] = useState(true);
  var [errore, setErrore] = useState(null);

  var chiaveDipendenza = JSON.stringify(periodi) + '|' + perimetro + '|' + eventi;

  useEffect(function() {
    var annullato = false;
    setCaricamento(true);
    setErrore(null);

    var chiamate = [];
    for (var i = 0; i < periodi.length; i++) {
      chiamate.push(supabase.rpc('hic_totali', {
        p_da: periodi[i].da || null,
        p_a: periodi[i].a || null,
        p_perimetro: perimetro,
        p_eventi: eventi
      }));
    }

    Promise.all(chiamate).then(function(risposte) {
      if (annullato) return;
      var mappa = {};
      for (var j = 0; j < risposte.length; j++) {
        if (risposte[j].error) {
          setErrore(risposte[j].error.message);
          setCaricamento(false);
          return;
        }
        var d = risposte[j].data;
        mappa[periodi[j].id] = (d && d.length > 0) ? d[0] : null;
      }
      setRisultati(mappa);
      setCaricamento(false);
    });

    return function() { annullato = true; };
  }, [chiaveDipendenza]);

  function aggiungiPeriodo() {
    if (periodi.length >= MAX_PERIODI) return;
    var y = annoCorrente() - periodi.length;
    var nuovi = periodi.slice();
    nuovi.push(periodoAnno(y));
    setPeriodi(nuovi);
  }

  function togliPeriodo(id) {
    var nuovi = [];
    for (var i = 0; i < periodi.length; i++) {
      if (periodi[i].id !== id) nuovi.push(periodi[i]);
    }
    setPeriodi(nuovi);
  }

  function aggiornaPeriodo(id, campo, valore) {
    var nuovi = [];
    for (var i = 0; i < periodi.length; i++) {
      if (periodi[i].id === id) {
        var copia = {};
        for (var k in periodi[i]) { copia[k] = periodi[i][k]; }
        copia[campo] = valore;
        nuovi.push(copia);
      } else {
        nuovi.push(periodi[i]);
      }
    }
    setPeriodi(nuovi);
  }

  var riferimento = periodi.length > 0 ? risultati[periodi[0].id] : null;

  var datiGrafico = [];
  for (var g = 0; g < periodi.length; g++) {
    var res = risultati[periodi[g].id];
    datiGrafico.push({
      nome: periodi[g].etichetta || '—',
      Lordo: res ? Number(res.lordo) : 0,
      Netto: res ? Number(res.netto) : 0
    });
  }

  return (
    <div className="space-y-5">

      {/* Impostazione dei periodi */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-gray-800">Periodi da confrontare</div>
          {periodi.length < MAX_PERIODI && (
            <button
              type="button"
              onClick={aggiungiPeriodo}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border bg-white text-wine-800 border-wine-300 hover:bg-wine-50">
              Aggiungi periodo
            </button>
          )}
        </div>

        <div className="space-y-2">
          {periodi.map(function(p) {
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={p.etichetta}
                  onChange={function(e) { aggiornaPeriodo(p.id, 'etichetta', e.target.value); }}
                  placeholder="Nome"
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-28"
                />
                <span className="text-sm text-gray-500">dal</span>
                <input
                  type="date"
                  value={p.da || ''}
                  onChange={function(e) { aggiornaPeriodo(p.id, 'da', e.target.value); }}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                />
                <span className="text-sm text-gray-500">al</span>
                <input
                  type="date"
                  value={p.a || ''}
                  onChange={function(e) { aggiornaPeriodo(p.id, 'a', e.target.value); }}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                />
                {periodi.length > 1 && (
                  <button
                    type="button"
                    onClick={function() { togliPeriodo(p.id); }}
                    className="px-2 py-1.5 rounded-lg text-sm text-gray-400 hover:text-red-700">
                    Togli
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="text-xs text-gray-500 mt-3">
          Le variazioni sono calcolate rispetto al primo periodo dell'elenco. Perimetro e voci evento sono quelli scelti nella barra in alto e valgono per tutti i periodi insieme.
        </div>
      </div>

      {errore && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          Errore nella lettura dei dati: {errore}
        </div>
      )}

      {caricamento ? (
        <div className="text-sm text-gray-400 py-8 text-center">Caricamento...</div>
      ) : (
        <>
          {/* Tabella */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-200">
                    <th className="py-2 pr-3 font-semibold">Periodo</th>
                    <th className="py-2 px-3 font-semibold text-right">Lordo</th>
                    <th className="py-2 px-3 font-semibold text-right">Netto</th>
                    <th className="py-2 px-3 font-semibold text-right">IVA</th>
                    <th className="py-2 px-3 font-semibold text-right">Prenotazioni</th>
                    <th className="py-2 pl-3 font-semibold text-right">Var. lordo</th>
                  </tr>
                </thead>
                <tbody>
                  {periodi.map(function(p, indice) {
                    var res = risultati[p.id];
                    var v = (indice === 0 || !res || !riferimento)
                      ? null
                      : variazione(res.lordo, riferimento.lordo);
                    var classeVar = 'py-2 pl-3 text-right tabular-nums text-gray-500';
                    if (v !== null && v > 0) classeVar = 'py-2 pl-3 text-right tabular-nums text-green-700 font-semibold';
                    if (v !== null && v < 0) classeVar = 'py-2 pl-3 text-right tabular-nums text-red-700 font-semibold';
                    return (
                      <tr key={p.id} className="border-b border-gray-100">
                        <td className="py-2 pr-3 text-gray-800">
                          {p.etichetta || '—'}
                          {indice === 0 && <span className="ml-2 text-xs text-gray-400">riferimento</span>}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-900">{res ? euro(res.lordo) : '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-600">{res ? euro(res.netto) : '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-500">{res ? euro(res.imposta) : '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-600">{res ? numero(res.prenotazioni) : '—'}</td>
                        <td className={classeVar}>
                          {v === null ? '—' : (v > 0 ? '+' : '') + percentuale(v)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Grafico */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-sm font-semibold text-gray-800 mb-3">Confronto</div>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datiGrafico} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={function(v) { return euroBreve(v); }} />
                  <Tooltip formatter={function(v) { return euro(v); }} />
                  <Legend />
                  <Bar dataKey="Lordo" fill="#8f1d42" />
                  <Bar dataKey="Netto" fill="#f4a9ba" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="text-xs text-gray-400">
            Un anno ancora in corso non e' confrontabile con un anno chiuso: i mesi che mancano non ci sono, e le prenotazioni future gia' acquisite ci sono. Leggi il periodo corrente con prudenza.
          </div>
        </>
      )}

    </div>
  );
}
