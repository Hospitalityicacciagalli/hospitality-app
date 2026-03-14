import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

var GRID_SIZE = 60;
var GRID_COLS = 16;
var GRID_ROWS = 10;

var COLORI_TAVOLO = [
  { label: 'Grigio', value: '#6B7280' },
  { label: 'Blu', value: '#3B82F6' },
  { label: 'Verde', value: '#10B981' },
  { label: 'Arancio', value: '#F59E0B' },
  { label: 'Rosa', value: '#EC4899' },
  { label: 'Viola', value: '#8B5CF6' },
  { label: 'Rosso', value: '#EF4444' },
  { label: 'Giallo', value: '#EAB308' }
];

function labelStato(stato) {
  if (stato === 'occupato') return 'Occupato';
  if (stato === 'prenotato') return 'Prenotato';
  return 'Libero';
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
      sedie.push(
        <circle key={i} cx={cx} cy={cy} r={sedieSize / 2} fill={colore} opacity="0.7" />
      );
    }
  } else {
    var top = Math.ceil(capacita / 4);
    var bottom = Math.ceil(capacita / 4);
    var left = Math.floor(capacita / 4);
    var right = capacita - top - bottom - left;
    if (right < 0) right = 0;
    var pad = sedieSize + gap;

    function sedieLinea(n, x1, y1, x2, y2) {
      for (var j = 0; j < n; j++) {
        var t = n > 1 ? j / (n - 1) : 0.5;
        var sx = x1 + t * (x2 - x1);
        var sy = y1 + t * (y2 - y1);
        sedie.push(
          <rect key={'s' + x1 + '' + y1 + '' + j} x={sx - sedieSize / 2} y={sy - sedieSize / 2} width={sedieSize} height={sedieSize} rx="2" fill={colore} opacity="0.7" />
        );
      }
    }

    if (top > 0) sedieLinea(top, pad, -sedieSize / 2 - gap, w - pad, -sedieSize / 2 - gap);
    if (bottom > 0) sedieLinea(bottom, pad, h + sedieSize / 2 + gap, w - pad, h + sedieSize / 2 + gap);
    if (left > 0) sedieLinea(left, -sedieSize / 2 - gap, pad, -sedieSize / 2 - gap, h - pad);
    if (right > 0) sedieLinea(right, w + sedieSize / 2 + gap, pad, w + sedieSize / 2 + gap, h - pad);
  }

  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }} width={w} height={h}>
      {sedie}
    </svg>
  );
}

