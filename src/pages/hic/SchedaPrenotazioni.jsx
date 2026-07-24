import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { euro, numero, percentuale } from './formati';

// ============================================================
// SCHEDA PRENOTAZIONI RIGA PER RIGA
//
// E' l'unica scheda che mostra righe, ed e' quella dove il limite delle
// 1.000 righe di Supabase morderebbe davvero: gli addebiti sono 30.455.
// Per questo la paginazione la fa il DATABASE (filtri, ordinamento,
// limite e scostamento sono tutti lato SQL) e il conteggio totale arriva
// da una funzione a parte. Non si scarica mai piu' di una pagina.
//
// LE MEDIE stanno qui e non nella scheda Ospiti per un motivo pratico:
// qui sotto hai l'elenco vero delle righe che le compongono, quindi se un
// numero ti sembra strano puoi guardare da dove viene.
//
// REGOLA 15 — a valore zero. Le prenotazioni con anche una sola riga a
// zero (gift card, omaggi, servizi gia' scontrinati) NON entrano nel
// denominatore delle medie: contano le persone e le notti ma non hanno
// portato denaro qui dentro, e abbasserebbero lo scontrino medio proprio
// negli anni in cui hai venduto piu' gift card. Quante sono e quanta
// capacita' hanno assorbito e' sempre scritto sotto le medie.
//
// IL PANNELLO DI MARCATURA ignora di proposito perimetro e filtro voci
// evento: se il filtro fosse su "esclusi" non potresti mai raggiungere
// una voce per smarcarla. Il periodo invece vale.
// ============================================================

var PAGINA = 50;

var ORDINAMENTI = [
  { key: 'data_desc',    label: "Piu' recenti" },
  { key: 'data_asc',     label: "Piu' vecchie" },
  { key: 'importo_desc', label: 'Importo alto' },
  { key: 'importo_asc',  label: 'Importo basso' }
];

var STATI_MARCATURA = [
  { key: 'da_rivedere', label: 'Da rivedere' },
  { key: 'marcate',     label: "Gia' marcate" },
  { key: 'tutte',       label: 'Tutte' }
];

function Pillola(props) {
  var classe = props.attiva
    ? 'px-3 py-1.5 rounded-lg text-sm font-medium border bg-wine-800 text-white border-wine-800'
    : 'px-3 py-1.5 rounded-lg text-sm font-medium border bg-white text-gray-700 border-gray-300 hover:border-wine-400 hover:text-wine-800';
  return (
    <button type="button" onClick={props.onClick} className={classe}>
      {props.children}
    </button>
  );
}

function Kpi(props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">{props.titolo}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{props.valore}</div>
      {props.nota && <div className="text-xs text-gray-500 mt-1">{props.nota}</div>}
    </div>
  );
}

function dataBreve(iso) {
  if (!iso) return '—';
  var p = String(iso).split('-');
  if (p.length < 3) return String(iso);
  return p[2] + '/' + p[1] + '/' + p[0];
}

