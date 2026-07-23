import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { euro, numero, euroBreve, percentuale, nomeMese } from './formati';

// ============================================================
// SCHEDA FATTURATO
// Lordo e netto sempre affiancati ed etichettati, mai un
// interruttore che si dimentica su quale posizione era.
// Tutte le somme arrivano gia' fatte dal database.
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

export default function SchedaFatturato(props) {
  var da = props.da;
  var a = props.a;
  var perimetro = props.perimetro;
  var eventi = props.eventi;

  var [totali, setTotali] = useState(null);
  var [perMese, setPerMese] = useState([]);
  var [perCategoria, setPerCategoria] = useState([]);
  var [caricamento, setCaricamento] = useState(true);
  var [errore, setErrore] = useState(null);

  useEffect(function() {
    var annullato = false;
    setCaricamento(true);
    setErrore(null);

    var parametri = { p_da: da, p_a: a, p_perimetro: perimetro, p_eventi: eventi };

    Promise.all([
      supabase.rpc('hic_totali', parametri),
      supabase.rpc('hic_per_mese', parametri),
      supabase.rpc('hic_per_categoria', parametri)
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
      setTotali(t && t.length > 0 ? t[0] : null);
      setPerMese(risposte[1].data || []);
      setPerCategoria(risposte[2].data || []);
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

  if (!totali) {
    return <div className="text-sm text-gray-400 py-8 text-center">Nessun dato per il periodo scelto.</div>;
  }

  // Dati per il grafico: gia' aggregati dal database, un punto per mese.
  var datiGrafico = [];
  for (var m = 0; m < perMese.length; m++) {
    datiGrafico.push({
      mese: nomeMese(perMese[m].mese, true),
      meseLungo: nomeMese(perMese[m].mese, false),
      Lordo: Number(perMese[m].lordo),
      Netto: Number(perMese[m].netto)
    });
  }

  var lordoTotale = Number(totali.lordo);

  return (
    <div className="space-y-5">

      {/* Totali del periodo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi titolo="Lordo (IVA compresa)" valore={euro(totali.lordo)} />
        <Kpi titolo="Netto (imponibile)" valore={euro(totali.netto)} />
        <Kpi titolo="IVA" valore={euro(totali.imposta)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Kpi titolo="Prenotazioni con ricavo" valore={numero(totali.prenotazioni)} />
        <Kpi titolo="Righe di addebito" valore={numero(totali.righe)} />
      </div>

      {/* Righe d'onesta': si dichiarano anche quando valgono zero */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-xs text-gray-500 space-y-1">
        <div>
          Righe con aliquota IVA sconosciuta:{' '}
          <span className={Number(totali.righe_aliquota_ignota) > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-gray-700'}>
            {numero(totali.righe_aliquota_ignota)}
          </span>
          {Number(totali.righe_aliquota_ignota) > 0 && (
            <span> — {euro(totali.lordo_aliquota_ignota)} lordi non hanno un netto calcolato e non sono compresi nella colonna Netto.</span>
          )}
        </div>
        <div>
          Addebiti senza prenotazione collegata:{' '}
          <span className={Number(totali.righe_senza_prenotazione) > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-gray-700'}>
            {numero(totali.righe_senza_prenotazione)}
          </span>
          {Number(totali.righe_senza_prenotazione) > 0 && (
            <span> — queste righe non hanno un mese di check-in e non compaiono nel grafico mensile.</span>
          )}
        </div>
      </div>

      {/* Andamento per mese di check-in */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-sm font-semibold text-gray-800 mb-1">Andamento per mese di check-in</div>
        <div className="text-xs text-gray-500 mb-3">
          Ogni importo e' attribuito al mese di arrivo della prenotazione a cui appartiene, non alla data in cui fu registrato.
        </div>
        {datiGrafico.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">Nessun mese nel periodo scelto.</div>
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datiGrafico} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mese" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={function(v) { return euroBreve(v); }} />
                <Tooltip
                  formatter={function(v) { return euro(v); }}
                  labelFormatter={function(l, payload) {
                    if (payload && payload.length > 0 && payload[0].payload) {
                      return payload[0].payload.meseLungo;
                    }
                    return l;
                  }}
                />
                <Legend />
                <Bar dataKey="Lordo" fill="#8f1d42" />
                <Bar dataKey="Netto" fill="#f4a9ba" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Composizione per categoria */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-sm font-semibold text-gray-800 mb-3">Composizione per categoria</div>
        {perCategoria.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">Nessun addebito nel periodo scelto.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-200">
                  <th className="py-2 pr-3 font-semibold">Categoria</th>
                  <th className="py-2 px-3 font-semibold text-right">Lordo</th>
                  <th className="py-2 px-3 font-semibold text-right">Netto</th>
                  <th className="py-2 px-3 font-semibold text-right">IVA</th>
                  <th className="py-2 px-3 font-semibold text-right">Quota</th>
                  <th className="py-2 pl-3 font-semibold text-right">Righe</th>
                </tr>
              </thead>
              <tbody>
                {perCategoria.map(function(riga) {
                  var quota = lordoTotale !== 0 ? Number(riga.lordo) / lordoTotale * 100 : null;
                  return (
                    <tr key={String(riga.categoria_num) + '-' + riga.categoria} className="border-b border-gray-100">
                      <td className="py-2 pr-3 text-gray-800">{riga.categoria}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-900">{euro(riga.lordo)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-600">{euro(riga.netto)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{euro(riga.imposta)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{quota === null ? '—' : percentuale(quota)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-gray-500">{numero(riga.righe)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-xs text-gray-400 mt-3">
          Il totale in cima e' calcolato sul totale, non sommando le righe qui sopra: sommando valori gia' arrotondati potrebbe uscire un centesimo di differenza.
        </div>
      </div>

    </div>
  );
}
