import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { numero } from './formati';

// ============================================================
// SCHEDA ANTICIPO
//
// Quanti giorni passano fra il momento in cui la prenotazione viene
// registrata e il giorno dell'arrivo.
//
// Si usa la MEDIANA, non la media. Bastano tre prenotazioni fatte con due
// anni di anticipo per spostare una media e farti credere che i clienti
// prenotino molto prima di quanto facciano davvero. La mediana e' il
// cliente che sta esattamente in mezzo: meta' prenota prima, meta' dopo.
// I percentili raccontano il resto: fra il 25esimo e il 75esimo sta la
// meta' centrale dei tuoi clienti, ed e' li' che si decide un'offerta.
//
// Nessun euro qui dentro: scheda operativa. Perimetro sempre standard.
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

function giorni(valore) {
  if (valore === null || valore === undefined) return '—';
  return numero(valore) + ' gg';
}

export default function SchedaAnticipo(props) {
  var da = props.da;
  var a = props.a;

  var [totale, setTotale] = useState(null);
  var [perCanale, setPerCanale] = useState([]);
  var [distribuzione, setDistribuzione] = useState([]);
  var [caricamento, setCaricamento] = useState(true);
  var [errore, setErrore] = useState(null);

  useEffect(function() {
    var annullato = false;
    setCaricamento(true);
    setErrore(null);

    Promise.all([
      supabase.rpc('hic_anticipo_totale', { p_da: da, p_a: a }),
      supabase.rpc('hic_anticipo', { p_da: da, p_a: a }),
      supabase.rpc('hic_anticipo_distribuzione', { p_da: da, p_a: a })
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
      setPerCanale(risposte[1].data || []);
      setDistribuzione(risposte[2].data || []);
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

  var datiGrafico = [];
  for (var i = 0; i < distribuzione.length; i++) {
    datiGrafico.push({
      fascia: distribuzione[i].fascia,
      Prenotazioni: Number(distribuzione[i].prenotazioni)
    });
  }

  var senzaData = Number(totale.senza_data);
  var negativi = Number(totale.negativi);

  return (
    <div className="space-y-5">

      <div className="bg-wine-50 border border-wine-200 rounded-xl p-4 text-xs text-wine-900">
        <span className="font-semibold">Perimetro:</span>{' '}
        sempre standard, qualunque cosa sia scelto nella barra in alto. Il periodo filtra per mese di check-in:
        stai guardando quanto in anticipo sono state prese le prenotazioni arrivate in quel periodo.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Kpi
          titolo="Mediana"
          valore={giorni(totale.mediana)}
          nota="meta' prenota prima, meta' dopo"
        />
        <Kpi
          titolo="Meta' centrale"
          valore={giorni(totale.p25) + ' - ' + giorni(totale.p75)}
          nota="dal 25esimo al 75esimo percentile"
        />
        <Kpi
          titolo="I piu' previdenti"
          valore={giorni(totale.p90)}
          nota="un cliente su dieci prenota prima di cosi'"
        />
        <Kpi
          titolo="Prenotazioni"
          valore={numero(totale.prenotazioni)}
          nota={totale.media === null ? null : 'media aritmetica ' + giorni(totale.media)}
        />
      </div>

      {/* Righe d'onesta' */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-xs text-gray-500 space-y-1">
        <div>
          Prenotazioni senza data di registrazione:{' '}
          <span className={senzaData > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-gray-700'}>
            {numero(senzaData)}
          </span>
          {senzaData > 0 && <span> — non entrano nel calcolo di mediana e percentili.</span>}
        </div>
        <div>
          Registrate dopo l'arrivo:{' '}
          <span className={negativi > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-gray-700'}>
            {numero(negativi)}
          </span>
          {negativi > 0 && <span> — anticipo negativo. Restano nel conto perche' sono soggiorni veri, inseriti a posteriori.</span>}
        </div>
        <div className="pt-1 text-gray-400">
          Se la media aritmetica e' molto piu' alta della mediana, vuol dire che poche prenotazioni
          lontanissime la stanno tirando su. In quel caso guarda la mediana e dimentica la media.
        </div>
      </div>

      {/* Distribuzione */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-sm font-semibold text-gray-800 mb-3">Quanto prima prenotano</div>
        {datiGrafico.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">Nessuna prenotazione nel periodo scelto.</div>
        ) : (
          <div style={{ width: '100%', height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={datiGrafico}
                layout="vertical"
                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="fascia" width={150} tick={{ fontSize: 11 }} />
                <Tooltip formatter={function(v) { return numero(v); }} />
                <Bar dataKey="Prenotazioni" fill="#8f1d42" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Per canale */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-sm font-semibold text-gray-800 mb-1">Per canale</div>
        <div className="text-xs text-gray-500 mb-3">
          Canali diversi prenotano con tempi diversi: e' l'informazione che serve per decidere quando
          aprire le tariffe e quando chiudere le camere alle OTA.
        </div>
        {perCanale.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">Nessuna prenotazione nel periodo scelto.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-200">
                  <th className="py-2 pr-3 font-semibold">Canale</th>
                  <th className="py-2 px-3 font-semibold text-right">Prenotazioni</th>
                  <th className="py-2 px-3 font-semibold text-right">10%</th>
                  <th className="py-2 px-3 font-semibold text-right">25%</th>
                  <th className="py-2 px-3 font-semibold text-right">Mediana</th>
                  <th className="py-2 px-3 font-semibold text-right">75%</th>
                  <th className="py-2 pl-3 font-semibold text-right">90%</th>
                </tr>
              </thead>
              <tbody>
                {perCanale.map(function(riga) {
                  return (
                    <tr key={riga.codice} className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <span className="text-gray-800">{riga.nome}</span>
                        {riga.gruppo === 'ota' && (
                          <span className="ml-2 text-xs text-gray-400">OTA</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-800">{numero(riga.prenotazioni)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-400">{giorni(riga.p10)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-600">{giorni(riga.p25)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-900 font-semibold">{giorni(riga.mediana)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-600">{giorni(riga.p75)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-gray-400">{giorni(riga.p90)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-xs text-gray-400 mt-3">
          Un canale con pochissime prenotazioni ha percentili che ballano: leggi le righe con numeri
          piccoli come indizi, non come misure.
        </div>
      </div>

    </div>
  );
}
