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

var TIPI_OSTACOLO = [
  { value: 'muro',     label: 'Muro',              colore: '#374151', blocca: true  },
  { value: 'colonna',  label: 'Colonna',            colore: '#92400E', blocca: true  },
  { value: 'tramezzo', label: 'Tramezzo',           colore: '#64748B', blocca: true  },
  { value: 'finestra', label: 'Finestra',           colore: '#38BDF8', blocca: false },
  { value: 'porta',    label: 'Porta',              colore: '#F97316', blocca: false },
  { value: 'bancone',  label: 'Bancone / Bar',      colore: '#8B5CF6', blocca: true  },
  { value: 'servizio', label: 'Tavolo di servizio', colore: '#9CA3AF', blocca: true  }
];

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

function getDimensioniEffettive(layoutItem) {
  var t = layoutItem.tavolo;
  if (!t) return { w: 1, h: 1 };
  var rot = (layoutItem.rotazione === null || layoutItem.rotazione === undefined) ? 0 : layoutItem.rotazione;
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

    if (top    > 0) sedieLinea(top,    pad,                  -sedieSize / 2 - gap, w - pad,                -sedieSize / 2 - gap);
    if (bottom > 0) sedieLinea(bottom, pad,                   h + sedieSize / 2 + gap, w - pad,             h + sedieSize / 2 + gap);
    if (left   > 0) sedieLinea(left,  -sedieSize / 2 - gap,  pad,                  -sedieSize / 2 - gap,    h - pad);
    if (right  > 0) sedieLinea(right,  w + sedieSize / 2 + gap, pad,                w + sedieSize / 2 + gap, h - pad);
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

  var [draggingTavolo, setDraggingTavolo] = useState(null);
  var [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  var [tavoloSelezionato, setTavoloSelezionato] = useState(null);
  var [pannelloAperto, setPannelloAperto] = useState(false);
  var [showAssegna, setShowAssegna] = useState(false);
  var [assegnaPrenotazione, setAssegnaPrenotazione] = useState(null);
  var [assegnaOspiti, setAssegnaOspiti] = useState(0);
  var [showUnione, setShowUnione] = useState(false);
  var [unioneCapienza, setUnioneCapienza] = useState(0);

  var [showFormTavolo, setShowFormTavolo] = useState(false);
  var [tavoloInEditing, setTavoloInEditing] = useState(null);
  var [formTavolo, setFormTavolo] = useState({ nome: '', capacita: 4, forma: 'rettangolo', larghezza: 2, altezza: 1, colore: '#6B7280', note: '', categoria: '', quantita: 1 });

  var [showModaleEtichetta, setShowModaleEtichetta] = useState(false);
  var [tavoloInAttesaEtichetta, setTavoloInAttesaEtichetta] = useState(null);
  var [etichettaInput, setEtichettaInput] = useState('');

  var [showFormSala, setShowFormSala] = useState(false);
  var [salaInEditing, setSalaInEditing] = useState(null);
  var [formSala, setFormSala] = useState({ nome: '', ordine: 1, grid_cols: 40, grid_rows: 30 });

  var [gruppiEspansi, setGruppiEspansi] = useState({});

  var [ostacoli, setOstacoli] = useState([]);
  var [tipoOstacoloAttivo, setTipoOstacoloAttivo] = useState('muro');
  // FIX 5: stato per dialog "quante celle" nell'editor ostacoli
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

  var [tavoliOccupati, setTavoliOccupati] = useState({});

  var gridRef = useRef(null);
  var gridOstacoliRef = useRef(null);

  useEffect(function() {
    caricaSale();
    caricaTavoli();
    caricaOccupazioneTavoli();
  }, []);

  useEffect(function() {
    if (salaSelezionata) {
      caricaLayout(salaSelezionata);
      caricaOstacoli(salaSelezionata);
      caricaLayoutBase(salaSelezionata);
      caricaOccupazioneTavoli();
    }
  }, [salaSelezionata, dataSelezionata]);

  useEffect(function() {
    if (salaSelezionata && sale.length > 0) {
      aggiornaDimensioniGriglia(salaSelezionata);
    }
  }, [sale, salaSelezionata]);

  useEffect(function() {
    if (salaSelezionata && dataSelezionata && turnoSelezionato) {
      caricaTavoliUniti();
      caricaPrenotazioni();
      caricaTavoliPrenotazioni();
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

  function caricaLayout(salaId) {
    supabase.from('layout_sala').select('*, tavolo:tavoli(*)').eq('sala_id', salaId).lte('data_validita_dal', dataSelezionata).order('data_validita_dal', { ascending: false }).then(function(result) {
      if (result.error) { setErrore(result.error.message); return; }
      var visti = {};
      var layout = [];
      var rows = result.data || [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!visti[r.tavolo_id]) { visti[r.tavolo_id] = true; layout.push(r); }
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

  function caricaOccupazioneTavoli() {
    supabase.from('layout_sala').select('tavolo_id, sala_id, etichetta, data_validita_dal, sale(nome, id)').order('data_validita_dal', { ascending: false }).then(function(result) {
      if (result.error) return;
      var mappa = {};
      var vistiSala = {};
      var rows = result.data || [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var chiave = r.tavolo_id + '_' + r.sala_id;
        if (!vistiSala[chiave]) {
          vistiSala[chiave] = true;
          if (!mappa[r.tavolo_id]) mappa[r.tavolo_id] = [];
          mappa[r.tavolo_id].push({ nomeSala: r.sale ? r.sale.nome : 'altra sala', salaId: r.sale ? r.sale.id : null, etichetta: r.etichetta || '' });
        }
      }
      setTavoliOccupati(mappa);
    });
  }

  function contaIstanzeAlteSale(tavoloId, salaCorrId) {
    var lista = tavoliOccupati[tavoloId];
    if (!lista) return 0;
    var n = 0;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].salaId !== salaCorrId) n++;
    }
    return n;
  }

  function caricaTavoliUniti() {
    supabase.from('tavoli_uniti').select('*').eq('data', dataSelezionata).eq('turno', turnoSelezionato).eq('attivo', true).then(function(result) {
      if (!result.error) setTavoliUniti(result.data || []);
    });
  }

  function caricaPrenotazioni() {
    supabase.from('reservations').select('id, adulti, bambini, note, stato, ora, customer:customers(first_name, last_name)').eq('data', dataSelezionata).eq('tipo_pasto', turnoSelezionato).then(function(result) {
      if (!result.error) setPrenotazioni(result.data || []);
    });
  }

  function caricaTavoliPrenotazioni() {
    supabase.from('tavoli_prenotazioni').select('*').eq('data', dataSelezionata).eq('turno', turnoSelezionato).then(function(result) {
      if (!result.error) setTavoliPrenotazioni(result.data || []);
    });
  }

  function getStatoTavolo(tavoloId) {
    var assegnazioni = tavoliPrenotazioni.filter(function(tp) { return tp.tavolo_id === tavoloId; });
    if (assegnazioni.length === 0) return 'libero';
    var pren = null;
    for (var i = 0; i < prenotazioni.length; i++) {
      var p = prenotazioni[i];
      for (var j = 0; j < assegnazioni.length; j++) {
        if (assegnazioni[j].prenotazione_id === p.id) { pren = p; break; }
      }
      if (pren) break;
    }
    if (!pren) return 'libero';
    if (pren.stato === 'arrivato' || pren.stato === 'al_tavolo') return 'occupato';
    return 'prenotato';
  }

  function getNomeClienteTavolo(tavoloId) {
    var a = null;
    for (var i = 0; i < tavoliPrenotazioni.length; i++) {
      if (tavoliPrenotazioni[i].tavolo_id === tavoloId) { a = tavoliPrenotazioni[i]; break; }
    }
    if (!a) return null;
    var p = null;
    for (var j = 0; j < prenotazioni.length; j++) {
      if (prenotazioni[j].id === a.prenotazione_id) { p = prenotazioni[j]; break; }
    }
    if (!p) return null;
    return p.customer ? (p.customer.first_name + ' ' + p.customer.last_name) : 'Cliente';
  }

  function getOspitiAssegnatiTavolo(tavoloId) {
    var tot = 0;
    for (var i = 0; i < tavoliPrenotazioni.length; i++) {
      if (tavoliPrenotazioni[i].tavolo_id === tavoloId) tot += (tavoliPrenotazioni[i].n_ospiti_assegnati || 0);
    }
    return tot;
  }

  function isTavoloUnito(tavoloId) {
    for (var i = 0; i < tavoliUniti.length; i++) {
      if (tavoliUniti[i].tavolo_secondario_id === tavoloId || tavoliUniti[i].tavolo_principale_id === tavoloId) return true;
    }
    return false;
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

  function onMouseDownTavolo(e, layoutItem) {
    e.preventDefault();
    var rect = gridRef.current.getBoundingClientRect();
    setDraggingTavolo(layoutItem.tavolo_id);
    setDragOffset({ x: e.clientX - rect.left - layoutItem.pos_x * gridSize, y: e.clientY - rect.top - layoutItem.pos_y * gridSize });
  }

  function onMouseMoveGrid(e) {
    if (!draggingTavolo) return;
    var rect = gridRef.current.getBoundingClientRect();
    var item = null;
    for (var i = 0; i < layoutTemp.length; i++) {
      if (layoutTemp[i].tavolo_id === draggingTavolo) { item = layoutTemp[i]; break; }
    }
    var dim = item ? getDimensioniEffettive(item) : { w: 1, h: 1 };
    var col = Math.max(0, Math.min(gridCols - dim.w, Math.round((e.clientX - rect.left - dragOffset.x) / gridSize)));
    var row = Math.max(0, Math.min(gridRows - dim.h, Math.round((e.clientY - rect.top - dragOffset.y) / gridSize)));
    setLayoutTemp(function(prev) {
      return prev.map(function(it) {
        if (it.tavolo_id === draggingTavolo) return Object.assign({}, it, { pos_x: col, pos_y: row });
        return it;
      });
    });
    setLayoutModificato(true);
  }

  function onMouseUpGrid() { setDraggingTavolo(null); }

  // FIX 2: rotazione — valore esplicito senza || 0
  function ruotaTavoloInLayout(tavoloId) {
    setLayoutTemp(function(prev) {
      return prev.map(function(item) {
        if (item.tavolo_id !== tavoloId) return item;
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

  // FIX 1: rimozione immediata nel DB
  function rimuoviDalLayoutDB(layoutItem) {
    if (!window.confirm('Rimuovere "' + ((layoutItem.etichetta && layoutItem.etichetta.trim()) ? layoutItem.etichetta : (layoutItem.tavolo ? layoutItem.tavolo.nome : 'tavolo')) + '" dal layout?')) return;
    // Elimina tutti i record per questo tavolo in questa sala
    supabase.from('layout_sala').delete().eq('sala_id', salaSelezionata).eq('tavolo_id', layoutItem.tavolo_id).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); return; }
      caricaLayout(salaSelezionata);
      caricaOccupazioneTavoli();
    });
  }

  // FIX 2: salvataggio rotazione con Number() esplicito
  function salvaLayout() {
    var oggi = new Date().toISOString().split('T')[0];
    Promise.all(layoutTemp.map(function(item) {
      var rot = (item.rotazione === null || item.rotazione === undefined) ? 0 : Number(item.rotazione);
      return supabase.from('layout_sala').insert({
        sala_id: salaSelezionata,
        tavolo_id: item.tavolo_id,
        pos_x: item.pos_x,
        pos_y: item.pos_y,
        rotazione: rot,
        etichetta: item.etichetta || null,
        data_validita_dal: oggi
      });
    })).then(function() {
      setLayoutModificato(false);
      caricaLayout(salaSelezionata);
      caricaOccupazioneTavoli();
      alert('Layout salvato correttamente!');
    });
  }

  function salvaLayoutBaseCorrente() {
    if (!nomeLayoutBase.trim()) { alert('Inserisci un nome per il layout base'); return; }
    if (layoutTemp.length === 0) { alert('Non ci sono tavoli nel layout attuale'); return; }
    setSalvaBaseLoading(true);
    supabase.from('layout_base').insert({ sala_id: salaSelezionata, nome: nomeLayoutBase.trim(), descrizione: descLayoutBase.trim() || null }).select().single().then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); setSalvaBaseLoading(false); return; }
      var layoutBaseId = result.data.id;
      var righe = layoutTemp.map(function(item) {
        return { layout_base_id: layoutBaseId, tavolo_id: item.tavolo_id, pos_x: item.pos_x, pos_y: item.pos_y, rotazione: (item.rotazione === null || item.rotazione === undefined) ? 0 : Number(item.rotazione) };
      });
      supabase.from('layout_base_tavoli').insert(righe).then(function(r2) {
        setSalvaBaseLoading(false);
        if (r2.error) { alert('Errore salvataggio posizioni: ' + r2.error.message); return; }
        setShowSalvaBase(false); setNomeLayoutBase(''); setDescLayoutBase('');
        caricaLayoutBase(salaSelezionata);
      });
    });
  }

  function caricaLayoutBaseSuGriglia(lb) {
    if (!window.confirm('Caricare il layout "' + lb.nome + '"? Le modifiche non salvate andranno perse.')) return;
    var nuovoLayout = (lb.layout_base_tavoli || []).map(function(item) {
      return { id: null, sala_id: salaSelezionata, tavolo_id: item.tavolo_id, tavolo: item.tavolo, pos_x: item.pos_x, pos_y: item.pos_y, rotazione: item.rotazione || 0, etichetta: item.etichetta || '', data_validita_dal: dataSelezionata, nuovo: true };
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

  // FIX 1: aggiunge al layout con etichetta — usa snapshot per evitare closure
  function richiediEtichettaEAggiungi(tavoloSnap) {
    for (var i = 0; i < layoutTemp.length; i++) {
      if (layoutTemp[i].tavolo_id === tavoloSnap.id) {
        alert('Questa tipologia e\' gia\' presente in questo layout.');
        return;
      }
    }
    setTavoloInAttesaEtichetta(tavoloSnap);
    setEtichettaInput('');
    setShowModaleEtichetta(true);
  }

  function confermAggiungiConEtichetta() {
    var tavolo = tavoloInAttesaEtichetta;
    if (!tavolo) return;
    setLayoutTemp(function(prev) {
      return prev.concat([{ id: null, sala_id: salaSelezionata, tavolo_id: tavolo.id, tavolo: tavolo, pos_x: 0, pos_y: 0, rotazione: 0, etichetta: etichettaInput.trim(), data_validita_dal: dataSelezionata, nuovo: true }]);
    });
    setLayoutModificato(true);
    setShowModaleEtichetta(false);
    setTavoloInAttesaEtichetta(null);
    setEtichettaInput('');
  }

  // FIX 1: ++Tutti usa snapshot della lista passata come argomento
  function aggiungiGruppoAlLayout(snapList) {
    var daAggiungere = [];
    for (var i = 0; i < snapList.length; i++) {
      var t = snapList[i];
      var presente = false;
      for (var j = 0; j < layoutTemp.length; j++) {
        if (layoutTemp[j].tavolo_id === t.id) { presente = true; break; }
      }
      if (!presente) daAggiungere.push(t);
    }
    if (daAggiungere.length === 0) return;
    setLayoutTemp(function(prev) {
      var nuovi = daAggiungere.map(function(t) {
        return { id: null, sala_id: salaSelezionata, tavolo_id: t.id, tavolo: t, pos_x: 0, pos_y: 0, rotazione: 0, etichetta: '', data_validita_dal: dataSelezionata, nuovo: true };
      });
      return prev.concat(nuovi);
    });
    setLayoutModificato(true);
  }

  function apriFormTavolo(tavolo) {
    if (tavolo) {
      setTavoloInEditing(tavolo);
      setFormTavolo({ nome: tavolo.nome, capacita: tavolo.capacita, forma: tavolo.forma, larghezza: tavolo.larghezza, altezza: tavolo.altezza, colore: tavolo.colore, note: tavolo.note || '', categoria: tavolo.categoria || '', quantita: tavolo.quantita || 1 });
    } else {
      setTavoloInEditing(null);
      setFormTavolo({ nome: '', capacita: 4, forma: 'rettangolo', larghezza: 2, altezza: 1, colore: '#6B7280', note: '', categoria: '', quantita: 1 });
    }
    setShowFormTavolo(true);
  }

  function salvaTavolo() {
    if (!formTavolo.nome.trim()) { alert('Inserisci il nome della tipologia'); return; }
    var dati = { nome: formTavolo.nome.trim(), capacita: parseInt(formTavolo.capacita) || 4, forma: formTavolo.forma, larghezza: parseInt(formTavolo.larghezza) || 2, altezza: parseInt(formTavolo.altezza) || 1, colore: formTavolo.colore, note: formTavolo.note, categoria: formTavolo.categoria.trim() || null, quantita: parseInt(formTavolo.quantita) || 1 };
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
    if (sala) { setSalaInEditing(sala); setFormSala({ nome: sala.nome, ordine: sala.ordine, grid_cols: sala.grid_cols || 40, grid_rows: sala.grid_rows || 30 }); }
    else { setSalaInEditing(null); setFormSala({ nome: '', ordine: sale.length + 1, grid_cols: 40, grid_rows: 30 }); }
    setShowFormSala(true);
  }

  function salvaSala() {
    if (!formSala.nome.trim()) { alert('Inserisci il nome della sala'); return; }
    var dati = { nome: formSala.nome.trim(), ordine: parseInt(formSala.ordine) || 1, attiva: true, grid_cols: parseInt(formSala.grid_cols) || 40, grid_rows: parseInt(formSala.grid_rows) || 30 };
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

  function apriUnione(tavoloSecondarioId) {
    var cap1 = tavoloSelezionato && tavoloSelezionato.tavolo ? tavoloSelezionato.tavolo.capacita : 0;
    var li2 = null;
    for (var i = 0; i < layoutAttivo.length; i++) { if (layoutAttivo[i].tavolo_id === tavoloSecondarioId) { li2 = layoutAttivo[i]; break; } }
    var cap2 = li2 && li2.tavolo ? li2.tavolo.capacita : 0;
    setUnioneCapienza(cap1 + cap2);
    setShowUnione(tavoloSecondarioId);
  }

  function confermaUnione() {
    supabase.from('tavoli_uniti').insert({ tavolo_principale_id: tavoloSelezionato.tavolo_id, tavolo_secondario_id: showUnione, data: dataSelezionata, turno: turnoSelezionato, attivo: true, capacita_unione: parseInt(unioneCapienza) || 0 }).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); return; }
      caricaTavoliUniti(); setShowUnione(false);
    });
  }

  function sciogliUnione(unioneId) {
    supabase.from('tavoli_uniti').update({ attivo: false }).eq('id', unioneId).then(function() { caricaTavoliUniti(); });
  }

  function confermaAssegna() {
    if (!assegnaPrenotazione) { alert('Seleziona una prenotazione'); return; }
    if (!assegnaOspiti || parseInt(assegnaOspiti) <= 0) { alert('Inserisci il numero di ospiti'); return; }
    supabase.from('tavoli_prenotazioni').insert({ prenotazione_id: assegnaPrenotazione, tavolo_id: tavoloSelezionato.tavolo_id, n_ospiti_assegnati: parseInt(assegnaOspiti), data: dataSelezionata, turno: turnoSelezionato }).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); return; }
      caricaTavoliPrenotazioni(); setShowAssegna(false); setPannelloAperto(false);
    });
  }

  function rimuoviAssegnazione(tavoloId) {
    if (!window.confirm('Rimuovere l\'assegnazione da questo tavolo?')) return;
    supabase.from('tavoli_prenotazioni').delete().eq('tavolo_id', tavoloId).eq('data', dataSelezionata).eq('turno', turnoSelezionato).then(function() { caricaTavoliPrenotazioni(); });
  }

  function toggleGruppo(cat) {
    setGruppiEspansi(function(prev) {
      var nuovo = Object.assign({}, prev);
      nuovo[cat] = !nuovo[cat];
      return nuovo;
    });
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

  // FIX 5: conferma lunghezza nel dialog ostacoli
  // Determina la direzione del drag e calcola x2,y2 in base alla lunghezza inserita
  function confermaDireLunghezza() {
    var n = parseInt(dialogLunghezza);
    if (!pendingDragInfo) return;
    var x1 = pendingDragInfo.x1;
    var y1 = pendingDragInfo.y1;
    var x2raw = pendingDragInfo.x2raw;
    var y2raw = pendingDragInfo.y2raw;
    var tipo = pendingDragInfo.tipo;

    // Determina direzione prevalente del drag
    var dx = Math.abs(x2raw - x1);
    var dy = Math.abs(y2raw - y1);

    var x2, y2;
    if (!isNaN(n) && n >= 1) {
      // usa la lunghezza indicata dall'utente nella direzione del drag
      if (dx >= dy) {
        // direzione orizzontale
        x2 = x1 + (x2raw >= x1 ? n - 1 : -(n - 1));
        y2 = y1;
      } else {
        // direzione verticale
        x2 = x1;
        y2 = y1 + (y2raw >= y1 ? n - 1 : -(n - 1));
      }
      x2 = Math.max(0, Math.min(gridCols - 1, x2));
      y2 = Math.max(0, Math.min(gridRows - 1, y2));
    } else {
      // nessun valore: usa il drag originale
      x2 = x2raw;
      y2 = y2raw;
    }

    setShowDialogLunghezza(false);
    setDialogLunghezza('');
    setPendingDragInfo(null);
    setDragOstacoloStart(null);
    setDragOstacoloEnd(null);

    if (tipo === 'servizio') {
      applicaServizio(x1, y1, x2, y2);
    } else {
      applicaAreaOstacoli(x1, y1, x2, y2);
    }
  }

  function annullaDireLunghezza() {
    setShowDialogLunghezza(false);
    setDialogLunghezza('');
    setPendingDragInfo(null);
    setDragOstacoloStart(null);
    setDragOstacoloEnd(null);
    setIsDraggingOstacolo(false);
    setDraggingServizio(false);
    setServizioInizio(null);
    setServizioFine(null);
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

  // ── OVERLAY OSTACOLI ──────────────────────────────────────────

  function renderOverlayOstacoli(editorMode) {
    return ostacoli.map(function(o) {
      var tipo = getTipoOstacolo(o.tipo);
      if (!tipo) return null;
      return (
        <div key={o.id} style={{ position: 'absolute', left: (o.cella_x * gridSize) + 'px', top: (o.cella_y * gridSize) + 'px', width: gridSize + 'px', height: gridSize + 'px', background: tipo.colore, opacity: tipo.blocca ? 0.75 : 0.45, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: editorMode ? 'auto' : 'none', cursor: editorMode ? 'pointer' : 'default', borderRadius: o.tipo === 'colonna' ? '50%' : '0px', border: editorMode ? '1px solid rgba(255,255,255,0.3)' : 'none' }}
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

  // ── RENDER TAVOLO GRIGLIA ─────────────────────────────────────

  function renderTavoloGriglia(layoutItem, editorMode) {
    var t = layoutItem.tavolo;
    if (!t) return null;
    var dim = getDimensioniEffettive(layoutItem);
    var w = dim.w * gridSize - 4;
    var h = dim.h * gridSize - 4;
    var x = layoutItem.pos_x * gridSize + 2;
    var y = layoutItem.pos_y * gridSize + 2;
    var stato = editorMode ? 'libero' : getStatoTavolo(layoutItem.tavolo_id);
    var nomeCliente = editorMode ? null : getNomeClienteTavolo(layoutItem.tavolo_id);
    var ospiti = editorMode ? 0 : getOspitiAssegnatiTavolo(layoutItem.tavolo_id);
    var unito = !editorMode && isTavoloUnito(layoutItem.tavolo_id);
    var isRound = t.forma === 'rotondo';
    var suOstacolo = editorMode && tavoloSuCellaBlocca(layoutItem);
    var bgColor = editorMode ? (t.colore || '#6B7280') : (stato === 'occupato' ? '#EF4444' : stato === 'prenotato' ? '#F59E0B' : '#10B981');
    var pad = mostraSedie ? 14 : 0;
    var labelVisibile = (layoutItem.etichetta && layoutItem.etichetta.trim()) ? layoutItem.etichetta.trim() : t.nome;
    var rotAttuale = (layoutItem.rotazione === null || layoutItem.rotazione === undefined) ? 0 : Number(layoutItem.rotazione);

    return (
      <div key={layoutItem.tavolo_id}
        onMouseDown={editorMode ? function(e) { onMouseDownTavolo(e, layoutItem); } : undefined}
        onClick={!editorMode ? function() { setTavoloSelezionato(layoutItem); setShowAssegna(false); setShowUnione(false); setAssegnaPrenotazione(null); setAssegnaOspiti(0); setPannelloAperto(true); } : undefined}
        style={{ position: 'absolute', left: (x - pad) + 'px', top: (y - pad) + 'px', width: (w + pad * 2) + 'px', height: (h + pad * 2) + 'px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: editorMode ? 'grab' : 'pointer', userSelect: 'none', zIndex: draggingTavolo === layoutItem.tavolo_id ? 50 : 15 }}
      >
        {mostraSedie && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <SedieSVG w={w + pad * 2} h={h + pad * 2} capacita={t.capacita} forma={t.forma} colore={editorMode ? (t.colore || '#6B7280') : bgColor} />
          </div>
        )}
        <div style={{ position: 'relative', width: w + 'px', height: h + 'px', backgroundColor: bgColor, borderRadius: isRound ? '50%' : '8px', boxShadow: suOstacolo ? '0 0 0 3px #EF4444' : (unito ? '0 0 0 3px #7C3AED' : '0 2px 6px rgba(0,0,0,0.25)'), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', overflow: 'hidden' }}>
          <span style={{ fontSize: '12px', fontWeight: '800', textShadow: '0 1px 2px rgba(0,0,0,0.3)', textAlign: 'center', padding: '0 2px' }}>{labelVisibile}</span>
          {!editorMode && nomeCliente && <span style={{ fontSize: '9px', opacity: 0.95, textAlign: 'center', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>{nomeCliente}</span>}
          {!editorMode && ospiti > 0 && <span style={{ fontSize: '9px', opacity: 0.85, marginTop: '1px' }}>{ospiti} osp.</span>}
          {!editorMode && stato === 'libero' && <span style={{ fontSize: '9px', opacity: 0.8 }}>{t.capacita} posti</span>}
          {editorMode && (
            <>
              <button onMouseDown={function(e) { e.stopPropagation(); }} onClick={function(e) { e.stopPropagation(); ruotaTavoloInLayout(layoutItem.tavolo_id); }} title={'Ruota (' + rotAttuale + 'deg)'} style={{ position: 'absolute', top: '2px', left: '3px', background: 'rgba(0,0,0,0.4)', border: 'none', color: 'white', borderRadius: '50%', width: '16px', height: '16px', fontSize: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', lineHeight: 1 }}>R</button>
              <button onMouseDown={function(e) { e.stopPropagation(); }} onClick={function(e) { e.stopPropagation(); rimuoviDalLayoutDB(layoutItem); }} style={{ position: 'absolute', top: '2px', right: '3px', background: 'rgba(0,0,0,0.35)', border: 'none', color: 'white', borderRadius: '50%', width: '16px', height: '16px', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', lineHeight: 1 }}>x</button>
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

  // FIX 3: stile viewport scrollabile — larghezza NON limitata da maxWidth
  function stileViewport() {
    return { width: VIEWPORT_W + 'px', height: VIEWPORT_H + 'px', overflowX: 'auto', overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: '8px', flexShrink: 0 };
  }

  function stileCanvas() {
    return { position: 'relative', width: (gridCols * gridSize) + 'px', height: (gridRows * gridSize) + 'px', backgroundImage: 'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)', backgroundSize: gridSize + 'px ' + gridSize + 'px', backgroundColor: '#f9fafb', flexShrink: 0 };
  }

  // ── TAB MAPPA ─────────────────────────────────────────────────

  function renderTabMappa() {
    if (gridSize === null) return <div style={{ padding: '20px', color: '#6B7280' }}>Caricamento griglia...</div>;
    var liberi    = 0; var occupati = 0; var prenotati = 0;
    for (var i = 0; i < layoutAttivo.length; i++) {
      var s = getStatoTavolo(layoutAttivo[i].tavolo_id);
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
        {renderLegendaOstacoli()}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div style={stileViewport()}>
            <div style={stileCanvas()}>
              {renderOverlayOstacoli(false)}
              {layoutAttivo.map(function(item) { return renderTavoloGriglia(item, false); })}
            </div>
          </div>
          {pannelloAperto && tavoloSelezionato && renderPannelloTavolo()}
        </div>
        {tavoliUniti.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#374151', marginBottom: '8px' }}>Tavoli uniti questo turno</h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {tavoliUniti.map(function(u) {
                var l1 = null; var l2 = null;
                for (var i = 0; i < layoutAttivo.length; i++) {
                  if (layoutAttivo[i].tavolo_id === u.tavolo_principale_id) l1 = layoutAttivo[i];
                  if (layoutAttivo[i].tavolo_id === u.tavolo_secondario_id) l2 = layoutAttivo[i];
                }
                var t1 = null; var t2 = null;
                for (var j = 0; j < tavoli.length; j++) {
                  if (tavoli[j].id === u.tavolo_principale_id) t1 = tavoli[j];
                  if (tavoli[j].id === u.tavolo_secondario_id) t2 = tavoli[j];
                }
                var nome1 = (l1 && l1.etichetta) ? l1.etichetta : (t1 ? t1.nome : '?');
                var nome2 = (l2 && l2.etichetta) ? l2.etichetta : (t2 ? t2.nome : '?');
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
      </div>
    );
  }

  function renderPannelloTavolo() {
    var ts = tavoloSelezionato;
    var stato = getStatoTavolo(ts.tavolo_id);
    var labelTavolo = (ts.etichetta && ts.etichetta.trim()) ? ts.etichetta.trim() : (ts.tavolo ? ts.tavolo.nome : 'Tavolo');
    return (
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', minWidth: '280px', maxWidth: '320px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#111827' }}>{labelTavolo}</h3>
          <button onClick={function() { setPannelloAperto(false); setShowAssegna(false); setShowUnione(false); }} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 }}>x</button>
        </div>
        {ts.tavolo && (
          <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#f9fafb', borderRadius: '8px', fontSize: '13px', color: '#374151', lineHeight: '1.7' }}>
            <div>Tipologia: <strong>{ts.tavolo.nome}</strong></div>
            <div>Capienza: <strong>{ts.tavolo.capacita} posti</strong></div>
            <div>Stato: <strong style={{ color: stato === 'occupato' ? '#EF4444' : stato === 'prenotato' ? '#D97706' : '#059669' }}>{labelStato(stato)}</strong></div>
            {getOspitiAssegnatiTavolo(ts.tavolo_id) > 0 && <div>Ospiti: <strong>{getOspitiAssegnatiTavolo(ts.tavolo_id)}</strong></div>}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {stato === 'libero' ? (
            <>
              <button onClick={function() { setShowAssegna(true); setShowUnione(false); }} style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>+ Assegna prenotazione</button>
              <button onClick={function() { setShowUnione('scegli'); setShowAssegna(false); }} style={{ background: '#8B5CF6', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>Unisci con altro tavolo</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: '13px', color: '#374151', padding: '6px 0' }}><strong>Cliente:</strong> {getNomeClienteTavolo(ts.tavolo_id)}</div>
              <button onClick={function() { rimuoviAssegnazione(ts.tavolo_id); setPannelloAperto(false); }} style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>Rimuovi assegnazione</button>
            </>
          )}
        </div>
        {showAssegna && (
          <div style={{ marginTop: '16px', borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '700', color: '#374151' }}>Assegna prenotazione</h4>
            <select value={assegnaPrenotazione || ''} onChange={function(e) { setAssegnaPrenotazione(e.target.value); }} style={{ width: '100%', padding: '9px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', marginBottom: '8px' }}>
              <option value="">-- Seleziona prenotazione --</option>
              {prenotazioni.map(function(p) {
                var nome = p.customer ? (p.customer.first_name + ' ' + p.customer.last_name) : 'Cliente';
                return <option key={p.id} value={p.id}>{nome} - {(p.adulti || 0) + (p.bambini || 0)} ospiti ({p.ora})</option>;
              })}
            </select>
            {prenotazioni.length === 0 && <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '0 0 8px 0' }}>Nessuna prenotazione per questo turno</p>}
            <input type="number" min="1" placeholder="N. ospiti a questo tavolo" value={assegnaOspiti} onChange={function(e) { setAssegnaOspiti(e.target.value); }} style={{ width: '100%', padding: '9px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', marginBottom: '10px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={confermaAssegna} style={{ flex: 1, background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '9px', fontSize: '13px', cursor: 'pointer', fontWeight: '700' }}>Conferma</button>
              <button onClick={function() { setShowAssegna(false); }} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px', fontSize: '13px', cursor: 'pointer' }}>Annulla</button>
            </div>
          </div>
        )}
        {showUnione === 'scegli' && (
          <div style={{ marginTop: '16px', borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '700', color: '#374151' }}>Unisci con:</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {layoutAttivo.filter(function(l) { return l.tavolo_id !== ts.tavolo_id; }).map(function(l) {
                var lbl = (l.etichetta && l.etichetta.trim()) ? l.etichetta.trim() : (l.tavolo ? l.tavolo.nome : 'Tavolo');
                return <button key={l.tavolo_id} onClick={function() { apriUnione(l.tavolo_id); }} style={{ background: '#faf5ff', border: '1px solid #c4b5fd', borderRadius: '6px', padding: '9px 12px', fontSize: '13px', cursor: 'pointer', textAlign: 'left', color: '#5B21B6', fontWeight: '600' }}>{lbl} ({l.tavolo ? l.tavolo.capacita : '-'} posti)</button>;
              })}
            </div>
            <button onClick={function() { setShowUnione(false); }} style={{ marginTop: '8px', width: '100%', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '7px', fontSize: '13px', cursor: 'pointer', color: '#6B7280' }}>Annulla</button>
          </div>
        )}
        {showUnione && showUnione !== 'scegli' && showUnione !== false && (
          <div style={{ marginTop: '16px', borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '700', color: '#374151' }}>Conferma unione</h4>
            <div style={{ fontSize: '13px', color: '#374151', marginBottom: '8px' }}>
              {(ts.etichetta || (ts.tavolo ? ts.tavolo.nome : '?'))}{' + '}{(function() { for (var i = 0; i < layoutAttivo.length; i++) { if (layoutAttivo[i].tavolo_id === showUnione) { return layoutAttivo[i].etichetta || (layoutAttivo[i].tavolo ? layoutAttivo[i].tavolo.nome : '?'); } } return '?'; })()}
            </div>
            <input type="number" min="1" value={unioneCapienza} onChange={function(e) { setUnioneCapienza(e.target.value); }} style={{ width: '100%', padding: '9px', border: '2px solid #8B5CF6', borderRadius: '6px', fontSize: '15px', fontWeight: '700', boxSizing: 'border-box', marginBottom: '10px', textAlign: 'center' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={confermaUnione} style={{ flex: 1, background: '#8B5CF6', color: 'white', border: 'none', borderRadius: '8px', padding: '9px', fontSize: '13px', cursor: 'pointer', fontWeight: '700' }}>Conferma</button>
              <button onClick={function() { setShowUnione(false); }} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px', fontSize: '13px', cursor: 'pointer' }}>Annulla</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── TAB EDITOR LAYOUT ─────────────────────────────────────────

  function renderTabEditor() {
    if (gridSize === null) return <div style={{ padding: '20px', color: '#6B7280' }}>Caricamento griglia...</div>;

    // FIX 1: costruiamo snapshot delle liste UNA VOLTA sola — nessuna closure stantia
    var tavoliNonInLayout = [];
    for (var i = 0; i < tavoli.length; i++) {
      var t = tavoli[i];
      var presente = false;
      for (var j = 0; j < layoutTemp.length; j++) { if (layoutTemp[j].tavolo_id === t.id) { presente = true; break; } }
      if (!presente) tavoliNonInLayout.push(t);
    }

    var tavoliDisponibili = tavoliNonInLayout.filter(function(t) {
      return contaIstanzeAlteSale(t.id, salaSelezionata) < (t.quantita || 1);
    });
    var tavoliAlteSale = tavoliNonInLayout.filter(function(t) {
      return contaIstanzeAlteSale(t.id, salaSelezionata) >= (t.quantita || 1);
    });
    var gruppi = raggruppaPerCategoria(tavoliDisponibili);

    return (
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <div>
          <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: '#6B7280' }}>Trascina i tavoli. [R] per ruotare.</span>
            {renderSliderGriglia()}
            {layoutModificato && <button onClick={salvaLayout} style={{ background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '14px', cursor: 'pointer', fontWeight: '700' }}>Salva layout</button>}
            <button onClick={function() { setShowSalvaBase(true); setNomeLayoutBase(''); setDescLayoutBase(''); }} style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>📐 Salva come layout base</button>
          </div>
          {renderLegendaOstacoli()}
          {/* FIX 3: viewport con doppia scrollbar */}
          <div style={stileViewport()}>
            <div ref={gridRef} onMouseMove={onMouseMoveGrid} onMouseUp={onMouseUpGrid} onMouseLeave={onMouseUpGrid} style={stileCanvas()}>
              {renderOverlayOstacoli(false)}
              {layoutTemp.map(function(item) { return renderTavoloGriglia(item, true); })}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '250px', maxWidth: '280px' }}>
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
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '700', color: '#374151' }}>
              Tipologie disponibili
              {tavoliDisponibili.length > 0 && <span style={{ color: '#9CA3AF', fontWeight: '400', fontSize: '12px', marginLeft: '6px' }}>({tavoliDisponibili.length})</span>}
            </h4>

            {gruppi.length === 0 && tavoliAlteSale.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#9CA3AF', margin: 0 }}>Tutte le tipologie sono in sala</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {gruppi.map(function(gruppo) {
                  var catKey = gruppo.categoria;
                  var espanso = gruppiEspansi[catKey];
                  // FIX 1: snapshot locale di disponibili per questo gruppo
                  var dispGruppo = [];
                  for (var gi = 0; gi < gruppo.tavoli.length; gi++) {
                    var gt = gruppo.tavoli[gi];
                    var inLay = false;
                    for (var li = 0; li < layoutTemp.length; li++) { if (layoutTemp[li].tavolo_id === gt.id) { inLay = true; break; } }
                    if (!inLay) dispGruppo.push(Object.assign({}, gt));
                  }
                  var dispSnap = dispGruppo.slice();
                  return (
                    <div key={catKey} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', background: '#f9fafb', cursor: 'pointer' }} onClick={function() { toggleGruppo(catKey); }}>
                        <span style={{ fontSize: '11px', color: '#6B7280', transform: espanso ? 'rotate(90deg)' : 'none', display: 'inline-block', flexShrink: 0 }}>▶</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{catKey}</div>
                          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{dispGruppo.length} di {gruppo.tavoli.length} disponibili</div>
                        </div>
                        {dispGruppo.length > 1 && (
                          <button onClick={function(e) { e.stopPropagation(); aggiungiGruppoAlLayout(dispSnap); }} style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '5px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: '700', flexShrink: 0 }}>++ Tutti</button>
                        )}
                      </div>
                      {espanso && (
                        <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {gruppo.tavoli.map(function(t) {
                            var tSnap = Object.assign({}, t);
                            var inLayout = false;
                            for (var li = 0; li < layoutTemp.length; li++) { if (layoutTemp[li].tavolo_id === t.id) { inLayout = true; break; } }
                            var istanzeAlteSale = contaIstanzeAlteSale(t.id, salaSelezionata);
                            var quantita = t.quantita || 1;
                            var usate = (inLayout ? 1 : 0) + istanzeAlteSale;
                            return (
                              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 8px', background: inLayout ? '#f0fdf4' : '#f9fafb', borderRadius: '6px', border: '1px solid ' + (inLayout ? '#bbf7d0' : '#e5e7eb'), opacity: inLayout ? 0.6 : 1 }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: t.forma === 'rotondo' ? '50%' : '2px', background: t.colore || '#6B7280', flexShrink: 0 }}></div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</div>
                                  <div style={{ fontSize: '10px', color: '#9CA3AF' }}>{t.capacita} posti &middot; {usate}/{quantita} usati</div>
                                </div>
                                {inLayout
                                  ? <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: '600' }}>in sala</span>
                                  : <button onClick={function() { richiediEtichettaEAggiungi(tSnap); }} style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '5px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: '700' }}>+</button>
                                }
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tavoliAlteSale.length > 0 && (
              <div style={{ marginTop: '12px', borderTop: '1px solid #f3f4f6', paddingTop: '12px' }}>
                <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Esaurite</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {tavoliAlteSale.map(function(t) {
                    return (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 8px', background: '#fafafa', borderRadius: '6px', border: '1px solid #f3f4f6', opacity: 0.7 }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: t.forma === 'rotondo' ? '50%' : '2px', background: t.colore || '#6B7280', flexShrink: 0 }}></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#6B7280' }}>{t.nome}</div>
                          <div style={{ fontSize: '10px', color: '#9CA3AF' }}>{contaIstanzeAlteSale(t.id, salaSelezionata)}/{t.quantita || 1} usate</div>
                        </div>
                        <span style={{ fontSize: '10px', color: '#9CA3AF' }}>esaurita</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                  <input type="text" value={nomeLayoutBase} onChange={function(e) { setNomeLayoutBase(e.target.value); }} autoFocus placeholder="es. Configurazione standard..." style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Descrizione (opzionale)</label>
                  <input type="text" value={descLayoutBase} onChange={function(e) { setDescLayoutBase(e.target.value); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button onClick={salvaLayoutBaseCorrente} disabled={salvaBaseLoading} style={{ flex: 1, background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '15px', cursor: 'pointer', fontWeight: '800', opacity: salvaBaseLoading ? 0.6 : 1 }}>{salvaBaseLoading ? 'Salvataggio...' : 'Salva layout base'}</button>
                <button onClick={function() { setShowSalvaBase(false); }} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '12px', fontSize: '15px', cursor: 'pointer' }}>Annulla</button>
              </div>
            </div>
          </div>
        )}

        {showModaleEtichetta && tavoloInAttesaEtichetta && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '360px', maxWidth: '100%' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '800', color: '#111827' }}>Etichetta tavolo</h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#6B7280' }}>Tipologia: <strong>{tavoloInAttesaEtichetta.nome}</strong><br />Etichetta visibile sulla mappa (es. T50). Lascia vuoto per usare il nome.</p>
              <input type="text" value={etichettaInput} onChange={function(e) { setEtichettaInput(e.target.value); }} onKeyDown={function(e) { if (e.key === 'Enter') confermAggiungiConEtichetta(); }} autoFocus placeholder="es. T50, T51, VIP1..." style={{ width: '100%', padding: '12px', border: '2px solid #3B82F6', borderRadius: '8px', fontSize: '15px', fontWeight: '700', boxSizing: 'border-box', textAlign: 'center', marginBottom: '16px' }} />
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
    var tipoAttivo = getTipoOstacolo(tipoOstacoloAttivo);
    var isServizio = tipoOstacoloAttivo === 'servizio';

    function handleMouseDown(e) {
      e.preventDefault();
      var cella = cellaFromEvent(e, gridOstacoliRef);
      if (isServizio) {
        setDraggingServizio(true); setServizioInizio(cella); setServizioFine(cella);
      } else {
        var esistente = getOstacoloACella(cella.x, cella.y);
        if (esistente && !isDraggingOstacolo) {
          supabase.from('ostacoli_sala').delete().eq('id', esistente.id).then(function() {
            setOstacoli(function(prev) { return prev.filter(function(o) { return o.id !== esistente.id; }); });
          });
          return;
        }
        setIsDraggingOstacolo(true); setDragOstacoloStart(cella); setDragOstacoloEnd(cella);
      }
    }

    function handleMouseMove(e) {
      if (!gridOstacoliRef.current) return;
      var cella = cellaFromEvent(e, gridOstacoliRef);
      if (isServizio && draggingServizio) { setServizioFine(cella); return; }
      if (isDraggingOstacolo) setDragOstacoloEnd(cella);
    }

    // FIX 5: al mouseup, se e' un drag (non un click singolo) apre il dialog lunghezza
    function handleMouseUp(e) {
      if (isServizio && draggingServizio) {
        if (servizioInizio && servizioFine) {
          var dx = Math.abs(servizioFine.x - servizioInizio.x);
          var dy = Math.abs(servizioFine.y - servizioInizio.y);
          if (dx === 0 && dy === 0) {
            // click singolo: applica subito
            applicaServizio(servizioInizio.x, servizioInizio.y, servizioFine.x, servizioFine.y);
            setDraggingServizio(false); setServizioInizio(null); setServizioFine(null);
          } else {
            // drag: chiedi lunghezza
            setPendingDragInfo({ x1: servizioInizio.x, y1: servizioInizio.y, x2raw: servizioFine.x, y2raw: servizioFine.y, tipo: 'servizio' });
            setDraggingServizio(false); setServizioInizio(null); setServizioFine(null);
            setDialogLunghezza('');
            setShowDialogLunghezza(true);
          }
        }
        return;
      }
      if (isDraggingOstacolo && dragOstacoloStart && dragOstacoloEnd) {
        var ddx = Math.abs(dragOstacoloEnd.x - dragOstacoloStart.x);
        var ddy = Math.abs(dragOstacoloEnd.y - dragOstacoloStart.y);
        if (ddx === 0 && ddy === 0) {
          // click singolo
          toggleOstacolo(dragOstacoloStart.x, dragOstacoloStart.y);
          setIsDraggingOstacolo(false); setDragOstacoloStart(null); setDragOstacoloEnd(null);
        } else {
          // drag: chiedi lunghezza
          setPendingDragInfo({ x1: dragOstacoloStart.x, y1: dragOstacoloStart.y, x2raw: dragOstacoloEnd.x, y2raw: dragOstacoloEnd.y, tipo: 'normale' });
          setIsDraggingOstacolo(false); setDragOstacoloStart(null); setDragOstacoloEnd(null);
          setDialogLunghezza('');
          setShowDialogLunghezza(true);
        }
      }
    }

    // preview area drag
    function renderPreviewDrag() {
      var start = isDraggingOstacolo ? dragOstacoloStart : (draggingServizio ? servizioInizio : null);
      var end   = isDraggingOstacolo ? dragOstacoloEnd   : (draggingServizio ? servizioFine   : null);
      if (!start || !end) return null;
      if (start.x === end.x && start.y === end.y) return null;
      var tipo = isServizio ? getTipoOstacolo('servizio') : tipoAttivo;
      if (!tipo) return null;
      var minX = Math.min(start.x, end.x); var maxX = Math.max(start.x, end.x);
      var minY = Math.min(start.y, end.y); var maxY = Math.max(start.y, end.y);
      var cellCount = (maxX - minX + 1) * (maxY - minY + 1);
      return (
        <div style={{ position: 'absolute', left: (minX * gridSize) + 'px', top: (minY * gridSize) + 'px', width: ((maxX - minX + 1) * gridSize) + 'px', height: ((maxY - minY + 1) * gridSize) + 'px', background: tipo.colore, opacity: 0.35, zIndex: 20, pointerEvents: 'none', border: '2px dashed ' + tipo.colore, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ background: 'white', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', fontWeight: '700', color: '#374151' }}>{cellCount} celle</span>
        </div>
      );
    }

    return (
      <div>
        <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {renderSliderGriglia()}
          <button onClick={cancellaOstacoliSala} style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>🗑 Cancella tutto</button>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {TIPI_OSTACOLO.map(function(tipo) {
            var sel = tipoOstacoloAttivo === tipo.value;
            return (
              <button key={tipo.value} onClick={function() { setTipoOstacoloAttivo(tipo.value); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: sel ? '2px solid #111827' : '2px solid #e5e7eb', background: sel ? tipo.colore : 'white', color: sel ? 'white' : '#374151', cursor: 'pointer', fontSize: '13px', fontWeight: sel ? '700' : '500' }}>
                <div style={{ width: '12px', height: '12px', background: sel ? 'rgba(255,255,255,0.6)' : tipo.colore, borderRadius: tipo.value === 'colonna' ? '50%' : '2px', flexShrink: 0 }}></div>
                {tipo.label}
                {!tipo.blocca && <span style={{ fontSize: '10px', opacity: 0.8 }}>(non blocca)</span>}
              </button>
            );
          })}
        </div>
        <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '8px', padding: '8px 14px', marginBottom: '14px', fontSize: '12px', color: '#92400E' }}>
          Click = cella singola. Trascina = area: dopo il rilascio ti chiede la lunghezza esatta in celle.
          {tipoAttivo && !tipoAttivo.blocca && ' — Le aperture non bloccano il posizionamento tavoli.'}
        </div>

        <div style={stileViewport()}>
          <div ref={gridOstacoliRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            style={Object.assign({}, stileCanvas(), { cursor: 'crosshair', userSelect: 'none' })}
          >
            {renderOverlayOstacoli(true)}
            {renderPreviewDrag()}
          </div>
        </div>

        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {TIPI_OSTACOLO.map(function(tipo) {
            var n = 0;
            for (var i = 0; i < ostacoli.length; i++) { if (ostacoli[i].tipo === tipo.value) n++; }
            if (n === 0) return null;
            return (
              <div key={tipo.value} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', color: '#374151' }}>
                <div style={{ width: '10px', height: '10px', background: tipo.colore, borderRadius: tipo.value === 'colonna' ? '50%' : '2px' }}></div>
                {tipo.label}: <strong>{n}</strong> celle
              </div>
            );
          })}
        </div>

        {/* FIX 5: dialog lunghezza linea */}
        {showDialogLunghezza && pendingDragInfo && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '340px', maxWidth: '100%' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '800', color: '#111827' }}>Lunghezza linea</h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#6B7280' }}>
                Hai trascinato {Math.abs(pendingDragInfo.x2raw - pendingDragInfo.x1) + Math.abs(pendingDragInfo.y2raw - pendingDragInfo.y1) + 1} celle circa.<br />
                Inserisci la lunghezza esatta (in celle) oppure premi Conferma per usare il drag.
              </p>
              <input
                type="number" min="1" max="300"
                value={dialogLunghezza}
                onChange={function(e) { setDialogLunghezza(e.target.value); }}
                onKeyDown={function(e) { if (e.key === 'Enter') confermaDireLunghezza(); }}
                autoFocus
                placeholder="es. 13 celle"
                style={{ width: '100%', padding: '12px', border: '2px solid #3B82F6', borderRadius: '8px', fontSize: '20px', fontWeight: '700', boxSizing: 'border-box', textAlign: 'center', marginBottom: '16px' }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={confermaDireLunghezza} style={{ flex: 1, background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '15px', cursor: 'pointer', fontWeight: '800' }}>Conferma</button>
                <button onClick={annullaDireLunghezza} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '12px', fontSize: '15px', cursor: 'pointer' }}>Annulla</button>
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
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#374151' }}>Tipologie tavoli ({tavoli.length})</h3>
          <button onClick={function() { apriFormTavolo(null); }} style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '14px', cursor: 'pointer', fontWeight: '700' }}>+ Nuova tipologia</button>
        </div>
        <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', fontSize: '13px', color: '#1E40AF', lineHeight: '1.6' }}>
          <strong>Come funzionano le tipologie:</strong> Definisci il tipo di tavolo e quante unita fisiche hai. Nell\'Editor layout aggiungi ogni istanza con un\'etichetta (es. T50, T51).
        </div>
        {tavoli.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '12px', border: '1px dashed #d1d5db' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🪑</div>
            <p style={{ fontSize: '15px', color: '#6B7280', margin: '0 0 16px 0' }}>Nessuna tipologia ancora. Crea la prima!</p>
            <button onClick={function() { apriFormTavolo(null); }} style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer', fontWeight: '700' }}>+ Crea prima tipologia</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {gruppi.map(function(gruppo) {
              return (
                <div key={gruppo.categoria}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{gruppo.categoria}</div>
                    <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }}></div>
                    <div style={{ fontSize: '12px', color: '#9CA3AF' }}>{gruppo.tavoli.length} tipologi{gruppo.tavoli.length === 1 ? 'a' : 'e'}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px' }}>
                    {gruppo.tavoli.map(function(t) {
                      var istanzeUsate = (tavoliOccupati[t.id] || []).length;
                      var quantita = t.quantita || 1;
                      return (
                        <div key={t.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <div style={{ width: '36px', height: '28px', borderRadius: t.forma === 'rotondo' ? '50%' : '5px', background: t.colore || '#6B7280', flexShrink: 0 }}></div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: '800', fontSize: '15px', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</div>
                              <div style={{ fontSize: '12px', color: '#6B7280' }}>{t.forma} — {t.capacita} posti</div>
                            </div>
                          </div>
                          <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '6px' }}>Griglia: {t.larghezza} x {t.altezza} celle{t.note ? (' — ' + t.note) : ''}</div>
                          <div style={{ fontSize: '12px', marginBottom: '12px', padding: '6px 10px', background: istanzeUsate >= quantita ? '#FEF2F2' : '#F0FDF4', border: '1px solid ' + (istanzeUsate >= quantita ? '#FECACA' : '#BBF7D0'), borderRadius: '6px', color: istanzeUsate >= quantita ? '#DC2626' : '#166534', fontWeight: '600' }}>
                            {istanzeUsate}/{quantita} unita usate{istanzeUsate >= quantita ? ' — ESAURITA' : (' — ' + (quantita - istanzeUsate) + ' dispon.')}
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={function() { apriFormTavolo(t); }} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '7px', padding: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>Modifica</button>
                            <button onClick={function() { duplicaTavolo(t); }} style={{ background: '#eff6ff', color: '#3B82F6', border: '1px solid #bfdbfe', borderRadius: '7px', padding: '7px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: '700' }}>⧉</button>
                            <button onClick={function() { eliminaTavolo(t); }} style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '7px', padding: '7px 10px', fontSize: '12px', cursor: 'pointer' }}>x</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showFormTavolo && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '440px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '800', color: '#111827' }}>{tavoloInEditing ? 'Modifica tipologia' : 'Nuova tipologia'}</h3>
              <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center', padding: '20px', background: '#f9fafb', borderRadius: '10px', minHeight: '80px', alignItems: 'center' }}>
                <div style={{ width: (formTavolo.larghezza * 40) + 'px', height: (formTavolo.altezza * 40) + 'px', background: formTavolo.colore || '#6B7280', borderRadius: formTavolo.forma === 'rotondo' ? '50%' : '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: '800', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{formTavolo.nome || '-'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Nome tipologia *</label>
                  <input type="text" value={formTavolo.nome} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { nome: e.target.value })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} placeholder="es. Rovere 90x90..." />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Quantita disponibili *</label>
                  <input type="number" min="1" max="100" value={formTavolo.quantita} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { quantita: parseInt(e.target.value) || 1 })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                  <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '3px' }}>Quante unita fisiche hai (es. 13)</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Capienza (posti)</label>
                    <input type="number" min="1" max="30" value={formTavolo.capacita} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { capacita: parseInt(e.target.value) || 1 })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
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
                    <input type="number" min="1" max="8" value={formTavolo.larghezza} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { larghezza: parseInt(e.target.value) || 1 })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Altezza (celle)</label>
                    <input type="number" min="1" max="5" value={formTavolo.altezza} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { altezza: parseInt(e.target.value) || 1 })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
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
    { key: 'mappa',        label: 'Mappa servizio',     admin: false },
    { key: 'editor',       label: 'Editor layout',      admin: true  },
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

      {(tab === 'mappa' || tab === 'editor' || tab === 'ostacoli') && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {sale.map(function(s) {
              return (
                <button key={s.id} onClick={function() { setSalaSelezionata(s.id); setPannelloAperto(false); }} style={{ padding: '8px 16px', borderRadius: '8px', border: '2px solid', fontSize: '14px', cursor: 'pointer', fontWeight: '700', background: salaSelezionata === s.id ? '#1D4ED8' : 'white', color: salaSelezionata === s.id ? 'white' : '#374151', borderColor: salaSelezionata === s.id ? '#1D4ED8' : '#d1d5db' }}>{s.nome}</button>
              );
            })}
          </div>
          {(tab === 'mappa' || tab === 'editor') && (
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
            </>
          )}
        </div>
      )}

      {tab === 'mappa'        && renderTabMappa()}
      {tab === 'editor'       && isAdmin && renderTabEditor()}
      {tab === 'ostacoli'     && isAdmin && renderTabOstacoli()}
      {tab === 'gestione'     && isAdmin && renderTabGestione()}
      {tab === 'impostazioni' && isAdmin && renderTabImpostazioni()}
    </div>
  );
}
