import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { numero, percentuale, nomeMese } from './formati';

// ============================================================
// SCHEDA OSPITI
//
// Nessun euro qui dentro: e' una scheda operativa, la puo' aprire chi sta
// in reception o in sala. Le medie di spesa stanno in "Prenotazioni riga
// per riga", che e' una scheda economica.
//
// La LINGUA esiste solo su una parte delle prenotazioni: le OTA e il sito
// la portano con se', le telefoniche no. Per questo non diventa mai una
// percentuale sul totale — sarebbe una bugia — ma un riquadro suo, con
// scritto sopra su quante prenotazioni e' dichiarata. "Non dichiarata"
// resta una voce visibile: non si distribuisce sulle altre.
//
// La scheda ignora perimetro e voci evento: il perimetro qui e' sempre
// standard, ed e' scritto a schermo.
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

export default function SchedaOspiti(props) {
  var da = props.da;
  var a = props.a;

  var [totale, setTotale] = useState(null);
  var [perMese, setPerMese] = useState([]);
  var [lingue, setLingue] = useState([]);
  var [caricamento, setCaricamento] = useState(true);
  var [errore, setErrore] = useState(null);

  useEffect(function() {
    var annullato = false;
    setCaricamento(true);
    setErrore(null);

    Promise.all([
      supabase.rpc('hic_ospiti_totale', { p_da: da, p_a: a }),
      supabase.rpc('hic_ospiti', { p_da: da, p_a: a }),
      supabase.rpc('hic_ospiti_lingua', { p_da: da, p_a: a })
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
      setLingue(risposte[2].data || []);
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
  for (var m = 0; m < perMese.length; m++) {
    datiGrafico.push({
      mese: nomeMese(perMese[m].mese, true),
      meseLungo: nomeMese(perMese[m].mese, false),
      Adulti: Number(perMese[m].adulti),
      Bambini: Number(perMese[m].bambini)
    });
  }

  // Quanto pesa davvero il riquadro lingua: la copertura si dichiara.
  var prenLingua = 0;
  var prenSenzaLingua = 0;
  for (var i = 0; i < lingue.length; i++) {
    if (lingue[i].codice === 'nd') {
      prenSenzaLingua = prenSenzaLingua + Number(lingue[i].prenotazioni);
    } else {
      prenLingua = prenLingua + Number(lingue[i].prenotazioni);
    }
  }
  var prenTotaliLingua = prenLingua + prenSenzaLingua;
  var coperturaLingua = prenTotaliLingua > 0 ? prenLingua / prenTotaliLingua * 100 : null;

  var senzaOspiti = Number(totale.senza_ospiti);
  var senzaRipartizione = Number(totale.senza_ripartizione);

  return (
    <div className="space-y-5">

      <div className="bg-wine-50 border border-wine-200 rounded-xl p-4 text-xs text-wine-900">
        <span className="font-semibold">Perimetro:</span>{' '}
        sempre standard, qualunque cosa sia scelto nella barra in alto, e per mese di check-in.
        Contare gli ospiti di prenotazioni annullate o di blocchi di manutenzione non direbbe nulla.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Kpi titolo="Ospiti" valore={numero(totale.ospiti)} nota={numero(totale.prenotazioni) + ' prenotazioni'} />
        <Kpi titolo="Adulti" valore={numero(totale.adulti)} />
        <Kpi titolo="Bambini" valore={numero(totale.bambini)} />
        <Kpi
          titolo="Permanenza media"
          valore={totale.permanenza_media === null ? '—' : numero(totale.permanenza_media) + ' notti'}
          nota={totale.ospiti_per_prenotazione === null ? null : numero(totale.ospiti_per_prenotazione) + ' ospiti a prenotazione'}
        />
      </div>

      {/* Righe d'onesta' */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-xs text-gray-500 space-y-1">
        <div>
          Prenotazioni senza numero di ospiti:{' '}
          <span className={senzaOspiti > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-gray-700'}>
            {numero(senzaOspiti)}
          </span>
          {senzaOspiti > 0 && (
            <span> — contano come prenotazioni ma portano zero ospiti nella somma, quindi abbassano la media per prenotazione.</span>
          )}
        </div>
        <div>
          Prenotazioni senza divisione adulti e bambini:{' '}
          <span className={senzaRipartizione > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-gray-700'}>
            {numero(senzaRipartizione)}
          </span>
          {senzaRipartizione > 0 && (
            <span> — per questo adulti piu' bambini puo' non fare il totale degli ospiti.</span>
          )}
        </div>
      </div>

      {/* Adulti e bambini per mese */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-sm font-semibold text-gray-800 mb-3">Adulti e bambini per mese di check-in</div>
        {datiGrafico.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">Nessun mese nel periodo scelto.</div>
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datiGrafico} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mese" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={function(v) { return numero(v); }}
                  labelFormatter={function(l, payload) {
                    if (payload && payload.length > 0 && payload[0].payload) {
                      return payload[0].payload.meseLungo;
                    }
                    return l;
                  }}
                />
                <Legend />
                <Bar dataKey="Adulti" stackId="ospiti" fill="#8f1d42" />
                <Bar dataKey="Bambini" stackId="ospiti" fill="#f4a9ba" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Tabella per mese */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-sm font-semibold text-gray-800 mb-3">Mese per mese</div>
        {perMese.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">Nessun mese nel periodo scelto.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-200">
                  <th className="py-2 pr-3 font-semibold">Mese</th>
                  <th className="py-2 px-3 font-semibold text-right">Prenotazioni</th>
                  <th className="py-2 px-3 font-semibold text-right">Ospiti</th>
                  <th className="py-2 px-3 font-semibold text-right">Adulti</th>
                  <th className="py-2 px-3 font-semibold text-right">Bambini</th>
                  <th className="py-2 px-3 font-semibold text-right">Notti</th>
                  <th className="py-2 pl-3 font-semibold text-right">Permanenza</th>
                </tr>
              </thead>
              <tbody>
                {perMese.map(function(riga) {
                  return (
                    <tr key={riga.mese} className="border-b border-gray-100">
                      <td className="py-2 pr-3 text-gray-800">{nomeMese(riga.mese, false)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-800">{numero(riga.prenotazioni)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-900 font-semibold">{numero(riga.ospiti)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-600">{numero(riga.adulti)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-600">{numero(riga.bambini)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-600">{numero(riga.notti)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-gray-500">
                        {riga.permanenza_media === null ? '—' : numero(riga.permanenza_media)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lingua */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-sm font-semibold text-gray-800 mb-1">Lingua dell'ospite</div>
        <div className="text-xs text-gray-500 mb-3">
          {coperturaLingua === null
            ? 'Nessuna prenotazione nel periodo scelto.'
            : 'Dichiarata su ' + numero(prenLingua) + ' prenotazioni su ' + numero(prenTotaliLingua) +
              ' (' + percentuale(coperturaLingua) + '). Le prenotazioni prese al telefono non portano questo campo.'}
        </div>
        {lingue.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">Nessun dato nel periodo scelto.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-200">
                  <th className="py-2 pr-3 font-semibold">Lingua</th>
                  <th className="py-2 px-3 font-semibold text-right">Prenotazioni</th>
                  <th className="py-2 px-3 font-semibold text-right">Ospiti</th>
                  <th className="py-2 pl-3 font-semibold text-right">Quota fra le dichiarate</th>
                </tr>
              </thead>
              <tbody>
                {lingue.map(function(riga) {
                  var dichiarata = riga.codice !== 'nd';
                  var quota = (dichiarata && prenLingua > 0)
                    ? Number(riga.prenotazioni) / prenLingua * 100
                    : null;
                  return (
                    <tr key={riga.codice} className="border-b border-gray-100">
                      <td className={dichiarata ? 'py-2 pr-3 text-gray-800' : 'py-2 pr-3 text-gray-400 italic'}>
                        {riga.nome}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-800">{numero(riga.prenotazioni)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-600">{numero(riga.ospiti)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-gray-500">
                        {quota === null ? '—' : percentuale(quota)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-xs text-gray-400 mt-3">
          Hotel in Cloud registra la lingua come numero, senza dirci quale sia: la traduzione sta nella
          tabella hic_lingue ed e' stata dedotta dai nomi degli ospiti. Se una voce risulta sbagliata si
          corregge li', senza toccare il programma.
        </div>
      </div>

    </div>
  );
}