export default function SchedaPrenotazioni(props) {
  var da = props.da;
  var a = props.a;
  var perimetro = props.perimetro;
  var eventi = props.eventi;

  var auth = useAuth();
  var puoMarcare = auth.canEdit('hic_economico');
  var firma = auth.elevato && auth.elevazione
    ? auth.elevazione.nome
    : (auth.profile && auth.profile.nome ? auth.profile.nome : (auth.user ? auth.user.email : null));

  var [vista, setVista] = useState('elenco');

  // --- Elenco ---
  var [medie, setMedie] = useState(null);
  var [categorie, setCategorie] = useState([]);
  var [conteggio, setConteggio] = useState(null);
  var [righe, setRighe] = useState([]);
  var [testo, setTesto] = useState('');
  var [testoAttivo, setTestoAttivo] = useState('');
  var [categoria, setCategoria] = useState(null);
  var [ordine, setOrdine] = useState('data_desc');
  var [pagina, setPagina] = useState(0);
  var [caricamento, setCaricamento] = useState(true);
  var [errore, setErrore] = useState(null);

  // --- Marcatura ---
  var [statoMarcatura, setStatoMarcatura] = useState('da_rivedere');
  var [marcConteggio, setMarcConteggio] = useState(null);
  var [marcElenco, setMarcElenco] = useState([]);
  var [marcPagina, setMarcPagina] = useState(0);
  var [marcCaricamento, setMarcCaricamento] = useState(false);
  var [marcErrore, setMarcErrore] = useState(null);
  var [inSalvataggio, setInSalvataggio] = useState(null);
  var [giroMarcatura, setGiroMarcatura] = useState(0);

  // I filtri della barra o dei pulsanti riportano sempre alla prima pagina.
  useEffect(function() {
    setPagina(0);
  }, [da, a, perimetro, eventi, testoAttivo, categoria, ordine]);

  useEffect(function() {
    setMarcPagina(0);
  }, [da, a, statoMarcatura]);

  useEffect(function() {
    var annullato = false;
    setCaricamento(true);
    setErrore(null);

    var base = { p_da: da, p_a: a, p_perimetro: perimetro, p_eventi: eventi };
    var filtri = {
      p_da: da, p_a: a, p_perimetro: perimetro, p_eventi: eventi,
      p_testo: testoAttivo ? testoAttivo : null,
      p_categoria: categoria
    };

    Promise.all([
      supabase.rpc('hic_medie', base),
      supabase.rpc('hic_per_categoria', base),
      supabase.rpc('hic_elenco_righe_conteggio', filtri),
      supabase.rpc('hic_elenco_righe', {
        p_da: da, p_a: a, p_perimetro: perimetro, p_eventi: eventi,
        p_testo: testoAttivo ? testoAttivo : null,
        p_categoria: categoria,
        p_ordine: ordine,
        p_limite: PAGINA,
        p_offset: pagina * PAGINA
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
      var m = risposte[0].data;
      setMedie(m && m.length > 0 ? m[0] : null);
      setCategorie(risposte[1].data || []);
      var c = risposte[2].data;
      setConteggio(c && c.length > 0 ? c[0] : null);
      setRighe(risposte[3].data || []);
      setCaricamento(false);
    });

    return function() { annullato = true; };
  }, [da, a, perimetro, eventi, testoAttivo, categoria, ordine, pagina]);

  useEffect(function() {
    if (vista !== 'marcatura') return;
    var annullato = false;
    setMarcCaricamento(true);
    setMarcErrore(null);

    Promise.all([
      supabase.rpc('hic_eventi_da_rivedere_conteggio', { p_da: da, p_a: a, p_stato: statoMarcatura }),
      supabase.rpc('hic_eventi_da_rivedere', {
        p_da: da, p_a: a, p_stato: statoMarcatura,
        p_limite: PAGINA, p_offset: marcPagina * PAGINA
      })
    ]).then(function(risposte) {
      if (annullato) return;
      for (var i = 0; i < risposte.length; i++) {
        if (risposte[i].error) {
          setMarcErrore(risposte[i].error.message);
          setMarcCaricamento(false);
          return;
        }
      }
      var c = risposte[0].data;
      setMarcConteggio(c && c.length > 0 ? c[0] : null);
      setMarcElenco(risposte[1].data || []);
      setMarcCaricamento(false);
    });

    return function() { annullato = true; };
  }, [vista, da, a, statoMarcatura, marcPagina, giroMarcatura]);

  function cerca() {
    setTestoAttivo(testo.trim());
  }

  function azzeraRicerca() {
    setTesto('');
    setTestoAttivo('');
  }

  function marca(reservationId, marcatura) {
    setInSalvataggio(reservationId);
    setMarcErrore(null);
    supabase
      .from('hic_marcature_evento')
      .upsert({
        reservation_id: reservationId,
        marcatura: marcatura,
        marcato_da: firma,
        marcato_il: new Date().toISOString()
      }, { onConflict: 'reservation_id' })
      .then(function(res) {
        setInSalvataggio(null);
        if (res.error) {
          setMarcErrore(res.error.message);
          return;
        }
        setGiroMarcatura(giroMarcatura + 1);
      });
  }

  function togliMarcatura(reservationId) {
    setInSalvataggio(reservationId);
    setMarcErrore(null);
    supabase
      .from('hic_marcature_evento')
      .delete()
      .eq('reservation_id', reservationId)
      .then(function(res) {
        setInSalvataggio(null);
        if (res.error) {
          setMarcErrore(res.error.message);
          return;
        }
        setGiroMarcatura(giroMarcatura + 1);
      });
  }

  var righeTotali = conteggio ? Number(conteggio.righe) : 0;
  var ultimaPagina = righeTotali > 0 ? Math.ceil(righeTotali / PAGINA) - 1 : 0;

  var marcTotali = marcConteggio ? Number(marcConteggio.prenotazioni) : 0;
  var marcUltimaPagina = marcTotali > 0 ? Math.ceil(marcTotali / PAGINA) - 1 : 0;

  return (
    <div className="space-y-5">

      {/* Quale dei due mestieri */}
      <div className="flex flex-wrap gap-2">
        <Pillola attiva={vista === 'elenco'} onClick={function() { setVista('elenco'); }}>
          Elenco e medie
        </Pillola>
        <Pillola attiva={vista === 'marcatura'} onClick={function() { setVista('marcatura'); }}>
          Marcatura eventi
        </Pillola>
      </div>

      {vista === 'elenco' && (
        <>
          {errore && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
              Errore nella lettura dei dati: {errore}
            </div>
          )}

          {/* Medie */}
          {medie && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Kpi
                  titolo="Per prenotazione"
                  valore={medie.per_prenotazione_lordo === null ? '—' : euro(medie.per_prenotazione_lordo)}
                  nota={medie.per_prenotazione_netto === null ? null : euro(medie.per_prenotazione_netto) + ' netti'}
                />
                <Kpi
                  titolo="Per ospite"
                  valore={medie.per_ospite_lordo === null ? '—' : euro(medie.per_ospite_lordo)}
                  nota={medie.per_ospite_netto === null ? null : euro(medie.per_ospite_netto) + ' netti'}
                />
                <Kpi
                  titolo="Per notte"
                  valore={medie.per_notte_lordo === null ? '—' : euro(medie.per_notte_lordo)}
                  nota={medie.per_notte_netto === null ? null : euro(medie.per_notte_netto) + ' netti'}
                />
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4 text-xs text-gray-500 space-y-1">
                <div>
                  <span className="font-semibold text-gray-600">Su cosa sono calcolate:</span>{' '}
                  {numero(medie.prenotazioni_base)} prenotazioni piene, {numero(medie.ospiti_base)} ospiti,
                  {' '}{numero(medie.notti_base)} notti, {euro(medie.lordo_base)} lordi.
                </div>
                <div>
                  <span className="font-semibold text-gray-600">Escluse dal calcolo:</span>{' '}
                  <span className={Number(medie.escluse_prenotazioni) > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-gray-700'}>
                    {numero(medie.escluse_prenotazioni)}
                  </span>
                  {' '}prenotazioni a valore zero, in tutto o in parte
                  {medie.escluse_quota === null ? '' : ' (' + percentuale(medie.escluse_quota) + ')'} —
                  {' '}{numero(medie.escluse_notti)} notti e {numero(medie.escluse_ospiti)} ospiti.
                </div>
                <div className="pt-1 text-gray-400">
                  Sono gift card, omaggi e servizi gia' scontrinati: il soggiorno c'e' stato, il denaro
                  e' entrato prima e altrove. Contarli nel diviso farebbe scendere lo scontrino medio
                  senza che sia mai mancato un euro.
                </div>
              </div>
            </>
          )}

          {/* Filtri dell'elenco */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Cerca</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={testo}
                  onChange={function(e) { setTesto(e.target.value); }}
                  onKeyDown={function(e) { if (e.key === 'Enter') cerca(); }}
                  placeholder="Dicitura, ospite o codice prenotazione"
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-72"
                />
                <button
                  type="button"
                  onClick={cerca}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium border bg-wine-800 text-white border-wine-800 hover:bg-wine-900">
                  Cerca
                </button>
                {testoAttivo && (
                  <button
                    type="button"
                    onClick={azzeraRicerca}
                    className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-gray-700">
                    Togli il filtro
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Categoria</div>
              <div className="flex flex-wrap gap-2">
                <Pillola attiva={categoria === null} onClick={function() { setCategoria(null); }}>
                  Tutte
                </Pillola>
                {categorie.map(function(c) {
                  return (
                    <Pillola
                      key={String(c.categoria_num)}
                      attiva={categoria === c.categoria_num}
                      onClick={function() { setCategoria(c.categoria_num); }}>
                      {c.categoria}
                    </Pillola>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Ordine</div>
              <div className="flex flex-wrap gap-2">
                {ORDINAMENTI.map(function(o) {
                  return (
                    <Pillola key={o.key} attiva={ordine === o.key} onClick={function() { setOrdine(o.key); }}>
                      {o.label}
                    </Pillola>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Elenco */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <div className="text-sm font-semibold text-gray-800">Righe di addebito</div>
              {conteggio && (
                <div className="text-xs text-gray-500">
                  {numero(conteggio.righe)} righe su {numero(conteggio.prenotazioni)} prenotazioni —
                  {' '}{euro(conteggio.lordo)} lordi, {euro(conteggio.netto)} netti
                  {Number(conteggio.righe_zero) > 0 && (
                    <span>, di cui {numero(conteggio.righe_zero)} a zero</span>
                  )}
                </div>
              )}
            </div>

            {caricamento ? (
              <div className="text-sm text-gray-400 py-8 text-center">Caricamento...</div>
            ) : righe.length === 0 ? (
              <div className="text-sm text-gray-400 py-6 text-center">Nessuna riga con questi filtri.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-200">
                      <th className="py-2 pr-3 font-semibold">Arrivo</th>
                      <th className="py-2 px-3 font-semibold">Ospite</th>
                      <th className="py-2 px-3 font-semibold">Categoria</th>
                      <th className="py-2 px-3 font-semibold">Dicitura</th>
                      <th className="py-2 px-3 font-semibold text-right">Notti</th>
                      <th className="py-2 px-3 font-semibold text-right">Lordo</th>
                      <th className="py-2 pl-3 font-semibold text-right">Netto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {righe.map(function(r) {
                      return (
                        <tr key={r.addebito_id} className="border-b border-gray-100">
                          <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{dataBreve(r.check_in)}</td>
                          <td className="py-2 px-3 text-gray-800">
                            {r.ospite || '—'}
                            {r.codice_pren && (
                              <span className="block text-xs text-gray-400">{r.codice_pren}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-gray-500">{r.categoria || '—'}</td>
                          <td className="py-2 px-3 text-gray-800">
                            {r.descrizione || <span className="text-gray-400 italic">senza dicitura</span>}
                            {r.voce_evento && (
                              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-wine-100 text-wine-800 border border-wine-200">
                                evento
                              </span>
                            )}
                            {r.marcata_a_mano && (
                              <span className="ml-1 text-xs text-gray-400">a mano</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-gray-500">{numero(r.quantita)}</td>
                          <td className={r.a_valore_zero
                            ? 'py-2 px-3 text-right tabular-nums text-amber-700'
                            : 'py-2 px-3 text-right tabular-nums text-gray-900'}>
                            {euro(r.importo)}
                          </td>
                          <td className="py-2 pl-3 text-right tabular-nums text-gray-600">{euro(r.imponibile)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginazione: la fa il database, qui si chiede solo la pagina */}
            {righeTotali > PAGINA && (
              <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  disabled={pagina <= 0}
                  onClick={function() { setPagina(pagina - 1); }}
                  className={pagina <= 0
                    ? 'px-3 py-1.5 rounded-lg text-sm font-medium border bg-gray-50 text-gray-300 border-gray-200'
                    : 'px-3 py-1.5 rounded-lg text-sm font-medium border bg-white text-wine-800 border-wine-300 hover:bg-wine-50'}>
                  Precedenti
                </button>
                <div className="text-xs text-gray-500">
                  Pagina {numero(pagina + 1)} di {numero(ultimaPagina + 1)}
                </div>
                <button
                  type="button"
                  disabled={pagina >= ultimaPagina}
                  onClick={function() { setPagina(pagina + 1); }}
                  className={pagina >= ultimaPagina
                    ? 'px-3 py-1.5 rounded-lg text-sm font-medium border bg-gray-50 text-gray-300 border-gray-200'
                    : 'px-3 py-1.5 rounded-lg text-sm font-medium border bg-white text-wine-800 border-wine-300 hover:bg-wine-50'}>
                  Successive
                </button>
              </div>
            )}

            <div className="text-xs text-gray-400 mt-3">
              Gli importi in ambra sono righe a zero. I totali qui sopra sono calcolati dal database
              sull'intero filtro, non sulla pagina che stai guardando.
            </div>
          </div>
        </>
      )}

      {vista === 'marcatura' && (
        <>
          <div className="bg-wine-50 border border-wine-200 rounded-xl p-4 text-xs text-wine-900 space-y-1">
            <div>
              Il sistema propone come evento le righe che nominano un evento. Puo' sbagliare in due modi:
              chiamare evento cio' che non lo e', e non vedere un evento scritto senza dirlo — una
              &quot;menu comunione&quot; e' un evento anche se la parola non compare.
            </div>
            <div>
              <span className="font-semibold">La tua marcatura vince sempre</span> sulla proposta automatica,
              e vale per tutta la prenotazione.
            </div>
            <div>
              Questo pannello ignora il perimetro e il filtro voci evento della barra in alto: altrimenti,
              con il filtro su &quot;esclusi&quot;, non potresti mai raggiungere una voce per smarcarla. Il periodo vale.
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Cosa vedere</div>
            <div className="flex flex-wrap gap-2">
              {STATI_MARCATURA.map(function(s) {
                return (
                  <Pillola
                    key={s.key}
                    attiva={statoMarcatura === s.key}
                    onClick={function() { setStatoMarcatura(s.key); }}>
                    {s.label}
                  </Pillola>
                );
              })}
            </div>
            {marcConteggio && (
              <div className="text-xs text-gray-500 mt-3">
                {numero(marcConteggio.prenotazioni)} prenotazioni — {euro(marcConteggio.lordo_evento)} di voci
                riconosciute come evento.
              </div>
            )}
          </div>

          {marcErrore && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
              Errore: {marcErrore}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            {marcCaricamento ? (
              <div className="text-sm text-gray-400 py-8 text-center">Caricamento...</div>
            ) : marcElenco.length === 0 ? (
              <div className="text-sm text-gray-400 py-6 text-center">Nessuna prenotazione con questi filtri.</div>
            ) : (
              <div className="space-y-2">
                {marcElenco.map(function(p) {
                  var occupato = inSalvataggio === p.reservation_id;
                  return (
                    <div key={p.reservation_id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm text-gray-800">
                            {p.ospite || '—'}
                            <span className="ml-2 text-xs text-gray-400">{p.codice_pren || ''}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            arrivo {dataBreve(p.check_in)} — {p.canale || 'canale sconosciuto'} — {p.stato}
                          </div>
                          <div className="text-xs text-gray-600 mt-1 break-words">
                            {p.diciture || <span className="text-gray-400 italic">nessuna dicitura riconosciuta come evento</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {numero(p.righe_evento)} righe evento su {euro(p.lordo_evento)} — totale prenotazione {euro(p.lordo_totale)}
                          </div>
                          {p.marcatura && (
                            <div className="text-xs mt-1">
                              <span className={p.marcatura === 'evento'
                                ? 'px-2 py-0.5 rounded-full bg-wine-100 text-wine-800 border border-wine-200'
                                : 'px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200'}>
                                {p.marcatura === 'evento' ? "marcata: e' un evento" : "marcata: non e' un evento"}
                              </span>
                              {p.marcato_da && <span className="ml-2 text-gray-400">da {p.marcato_da}</span>}
                            </div>
                          )}
                        </div>

                        {puoMarcare && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={occupato}
                              onClick={function() { marca(p.reservation_id, 'evento'); }}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium border bg-white text-wine-800 border-wine-300 hover:bg-wine-50">
                              E' un evento
                            </button>
                            <button
                              type="button"
                              disabled={occupato}
                              onClick={function() { marca(p.reservation_id, 'non_evento'); }}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium border bg-white text-gray-700 border-gray-300 hover:border-gray-400">
                              Non e' un evento
                            </button>
                            {p.marcatura && (
                              <button
                                type="button"
                                disabled={occupato}
                                onClick={function() { togliMarcatura(p.reservation_id); }}
                                className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-red-700">
                                Togli
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {marcTotali > PAGINA && (
              <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  disabled={marcPagina <= 0}
                  onClick={function() { setMarcPagina(marcPagina - 1); }}
                  className={marcPagina <= 0
                    ? 'px-3 py-1.5 rounded-lg text-sm font-medium border bg-gray-50 text-gray-300 border-gray-200'
                    : 'px-3 py-1.5 rounded-lg text-sm font-medium border bg-white text-wine-800 border-wine-300 hover:bg-wine-50'}>
                  Precedenti
                </button>
                <div className="text-xs text-gray-500">
                  Pagina {numero(marcPagina + 1)} di {numero(marcUltimaPagina + 1)}
                </div>
                <button
                  type="button"
                  disabled={marcPagina >= marcUltimaPagina}
                  onClick={function() { setMarcPagina(marcPagina + 1); }}
                  className={marcPagina >= marcUltimaPagina
                    ? 'px-3 py-1.5 rounded-lg text-sm font-medium border bg-gray-50 text-gray-300 border-gray-200'
                    : 'px-3 py-1.5 rounded-lg text-sm font-medium border bg-white text-wine-800 border-wine-300 hover:bg-wine-50'}>
                  Successive
                </button>
              </div>
            )}

            {!puoMarcare && (
              <div className="text-xs text-gray-400 mt-3">
                Per marcare una prenotazione serve il permesso di scrittura sulla parte economica.
              </div>
            )}
          </div>
        </>
      )}

    </div>
  );
}
