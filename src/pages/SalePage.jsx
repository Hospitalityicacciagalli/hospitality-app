import { useState, useEffect, useRef, useCallback } from 'react';
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
  { label: 'Viola', value: '#8B5CF6' }
];

function badgeStato(stato) {
  if (stato === 'occupato') return 'bg-red-500 text-white';
  if (stato === 'prenotato') return 'bg-yellow-400 text-gray-900';
  return 'bg-green-500 text-white';
}

function labelStato(stato) {
  if (stato === 'occupato') return 'Occupato';
  if (stato === 'prenotato') return 'Prenotato';
  return 'Libero';
}

export default function SalePage() {
  var { user, userRole } = useAuth();
  var isAdmin = userRole === 'super_admin' || userRole === 'proprieta' || userRole === 'direttore';

  var [tab, setTab] = useState('mappa');
  var [sale, setSale] = useState([]);
  var [salaSelezionata, setSalaSelezionata] = useState(null);
  var [tavoli, setTavoli] = useState([]);
  var [layoutAttivo, setLayoutAttivo] = useState([]);
  var [tavoluniati, setTavoliUniti] = useState([]);
  var [tavoliPrenotazioni, setTavoliPrenotazioni] = useState([]);
  var [prenotazioni, setPrenotazioni] = useState([]);
  var [dataSelezionata, setDataSelezionata] = useState(new Date().toISOString().split('T')[0]);
  var [turnoSelezionato, setTurnoSelezionato] = useState('cena');
  var [loading, setLoading] = useState(true);
  var [errore, setErrore] = useState(null);

  // editor layout
  var [draggingTavolo, setDraggingTavolo] = useState(null);
  var [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  var [layoutModificato, setLayoutModificato] = useState(false);
  var [layoutTemp, setLayoutTemp] = useState([]);

  // pannello laterale
  var [tavoloSelezionato, setTavoloSelezionato] = useState(null);
  var [pannelloAperto, setPannelloAperto] = useState(false);

  // form nuovo tavolo
  var [showFormTavolo, setShowFormTavolo] = useState(false);
  var [tavoloInEditing, setTavoloInEditing] = useState(null);
  var [formTavolo, setFormTavolo] = useState({ nome: '', capacita: 4, forma: 'rettangolo', larghezza: 2, altezza: 1, colore: '#6B7280', note: '' });

  // form unione tavoli
  var [showUnione, setShowUnione] = useState(false);
  var [unioneConTavolo, setUnioneConTavolo] = useState(null);

  // form assegna prenotazione
  var [showAssegna, setShowAssegna] = useState(false);
  var [assegnaPrenotazione, setAssegnaPrenotazione] = useState(null);
  var [assegnaOspiti, setAssegnaOspiti] = useState(0);

  var gridRef = useRef(null);

  useEffect(function() {
    caricaSale();
    caricaTavoli();
  }, []);

  useEffect(function() {
    if (salaSelezionata) {
      caricaLayout(salaSelezionata);
    }
  }, [salaSelezionata]);

  useEffect(function() {
    if (salaSelezionata && dataSelezionata && turnoSelezionato) {
      caricaTavoliUniti();
      caricaPrenotazioni();
      caricaTavoliPrenotazioni();
    }
  }, [salaSelezionata, dataSelezionata, turnoSelezionato]);

  function caricaSale() {
    supabase
      .from('sale')
      .select('*')
      .eq('attiva', true)
      .order('ordine')
      .then(function(result) {
        if (result.error) { setErrore(result.error.message); return; }
        setSale(result.data || []);
        if (result.data && result.data.length > 0 && !salaSelezionata) {
          setSalaSelezionata(result.data[0].id);
        }
        setLoading(false);
      });
  }

  function caricaTavoli() {
    supabase
      .from('tavoli')
      .select('*')
      .eq('attivo', true)
      .order('nome')
      .then(function(result) {
        if (result.error) { setErrore(result.error.message); return; }
        setTavoli(result.data || []);
      });
  }

  function caricaLayout(salaId) {
    supabase
      .from('layout_sala')
      .select('*, tavolo:tavoli(*)')
      .eq('sala_id', salaId)
      .lte('data_validita_dal', dataSelezionata)
      .order('data_validita_dal', { ascending: false })
      .then(function(result) {
        if (result.error) { setErrore(result.error.message); return; }
        // prendi solo la posizione piu recente per ogni tavolo
        var visti = {};
        var layout = [];
        (result.data || []).forEach(function(r) {
          if (!visti[r.tavolo_id]) {
            visti[r.tavolo_id] = true;
            layout.push(r);
          }
        });
        setLayoutAttivo(layout);
        setLayoutTemp(layout.map(function(r) { return Object.assign({}, r); }));
      });
  }

  function caricaTavoliUniti() {
    supabase
      .from('tavoli_uniti')
      .select('*')
      .eq('data', dataSelezionata)
      .eq('turno', turnoSelezionato)
      .eq('attivo', true)
      .then(function(result) {
        if (result.error) return;
        setTavoliUniti(result.data || []);
      });
  }

  function caricaPrenotazioni() {
    supabase
      .from('reservations')
      .select('id, adulti, bambini, note, stato, ora, customer:customers(first_name, last_name)')
      .eq('data', dataSelezionata)
      .eq('tipo_pasto', turnoSelezionato)
      .then(function(result) {
        if (result.error) return;
        setPrenotazioni(result.data || []);
      });
  }

  function caricaTavoliPrenotazioni() {
    supabase
      .from('tavoli_prenotazioni')
      .select('*')
      .eq('data', dataSelezionata)
      .eq('turno', turnoSelezionato)
      .then(function(result) {
        if (result.error) return;
        setTavoliPrenotazioni(result.data || []);
      });
  }

  // calcola stato tavolo per oggi/turno
  function getStatoTavolo(tavoloId) {
    var assegnazioni = tavoliPrenotazioni.filter(function(tp) { return tp.tavolo_id === tavoloId; });
    if (assegnazioni.length === 0) return 'libero';
    var prenotazione = prenotazioni.find(function(p) {
      return assegnazioni.some(function(a) { return a.prenotazione_id === p.id; });
    });
    if (!prenotazione) return 'libero';
    if (prenotazione.stato === 'arrivato' || prenotazione.stato === 'al_tavolo') return 'occupato';
    return 'prenotato';
  }

  function getNomeClienteTavolo(tavoloId) {
    var assegnazione = tavoliPrenotazioni.find(function(tp) { return tp.tavolo_id === tavoloId; });
    if (!assegnazione) return null;
    var prenotazione = prenotazioni.find(function(p) { return p.id === assegnazione.prenotazione_id; });
    if (!prenotazione) return null;
    if (prenotazione.customer) {
      return prenotazione.customer.first_name + ' ' + prenotazione.customer.last_name;
    }
    return 'Cliente';
  }

  function getOspitiAssegnatiTavolo(tavoloId) {
    return tavoliPrenotazioni
      .filter(function(tp) { return tp.tavolo_id === tavoloId; })
      .reduce(function(sum, tp) { return sum + (tp.n_ospiti_assegnati || 0); }, 0);
  }

  function isTavoloUnito(tavoloId) {
    return tavoluniati.some(function(u) {
      return u.tavolo_secondario_id === tavoloId || u.tavolo_principale_id === tavoloId;
    });
  }

  // ---- DRAG & DROP EDITOR ----

  function onMouseDownTavolo(e, layoutItem) {
    if (tab !== 'editor') return;
    e.preventDefault();
    var rect = gridRef.current.getBoundingClientRect();
    var offsetX = e.clientX - rect.left - layoutItem.pos_x * GRID_SIZE;
    var offsetY = e.clientY - rect.top - layoutItem.pos_y * GRID_SIZE;
    setDraggingTavolo(layoutItem.tavolo_id);
    setDragOffset({ x: offsetX, y: offsetY });
  }

  function onMouseMoveGrid(e) {
    if (!draggingTavolo || tab !== 'editor') return;
    var rect = gridRef.current.getBoundingClientRect();
    var rawX = e.clientX - rect.left - dragOffset.x;
    var rawY = e.clientY - rect.top - dragOffset.y;
    var col = Math.max(0, Math.min(GRID_COLS - 1, Math.round(rawX / GRID_SIZE)));
    var row = Math.max(0, Math.min(GRID_ROWS - 1, Math.round(rawY / GRID_SIZE)));
    setLayoutTemp(function(prev) {
      return prev.map(function(item) {
        if (item.tavolo_id === draggingTavolo) {
          return Object.assign({}, item, { pos_x: col, pos_y: row });
        }
        return item;
      });
    });
    setLayoutModificato(true);
  }

  function onMouseUpGrid() {
    setDraggingTavolo(null);
  }

  function aggiungiTavoloAlLayout(tavolo) {
    var giaPresenteInLayout = layoutTemp.some(function(l) { return l.tavolo_id === tavolo.id; });
    if (giaPresenteInLayout) return;
    var nuovoItem = {
      id: null,
      sala_id: salaSelezionata,
      tavolo_id: tavolo.id,
      tavolo: tavolo,
      pos_x: 0,
      pos_y: 0,
      rotazione: 0,
      data_validita_dal: dataSelezionata,
      nuovo: true
    };
    setLayoutTemp(function(prev) { return prev.concat([nuovoItem]); });
    setLayoutModificato(true);
  }

  function rimuoviDalLayout(tavoloId) {
    setLayoutTemp(function(prev) { return prev.filter(function(l) { return l.tavolo_id !== tavoloId; }); });
    setLayoutModificato(true);
  }

  function salvaLayout() {
    var oggi = new Date().toISOString().split('T')[0];
    var operazioni = layoutTemp.map(function(item) {
      return supabase.from('layout_sala').insert({
        sala_id: salaSelezionata,
        tavolo_id: item.tavolo_id,
        pos_x: item.pos_x,
        pos_y: item.pos_y,
        rotazione: item.rotazione || 0,
        data_validita_dal: oggi
      });
    });
    Promise.all(operazioni).then(function() {
      setLayoutModificato(false);
      caricaLayout(salaSelezionata);
      alert('Layout salvato!');
    });
  }

  // ---- FORM TAVOLO ----

  function apriFormTavolo(tavolo) {
    if (tavolo) {
      setTavoloInEditing(tavolo);
      setFormTavolo({
        nome: tavolo.nome,
        capacita: tavolo.capacita,
        forma: tavolo.forma,
        larghezza: tavolo.larghezza,
        altezza: tavolo.altezza,
        colore: tavolo.colore,
        note: tavolo.note || ''
      });
    } else {
      setTavoloInEditing(null);
      setFormTavolo({ nome: '', capacita: 4, forma: 'rettangolo', larghezza: 2, altezza: 1, colore: '#6B7280', note: '' });
    }
    setShowFormTavolo(true);
  }

  function salvaTavolo() {
    if (!formTavolo.nome.trim()) { alert('Inserisci il nome del tavolo'); return; }
    if (tavoloInEditing) {
      supabase.from('tavoli').update(formTavolo).eq('id', tavoloInEditing.id).then(function(result) {
        if (result.error) { alert('Errore: ' + result.error.message); return; }
        caricaTavoli();
        caricaLayout(salaSelezionata);
        setShowFormTavolo(false);
      });
    } else {
      supabase.from('tavoli').insert(formTavolo).then(function(result) {
        if (result.error) { alert('Errore: ' + result.error.message); return; }
        caricaTavoli();
        setShowFormTavolo(false);
      });
    }
  }

  function eliminaTavolo(tavolo) {
    if (!window.confirm('Eliminare il tavolo "' + tavolo.nome + '"?')) return;
    supabase.from('tavoli').update({ attivo: false }).eq('id', tavolo.id).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); return; }
      caricaTavoli();
      caricaLayout(salaSelezionata);
    });
  }

  // ---- UNIONE TAVOLI ----

  function apriUnione(tavolo) {
    setUnioneConTavolo(tavolo);
    setShowUnione(true);
  }

  function confermUnione(tavoloSecondarioId) {
    supabase.from('tavoli_uniti').insert({
      tavolo_principale_id: unioneConTavolo.tavolo_id || unioneConTavolo.id,
      tavolo_secondario_id: tavoloSecondarioId,
      data: dataSelezionata,
      turno: turnoSelezionato,
      attivo: true
    }).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); return; }
      caricaTavoliUniti();
      setShowUnione(false);
    });
  }

  function sciogliUnione(unioneId) {
    supabase.from('tavoli_uniti').update({ attivo: false }).eq('id', unioneId).then(function() {
      caricaTavoliUniti();
    });
  }

  // ---- ASSEGNA PRENOTAZIONE ----

  function apriAssegna(layoutItem) {
    setTavoloSelezionato(layoutItem);
    setAssegnaPrenotazione(null);
    setAssegnaOspiti(0);
    setShowAssegna(true);
    setPannelloAperto(true);
  }

  function confermaAssegna() {
    if (!assegnaPrenotazione) { alert('Seleziona una prenotazione'); return; }
    if (!assegnaOspiti || assegnaOspiti <= 0) { alert('Inserisci il numero di ospiti'); return; }
    supabase.from('tavoli_prenotazioni').insert({
      prenotazione_id: assegnaPrenotazione,
      tavolo_id: tavoloSelezionato.tavolo_id,
      n_ospiti_assegnati: parseInt(assegnaOspiti),
      data: dataSelezionata,
      turno: turnoSelezionato
    }).then(function(result) {
      if (result.error) { alert('Errore: ' + result.error.message); return; }
      caricaTavoliPrenotazioni();
      setShowAssegna(false);
      setPannelloAperto(false);
    });
  }

  function rimuoviAssegnazione(tavoloId) {
    if (!window.confirm('Rimuovere l\'assegnazione da questo tavolo?')) return;
    supabase.from('tavoli_prenotazioni')
      .delete()
      .eq('tavolo_id', tavoloId)
      .eq('data', dataSelezionata)
      .eq('turno', turnoSelezionato)
      .then(function() {
        caricaTavoliPrenotazioni();
      });
  }

  // ---- RENDER TAVOLO SULLA GRIGLIA ----

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
    var unito = isTavoloUnito(layoutItem.tavolo_id);

    var bgColor = editorMode ? (t.colore || '#6B7280') : (stato === 'occupato' ? '#EF4444' : stato === 'prenotato' ? '#F59E0B' : '#10B981');
    var isRound = t.forma === 'rotondo';

    return (
      <div
        key={layoutItem.tavolo_id}
        onMouseDown={editorMode ? function(e) { onMouseDownTavolo(e, layoutItem); } : undefined}
        onClick={!editorMode ? function() { apriAssegna(layoutItem); } : undefined}
        style={{
          position: 'absolute',
          left: x + 'px',
          top: y + 'px',
          width: w + 'px',
          height: h + 'px',
          backgroundColor: bgColor,
          borderRadius: isRound ? '50%' : '8px',
          cursor: editorMode ? 'grab' : 'pointer',
          userSelect: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '11px',
          fontWeight: 'bold',
          boxShadow: unito ? '0 0 0 3px #7C3AED' : '0 2px 6px rgba(0,0,0,0.3)',
          transition: draggingTavolo === layoutItem.tavolo_id ? 'none' : 'box-shadow 0.2s',
          zIndex: draggingTavolo === layoutItem.tavolo_id ? 50 : 10
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{t.nome}</span>
        {!editorMode && nomeCliente && (
          <span style={{ fontSize: '9px', opacity: 0.9, textAlign: 'center', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomeCliente}</span>
        )}
        {!editorMode && ospiti > 0 && (
          <span style={{ fontSize: '9px', opacity: 0.85 }}>{ospiti} osp.</span>
        )}
        {!editorMode && stato === 'libero' && (
          <span style={{ fontSize: '9px', opacity: 0.85 }}>{t.capacita} posti</span>
        )}
        {editorMode && (
          <button
            onMouseDown={function(e) { e.stopPropagation(); }}
            onClick={function(e) { e.stopPropagation(); rimuoviDalLayout(layoutItem.tavolo_id); }}
            style={{ position: 'absolute', top: '2px', right: '4px', background: 'rgba(0,0,0,0.3)', border: 'none', color: 'white', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >x</button>
        )}
      </div>
    );
  }

  // ---- RENDER GRIGLIA ----

  function renderGriglia(editorMode) {
    var layout = editorMode ? layoutTemp : layoutAttivo;
    return (
      <div
        ref={gridRef}
        onMouseMove={editorMode ? onMouseMoveGrid : undefined}
        onMouseUp={editorMode ? onMouseUpGrid : undefined}
        onMouseLeave={editorMode ? onMouseUpGrid : undefined}
        style={{
          position: 'relative',
          width: GRID_COLS * GRID_SIZE + 'px',
          height: GRID_ROWS * GRID_SIZE + 'px',
          backgroundImage: 'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
          backgroundSize: GRID_SIZE + 'px ' + GRID_SIZE + 'px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #d1d5db',
          overflow: 'hidden',
          flexShrink: 0
        }}
      >
        {layout.map(function(item) { return renderTavoloGriglia(item, editorMode); })}
      </div>
    );
  }

  // ---- TAB MAPPA ----

  function renderTabMappa() {
    var tavoliLiberi = layoutAttivo.filter(function(l) { return getStatoTavolo(l.tavolo_id) === 'libero'; }).length;
    var tavoliOccupati = layoutAttivo.filter(function(l) { return getStatoTavolo(l.tavolo_id) === 'occupato'; }).length;
    var tavoliPrenotati = layoutAttivo.filter(function(l) { return getStatoTavolo(l.tavolo_id) === 'prenotato'; }).length;

    return (
      <div>
        {/* Header info */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ background: 'white', borderRadius: '8px', padding: '12px 20px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10B981' }}></div>
            <span style={{ fontSize: '14px', color: '#374151' }}><strong>{tavoliLiberi}</strong> liberi</span>
          </div>
          <div style={{ background: 'white', borderRadius: '8px', padding: '12px 20px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#F59E0B' }}></div>
            <span style={{ fontSize: '14px', color: '#374151' }}><strong>{tavoliPrenotati}</strong> prenotati</span>
          </div>
          <div style={{ background: 'white', borderRadius: '8px', padding: '12px 20px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#EF4444' }}></div>
            <span style={{ fontSize: '14px', color: '#374151' }}><strong>{tavoliOccupati}</strong> occupati</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          {/* Griglia */}
          <div style={{ overflowX: 'auto' }}>
            {renderGriglia(false)}
          </div>

          {/* Pannello laterale */}
          {pannelloAperto && tavoloSelezionato && (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', minWidth: '280px', maxWidth: '320px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#111827' }}>
                  {tavoloSelezionato.tavolo ? tavoloSelezionato.tavolo.nome : 'Tavolo'}
                </h3>
                <button
                  onClick={function() { setPannelloAperto(false); setShowAssegna(false); }}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6B7280' }}
                >×</button>
              </div>

              {tavoloSelezionato.tavolo && (
                <div style={{ marginBottom: '16px', padding: '10px', background: '#f3f4f6', borderRadius: '8px', fontSize: '13px', color: '#374151' }}>
                  <div>Capienza: <strong>{tavoloSelezionato.tavolo.capacita} posti</strong></div>
                  <div>Stato: <strong>{labelStato(getStatoTavolo(tavoloSelezionato.tavolo_id))}</strong></div>
                  {getOspitiAssegnatiTavolo(tavoloSelezionato.tavolo_id) > 0 && (
                    <div>Ospiti assegnati: <strong>{getOspitiAssegnatiTavolo(tavoloSelezionato.tavolo_id)}</strong></div>
                  )}
                </div>
              )}

              {/* Azioni */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {getStatoTavolo(tavoloSelezionato.tavolo_id) === 'libero' ? (
                  <>
                    <button
                      onClick={function() { setShowAssegna(true); }}
                      style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}
                    >+ Assegna prenotazione</button>
                    <button
                      onClick={function() { apriUnione(tavoloSelezionato); }}
                      style={{ background: '#8B5CF6', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}
                    >🔗 Unisci con altro tavolo</button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '13px', color: '#374151', fontWeight: '600', marginBottom: '4px' }}>Cliente: {getNomeClienteTavolo(tavoloSelezionato.tavolo_id)}</div>
                    <button
                      onClick={function() { rimuoviAssegnazione(tavoloSelezionato.tavolo_id); setPannelloAperto(false); }}
                      style={{ background: '#EF4444', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', cursor: 'pointer' }}
                    >Rimuovi assegnazione</button>
                  </>
                )}
              </div>

              {/* Form assegna prenotazione */}
              {showAssegna && (
                <div style={{ marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Assegna prenotazione</h4>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Prenotazione</label>
                    <select
                      value={assegnaPrenotazione || ''}
                      onChange={function(e) { setAssegnaPrenotazione(e.target.value); }}
                      style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                    >
                      <option value="">-- Seleziona --</option>
                      {prenotazioni.map(function(p) {
                        var nome = p.customer ? (p.customer.first_name + ' ' + p.customer.last_name) : 'Cliente';
                        return (
                          <option key={p.id} value={p.id}>
                            {nome} - {p.adulti + (p.bambini || 0)} osp. ({p.ora})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>N° ospiti a questo tavolo</label>
                    <input
                      type="number"
                      min="1"
                      value={assegnaOspiti}
                      onChange={function(e) { setAssegnaOspiti(e.target.value); }}
                      style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={confermaAssegna}
                      style={{ flex: 1, background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}
                    >Conferma</button>
                    <button
                      onClick={function() { setShowAssegna(false); }}
                      style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px', fontSize: '13px', cursor: 'pointer' }}
                    >Annulla</button>
                  </div>
                </div>
              )}

              {/* Form unione */}
              {showUnione && unioneConTavolo && (
                <div style={{ marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Unisci con:</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {layoutAttivo
                      .filter(function(l) { return l.tavolo_id !== (unioneConTavolo.tavolo_id || unioneConTavolo.id); })
                      .map(function(l) {
                        return (
                          <button
                            key={l.tavolo_id}
                            onClick={function() { confermUnione(l.tavolo_id); }}
                            style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px', fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}
                          >
                            {l.tavolo ? l.tavolo.nome : 'Tavolo'} ({l.tavolo ? l.tavolo.capacita : '-'} posti)
                          </button>
                        );
                      })
                    }
                  </div>
                  <button
                    onClick={function() { setShowUnione(false); }}
                    style={{ marginTop: '8px', width: '100%', background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '6px', fontSize: '13px', cursor: 'pointer', color: '#6B7280' }}
                  >Annulla</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tabella unioni attive */}
        {tavoluniati.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Tavoli uniti questo turno</h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {tavoluniati.map(function(u) {
                var t1 = tavoli.find(function(t) { return t.id === u.tavolo_principale_id; });
                var t2 = tavoli.find(function(t) { return t.id === u.tavolo_secondario_id; });
                return (
                  <div key={u.id} style={{ background: '#EDE9FE', border: '1px solid #8B5CF6', borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <span style={{ fontWeight: '600', color: '#5B21B6' }}>
                      {t1 ? t1.nome : '?'} + {t2 ? t2.nome : '?'}
                    </span>
                    <button
                      onClick={function() { sciogliUnione(u.id); }}
                      style={{ background: '#8B5CF6', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}
                    >Sciogli</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- TAB EDITOR ----

  function renderTabEditor() {
    var tavoliNonInLayout = tavoli.filter(function(t) {
      return !layoutTemp.some(function(l) { return l.tavolo_id === t.id; });
    });

    return (
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <div>
          <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: '#6B7280' }}>Trascina i tavoli per posizionarli nella sala</span>
            {layoutModificato && (
              <button
                onClick={salvaLayout}
                style={{ background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}
              >💾 Salva layout</button>
            )}
          </div>
          {renderGriglia(true)}
        </div>

        {/* Pannello tavoli disponibili */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', minWidth: '220px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Tavoli disponibili</h4>
          {tavoliNonInLayout.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#9CA3AF' }}>Tutti i tavoli sono già in sala</p>
          ) : (
            tavoliNonInLayout.map(function(t) {
              return (
                <div
                  key={t.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', marginBottom: '6px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}
                >
                  <div style={{ width: '12px', height: '12px', borderRadius: t.forma === 'rotondo' ? '50%' : '3px', background: t.colore || '#6B7280', flexShrink: 0 }}></div>
                  <span style={{ fontSize: '13px', flex: 1, color: '#374151' }}>{t.nome} ({t.capacita}p)</span>
                  <button
                    onClick={function() { aggiungiTavoloAlLayout(t); }}
                    style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}
                  >+ Aggiungi</button>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ---- TAB GESTIONE TAVOLI ----

  function renderTabGestione() {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#374151' }}>Tutti i tavoli</h3>
          <button
            onClick={function() { apriFormTavolo(null); }}
            style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}
          >+ Nuovo tavolo</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {tavoli.map(function(t) {
            return (
              <div key={t.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ width: '32px', height: '24px', borderRadius: t.forma === 'rotondo' ? '50%' : '4px', background: t.colore || '#6B7280', flexShrink: 0 }}></div>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '15px', color: '#111827' }}>{t.nome}</div>
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>{t.forma} - {t.capacita} posti</div>
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px' }}>
                  Dimensione: {t.larghezza} x {t.altezza} celle
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={function() { apriFormTavolo(t); }}
                    style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', padding: '6px', fontSize: '12px', cursor: 'pointer' }}
                  >Modifica</button>
                  <button
                    onClick={function() { eliminaTavolo(t); }}
                    style={{ background: '#FEE2E2', color: '#EF4444', border: '1px solid #FECACA', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer' }}
                  >✕</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal form tavolo */}
        {showFormTavolo && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '420px', maxWidth: '95vw' }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '700' }}>
                {tavoloInEditing ? 'Modifica tavolo' : 'Nuovo tavolo'}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '600' }}>Nome *</label>
                  <input
                    type="text"
                    value={formTavolo.nome}
                    onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { nome: e.target.value })); }}
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                    placeholder="es. Tavolo 1, T-Esterno, VIP..."
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '600' }}>Capienza (posti)</label>
                    <input
                      type="number" min="1" max="20"
                      value={formTavolo.capacita}
                      onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { capacita: parseInt(e.target.value) })); }}
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '600' }}>Forma</label>
                    <select
                      value={formTavolo.forma}
                      onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { forma: e.target.value })); }}
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                    >
                      <option value="rettangolo">Rettangolare</option>
                      <option value="quadrato">Quadrato</option>
                      <option value="rotondo">Rotondo</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '600' }}>Larghezza (celle griglia)</label>
                    <input
                      type="number" min="1" max="6"
                      value={formTavolo.larghezza}
                      onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { larghezza: parseInt(e.target.value) })); }}
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '600' }}>Altezza (celle griglia)</label>
                    <input
                      type="number" min="1" max="4"
                      value={formTavolo.altezza}
                      onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { altezza: parseInt(e.target.value) })); }}
                      style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '8px', fontWeight: '600' }}>Colore</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {COLORI_TAVOLO.map(function(c) {
                      return (
                        <button
                          key={c.value}
                          onClick={function() { setFormTavolo(Object.assign({}, formTavolo, { colore: c.value })); }}
                          style={{ width: '32px', height: '32px', borderRadius: '50%', background: c.value, border: formTavolo.colore === c.value ? '3px solid #111' : '2px solid transparent', cursor: 'pointer' }}
                          title={c.label}
                        />
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '4px', fontWeight: '600' }}>Note</label>
                  <input
                    type="text"
                    value={formTavolo.note}
                    onChange={function(e) { setFormTavolo(Object.assign({}, formTavolo, { note: e.target.value })); }}
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                    placeholder="es. vicino alla finestra, accessibile..."
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  onClick={salvaTavolo}
                  style={{ flex: 1, background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '15px', cursor: 'pointer', fontWeight: '700' }}
                >Salva</button>
                <button
                  onClick={function() { setShowFormTavolo(false); }}
                  style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '12px', fontSize: '15px', cursor: 'pointer' }}
                >Annulla</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- RENDER PRINCIPALE ----

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
        <div style={{ fontSize: '16px', color: '#6B7280' }}>Caricamento sale...</div>
      </div>
    );
  }

  if (errore) {
    return (
      <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '8px', padding: '16px', color: '#DC2626' }}>
        Errore: {errore}
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Intestazione */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: '800', color: '#111827' }}>Mappa Sale</h1>
        <p style={{ margin: 0, fontSize: '14px', color: '#6B7280' }}>Gestione tavoli e assegnazione prenotazioni</p>
      </div>

      {/* Tab principale */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: '#f3f4f6', borderRadius: '10px', padding: '4px', width: 'fit-content' }}>
        <button
          onClick={function() { setTab('mappa'); }}
          style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', fontSize: '14px', cursor: 'pointer', fontWeight: tab === 'mappa' ? '700' : '400', background: tab === 'mappa' ? 'white' : 'transparent', color: tab === 'mappa' ? '#111827' : '#6B7280', boxShadow: tab === 'mappa' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}
        >🗺️ Mappa servizio</button>
        {isAdmin && (
          <button
            onClick={function() { setTab('editor'); }}
            style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', fontSize: '14px', cursor: 'pointer', fontWeight: tab === 'editor' ? '700' : '400', background: tab === 'editor' ? 'white' : 'transparent', color: tab === 'editor' ? '#111827' : '#6B7280', boxShadow: tab === 'editor' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}
          >✏️ Editor layout</button>
        )}
        {isAdmin && (
          <button
            onClick={function() { setTab('gestione'); }}
            style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', fontSize: '14px', cursor: 'pointer', fontWeight: tab === 'gestione' ? '700' : '400', background: tab === 'gestione' ? 'white' : 'transparent', color: tab === 'gestione' ? '#111827' : '#6B7280', boxShadow: tab === 'gestione' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}
          >🪑 Gestione tavoli</button>
        )}
      </div>

      {/* Selettori sala / data / turno (non in gestione) */}
      {tab !== 'gestione' && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Selettore sala */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {sale.map(function(s) {
              return (
                <button
                  key={s.id}
                  onClick={function() { setSalaSelezionata(s.id); setPannelloAperto(false); }}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: '2px solid', fontSize: '14px', cursor: 'pointer', fontWeight: '600', background: salaSelezionata === s.id ? '#1D4ED8' : 'white', color: salaSelezionata === s.id ? 'white' : '#374151', borderColor: salaSelezionata === s.id ? '#1D4ED8' : '#d1d5db' }}
                >
                  {s.nome}
                </button>
              );
            })}
          </div>

          {/* Data */}
          <input
            type="date"
            value={dataSelezionata}
            onChange={function(e) { setDataSelezionata(e.target.value); setPannelloAperto(false); }}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
          />

          {/* Turno */}
          <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', borderRadius: '8px', padding: '3px' }}>
            <button
              onClick={function() { setTurnoSelezionato('pranzo'); setPannelloAperto(false); }}
              style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: turnoSelezionato === 'pranzo' ? '700' : '400', background: turnoSelezionato === 'pranzo' ? 'white' : 'transparent', color: turnoSelezionato === 'pranzo' ? '#111827' : '#6B7280', boxShadow: turnoSelezionato === 'pranzo' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >☀️ Pranzo</button>
            <button
              onClick={function() { setTurnoSelezionato('cena'); setPannelloAperto(false); }}
              style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: turnoSelezionato === 'cena' ? '700' : '400', background: turnoSelezionato === 'cena' ? 'white' : 'transparent', color: turnoSelezionato === 'cena' ? '#111827' : '#6B7280', boxShadow: turnoSelezionato === 'cena' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >🌙 Cena</button>
          </div>
        </div>
      )}

      {/* Contenuto tab */}
      {tab === 'mappa' && renderTabMappa()}
      {tab === 'editor' && isAdmin && renderTabEditor()}
      {tab === 'gestione' && isAdmin && renderTabGestione()}
    </div>
  );
}
