import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

var GRID_SIZE_MIN = 5;
var GRID_SIZE_MAX = 60;
var VIEWPORT_W = 860;
var VIEWPORT_H = 580;

var COLORI_TAVOLO = [
  { label: 'Grigio',  value: '#6B7280' },
  { label: 'Blu',     value: '#3B82F6' },
  { label: 'Verde',   value: '#10B981' },
  { label: 'Arancio', value: '#F59E0B' },
  { label: 'Rosa',    value: '#EC4899' },
  { label: 'Viola',   value: '#8B5CF6' },
  { label: 'Rosso',   value: '#EF4444' },
  { label: 'Giallo',  value: '#EAB308' }
];

// Colori disponibili per le etichette di servizio
var COLORI_SERVIZIO = [
  { label: 'Grigio (libero)',    value: '#9CA3AF' },
  { label: 'Verde (assegnato)',  value: '#10B981' },
  { label: 'Blu (VIP)',          value: '#3B82F6' },
  { label: 'Arancio (attesa)',   value: '#F59E0B' },
  { label: 'Rosso (conto)',      value: '#EF4444' },
  { label: 'Viola (speciale)',   value: '#8B5CF6' }
];

var TIPI_OSTACOLO = [
  { value: 'muro',     label: 'Muro',              colore: '#374151', blocca: true  },
  { value: 'colonna',  label: 'Colonna',            colore: '#92400E', blocca: true  },
  { value: 'tramezzo', label: 'Tramezzo',           colore: '#64748B', blocca: true  },
  { value: 'finestra', label: 'Finestra',           colore: '#38BDF8', blocca: false },
  { value: 'porta',    label: 'Porta',              colore: '#F97316', blocca: false },
  { value: 'bancone',  label: 'Bancone / Bar',      colore: '#8B5CF6', blocca: true  },
  { value: 'servizio', label: 'Tavolo di servizio', colore: '#9CA3AF', blocca: true  }
];

// Converte il turno interno ('pranzo'/'cena') nel valore usato nel DB reservations
function turnoToMealType(turno) {
  if (turno === 'pranzo') return 'lunch';
  if (turno === 'cena') return 'dinner';
  return turno;
}

function getTipoOstacolo(value) {
  for (var i = 0; i < TIPI_OSTACOLO.length; i++) {
    if (TIPI_OSTACOLO[i].value === value) return TIPI_OSTACOLO[i];
  }
  return null;
}

function labelStato(stato) {
  if (stato === 'occupato') return 'Occupato';
  if (stato === 'prenotato') return 'Prenotato';
  return 'Libero';
}

function getCategoria(t) {
  return (t.categoria && t.categoria.trim()) ? t.categoria.trim() : t.nome;
}

function raggruppaPerCategoria(lista) {
  var mappa = {};
  var ordine = [];
  for (var i = 0; i < lista.length; i++) {
    var t = lista[i];
    var cat = getCategoria(t);
    if (!mappa[cat]) { mappa[cat] = []; ordine.push(cat); }
    mappa[cat].push(t);
  }
  return ordine.map(function(cat) { return { categoria: cat, tavoli: mappa[cat] }; });
}

// Genera un UUID v4 semplice lato client
function generaUUID() {
  var d = Date.now();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Calcola dimensioni reali sulla griglia tenendo conto della rotazione
function getDimensioniEffettive(layoutItem) {
  var t = layoutItem.tavolo;
  if (!t) return { w: 1, h: 1 };
  var rot = (layoutItem.rotazione === null || layoutItem.rotazione === undefined) ? 0 : Number(layoutItem.rotazione);
  if (rot === 90 || rot === 270) {
    return { w: t.altezza || 1, h: t.larghezza || 2 };
  }
  return { w: t.larghezza || 2, h: t.altezza || 1 };
}

function SedieSVG(props) {
  var w = props.w;
  var h = props.h;
  var capacita = props.capacita;
  var forma = props.forma;
  var colore = props.colore || '#9CA3AF';
  var sedieSize = 10;
  var gap = 4;
  var sedie = [];

  if (forma === 'rotondo') {
    var raggio = Math.min(w, h) / 2 + sedieSize + gap;
    for (var i = 0; i < capacita; i++) {
      var angolo = (2 * Math.PI * i) / capacita - Math.PI / 2;
      var cx = w / 2 + raggio * Math.cos(angolo);
      var cy = h / 2 + raggio * Math.sin(angolo);
      sedie.push(<circle key={i} cx={cx} cy={cy} r={sedieSize / 2} fill={colore} opacity="0.7" />);
    }
  } else {
    var top    = Math.ceil(capacita / 4);
    var bottom = Math.ceil(capacita / 4);
    var left   = Math.floor(capacita / 4);
    var right  = capacita - top - bottom - left;
    if (right < 0) right = 0;
    var pad = sedieSize + gap;

    function sedieLinea(n, x1, y1, x2, y2) {
      for (var j = 0; j < n; j++) {
        var tt = n > 1 ? j / (n - 1) : 0.5;
        var sx = x1 + tt * (x2 - x1);
        var sy = y1 + tt * (y2 - y1);
        sedie.push(<rect key={'s' + x1 + y1 + j} x={sx - sedieSize / 2} y={sy - sedieSize / 2} width={sedieSize} height={sedieSize} rx="2" fill={colore} opacity="0.7" />);
      }
    }

    if (top    > 0) sedieLinea(top,    pad,                   -sedieSize / 2 - gap,  w - pad,                 -sedieSize / 2 - gap);
    if (bottom > 0) sedieLinea(bottom, pad,                    h + sedieSize / 2 + gap, w - pad,               h + sedieSize / 2 + gap);
    if (left   > 0) sedieLinea(left,  -sedieSize / 2 - gap,   pad,                   -sedieSize / 2 - gap,     h - pad);
    if (right  > 0) sedieLinea(right,  w + sedieSize / 2 + gap, pad,                  w + sedieSize / 2 + gap, h - pad);
  }

  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }} width={w} height={h}>
      {sedie}
    </svg>
  );
}

