import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { numero, percentuale, nomeMese } from './formati';

// ============================================================
// SCHEDA OCCUPAZIONE
//
// Due percentuali affiancate, come lordo e netto altrove:
//   - su capacita' teorica     = camere fisiche x giorni
//   - su capacita' disponibile = teorica meno i blocchi validi
// La distanza fra le due e' informazione: se si allontanano, quel mese
// hai avuto camere fuori uso.
//
// ECCEZIONE ALL'ASSE TEMPORALE, dichiarata a schermo: qui le notti sono
// attribuite al giorno in cui sono state dormite, non al mese di check-in.
// Un soggiorno 29 giugno - 3 luglio da' 2 notti a giugno e 2 a luglio.
// Senza questo giugno potrebbe uscire sopra il 100%.
//
// La scheda ignora perimetro e voci evento della barra in alto: contare
// come "camera venduta" un blocco di manutenzione o una camera virtuale
// non vuol dire nulla. Il perimetro qui e' sempre standard, ed e' scritto.
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

export default function SchedaOccupazione(props) {
  var da = props.da;
  var a = props.a;

  var [totale, setTotale] = useState(null);
  var [perMese, setPerMese] = useState([]);
  var [capacita, setCapacita] = useState(null);
  var [caricamento, setCaricamento] = useState(true);
  var [errore, setErrore] = useState(null);

  useEffect(function() {
    var annullato = false;
    setCaricamento(true);
    setErrore(null);

    Promise.all([
      supabase.rpc('hic_occupazione_totale', { p_da: da, p_a: a }),
      supabase.rpc('hic_occupazione', { p_da: da, p_a: a }),
      supabase.rpc('hic_capacita')
    ]).then(function(risposte) {
      if (annullato) return;
      for (var i = 0; i < risposte.length; i++) {
        if (risposte[i].error) {
          setErrore(risposte[i].error.message);
          setCaricamento(false);
          return;
        }
      }
      var t = risposte[0].data;
      setTotale(t && t.length > 0 ? t[0] : null);
      setPerMese(risposte[1].data || []);
      var c = risposte[2].data;
      setCapacita(c && c.length > 0 ? c[0] : null);
      setCaricamento(false);
    });

    return function() { annullato = true; };
  }, [da, a]);

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

  if (!totale) {
    return <div className="text-sm text-gray-400 py-8 text-center">Nessun dato per il periodo scelto.</div>;
  }

  // Dati gia' aggregati dal database: un punto per mese.
  var datiGrafico = [];
  for (var m = 0; m < perMese.length; m++) {
    datiGrafico.push({
      mese: nomeMese(perMese[m].mese, true),
      meseLungo: nomeMese(perMese[m].mese, false),
      Teorica: perMese[m].occupazione_teorica === null ? 0 : Number(perMese[m].occupazione_teorica),
      Disponibile: perMese[m].occupazione_disponibile === null ? 0 : Number(perMese[m].occupazione_disponibile)
    });
  }

  var bloccate = Number(totale.notti_bloccate);
  var nonAttribuite = Number(totale.notti_non_attribuite);

  return (
    <div className="space-y-5">

      {/* Come si legge questa scheda */}
      <div className="bg-wine-50 border border-wine-200 rounded-xl p-4 text-xs text-wine-900 space-y-1">
        <div>
          <span className="font-semibold">Asse temporale:</span>{' '}
          ogni notte e' attribuita al giorno in cui e' stata dormita, non al mese di check-in.
          Un soggiorno a cavallo di due mesi divide le sue notti fra i due.
        </div>
        <div>
          <span className="font-semibold">Perimetro:</span>{' '}
          sempre standard, qualunque cosa sia scelto nella barra in alto. Confermate e valide non confermate;
          fuori annullate, blocchi e camere virtuali.
        </div>
      </div>

      {/* Le due occupazioni, affiancate */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi
          titolo="Su capacita' teorica"
          valore={totale.occupazione_teorica === null ? '—' : percentuale(totale.occupazione_teorica)}
          nota={numero(totale.notti_vendute) + ' notti vendute su ' + numero(totale.notti_teoriche)}
        />
        <Kpi
          titolo="Al netto delle camere fuori uso"
          valore={totale.occupazione_disponibile === null ? '—' : percentuale(totale.occupazione_disponibile)}
          nota={numero(totale.notti_vendute) + ' notti vendute su ' + numero(totale.notti_disponibili)}
        />
        <Kpi
          titolo="Notti vendute"
          valore={numero(totale.notti_vendute)}
          nota={capacita ? numero(capacita.camere) + ' camere censite' : null}
        />
      </div>

      {/* Righe d'onesta' */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-xs text-gray-500 space-y-1">
        {capacita && (
          <div>
            <span className="font-semibold text-gray-600">Camere nel denominatore:</span>{' '}
            {capacita.elenco || '—'}. La camera virtuale e' esclusa.
          </div>
        )}
        <div>
          <span className="font-semibold text-gray-600">Notti tolte dal denominatore:</span>{' '}
          <span className={bloccate > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-gray-700'}>
            {numero(bloccate)}
          </span>
          {' '}coperte da blocchi validi. Sono camere fuori uso, non vendite mancate.
        </div>
        <div>
          <span className="font-semibold text-gray-600">Notti su camere non censite:</span>{' '}
          <span className={nonAttribuite > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-gray-700'}>
            {numero(nonAttribuite)}
          </span>
          {nonAttribuite > 0
            ? <span> — non entrano in nessuna delle due percentuali perche' non hanno una camera nel denominatore.</span>
            : <span> — tutte le notti hanno una camera riconosciuta.</span>}
        </div>
        <div className="pt-1 text-gray-400">
          Una chiusura stagionale non e' scritta da nessuna parte in Hotel in Cloud: nei mesi di chiusura
          entrambe le percentuali restano basse e nessuna delle due sa dirti che era una scelta.
        </div>
      </div>

      {/* Andamento */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-sm font-semibold text-gray-800 mb-1">Occupazione per mese</div>
        <div className="text-xs text-gray-500 mb-3">
          Quando le due colonne si allontanano, quel mese hai avuto camere fuori uso.
        </div>
        {datiGrafico.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">Nessun mese nel periodo scelto.</div>
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datiGrafico} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mese" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={function(v) { return v + '%'; }} />
                <Tooltip
                  formatter={function(v) { return percentuale(v); }}
                  labelFormatter={function(l, payload) {
                    if (payload && payload.length > 0 && payload[0].payload) {
                      return payload[0].payload.meseLungo;
                    }
                    return l;
                  }}
                />
                <Legend />
                <Bar dataKey="Teorica" fill="#8f1d42" />
                <Bar dataKey="Disponibile" fill="#f4a9ba" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Tabella */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-sm font-semibold text-gray-800 mb-3">Il conto, mese per mese</div>
        {perMese.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">Nessun mese nel periodo scelto.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-200">
                  <th className="py-2 pr-3 font-semibold">Mese</th>
                  <th className="py-2 px-3 font-semibold text-right">Teoriche</th>
                  <th className="py-2 px-3 font-semibold text-right">Bloccate</th>
                  <th className="py-2 px-3 font-semibold text-right">Disponibili</th>
                  <th className="py-2 px-3 font-semibold text-right">Vendute</th>
                  <th className="py-2 px-3 font-semibold text-right">Su teorica</th>
                  <th className="py-2 pl-3 font-semibold text-right">Su disponibile</th>
                </tr>
              </thead>
              <tbody>
                {perMese.map(function(riga) {
                  return (
                    <tr key={riga.mese} className="border-b border-gray-100">
                      <td className="py-2 pr-3 text-gray-800">{nomeMese(riga.mese, false)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{numero(riga.notti_teoriche)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{numero(riga.notti_bloccate)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{numero(riga.notti_disponibili)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-900 font-semibold">{numero(riga.notti_vendute)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-800">
                        {riga.occupazione_teorica === null ? '—' : percentuale(riga.occupazione_teorica)}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums text-gray-600">
                        {riga.occupazione_disponibile === null ? '—' : percentuale(riga.occupazione_disponibile)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-semibold">
                  <td className="py-2 pr-3 text-gray-800">Totale</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-600">{numero(totale.notti_teoriche)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-600">{numero(totale.notti_bloccate)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-600">{numero(totale.notti_disponibili)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-900">{numero(totale.notti_vendute)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-800">
                    {totale.occupazione_teorica === null ? '—' : percentuale(totale.occupazione_teorica)}
                  </td>
                  <td className="py-2 pl-3 text-right tabular-nums text-gray-700">
                    {totale.occupazione_disponibile === null ? '—' : percentuale(totale.occupazione_disponibile)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="text-xs text-gray-400 mt-3">
          Il totale non e' la media delle percentuali mensili: e' il rapporto fra le somme. Sommare
          percentuali darebbe un numero diverso e sbagliato.
        </div>
      </div>

    </div>
  );
}
