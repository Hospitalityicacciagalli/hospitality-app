import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// ============================================================
// CAMERE E COLAZIONI — l'operativo del giorno
//
// COSA E' E COSA NON E'.
// E' uno SPECCHIO di Hotel in Cloud, aggiornato cinque volte al
// giorno. Serve a non dover aprire HiC per sapere quante persone
// fanno colazione e chi c'e' in casa. NON e' l'agenda viva: chi
// deve sapere se una camera stanotte e' libera apre Hotel in Cloud.
// Per questo la pagina non elenca le camere libere e non scrive mai
// la parola "libera": dice quante ne sono occupate, e basta.
//
// UNA DOMANDA SOLA, DUE VISTE.
// La colazione della mattina dopo la fa chi ha dormito la notte
// prima: e' lo stesso identico insieme di persone. Quindi non ci
// sono due interrogazioni, ce n'e' una — la notte del giorno scelto —
// e le due linguette la guardano da due lati.
//
// LE SOMME NON SI FANNO QUI. Arrivano gia' fatte dalla migrazione
// 46: hic_camere_notte(n) per l'elenco e hic_camere_notte_totale(n)
// per i numeri. La regola di chi conta come presente vive in
// hic_perimetro_ok(..., 'standard') e non e' riscritta qui dentro
// (regola 31). Se un giorno cambia, cambia in un posto solo.
//
// board_type NON E' USATO, DI PROPOSITO. Decisione di Florestano:
// se uno ha dormito, la colazione la fa. Nessuna eccezione, nessun
// filtro sul trattamento.
//
// checkin_status e' MOSTRATO ma non FILTRA MAI. Dice se HiC ha
// registrato l'arrivo, non se la persona dorme qui: chi arriva
// stasera risulta "non ancora arrivato" e la sua colazione va
// contata lo stesso.
// ============================================================

var GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
            'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// Prima di quest'ora, "oggi" per il calendario e' gia' cambiato ma
// per l'albergo no: alle due di notte la notte in corso e' ancora
// quella di ieri. Chi guarda a quell'ora deve vedere chi sta
// dormendo adesso, non chi arriva stasera.
var ORA_CAMBIO_NOTTE = 5;

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function iso(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

// Da 'AAAA-MM-GG' a Date locale. Non si usa new Date(stringa): quella
// interpreta il testo come UTC e sul fuso italiano puo' tornare
// indietro di un giorno.
function daIso(s) {
  if (!s) return null;
  var p = s.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function spostaGiorni(s, n) {
  var d = daIso(s);
  if (!d) return s;
  d.setDate(d.getDate() + n);
  return iso(d);
}

function notteCorrente() {
  var ora = new Date();
  if (ora.getHours() < ORA_CAMBIO_NOTTE) ora.setDate(ora.getDate() - 1);
  return iso(ora);
}

function dataLunga(s) {
  var d = daIso(s);
  if (!d) return '';
  return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear();
}

function dataBreve(s) {
  var d = daIso(s);
  if (!d) return '—';
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1);
}

function quandoLungo(valore) {
  if (!valore) return null;
  var d = new Date(valore);
  if (isNaN(d.getTime())) return null;
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() +
    ' alle ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function n(v) {
  if (v === null || v === undefined) return '—';
  return String(v);
}

function etichettaArrivo(stato) {
  if (stato === '1') return 'In casa';
  if (stato === '2') return 'Partito';
  if (stato === '0') return 'Non ancora arrivato';
  return '—';
}

function classeArrivo(stato) {
  if (stato === '1') return 'text-emerald-700';
  if (stato === '2') return 'text-gray-400';
  if (stato === '0') return 'text-amber-700';
  return 'text-gray-400';
}

// Pulsante tappabile: niente <select> nativo, blocca l'iPad.
function Pillola(props) {
  var classe = props.attiva
    ? 'px-4 py-2 rounded-lg text-sm font-semibold border bg-wine-800 text-white border-wine-800'
    : 'px-4 py-2 rounded-lg text-sm font-medium border bg-white text-gray-700 border-gray-300 hover:border-wine-400 hover:text-wine-800';
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
      <div className="text-3xl font-bold text-gray-900 mt-1">{props.valore}</div>
      {props.nota && <div className="text-xs text-gray-500 mt-1">{props.nota}</div>}
    </div>
  );
}