export default function SalePage() {
  var { profile } = useAuth();
  var userRole = profile ? profile.role : '';
  var isAdmin = userRole === 'super_admin' || userRole === 'proprieta' || userRole === 'direttore';

  var [tab, setTab] = useState('mappa');
  var [sale, setSale] = useState([]);
  var [salaSelezionata, setSalaSelezionata] = useState(null);
  var [tavoli, setTavoli] = useState([]);

  // layoutAttivo e layoutTemp usano istanza_id come chiave univoca
  // ogni elemento: { istanza_id, id (DB id o null), sala_id, tavolo_id, tavolo, pos_x, pos_y, rotazione, etichetta, data_validita_dal }
  var [layoutAttivo, setLayoutAttivo] = useState([]);
  var [layoutTemp, setLayoutTemp] = useState([]);
  var [layoutModificato, setLayoutModificato] = useState(false);

  var [tavoliUniti, setTavoliUniti] = useState([]);
  var [tavoliPrenotazioni, setTavoliPrenotazioni] = useState([]);
  var [prenotazioni, setPrenotazioni] = useState([]);
  var [dataSelezionata, setDataSelezionata] = useState(new Date().toISOString().split('T')[0]);
  var [turnoSelezionato, setTurnoSelezionato] = useState('cena');
  var [loading, setLoading] = useState(true);
  var [errore, setErrore] = useState(null);
  var [mostraSedie, setMostraSedie] = useState(true);

  var [gridSize, setGridSize] = useState(null);
  var [gridSizeInput, setGridSizeInput] = useState('');
  var [gridCols, setGridCols] = useState(16);
  var [gridRows, setGridRows] = useState(10);

  // dragging usa istanza_id invece di tavolo_id
  var [draggingIstanza, setDraggingIstanza] = useState(null);
  var [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // tavoloSelezionato e' un layoutItem (ha istanza_id)
  var [tavoloSelezionato, setTavoloSelezionato] = useState(null);
  var [pannelloAperto, setPannelloAperto] = useState(false);
  var [showAssegna, setShowAssegna] = useState(false);
  var [assegnaPrenotazione, setAssegnaPrenotazione] = useState(null);
  var [assegnaOspiti, setAssegnaOspiti] = useState(0);
  var [showUnione, setShowUnione] = useState(false);
  var [unioneCapienza, setUnioneCapienza] = useState(0);

  var [showFormTavolo, setShowFormTavolo] = useState(false);
  var [tavoloInEditing, setTavoloInEditing] = useState(null);
  var [formTavolo, setFormTavolo] = useState({ nome: '', capacita: 4, forma: 'rettangolo', larghezza: 2, altezza: 1, colore: '#6B7280', note: '', categoria: '', quantita: 1, border_radius: 0 });

  var [showModaleEtichetta, setShowModaleEtichetta] = useState(false);
  var [tavoloInAttesaEtichetta, setTavoloInAttesaEtichetta] = useState(null);
  var [etichettaInput, setEtichettaInput] = useState('');

  var [showFormSala, setShowFormSala] = useState(false);
  var [salaInEditing, setSalaInEditing] = useState(null);
  var [formSala, setFormSala] = useState({ nome: '', ordine: 1, grid_cols: 40, grid_rows: 30, prefisso_tavolo: '', numero_iniziale: 1 });

  var [gruppiEspansi, setGruppiEspansi] = useState({});
  var [editorModeAttivo, setEditorModeAttivo] = useState(false);
  // Selezione multipla nell'editor
  var [selezionatiEditor, setSelezionatiEditor] = useState([]);
  var [modalitaSelezioneMult, setModalitaSelezioneMult] = useState(false);

  var [ostacoli, setOstacoli] = useState([]);
  var [tipoOstacoloAttivo, setTipoOstacoloAttivo] = useState('muro');
  var [dragOstacoloStart, setDragOstacoloStart] = useState(null);
  var [dragOstacoloEnd, setDragOstacoloEnd] = useState(null);
  var [isDraggingOstacolo, setIsDraggingOstacolo] = useState(false);
  var [showDialogLunghezza, setShowDialogLunghezza] = useState(false);
  var [dialogLunghezza, setDialogLunghezza] = useState('');
  var [pendingDragInfo, setPendingDragInfo] = useState(null);
  var [servizioInizio, setServizioInizio] = useState(null);
  var [servizioFine, setServizioFine] = useState(null);
  var [draggingServizio, setDraggingServizio] = useState(false);

  var [layoutBase, setLayoutBase] = useState([]);
  var [showSalvaBase, setShowSalvaBase] = useState(false);
  var [nomeLayoutBase, setNomeLayoutBase] = useState('');
  var [descLayoutBase, setDescLayoutBase] = useState('');
  var [salvaBaseLoading, setSalvaBaseLoading] = useState(false);

  // contaIstanzePerTipologia: tavoloId -> numero di istanze in tutti i layout attivi
  var [istanzePerTipologia, setIstanzePerTipologia] = useState({});

  // ── ETICHETTE SERVIZIO ────────────────────────────────────────
  // Oggetto: { [istanza_id]: { etichetta: string, colore: string } }
  var [etichetteServizio, setEtichetteServizio] = useState({});
  // Testo e colore in editing nel pannello tavolo
  var [editEtichettaServizio, setEditEtichettaServizio] = useState('');
  var [editColoreServizio, setEditColoreServizio] = useState('#9CA3AF');
  var [salvandoEtichetta, setSalvandoEtichetta] = useState(false);

  // ── UNIONE CON CLICK ─────────────────────────────────────────
  // modalitaUnione: false | 'scegli' | 'conferma'
  var [modalitaUnione, setModalitaUnione] = useState(false);
  var [secondoTavoloUnione, setSecondoTavoloUnione] = useState(null);
  var [posizioneOriginaleUnione, setPosizioneOriginaleUnione] = useState(null);

  var gridRef = useRef(null);
  var gridOstacoliRef = useRef(null);

  function chiudiTuttiIModali() {
    setShowFormTavolo(false);
    setShowFormSala(false);
    setShowModaleEtichetta(false);
    setShowSalvaBase(false);
    setShowDialogLunghezza(false);
    setPannelloAperto(false);
    setShowAssegna(false);
    setShowUnione(false);
    setModalitaUnione(false);
    setSecondoTavoloUnione(null);
    setPosizioneOriginaleUnione(null);
    setTavoloInAttesaEtichetta(null);
    setPendingDragInfo(null);
    setIsDraggingOstacolo(false);
    setDraggingServizio(false);
    setDraggingIstanza(null);
  }

  useEffect(function() {
    chiudiTuttiIModali();
  }, [profile]);

  useEffect(function() {
    function handleKeyDown(e) {
      if (e.key === 'Escape') chiudiTuttiIModali();
    }
    window.addEventListener('keydown', handleKeyDown);
    return function() { window.removeEventListener('keydown', handleKeyDown); };
  }, []);

  useEffect(function() {
    caricaSale();
    caricaTavoli();
    caricaIstanzePerTipologia();
  }, []);

  useEffect(function() {
    if (salaSelezionata && sale.length > 0) {
      aggiornaDimensioniGriglia(salaSelezionata);
    }
  }, [sale, salaSelezionata]);

  useEffect(function() {
    if (salaSelezionata) {
      caricaLayout(salaSelezionata);
      caricaOstacoli(salaSelezionata);
      caricaLayoutBase(salaSelezionata);
      caricaIstanzePerTipologia();
    }
  }, [salaSelezionata, dataSelezionata]);

  useEffect(function() {
    if (salaSelezionata && dataSelezionata && turnoSelezionato) {
      caricaTavoliUniti();
      caricaPrenotazioni();
      caricaTavoliPrenotazioni();
      caricaEtichetteServizio();
    }
  }, [salaSelezionata, dataSelezionata, turnoSelezionato]);

  function aggiornaDimensioniGriglia(salaId) {
    var s = null;
    for (var i = 0; i < sale.length; i++) {
      if (sale[i].id === salaId) { s = sale[i]; break; }
    }
    if (!s) return;
    var cols = s.grid_cols || 16;
    var rows = s.grid_rows || 10;
    setGridCols(cols);
    setGridRows(rows);
    var larghezzaDisp = Math.min(VIEWPORT_W, window.innerWidth - 340);
    var calcolato = Math.floor(larghezzaDisp / cols);
    var clampato = Math.max(GRID_SIZE_MIN, Math.min(GRID_SIZE_MAX, calcolato));
    setGridSize(clampato);
    setGridSizeInput(String(clampato));
  }

  function caricaSale() {
    supabase.from('sale').select('*').eq('attiva', true).order('ordine').then(function(result) {
      if (result.error) { setErrore(result.error.message); return; }
      var dati = result.data || [];
      setSale(dati);
      if (dati.length > 0 && !salaSelezionata) setSalaSelezionata(dati[0].id);
      setLoading(false);
    });
  }

  function caricaTavoli() {
    supabase.from('tavoli').select('*').eq('attivo', true).order('nome').then(function(result) {
      if (!result.error) setTavoli(result.data || []);
    });
  }

  // Carica il numero totale di istanze per ogni tipologia in tutti i layout attivi
  function caricaIstanzePerTipologia() {
    supabase.from('layout_sala').select('tavolo_id, sala_id, istanza_id, data_validita_dal').order('data_validita_dal', { ascending: false }).then(function(result) {
      if (result.error) return;
      var vistiIstanza = {};
      var contatore = {};
      var rows = result.data || [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var chiave = r.istanza_id || (r.tavolo_id + '_' + r.sala_id + '_' + i);
        if (!vistiIstanza[chiave]) {
          vistiIstanza[chiave] = true;
          if (!contatore[r.tavolo_id]) contatore[r.tavolo_id] = 0;
          contatore[r.tavolo_id]++;
        }
      }
      setIstanzePerTipologia(contatore);
    });
  }

  // caricaLayout: ogni riga del DB diventa un layoutItem con istanza_id come chiave
  function caricaLayout(salaId) {
    supabase.from('layout_sala').select('*, tavolo:tavoli(*)').eq('sala_id', salaId).lte('data_validita_dal', dataSelezionata).order('data_validita_dal', { ascending: false }).then(function(result) {
      if (result.error) { setErrore(result.error.message); return; }
      var vistiIstanza = {};
      var layout = [];
      var rows = result.data || [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var iid = r.istanza_id || r.id;
        if (!vistiIstanza[iid]) {
          vistiIstanza[iid] = true;
          layout.push(Object.assign({}, r, { istanza_id: iid }));
        }
      }
      setLayoutAttivo(layout);
      setLayoutTemp(layout.map(function(r) { return Object.assign({}, r); }));
    });
  }

  function caricaOstacoli(salaId) {
    supabase.from('ostacoli_sala').select('*').eq('sala_id', salaId).then(function(result) {
      if (!result.error) setOstacoli(result.data || []);
    });
  }

  function caricaLayoutBase(salaId) {
    supabase.from('layout_base').select('*, layout_base_tavoli(*, tavolo:tavoli(*))').eq('sala_id', salaId).order('created_at', { ascending: false }).then(function(result) {
      if (!result.error) setLayoutBase(result.data || []);
    });
  }

  function caricaTavoliUniti() {
    supabase.from('tavoli_uniti').select('*').eq('data', dataSelezionata).eq('turno', turnoSelezionato).eq('attivo', true).then(function(result) {
      if (!result.error) setTavoliUniti(result.data || []);
    });
  }

  function caricaPrenotazioni() {
    supabase.from('reservations')
      .select('id, adults_count, children_count, notes, status, requested_time, customer_id')
      .eq('reservation_date', dataSelezionata)
      .eq('meal_type', turnoToMealType(turnoSelezionato))
      .then(function(result) {
        if (result.error) { return; }
        var rows = result.data || [];
        if (rows.length === 0) { setPrenotazioni([]); return; }
        // Carica i clienti separatamente
        var customerIds = [];
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].customer_id) customerIds.push(rows[i].customer_id);
        }
        supabase.from('customers')
          .select('id, first_name, last_name')
          .in('id', customerIds)
          .then(function(result2) {
            var clientiMap = {};
            var clienti = result2.data || [];
            for (var j = 0; j < clienti.length; j++) {
              clientiMap[clienti[j].id] = clienti[j];
            }
            var prenotazioniConClienti = rows.map(function(p) {
              return Object.assign({}, p, { customer: clientiMap[p.customer_id] || null });
            });
            setPrenotazioni(prenotazioniConClienti);
          });
      });
  }

  function caricaTavoliPrenotazioni() {
    supabase.from('tavoli_prenotazioni').select('*').eq('data', dataSelezionata).eq('turno', turnoSelezionato).then(function(result) {
      if (!result.error) setTavoliPrenotazioni(result.data || []);
    });
  }

  // ── ETICHETTE SERVIZIO: carica e salva ────────────────────────

  function caricaEtichetteServizio() {
    if (!salaSelezionata || !dataSelezionata || !turnoSelezionato) return;
    supabase
      .from('etichette_servizio')
      .select('*')
      .eq('sala_id', salaSelezionata)
      .eq('data_servizio', dataSelezionata)
      .eq('turno', turnoSelezionato)
      .then(function(result) {
        if (result.error) return;
        var mappa = {};
        var rows = result.data || [];
        for (var i = 0; i < rows.length; i++) {
          mappa[rows[i].istanza_id] = {
            etichetta: rows[i].etichetta || '',
            colore: rows[i].colore || '#9CA3AF'
          };
        }
        setEtichetteServizio(mappa);
      });
  }

  function salvaEtichettaServizio(istanzaId, testo, colore) {
    if (!salaSelezionata || !dataSelezionata || !turnoSelezionato) return;
    setSalvandoEtichetta(true);

    // Trova se questo tavolo e' unito — in quel caso salva l'etichetta su entrambe le istanze
    var istanzeTarget = [istanzaId];
    for (var i = 0; i < tavoliUniti.length; i++) {
      var u = tavoliUniti[i];
      if (u.istanza_principale_id === istanzaId && u.istanza_secondaria_id) {
        istanzeTarget.push(u.istanza_secondaria_id);
      } else if (u.istanza_secondaria_id === istanzaId && u.istanza_principale_id) {
        istanzeTarget.push(u.istanza_principale_id);
      }
    }

    var righe = istanzeTarget.map(function(iid) {
      return {
        istanza_id: iid,
        sala_id: salaSelezionata,
        data_servizio: dataSelezionata,
        turno: turnoSelezionato,
        etichetta: testo || '',
        colore: colore || '#9CA3AF'
      };
    });

    supabase
      .from('etichette_servizio')
      .upsert(righe, { onConflict: 'istanza_id,sala_id,data_servizio,turno' })
      .then(function(result) {
        setSalvandoEtichetta(false);
        if (result.error) {
          alert('Errore salvataggio etichetta: ' + result.error.message);
          return;
        }
        // Aggiorna lo stato locale per tutte le istanze coinvolte
        setEtichetteServizio(function(prev) {
          var nuovo = Object.assign({}, prev);
          for (var j = 0; j < istanzeTarget.length; j++) {
            nuovo[istanzeTarget[j]] = { etichetta: testo || '', colore: colore || '#9CA3AF' };
          }
          return nuovo;
        });
      });
  }

  // Restituisce l'etichetta di servizio per un'istanza (o valori di default)
  // Se il tavolo fa parte di un'unione, propaga l'etichetta del tavolo principale
  function getEtichettaServizio(istanzaId) {
    if (etichetteServizio[istanzaId]) return etichetteServizio[istanzaId];
    // Se fa parte di un'unione, cerca l'etichetta dell'altro tavolo del gruppo
    for (var j = 0; j < tavoliUniti.length; j++) {
      var u = tavoliUniti[j];
      // Questo e' il secondario: prendi etichetta del principale
      if (u.istanza_secondaria_id === istanzaId) {
        if (etichetteServizio[u.istanza_principale_id]) return etichetteServizio[u.istanza_principale_id];
      }
      // Questo e' il principale: prendi etichetta del secondario se disponibile
      if (u.istanza_principale_id === istanzaId) {
        if (etichetteServizio[u.istanza_secondaria_id]) return etichetteServizio[u.istanza_secondaria_id];
      }
    }
    return { etichetta: '', colore: '#9CA3AF' };
  }

  // Conta istanze di una tipologia nel layoutTemp corrente
  function contaIstanzeInLayoutTemp(tavoloId) {
    var n = 0;
    for (var i = 0; i < layoutTemp.length; i++) {
      if (layoutTemp[i].tavolo_id === tavoloId) n++;
    }
    return n;
  }

  // Conta istanze di una tipologia in altri layout (non la sala corrente)
  function contaIstanzeAlteSale(tavoloId) {
    var totale = istanzePerTipologia[tavoloId] || 0;
    var inQuestaS = 0;
    for (var i = 0; i < layoutAttivo.length; i++) {
      if (layoutAttivo[i].tavolo_id === tavoloId) inQuestaS++;
    }
    return Math.max(0, totale - inQuestaS);
  }

  function getStatoTavolo(istanzaId) {
    // Se fa parte di un'unione, usa l'istanza principale come riferimento
    var rappresentante = getIstanzaRappresentante(istanzaId);
    var assegnazioni = tavoliPrenotazioni.filter(function(tp) { return tp.istanza_id === rappresentante; });
    if (assegnazioni.length === 0) return 'libero';
    var pren = null;
    for (var j = 0; j < prenotazioni.length; j++) {
      var p = prenotazioni[j];
      for (var k = 0; k < assegnazioni.length; k++) {
        if (assegnazioni[k].prenotazione_id === p.id) { pren = p; break; }
      }
      if (pren) break;
    }
    if (!pren) return 'libero';
    if (pren.status === 'arrivato' || pren.status === 'al_tavolo' || pren.status === 'seated' || pren.status === 'arrived') return 'occupato';
    return 'prenotato';
  }

  function getNomeClienteIstanza(istanzaId) {
    var rappresentante = getIstanzaRappresentante(istanzaId);
    var a = null;
    for (var j = 0; j < tavoliPrenotazioni.length; j++) {
      if (tavoliPrenotazioni[j].istanza_id === rappresentante) { a = tavoliPrenotazioni[j]; break; }
    }
    if (!a) return null;
    var p = null;
    for (var k = 0; k < prenotazioni.length; k++) {
      if (prenotazioni[k].id === a.prenotazione_id) { p = prenotazioni[k]; break; }
    }
    if (!p) return null;
    return p.customer ? (p.customer.first_name + ' ' + p.customer.last_name) : 'Cliente';
  }

  function getOspitiAssegnatiIstanza(istanzaId) {
    var rappresentante = getIstanzaRappresentante(istanzaId);
    var tot = 0;
    for (var j = 0; j < tavoliPrenotazioni.length; j++) {
      if (tavoliPrenotazioni[j].istanza_id === rappresentante) tot += (tavoliPrenotazioni[j].n_ospiti_assegnati || 0);
    }
    return tot;
  }

  // Restituisce quanti ospiti di una prenotazione sono gia' assegnati su tutti i tavoli
  function getOspitiAssegnatiPrenotazione(prenotazioneId) {
    var tot = 0;
    for (var i = 0; i < tavoliPrenotazioni.length; i++) {
      if (tavoliPrenotazioni[i].prenotazione_id === prenotazioneId) {
        tot += (tavoliPrenotazioni[i].n_ospiti_assegnati || 0);
      }
    }
    return tot;
  }

  // Restituisce quanti ospiti di una prenotazione sono assegnati a una istanza (o alla sua unione)
  function getOspitiSuIstanza(prenotazioneId, istanzaId) {
    var rappresentante = getIstanzaRappresentante(istanzaId);
    for (var i = 0; i < tavoliPrenotazioni.length; i++) {
      if (tavoliPrenotazioni[i].prenotazione_id === prenotazioneId && tavoliPrenotazioni[i].istanza_id === rappresentante) {
        return tavoliPrenotazioni[i].n_ospiti_assegnati || 0;
      }
    }
    return 0;
  }

  // Restituisce il record di unione attiva per una istanza, oppure null
  function getUnionePerIstanza(istanzaId) {
    for (var i = 0; i < tavoliUniti.length; i++) {
      var u = tavoliUniti[i];
      if (u.istanza_principale_id === istanzaId || u.istanza_secondaria_id === istanzaId) return u;
    }
    return null;
  }

  function isIstanzaUnita(istanzaId) {
    return getUnionePerIstanza(istanzaId) !== null;
  }

  // Restituisce l'istanza_id "principale" dell'unione per registrare le assegnazioni
  // Se il tavolo e' il secondario, restituisce il principale; altrimenti se stesso
  function getIstanzaRappresentante(istanzaId) {
    var u = getUnionePerIstanza(istanzaId);
    if (!u) return istanzaId;
    return u.istanza_principale_id;
  }

  // Restituisce la capienza effettiva del tavolo (unione se unito, altrimenti propria)
  function getCapienzaEffettiva(istanzaId, capienzaBase) {
    var u = getUnionePerIstanza(istanzaId);
    if (u && u.capacita_unione > 0) return u.capacita_unione;
    return capienzaBase;
  }

  function getOstacoloACella(cx, cy) {
    for (var i = 0; i < ostacoli.length; i++) {
      if (ostacoli[i].cella_x === cx && ostacoli[i].cella_y === cy) return ostacoli[i];
    }
    return null;
  }

  function cellaBlocca(cx, cy) {
    var o = getOstacoloACella(cx, cy);
    if (!o) return false;
    var tipo = getTipoOstacolo(o.tipo);
    return tipo ? tipo.blocca : false;
  }

  function tavoloSuCellaBlocca(layoutItem) {
    var dim = getDimensioniEffettive(layoutItem);
    for (var dx = 0; dx < dim.w; dx++) {
      for (var dy = 0; dy < dim.h; dy++) {
        if (cellaBlocca(layoutItem.pos_x + dx, layoutItem.pos_y + dy)) return true;
      }
    }
    return false;
  }

  // Drag tavolo — usa istanza_id
  function onMouseDownTavolo(e, layoutItem) {
    e.preventDefault();
    var rect = gridRef.current.getBoundingClientRect();
    setDraggingIstanza(layoutItem.istanza_id);
    setDragOffset({ x: e.clientX - rect.left - layoutItem.pos_x * gridSize, y: e.clientY - rect.top - layoutItem.pos_y * gridSize });
  }

  function onMouseMoveGrid(e) {
    if (!draggingIstanza) return;
    var rect = gridRef.current.getBoundingClientRect();
    var item = null;
    for (var i = 0; i < layoutTemp.length; i++) {
      if (layoutTemp[i].istanza_id === draggingIstanza) { item = layoutTemp[i]; break; }
    }
    var dim = item ? getDimensioniEffettive(item) : { w: 1, h: 1 };
    var col = Math.max(0, Math.min(gridCols - dim.w, Math.round((e.clientX - rect.left - dragOffset.x) / gridSize)));
    var row = Math.max(0, Math.min(gridRows - dim.h, Math.round((e.clientY - rect.top - dragOffset.y) / gridSize)));
    setLayoutTemp(function(prev) {
      return prev.map(function(it) {
        if (it.istanza_id === draggingIstanza) return Object.assign({}, it, { pos_x: col, pos_y: row });
        return it;
      });
    });
    setLayoutModificato(true);
  }

  function onMouseUpGrid() { setDraggingIstanza(null); }

  function ruotaIstanzaInLayout(istanzaId) {
    setLayoutTemp(function(prev) {
      return prev.map(function(item) {
        if (item.istanza_id !== istanzaId) return item;
        var rotAttuale = (item.rotazione === null || item.rotazione === undefined) ? 0 : Number(item.rotazione);
        var nuovaRot = (rotAttuale + 90) % 360;
        var t = item.tavolo;
        var newW = (nuovaRot === 90 || nuovaRot === 270) ? (t.altezza || 1) : (t.larghezza || 2);
        var newH = (nuovaRot === 90 || nuovaRot === 270) ? (t.larghezza || 2) : (t.altezza || 1);
        var pos_x = Math.min(item.pos_x, gridCols - newW);
        var pos_y = Math.min(item.pos_y, gridRows - newH);
        return Object.assign({}, item, { rotazione: nuovaRot, pos_x: pos_x, pos_y: pos_y });
      });
    });
    setLayoutModificato(true);
  }

  // Rimozione immediata dal DB — usa istanza_id
  function rimuoviIstanzaDB(layoutItem) {
    var label = (layoutItem.etichetta && layoutItem.etichetta.trim()) ? layoutItem.etichetta : (layoutItem.tavolo ? layoutItem.tavolo.nome : 'tavolo');
    if (!window.confirm('Rimuovere "' + label + '" dal layout?')) return;
    supabase.from('layout_sala').delete().eq('istanza_id', layoutItem.istanza_id).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); return; }
      caricaLayout(salaSelezionata);
      caricaIstanzePerTipologia();
    });
  }

  // Salva layout — cancella tutte le righe esistenti della sala, poi inserisce
  function salvaLayout() {
    var oggi = new Date().toISOString().split('T')[0];
    supabase.from('layout_sala').delete().eq('sala_id', salaSelezionata).then(function(delResult) {
      if (delResult.error) { alert('Errore nella pulizia del layout: ' + delResult.error.message); return; }
      var righe = layoutTemp.map(function(item) {
        var rot = (item.rotazione === null || item.rotazione === undefined) ? 0 : Number(item.rotazione);
        return {
          sala_id: salaSelezionata,
          tavolo_id: item.tavolo_id,
          pos_x: item.pos_x,
          pos_y: item.pos_y,
          rotazione: rot,
          etichetta: item.etichetta || null,
          istanza_id: item.istanza_id,
          data_validita_dal: oggi
        };
      });
      if (righe.length === 0) {
        setLayoutModificato(false);
        caricaLayout(salaSelezionata);
        caricaIstanzePerTipologia();
        alert('Layout salvato correttamente!');
        return;
      }
      supabase.from('layout_sala').insert(righe).then(function(insResult) {
        if (insResult.error) { alert('Errore nel salvataggio: ' + insResult.error.message); return; }
        setLayoutModificato(false);
        caricaLayout(salaSelezionata);
        caricaIstanzePerTipologia();
        alert('Layout salvato correttamente!');
      });
    });
  }

  // Genera il prossimo suggerimento etichetta automatica basato su prefisso sala
  function generaProssimaEtichetta() {
    var salaDati = null;
    for (var i = 0; i < sale.length; i++) {
      if (sale[i].id === salaSelezionata) { salaDati = sale[i]; break; }
    }
    var prefisso = (salaDati && salaDati.prefisso_tavolo) ? salaDati.prefisso_tavolo.trim().toUpperCase() : '';
    var numInizio = (salaDati && salaDati.numero_iniziale) ? parseInt(salaDati.numero_iniziale) : 1;
    if (!prefisso) return '';
    // Trova tutti i numeri già usati con questo prefisso nel layoutTemp
    var usati = {};
    for (var j = 0; j < layoutTemp.length; j++) {
      var et = (layoutTemp[j].etichetta || '').trim().toUpperCase();
      if (et.indexOf(prefisso) === 0) {
        var numParte = parseInt(et.slice(prefisso.length));
        if (!isNaN(numParte)) usati[numParte] = true;
      }
    }
    var n = numInizio;
    while (usati[n]) n++;
    return prefisso + String(n).padStart(3, '0');
  }

  // Aggiunge una nuova istanza al layoutTemp — genera un nuovo istanza_id univoco
  function richiediEtichettaEAggiungi(tavoloSnap) {
    var quantita = tavoloSnap.quantita || 1;
    var istanzeInLayout = contaIstanzeInLayoutTemp(tavoloSnap.id);
    var istanzeAlteSale = contaIstanzeAlteSale(tavoloSnap.id);
    var totaleUsate = istanzeInLayout + istanzeAlteSale;
    if (totaleUsate >= quantita) {
      alert('Tutte le ' + quantita + ' unita di "' + tavoloSnap.nome + '" sono gia\' in uso.');
      return;
    }
    setTavoloInAttesaEtichetta(tavoloSnap);
    setEtichettaInput(generaProssimaEtichetta());
    setShowModaleEtichetta(true);
  }

  function confermAggiungiConEtichetta() {
    var tavolo = tavoloInAttesaEtichetta;
    if (!tavolo) return;
    var nuovoIstanzaId = generaUUID();
    setLayoutTemp(function(prev) {
      return prev.concat([{
        istanza_id: nuovoIstanzaId,
        id: null,
        sala_id: salaSelezionata,
        tavolo_id: tavolo.id,
        tavolo: tavolo,
        pos_x: 0, pos_y: 0,
        rotazione: 0,
        etichetta: etichettaInput.trim(),
        data_validita_dal: new Date().toISOString().split('T')[0],
        nuovo: true
      }]);
    });
    setLayoutModificato(true);
    setShowModaleEtichetta(false);
    setTavoloInAttesaEtichetta(null);
    setEtichettaInput('');
  }

  function aggiungiGruppoAlLayout(snapList) {
    var daAggiungere = [];
    for (var i = 0; i < snapList.length; i++) {
      var t = snapList[i];
      var quantita = t.quantita || 1;
      var istanzeInLayout = contaIstanzeInLayoutTemp(t.id);
      var istanzeAlteSale = contaIstanzeAlteSale(t.id);
      var disponibili = quantita - istanzeInLayout - istanzeAlteSale;
      if (disponibili > 0) daAggiungere.push(t);
    }
    if (daAggiungere.length === 0) return;
    setLayoutTemp(function(prev) {
      var nuovi = daAggiungere.map(function(t) {
        return {
          istanza_id: generaUUID(),
          id: null, sala_id: salaSelezionata, tavolo_id: t.id, tavolo: t,
          pos_x: 0, pos_y: 0, rotazione: 0, etichetta: '',
          data_validita_dal: new Date().toISOString().split('T')[0],
          nuovo: true
        };
      });
      return prev.concat(nuovi);
    });
    setLayoutModificato(true);
  }

  function salvaLayoutBaseCorrente() {
    if (!nomeLayoutBase.trim()) { alert('Inserisci un nome per il layout base'); return; }
    if (layoutTemp.length === 0) { alert('Non ci sono tavoli nel layout attuale'); return; }
    setSalvaBaseLoading(true);
    supabase.from('layout_base').insert({ sala_id: salaSelezionata, nome: nomeLayoutBase.trim(), descrizione: descLayoutBase.trim() || null }).select().single().then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); setSalvaBaseLoading(false); return; }
      var layoutBaseId = result.data.id;
      var righe = layoutTemp.map(function(item) {
        return { layout_base_id: layoutBaseId, tavolo_id: item.tavolo_id, pos_x: item.pos_x, pos_y: item.pos_y, rotazione: (item.rotazione === null || item.rotazione === undefined) ? 0 : Number(item.rotazione), etichetta: item.etichetta || null };
      });
      supabase.from('layout_base_tavoli').insert(righe).then(function(r2) {
        setSalvaBaseLoading(false);
        if (r2.error) { alert('Errore: ' + r2.error.message); return; }
        setShowSalvaBase(false); setNomeLayoutBase(''); setDescLayoutBase('');
        caricaLayoutBase(salaSelezionata);
      });
    });
  }

  function caricaLayoutBaseSuGriglia(lb) {
    if (!window.confirm('Caricare il layout "' + lb.nome + '"? Le modifiche non salvate andranno perse.')) return;
    var nuovoLayout = (lb.layout_base_tavoli || []).map(function(item) {
      return {
        istanza_id: generaUUID(),
        id: null, sala_id: salaSelezionata,
        tavolo_id: item.tavolo_id, tavolo: item.tavolo,
        pos_x: item.pos_x, pos_y: item.pos_y,
        rotazione: item.rotazione || 0,
        etichetta: item.etichetta || '',
        data_validita_dal: new Date().toISOString().split('T')[0],
        nuovo: true
      };
    });
    setLayoutTemp(nuovoLayout);
    setLayoutModificato(true);
  }

  function eliminaLayoutBase(lb) {
    if (!window.confirm('Eliminare il layout base "' + lb.nome + '"?')) return;
    supabase.from('layout_base').delete().eq('id', lb.id).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); return; }
      caricaLayoutBase(salaSelezionata);
    });
  }

  function apriFormTavolo(tavolo) {
    if (tavolo) {
      setTavoloInEditing(tavolo);
      setFormTavolo({ nome: tavolo.nome, capacita: tavolo.capacita, forma: tavolo.forma, larghezza: tavolo.larghezza, altezza: tavolo.altezza, colore: tavolo.colore, note: tavolo.note || '', categoria: tavolo.categoria || '', quantita: tavolo.quantita || 1, border_radius: tavolo.border_radius || 0 });
    } else {
      setTavoloInEditing(null);
      setFormTavolo({ nome: '', capacita: 4, forma: 'rettangolo', larghezza: 2, altezza: 1, colore: '#6B7280', note: '', categoria: '', quantita: 1 });
    }
    setShowFormTavolo(true);
  }

  function salvaTavolo() {
    if (!formTavolo.nome.trim()) { alert('Inserisci il nome della tipologia'); return; }
    var dati = { nome: formTavolo.nome.trim(), capacita: parseInt(formTavolo.capacita) || 4, forma: formTavolo.forma, larghezza: parseInt(formTavolo.larghezza) || 2, altezza: parseInt(formTavolo.altezza) || 1, colore: formTavolo.colore, note: formTavolo.note, categoria: formTavolo.categoria.trim() || null, quantita: parseInt(formTavolo.quantita) || 1, border_radius: parseInt(formTavolo.border_radius) || 0 };
    if (tavoloInEditing) {
      supabase.from('tavoli').update(dati).eq('id', tavoloInEditing.id).then(function(result) {
        if (result.error) { alert('Errore: ' + result.error.message); return; }
        caricaTavoli(); caricaLayout(salaSelezionata); setShowFormTavolo(false);
      });
    } else {
      supabase.from('tavoli').insert(dati).then(function(result) {
        if (result.error) { alert('Errore: ' + result.error.message); return; }
        caricaTavoli(); setShowFormTavolo(false);
      });
    }
  }

  function duplicaTavolo(tavolo) {
    var base = tavolo.nome;
    var n = 0;
    for (var i = 0; i < tavoli.length; i++) { if (tavoli[i].nome.indexOf(base) === 0) n++; }
    var dati = { nome: base + ' (' + (n + 1) + ')', capacita: tavolo.capacita, forma: tavolo.forma, larghezza: tavolo.larghezza, altezza: tavolo.altezza, colore: tavolo.colore, note: tavolo.note || '', categoria: tavolo.categoria || null, quantita: tavolo.quantita || 1, attivo: true };
    supabase.from('tavoli').insert(dati).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); return; }
      caricaTavoli();
    });
  }

  function eliminaTavolo(tavolo) {
    if (!window.confirm('Eliminare la tipologia "' + tavolo.nome + '"?')) return;
    supabase.from('tavoli').update({ attivo: false }).eq('id', tavolo.id).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); return; }
      caricaTavoli(); caricaLayout(salaSelezionata);
    });
  }

  function apriFormSala(sala) {
    if (sala) { setSalaInEditing(sala); setFormSala({ nome: sala.nome, ordine: sala.ordine, grid_cols: sala.grid_cols || 40, grid_rows: sala.grid_rows || 30, prefisso_tavolo: sala.prefisso_tavolo || '', numero_iniziale: sala.numero_iniziale || 1 }); }
    else { setSalaInEditing(null); setFormSala({ nome: '', ordine: sale.length + 1, grid_cols: 40, grid_rows: 30, prefisso_tavolo: '', numero_iniziale: 1 }); }
    setShowFormSala(true);
  }

  function salvaSala() {
    if (!formSala.nome.trim()) { alert('Inserisci il nome della sala'); return; }
    var dati = { nome: formSala.nome.trim(), ordine: parseInt(formSala.ordine) || 1, attiva: true, grid_cols: parseInt(formSala.grid_cols) || 40, grid_rows: parseInt(formSala.grid_rows) || 30, prefisso_tavolo: formSala.prefisso_tavolo.trim() || null, numero_iniziale: parseInt(formSala.numero_iniziale) || 1 };
    if (salaInEditing) {
      supabase.from('sale').update(dati).eq('id', salaInEditing.id).then(function(result) {
        if (result.error) { alert('Errore: ' + result.error.message); return; }
        caricaSale(); setShowFormSala(false);
      });
    } else {
      supabase.from('sale').insert(dati).then(function(result) {
        if (result.error) { alert('Errore: ' + result.error.message); return; }
        caricaSale(); setShowFormSala(false);
      });
    }
  }

  function disattivaSala(sala) {
    if (!window.confirm('Disattivare la sala "' + sala.nome + '"?')) return;
    supabase.from('sale').update({ attiva: false }).eq('id', sala.id).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); return; }
      caricaSale();
    });
  }

  function avviaModalitaUnione() {
    setModalitaUnione('scegli');
    setSecondoTavoloUnione(null);
    setPosizioneOriginaleUnione(null);
    setShowUnione(false);
  }

  // Calcola la posizione affiancata: mette il secondo tavolo a destra del primo
  function calcolaPosAffiancata(primo, secondo) {
    var dimPrimo = getDimensioniEffettive(primo);
    var dimSecondo = getDimensioniEffettive(secondo);
    // Prova a destra
    var nuovoX = primo.pos_x + dimPrimo.w;
    var nuovoY = primo.pos_y;
    // Se esce dalla griglia prova a sinistra
    if (nuovoX + dimSecondo.w > gridCols) {
      nuovoX = primo.pos_x - dimSecondo.w;
    }
    // Se ancora fuori prova sotto
    if (nuovoX < 0) {
      nuovoX = primo.pos_x;
      nuovoY = primo.pos_y + dimPrimo.h;
    }
    // Clamp finale
    nuovoX = Math.max(0, Math.min(gridCols - dimSecondo.w, nuovoX));
    nuovoY = Math.max(0, Math.min(gridRows - dimSecondo.h, nuovoY));
    return { x: nuovoX, y: nuovoY };
  }

  function sonoDaAffiancati(primo, secondo) {
    var dimPrimo = getDimensioniEffettive(primo);
    var dimSecondo = getDimensioniEffettive(secondo);
    // Controllare se sono gia' adiacenti (si toccano)
    var toccaDestra  = primo.pos_x + dimPrimo.w === secondo.pos_x && primo.pos_y === secondo.pos_y;
    var toccaSinistra = secondo.pos_x + dimSecondo.w === primo.pos_x && primo.pos_y === secondo.pos_y;
    var toccaSotto   = primo.pos_y + dimPrimo.h === secondo.pos_y && primo.pos_x === secondo.pos_x;
    var toccaSopra   = secondo.pos_y + dimSecondo.h === primo.pos_y && primo.pos_x === secondo.pos_x;
    return toccaDestra || toccaSinistra || toccaSotto || toccaSopra;
  }

  function selezionaSecondoTavoloUnione(layoutItem) {
    if (!tavoloSelezionato) return;
    var posOrig = { x: layoutItem.pos_x, y: layoutItem.pos_y };
    setPosizioneOriginaleUnione(posOrig);
    setSecondoTavoloUnione(Object.assign({}, layoutItem));
    var cap1 = tavoloSelezionato.tavolo ? tavoloSelezionato.tavolo.capacita : 0;
    var cap2 = layoutItem.tavolo ? layoutItem.tavolo.capacita : 0;
    setUnioneCapienza(cap1 + cap2);
    // Entra in modalita posizionamento libero
    setModalitaUnione('posiziona');
  }

  // Drag del secondo tavolo in modalita posizionamento unione
  function onMouseDownSecondoTavolo(e) {
    e.preventDefault();
    if (modalitaUnione !== 'posiziona' || !secondoTavoloUnione) return;
    var rect = gridRef.current.getBoundingClientRect();
    setDraggingIstanza(secondoTavoloUnione.istanza_id);
    setDragOffset({ x: e.clientX - rect.left - secondoTavoloUnione.pos_x * gridSize, y: e.clientY - rect.top - secondoTavoloUnione.pos_y * gridSize });
  }

  function onMouseMoveUnione(e) {
    if (modalitaUnione !== 'posiziona' || !draggingIstanza || !secondoTavoloUnione) return;
    if (draggingIstanza !== secondoTavoloUnione.istanza_id) return;
    var rect = gridRef.current.getBoundingClientRect();
    var dim = getDimensioniEffettive(secondoTavoloUnione);
    var col = Math.max(0, Math.min(gridCols - dim.w, Math.round((e.clientX - rect.left - dragOffset.x) / gridSize)));
    var row = Math.max(0, Math.min(gridRows - dim.h, Math.round((e.clientY - rect.top - dragOffset.y) / gridSize)));
    setSecondoTavoloUnione(function(prev) { return Object.assign({}, prev, { pos_x: col, pos_y: row }); });
    // Aggiorna anche layoutAttivo visivamente
    setLayoutAttivo(function(prev) {
      return prev.map(function(it) {
        if (it.istanza_id === secondoTavoloUnione.istanza_id) return Object.assign({}, it, { pos_x: col, pos_y: row });
        return it;
      });
    });
  }

  function onMouseUpUnione() {
    if (modalitaUnione === 'posiziona') setDraggingIstanza(null);
  }

  function annullaUnione() {
    // Ripristina posizione originale del secondo tavolo
    if (secondoTavoloUnione && posizioneOriginaleUnione) {
      setLayoutAttivo(function(prev) {
        return prev.map(function(it) {
          if (it.istanza_id === secondoTavoloUnione.istanza_id) {
            return Object.assign({}, it, { pos_x: posizioneOriginaleUnione.x, pos_y: posizioneOriginaleUnione.y });
          }
          return it;
        });
      });
    }
    setModalitaUnione(false);
    setSecondoTavoloUnione(null);
    setPosizioneOriginaleUnione(null);
    setDraggingIstanza(null);
  }

  function confermaUnione() {
    if (!tavoloSelezionato || !secondoTavoloUnione) return;
    if (posizioneOriginaleUnione &&
        (secondoTavoloUnione.pos_x !== posizioneOriginaleUnione.x ||
         secondoTavoloUnione.pos_y !== posizioneOriginaleUnione.y)) {
      supabase.from('layout_sala').insert({
        sala_id: salaSelezionata,
        tavolo_id: secondoTavoloUnione.tavolo_id,
        pos_x: secondoTavoloUnione.pos_x,
        pos_y: secondoTavoloUnione.pos_y,
        rotazione: secondoTavoloUnione.rotazione || 0,
        etichetta: secondoTavoloUnione.etichetta || null,
        istanza_id: secondoTavoloUnione.istanza_id,
        data_validita_dal: new Date().toISOString().split('T')[0]
      }).then(function() {});
    }
    supabase.from('tavoli_uniti').insert({
      tavolo_principale_id: tavoloSelezionato.tavolo_id,
      tavolo_secondario_id: secondoTavoloUnione.tavolo_id,
      istanza_principale_id: tavoloSelezionato.istanza_id,
      istanza_secondaria_id: secondoTavoloUnione.istanza_id,
      data: dataSelezionata,
      turno: turnoSelezionato,
      attivo: true,
      capacita_unione: parseInt(unioneCapienza) || 0
    }).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); return; }
      caricaTavoliUniti();
      setModalitaUnione(false);
      setSecondoTavoloUnione(null);
      setPosizioneOriginaleUnione(null);
      setPannelloAperto(false);
    });
  }

  function sciogliUnione(unioneId) {
    supabase.from('tavoli_uniti').update({ attivo: false }).eq('id', unioneId).then(function() { caricaTavoliUniti(); });
  }

  function confermaAssegna() {
    if (!assegnaPrenotazione) { alert('Seleziona una prenotazione'); return; }
    var n = parseInt(assegnaOspiti);
    if (!n || n <= 0) { alert('Inserisci il numero di ospiti'); return; }
    // Usa sempre l'istanza principale dell'unione come rappresentante
    var istanzaId = getIstanzaRappresentante(tavoloSelezionato.istanza_id);
    var tavoloId = tavoloSelezionato.tavolo_id;
    if (istanzaId !== tavoloSelezionato.istanza_id) {
      for (var li = 0; li < layoutAttivo.length; li++) {
        if (layoutAttivo[li].istanza_id === istanzaId) { tavoloId = layoutAttivo[li].tavolo_id; break; }
      }
    }
    var esistente = null;
    for (var i = 0; i < tavoliPrenotazioni.length; i++) {
      if (tavoliPrenotazioni[i].prenotazione_id === assegnaPrenotazione && tavoliPrenotazioni[i].istanza_id === istanzaId) {
        esistente = tavoliPrenotazioni[i];
        break;
      }
    }
    if (esistente) {
      supabase.from('tavoli_prenotazioni').update({ n_ospiti_assegnati: n }).eq('id', esistente.id).then(function(result) {
        if (result.error) { alert('Errore: ' + result.error.message); return; }
        caricaTavoliPrenotazioni(); setShowAssegna(false); setAssegnaPrenotazione(null); setAssegnaOspiti(0);
      });
    } else {
      supabase.from('tavoli_prenotazioni').insert({
        prenotazione_id: assegnaPrenotazione,
        tavolo_id: tavoloId,
        istanza_id: istanzaId,
        n_ospiti_assegnati: n,
        data: dataSelezionata,
        turno: turnoSelezionato
      }).then(function(result) {
        if (result.error) { alert('Errore: ' + result.error.message); return; }
        caricaTavoliPrenotazioni(); setShowAssegna(false); setAssegnaPrenotazione(null); setAssegnaOspiti(0);
      });
    }
  }

  function rimuoviAssegnazione(istanzaId, prenotazioneId) {
    if (!window.confirm('Rimuovere questa assegnazione dal tavolo?')) return;
    var rappresentante = getIstanzaRappresentante(istanzaId);
    if (prenotazioneId) {
      supabase.from('tavoli_prenotazioni').delete().eq('istanza_id', rappresentante).eq('prenotazione_id', prenotazioneId).then(function() { caricaTavoliPrenotazioni(); });
    } else {
      supabase.from('tavoli_prenotazioni').delete().eq('istanza_id', rappresentante).then(function() { caricaTavoliPrenotazioni(); });
    }
  }

  function toggleGruppo(cat) {
    setGruppiEspansi(function(prev) {
      var nuovo = Object.assign({}, prev);
      nuovo[cat] = !nuovo[cat];
      return nuovo;
    });
  }

  function toggleSelezioneTavolo(istanzaId) {
    setSelezionatiEditor(function(prev) {
      if (prev.indexOf(istanzaId) >= 0) return prev.filter(function(id) { return id !== istanzaId; });
      return prev.concat([istanzaId]);
    });
  }

  function allineaSelezionati(tipo) {
    if (selezionatiEditor.length < 2) return;
    var items = layoutTemp.filter(function(it) { return selezionatiEditor.indexOf(it.istanza_id) >= 0; });
    if (items.length === 0) return;
    var val;
    if (tipo === 'sinistra') val = items.reduce(function(m, it) { return Math.min(m, it.pos_x); }, Infinity);
    else if (tipo === 'destra') val = items.reduce(function(m, it) { var d = getDimensioniEffettive(it); return Math.max(m, it.pos_x + d.w); }, -Infinity);
    else if (tipo === 'alto') val = items.reduce(function(m, it) { return Math.min(m, it.pos_y); }, Infinity);
    else if (tipo === 'basso') val = items.reduce(function(m, it) { var d = getDimensioniEffettive(it); return Math.max(m, it.pos_y + d.h); }, -Infinity);
    else if (tipo === 'centro_h') val = items.reduce(function(acc, it) { return acc + it.pos_x + getDimensioniEffettive(it).w / 2; }, 0) / items.length;
    else if (tipo === 'centro_v') val = items.reduce(function(acc, it) { return acc + it.pos_y + getDimensioniEffettive(it).h / 2; }, 0) / items.length;
    else if (tipo === 'distrib_h') {
      var sortH = items.slice().sort(function(a, b) { return a.pos_x - b.pos_x; });
      var minX = sortH[0].pos_x;
      var maxX = sortH[sortH.length - 1].pos_x + getDimensioniEffettive(sortH[sortH.length - 1]).w;
      var totalW = sortH.reduce(function(s, it) { return s + getDimensioniEffettive(it).w; }, 0);
      var gap = (maxX - minX - totalW) / (sortH.length - 1);
      var curX = minX;
      setLayoutTemp(function(prev) {
        var mappa = {};
        for (var i = 0; i < sortH.length; i++) {
          mappa[sortH[i].istanza_id] = curX;
          curX += getDimensioniEffettive(sortH[i]).w + gap;
        }
        return prev.map(function(it) {
          if (mappa[it.istanza_id] !== undefined) return Object.assign({}, it, { pos_x: Math.round(mappa[it.istanza_id]) });
          return it;
        });
      });
      setLayoutModificato(true);
      return;
    } else if (tipo === 'distrib_v') {
      var sortV = items.slice().sort(function(a, b) { return a.pos_y - b.pos_y; });
      var minY = sortV[0].pos_y;
      var maxY = sortV[sortV.length - 1].pos_y + getDimensioniEffettive(sortV[sortV.length - 1]).h;
      var totalH = sortV.reduce(function(s, it) { return s + getDimensioniEffettive(it).h; }, 0);
      var gapV = (maxY - minY - totalH) / (sortV.length - 1);
      var curY = minY;
      setLayoutTemp(function(prev) {
        var mappaV = {};
        for (var i = 0; i < sortV.length; i++) {
          mappaV[sortV[i].istanza_id] = curY;
          curY += getDimensioniEffettive(sortV[i]).h + gapV;
        }
        return prev.map(function(it) {
          if (mappaV[it.istanza_id] !== undefined) return Object.assign({}, it, { pos_y: Math.round(mappaV[it.istanza_id]) });
          return it;
        });
      });
      setLayoutModificato(true);
      return;
    }
    setLayoutTemp(function(prev) {
      return prev.map(function(it) {
        if (selezionatiEditor.indexOf(it.istanza_id) < 0) return it;
        var dim = getDimensioniEffettive(it);
        if (tipo === 'sinistra') return Object.assign({}, it, { pos_x: val });
        if (tipo === 'destra') return Object.assign({}, it, { pos_x: Math.max(0, val - dim.w) });
        if (tipo === 'alto') return Object.assign({}, it, { pos_y: val });
        if (tipo === 'basso') return Object.assign({}, it, { pos_y: Math.max(0, val - dim.h) });
        if (tipo === 'centro_h') return Object.assign({}, it, { pos_x: Math.round(val - dim.w / 2) });
        if (tipo === 'centro_v') return Object.assign({}, it, { pos_y: Math.round(val - dim.h / 2) });
        return it;
      });
    });
    setLayoutModificato(true);
  }

  // ── OSTACOLI ─────────────────────────────────────────────────

  function cellaFromEvent(e, ref) {
    var rect = ref.current.getBoundingClientRect();
    var col = Math.floor((e.clientX - rect.left) / gridSize);
    var row = Math.floor((e.clientY - rect.top) / gridSize);
    col = Math.max(0, Math.min(gridCols - 1, col));
    row = Math.max(0, Math.min(gridRows - 1, row));
    return { x: col, y: row };
  }

  function toggleOstacolo(cx, cy) {
    var esistente = getOstacoloACella(cx, cy);
    if (esistente) {
      supabase.from('ostacoli_sala').delete().eq('id', esistente.id).then(function() {
        setOstacoli(function(prev) { return prev.filter(function(o) { return o.id !== esistente.id; }); });
      });
    } else {
      var nuovo = { sala_id: salaSelezionata, tipo: tipoOstacoloAttivo, cella_x: cx, cella_y: cy };
      supabase.from('ostacoli_sala').insert(nuovo).select().single().then(function(result) {
        if (!result.error) setOstacoli(function(prev) { return prev.concat([result.data]); });
      });
    }
  }

  function applicaAreaOstacoli(x1, y1, x2, y2) {
    var minX = Math.min(x1, x2); var maxX = Math.max(x1, x2);
    var minY = Math.min(y1, y2); var maxY = Math.max(y1, y2);
    var nuovi = [];
    for (var cx = minX; cx <= maxX; cx++) {
      for (var cy = minY; cy <= maxY; cy++) {
        if (!getOstacoloACella(cx, cy)) nuovi.push({ sala_id: salaSelezionata, tipo: tipoOstacoloAttivo, cella_x: cx, cella_y: cy });
      }
    }
    if (nuovi.length === 0) return;
    supabase.from('ostacoli_sala').insert(nuovi).select().then(function(result) {
      if (!result.error) setOstacoli(function(prev) { return prev.concat(result.data || []); });
    });
  }

  function applicaServizio(x1, y1, x2, y2) {
    var minX = Math.min(x1, x2); var maxX = Math.max(x1, x2);
    var minY = Math.min(y1, y2); var maxY = Math.max(y1, y2);
    var nuovi = [];
    for (var cx = minX; cx <= maxX; cx++) {
      for (var cy = minY; cy <= maxY; cy++) {
        if (!getOstacoloACella(cx, cy)) nuovi.push({ sala_id: salaSelezionata, tipo: 'servizio', cella_x: cx, cella_y: cy });
      }
    }
    if (nuovi.length === 0) return;
    supabase.from('ostacoli_sala').insert(nuovi).select().then(function(result) {
      if (!result.error) setOstacoli(function(prev) { return prev.concat(result.data || []); });
    });
  }

  function cancellaOstacoliSala() {
    if (!window.confirm('Eliminare tutti gli ostacoli di questa sala?')) return;
    supabase.from('ostacoli_sala').delete().eq('sala_id', salaSelezionata).then(function() { setOstacoli([]); });
  }

  function confermaDireLunghezza() {
    var n = parseInt(dialogLunghezza);
    if (!pendingDragInfo) return;
    var x1 = pendingDragInfo.x1; var y1 = pendingDragInfo.y1;
    var x2raw = pendingDragInfo.x2raw; var y2raw = pendingDragInfo.y2raw;
    var tipo = pendingDragInfo.tipo;
    var dx = Math.abs(x2raw - x1); var dy = Math.abs(y2raw - y1);
    var x2, y2;
    if (!isNaN(n) && n >= 1) {
      if (dx >= dy) { x2 = x1 + (x2raw >= x1 ? n - 1 : -(n - 1)); y2 = y1; }
      else { x2 = x1; y2 = y1 + (y2raw >= y1 ? n - 1 : -(n - 1)); }
      x2 = Math.max(0, Math.min(gridCols - 1, x2));
      y2 = Math.max(0, Math.min(gridRows - 1, y2));
    } else { x2 = x2raw; y2 = y2raw; }
    setShowDialogLunghezza(false); setDialogLunghezza(''); setPendingDragInfo(null);
    setDragOstacoloStart(null); setDragOstacoloEnd(null);
    if (tipo === 'servizio') applicaServizio(x1, y1, x2, y2);
    else applicaAreaOstacoli(x1, y1, x2, y2);
  }

  function annullaDireLunghezza() {
    setShowDialogLunghezza(false); setDialogLunghezza(''); setPendingDragInfo(null);
    setDragOstacoloStart(null); setDragOstacoloEnd(null);
    setIsDraggingOstacolo(false); setDraggingServizio(false);
    setServizioInizio(null); setServizioFine(null);
  }

  // ── SLIDER ───────────────────────────────────────────────────

  function renderSliderGriglia() {
    if (gridSize === null) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f3f4f6', borderRadius: '8px', padding: '6px 12px' }}>
        <span style={{ fontSize: '12px', color: '#6B7280', whiteSpace: 'nowrap' }}>Cella:</span>
        <input type="range" min={GRID_SIZE_MIN} max={GRID_SIZE_MAX} step="1" value={gridSize}
          onChange={function(e) { var v = parseInt(e.target.value); setGridSize(v); setGridSizeInput(String(v)); }}
          style={{ width: '70px', cursor: 'pointer' }}
        />
        <input type="number" min={GRID_SIZE_MIN} max={GRID_SIZE_MAX} value={gridSizeInput}
          onChange={function(e) {
            setGridSizeInput(e.target.value);
            var v = parseInt(e.target.value);
            if (!isNaN(v) && v >= GRID_SIZE_MIN && v <= GRID_SIZE_MAX) setGridSize(v);
          }}
          style={{ width: '48px', padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', fontWeight: '700', textAlign: 'center' }}
        />
        <span style={{ fontSize: '11px', color: '#9CA3AF' }}>px</span>
      </div>
    );
  }

  function renderOverlayOstacoli(editorMode) {
    return ostacoli.map(function(o) {
      var tipo = getTipoOstacolo(o.tipo);
      if (!tipo) return null;
      return (
        <div key={o.id} style={{ position: 'absolute', left: (o.cella_x * gridSize) + 'px', top: (o.cella_y * gridSize) + 'px', width: gridSize + 'px', height: gridSize + 'px', background: tipo.colore, opacity: tipo.blocca ? 0.75 : 0.45, zIndex: 5, pointerEvents: editorMode ? 'auto' : 'none', cursor: editorMode ? 'pointer' : 'default', borderRadius: o.tipo === 'colonna' ? '50%' : '0px', border: editorMode ? '1px solid rgba(255,255,255,0.3)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={editorMode ? function() { toggleOstacolo(o.cella_x, o.cella_y); } : undefined}
          title={tipo.label}
        >
          <span style={{ fontSize: '9px', color: 'white', fontWeight: '700', opacity: 0.9 }}>
            {o.tipo === 'finestra' ? '⬜' : o.tipo === 'porta' ? '🚪' : o.tipo === 'bancone' ? '▬' : o.tipo === 'colonna' ? '●' : ''}
          </span>
        </div>
      );
    });
  }

  // Render tavolo — in mappa usa colore etichetta servizio, in editor usa colore tipologia
  function renderTavoloGriglia(layoutItem, editorMode) {
    var t = layoutItem.tavolo;
    if (!t) return null;
    var dim = getDimensioniEffettive(layoutItem);
    var w = dim.w * gridSize - 4;
    var h = dim.h * gridSize - 4;
    var x = layoutItem.pos_x * gridSize + 2;
    var y = layoutItem.pos_y * gridSize + 2;
    var stato = editorMode ? 'libero' : getStatoTavolo(layoutItem.istanza_id);
    var nomeCliente = editorMode ? null : getNomeClienteIstanza(layoutItem.istanza_id);
    var ospiti = editorMode ? 0 : getOspitiAssegnatiIstanza(layoutItem.istanza_id);
    var unito = !editorMode && isIstanzaUnita(layoutItem.istanza_id);
    var isRound = t.forma === 'rotondo';
    var suOstacolo = editorMode && tavoloSuCellaBlocca(layoutItem);
    var pad = mostraSedie ? 14 : 0;

    // In modalita mappa: colore dal servizio; in editor: colore tipologia
    var bgColor;
    if (editorMode) {
      bgColor = t.colore || '#6B7280';
    } else {
      var esServizio = getEtichettaServizio(layoutItem.istanza_id);
      bgColor = esServizio.colore || '#9CA3AF';
    }

    // Etichetta visibile sul tavolo nella mappa: prima l'etichetta di layout (es. T50), poi eventuale nome cliente
    var labelVisibile = (layoutItem.etichetta && layoutItem.etichetta.trim()) ? layoutItem.etichetta.trim() : '';

    // In mappa, sotto l'etichetta mostriamo il testo di servizio se presente
    var testoServizio = '';
    if (!editorMode) {
      var es2 = getEtichettaServizio(layoutItem.istanza_id);
      testoServizio = es2.etichetta || '';
    }

    var borderRadiusTavolo = isRound ? '50%' : ((t.border_radius || 0) + 'px');
    var rotAttuale = (layoutItem.rotazione === null || layoutItem.rotazione === undefined) ? 0 : Number(layoutItem.rotazione);

    // Selezione multipla editor
    var isSelezionatoMult = selezionatiEditor.indexOf(layoutItem.istanza_id) >= 0;

    // Evidenziazione in modalita unione
    var isPrimo = tavoloSelezionato && tavoloSelezionato.istanza_id === layoutItem.istanza_id;
    var isSecondo = secondoTavoloUnione && secondoTavoloUnione.istanza_id === layoutItem.istanza_id;
    var boxShadowMappa;
    if (isSecondo) {
      boxShadowMappa = '0 0 0 4px #7C3AED, 0 0 0 7px rgba(124,58,237,0.3)';
    } else if (isPrimo && modalitaUnione) {
      boxShadowMappa = '0 0 0 4px #3B82F6, 0 0 0 7px rgba(59,130,246,0.3)';
    } else if (unito) {
      boxShadowMappa = '0 0 0 5px #7C3AED, inset 0 0 0 2px rgba(124,58,237,0.15)';
    } else if (suOstacolo) {
      boxShadowMappa = '0 0 0 3px #EF4444';
    } else {
      boxShadowMappa = '0 2px 6px rgba(0,0,0,0.25)';
    }

    // Cursore: in modalita scegli crosshair, in posiziona grab sul secondo tavolo
    var cursoreMappa = 'pointer';
    if (modalitaUnione === 'scegli' && !isPrimo) cursoreMappa = 'crosshair';
    if (modalitaUnione === 'posiziona' && isSecondo) cursoreMappa = 'grab';
    if (modalitaUnione === 'posiziona' && !isSecondo && !isPrimo) cursoreMappa = 'default';

    return (
      <div key={layoutItem.istanza_id}
        onMouseDown={editorMode ? function(e) {
          if (modalitaSelezioneMult) { e.preventDefault(); toggleSelezioneTavolo(layoutItem.istanza_id); return; }
          onMouseDownTavolo(e, layoutItem);
        } : (modalitaUnione === 'posiziona' && isSecondo ? onMouseDownSecondoTavolo : undefined)}
        onClick={!editorMode ? function() {
          // In modalita scegli secondo tavolo
          if (modalitaUnione === 'scegli') {
            if (!isPrimo) selezionaSecondoTavoloUnione(layoutItem);
            return;
          }
          // In modalita posiziona non fare nulla al click
          if (modalitaUnione === 'posiziona') return;
          // Click normale
          var es3 = getEtichettaServizio(layoutItem.istanza_id);
          setEditEtichettaServizio(es3.etichetta || '');
          setEditColoreServizio(es3.colore || '#9CA3AF');
          setTavoloSelezionato(layoutItem);
          setShowAssegna(false);
          setShowUnione(false);
          setAssegnaPrenotazione(null);
          setAssegnaOspiti(0);
          setPannelloAperto(true);
        } : undefined}
        style={{ position: 'absolute', left: (x - pad) + 'px', top: (y - pad) + 'px', width: (w + pad * 2) + 'px', height: (h + pad * 2) + 'px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: editorMode ? 'grab' : cursoreMappa, userSelect: 'none', zIndex: draggingIstanza === layoutItem.istanza_id ? 50 : 15 }}
      >
        {mostraSedie && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <SedieSVG w={w + pad * 2} h={h + pad * 2} capacita={t.capacita} forma={t.forma} colore={bgColor} />
          </div>
        )}
        <div style={{ position: 'relative', width: w + 'px', height: h + 'px', backgroundColor: bgColor, borderRadius: borderRadiusTavolo, boxShadow: editorMode ? (isSelezionatoMult ? '0 0 0 4px #6366F1, 0 0 0 7px rgba(99,102,241,0.25)' : suOstacolo ? '0 0 0 3px #EF4444' : '0 2px 6px rgba(0,0,0,0.25)') : boxShadowMappa, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', overflow: 'hidden' }}>
          {/* Etichetta strutturale (T50) — sempre visibile in alto */}
          {labelVisibile !== '' && (
            <span style={{ fontSize: '13px', fontWeight: '900', textShadow: '0 1px 3px rgba(0,0,0,0.5)', textAlign: 'center', padding: '0 2px', letterSpacing: '0.02em', lineHeight: 1.1 }}>{labelVisibile}</span>
          )}
          {/* Testo di servizio (nome cliente scritto a mano) */}
          {!editorMode && testoServizio !== '' && (
            <span style={{ fontSize: '9px', fontWeight: '700', opacity: 1, textAlign: 'center', maxWidth: '94%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px', background: 'rgba(0,0,0,0.25)', borderRadius: '3px', padding: '1px 4px' }}>{testoServizio}</span>
          )}
          {/* Nome cliente da prenotazione */}
          {!editorMode && nomeCliente && (
            <span style={{ fontSize: '9px', opacity: 0.95, textAlign: 'center', maxWidth: '94%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px', fontStyle: 'italic' }}>{nomeCliente}</span>
          )}
          {!editorMode && ospiti > 0 && <span style={{ fontSize: '9px', opacity: 0.85, marginTop: '1px' }}>{ospiti} osp.</span>}
          {!editorMode && stato === 'libero' && testoServizio === '' && !nomeCliente && labelVisibile === '' && <span style={{ fontSize: '9px', opacity: 0.8 }}>{t.capacita} posti</span>}
          {/* Indicatore tavolo unito */}
          {!editorMode && unito && (
            <div style={{ position: 'absolute', top: '2px', right: '3px', width: '8px', height: '8px', borderRadius: '50%', background: '#7C3AED', border: '1px solid white' }}></div>
          )}
          {editorMode && (
            <>
              <button onMouseDown={function(e) { e.stopPropagation(); }} onClick={function(e) { e.stopPropagation(); ruotaIstanzaInLayout(layoutItem.istanza_id); }} title={'Ruota (' + rotAttuale + 'deg)'} style={{ position: 'absolute', top: '2px', left: '3px', background: 'rgba(0,0,0,0.4)', border: 'none', color: 'white', borderRadius: '50%', width: '16px', height: '16px', fontSize: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', lineHeight: 1 }}>R</button>
              <button onMouseDown={function(e) { e.stopPropagation(); }} onClick={function(e) { e.stopPropagation(); rimuoviIstanzaDB(layoutItem); }} style={{ position: 'absolute', top: '2px', right: '3px', background: 'rgba(0,0,0,0.35)', border: 'none', color: 'white', borderRadius: '50%', width: '16px', height: '16px', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', lineHeight: 1 }}>x</button>
            </>
          )}
          {suOstacolo && <div style={{ position: 'absolute', bottom: '2px', fontSize: '8px', color: '#FEF2F2', background: '#EF4444', borderRadius: '3px', padding: '1px 4px' }}>! ostacolo</div>}
          {editorMode && rotAttuale !== 0 && <div style={{ position: 'absolute', bottom: '2px', fontSize: '7px', color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.3)', borderRadius: '3px', padding: '1px 3px' }}>{rotAttuale}deg</div>}
        </div>
      </div>
    );
  }

  function renderLegendaOstacoli() {
    var presenti = TIPI_OSTACOLO.filter(function(tipo) {
      for (var i = 0; i < ostacoli.length; i++) { if (ostacoli[i].tipo === tipo.value) return true; }
      return false;
    });
    if (presenti.length === 0) return null;
    return (
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {presenti.map(function(tipo) {
          return (
            <div key={tipo.value} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px' }}>
              <div style={{ width: '12px', height: '12px', background: tipo.colore, borderRadius: tipo.value === 'colonna' ? '50%' : '2px', flexShrink: 0 }}></div>
              <span style={{ fontSize: '12px', color: '#374151' }}>{tipo.label}</span>
            </div>
          );
        })}
      </div>
    );
  }

  function stileViewport() {
    return { width: VIEWPORT_W + 'px', height: VIEWPORT_H + 'px', overflowX: 'auto', overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: '8px', flexShrink: 0 };
  }

  function stileCanvas() {
    return { position: 'relative', width: (gridCols * gridSize) + 'px', height: (gridRows * gridSize) + 'px', backgroundImage: 'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)', backgroundSize: gridSize + 'px ' + gridSize + 'px', backgroundColor: '#f9fafb', flexShrink: 0 };
  }

  // ── TAB MAPPA ─────────────────────────────────────────────────

  function renderTabMappa() {
    if (gridSize === null) return <div style={{ padding: '20px', color: '#6B7280' }}>Caricamento griglia...</div>;
    var liberi = 0; var occupati = 0; var prenotati = 0;
    for (var i = 0; i < layoutAttivo.length; i++) {
      var s = getStatoTavolo(layoutAttivo[i].istanza_id);
      if (s === 'libero') liberi++;
      else if (s === 'occupato') occupati++;
      else prenotati++;
    }

    return (
      <div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {[['#10B981', liberi, 'liberi'], ['#F59E0B', prenotati, 'prenotati'], ['#EF4444', occupati, 'occupati']].map(function(item) {
            return (
              <div key={item[2]} style={{ background: 'white', borderRadius: '8px', padding: '8px 14px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: item[0] }}></div>
                <span style={{ fontSize: '13px', color: '#374151' }}><strong>{item[1]}</strong> {item[2]}</span>
              </div>
            );
          })}
          <button onClick={function() { setMostraSedie(!mostraSedie); }} style={{ background: mostraSedie ? '#1D4ED8' : 'white', color: mostraSedie ? 'white' : '#374151', border: '1px solid ' + (mostraSedie ? '#1D4ED8' : '#d1d5db'), borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>🪑 Sedie {mostraSedie ? 'ON' : 'OFF'}</button>
          {renderSliderGriglia()}
        </div>
        {/* Legenda colori servizio */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {COLORI_SERVIZIO.map(function(c) {
            return (
              <div key={c.value} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '3px 9px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: c.value, flexShrink: 0 }}></div>
                <span style={{ fontSize: '11px', color: '#374151' }}>{c.label}</span>
              </div>
            );
          })}
        </div>
        {renderLegendaOstacoli()}

        {/* Banner modalita selezione secondo tavolo */}
        {modalitaUnione === 'scegli' && (
          <div style={{ marginBottom: '10px', padding: '12px 16px', background: '#EDE9FE', border: '2px solid #8B5CF6', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>👆</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: '800', color: '#5B21B6' }}>Seleziona il secondo tavolo sulla mappa</div>
              <div style={{ fontSize: '12px', color: '#7C3AED', marginTop: '2px' }}>Clicca il tavolo da unire a <strong>{tavoloSelezionato ? ((tavoloSelezionato.etichetta && tavoloSelezionato.etichetta.trim()) ? tavoloSelezionato.etichetta : (tavoloSelezionato.tavolo ? tavoloSelezionato.tavolo.nome : 'Tavolo')) : ''}</strong>.</div>
            </div>
            <button onClick={annullaUnione} style={{ background: 'white', color: '#5B21B6', border: '1px solid #c4b5fd', borderRadius: '7px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '700', flexShrink: 0 }}>Annulla</button>
          </div>
        )}

        {/* Banner modalita posizionamento libero secondo tavolo */}
        {modalitaUnione === 'posiziona' && secondoTavoloUnione && (
          <div style={{ marginBottom: '10px', padding: '12px 16px', background: '#FEF3C7', border: '2px solid #F59E0B', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '20px' }}>✋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: '800', color: '#92400E' }}>Posiziona il secondo tavolo</div>
              <div style={{ fontSize: '12px', color: '#92400E', marginTop: '2px' }}>
                Trascina <strong>{(secondoTavoloUnione.etichetta && secondoTavoloUnione.etichetta.trim()) ? secondoTavoloUnione.etichetta : (secondoTavoloUnione.tavolo ? secondoTavoloUnione.tavolo.nome : 'Tavolo')}</strong> nella posizione desiderata, poi conferma.
              </div>
            </div>
            <button onClick={function() { setModalitaUnione('conferma'); }} style={{ background: '#F59E0B', color: 'white', border: 'none', borderRadius: '7px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '800', flexShrink: 0 }}>✓ Posizione OK</button>
            <button onClick={annullaUnione} style={{ background: 'white', color: '#92400E', border: '1px solid #FDE68A', borderRadius: '7px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '700', flexShrink: 0 }}>Annulla</button>
          </div>
        )}

        {/* Pannello conferma unione */}
        {modalitaUnione === 'conferma' && secondoTavoloUnione && tavoloSelezionato && (
          <div style={{ marginBottom: '10px', padding: '16px', background: 'white', border: '2px solid #7C3AED', borderRadius: '12px', maxWidth: '500px' }}>
            <div style={{ fontSize: '15px', fontWeight: '800', color: '#111827', marginBottom: '10px' }}>Conferma unione tavoli</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', padding: '10px', background: '#F5F3FF', borderRadius: '8px' }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#5B21B6' }}>{(tavoloSelezionato.etichetta && tavoloSelezionato.etichetta.trim()) ? tavoloSelezionato.etichetta : (tavoloSelezionato.tavolo ? tavoloSelezionato.tavolo.nome : 'Tavolo')}</div>
                <div style={{ fontSize: '11px', color: '#7C3AED' }}>{tavoloSelezionato.tavolo ? tavoloSelezionato.tavolo.capacita : 0} posti</div>
              </div>
              <div style={{ fontSize: '20px', color: '#7C3AED', fontWeight: '800' }}>+</div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#5B21B6' }}>{(secondoTavoloUnione.etichetta && secondoTavoloUnione.etichetta.trim()) ? secondoTavoloUnione.etichetta : (secondoTavoloUnione.tavolo ? secondoTavoloUnione.tavolo.nome : 'Tavolo')}</div>
                <div style={{ fontSize: '11px', color: '#7C3AED' }}>{secondoTavoloUnione.tavolo ? secondoTavoloUnione.tavolo.capacita : 0} posti</div>
              </div>
            </div>
            <button onClick={function() { setModalitaUnione('posiziona'); }} style={{ width: '100%', background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: '7px', padding: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: '600', marginBottom: '10px' }}>
              ✋ Torna a riposizionare il tavolo
            </button>
            <div style={{ fontSize: '13px', color: '#374151', marginBottom: '6px', fontWeight: '700' }}>Capienza totale combinata:</div>
            <input type="number" min="1" value={unioneCapienza} onChange={function(e) { setUnioneCapienza(e.target.value); }} style={{ width: '100%', padding: '10px', border: '2px solid #8B5CF6', borderRadius: '7px', fontSize: '18px', fontWeight: '800', boxSizing: 'border-box', marginBottom: '12px', textAlign: 'center', color: '#5B21B6' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={confermaUnione} style={{ flex: 1, background: '#7C3AED', color: 'white', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', cursor: 'pointer', fontWeight: '800' }}>✓ Conferma unione</button>
              <button onClick={annullaUnione} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '11px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>Annulla</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div style={stileViewport()}>
            <div
              ref={gridRef}
              onMouseMove={modalitaUnione === 'posiziona' ? onMouseMoveUnione : undefined}
              onMouseUp={modalitaUnione === 'posiziona' ? onMouseUpUnione : undefined}
              onMouseLeave={modalitaUnione === 'posiziona' ? onMouseUpUnione : undefined}
              style={Object.assign({}, stileCanvas(), { cursor: modalitaUnione === 'posiziona' ? 'default' : 'default' })}
            >
              {renderOverlayOstacoli(false)}
              {layoutAttivo.map(function(item) { return renderTavoloGriglia(item, false); })}
            </div>
          </div>
          {pannelloAperto && tavoloSelezionato && !modalitaUnione && renderPannelloTavolo()}
        </div>
        {tavoliUniti.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#374151', marginBottom: '8px' }}>Tavoli uniti questo turno</h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {tavoliUniti.map(function(u) {
                var l1 = null; var l2 = null;
                for (var i = 0; i < layoutAttivo.length; i++) {
                  if (layoutAttivo[i].istanza_id === u.istanza_principale_id) l1 = layoutAttivo[i];
                  if (layoutAttivo[i].istanza_id === u.istanza_secondaria_id) l2 = layoutAttivo[i];
                }
                // Fallback a tavolo_id se istanza non trovata
                if (!l1) { for (var ii = 0; ii < layoutAttivo.length; ii++) { if (layoutAttivo[ii].tavolo_id === u.tavolo_principale_id) { l1 = layoutAttivo[ii]; break; } } }
                if (!l2) { for (var jj = 0; jj < layoutAttivo.length; jj++) { if (layoutAttivo[jj].tavolo_id === u.tavolo_secondario_id) { l2 = layoutAttivo[jj]; break; } } }
                var nome1 = (l1 && l1.etichetta) ? l1.etichetta : (l1 && l1.tavolo ? l1.tavolo.nome : '?');
                var nome2 = (l2 && l2.etichetta) ? l2.etichetta : (l2 && l2.tavolo ? l2.tavolo.nome : '?');
                return (
                  <div key={u.id} style={{ background: '#EDE9FE', border: '1px solid #8B5CF6', borderRadius: '8px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                    <span style={{ fontWeight: '700', color: '#5B21B6' }}>{nome1} + {nome2}</span>
                    {u.capacita_unione > 0 && <span style={{ color: '#7C3AED', fontSize: '12px' }}>{u.capacita_unione} posti</span>}
                    <button onClick={function() { sciogliUnione(u.id); }} style={{ background: '#8B5CF6', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: '700' }}>Sciogli</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Riepilogo prenotazioni su più tavoli */}
        {(function() {
          // Raggruppa tavoliPrenotazioni per prenotazione_id
          var mappa = {};
          for (var i = 0; i < tavoliPrenotazioni.length; i++) {
            var tp = tavoliPrenotazioni[i];
            if (!mappa[tp.prenotazione_id]) mappa[tp.prenotazione_id] = [];
            mappa[tp.prenotazione_id].push(tp);
          }
          var righe = [];
          var keys = Object.keys(mappa);
          for (var k = 0; k < keys.length; k++) {
            var pid = keys[k];
            var assegnazioni = mappa[pid];
            // Solo prenotazioni su più tavoli o con almeno un'assegnazione
            if (assegnazioni.length === 0) continue;
            var pren = null;
            for (var p = 0; p < prenotazioni.length; p++) {
              if (prenotazioni[p].id === pid) { pren = prenotazioni[p]; break; }
            }
            var nomePren = pren && pren.customer ? (pren.customer.first_name + ' ' + pren.customer.last_name) : 'Cliente';
            var totale = pren ? ((pren.adults_count || 0) + (pren.children_count || 0)) : 0;
            var assegnatiTot = 0;
            var tavoliAssegnati = [];
            for (var a = 0; a < assegnazioni.length; a++) {
              assegnatiTot += (assegnazioni[a].n_ospiti_assegnati || 0);
              // Trova etichetta strutturale dell'istanza (es. S050) — NON il nome tipologia
              var labelT = '?';
              for (var la = 0; la < layoutAttivo.length; la++) {
                if (layoutAttivo[la].istanza_id === assegnazioni[a].istanza_id) {
                  labelT = (layoutAttivo[la].etichetta && layoutAttivo[la].etichetta.trim())
                    ? layoutAttivo[la].etichetta.trim()
                    : ('#' + assegnazioni[a].istanza_id.slice(0, 6));
                  break;
                }
              }
              tavoliAssegnati.push({ label: labelT, ospiti: assegnazioni[a].n_ospiti_assegnati || 0 });
            }
            var restanti = totale - assegnatiTot;
            righe.push({ pid: pid, nome: nomePren, totale: totale, assegnati: assegnatiTot, restanti: restanti, tavoli: tavoliAssegnati });
          }
          if (righe.length === 0) return null;
          return (
            <div style={{ marginTop: '20px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#374151', marginBottom: '10px' }}>Riepilogo assegnazioni prenotazioni</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {righe.map(function(r) {
                  return (
                    <div key={r.pid} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '800', color: '#111827' }}>{r.nome}</span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: r.restanti <= 0 ? '#059669' : '#D97706', background: r.restanti <= 0 ? '#F0FDF4' : '#FEF3C7', border: '1px solid ' + (r.restanti <= 0 ? '#BBF7D0' : '#FDE68A'), borderRadius: '20px', padding: '2px 10px' }}>
                          {r.restanti <= 0 ? '✓ Completa' : r.restanti + ' da sistemare'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        {r.tavoli.map(function(tv, idx) {
                          return (
                            <span key={idx} style={{ fontSize: '12px', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '6px', padding: '2px 8px', fontWeight: '700' }}>
                              {tv.label} <span style={{ fontWeight: '400' }}>({tv.ospiti})</span>
                            </span>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6B7280' }}>
                        {r.assegnati} assegnati su {r.totale} totali
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  function renderPannelloTavolo() {
    var ts = tavoloSelezionato;
    var stato = getStatoTavolo(ts.istanza_id);
    var labelTavolo = (ts.etichetta && ts.etichetta.trim()) ? ts.etichetta.trim() : (ts.tavolo ? ts.tavolo.nome : 'Tavolo');

    // Trova eventuale unione di cui fa parte questo tavolo
    var unioneAttiva = null;
    var partnerIstanza = null;
    for (var i = 0; i < tavoliUniti.length; i++) {
      var u = tavoliUniti[i];
      if (u.istanza_principale_id === ts.istanza_id || u.istanza_secondaria_id === ts.istanza_id) {
        unioneAttiva = u;
        var partnerId = u.istanza_principale_id === ts.istanza_id ? u.istanza_secondaria_id : u.istanza_principale_id;
        for (var j = 0; j < layoutAttivo.length; j++) {
          if (layoutAttivo[j].istanza_id === partnerId) { partnerIstanza = layoutAttivo[j]; break; }
        }
        break;
      }
    }
    var labelPartner = partnerIstanza ? ((partnerIstanza.etichetta && partnerIstanza.etichetta.trim()) ? partnerIstanza.etichetta.trim() : (partnerIstanza.tavolo ? partnerIstanza.tavolo.nome : 'Tavolo')) : null;

    return (
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', minWidth: '290px', maxWidth: '330px', flexShrink: 0, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#111827' }}>{labelTavolo}</h3>
          <button onClick={function() { setPannelloAperto(false); setShowAssegna(false); setShowUnione(false); }} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 }}>x</button>
        </div>

        {/* Banner unione attiva */}
        {unioneAttiva && labelPartner && (
          <div style={{ marginBottom: '10px', padding: '8px 12px', background: '#EDE9FE', border: '1px solid #C4B5FD', borderRadius: '8px', fontSize: '12px', color: '#5B21B6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: '800' }}>🔗 Unito con {labelPartner}</span>
              {unioneAttiva.capacita_unione > 0 && <span style={{ fontWeight: '400', marginLeft: '6px' }}>— {unioneAttiva.capacita_unione} posti totali</span>}
            </div>
            <button onClick={function() { sciogliUnione(unioneAttiva.id); }} style={{ background: 'none', border: '1px solid #8B5CF6', borderRadius: '5px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', color: '#5B21B6', fontWeight: '700', flexShrink: 0, marginLeft: '8px' }}>Sciogli</button>
          </div>
        )}

        {ts.tavolo && (
          <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#f9fafb', borderRadius: '8px', fontSize: '13px', color: '#374151', lineHeight: '1.7' }}>
            <div>Tipologia: <strong>{ts.tavolo.nome}</strong></div>
            <div>Capienza: <strong>{unioneAttiva && unioneAttiva.capacita_unione > 0 ? unioneAttiva.capacita_unione + ' posti (unione)' : ts.tavolo.capacita + ' posti'}</strong></div>
            <div>Stato: <strong style={{ color: stato === 'occupato' ? '#EF4444' : stato === 'prenotato' ? '#D97706' : '#059669' }}>{labelStato(stato)}</strong></div>
            {getOspitiAssegnatiIstanza(ts.istanza_id) > 0 && <div>Ospiti: <strong>{getOspitiAssegnatiIstanza(ts.istanza_id)}</strong></div>}
          </div>
        )}

        {/* ── SEZIONE ETICHETTA SERVIZIO ── */}
        <div style={{ marginBottom: '14px', padding: '12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#166534', marginBottom: '8px' }}>🏷️ Etichetta servizio</div>
          <input
            type="text"
            placeholder="es. Rossi, compleanno, VIP..."
            value={editEtichettaServizio}
            onChange={function(e) { setEditEtichettaServizio(e.target.value); }}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #86EFAC', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box', marginBottom: '8px', fontWeight: '600' }}
          />
          <div style={{ fontSize: '11px', color: '#166534', marginBottom: '6px', fontWeight: '700' }}>Colore tavolo:</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {COLORI_SERVIZIO.map(function(c) {
              return (
                <button
                  key={c.value}
                  title={c.label}
                  onClick={function() { setEditColoreServizio(c.value); }}
                  style={{ width: '28px', height: '28px', borderRadius: '50%', background: c.value, cursor: 'pointer', border: editColoreServizio === c.value ? '3px solid #111827' : '2px solid transparent', flexShrink: 0 }}
                />
              );
            })}
          </div>
          {/* Anteprima colore selezionato */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: editColoreServizio, flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}></div>
            <span style={{ fontSize: '12px', color: '#374151' }}>
              {(function() {
                for (var i = 0; i < COLORI_SERVIZIO.length; i++) {
                  if (COLORI_SERVIZIO[i].value === editColoreServizio) return COLORI_SERVIZIO[i].label;
                }
                return 'Personalizzato';
              })()}
            </span>
          </div>
          <button
            onClick={function() { salvaEtichettaServizio(ts.istanza_id, editEtichettaServizio, editColoreServizio); }}
            disabled={salvandoEtichetta}
            style={{ width: '100%', background: salvandoEtichetta ? '#9CA3AF' : '#10B981', color: 'white', border: 'none', borderRadius: '7px', padding: '9px', fontSize: '13px', cursor: salvandoEtichetta ? 'not-allowed' : 'pointer', fontWeight: '700' }}
          >
            {salvandoEtichetta ? 'Salvataggio...' : '✓ Salva etichetta'}
          </button>
        </div>

        {/* ── SEZIONE PRENOTAZIONE ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

          {/* Assegnazioni esistenti su questo tavolo */}
          {(function() {
            var rappIstanza = getIstanzaRappresentante(ts.istanza_id);
            var assegnazioniTavolo = tavoliPrenotazioni.filter(function(tp) { return tp.istanza_id === rappIstanza; });
            if (assegnazioniTavolo.length === 0) return null;
            return (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#166534', marginBottom: '6px' }}>Prenotazioni assegnate a questo tavolo:</div>
                {assegnazioniTavolo.map(function(tp) {
                  var pren = null;
                  for (var i = 0; i < prenotazioni.length; i++) {
                    if (prenotazioni[i].id === tp.prenotazione_id) { pren = prenotazioni[i]; break; }
                  }
                  var nomeCliente = pren && pren.customer ? (pren.customer.first_name + ' ' + pren.customer.last_name) : 'Cliente';
                  var totale = pren ? ((pren.adults_count || 0) + (pren.children_count || 0)) : 0;
                  var assegnatiTotale = pren ? getOspitiAssegnatiPrenotazione(tp.prenotazione_id) : 0;
                  var restanti = totale - assegnatiTotale;
                  return (
                    <div key={tp.id} style={{ background: 'white', border: '1px solid #D1FAE5', borderRadius: '6px', padding: '8px 10px', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '800', color: '#111827' }}>{nomeCliente}</div>
                          <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                            {tp.n_ospiti_assegnati} ospiti su questo tavolo
                          </div>
                          <div style={{ fontSize: '11px', marginTop: '2px' }}>
                            <span style={{ color: '#374151' }}>Totale prenotazione: <strong>{totale}</strong></span>
                            {' · '}
                            <span style={{ color: assegnatiTotale >= totale ? '#059669' : '#D97706', fontWeight: '700' }}>
                              {assegnatiTotale >= totale ? '✓ Completa' : restanti + ' ancora da sistemare'}
                            </span>
                          </div>
                        </div>
                        <button onClick={function() { rimuoviAssegnazione(ts.istanza_id, tp.prenotazione_id); }} style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '5px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', flexShrink: 0, marginLeft: '8px' }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Bottoni azione */}
          <button onClick={function() { setShowAssegna(!showAssegna); setAssegnaPrenotazione(null); setAssegnaOspiti(0); }} style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
            + Assegna prenotazione
          </button>
          <button onClick={function() { setPannelloAperto(false); avviaModalitaUnione(); }} style={{ background: '#8B5CF6', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>🔗 Unisci con altro tavolo</button>
        </div>

        {/* Form assegnazione con contatore frazionamento */}
        {showAssegna && (
          <div style={{ marginTop: '12px', borderTop: '1px solid #f3f4f6', paddingTop: '14px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '700', color: '#374151' }}>Assegna prenotazione</h4>
            <select value={assegnaPrenotazione || ''} onChange={function(e) {
              setAssegnaPrenotazione(e.target.value);
              if (e.target.value) {
                var gia = getOspitiSuIstanza(e.target.value, ts.istanza_id);
                setAssegnaOspiti(gia > 0 ? gia : 0);
              } else {
                setAssegnaOspiti(0);
              }
            }} style={{ width: '100%', padding: '9px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', marginBottom: '8px' }}>
              <option value="">-- Seleziona prenotazione --</option>
              {prenotazioni.map(function(p) {
                var nome = p.customer ? (p.customer.first_name + ' ' + p.customer.last_name) : 'Cliente';
                var tot = (p.adults_count || 0) + (p.children_count || 0);
                var assegnati = getOspitiAssegnatiPrenotazione(p.id);
                var restanti = tot - assegnati;
                var label = nome + ' (' + tot + ' ospiti';
                if (assegnati > 0) label = label + ' · ' + restanti + ' da sistemare';
                label = label + ')';
                return <option key={p.id} value={p.id}>{label}</option>;
              })}
            </select>
            {prenotazioni.length === 0 && <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '0 0 8px 0' }}>Nessuna prenotazione per questo turno</p>}

            {/* Contatore frazionamento — appare solo dopo aver scelto una prenotazione */}
            {assegnaPrenotazione && (function() {
              var pren = null;
              for (var i = 0; i < prenotazioni.length; i++) {
                if (prenotazioni[i].id === assegnaPrenotazione) { pren = prenotazioni[i]; break; }
              }
              if (!pren) return null;
              var tot = (pren.adults_count || 0) + (pren.children_count || 0);
              var assegnatiAltrove = getOspitiAssegnatiPrenotazione(assegnaPrenotazione) - getOspitiSuIstanza(assegnaPrenotazione, ts.istanza_id);
              var restanti = tot - assegnatiAltrove;
              var capienza = ts.tavolo ? getCapienzaEffettiva(ts.istanza_id, ts.tavolo.capacita) : 0;
              return (
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: '#374151' }}>Totale prenotazione:</span>
                    <strong style={{ color: '#111827' }}>{tot} ospiti</strong>
                  </div>
                  {assegnatiAltrove > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: '#374151' }}>Già assegnati altrove:</span>
                      <strong style={{ color: '#374151' }}>{assegnatiAltrove}</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', paddingTop: '4px', borderTop: '1px solid #BFDBFE' }}>
                    <span style={{ color: '#1D4ED8', fontWeight: '700' }}>Da sistemare:</span>
                    <strong style={{ color: restanti <= 0 ? '#059669' : '#1D4ED8' }}>{restanti <= 0 ? '✓ Tutti sistemati' : restanti}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#374151' }}>Capienza tavolo:</span>
                    <strong style={{ color: '#374151' }}>{capienza} posti</strong>
                  </div>
                </div>
              );
            })()}

            <div style={{ marginBottom: '6px', fontSize: '12px', color: '#374151', fontWeight: '700' }}>Ospiti su questo tavolo:</div>
            <input type="number" min="1" placeholder="Quanti ospiti siedono qui?" value={assegnaOspiti || ''} onChange={function(e) { setAssegnaOspiti(e.target.value); }} style={{ width: '100%', padding: '10px', border: '2px solid #3B82F6', borderRadius: '6px', fontSize: '16px', fontWeight: '800', boxSizing: 'border-box', marginBottom: '10px', textAlign: 'center', color: '#1D4ED8' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={confermaAssegna} style={{ flex: 1, background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '9px', fontSize: '13px', cursor: 'pointer', fontWeight: '700' }}>✓ Conferma</button>
              <button onClick={function() { setShowAssegna(false); setAssegnaPrenotazione(null); setAssegnaOspiti(0); }} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px', fontSize: '13px', cursor: 'pointer' }}>Annulla</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── TAB EDITOR LAYOUT ─────────────────────────────────────────

  function renderTabEditor() {
    if (gridSize === null) return <div style={{ padding: '20px', color: '#6B7280' }}>Caricamento griglia...</div>;

    var gruppi = raggruppaPerCategoria(tavoli);

    return (
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <div>
          <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: '#6B7280' }}>Trascina i tavoli. [R] per ruotare.</span>
            {renderSliderGriglia()}
            {layoutModificato && <button onClick={salvaLayout} style={{ background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '14px', cursor: 'pointer', fontWeight: '700' }}>Salva layout</button>}
            <button onClick={function() { setShowSalvaBase(true); setNomeLayoutBase(''); setDescLayoutBase(''); }} style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>📐 Salva come layout base</button>
            <button
              onClick={function() { setModalitaSelezioneMult(function(prev) { if (prev) setSelezionatiEditor([]); return !prev; }); }}
              style={{ padding: '7px 14px', borderRadius: '8px', border: '2px solid', fontSize: '13px', cursor: 'pointer', fontWeight: '700', background: modalitaSelezioneMult ? '#6366F1' : 'white', color: modalitaSelezioneMult ? 'white' : '#6366F1', borderColor: '#6366F1' }}
            >
              ☑ {modalitaSelezioneMult ? 'Sel. multipla ON' : 'Sel. multipla'}
            </button>
          </div>

          {/* Toolbar allineamento — visibile solo con ≥2 tavoli selezionati */}
          {modalitaSelezioneMult && selezionatiEditor.length >= 2 && (
            <div style={{ marginBottom: '10px', padding: '10px 14px', background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#3730A3', marginRight: '4px' }}>
                {selezionatiEditor.length} selezionati — Allinea:
              </span>
              {[
                { tipo: 'sinistra',  label: '⬅ Sinistra' },
                { tipo: 'centro_h', label: '↔ Centro H' },
                { tipo: 'destra',   label: '➡ Destra'   },
                { tipo: 'alto',     label: '⬆ Alto'      },
                { tipo: 'centro_v', label: '↕ Centro V'  },
                { tipo: 'basso',    label: '⬇ Basso'     },
                { tipo: 'distrib_h',label: '⇔ Distrib H' },
                { tipo: 'distrib_v',label: '⇕ Distrib V' }
              ].map(function(a) {
                return (
                  <button key={a.tipo} onClick={function() { allineaSelezionati(a.tipo); }} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #A5B4FC', background: 'white', color: '#3730A3', fontSize: '12px', cursor: 'pointer', fontWeight: '700' }}>
                    {a.label}
                  </button>
                );
              })}
              <button onClick={function() { setSelezionatiEditor([]); }} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #C7D2FE', background: 'white', color: '#6B7280', fontSize: '12px', cursor: 'pointer', marginLeft: '4px' }}>
                Deseleziona tutti
              </button>
            </div>
          )}

          {modalitaSelezioneMult && selezionatiEditor.length < 2 && (
            <div style={{ marginBottom: '10px', padding: '8px 14px', background: '#EEF2FF', border: '1px dashed #A5B4FC', borderRadius: '8px', fontSize: '12px', color: '#4338CA' }}>
              Clicca sui tavoli per selezionarli (selezionati: {selezionatiEditor.length}). Seleziona ≥2 per allineare.
            </div>
          )}
          {renderLegendaOstacoli()}
          <div style={stileViewport()}>
            <div ref={gridRef} onMouseMove={onMouseMoveGrid} onMouseUp={onMouseUpGrid} onMouseLeave={onMouseUpGrid} style={stileCanvas()}>
              {renderOverlayOstacoli(false)}
              {layoutTemp.map(function(item) { return renderTavoloGriglia(item, true); })}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '260px', maxWidth: '290px' }}>
          {layoutBase.length > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: '700', color: '#166534' }}>📐 Layout base salvati</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {layoutBase.map(function(lb) {
                  var nTavoli = lb.layout_base_tavoli ? lb.layout_base_tavoli.length : 0;
                  return (
                    <div key={lb.id} style={{ background: 'white', border: '1px solid #d1fae5', borderRadius: '8px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lb.nome}</div>
                        <div style={{ fontSize: '11px', color: '#6B7280' }}>{nTavoli} tavol{nTavoli === 1 ? 'o' : 'i'}{lb.descrizione ? ' - ' + lb.descrizione : ''}</div>
                      </div>
                      <button onClick={function() { caricaLayoutBaseSuGriglia(lb); }} style={{ background: '#10B981', color: 'white', border: 'none', borderRadius: '5px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: '700', flexShrink: 0 }}>Carica</button>
                      <button onClick={function() { eliminaLayoutBase(lb); }} style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '5px', padding: '4px 7px', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>x</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '700', color: '#374151' }}>Tipologie</h4>
            <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '12px' }}>Clicca + per aggiungere un\'istanza. Puoi aggiungerne piu\' di una della stessa tipologia.</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {gruppi.map(function(gruppo) {
                var catKey = gruppo.categoria;
                var espanso = gruppiEspansi[catKey];
                return (
                  <div key={catKey} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', background: '#f9fafb', cursor: 'pointer' }} onClick={function() { toggleGruppo(catKey); }}>
                      <span style={{ fontSize: '11px', color: '#6B7280', transform: espanso ? 'rotate(90deg)' : 'none', display: 'inline-block', flexShrink: 0 }}>▶</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{catKey}</div>
                        <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{gruppo.tavoli.length} tipologi{gruppo.tavoli.length === 1 ? 'a' : 'e'}</div>
                      </div>
                    </div>
                    {espanso && (
                      <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {gruppo.tavoli.map(function(t) {
                          var tSnap = Object.assign({}, t);
                          var istanzeInLayout = contaIstanzeInLayoutTemp(t.id);
                          var istanzeAlteSale = contaIstanzeAlteSale(t.id);
                          var quantita = t.quantita || 1;
                          var totaleUsate = istanzeInLayout + istanzeAlteSale;
                          var disponibili = quantita - totaleUsate;
                          var esaurita = disponibili <= 0;
                          return (
                            <div key={t.id} style={{ padding: '7px 8px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: t.forma === 'rotondo' ? '50%' : '2px', background: t.colore || '#6B7280', flexShrink: 0 }}></div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</div>
                                  <div style={{ fontSize: '10px', color: esaurita ? '#DC2626' : '#6B7280', fontWeight: esaurita ? '700' : '400' }}>
                                    {istanzeInLayout} in questa sala &middot; {disponibili} dispon. su {quantita}
                                  </div>
                                </div>
                                {esaurita
                                  ? <span style={{ fontSize: '10px', color: '#DC2626', fontWeight: '700', flexShrink: 0 }}>esaurita</span>
                                  : <button onClick={function() { richiediEtichettaEAggiungi(tSnap); }} style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '5px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: '700', flexShrink: 0 }}>+</button>
                                }
                              </div>
                              {istanzeInLayout > 0 && (
                                <div style={{ marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #f3f4f6', display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                  {layoutTemp.filter(function(l) { return l.tavolo_id === t.id; }).map(function(l) {
                                    return (
                                      <span key={l.istanza_id} style={{ fontSize: '10px', background: t.colore || '#6B7280', color: 'white', borderRadius: '3px', padding: '1px 6px', fontWeight: '700' }}>
                                        {(l.etichetta && l.etichetta.trim()) ? l.etichetta : '(no etichetta)'}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '12px', paddingTop: '12px' }}>
              <button onClick={function() { setTab('gestione'); }} style={{ width: '100%', background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>+ Crea nuova tipologia</button>
            </div>
          </div>
        </div>

        {showSalvaBase && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '400px', maxWidth: '100%' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: '800' }}>Salva come layout base</h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#6B7280' }}>Configurazione attuale: {layoutTemp.length} tavoli.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Nome *</label>
                  <input type="text" value={nomeLayoutBase} onChange={function(e) { setNomeLayoutBase(e.target.value); }} autoFocus style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Descrizione (opzionale)</label>
                  <input type="text" value={descLayoutBase} onChange={function(e) { setDescLayoutBase(e.target.value); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button onClick={salvaLayoutBaseCorrente} disabled={salvaBaseLoading} style={{ flex: 1, background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '15px', cursor: 'pointer', fontWeight: '800', opacity: salvaBaseLoading ? 0.6 : 1 }}>{salvaBaseLoading ? 'Salvataggio...' : 'Salva'}</button>
                <button onClick={function() { setShowSalvaBase(false); }} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '12px', fontSize: '15px', cursor: 'pointer' }}>Annulla</button>
              </div>
            </div>
          </div>
        )}

        {showModaleEtichetta && tavoloInAttesaEtichetta && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '360px', maxWidth: '100%' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '800', color: '#111827' }}>Etichetta tavolo</h3>
              <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#6B7280' }}>Tipologia: <strong>{tavoloInAttesaEtichetta.nome}</strong></p>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#6B7280' }}>Assegna un numero o nome a questo tavolo (es. T50, 50, VIP). Lascia vuoto per usare il nome tipologia.</p>
              <input type="text" value={etichettaInput} onChange={function(e) { setEtichettaInput(e.target.value); }} onKeyDown={function(e) { if (e.key === 'Enter') confermAggiungiConEtichetta(); }} autoFocus placeholder="es. T50, 50, VIP1..." style={{ width: '100%', padding: '12px', border: '2px solid #3B82F6', borderRadius: '8px', fontSize: '20px', fontWeight: '700', boxSizing: 'border-box', textAlign: 'center', marginBottom: '16px' }} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={confermAggiungiConEtichetta} style={{ flex: 1, background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '15px', cursor: 'pointer', fontWeight: '800' }}>Aggiungi</button>
                <button onClick={function() { setShowModaleEtichetta(false); setTavoloInAttesaEtichetta(null); }} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '12px', fontSize: '15px', cursor: 'pointer' }}>Annulla</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── TAB EDITOR OSTACOLI ───────────────────────────────────────

  function renderTabOstacoli() {
    if (gridSize === null) return <div style={{ padding: '20px', color: '#6B7280' }}>Caricamento griglia...</div>;

    function onMouseDownOstacoli(e) {
      if (e.button !== 0) return;
      var c = cellaFromEvent(e, gridOstacoliRef);
      if (tipoOstacoloAttivo === 'servizio') {
        setServizioInizio(c); setServizioFine(c); setDraggingServizio(true);
      } else {
        setDragOstacoloStart(c); setDragOstacoloEnd(c); setIsDraggingOstacolo(true);
      }
    }
    function onMouseMoveOstacoli(e) {
      if (isDraggingOstacolo) { setDragOstacoloEnd(cellaFromEvent(e, gridOstacoliRef)); }
      if (draggingServizio) { setServizioFine(cellaFromEvent(e, gridOstacoliRef)); }
    }
    function onMouseUpOstacoli(e) {
      if (isDraggingOstacolo && dragOstacoloStart && dragOstacoloEnd) {
        var info = { x1: dragOstacoloStart.x, y1: dragOstacoloStart.y, x2raw: dragOstacoloEnd.x, y2raw: dragOstacoloEnd.y, tipo: tipoOstacoloAttivo };
        setPendingDragInfo(info); setShowDialogLunghezza(true); setDialogLunghezza('');
        setIsDraggingOstacolo(false);
      }
      if (draggingServizio && servizioInizio && servizioFine) {
        var info2 = { x1: servizioInizio.x, y1: servizioInizio.y, x2raw: servizioFine.x, y2raw: servizioFine.y, tipo: 'servizio' };
        setPendingDragInfo(info2); setShowDialogLunghezza(true); setDialogLunghezza('');
        setDraggingServizio(false);
      }
    }

    var previewCelle = [];
    if (isDraggingOstacolo && dragOstacoloStart && dragOstacoloEnd) {
      var minX2 = Math.min(dragOstacoloStart.x, dragOstacoloEnd.x);
      var maxX2 = Math.max(dragOstacoloStart.x, dragOstacoloEnd.x);
      var minY2 = Math.min(dragOstacoloStart.y, dragOstacoloEnd.y);
      var maxY2 = Math.max(dragOstacoloStart.y, dragOstacoloEnd.y);
      for (var px = minX2; px <= maxX2; px++) {
        for (var py = minY2; py <= maxY2; py++) {
          previewCelle.push({ x: px, y: py });
        }
      }
    }
    if (draggingServizio && servizioInizio && servizioFine) {
      var minX3 = Math.min(servizioInizio.x, servizioFine.x);
      var maxX3 = Math.max(servizioInizio.x, servizioFine.x);
      var minY3 = Math.min(servizioInizio.y, servizioFine.y);
      var maxY3 = Math.max(servizioInizio.y, servizioFine.y);
      for (var px2 = minX3; px2 <= maxX3; px2++) {
        for (var py2 = minY3; py2 <= maxY3; py2++) {
          previewCelle.push({ x: px2, y: py2 });
        }
      }
    }

    var tipoAttivo = getTipoOstacolo(tipoOstacoloAttivo);
    var previewColore = tipoAttivo ? tipoAttivo.colore : '#374151';

    return (
      <div>
        <div style={{ marginBottom: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {renderSliderGriglia()}
          <button onClick={cancellaOstacoliSala} style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '7px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>Cancella tutti gli ostacoli</button>
        </div>
        <div style={{ marginBottom: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {TIPI_OSTACOLO.map(function(tipo) {
            return (
              <button key={tipo.value} onClick={function() { setTipoOstacoloAttivo(tipo.value); }} style={{ padding: '6px 12px', borderRadius: '7px', border: '2px solid', fontSize: '12px', cursor: 'pointer', fontWeight: tipoOstacoloAttivo === tipo.value ? '800' : '600', background: tipoOstacoloAttivo === tipo.value ? tipo.colore : 'white', color: tipoOstacoloAttivo === tipo.value ? 'white' : tipo.colore, borderColor: tipo.colore }}>
                {tipo.label}
              </button>
            );
          })}
        </div>
        <div style={{ marginBottom: '10px', fontSize: '13px', color: '#6B7280' }}>
          Trascina per disegnare un\'area di <strong>{tipoAttivo ? tipoAttivo.label : ''}</strong>. Poi inserisci la lunghezza precisa in celle (facoltativo).
        </div>
        <div style={stileViewport()}>
          <div
            ref={gridOstacoliRef}
            onMouseDown={onMouseDownOstacoli}
            onMouseMove={onMouseMoveOstacoli}
            onMouseUp={onMouseUpOstacoli}
            onMouseLeave={onMouseUpOstacoli}
            style={Object.assign({}, stileCanvas(), { cursor: 'crosshair' })}
          >
            {renderOverlayOstacoli(true)}
            {previewCelle.map(function(c) {
              return (
                <div key={c.x + '_' + c.y} style={{ position: 'absolute', left: (c.x * gridSize) + 'px', top: (c.y * gridSize) + 'px', width: gridSize + 'px', height: gridSize + 'px', background: previewColore, opacity: 0.5, zIndex: 20, pointerEvents: 'none' }}></div>
              );
            })}
          </div>
        </div>
        {showDialogLunghezza && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', borderRadius: '14px', padding: '24px', width: '320px' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: '800' }}>Lunghezza precisa</h3>
              <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#6B7280' }}>Inserisci il numero esatto di celle (lascia vuoto per usare la selezione).</p>
              <input type="number" min="1" autoFocus value={dialogLunghezza} onChange={function(e) { setDialogLunghezza(e.target.value); }} onKeyDown={function(e) { if (e.key === 'Enter') confermaDireLunghezza(); if (e.key === 'Escape') annullaDireLunghezza(); }} style={{ width: '100%', padding: '10px', border: '2px solid #3B82F6', borderRadius: '8px', fontSize: '18px', fontWeight: '700', boxSizing: 'border-box', textAlign: 'center', marginBottom: '14px' }} placeholder="es. 13" />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={confermaDireLunghezza} style={{ flex: 1, background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', cursor: 'pointer', fontWeight: '700' }}>Conferma</button>
                <button onClick={annullaDireLunghezza} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px', fontSize: '14px', cursor: 'pointer' }}>Annulla</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── TAB GESTIONE TIPOLOGIE ────────────────────────────────────

  function renderTabGestione() {
    var gruppi = raggruppaPerCategoria(tavoli);
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#374151' }}>Tipologie tavolo</h3>
          <button onClick={function() { apriFormTavolo(null); }} style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '14px', cursor: 'pointer', fontWeight: '700' }}>+ Nuova tipologia</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '700px' }}>
          {gruppi.map(function(gruppo) {
            return (
              <div key={gruppo.categoria}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', paddingLeft: '4px' }}>{gruppo.categoria}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {gruppo.tavoli.map(function(t) {
                    return (
                      <div key={t.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: t.forma === 'rotondo' ? '50%' : ((t.border_radius || 0) + 'px'), background: t.colore || '#6B7280', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: '800' }}>
                          {t.capacita}p
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: '800', fontSize: '14px', color: '#111827' }}>{t.nome}</div>
                          <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>
                            {t.forma} &middot; {t.larghezza}x{t.altezza} celle &middot; {t.capacita} posti &middot; {t.quantita || 1} unita
                            {t.note ? ' \u00b7 ' + t.note : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          <button onClick={function() { apriFormTavolo(t); }} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>Modifica</button>
                          <button onClick={function() { duplicaTavolo(t); }} style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer' }}>Duplica</button>
                          <button onClick={function() { eliminaTavolo(t); }} style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer' }}>Elimina</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {showFormTavolo && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '460px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800', color: '#111827' }}>{tavoloInEditing ? 'Modifica tipologia' : 'Nuova tipologia'}</h3>
              <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center', padding: '20px', background: '#f9fafb', borderRadius: '10px', minHeight: '80px', alignItems: 'center' }}>
                <div style={{ width: Math.min(formTavolo.larghezza * 30, 180) + 'px', height: Math.min(formTavolo.altezza * 30, 120) + 'px', background: formTavolo.colore || '#6B7280', borderRadius: formTavolo.forma === 'rotondo' ? '50%' : ((formTavolo.border_radius || 0) + 'px'), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: '800', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{formTavolo.nome || '-'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Nome tipologia *</label>
                  <input type="text" value={formTavolo.nome} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { nome: e.target.value })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} placeholder="es. Rovere 90x90..." />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Quantita disponibili *</label>
                  <input type="number" min="1" max="200" value={formTavolo.quantita} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { quantita: parseInt(e.target.value) || 1 })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                  <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '3px' }}>Quante unita fisiche hai (es. 13)</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Capienza (posti)</label>
                    <input type="number" min="1" max="50" value={formTavolo.capacita} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { capacita: parseInt(e.target.value) || 1 })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Forma</label>
                    <select value={formTavolo.forma} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { forma: e.target.value })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}>
                      <option value="rettangolo">Rettangolare</option>
                      <option value="quadrato">Quadrato</option>
                      <option value="rotondo">Rotondo</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Larghezza (celle)</label>
                    <input type="number" min="1" max="50" value={formTavolo.larghezza} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { larghezza: parseInt(e.target.value) || 1 })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Altezza (celle)</label>
                    <input type="number" min="1" max="50" value={formTavolo.altezza} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { altezza: parseInt(e.target.value) || 1 })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '8px', fontWeight: '700' }}>Colore</label>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {COLORI_TAVOLO.map(function(c) {
                      return <button key={c.value} onClick={function() { setFormTavolo(Object.assign({}, formTavolo, { colore: c.value })); }} title={c.label} style={{ width: '34px', height: '34px', borderRadius: '50%', background: c.value, cursor: 'pointer', border: formTavolo.colore === c.value ? '3px solid #111827' : '2px solid transparent' }} />;
                    })}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Arrotondamento angoli <span style={{ color: '#9CA3AF', fontWeight: '400', fontSize: '12px' }}>0 = spigolo vivo</span></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input type="range" min="0" max="20" step="1" value={formTavolo.border_radius || 0} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { border_radius: parseInt(e.target.value) || 0 })); }} style={{ flex: 1, cursor: 'pointer' }} />
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#374151', width: '36px', textAlign: 'right' }}>{formTavolo.border_radius || 0}px</span>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Categoria <span style={{ color: '#9CA3AF', fontWeight: '400', fontSize: '12px' }}>opzionale</span></label>
                  <input type="text" value={formTavolo.categoria} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { categoria: e.target.value })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} placeholder="es. Interni, Dehors, VIP..." />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Note <span style={{ color: '#9CA3AF', fontWeight: '400', fontSize: '12px' }}>opzionale</span></label>
                  <input type="text" value={formTavolo.note} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { note: e.target.value })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
                <button onClick={salvaTavolo} style={{ flex: 1, background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '15px', cursor: 'pointer', fontWeight: '800' }}>Salva</button>
                <button onClick={function() { setShowFormTavolo(false); }} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '12px', fontSize: '15px', cursor: 'pointer' }}>Annulla</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── TAB IMPOSTAZIONI SALA ─────────────────────────────────────

  function renderTabImpostazioni() {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#374151' }}>Sale configurate</h3>
          <button onClick={function() { apriFormSala(null); }} style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '14px', cursor: 'pointer', fontWeight: '700' }}>+ Nuova sala</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '560px' }}>
          {sale.map(function(s) {
            return (
              <div key={s.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '800', fontSize: '15px', color: '#111827' }}>{s.nome}</div>
                  <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>
                    Ordine: {s.ordine} &middot; Griglia: {s.grid_cols || 16} x {s.grid_rows || 10} celle ({((s.grid_cols || 16) / 10).toFixed(1)}m x {((s.grid_rows || 10) / 10).toFixed(1)}m)
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={function() { apriFormSala(s); }} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '7px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>Modifica</button>
                  <button onClick={function() { disattivaSala(s); }} style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '7px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer' }}>Disattiva</button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: '20px', padding: '14px 16px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '10px', maxWidth: '560px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#92400E', lineHeight: '1.6' }}>
            <strong>Nota:</strong> Ogni cella = ~10cm reali. Per I Cacciagalli si consiglia 130 x 170 celle (13m x 17m).
          </p>
        </div>
        {showFormSala && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '420px', maxWidth: '100%' }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '800', color: '#111827' }}>{salaInEditing ? 'Modifica sala' : 'Nuova sala'}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Nome sala *</label>
                  <input type="text" value={formSala.nome} onChange={function(e) { setFormSala(Object.assign({}, formSala, { nome: e.target.value })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} placeholder="es. Sala Principale, Dehors..." autoFocus />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Ordine di visualizzazione</label>
                  <input type="number" min="1" value={formSala.ordine} onChange={function(e) { setFormSala(Object.assign({}, formSala, { ordine: parseInt(e.target.value) || 1 })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#1D4ED8', marginBottom: '6px' }}>Dimensioni griglia</div>
                  <div style={{ fontSize: '12px', color: '#3B82F6', marginBottom: '10px' }}>Ogni cella = ~10cm. Consigliato: 130 x 170.</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Larghezza (celle)</label>
                      <input type="number" min="10" max="300" value={formSala.grid_cols} onChange={function(e) { setFormSala(Object.assign({}, formSala, { grid_cols: parseInt(e.target.value) || 40 })); }} style={{ width: '100%', padding: '9px', border: '1px solid #93C5FD', borderRadius: '7px', fontSize: '14px', boxSizing: 'border-box', fontWeight: '700' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Altezza (celle)</label>
                      <input type="number" min="10" max="300" value={formSala.grid_rows} onChange={function(e) { setFormSala(Object.assign({}, formSala, { grid_rows: parseInt(e.target.value) || 30 })); }} style={{ width: '100%', padding: '9px', border: '1px solid #93C5FD', borderRadius: '7px', fontSize: '14px', boxSizing: 'border-box', fontWeight: '700' }} />
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '8px' }}>
                    Area: {formSala.grid_cols / 10}m x {formSala.grid_rows / 10}m
                  </div>
                </div>
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#166534', marginBottom: '6px' }}>Numerazione automatica tavoli</div>
                  <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '10px' }}>Quando aggiungi un tavolo, l'etichetta viene generata automaticamente come prefisso + numero (es. "S" + 50 → "S050").</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Prefisso <span style={{ color: '#9CA3AF', fontWeight: '400' }}>opzionale</span></label>
                      <input type="text" maxLength="4" value={formSala.prefisso_tavolo} onChange={function(e) { setFormSala(Object.assign({}, formSala, { prefisso_tavolo: e.target.value })); }} style={{ width: '100%', padding: '9px', border: '1px solid #86EFAC', borderRadius: '7px', fontSize: '14px', boxSizing: 'border-box', fontWeight: '700', textTransform: 'uppercase' }} placeholder="es. S, T, V" />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Numero iniziale</label>
                      <input type="number" min="1" max="999" value={formSala.numero_iniziale} onChange={function(e) { setFormSala(Object.assign({}, formSala, { numero_iniziale: parseInt(e.target.value) || 1 })); }} style={{ width: '100%', padding: '9px', border: '1px solid #86EFAC', borderRadius: '7px', fontSize: '14px', boxSizing: 'border-box', fontWeight: '700' }} />
                    </div>
                  </div>
                  {formSala.prefisso_tavolo.trim() && (
                    <div style={{ fontSize: '11px', color: '#166534', marginTop: '8px', fontWeight: '700' }}>
                      Anteprima: {formSala.prefisso_tavolo.toUpperCase()}{String(formSala.numero_iniziale || 1).padStart(3, '0')}, {formSala.prefisso_tavolo.toUpperCase()}{String((formSala.numero_iniziale || 1) + 1).padStart(3, '0')}, {formSala.prefisso_tavolo.toUpperCase()}{String((formSala.numero_iniziale || 1) + 2).padStart(3, '0')}...
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
                <button onClick={salvaSala} style={{ flex: 1, background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '15px', cursor: 'pointer', fontWeight: '800' }}>Salva</button>
                <button onClick={function() { setShowFormSala(false); }} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '12px', fontSize: '15px', cursor: 'pointer' }}>Annulla</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── RENDER PRINCIPALE ─────────────────────────────────────────

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}><div style={{ fontSize: '16px', color: '#6B7280' }}>Caricamento...</div></div>;
  }

  if (errore) {
    return <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '8px', padding: '16px', color: '#DC2626', margin: '20px' }}>Errore: {errore}</div>;
  }

  var TABS = [
    { key: 'mappa',        label: 'Mappa sala',         admin: false },
    { key: 'ostacoli',     label: 'Editor ostacoli',    admin: true  },
    { key: 'gestione',     label: 'Gestione tipologie', admin: true  },
    { key: 'impostazioni', label: 'Impostazioni sala',  admin: true  }
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '22px' }}>
        <h1 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: '800', color: '#111827' }}>Mappa Sale</h1>
        <p style={{ margin: 0, fontSize: '14px', color: '#6B7280' }}>Gestione tipologie, layout, ostacoli e assegnazione prenotazioni</p>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: '#f3f4f6', borderRadius: '10px', padding: '4px', width: 'fit-content', flexWrap: 'wrap' }}>
        {TABS.map(function(t) {
          if (t.admin && !isAdmin) return null;
          return (
            <button key={t.key} onClick={function() { setTab(t.key); }} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: tab === t.key ? '700' : '400', background: tab === t.key ? 'white' : 'transparent', color: tab === t.key ? '#111827' : '#6B7280', boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>{t.label}</button>
          );
        })}
      </div>

      {(tab === 'mappa' || tab === 'ostacoli') && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {sale.map(function(s) {
              return (
                <button key={s.id} onClick={function() { setSalaSelezionata(s.id); setPannelloAperto(false); }} style={{ padding: '8px 16px', borderRadius: '8px', border: '2px solid', fontSize: '14px', cursor: 'pointer', fontWeight: '700', background: salaSelezionata === s.id ? '#1D4ED8' : 'white', color: salaSelezionata === s.id ? 'white' : '#374151', borderColor: salaSelezionata === s.id ? '#1D4ED8' : '#d1d5db' }}>{s.nome}</button>
              );
            })}
          </div>
          {tab === 'mappa' && (
            <>
              <input type="date" value={dataSelezionata} onChange={function(e) { setDataSelezionata(e.target.value); setPannelloAperto(false); }} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }} />
              <div style={{ display: 'flex', gap: '3px', background: '#f3f4f6', borderRadius: '8px', padding: '3px' }}>
                {['pranzo', 'cena'].map(function(turno) {
                  return (
                    <button key={turno} onClick={function() { setTurnoSelezionato(turno); setPannelloAperto(false); }} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: turnoSelezionato === turno ? '700' : '400', background: turnoSelezionato === turno ? 'white' : 'transparent', color: turnoSelezionato === turno ? '#111827' : '#6B7280', boxShadow: turnoSelezionato === turno ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                      {turno === 'pranzo' ? 'Pranzo' : 'Cena'}
                    </button>
                  );
                })}
              </div>
              {isAdmin && (
                <button
                  onClick={function() { setEditorModeAttivo(function(prev) { return !prev; }); setSelezionatiEditor([]); }}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: '2px solid', fontSize: '13px', cursor: 'pointer', fontWeight: '700', background: editorModeAttivo ? '#F59E0B' : 'white', color: editorModeAttivo ? 'white' : '#92400E', borderColor: editorModeAttivo ? '#F59E0B' : '#FDE68A' }}
                >
                  ✏️ {editorModeAttivo ? 'Esci da editor' : 'Modalità editor'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'mappa'        && (editorModeAttivo && isAdmin ? renderTabEditor() : renderTabMappa())}
      {tab === 'ostacoli'     && isAdmin && renderTabOstacoli()}
      {tab === 'gestione'     && isAdmin && renderTabGestione()}
      {tab === 'impostazioni' && isAdmin && renderTabImpostazioni()}
    </div>
  );
}
