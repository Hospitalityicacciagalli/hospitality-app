import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { euro, numero, percentuale } from './formati';

// ============================================================
// SCHEDA CONSUMI
//
// Non e' una scheda di sola lettura come le altre: e' uno strumento di
// lavoro. Sotto la tabella dei gruppi c'e' l'elenco delle diciture che
// nessuna regola ha saputo classificare, e da li' le agganci a mano.
//
// LA CASCATA (migrazione 34), in ordine. Vince il primo livello che
// risponde, e ogni gruppo dichiara da quale livello e' nato:
//   1 aggancio a mano    — una tua decisione, vince sempre
//   2 modello            — una regola del dizionario
//   3 categoria          — quando la dicitura e' vuota (gli alloggi)
//   4 prefisso del menu  — quello che sta prima del trattino
//   5 da classificare    — resta visibile, non sparisce mai
//
// ATTENZIONE alla colonna Notti: quantita' in Hotel in Cloud vuol dire
// NOTTI, non pezzi. Il numero solido e' "quante prenotazioni hanno avuto
// questa voce", non "quanti capi sono stati venduti".
// ============================================================

function classeOrigine(origine) {
  if (origine === 'agganciato a mano') return 'text-xs px-2 py-0.5 rounded-full bg-wine-100 text-wine-800 border border-wine-200';
  if (origine === 'modello') return 'text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200';
  if (origine === 'categoria') return 'text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200';
  if (origine === 'prefisso del menu') return 'text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200';
  return 'text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200';
}