function Etichetta(props) {
  var colori = {
    verde: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    ambra: 'bg-amber-50 text-amber-800 border-amber-200'
  };
  var classe = 'inline-block px-2 py-0.5 rounded-md text-xs font-medium border ' +
    (colori[props.colore] || colori.ambra);
  return <span className={classe}>{props.children}</span>;
}

export default function CamereOggiPage() {
  var [notte, setNotte] = useState(notteCorrente());
  var [scheda, setScheda] = useState('camere');

  var [righe, setRighe] = useState([]);
  var [totali, setTotali] = useState(null);
  var [aggiornatoAl, setAggiornatoAl] = useState(null);
  var [caricamento, setCaricamento] = useState(true);
  var [errore, setErrore] = useState(null);

  useEffect(function() {
    var annullato = false;
    setCaricamento(true);
    setErrore(null);

    Promise.all([
      supabase.rpc('hic_camere_notte', { p_notte: notte }),
      supabase.rpc('hic_camere_notte_totale', { p_notte: notte }),
      supabase.rpc('hic_ultimo_aggiornamento')
    ]).then(function(risposte) {
      if (annullato) return;
      for (var i = 0; i < risposte.length; i++) {
        if (risposte[i].error) {
          setErrore(risposte[i].error.message);
          setCaricamento(false);
          return;
        }
      }
      setRighe(risposte[0].data || []);
      var t = risposte[1].data;
      setTotali(t && t.length > 0 ? t[0] : null);
      setAggiornatoAl(risposte[2].data ? risposte[2].data : null);
      setCaricamento(false);
    });

    return function() { annullato = true; };
  }, [notte]);

  var mattinaDopo = spostaGiorni(notte, 1);
  var oggiCalendario = iso(new Date());
  var stiamoGuardandoIeriPerOrario = (notte !== oggiCalendario) && (notte === notteCorrente());
  var timestamp = quandoLungo(aggiornatoAl);

  var occupate = totali ? Number(totali.camere_occupate) : 0;
  var totCamere = totali ? Number(totali.camere_totali) : 0;
  var ospiti = totali ? Number(totali.ospiti) : 0;
  var adulti = totali ? Number(totali.adulti) : 0;
  var bambini = totali ? Number(totali.bambini) : 0;
  var senzaRipartizione = totali ? Number(totali.senza_ripartizione) : 0;
  var senzaOspiti = totali ? Number(totali.senza_ospiti) : 0;
  var arrivi = totali ? Number(totali.arrivi) : 0;
  var partenze = totali ? Number(totali.partenze_domattina) : 0;
  var ospitiInPartenza = totali ? Number(totali.ospiti_in_partenza) : 0;

  // Righe d'onesta': si mostrano solo quando c'e' davvero qualcosa da
  // dichiarare. Un avviso sempre acceso diventa arredamento.
  var avvisi = [];
  if (senzaOspiti > 0) {
    avvisi.push(senzaOspiti + ' prenotazioni non dicono quante persone sono: portano zero nella somma, quindi il totale è per difetto.');
  }
  if (senzaRipartizione > 0) {
    avvisi.push(senzaRipartizione + ' prenotazioni non dividono adulti e bambini: per questo adulti più bambini può non fare il totale degli ospiti.');
  }

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">

      {/* Intestazione */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Camere e colazioni</h1>
        <p className="text-sm text-gray-500 mt-1">
          chi dorme in casa e quante colazioni servire — sola lettura
        </p>
      </div>

      {/* L'ORA DELL'AGGIORNAMENTO, IN GRANDE.
          Non e' una nota a pie' di pagina: e' la cosa che dice quanto ci
          si puo' fidare di tutto il resto. La freschezza NON si calcola
          qui: la dice hic_ultimo_aggiornamento(), unica copia della
          regola. La fascia ambra dei dati fermi sta gia' nel Layout, su
          ogni pagina: qui non si ripete. */}
      <div className="bg-wine-50 border border-wine-200 rounded-xl px-4 py-3 mb-5">
        <div className="text-base font-semibold text-wine-900">
          {timestamp ? 'Dati aggiornati al ' + timestamp : 'Nessun aggiornamento registrato'}
        </div>
        <div className="text-xs text-wine-800 mt-1">
          Specchio di Hotel in Cloud, aggiornato cinque volte al giorno.
          Per sapere se una camera è libera, apri Hotel in Cloud.
        </div>
      </div>

      {/* Scelta della notte */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Notte</div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={function() { setNotte(spostaGiorni(notte, -1)); }}
            className="px-3 py-2 rounded-lg text-sm font-semibold border bg-white text-gray-700 border-gray-300 hover:border-wine-400 hover:text-wine-800">
            ◀ Giorno prima
          </button>
          <button
            type="button"
            onClick={function() { setNotte(notteCorrente()); }}
            className="px-3 py-2 rounded-lg text-sm font-semibold border bg-white text-gray-700 border-gray-300 hover:border-wine-400 hover:text-wine-800">
            Oggi
          </button>
          <button
            type="button"
            onClick={function() { setNotte(spostaGiorni(notte, 1)); }}
            className="px-3 py-2 rounded-lg text-sm font-semibold border bg-white text-gray-700 border-gray-300 hover:border-wine-400 hover:text-wine-800">
            Giorno dopo ▶
          </button>
          <input
            type="date"
            value={notte}
            onChange={function(e) { if (e.target.value) setNotte(e.target.value); }}
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
          />
        </div>
        <div className="text-xl font-bold text-gray-900 mt-3">
          Notte di {dataLunga(notte)}
        </div>
        {stiamoGuardandoIeriPerOrario && (
          <div className="text-xs text-amber-700 mt-1">
            Sono passate da poco le ventiquattro: la notte in corso è ancora questa.
            Con <span className="font-semibold">Giorno dopo</span> vedi la notte che comincia stasera.
          </div>
        )}
      </div>

      {/* Linguette */}
      <div className="flex flex-wrap gap-2 mb-5">
        <Pillola attiva={scheda === 'camere'} onClick={function() { setScheda('camere'); }}>
          Camere
        </Pillola>
        <Pillola attiva={scheda === 'colazioni'} onClick={function() { setScheda('colazioni'); }}>
          Colazioni
        </Pillola>
      </div>

      {caricamento && (
        <div className="text-sm text-gray-400 py-10 text-center">Caricamento...</div>
      )}

      {!caricamento && errore && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          Errore nella lettura dei dati: {errore}
        </div>
      )}

      {!caricamento && !errore && righe.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <div className="text-lg font-semibold text-gray-700">Nessuna camera occupata questa notte</div>
          <div className="text-sm text-gray-500 mt-2">
            Nessuna colazione da servire la mattina del {dataLunga(mattinaDopo)}.
          </div>
        </div>
      )}

      {/* ---------------- LINGUETTA CAMERE ---------------- */}
      {!caricamento && !errore && righe.length > 0 && scheda === 'camere' && (
        <div className="space-y-5">

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Kpi
              titolo="Camere occupate"
              valore={occupate + ' di ' + totCamere}
            />
            <Kpi
              titolo="Ospiti in casa"
              valore={n(ospiti)}
              nota={adulti + ' adulti e ' + bambini + ' bambini'}
            />
            <Kpi
              titolo="Movimenti"
              valore={arrivi + ' / ' + partenze}
              nota={'arrivano questa notte / lasciano la camera domattina'}
            />
          </div>

          {avvisi.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-xs text-amber-700 space-y-1">
              {avvisi.map(function(a, i) {
                return <div key={i}>{a}</div>;
              })}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-sm font-semibold text-gray-800 mb-3">Chi c'è, camera per camera</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-200">
                    <th className="py-2 pr-3 font-semibold">Camera</th>
                    <th className="py-2 px-3 font-semibold">Ospite</th>
                    <th className="py-2 px-3 font-semibold">Dal</th>
                    <th className="py-2 px-3 font-semibold">Al</th>
                    <th className="py-2 px-3 font-semibold text-right">Notte</th>
                    <th className="py-2 px-3 font-semibold text-right">Persone</th>
                    <th className="py-2 px-3 font-semibold text-right">Ad.</th>
                    <th className="py-2 px-3 font-semibold text-right">Bam.</th>
                    <th className="py-2 px-3 font-semibold">Arrivo</th>
                    <th className="py-2 pl-3 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map(function(r) {
                    return (
                      <tr key={r.reservation_id} className="border-b border-gray-100">
                        <td className="py-2 pr-3 font-semibold text-gray-900 whitespace-nowrap">{r.unita}</td>
                        <td className="py-2 px-3 text-gray-800">{r.ospite || '—'}</td>
                        <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{dataBreve(r.check_in)}</td>
                        <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{dataBreve(r.check_out)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-500 whitespace-nowrap">
                          {n(r.notte_numero)} di {n(r.notti)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-900 font-semibold">{n(r.n_ospiti)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-600">{n(r.adulti)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-600">{n(r.bambini)}</td>
                        <td className={'py-2 px-3 whitespace-nowrap text-xs ' + classeArrivo(r.checkin_status)}>
                          {etichettaArrivo(r.checkin_status)}
                        </td>
                        <td className="py-2 pl-3 whitespace-nowrap">
                          {r.arriva_oggi && <Etichetta colore="verde">arriva</Etichetta>}
                          {r.arriva_oggi && r.parte_domattina && ' '}
                          {r.parte_domattina && <Etichetta colore="ambra">parte domattina</Etichetta>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-gray-400 mt-3">
              Compaiono solo le camere occupate. Le camere che non vedi qui non risultano
              occupate in questo specchio, che non è l'agenda viva: se devi sapere se una
              camera è libera, apri Hotel in Cloud. La colonna Arrivo dice se Hotel in Cloud
              ha registrato l'arrivo, non se la persona dorme qui: chi arriva stasera
              risulta ancora non arrivato e conta lo stesso.
            </div>
          </div>

        </div>
      )}

      {/* ---------------- LINGUETTA COLAZIONI ---------------- */}
      {!caricamento && !errore && righe.length > 0 && scheda === 'colazioni' && (
        <div className="space-y-5">

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Colazioni della mattina di {dataLunga(mattinaDopo)}
            </div>
            <div className="text-5xl font-bold text-wine-900 mt-2">{n(ospiti)}</div>
            <div className="text-base text-gray-700 mt-1">
              {adulti} adulti e {bambini} bambini, in {occupate} camere
            </div>
            <div className="text-xs text-gray-500 mt-3">
              Chi ha dormito fa colazione: sono le stesse persone della notte di {dataLunga(notte)},
              comprese le {partenze} camere che lasciano la struttura in mattinata
              ({ospitiInPartenza} persone).
            </div>
          </div>

          {avvisi.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-xs text-amber-700 space-y-1">
              {avvisi.map(function(a, i) {
                return <div key={i}>{a}</div>;
              })}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-sm font-semibold text-gray-800 mb-3">Il foglio della sala</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-200">
                    <th className="py-2 pr-3 font-semibold">Camera</th>
                    <th className="py-2 px-3 font-semibold">Ospite</th>
                    <th className="py-2 px-3 font-semibold text-right">Persone</th>
                    <th className="py-2 px-3 font-semibold text-right">Ad.</th>
                    <th className="py-2 px-3 font-semibold text-right">Bam.</th>
                    <th className="py-2 pl-3 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map(function(r) {
                    return (
                      <tr key={r.reservation_id} className="border-b border-gray-100">
                        <td className="py-2 pr-3 font-semibold text-gray-900 whitespace-nowrap">{r.unita}</td>
                        <td className="py-2 px-3 text-gray-800">{r.ospite || '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-900 font-semibold text-base">{n(r.n_ospiti)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-600">{n(r.adulti)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-600">{n(r.bambini)}</td>
                        <td className="py-2 pl-3 whitespace-nowrap">
                          {r.parte_domattina && <Etichetta colore="ambra">parte in mattinata</Etichetta>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 font-bold">
                    <td className="py-2 pr-3 text-gray-800" colSpan={2}>Totale</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-900 text-base">{n(ospiti)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-700">{n(adulti)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-700">{n(bambini)}</td>
                    <td className="py-2 pl-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="text-xs text-gray-400 mt-3">
              Il trattamento scritto in Hotel in Cloud non viene guardato: chi ha dormito fa
              colazione, senza eccezioni.
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
