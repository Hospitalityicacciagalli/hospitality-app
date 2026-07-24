import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import SchedaFatturato from './SchedaFatturato';
import SchedaCanali from './SchedaCanali';
import SchedaConfronto from './SchedaConfronto';
import SchedaOccupazione from './SchedaOccupazione';
import SchedaOspiti from './SchedaOspiti';
import SchedaConsumi from './SchedaConsumi';
import SchedaPrenotazioni from './SchedaPrenotazioni';
import SchedaAnticipo from './SchedaAnticipo';

// ============================================================
// DASHBOARD HOTELINCLOUD — impalcatura
//
// Una sola pagina, le schede dentro. Ogni scheda e' un file suo e
// compare solo se l'utente ha il permesso indicato qui sotto.
//
// PERMESSI. Le schede che mostrano denaro sono hic_economico, quelle che
// mostrano soltanto numeri fisici sono hic_operativo. Consumi e
// Prenotazioni riga per riga sono economiche perche' mostrano importi —
// la seconda li mostra addirittura uno per uno — e la marcatura eventi
// che vive dentro Prenotazioni richiede la scrittura sulla parte
// economica.
//
// Le somme NON si fanno qui: Supabase restituisce al massimo 1.000
// righe per richiesta e taglia in silenzio, e gli addebiti sono
// 30.455. Tutte le aggregazioni arrivano gia' fatte dalle funzioni
// delle migrazioni 32, 33 e 34, dove stanno scritte una volta sola le
// regole della sezione 17.9 (mese di check-in, presente_in_hic,
// virtuali, caparre, valore zero, somma prima / arrotonda dopo).
// ============================================================

var SCHEDE = [
  { key: 'fatturato',    label: 'Fatturato',         permesso: 'hic_economico', componente: SchedaFatturato },
  { key: 'canali',       label: 'Canali',            permesso: 'hic_economico', componente: SchedaCanali },
  { key: 'confronto',    label: 'Confronto periodi', permesso: 'hic_economico', componente: SchedaConfronto },
  { key: 'occupazione',  label: 'Occupazione',       permesso: 'hic_operativo', componente: SchedaOccupazione },
  { key: 'ospiti',       label: 'Ospiti',            permesso: 'hic_operativo', componente: SchedaOspiti },
  { key: 'consumi',      label: 'Consumi',           permesso: 'hic_economico', componente: SchedaConsumi },
  { key: 'prenotazioni', label: 'Prenotazioni',      permesso: 'hic_economico', componente: SchedaPrenotazioni },
  { key: 'anticipo',     label: 'Anticipo',          permesso: 'hic_operativo', componente: SchedaAnticipo }
];

var PERIODI = [
  { key: 'anno',           label: 'Anno in corso' },
  { key: 'anno_prec',      label: 'Anno precedente' },
  { key: 'ultimi12',       label: 'Ultimi 12 mesi' },
  { key: 'tutto',          label: 'Tutto lo storico' },
  { key: 'personalizzato', label: 'Personalizzato' }
];

var PERIMETRI = [
  { key: 'standard',      label: 'Standard' },
  { key: 'con_annullate', label: 'Con annullate' },
  { key: 'tutto',         label: 'Tutto (riconciliazione)' }
];

var DESCRIZIONE_PERIMETRO = {
  standard: 'Prenotazioni confermate e valide non confermate. Fuori: annullate, blocchi di manutenzione, camere virtuali. Caparre sempre escluse.',
  con_annullate: 'Confermate, valide non confermate e annullate. Fuori: blocchi di manutenzione e camere virtuali. Caparre sempre escluse. Attenzione: fra le annullate ci sono anche i preventivi mai accettati, che non sono disdette.',
  tutto: 'Nessun filtro di stato: dentro anche blocchi e camere virtuali. Restano fuori solo le caparre. Serve per la riconciliazione con i documenti fiscali.'
};

var EVENTI = [
  { key: 'inclusi', label: 'Eventi inclusi' },
  { key: 'esclusi', label: 'Eventi esclusi' },
  { key: 'solo',    label: 'Solo eventi' }
];

var DESCRIZIONE_EVENTI = {
  inclusi: 'Le voci evento addebitate sulle prenotazioni camera sono contate nel fatturato.',
  esclusi: 'Le voci evento sono tolte dal fatturato: resti con il ricavo di camere e ristorante ordinario.',
  solo: 'Vedi soltanto le voci evento addebitate sulle prenotazioni camera.'
};

