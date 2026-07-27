import { useState, useEffect, Fragment } from 'react';
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
// REGOLA 15 e 15-bis — a valore zero (CORRETTA dalla migrazione 36).
// Una prenotazione esce dal denominatore delle medie SOLO SE TUTTE le
// sue righe valgono zero. Fino alla 36 bastava UNA riga a zero: siccome
// l'antipasto compreso in un menu a prezzo fisso e' a zero quasi meta'
// delle volte, uscivano 1.736 prenotazioni su 4.769 (il 36%) e con esse
// il 41,8% del fatturato, e le medie erano circa il 12% piu' basse del
// vero. L'errore peggiorava quando il ristorante andava bene.
//
// Restano fuori solo le prenotazioni tutte a zero e quelle senza
// addebiti: portano 0,00 e non spostano nessuna somma.
//
// IL SOGGIORNO A ZERO e' il caso a parte. Se e' la riga di categoria 7
// a valere zero, la camera e' stata pagata prima e altrove (buono
// regalo, omaggio) e quella media e' per forza incompleta. Queste
// prenotazioni restano DENTRO il calcolo ma vengono dichiarate sotto le
// medie (colonne gift_* di hic_medie) invece di sparire dentro una
// condizione che nessuno rilegge piu'. Sono 147, spendono piu' della
// media perche' chi arriva con un buono regalo cena, e vale la pena
// accorgersene il giorno in cui diventano 400.
//
// IL PANNELLO DI MARCATURA ignora di proposito perimetro e filtro voci
// evento: se il filtro fosse su "esclusi" non potresti mai raggiungere
// una voce per smarcarla. Il periodo invece vale.
//
// ------------------------------------------------------------
// NOVITA' (migrazione 35 / 35b)
//
// 1. MARCATURA DI RIGA. Ogni riga dell'elenco ha un pulsante che apre un
//    pannellino SOTTO la riga stessa (mai una finestra sopra: sull'iPad
//    le modali sono la fonte di meta' dei nostri guai). Da li' si dichiara
//    che quella singola voce e' o non e' un evento, e facoltativamente si
//    forza il gruppo dei consumi. La decisione di riga vince su quella di
//    prenotazione, che a sua volta vince sulla proposta automatica.
//    E' reversibile: Togli cancella il record e la riga torna
//    all'automatismo.
//
// 2. LA TRAPPOLA DEL FILTRO, e come la si evita. Questo elenco RISPETTA i
//    filtri della barra in alto (a differenza del pannello di marcatura,
//    che li ignora di proposito). Quindi se il filtro voci evento e' su
//    "solo eventi" e marchi una riga come "non e' un evento", quella riga
//    esce dal filtro e sparirebbe sotto il dito, irraggiungibile per
//    correggersi. Per questo dopo un salvataggio la riga NON viene
//    ricaricata: resta al suo posto con un avviso in ambra, e sparisce
//    solo al prossimo caricamento. Si ha sempre il tempo di tornare
//    indietro.
//
// 3. IL CAMPO NOTE, in ENTRAMBI i pannelli. La colonna note esisteva su
//    hic_marcature_evento fin dalla prima versione ma nessuno poteva
//    scriverla: era una colonna morta. Ora si scrive sia sulla marcatura
//    di prenotazione sia su quella di riga.
//
// Le marcature di riga NON passano da hic_elenco_righe (che elenca le sue
// colonne una per una e andrebbe ricreata con un DROP, su una funzione
// che regge la scheda in produzione): si leggono direttamente da
// hic_marcature_riga per i soli addebito_id della pagina visibile. Sono
// 50 per volta, ben sotto il limite delle 1.000 righe.
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

var MAX_SUGGERIMENTI = 12;

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