export default function SchedaConsumi(props) {
  var da = props.da;
  var a = props.a;
  var perimetro = props.perimetro;
  var eventi = props.eventi;

  var auth = useAuth();
  var puoAgganciare = auth.canEdit('hic_economico');
  var firma = auth.elevato && auth.elevazione
    ? auth.elevazione.nome
    : (auth.profile && auth.profile.nome ? auth.profile.nome : (auth.user ? auth.user.email : null));

  var [gruppi, setGruppi] = useState([]);
  var [restoConteggio, setRestoConteggio] = useState(null);
  var [resto, setResto] = useState([]);
  var [caricamento, setCaricamento] = useState(true);
  var [errore, setErrore] = useState(null);

  // Aggancio a mano
  var [inLavorazione, setInLavorazione] = useState(null);
  var [gruppoNuovo, setGruppoNuovo] = useState('');
  var [salvataggio, setSalvataggio] = useState(false);
  var [erroreAggancio, setErroreAggancio] = useState(null);
  var [giro, setGiro] = useState(0);

  useEffect(function() {
    var annullato = false;
    setCaricamento(true);
    setErrore(null);

    var parametri = { p_da: da, p_a: a, p_perimetro: perimetro, p_eventi: eventi };

    Promise.all([
      supabase.rpc('hic_consumi', parametri),
      supabase.rpc('hic_consumi_da_classificare_conteggio', parametri),
      supabase.rpc('hic_consumi_da_classificare', {
        p_da: da, p_a: a, p_perimetro: perimetro, p_eventi: eventi, p_limite: 100
      })
    ]).then(function(risposte) {
      if (annullato) return;
      for (var i = 0; i < risposte.length; i++) {
        if (risposte[i].error) {
          setErrore(risposte[i].error.message);
          setCaricamento(false);
          return;
        }
      }
      setGruppi(risposte[0].data || []);
      var c = risposte[1].data;
      setRestoConteggio(c && c.length > 0 ? c[0] : null);
      setResto(risposte[2].data || []);
      setCaricamento(false);
    });

    return function() { annullato = true; };
  }, [da, a, perimetro, eventi, giro]);

  function apriAggancio(descrizione) {
    setInLavorazione(descrizione);
    setGruppoNuovo('');
    setErroreAggancio(null);
  }

  function chiudiAggancio() {
    setInLavorazione(null);
    setGruppoNuovo('');
    setErroreAggancio(null);
  }

  function aggancia(descrizione, gruppo) {
    var nome = (gruppo || '').trim();
    if (!nome) {
      setErroreAggancio('Serve il nome di un gruppo.');
      return;
    }
    setSalvataggio(true);
    setErroreAggancio(null);
    supabase
      .from('hic_voci_consumo')
      .insert({
        modello: descrizione,
        esatto: true,
        gruppo: nome,
        ordine: 1,
        note: 'agganciato dalla dashboard',
        creato_da: firma
      })
      .then(function(res) {
        setSalvataggio(false);
        if (res.error) {
          setErroreAggancio(res.error.message);
          return;
        }
        chiudiAggancio();
        setGiro(giro + 1);
      });
  }

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
  var righeZeroTotali = 0;
  for (var i = 0; i < gruppi.length; i++) {
    lordoTotale = lordoTotale + Number(gruppi[i].lordo);
    righeZeroTotali = righeZeroTotali + Number(gruppi[i].righe_zero);
  }

  // I gruppi gia' esistenti diventano i pulsanti dell'aggancio a mano.
  var gruppiEsistenti = [];
  for (var g = 0; g < gruppi.length; g++) {
    if (gruppi[g].gruppo !== 'Da classificare') gruppiEsistenti.push(gruppi[g].gruppo);
  }
  gruppiEsistenti.sort();

  var dicitureResidue = restoConteggio ? Number(restoConteggio.diciture) : 0;

  return (
    <div className="space-y-5">

      {/* Tabella dei gruppi */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-sm font-semibold text-gray-800 mb-1">Consumi per gruppo</div>
        <div className="text-xs text-gray-500 mb-3">
          La colonna Notti e' la somma delle quantita', e in Hotel in Cloud la quantita' di un addebito
          e' il numero di notti, non il numero di pezzi. Il numero solido e' la colonna Prenotazioni.
        </div>
        {gruppi.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">Nessun addebito nel periodo scelto.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-200">
                  <th className="py-2 pr-3 font-semibold">Gruppo</th>
                  <th className="py-2 px-3 font-semibold text-right">Prenotazioni</th>
                  <th className="py-2 px-3 font-semibold text-right">Righe</th>
                  <th className="py-2 px-3 font-semibold text-right">Notti</th>
                  <th className="py-2 px-3 font-semibold text-right">Lordo</th>
                  <th className="py-2 px-3 font-semibold text-right">Netto</th>
                  <th className="py-2 px-3 font-semibold text-right">Quota</th>
                  <th className="py-2 pl-3 font-semibold text-right">A zero</th>
                </tr>
              </thead>
              <tbody>
                {gruppi.map(function(riga) {
                  var quota = lordoTotale !== 0 ? Number(riga.lordo) / lordoTotale * 100 : null;
                  var daFare = riga.gruppo === 'Da classificare';
                  return (
                    <tr key={riga.gruppo} className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <span className={daFare ? 'text-amber-800 font-semibold' : 'text-gray-800'}>{riga.gruppo}</span>
                        <span className="ml-2">
                          <span className={classeOrigine(riga.origine)}>{riga.origine}</span>
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-800">{numero(riga.prenotazioni)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{numero(riga.righe)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{numero(riga.notti)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-900">{euro(riga.lordo)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-600">{euro(riga.netto)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{quota === null ? '—' : percentuale(quota)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-gray-500">{numero(riga.righe_zero)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-semibold">
                  <td className="py-2 pr-3 text-gray-800">Totale</td>
                  <td className="py-2 px-3"></td>
                  <td className="py-2 px-3"></td>
                  <td className="py-2 px-3"></td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-900">{euro(lordoTotale)}</td>
                  <td className="py-2 px-3"></td>
                  <td className="py-2 px-3"></td>
                  <td className="py-2 pl-3 text-right tabular-nums text-gray-700">{numero(righeZeroTotali)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="text-xs text-gray-400 mt-3">
          La colonna &quot;A zero&quot; conta le righe che valgono zero euro: gift card gia' incassate altrove,
          omaggi, servizi gia' scontrinati. Il servizio c'e' stato, il denaro e' entrato in un altro momento.
        </div>
      </div>

      {/* Da classificare */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <div className="text-sm font-semibold text-gray-800">Diciture da classificare</div>
          {restoConteggio && (
            <div className="text-xs text-gray-500">
              {numero(restoConteggio.diciture)} diciture, {numero(restoConteggio.righe)} righe, {euro(restoConteggio.lordo)}
            </div>
          )}
        </div>
        <div className="text-xs text-gray-500 mb-3">
          Hanno una dicitura, non hanno un prefisso di menu e non agganciano nessuna regola. Assegnarne una
          vale per tutte le righe con la stessa dicitura, passate e future: la decisione si prende una volta sola.
        </div>

        {dicitureResidue === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">
            Niente da classificare nel periodo scelto.
          </div>
        ) : (
          <div className="space-y-2">
            {resto.map(function(riga) {
              var aperta = inLavorazione === riga.descrizione;
              return (
                <div key={riga.descrizione} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm text-gray-800 break-words">{riga.descrizione}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {numero(riga.righe)} righe su {numero(riga.prenotazioni)} prenotazioni — {euro(riga.lordo)}
                      </div>
                    </div>
                    {puoAgganciare && !aperta && (
                      <button
                        type="button"
                        onClick={function() { apriAggancio(riga.descrizione); }}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium border bg-white text-wine-800 border-wine-300 hover:bg-wine-50">
                        Assegna a un gruppo
                      </button>
                    )}
                  </div>

                  {aperta && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                        Gruppi esistenti
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {gruppiEsistenti.map(function(nome) {
                          return (
                            <button
                              key={nome}
                              type="button"
                              disabled={salvataggio}
                              onClick={function() { aggancia(riga.descrizione, nome); }}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium border bg-white text-gray-700 border-gray-300 hover:border-wine-400 hover:text-wine-800">
                              {nome}
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                        Oppure un gruppo nuovo
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={gruppoNuovo}
                          onChange={function(e) { setGruppoNuovo(e.target.value); }}
                          placeholder="Nome del gruppo"
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-56"
                        />
                        <button
                          type="button"
                          disabled={salvataggio}
                          onClick={function() { aggancia(riga.descrizione, gruppoNuovo); }}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium border bg-wine-800 text-white border-wine-800 hover:bg-wine-900">
                          {salvataggio ? 'Salvo...' : 'Aggancia'}
                        </button>
                        <button
                          type="button"
                          onClick={chiudiAggancio}
                          className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-gray-700">
                          Annulla
                        </button>
                      </div>
                      {erroreAggancio && (
                        <div className="text-xs text-red-700 mt-2">{erroreAggancio}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {restoConteggio && Number(restoConteggio.diciture) > resto.length && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                Qui sotto sono mostrate le {numero(resto.length)} diciture che pesano di piu'. Ce ne sono
                altre {numero(Number(restoConteggio.diciture) - resto.length)}: compariranno man mano che
                agganci queste.
              </div>
            )}
          </div>
        )}

        {!puoAgganciare && dicitureResidue > 0 && (
          <div className="text-xs text-gray-400 mt-3">
            Per agganciare una dicitura serve il permesso di scrittura sulla parte economica.
          </div>
        )}
      </div>

    </div>
  );
}