export default function SalePage() {
  var { userRole } = useAuth();
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

  var [draggingTavolo, setDraggingTavolo] = useState(null);
  var [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  var [tavoloSelezionato, setTavoloSelezionato] = useState(null);
  var [pannelloAperto, setPannelloAperto] = useState(false);
  var [showAssegna, setShowAssegna] = useState(false);
  var [assegnaPrenotazione, setAssegnaPrenotazione] = useState(null);
  var [assegnaOspiti, setAssegnaOspiti] = useState(0);
  var [showUnione, setShowUnione] = useState(false);

  var [showFormTavolo, setShowFormTavolo] = useState(false);
  var [tavoloInEditing, setTavoloInEditing] = useState(null);
  var [formTavolo, setFormTavolo] = useState({ nome: '', capacita: 4, forma: 'rettangolo', larghezza: 2, altezza: 1, colore: '#6B7280', note: '' });

  var [showFormSala, setShowFormSala] = useState(false);
  var [salaInEditing, setSalaInEditing] = useState(null);
  var [formSala, setFormSala] = useState({ nome: '', ordine: 1 });

  var gridRef = useRef(null);

  useEffect(function() {
    caricaSale();
    caricaTavoli();
  }, []);

  useEffect(function() {
    if (salaSelezionata) caricaLayout(salaSelezionata);
  }, [salaSelezionata, dataSelezionata]);

  useEffect(function() {
    if (salaSelezionata && dataSelezionata && turnoSelezionato) {
      caricaTavoliUniti();
      caricaPrenotazioni();
      caricaTavoliPrenotazioni();
    }
  }, [salaSelezionata, dataSelezionata, turnoSelezionato]);

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
      (result.data || []).forEach(function(r) {
        if (!visti[r.tavolo_id]) { visti[r.tavolo_id] = true; layout.push(r); }
      });
      setLayoutAttivo(layout);
      setLayoutTemp(layout.map(function(r) { return Object.assign({}, r); }));
    });
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
    var pren = prenotazioni.find(function(p) { return assegnazioni.some(function(a) { return a.prenotazione_id === p.id; }); });
    if (!pren) return 'libero';
    if (pren.stato === 'arrivato' || pren.stato === 'al_tavolo') return 'occupato';
    return 'prenotato';
  }

  function getNomeClienteTavolo(tavoloId) {
    var a = tavoliPrenotazioni.find(function(tp) { return tp.tavolo_id === tavoloId; });
    if (!a) return null;
    var p = prenotazioni.find(function(x) { return x.id === a.prenotazione_id; });
    if (!p) return null;
    return p.customer ? (p.customer.first_name + ' ' + p.customer.last_name) : 'Cliente';
  }

  function getOspitiAssegnatiTavolo(tavoloId) {
    return tavoliPrenotazioni.filter(function(tp) { return tp.tavolo_id === tavoloId; }).reduce(function(s, tp) { return s + (tp.n_ospiti_assegnati || 0); }, 0);
  }

  function isTavoloUnito(tavoloId) {
    return tavoliUniti.some(function(u) { return u.tavolo_secondario_id === tavoloId || u.tavolo_principale_id === tavoloId; });
  }

  function onMouseDownTavolo(e, layoutItem) {
    e.preventDefault();
    var rect = gridRef.current.getBoundingClientRect();
    setDraggingTavolo(layoutItem.tavolo_id);
    setDragOffset({ x: e.clientX - rect.left - layoutItem.pos_x * GRID_SIZE, y: e.clientY - rect.top - layoutItem.pos_y * GRID_SIZE });
  }

  function onMouseMoveGrid(e) {
    if (!draggingTavolo) return;
    var rect = gridRef.current.getBoundingClientRect();
    var col = Math.max(0, Math.min(GRID_COLS - 1, Math.round((e.clientX - rect.left - dragOffset.x) / GRID_SIZE)));
    var row = Math.max(0, Math.min(GRID_ROWS - 1, Math.round((e.clientY - rect.top - dragOffset.y) / GRID_SIZE)));
    setLayoutTemp(function(prev) {
      return prev.map(function(item) {
        if (item.tavolo_id === draggingTavolo) return Object.assign({}, item, { pos_x: col, pos_y: row });
        return item;
      });
    });
    setLayoutModificato(true);
  }

  function onMouseUpGrid() { setDraggingTavolo(null); }

  function aggiungiTavoloAlLayout(tavolo) {
    if (layoutTemp.some(function(l) { return l.tavolo_id === tavolo.id; })) return;
    setLayoutTemp(function(prev) {
      return prev.concat([{ id: null, sala_id: salaSelezionata, tavolo_id: tavolo.id, tavolo: tavolo, pos_x: 0, pos_y: 0, rotazione: 0, data_validita_dal: dataSelezionata, nuovo: true }]);
    });
    setLayoutModificato(true);
  }

  function rimuoviDalLayout(tavoloId) {
    setLayoutTemp(function(prev) { return prev.filter(function(l) { return l.tavolo_id !== tavoloId; }); });
    setLayoutModificato(true);
  }

  function salvaLayout() {
    var oggi = new Date().toISOString().split('T')[0];
    Promise.all(layoutTemp.map(function(item) {
      return supabase.from('layout_sala').insert({ sala_id: salaSelezionata, tavolo_id: item.tavolo_id, pos_x: item.pos_x, pos_y: item.pos_y, rotazione: item.rotazione || 0, data_validita_dal: oggi });
    })).then(function() {
      setLayoutModificato(false);
      caricaLayout(salaSelezionata);
      alert('Layout salvato correttamente!');
    });
  }

  function apriFormTavolo(tavolo) {
    if (tavolo) {
      setTavoloInEditing(tavolo);
      setFormTavolo({ nome: tavolo.nome, capacita: tavolo.capacita, forma: tavolo.forma, larghezza: tavolo.larghezza, altezza: tavolo.altezza, colore: tavolo.colore, note: tavolo.note || '' });
    } else {
      setTavoloInEditing(null);
      setFormTavolo({ nome: '', capacita: 4, forma: 'rettangolo', larghezza: 2, altezza: 1, colore: '#6B7280', note: '' });
    }
    setShowFormTavolo(true);
  }

  function salvaTavolo() {
    if (!formTavolo.nome.trim()) { alert('Inserisci il nome del tavolo'); return; }
    var dati = { nome: formTavolo.nome.trim(), capacita: parseInt(formTavolo.capacita) || 4, forma: formTavolo.forma, larghezza: parseInt(formTavolo.larghezza) || 2, altezza: parseInt(formTavolo.altezza) || 1, colore: formTavolo.colore, note: formTavolo.note };
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

  function eliminaTavolo(tavolo) {
    if (!window.confirm('Eliminare il tavolo "' + tavolo.nome + '"? Verra rimosso da tutti i layout.')) return;
    supabase.from('tavoli').update({ attivo: false }).eq('id', tavolo.id).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); return; }
      caricaTavoli(); caricaLayout(salaSelezionata);
    });
  }

  function apriFormSala(sala) {
    if (sala) {
      setSalaInEditing(sala);
      setFormSala({ nome: sala.nome, ordine: sala.ordine });
    } else {
      setSalaInEditing(null);
      setFormSala({ nome: '', ordine: sale.length + 1 });
    }
    setShowFormSala(true);
  }

  function salvaSala() {
    if (!formSala.nome.trim()) { alert('Inserisci il nome della sala'); return; }
    var dati = { nome: formSala.nome.trim(), ordine: parseInt(formSala.ordine) || 1, attiva: true };
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
    if (!window.confirm('Disattivare la sala "' + sala.nome + '"? Sparira dal menu ma i dati restano.')) return;
    supabase.from('sale').update({ attiva: false }).eq('id', sala.id).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); return; }
      caricaSale();
    });
  }

  function confermaUnione(tavoloSecondarioId) {
    supabase.from('tavoli_uniti').insert({ tavolo_principale_id: tavoloSelezionato.tavolo_id, tavolo_secondario_id: tavoloSecondarioId, data: dataSelezionata, turno: turnoSelezionato, attivo: true }).then(function(result) {
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

  function renderTavoloGriglia(layoutItem, editorMode) {
    var t = layoutItem.tavolo;
    if (!t) return null;

    var w = (t.larghezza || 2) * GRID_SIZE - 4;
    var h = (t.altezza || 1) * GRID_SIZE - 4;
    var x = layoutItem.pos_x * GRID_SIZE + 2;
    var y = layoutItem.pos_y * GRID_SIZE + 2;
    var stato = editorMode ? 'libero' : getStatoTavolo(layoutItem.tavolo_id);
    var nomeCliente = editorMode ? null : getNomeClienteTavolo(layoutItem.tavolo_id);
    var ospiti = editorMode ? 0 : getOspitiAssegnatiTavolo(layoutItem.tavolo_id);
    var unito = !editorMode && isTavoloUnito(layoutItem.tavolo_id);
    var isRound = t.forma === 'rotondo';
    var bgColor = editorMode ? (t.colore || '#6B7280') : (stato === 'occupato' ? '#EF4444' : stato === 'prenotato' ? '#F59E0B' : '#10B981');
    var pad = mostraSedie ? 14 : 0;

    return (
      <div
        key={layoutItem.tavolo_id}
        onMouseDown={editorMode ? function(e) { onMouseDownTavolo(e, layoutItem); } : undefined}
        onClick={!editorMode ? function() { setTavoloSelezionato(layoutItem); setShowAssegna(false); setShowUnione(false); setAssegnaPrenotazione(null); setAssegnaOspiti(0); setPannelloAperto(true); } : undefined}
        style={{ position: 'absolute', left: (x - pad) + 'px', top: (y - pad) + 'px', width: (w + pad * 2) + 'px', height: (h + pad * 2) + 'px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: editorMode ? 'grab' : 'pointer', userSelect: 'none', zIndex: draggingTavolo === layoutItem.tavolo_id ? 50 : 10 }}
      >
        {mostraSedie && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <SedieSVG w={w + pad * 2} h={h + pad * 2} capacita={t.capacita} forma={t.forma} colore={editorMode ? (t.colore || '#6B7280') : bgColor} />
          </div>
        )}
        <div style={{ position: 'relative', width: w + 'px', height: h + 'px', backgroundColor: bgColor, borderRadius: isRound ? '50%' : '8px', boxShadow: unito ? '0 0 0 3px #7C3AED' : '0 2px 6px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', overflow: 'hidden' }}>
          <span style={{ fontSize: '12px', fontWeight: '800', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{t.nome}</span>
          {!editorMode && nomeCliente && <span style={{ fontSize: '9px', opacity: 0.95, textAlign: 'center', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>{nomeCliente}</span>}
          {!editorMode && ospiti > 0 && <span style={{ fontSize: '9px', opacity: 0.85, marginTop: '1px' }}>{ospiti} osp.</span>}
          {!editorMode && stato === 'libero' && <span style={{ fontSize: '9px', opacity: 0.8 }}>{t.capacita} posti</span>}
          {editorMode && (
            <button
              onMouseDown={function(e) { e.stopPropagation(); }}
              onClick={function(e) { e.stopPropagation(); rimuoviDalLayout(layoutItem.tavolo_id); }}
              style={{ position: 'absolute', top: '2px', right: '3px', background: 'rgba(0,0,0,0.35)', border: 'none', color: 'white', borderRadius: '50%', width: '15px', height: '15px', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', lineHeight: 1 }}
            >x</button>
          )}
        </div>
      </div>
    );
  }

  function renderTabMappa() {
    var liberi = layoutAttivo.filter(function(l) { return getStatoTavolo(l.tavolo_id) === 'libero'; }).length;
    var occupati = layoutAttivo.filter(function(l) { return getStatoTavolo(l.tavolo_id) === 'occupato'; }).length;
    var prenotati = layoutAttivo.filter(function(l) { return getStatoTavolo(l.tavolo_id) === 'prenotato'; }).length;

    return (
      <div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {[['#10B981', liberi, 'liberi'], ['#F59E0B', prenotati, 'prenotati'], ['#EF4444', occupati, 'occupati']].map(function(item) {
            return (
              <div key={item[2]} style={{ background: 'white', borderRadius: '8px', padding: '10px 16px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: item[0] }}></div>
                <span style={{ fontSize: '13px', color: '#374151' }}><strong>{item[1]}</strong> {item[2]}</span>
              </div>
            );
          })}
          <button
            onClick={function() { setMostraSedie(!mostraSedie); }}
            style={{ background: mostraSedie ? '#1D4ED8' : 'white', color: mostraSedie ? 'white' : '#374151', border: '1px solid ' + (mostraSedie ? '#1D4ED8' : '#d1d5db'), borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}
          >🪑 Sedie {mostraSedie ? 'ON' : 'OFF'}</button>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ position: 'relative', width: GRID_COLS * GRID_SIZE + 'px', height: GRID_ROWS * GRID_SIZE + 'px', backgroundImage: 'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)', backgroundSize: GRID_SIZE + 'px ' + GRID_SIZE + 'px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #d1d5db', overflow: 'visible', flexShrink: 0 }}>
              {layoutAttivo.map(function(item) { return renderTavoloGriglia(item, false); })}
            </div>
          </div>

          {pannelloAperto && tavoloSelezionato && (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', minWidth: '280px', maxWidth: '320px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#111827' }}>{tavoloSelezionato.tavolo ? tavoloSelezionato.tavolo.nome : 'Tavolo'}</h3>
                <button onClick={function() { setPannelloAperto(false); setShowAssegna(false); setShowUnione(false); }} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 }}>x</button>
              </div>
              {tavoloSelezionato.tavolo && (
                <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#f9fafb', borderRadius: '8px', fontSize: '13px', color: '#374151', lineHeight: '1.7' }}>
                  <div>Capienza: <strong>{tavoloSelezionato.tavolo.capacita} posti</strong></div>
                  <div>Stato: <strong style={{ color: getStatoTavolo(tavoloSelezionato.tavolo_id) === 'occupato' ? '#EF4444' : getStatoTavolo(tavoloSelezionato.tavolo_id) === 'prenotato' ? '#D97706' : '#059669' }}>{labelStato(getStatoTavolo(tavoloSelezionato.tavolo_id))}</strong></div>
                  {getOspitiAssegnatiTavolo(tavoloSelezionato.tavolo_id) > 0 && <div>Ospiti assegnati: <strong>{getOspitiAssegnatiTavolo(tavoloSelezionato.tavolo_id)}</strong></div>}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {getStatoTavolo(tavoloSelezionato.tavolo_id) === 'libero' ? (
                  <>
                    <button onClick={function() { setShowAssegna(true); setShowUnione(false); }} style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>+ Assegna prenotazione</button>
                    <button onClick={function() { setShowUnione(true); setShowAssegna(false); }} style={{ background: '#8B5CF6', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>Unisci con altro tavolo</button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '13px', color: '#374151', padding: '6px 0' }}><strong>Cliente:</strong> {getNomeClienteTavolo(tavoloSelezionato.tavolo_id)}</div>
                    <button onClick={function() { rimuoviAssegnazione(tavoloSelezionato.tavolo_id); setPannelloAperto(false); }} style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>Rimuovi assegnazione</button>
                  </>
                )}
              </div>
              {showAssegna && (
                <div style={{ marginTop: '16px', borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '700', color: '#374151' }}>Assegna prenotazione</h4>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '4px', fontWeight: '600' }}>Prenotazione</label>
                    <select value={assegnaPrenotazione || ''} onChange={function(e) { setAssegnaPrenotazione(e.target.value); }} style={{ width: '100%', padding: '9px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}>
                      <option value="">-- Seleziona --</option>
                      {prenotazioni.map(function(p) {
                        var nome = p.customer ? (p.customer.first_name + ' ' + p.customer.last_name) : 'Cliente';
                        return <option key={p.id} value={p.id}>{nome} - {(p.adulti || 0) + (p.bambini || 0)} ospiti ({p.ora})</option>;
                      })}
                    </select>
                    {prenotazioni.length === 0 && <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '4px 0 0 0' }}>Nessuna prenotazione per questo turno</p>}
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '4px', fontWeight: '600' }}>N. ospiti a questo tavolo</label>
                    <input type="number" min="1" value={assegnaOspiti} onChange={function(e) { setAssegnaOspiti(e.target.value); }} style={{ width: '100%', padding: '9px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={confermaAssegna} style={{ flex: 1, background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '9px', fontSize: '13px', cursor: 'pointer', fontWeight: '700' }}>Conferma</button>
                    <button onClick={function() { setShowAssegna(false); }} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px', fontSize: '13px', cursor: 'pointer' }}>Annulla</button>
                  </div>
                </div>
              )}
              {showUnione && (
                <div style={{ marginTop: '16px', borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '700', color: '#374151' }}>Unisci con:</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {layoutAttivo.filter(function(l) { return l.tavolo_id !== tavoloSelezionato.tavolo_id; }).map(function(l) {
                      return (
                        <button key={l.tavolo_id} onClick={function() { confermaUnione(l.tavolo_id); }} style={{ background: '#faf5ff', border: '1px solid #c4b5fd', borderRadius: '6px', padding: '9px 12px', fontSize: '13px', cursor: 'pointer', textAlign: 'left', color: '#5B21B6', fontWeight: '600' }}>
                          {l.tavolo ? l.tavolo.nome : 'Tavolo'} ({l.tavolo ? l.tavolo.capacita : '-'} posti)
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={function() { setShowUnione(false); }} style={{ marginTop: '8px', width: '100%', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '7px', fontSize: '13px', cursor: 'pointer', color: '#6B7280' }}>Annulla</button>
                </div>
              )}
            </div>
          )}
        </div>

        {tavoliUniti.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#374151', marginBottom: '8px' }}>Tavoli uniti questo turno</h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {tavoliUniti.map(function(u) {
                var t1 = tavoli.find(function(t) { return t.id === u.tavolo_principale_id; });
                var t2 = tavoli.find(function(t) { return t.id === u.tavolo_secondario_id; });
                return (
                  <div key={u.id} style={{ background: '#EDE9FE', border: '1px solid #8B5CF6', borderRadius: '8px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                    <span style={{ fontWeight: '700', color: '#5B21B6' }}>{t1 ? t1.nome : '?'} + {t2 ? t2.nome : '?'}</span>
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

  function renderTabEditor() {
    var tavoliNonInLayout = tavoli.filter(function(t) { return !layoutTemp.some(function(l) { return l.tavolo_id === t.id; }); });
    return (
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <div>
          <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: '#6B7280' }}>Trascina i tavoli per posizionarli nella sala</span>
            {layoutModificato && (
              <button onClick={salvaLayout} style={{ background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '14px', cursor: 'pointer', fontWeight: '700' }}>Salva layout</button>
            )}
          </div>
          <div ref={gridRef} onMouseMove={onMouseMoveGrid} onMouseUp={onMouseUpGrid} onMouseLeave={onMouseUpGrid} style={{ position: 'relative', width: GRID_COLS * GRID_SIZE + 'px', height: GRID_ROWS * GRID_SIZE + 'px', backgroundImage: 'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)', backgroundSize: GRID_SIZE + 'px ' + GRID_SIZE + 'px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #d1d5db', overflow: 'visible', flexShrink: 0 }}>
            {layoutTemp.map(function(item) { return renderTavoloGriglia(item, true); })}
          </div>
        </div>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', minWidth: '230px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '700', color: '#374151' }}>Tavoli disponibili</h4>
          {tavoliNonInLayout.length === 0
            ? <p style={{ fontSize: '13px', color: '#9CA3AF', margin: 0 }}>Tutti i tavoli sono in sala</p>
            : tavoliNonInLayout.map(function(t) {
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', marginBottom: '6px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: t.forma === 'rotondo' ? '50%' : '3px', background: t.colore || '#6B7280', flexShrink: 0 }}></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</div>
                      <div style={{ fontSize: '11px', color: '#6B7280' }}>{t.capacita} posti</div>
                    </div>
                    <button onClick={function() { aggiungiTavoloAlLayout(t); }} style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: '700' }}>+</button>
                  </div>
                );
              })
          }
          <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '12px', paddingTop: '12px' }}>
            <button onClick={function() { setTab('gestione'); }} style={{ width: '100%', background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>+ Crea nuovo tavolo</button>
          </div>
        </div>
      </div>
    );
  }

  function renderTabGestione() {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#374151' }}>Tutti i tavoli ({tavoli.length})</h3>
          <button onClick={function() { apriFormTavolo(null); }} style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '14px', cursor: 'pointer', fontWeight: '700' }}>+ Nuovo tavolo</button>
        </div>
        {tavoli.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '12px', border: '1px dashed #d1d5db' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🪑</div>
            <p style={{ fontSize: '15px', color: '#6B7280', margin: '0 0 16px 0' }}>Nessun tavolo ancora. Crea il primo!</p>
            <button onClick={function() { apriFormTavolo(null); }} style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer', fontWeight: '700' }}>+ Crea primo tavolo</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px' }}>
            {tavoli.map(function(t) {
              return (
                <div key={t.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ width: '36px', height: '28px', borderRadius: t.forma === 'rotondo' ? '50%' : '5px', background: t.colore || '#6B7280', flexShrink: 0 }}></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '800', fontSize: '15px', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</div>
                      <div style={{ fontSize: '12px', color: '#6B7280' }}>{t.forma} - {t.capacita} posti</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '12px' }}>Griglia: {t.larghezza} x {t.altezza} celle{t.note ? (' - ' + t.note) : ''}</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={function() { apriFormTavolo(t); }} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '7px', padding: '7px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>Modifica</button>
                    <button onClick={function() { eliminaTavolo(t); }} style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '7px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer' }}>x</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showFormTavolo && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '440px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '800', color: '#111827' }}>{tavoloInEditing ? 'Modifica tavolo' : 'Nuovo tavolo'}</h3>
              <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', background: '#f9fafb', borderRadius: '10px', minHeight: '80px' }}>
                <div style={{ width: (formTavolo.larghezza * 40) + 'px', height: (formTavolo.altezza * 40) + 'px', background: formTavolo.colore || '#6B7280', borderRadius: formTavolo.forma === 'rotondo' ? '50%' : '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: '800', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                  {formTavolo.nome || '-'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Nome *</label>
                  <input type="text" value={formTavolo.nome} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { nome: e.target.value })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} placeholder="es. T1, Veranda, VIP..." />
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
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '8px', fontWeight: '700' }}>Colore identificativo</label>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {COLORI_TAVOLO.map(function(c) {
                      return (
                        <button key={c.value} onClick={function() { setFormTavolo(Object.assign({}, formTavolo, { colore: c.value })); }} title={c.label} style={{ width: '34px', height: '34px', borderRadius: '50%', background: c.value, cursor: 'pointer', border: formTavolo.colore === c.value ? '3px solid #111827' : '2px solid transparent', transition: 'all 0.15s' }} />
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Note (opzionale)</label>
                  <input type="text" value={formTavolo.note} onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { note: e.target.value })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} placeholder="es. vicino alla finestra, accessibile..." />
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
                  <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>Ordine di visualizzazione: {s.ordine}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={function() { apriFormSala(s); }} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '7px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>Rinomina</button>
                  <button onClick={function() { disattivaSala(s); }} style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '7px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer' }}>Disattiva</button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: '20px', padding: '14px 16px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '10px', maxWidth: '560px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#92400E', lineHeight: '1.6' }}>
            <strong>Nota:</strong> Le sale di default si chiamano "Sala Interna", "Terrazza" e "Sala Privata". Usa <strong>Rinomina</strong> per impostare il nome reale. Disattivare una sala la nasconde ma non elimina i dati storici.
          </p>
        </div>

        {showFormSala && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '380px', maxWidth: '100%' }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '800', color: '#111827' }}>{salaInEditing ? 'Rinomina sala' : 'Nuova sala'}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Nome sala *</label>
                  <input type="text" value={formSala.nome} onChange={function(e) { setFormSala(Object.assign({}, formSala, { nome: e.target.value })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} placeholder="es. Sala Principale, Dehors, Cantina..." autoFocus />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '700' }}>Ordine di visualizzazione</label>
                  <input type="number" min="1" value={formSala.ordine} onChange={function(e) { setFormSala(Object.assign({}, formSala, { ordine: parseInt(e.target.value) || 1 })); }} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
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

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}><div style={{ fontSize: '16px', color: '#6B7280' }}>Caricamento...</div></div>;
  }

  if (errore) {
    return <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '8px', padding: '16px', color: '#DC2626', margin: '20px' }}>Errore: {errore}</div>;
  }

  var TABS = [
    { key: 'mappa', label: 'Mappa servizio', admin: false },
    { key: 'editor', label: 'Editor layout', admin: true },
    { key: 'gestione', label: 'Gestione tavoli', admin: true },
    { key: 'impostazioni', label: 'Impostazioni sala', admin: true }
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1300px', margin: '0 auto' }}>
      <div style={{ marginBottom: '22px' }}>
        <h1 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: '800', color: '#111827' }}>Mappa Sale</h1>
        <p style={{ margin: 0, fontSize: '14px', color: '#6B7280' }}>Gestione tavoli, layout e assegnazione prenotazioni</p>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: '#f3f4f6', borderRadius: '10px', padding: '4px', width: 'fit-content', flexWrap: 'wrap' }}>
        {TABS.map(function(t) {
          if (t.admin && !isAdmin) return null;
          return (
            <button key={t.key} onClick={function() { setTab(t.key); }} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: tab === t.key ? '700' : '400', background: tab === t.key ? 'white' : 'transparent', color: tab === t.key ? '#111827' : '#6B7280', boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>{t.label}</button>
          );
        })}
      </div>

      {(tab === 'mappa' || tab === 'editor') && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {sale.map(function(s) {
              return (
                <button key={s.id} onClick={function() { setSalaSelezionata(s.id); setPannelloAperto(false); }} style={{ padding: '8px 16px', borderRadius: '8px', border: '2px solid', fontSize: '14px', cursor: 'pointer', fontWeight: '700', background: salaSelezionata === s.id ? '#1D4ED8' : 'white', color: salaSelezionata === s.id ? 'white' : '#374151', borderColor: salaSelezionata === s.id ? '#1D4ED8' : '#d1d5db' }}>{s.nome}</button>
              );
            })}
          </div>
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
        </div>
      )}

      {tab === 'mappa' && renderTabMappa()}
      {tab === 'editor' && isAdmin && renderTabEditor()}
      {tab === 'gestione' && isAdmin && renderTabGestione()}
      {tab === 'impostazioni' && isAdmin && renderTabImpostazioni()}
    </div>
  );
}