function ripulisci(testo) {
  if (testo === null || testo === undefined) return '';
  return String(testo).replace(/\s+/g, ' ').trim();
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

  // --- Marcatura di RIGA (nuova) ---
  var [marcRighe, setMarcRighe] = useState({});
  var [rigaAperta, setRigaAperta] = useState(null);
  var [formMarcatura, setFormMarcatura] = useState(null);
  var [formGruppo, setFormGruppo] = useState('');
  var [formNote, setFormNote] = useState('');
  var [rigaInSalvataggio, setRigaInSalvataggio] = useState(null);
  var [erroreRiga, setErroreRiga] = useState(null);
  var [sospese, setSospese] = useState({});
  var [suggerimenti, setSuggerimenti] = useState([]);
  var [suggerimentiChiesti, setSuggerimentiChiesti] = useState(false);

  // --- Marcatura di PRENOTAZIONE ---
  var [statoMarcatura, setStatoMarcatura] = useState('da_rivedere');
  var [marcConteggio, setMarcConteggio] = useState(null);
  var [marcElenco, setMarcElenco] = useState([]);
  var [marcPagina, setMarcPagina] = useState(0);
  var [marcCaricamento, setMarcCaricamento] = useState(false);
  var [marcErrore, setMarcErrore] = useState(null);
  var [inSalvataggio, setInSalvataggio] = useState(null);
  var [giroMarcatura, setGiroMarcatura] = useState(0);
  var [noteEvento, setNoteEvento] = useState({});
  var [notaAperta, setNotaAperta] = useState(null);
  var [formNotaEvento, setFormNotaEvento] = useState('');

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
      // Una pagina nuova: gli avvisi in ambra della pagina precedente
      // non hanno piu' senso, e nessun pannello resta aperto.
      setSospese({});
      setRigaAperta(null);
      setCaricamento(false);
    });

    return function() { annullato = true; };
  }, [da, a, perimetro, eventi, testoAttivo, categoria, ordine, pagina]);

  // Le marcature di riga della sola pagina visibile.
  useEffect(function() {
    if (!righe || righe.length === 0) {
      setMarcRighe({});
      return;
    }
    var annullato = false;
    var ids = [];
    for (var i = 0; i < righe.length; i++) {
      ids.push(righe[i].addebito_id);
    }
    supabase
      .from('hic_marcature_riga')
      .select('addebito_id, marcatura, gruppo, note, marcato_da, marcato_il')
      .in('addebito_id', ids)
      .then(function(res) {
        if (annullato) return;
        if (res.error) {
          setErroreRiga(res.error.message);
          return;
        }
        var mappa = {};
        var dati = res.data || [];
        for (var k = 0; k < dati.length; k++) {
          mappa[dati[k].addebito_id] = dati[k];
        }
        setMarcRighe(mappa);
      });

    return function() { annullato = true; };
  }, [righe]);

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
      setNotaAperta(null);
      setMarcCaricamento(false);
    });

    return function() { annullato = true; };
  }, [vista, da, a, statoMarcatura, marcPagina, giroMarcatura]);

  // Le note delle prenotazioni elencate nel pannello di marcatura.
  // hic_eventi_da_rivedere non restituisce la colonna note, quindi la si
  // legge a parte invece di ricreare la funzione.
  useEffect(function() {
    if (vista !== 'marcatura') return;
    if (!marcElenco || marcElenco.length === 0) {
      setNoteEvento({});
      return;
    }
    var annullato = false;
    var ids = [];
    for (var i = 0; i < marcElenco.length; i++) {
      ids.push(marcElenco[i].reservation_id);
    }
    supabase
      .from('hic_marcature_evento')
      .select('reservation_id, note')
      .in('reservation_id', ids)
      .then(function(res) {
        if (annullato) return;
        if (res.error) return;
        var mappa = {};
        var dati = res.data || [];
        for (var k = 0; k < dati.length; k++) {
          mappa[dati[k].reservation_id] = dati[k].note;
        }
        setNoteEvento(mappa);
      });

    return function() { annullato = true; };
  }, [vista, marcElenco]);

  function cerca() {
    setTestoAttivo(testo.trim());
  }

  function azzeraRicerca() {
    setTesto('');
    setTestoAttivo('');
  }

  // ----------------------------------------------------------
  // Suggerimenti per il campo gruppo.
  // Si leggono una volta sola, alla prima apertura di un pannello, e solo
  // dal dizionario dei consumi: e' una tabella piccola. Servono a evitare
  // il refuso che creerebbe un gruppo nuovo in silenzio (il confronto
  // ignora le maiuscole, quindi "ristorante" e "Ristorante" finiscono
  // insieme, ma "Ristornate" no).
  // ----------------------------------------------------------
  function caricaSuggerimenti() {
    if (suggerimentiChiesti) return;
    setSuggerimentiChiesti(true);
    supabase
      .from('hic_voci_consumo')
      .select('gruppo')
      .then(function(res) {
        if (res.error) return;
        var visti = {};
        var elenco = [];
        var dati = res.data || [];
        for (var i = 0; i < dati.length; i++) {
          var g = ripulisci(dati[i].gruppo);
          if (g === '') continue;
          var chiave = g.toLowerCase();
          if (visti[chiave]) continue;
          visti[chiave] = true;
          elenco.push(g);
        }
        elenco.sort();
        setSuggerimenti(elenco.slice(0, MAX_SUGGERIMENTI));
      });
  }

  function apriRiga(riga) {
    if (rigaAperta === riga.addebito_id) {
      setRigaAperta(null);
      return;
    }
    var m = marcRighe[riga.addebito_id];
    setRigaAperta(riga.addebito_id);
    setFormMarcatura(m && m.marcatura ? m.marcatura : null);
    setFormGruppo(m && m.gruppo ? m.gruppo : '');
    setFormNote(m && m.note ? m.note : '');
    setErroreRiga(null);
    caricaSuggerimenti();
  }

  // Aggiorna la riga gia' a schermo senza ricaricare l'elenco.
  // E' il cuore della soluzione alla trappola del filtro: la riga resta
  // dov'e' anche quando non rispetta piu' i filtri attivi.
  function aggiornaRigaLocale(addebitoId, marcatura) {
    var nuove = [];
    for (var i = 0; i < righe.length; i++) {
      var r = righe[i];
      if (r.addebito_id !== addebitoId) {
        nuove.push(r);
        continue;
      }
      var copia = {};
      for (var k in r) {
        if (Object.prototype.hasOwnProperty.call(r, k)) copia[k] = r[k];
      }
      if (marcatura === 'evento') {
        copia.voce_evento = true;
        copia.marcata_a_mano = true;
      } else if (marcatura === 'non_evento') {
        copia.voce_evento = false;
        copia.marcata_a_mano = true;
      }
      nuove.push(copia);
    }
    setRighe(nuove);
  }

  function salvaRiga(addebitoId) {
    var gruppoPulito = ripulisci(formGruppo);
    var notePulite = ripulisci(formNote);

    if (!formMarcatura && gruppoPulito === '') {
      setErroreRiga("Serve almeno una delle due cose: dire se e' un evento, oppure indicare un gruppo.");
      return;
    }

    setRigaInSalvataggio(addebitoId);
    setErroreRiga(null);

    supabase
      .from('hic_marcature_riga')
      .upsert({
        addebito_id: addebitoId,
        marcatura: formMarcatura ? formMarcatura : null,
        gruppo: gruppoPulito === '' ? null : gruppoPulito,
        note: notePulite === '' ? null : notePulite,
        marcato_da: firma,
        marcato_il: new Date().toISOString()
      }, { onConflict: 'addebito_id' })
      .then(function(res) {
        setRigaInSalvataggio(null);
        if (res.error) {
          setErroreRiga(res.error.message);
          return;
        }
        var mappa = {};
        for (var k in marcRighe) {
          if (Object.prototype.hasOwnProperty.call(marcRighe, k)) mappa[k] = marcRighe[k];
        }
        mappa[addebitoId] = {
          addebito_id: addebitoId,
          marcatura: formMarcatura ? formMarcatura : null,
          gruppo: gruppoPulito === '' ? null : gruppoPulito,
          note: notePulite === '' ? null : notePulite,
          marcato_da: firma,
          marcato_il: new Date().toISOString()
        };
        setMarcRighe(mappa);
        aggiornaRigaLocale(addebitoId, formMarcatura);

        var s = {};
        for (var j in sospese) {
          if (Object.prototype.hasOwnProperty.call(sospese, j)) s[j] = sospese[j];
        }
        s[addebitoId] = 'salvata';
        setSospese(s);
        setRigaAperta(null);
      });
  }

  function togliRiga(addebitoId) {
    setRigaInSalvataggio(addebitoId);
    setErroreRiga(null);

    supabase
      .from('hic_marcature_riga')
      .delete()
      .eq('addebito_id', addebitoId)
      .then(function(res) {
        setRigaInSalvataggio(null);
        if (res.error) {
          setErroreRiga(res.error.message);
          return;
        }
        var mappa = {};
        for (var k in marcRighe) {
          if (Object.prototype.hasOwnProperty.call(marcRighe, k)) {
            if (String(k) === String(addebitoId)) continue;
            mappa[k] = marcRighe[k];
          }
        }
        setMarcRighe(mappa);

        var s = {};
        for (var j in sospese) {
          if (Object.prototype.hasOwnProperty.call(sospese, j)) s[j] = sospese[j];
        }
        s[addebitoId] = 'tolta';
        setSospese(s);
        setRigaAperta(null);
      });
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

  function apriNota(prenotazione) {
    if (notaAperta === prenotazione.reservation_id) {
      setNotaAperta(null);
      return;
    }
    setNotaAperta(prenotazione.reservation_id);
    var esistente = noteEvento[prenotazione.reservation_id];
    setFormNotaEvento(esistente ? esistente : '');
    setMarcErrore(null);
  }

  // La nota di prenotazione si salva da sola, senza toccare la marcatura:
  // si annota anche una prenotazione che non si vuole marcare.
  function salvaNotaEvento(reservationId) {
    var notePulite = ripulisci(formNotaEvento);
    setInSalvataggio(reservationId);
    setMarcErrore(null);
    supabase
      .from('hic_marcature_evento')
      .upsert({
        reservation_id: reservationId,
        note: notePulite === '' ? null : notePulite,
        marcato_da: firma,
        marcato_il: new Date().toISOString()
      }, { onConflict: 'reservation_id' })
      .then(function(res) {
        setInSalvataggio(null);
        if (res.error) {
          setMarcErrore(res.error.message);
          return;
        }
        var mappa = {};
        for (var k in noteEvento) {
          if (Object.prototype.hasOwnProperty.call(noteEvento, k)) mappa[k] = noteEvento[k];
        }
        mappa[reservationId] = notePulite === '' ? null : notePulite;
        setNoteEvento(mappa);
        setNotaAperta(null);
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
                  {numero(medie.prenotazioni_base)} prenotazioni con un valore, {numero(medie.ospiti_base)} ospiti,
                  {' '}{numero(medie.notti_base)} notti, {euro(medie.lordo_base)} lordi.
                </div>
                <div>
                  <span className="font-semibold text-gray-600">Escluse dal calcolo:</span>{' '}
                  <span className={Number(medie.escluse_prenotazioni) > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-gray-700'}>
                    {numero(medie.escluse_prenotazioni)}
                  </span>
                  {' '}prenotazioni senza alcun valore
                  {medie.escluse_quota === null ? '' : ' (' + percentuale(medie.escluse_quota) + ')'} —
                  {' '}{numero(medie.escluse_notti)} notti e {numero(medie.escluse_ospiti)} ospiti.
                  Tutte le loro righe valgono zero, oppure non hanno addebiti: portano 0,00 e non
                  spostano nessuna somma.
                </div>
                {Number(medie.gift_prenotazioni) > 0 && (
                  <div>
                    <span className="font-semibold text-gray-600">Dentro il calcolo, ma da sapere:</span>{' '}
                    <span className="font-semibold text-amber-700">
                      {numero(medie.gift_prenotazioni)}
                    </span>
                    {' '}prenotazioni con il soggiorno a zero —
                    {' '}{numero(medie.gift_notti)} notti e {numero(medie.gift_ospiti)} ospiti,
                    {' '}{euro(medie.gift_lordo)} di sola ristorazione e servizi
                    {medie.gift_quota === null ? '' : ' (' + percentuale(medie.gift_quota) + ' del lordo)'}.
                  </div>
                )}
                <div className="pt-1 text-gray-400">
                  Una prenotazione esce dal calcolo solo se TUTTE le sue righe valgono zero: un
                  antipasto compreso in un menu a prezzo fisso non rende gratis la cena. Chi ha avuto
                  il soggiorno in regalo resta invece dentro, ma la camera e' stata pagata prima e
                  altrove: la sua media e' incompleta, ed e' il motivo per cui viene contato qui sopra
                  a parte.
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

            {erroreRiga && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800 mb-3">
                Errore: {erroreRiga}
              </div>
            )}

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
                      <th className="py-2 px-3 font-semibold text-right">Netto</th>
                      <th className="py-2 pl-3 font-semibold text-right">Marcatura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {righe.map(function(r) {
                      var marcaturaRiga = marcRighe[r.addebito_id];
                      var aperta = rigaAperta === r.addebito_id;
                      var occupata = rigaInSalvataggio === r.addebito_id;
                      var statoSospeso = sospese[r.addebito_id];

                      return (
                        <Fragment key={r.addebito_id}>
                          <tr className="border-b border-gray-100">
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
                              {marcaturaRiga && marcaturaRiga.gruppo && (
                                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                                  gruppo: {marcaturaRiga.gruppo}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-gray-500">{numero(r.quantita)}</td>
                            <td className={r.a_valore_zero
                              ? 'py-2 px-3 text-right tabular-nums text-amber-700'
                              : 'py-2 px-3 text-right tabular-nums text-gray-900'}>
                              {euro(r.importo)}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-gray-600">{euro(r.imponibile)}</td>
                            <td className="py-2 pl-3 text-right whitespace-nowrap">
                              {puoMarcare ? (
                                <button
                                  type="button"
                                  disabled={occupata}
                                  onClick={function() { apriRiga(r); }}
                                  className={marcaturaRiga
                                    ? 'px-3 py-1 rounded-lg text-xs font-medium border bg-wine-50 text-wine-800 border-wine-300 hover:bg-wine-100'
                                    : 'px-3 py-1 rounded-lg text-xs font-medium border bg-white text-gray-600 border-gray-300 hover:border-wine-400 hover:text-wine-800'}>
                                  {aperta ? 'Chiudi' : (marcaturaRiga ? 'Marcata' : 'Marca')}
                                </button>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                          </tr>

                          {statoSospeso && (
                            <tr className="border-b border-gray-100">
                              <td colSpan={8} className="py-2 px-3">
                                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                  {statoSospeso === 'tolta'
                                    ? "Marcatura tolta: questa riga e' tornata alla proposta automatica."
                                    : 'Marcatura salvata.'}
                                  {' '}La riga resta visibile fino al prossimo caricamento. Se non rientra
                                  piu' nei filtri attivi in alto, dopo sparira' da questo elenco: se devi
                                  correggerti, fallo adesso.
                                </div>
                              </td>
                            </tr>
                          )}

                          {aperta && (
                            <tr className="border-b border-gray-100 bg-gray-50">
                              <td colSpan={8} className="py-3 px-3">
                                <div className="space-y-3">
                                  <div className="text-xs text-gray-500">
                                    Questa decisione vale <span className="font-semibold">solo per questa riga</span> e
                                    batte sia la marcatura della prenotazione sia la proposta automatica.
                                  </div>

                                  <div>
                                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                                      E' un evento?
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <Pillola
                                        attiva={formMarcatura === 'evento'}
                                        onClick={function() { setFormMarcatura('evento'); }}>
                                        Si, e' un evento
                                      </Pillola>
                                      <Pillola
                                        attiva={formMarcatura === 'non_evento'}
                                        onClick={function() { setFormMarcatura('non_evento'); }}>
                                        No, non e' un evento
                                      </Pillola>
                                      <Pillola
                                        attiva={formMarcatura === null}
                                        onClick={function() { setFormMarcatura(null); }}>
                                        Non mi pronuncio
                                      </Pillola>
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                                      Gruppo dei consumi (facoltativo)
                                    </div>
                                    <input
                                      type="text"
                                      value={formGruppo}
                                      onChange={function(e) { setFormGruppo(e.target.value); }}
                                      placeholder="Lascia vuoto per non forzare nulla"
                                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-72"
                                    />
                                    {suggerimenti.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 mt-2">
                                        {suggerimenti.map(function(g) {
                                          return (
                                            <button
                                              key={g}
                                              type="button"
                                              onClick={function() { setFormGruppo(g); }}
                                              className="px-2 py-0.5 rounded-full text-xs border bg-white text-gray-600 border-gray-300 hover:border-wine-400 hover:text-wine-800">
                                              {g}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                    <div className="text-xs text-gray-400 mt-1">
                                      Le maiuscole non contano, un refuso si': meglio toccare un
                                      suggerimento che riscrivere il nome a mano.
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                                      Nota (facoltativa)
                                    </div>
                                    <input
                                      type="text"
                                      value={formNote}
                                      onChange={function(e) { setFormNote(e.target.value); }}
                                      placeholder="Perche' hai deciso cosi'"
                                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full max-w-xl"
                                    />
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <button
                                      type="button"
                                      disabled={occupata}
                                      onClick={function() { salvaRiga(r.addebito_id); }}
                                      className="px-3 py-1.5 rounded-lg text-sm font-medium border bg-wine-800 text-white border-wine-800 hover:bg-wine-900">
                                      Salva
                                    </button>
                                    <button
                                      type="button"
                                      onClick={function() { setRigaAperta(null); }}
                                      className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-800">
                                      Annulla
                                    </button>
                                    {marcaturaRiga && (
                                      <button
                                        type="button"
                                        disabled={occupata}
                                        onClick={function() { togliRiga(r.addebito_id); }}
                                        className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-red-700">
                                        Togli la marcatura
                                      </button>
                                    )}
                                    {marcaturaRiga && marcaturaRiga.marcato_da && (
                                      <span className="text-xs text-gray-400">
                                        ultima modifica di {marcaturaRiga.marcato_da}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
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
              Se invece il caso riguarda <span className="font-semibold">una singola voce</span> — una riga
              associata a un evento per comodita' o per errore, solo in quell'occasione — non usare questo
              pannello: vai in &quot;Elenco e medie&quot; e marca quella riga. La decisione di riga vince su
              questa.
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
                  var nota = noteEvento[p.reservation_id];
                  var notaInModifica = notaAperta === p.reservation_id;

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
                          {nota && !notaInModifica && (
                            <div className="text-xs text-gray-500 italic mt-1 break-words">
                              nota: {nota}
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
                            <button
                              type="button"
                              disabled={occupato}
                              onClick={function() { apriNota(p); }}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium border bg-white text-gray-600 border-gray-300 hover:border-wine-400 hover:text-wine-800">
                              {notaInModifica ? 'Chiudi nota' : (nota ? 'Modifica nota' : 'Aggiungi nota')}
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

                      {notaInModifica && (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                          <input
                            type="text"
                            value={formNotaEvento}
                            onChange={function(e) { setFormNotaEvento(e.target.value); }}
                            placeholder="Perche' questa prenotazione e' o non e' un evento"
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full max-w-xl"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={occupato}
                              onClick={function() { salvaNotaEvento(p.reservation_id); }}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium border bg-wine-800 text-white border-wine-800 hover:bg-wine-900">
                              Salva la nota
                            </button>
                            <button
                              type="button"
                              onClick={function() { setNotaAperta(null); }}
                              className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-800">
                              Annulla
                            </button>
                            <span className="text-xs text-gray-400">
                              La nota si salva da sola: si puo' annotare anche senza marcare.
                            </span>
                          </div>
                        </div>
                      )}
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
