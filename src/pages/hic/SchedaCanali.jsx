import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { euro, numero, percentuale } from './formati';

// ============================================================
// SCHEDA CANALI
// Parte dalle PRENOTAZIONI, non dagli addebiti: cosi' un canale
// che non ha prodotto ricavo resta visibile invece di sparire.
// Il tasso di accettazione dei preventivi ha un perimetro suo, ed
// e' voluto: i preventivi non accettati sono "annullati" in Hotel
// in Cloud, quindi qualunque filtro di stato azzererebbe il
// denominatore e il tasso direbbe sempre 100%.
// ============================================================

function Kpi(props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">{props.titolo}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{props.valore}</div>
      {props.nota && <div className="text-xs text-gray-500 mt-1">{props.nota}</div>}
    </div>
  );
}

export default function SchedaCanali(props) {
  var da = props.da;
  var a = props.a;
  var perimetro = props.perimetro;
  var eventi = props.eventi;

  var [canali, setCanali] = useState([]);
  var [preventivi, setPreventivi] = useState(null);
  var [caricamento, setCaricamento] = useState(true);
  var [errore, setErrore] = useState(null);

  useEffect(function() {
    var annullato = false;
    setCaricamento(true);
    setErrore(null);

    Promise.all([
      supabase.rpc('hic_per_canale', { p_da: da, p_a: a, p_perimetro: perimetro, p_eventi: eventi }),
      supabase.rpc('hic_tasso_preventivi', { p_da: da, p_a: a })
    ]).then(function(risposte) {
      if (annullato) return;
      for (var i = 0; i < risposte.length; i++) {
        if (risposte[i].error) {
          setErrore(risposte[i].error.message);
          setCaricamento(false);
          return;
        }
      }
      setCanali(risposte[0].data || []);
      var p = risposte[1].data;
      setPreventivi(p && p.length > 0 ? p[0] : null);
      setCaricamento(false);
    });

    return function() { annullato = true; };
  }, [da, a, perimetro, eventi]);

  if (caricamento) {
    return <div className="text-sm text-gray-400 py-8 text-center">Caricamento...</div>;
  }

  if (errore) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
        Errore nella lettura dei dati: {errore}
      </div>
    );
  }

  var lordoTotale = 0;
  var nettoTotale = 0;
  var lordoDiretto = 0;
  var lordoOta = 0;
  var prenTotali = 0;
  var prenConRighe = 0;

  for (var i = 0; i < canali.length; i++) {
    var r = canali[i];
    lordoTotale = lordoTotale + Number(r.lordo);
    nettoTotale = nettoTotale + Number(r.netto);
    prenTotali = prenTotali + Number(r.prenotazioni);
    prenConRighe = prenConRighe + Number(r.prenotazioni_con_righe);
    if (r.gruppo === 'ota') {
      lordoOta = lordoOta + Number(r.lordo);
    } else {
      lordoDiretto = lordoDiretto + Number(r.lordo);
    }
  }

  var quotaDiretto = lordoTotale !== 0 ? lordoDiretto / lordoTotale * 100 : null;
  var quotaOta = lordoTotale !== 0 ? lordoOta / lordoTotale * 100 : null;
  var senzaRicavo = prenTotali - prenConRighe;

  return (
    <div className="space-y-5">

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi
          titolo="Diretto"
          valore={quotaDiretto === null ? '—' : percentuale(quotaDiretto)}
          nota={euro(lordoDiretto) + ' lordi'}
        />
        <Kpi
          titolo="OTA"
          valore={quotaOta === null ? '—' : percentuale(quotaOta)}
          nota={euro(lordoOta) + ' lordi'}
        />
        <Kpi
          titolo="Accettazione preventivi"
          valore={preventivi && preventivi.tasso !== null ? percentuale(preventivi.tasso) : '—'}
          nota={preventivi
            ? numero(preventivi.accettati) + ' accettati su ' + numero(Number(preventivi.accettati) + Number(preventivi.non_accettati))
            : null}
        />
      </div>

      {/* Tabella per canale */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-sm font-semibold text-gray-800 mb-3">Fatturato e prenotazioni per canale</div>
        {canali.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">Nessuna prenotazione nel periodo scelto.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-200">
                  <th className="py-2 pr-3 font-semibold">Canale</th>
                  <th className="py-2 px-3 font-semibold text-right">Prenotazioni</th>
                  <th className="py-2 px-3 font-semibold text-right">Con ricavo</th>
                  <th className="py-2 px-3 font-semibold text-right">Lordo</th>
                  <th className="py-2 px-3 font-semibold text-right">Netto</th>
                  <th className="py-2 pl-3 font-semibold text-right">Quota</th>
                </tr>
              </thead>
              <tbody>
                {canali.map(function(riga) {
                  var quota = lordoTotale !== 0 ? Number(riga.lordo) / lordoTotale * 100 : null;
                  return (
                    <tr key={riga.codice} className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <span className="text-gray-800">{riga.nome}</span>
                        {riga.gruppo === 'ota' && (
                          <span className="ml-2 text-xs text-gray-400">OTA</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-800">{numero(riga.prenotazioni)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{numero(riga.prenotazioni_con_righe)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-900">{euro(riga.lordo)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-600">{euro(riga.netto)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-gray-500">{quota === null ? '—' : percentuale(quota)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-semibold">
                  <td className="py-2 pr-3 text-gray-800">Totale</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-800">{numero(prenTotali)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-600">{numero(prenConRighe)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-900">{euro(lordoTotale)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-700">{euro(nettoTotale)}</td>
                  <td className="py-2 pl-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {senzaRicavo > 0 && (
          <div className="text-xs text-gray-500 mt-3">
            <span className="font-semibold text-gray-600">Perche' due conteggi:</span>{' '}
            {numero(senzaRicavo)} prenotazioni del periodo non hanno alcun addebito. Esistono, ma non hanno prodotto ricavo.
          </div>
        )}
      </div>

      {/* Preventivi */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-sm font-semibold text-gray-800 mb-2">Preventivi</div>
        {preventivi ? (
          <div className="text-sm text-gray-700 space-y-1">
            <div>Accettati: <span className="font-semibold tabular-nums">{numero(preventivi.accettati)}</span></div>
            <div>Non accettati: <span className="font-semibold tabular-nums">{numero(preventivi.non_accettati)}</span></div>
            <div>Tasso di accettazione: <span className="font-semibold tabular-nums">{preventivi.tasso !== null ? percentuale(preventivi.tasso) : '—'}</span></div>
          </div>
        ) : (
          <div className="text-sm text-gray-400">Nessun preventivo nel periodo scelto.</div>
        )}
        <div className="text-xs text-gray-500 mt-3 space-y-1">
          <div>
            Un preventivo non accettato <span className="font-semibold">non e' una disdetta</span>: in Hotel in Cloud risulta annullato solo perche' non e' mai diventato prenotazione.
          </div>
          <div>
            Questo riquadro ignora il perimetro scelto in alto, altrimenti i non accettati sparirebbero e il tasso direbbe sempre 100%.
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-400">
        Nota su &quot;Telefono&quot;: in Hotel in Cloud significa &quot;inserita a mano&quot;, quindi comprende anche i clienti arrivati senza prenotare.
      </div>

    </div>
  );
}
