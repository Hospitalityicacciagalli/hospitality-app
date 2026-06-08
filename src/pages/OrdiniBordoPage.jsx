import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

var STATI = [
  { value: 'nuovo',           label: 'Nuovo',          color: 'bg-amber-100 text-amber-800' },
  { value: 'in_preparazione', label: 'In preparazione', color: 'bg-blue-100 text-blue-800' },
  { value: 'consegnato',      label: 'Consegnato',     color: 'bg-green-100 text-green-800' },
  { value: 'annullato',       label: 'Annullato',      color: 'bg-gray-200 text-gray-600' }
];

function statoInfo(stato) {
  var found = STATI.find(function(s) { return s.value === stato; });
  return found || { value: stato, label: stato, color: 'bg-gray-100 text-gray-700' };
}

function luogoLabel(luogo) {
  if (luogo === 'piscina') return '🏊 Piscina';
  if (luogo === 'biolago') return '🌿 Biolago';
  return luogo;
}

export default function OrdiniBordoPage() {
  var [ordini, setOrdini] = useState([]);
  var [loading, setLoading] = useState(true);
  var [error, setError] = useState(null);
  var [filtro, setFiltro] = useState('attivi');

  // Allarme sonoro/visivo
  var [allarme, setAllarme] = useState(false);
  var [audioPronto, setAudioPronto] = useState(false);
  var audioCtxRef = useRef(null);
  var intervalRef = useRef(null);

  // ---- Audio ----
  function ensureAudio() {
    try {
      if (!audioCtxRef.current) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audioCtxRef.current = new Ctx();
      }
      audioCtxRef.current.resume().then(function() {
        setAudioPronto(true);
      });
    } catch (e) {
      // silenzioso
    }
  }

  function beepOnce() {
    var ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 1000;
      var t = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.start(t);
      osc.stop(t + 0.3);
    } catch (e) {
      // silenzioso
    }
  }

  function stopAllarme() {
    setAllarme(false);
  }

  // Sblocca l'audio al primo tocco/click in pagina (in aggiunta al pulsante)
  useEffect(function() {
    function unlock() {
      ensureAudio();
    }
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
    return function() {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Ciclo dell'allarme: suono ripetuto + vibrazione finche' allarme e' attivo
  useEffect(function() {
    if (!allarme) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (navigator.vibrate) {
        try { navigator.vibrate(0); } catch (e) {}
      }
      return;
    }

    function tick() {
      beepOnce();
      if (navigator.vibrate) {
        try { navigator.vibrate(500); } catch (e) {}
      }
    }

    tick();
    var id = setInterval(tick, 1000);
    intervalRef.current = id;

    return function() {
      clearInterval(id);
      if (navigator.vibrate) {
        try { navigator.vibrate(0); } catch (e) {}
      }
    };
  }, [allarme]);

  // ---- Dati ----
  function caricaOrdini() {
    supabase
      .from('ordini_bordo')
      .select('*, ordini_bordo_righe(*)')
      .order('created_at', { ascending: false })
      .then(function(result) {
        setLoading(false);
        if (result.error) {
          setError('Errore caricamento ordini: ' + result.error.message);
        } else {
          setError(null);
          setOrdini(result.data || []);
        }
      });
  }

  useEffect(function() {
    caricaOrdini();

    var channel = supabase
      .channel('ordini-bordo-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordini_bordo' }, function(payload) {
        caricaOrdini();
        if (payload.eventType === 'INSERT') {
          setAllarme(true);
        }
      })
      .subscribe();

    return function() {
      supabase.removeChannel(channel);
    };
  }, []);

  function cambiaStato(ordine, nuovoStato) {
    // Prendere in carico un ordine ferma anche l'allarme
    stopAllarme();
    supabase
      .from('ordini_bordo')
      .update({ stato: nuovoStato })
      .eq('id', ordine.id)
      .then(function(result) {
        if (!result.error) {
          caricaOrdini();
        } else {
          setError('Errore aggiornamento: ' + result.error.message);
        }
      });
  }

  function oraDi(iso) {
    try {
      return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  var ordiniFiltrati = ordini.filter(function(o) {
    if (filtro === 'attivi') return o.stato === 'nuovo' || o.stato === 'in_preparazione';
    if (filtro === 'tutti') return true;
    return o.stato === filtro;
  });

  var conteggioAttivi = ordini.filter(function(o) { return o.stato === 'nuovo' || o.stato === 'in_preparazione'; }).length;

  return (
    <div className="p-6">

      {/* Banner allarme nuovo ordine */}
      {allarme && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-4 flex items-center justify-between shadow-lg animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔔</span>
            <span className="font-bold text-lg">Nuovo ordine in arrivo!</span>
          </div>
          <button
            onClick={stopAllarme}
            className="bg-white text-red-700 px-5 py-2.5 rounded-lg font-semibold text-base hover:bg-red-50"
          >
            Tacita
          </button>
        </div>
      )}

      <div className={'flex items-center justify-between mb-6 flex-wrap gap-3 ' + (allarme ? 'mt-16' : '')}>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ordini Bordo</h1>
          <p className="text-gray-500 mt-1 text-sm">{conteggioAttivi} ordini da gestire</p>
        </div>
        {!audioPronto && (
          <button
            onClick={ensureAudio}
            className="bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            🔔 Attiva avvisi sonori
          </button>
        )}
        {audioPronto && (
          <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">Avvisi sonori attivi</span>
        )}
      </div>

      {!audioPronto && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Per sentire l'allarme all'arrivo degli ordini, tocca una volta "Attiva avvisi sonori" a inizio turno. Tieni il dispositivo con il volume alto e non in silenzioso.
        </div>
      )}

      {/* Filtri */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <button
          onClick={function() { setFiltro('attivi'); }}
          className={'px-3 py-1.5 rounded-lg text-sm font-medium border ' + (filtro === 'attivi' ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-600 border-gray-300')}
        >
          Da gestire
        </button>
        <button
          onClick={function() { setFiltro('tutti'); }}
          className={'px-3 py-1.5 rounded-lg text-sm font-medium border ' + (filtro === 'tutti' ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-600 border-gray-300')}
        >
          Tutti
        </button>
        {STATI.map(function(s) {
          return (
            <button
              key={s.value}
              onClick={function() { setFiltro(s.value); }}
              className={'px-3 py-1.5 rounded-lg text-sm font-medium border ' + (filtro === s.value ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-600 border-gray-300')}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Caricamento ordini...</div>
      ) : ordiniFiltrati.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
          Nessun ordine in questa vista.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ordiniFiltrati.map(function(o) {
            var info = statoInfo(o.stato);
            var righe = o.ordini_bordo_righe || [];
            return (
              <div key={o.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">Camera {o.numero_camera}</div>
                    <div className="text-xs text-gray-500">{o.nome_cliente}</div>
                  </div>
                  <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + info.color}>
                    {info.label}
                  </span>
                </div>

                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-700">{luogoLabel(o.luogo)}</span>
                  <span className="text-gray-400 text-xs">{oraDi(o.created_at)}</span>
                </div>

                <div className="px-4 py-2 flex-1">
                  <ul className="space-y-1">
                    {righe.map(function(r) {
                      return (
                        <li key={r.id} className="flex justify-between text-sm text-gray-700">
                          <span><span className="font-medium">{r.quantita}×</span> {r.nome}</span>
                          <span className="text-gray-400">€ {(Number(r.prezzo) * r.quantita).toFixed(2)}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {o.note && (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-100 rounded text-xs text-amber-800">
                      {o.note}
                    </div>
                  )}
                </div>

                <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
                  <span className="font-semibold text-gray-900">€ {Number(o.totale).toFixed(2)}</span>
                </div>

                <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap gap-2">
                  {o.stato === 'nuovo' && (
                    <button
                      onClick={function() { cambiaStato(o, 'in_preparazione'); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
                    >
                      In preparazione
                    </button>
                  )}
                  {(o.stato === 'nuovo' || o.stato === 'in_preparazione') && (
                    <button
                      onClick={function() { cambiaStato(o, 'consegnato'); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium"
                    >
                      Consegnato
                    </button>
                  )}
                  {(o.stato === 'nuovo' || o.stato === 'in_preparazione') && (
                    <button
                      onClick={function() { cambiaStato(o, 'annullato'); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 font-medium"
                    >
                      Annulla
                    </button>
                  )}
                  {(o.stato === 'consegnato' || o.stato === 'annullato') && (
                    <button
                      onClick={function() { cambiaStato(o, 'nuovo'); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium"
                    >
                      Riapri
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