var CHIAVE_FILTRI = 'icg_hic_filtri';

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function iso(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

// Traduce il preset scelto in una coppia di date. null = nessun limite.
function calcolaPeriodo(preset, daManuale, aManuale) {
  var oggi = new Date();
  var anno = oggi.getFullYear();

  if (preset === 'anno') {
    return { da: anno + '-01-01', a: anno + '-12-31' };
  }
  if (preset === 'anno_prec') {
    return { da: (anno - 1) + '-01-01', a: (anno - 1) + '-12-31' };
  }
  if (preset === 'ultimi12') {
    var inizio = new Date(anno, oggi.getMonth() - 11, 1);
    var fine = new Date(anno, oggi.getMonth() + 1, 0);
    return { da: iso(inizio), a: iso(fine) };
  }
  if (preset === 'personalizzato') {
    return { da: daManuale || null, a: aManuale || null };
  }
  return { da: null, a: null };
}

function leggiFiltriSalvati() {
  try {
    var raw = localStorage.getItem(CHIAVE_FILTRI);
    if (!raw) return null;
    var f = JSON.parse(raw);
    if (!f || typeof f !== 'object') return null;
    return f;
  } catch (e) {
    return null;
  }
}

function formattaTimestamp(valore) {
  if (!valore) return null;
  try {
    var d = new Date(valore);
    if (isNaN(d.getTime())) return null;
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' alle ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  } catch (e) {
    return null;
  }
}

// Pulsante tappabile: niente <select> nativo (blocca l'iPad).
function Pillola(props) {
  var attiva = props.attiva;
  var classe = attiva
    ? 'px-3 py-1.5 rounded-lg text-sm font-medium border bg-wine-800 text-white border-wine-800'
    : 'px-3 py-1.5 rounded-lg text-sm font-medium border bg-white text-gray-700 border-gray-300 hover:border-wine-400 hover:text-wine-800';
  return (
    <button type="button" onClick={props.onClick} className={classe}>
      {props.children}
    </button>
  );
}

export default function HicDashboardPage() {
  var { canView } = useAuth();

  var salvati = leggiFiltriSalvati();

  var [preset, setPreset] = useState(salvati && salvati.preset ? salvati.preset : 'anno');
  var [daManuale, setDaManuale] = useState(salvati && salvati.daManuale ? salvati.daManuale : '');
  var [aManuale, setAManuale] = useState(salvati && salvati.aManuale ? salvati.aManuale : '');
  var [perimetro, setPerimetro] = useState(salvati && salvati.perimetro ? salvati.perimetro : 'standard');
  var [eventi, setEventi] = useState(salvati && salvati.eventi ? salvati.eventi : 'inclusi');

  var [aggiornatoAl, setAggiornatoAl] = useState(null);
  var [erroreSync, setErroreSync] = useState(null);

  // Schede visibili in base ai permessi: quelle non concesse non
  // esistono proprio, non compaiono spente.
  var schedeVisibili = [];
  for (var i = 0; i < SCHEDE.length; i++) {
    if (canView(SCHEDE[i].permesso)) schedeVisibili.push(SCHEDE[i]);
  }

  var primaScheda = schedeVisibili.length > 0 ? schedeVisibili[0].key : null;
  var [schedaAttiva, setSchedaAttiva] = useState(
    salvati && salvati.scheda ? salvati.scheda : primaScheda
  );

  // Se la scheda salvata non e' piu' visibile, ricado sulla prima.
  var schedaOk = false;
  for (var j = 0; j < schedeVisibili.length; j++) {
    if (schedeVisibili[j].key === schedaAttiva) schedaOk = true;
  }
  var schedaCorrente = schedaOk ? schedaAttiva : primaScheda;

  useEffect(function() {
    supabase.rpc('hic_ultimo_aggiornamento').then(function(res) {
      if (res.error) {
        setErroreSync(res.error.message);
        return;
      }
      setAggiornatoAl(res.data);
    });
  }, []);

  // Ricordo l'ultima selezione su QUESTO dispositivo.
  useEffect(function() {
    try {
      localStorage.setItem(CHIAVE_FILTRI, JSON.stringify({
        preset: preset,
        daManuale: daManuale,
        aManuale: aManuale,
        perimetro: perimetro,
        eventi: eventi,
        scheda: schedaCorrente
      }));
    } catch (e) {}
  }, [preset, daManuale, aManuale, perimetro, eventi, schedaCorrente]);

  var periodo = calcolaPeriodo(preset, daManuale, aManuale);
  var timestamp = formattaTimestamp(aggiornatoAl);

  var Corrente = null;
  for (var k = 0; k < schedeVisibili.length; k++) {
    if (schedeVisibili[k].key === schedaCorrente) Corrente = schedeVisibili[k].componente;
  }

  var etichettaPeriodo = 'tutto lo storico';
  if (periodo.da && periodo.a) {
    etichettaPeriodo = 'dal ' + periodo.da + ' al ' + periodo.a;
  } else if (periodo.da) {
    etichettaPeriodo = 'dal ' + periodo.da;
  } else if (periodo.a) {
    etichettaPeriodo = 'fino al ' + periodo.a;
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">

      {/* Intestazione */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard HotelInCloud</h1>
        <p className="text-sm text-gray-500 mt-1">
          camere e soggiorni — sola lettura, specchio di Hotel in Cloud
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {timestamp
            ? 'Dati aggiornati al ' + timestamp
            : (erroreSync ? 'Impossibile leggere la data di aggiornamento' : 'Nessun aggiornamento registrato')}
        </p>
      </div>

      {/* Barra dei filtri comuni a tutte le schede */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">

        <div className="mb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Periodo</div>
          <div className="flex flex-wrap gap-2">
            {PERIODI.map(function(p) {
              return (
                <Pillola
                  key={p.key}
                  attiva={preset === p.key}
                  onClick={function() { setPreset(p.key); }}>
                  {p.label}
                </Pillola>
              );
            })}
          </div>
          {preset === 'personalizzato' && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-sm text-gray-600">dal</span>
              <input
                type="date"
                value={daManuale}
                onChange={function(e) { setDaManuale(e.target.value); }}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
              <span className="text-sm text-gray-600">al</span>
              <input
                type="date"
                value={aManuale}
                onChange={function(e) { setAManuale(e.target.value); }}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
          )}
        </div>

        <div className="mb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Perimetro</div>
          <div className="flex flex-wrap gap-2">
            {PERIMETRI.map(function(p) {
              return (
                <Pillola
                  key={p.key}
                  attiva={perimetro === p.key}
                  onClick={function() { setPerimetro(p.key); }}>
                  {p.label}
                </Pillola>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Voci evento</div>
          <div className="flex flex-wrap gap-2">
            {EVENTI.map(function(p) {
              return (
                <Pillola
                  key={p.key}
                  attiva={eventi === p.key}
                  onClick={function() { setEventi(p.key); }}>
                  {p.label}
                </Pillola>
              );
            })}
          </div>
        </div>

        {/* Il perimetro attivo dichiarato per esteso, sempre.
            L'asse temporale NON si dichiara qui: non e' lo stesso per tutte
            le schede. Occupazione attribuisce le notti al giorno in cui sono
            state dormite, le altre al mese di check-in. Ogni scheda lo dice
            nella propria intestazione, dove e' vero. */}
        <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-1">
          <div><span className="font-semibold text-gray-600">Periodo attivo:</span> {etichettaPeriodo}.</div>
          <div><span className="font-semibold text-gray-600">Perimetro attivo:</span> {DESCRIZIONE_PERIMETRO[perimetro]}</div>
          <div><span className="font-semibold text-gray-600">Voci evento:</span> {DESCRIZIONE_EVENTI[eventi]}</div>
          <div className="text-gray-400">
            Perimetro e voci evento valgono per le schede economiche. Occupazione, Ospiti e Anticipo
            lavorano sempre sul perimetro standard e lo dichiarano in cima.
          </div>
        </div>
      </div>

      {/* Linguette */}
      {schedeVisibili.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 text-sm">
          Nessuna scheda disponibile con i permessi attuali.
          <div className="text-xs text-gray-400 mt-2">
            Servono il permesso hic_economico per le schede di fatturato e il permesso hic_operativo
            per quelle di occupazione e ospiti.
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-200 pb-2">
            {schedeVisibili.map(function(s) {
              var classe = (s.key === schedaCorrente)
                ? 'px-4 py-2 rounded-lg text-sm font-semibold bg-wine-50 text-wine-900 border border-wine-200'
                : 'px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-transparent hover:bg-gray-50';
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={function() { setSchedaAttiva(s.key); }}
                  className={classe}>
                  {s.label}
                </button>
              );
            })}
          </div>

          {Corrente && (
            <Corrente
              da={periodo.da}
              a={periodo.a}
              perimetro={perimetro}
              eventi={eventi}
            />
          )}
        </>
      )}

    </div>
  );
}
