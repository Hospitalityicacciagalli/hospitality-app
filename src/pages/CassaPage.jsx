import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

var CASSE = [
  { id: 'd375c1de-04b9-490e-ab8f-5f11a6cb969f', nome: 'Reception' },
  { id: '4805dd45-da57-4442-9a09-a0141804cc9a', nome: 'Ristorante' }
];

var METODI = [
  { id: '3a2f24bc-6a09-43cb-b236-ae3e02b62a87', nome: 'Contanti', is_contante: true },
  { id: 'e75b9fb3-be6f-47ec-9c52-28b4564d0cf8', nome: 'Carta', is_contante: false },
  { id: 'f3c0283d-8ef9-436b-8d11-6b297aeb40e1', nome: 'Bonifico', is_contante: false },
  { id: 'bf0930e3-0825-4f8d-9596-bf561c8ded6f', nome: 'Assegno', is_contante: false },
  { id: 'b06a9207-14bf-4ea9-988c-e392c0bc1b70', nome: 'Hotel in Cloud', is_contante: false },
  { id: '18759dd0-9dcb-4395-9da2-9ed48155c880', nome: 'Stripe', is_contante: false },
  { id: 'f403ef7f-dbe9-4e9c-a1e9-d7705639d3a6', nome: 'PAN manuale', is_contante: false },
  { id: 'bc917872-f978-4566-aa90-5ee7a3c5405b', nome: 'Fattoria', is_contante: false }
];

var TIPI_MOVIMENTO = [
  { value: 'scontrino', label: 'Scontrino', segno: '+', colore: '#22c55e' },
  { value: 'fattura', label: 'Fattura', segno: '+', colore: '#3b82f6' },
  { value: 'versamento_ricevuto', label: 'Versamento ricevuto', segno: '+', colore: '#8b5cf6' },
  { value: 'prelievo', label: 'Prelievo / Spesa', segno: '-', colore: '#f59e0b' },
  { value: 'trasferimento_uscita', label: 'Trasferimento a cassa', segno: '-', colore: '#f97316' },
  { value: 'trasferimento_entrata', label: 'Trasferimento da cassa', segno: '+', colore: '#06b6d4' },
  { value: 'caparra', label: 'Caparra evento', segno: '+', colore: '#ec4899' },
  { value: 'cassaforte_versamento', label: 'Versamento in cassaforte', segno: '-', colore: '#6b7280' },
  { value: 'cassaforte_prelievo', label: 'Prelievo da cassaforte', segno: '+', colore: '#6b7280' }
];

var TIPI_CHE_RICHIEDONO_CENTRO = ['prelievo', 'cassaforte_versamento'];

function oggiISO() {
  return new Date().toISOString().split('T')[0];
}

function formatEuro(n) {
  return (n || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function getTipoInfo(value) {
  for (var i = 0; i < TIPI_MOVIMENTO.length; i++) {
    if (TIPI_MOVIMENTO[i].value === value) return TIPI_MOVIMENTO[i];
  }
  return { segno: '+', colore: '#6b7280', label: value };
}

function getMetodoNome(id) {
  for (var i = 0; i < METODI.length; i++) {
    if (METODI[i].id === id) return METODI[i].nome;
  }
  return '—';
}

// ── FORM NUOVO MOVIMENTO ─────────────────────────────────────
function FormMovimento(props) {
  var cassaId = props.cassaId;
  var onSave = props.onSave;
  var onClose = props.onClose;
  var centri = props.centri;
  var userId = props.userId;
  var altreCase = CASSE.filter(function(c) { return c.id !== cassaId; });

  var [tipo, setTipo] = useState('scontrino');
  var [metodoId, setMetodoId] = useState(METODI[0].id);
  var [importo, setImporto] = useState('');
  var [isfattoria, setIsfattoria] = useState(false);
  var [centroCostoId, setCentroCostoId] = useState('');
  var [provenienza, setProvenienza] = useState('');
  var [cassaCollegataId, setCassaCollegataId] = useState('');
  var [nota, setNota] = useState('');
  var [saving, setSaving] = useState(false);
  var [errore, setErrore] = useState('');

  var tipoInfo = getTipoInfo(tipo);
  var richiedeCentro = TIPI_CHE_RICHIEDONO_CENTRO.indexOf(tipo) !== -1;
  var richiedeCassa = tipo === 'trasferimento_uscita' || tipo === 'trasferimento_entrata';

  var alertsVivi = [];
  if (richiedeCentro && !centroCostoId) alertsVivi.push('Nessun centro di costo selezionato per questa spesa.');
  if (isfattoria && !nota) alertsVivi.push('Movimento Fattoria senza nota esplicativa.');
  if (richiedeCassa && !cassaCollegataId) alertsVivi.push('Trasferimento senza cassa collegata.');

  function handleSave() {
    if (!importo || parseFloat(importo) <= 0) {
      setErrore('Inserisci un importo valido.');
      return;
    }
    setErrore('');
    setSaving(true);

    var ora = new Date().toTimeString().slice(0, 8);
    var movimento = {
      cassa_id: cassaId,
      data: oggiISO(),
      ora: ora,
      tipo: tipo,
      metodo_pagamento_id: metodoId,
      importo: parseFloat(importo),
      is_fattoria: isfattoria,
      centro_di_costo_id: centroCostoId || null,
      provenienza: provenienza || null,
      cassa_collegata_id: cassaCollegataId || null,
      nota: nota || null,
      alert_centro_costo: richiedeCentro && !centroCostoId,
      annullato: false,
      inserito_da: userId || null
    };

    supabase
      .from('movimenti_cassa')
      .insert([movimento])
      .select()
      .then(function(result) {
        setSaving(false);
        if (result.error) {
          setErrore('Errore salvataggio: ' + result.error.message);
          return;
        }
        var salvato = result.data[0];
        // Aggiungo nome centro costo per la visualizzazione locale
        if (centroCostoId) {
          for (var i = 0; i < centri.length; i++) {
            if (centri[i].id === centroCostoId) {
              salvato._centro_nome = centri[i].nome;
              break;
            }
          }
        }
        onSave(salvato);
      });
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px'
    }}>
      <div style={{
        background: '#1a1f2e', borderRadius: '16px', width: '100%', maxWidth: '520px',
        padding: '28px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        border: '1px solid #2d3448', maxHeight: '90vh', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ color: '#f8fafc', fontFamily: 'Georgia, serif', fontSize: '20px', margin: 0 }}>
            Nuovo Movimento
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#64748b',
            fontSize: '24px', cursor: 'pointer', lineHeight: 1, padding: '0 4px'
          }}>×</button>
        </div>

        {/* TIPO */}
        <label style={S.label}>Tipo movimento</label>
        <select value={tipo} onChange={function(e) { setTipo(e.target.value); }} style={S.select}>
          {TIPI_MOVIMENTO.map(function(t) {
            return <option key={t.value} value={t.value}>{t.segno === '+' ? '↑' : '↓'} {t.label}</option>;
          })}
        </select>

        {/* METODO PAGAMENTO */}
        <label style={S.label}>Metodo di pagamento</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {METODI.map(function(m) {
            var sel = m.id === metodoId;
            return (
              <button key={m.id} onClick={function() { setMetodoId(m.id); }} style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer',
                border: sel ? '2px solid #c9a96e' : '2px solid #2d3448',
                background: sel ? '#c9a96e22' : 'transparent',
                color: sel ? '#c9a96e' : '#94a3b8', transition: 'all 0.15s'
              }}>{m.nome}</button>
            );
          })}
        </div>

        {/* IMPORTO */}
        <label style={S.label}>Importo (€)</label>
        <input
          type="number" step="0.01" min="0" placeholder="0.00"
          value={importo} onChange={function(e) { setImporto(e.target.value); }}
          style={Object.assign({}, S.input, {
            fontSize: '26px', textAlign: 'right',
            color: tipoInfo.colore, fontWeight: '700', letterSpacing: '-0.5px'
          })}
        />

        {/* FLAG FATTORIA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 16px' }}>
          <input type="checkbox" id="chk-fattoria" checked={isfattoria}
            onChange={function(e) { setIsfattoria(e.target.checked); }}
            style={{ width: '18px', height: '18px', accentColor: '#c9a96e', cursor: 'pointer' }}
          />
          <label htmlFor="chk-fattoria" style={{ color: '#94a3b8', fontSize: '14px', cursor: 'pointer' }}>
            Movimento Fattoria <span style={{ color: '#64748b', fontSize: '12px' }}>(non fiscalizzato)</span>
          </label>
        </div>

        {/* CENTRO DI COSTO */}
        <label style={S.label}>
          Centro di costo
          {richiedeCentro && <span style={{ color: '#f59e0b', marginLeft: '6px', fontSize: '11px' }}>★ consigliato per spese</span>}
        </label>
        <select value={centroCostoId} onChange={function(e) { setCentroCostoId(e.target.value); }} style={S.select}>
          <option value="">— nessuno —</option>
          {centri.map(function(c) {
            return <option key={c.id} value={c.id}>{c.nome}</option>;
          })}
        </select>

        {/* CASSA COLLEGATA */}
        {richiedeCassa && (
          <div>
            <label style={S.label}>Cassa collegata</label>
            <select value={cassaCollegataId} onChange={function(e) { setCassaCollegataId(e.target.value); }} style={S.select}>
              <option value="">— seleziona cassa —</option>
              {altreCase.map(function(c) {
                return <option key={c.id} value={c.id}>{c.nome}</option>;
              })}
            </select>
          </div>
        )}

        {/* PROVENIENZA / DESTINATARIO */}
        <label style={S.label}>
          {tipoInfo.segno === '-' ? 'Destinatario / Causale' : 'Provenienza / Da chi'}
        </label>
        <input
          type="text"
          placeholder="es. Direttore, Reception, Florestano..."
          value={provenienza}
          onChange={function(e) { setProvenienza(e.target.value); }}
          style={S.input}
        />

        {/* NOTA */}
        <label style={S.label}>Nota</label>
        <textarea
          rows={2} placeholder="Nota libera..."
          value={nota} onChange={function(e) { setNota(e.target.value); }}
          style={Object.assign({}, S.input, { resize: 'vertical', lineHeight: '1.5' })}
        />

        {/* ALERT NON BLOCCANTI */}
        {alertsVivi.length > 0 && (
          <div style={{
            background: '#f59e0b12', border: '1px solid #f59e0b44',
            borderRadius: '8px', padding: '10px 14px', marginBottom: '16px'
          }}>
            {alertsVivi.map(function(a, i) {
              return (
                <div key={i} style={{ color: '#f59e0b', fontSize: '13px', display: 'flex', gap: '8px' }}>
                  <span>⚠</span><span>{a}</span>
                </div>
              );
            })}
            <div style={{ color: '#78716c', fontSize: '12px', marginTop: '6px' }}>
              Puoi salvare comunque — il movimento verrà evidenziato.
            </div>
          </div>
        )}

        {/* ERRORE */}
        {errore && (
          <div style={{
            background: '#ef444412', border: '1px solid #ef444444',
            borderRadius: '8px', padding: '10px 14px', marginBottom: '16px',
            color: '#f87171', fontSize: '13px'
          }}>{errore}</div>
        )}

        {/* PULSANTI */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button onClick={onClose} style={S.btnSecondario}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={Object.assign({}, S.btnPrimario, {
            opacity: saving ? 0.6 : 1, cursor: saving ? 'wait' : 'pointer'
          })}>
            {saving ? 'Salvataggio...' : 'Salva movimento'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RIGA MOVIMENTO ───────────────────────────────────────────
function RigaMovimento(props) {
  var m = props.movimento;
  var onAnnulla = props.onAnnulla;
  var tipoInfo = getTipoInfo(m.tipo);
  var isUscita = tipoInfo.segno === '-';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px 16px', borderRadius: '10px',
      background: m.annullato ? '#161a27' : '#1e2538',
      border: '1px solid ' + (m.alert_centro_costo ? '#f59e0b55' : '#2d3448'),
      opacity: m.annullato ? 0.45 : 1,
      position: 'relative'
    }}>
      <div style={{
        width: '4px', height: '44px', borderRadius: '2px', flexShrink: 0,
        background: m.annullato ? '#374151' : tipoInfo.colore
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: '600' }}>
            {tipoInfo.label}
          </span>
          {m.is_fattoria && (
            <span style={{ background: '#7c3aed22', color: '#a78bfa', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', border: '1px solid #7c3aed44' }}>
              Fattoria
            </span>
          )}
          {m.alert_centro_costo && !m.annullato && (
            <span style={{ background: '#f59e0b18', color: '#f59e0b', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', border: '1px solid #f59e0b55' }}>
              ⚠ no centro costo
            </span>
          )}
          {m.annullato && (
            <span style={{ background: '#37415122', color: '#6b7280', fontSize: '11px', padding: '2px 8px', borderRadius: '10px' }}>
              Annullato
            </span>
          )}
        </div>
        <div style={{ color: '#475569', fontSize: '12px', marginTop: '3px' }}>
          {getMetodoNome(m.metodo_pagamento_id)}
          {m._centro_nome && ' · ' + m._centro_nome}
          {m.provenienza && ' · ' + m.provenienza}
          {m.nota && ' · ' + m.nota}
          {m.ora && <span style={{ marginLeft: '8px', color: '#374151' }}>{m.ora.slice(0, 5)}</span>}
        </div>
      </div>

      <div style={{
        fontFamily: 'Georgia, serif', fontSize: '18px', fontWeight: '700',
        color: m.annullato ? '#374151' : (isUscita ? '#f87171' : '#4ade80'),
        letterSpacing: '-0.5px', flexShrink: 0, paddingRight: '32px'
      }}>
        {isUscita ? '−' : '+'}{formatEuro(m.importo)}
      </div>

      {!m.annullato && onAnnulla && (
        <button
          onClick={function() { onAnnulla(m.id); }}
          title="Annulla movimento"
          style={{
            position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: '#374151',
            cursor: 'pointer', fontSize: '16px', padding: '4px 6px', borderRadius: '6px'
          }}
          onMouseEnter={function(e) { e.currentTarget.style.color = '#f87171'; }}
          onMouseLeave={function(e) { e.currentTarget.style.color = '#374151'; }}
        >✕</button>
      )}
    </div>
  );
}

// ── CARD RIEPILOGO ───────────────────────────────────────────
function CardNum(props) {
  return (
    <div style={{
      background: '#1e2538', borderRadius: '12px', padding: '16px 20px',
      border: '1px solid #2d3448'
    }}>
      <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
        {props.titolo}
      </div>
      <div style={{
        fontFamily: 'Georgia, serif',
        fontSize: props.grande ? '26px' : '20px',
        fontWeight: '700', color: props.colore || '#f8fafc', letterSpacing: '-0.5px'
      }}>
        {formatEuro(props.valore)}
      </div>
      {props.sub && <div style={{ color: '#475569', fontSize: '12px', marginTop: '4px' }}>{props.sub}</div>}
    </div>
  );
}

// ── PAGINA PRINCIPALE ────────────────────────────────────────
export default function CassaPage() {
  var { profile } = useAuth();
  var userId = profile ? profile.id : null;
  var ruolo = profile ? profile.role : '';
  var puoVedereCassaforte = ruolo === 'super_admin' || ruolo === 'direttore' || ruolo === 'proprieta';

  var [cassaId, setCassaId] = useState(CASSE[0].id);
  var [data, setData] = useState(oggiISO());
  var [sezione, setSezione] = useState('movimenti');
  var [movimenti, setMovimenti] = useState([]);
  var [centri, setCentri] = useState([]);
  var [saldoCassaforte, setSaldoCassaforte] = useState(null);
  var [loading, setLoading] = useState(false);
  var [showForm, setShowForm] = useState(false);
  var [msgChiusura, setMsgChiusura] = useState('');

  var cassa = CASSE.find(function(c) { return c.id === cassaId; });

  // Carica centri di costo
  useEffect(function() {
    supabase
      .from('centri_di_costo')
      .select('id, nome')
      .eq('attivo', true)
      .order('nome')
      .then(function(r) {
        if (r.data) setCentri(r.data);
      });
  }, []);

  // Carica movimenti del giorno selezionato
  useEffect(function() {
    setLoading(true);
    setMovimenti([]);
    supabase
      .from('movimenti_cassa')
      .select('*')
      .eq('cassa_id', cassaId)
      .eq('data', data)
      .order('created_at', { ascending: true })
      .then(function(r) {
        setLoading(false);
        if (r.data) setMovimenti(r.data);
      });
  }, [cassaId, data]);

  // Carica saldo cassaforte
  useEffect(function() {
    if (!puoVedereCassaforte) return;
    supabase
      .from('cassaforte_saldo')
      .select('*')
      .limit(1)
      .then(function(r) {
        if (r.data && r.data.length > 0) setSaldoCassaforte(r.data[0]);
      });
  }, [puoVedereCassaforte]);

  // Calcoli riepilogo giornata
  var totFiscale = 0;
  var totFattoria = 0;
  var totPrelievi = 0;
  var saldoContanti = 0;
  var alertsGiornata = [];

  movimenti.forEach(function(m) {
    if (m.annullato) return;
    var tipoInfo = getTipoInfo(m.tipo);
    var isEntrata = tipoInfo.segno === '+';
    var isUscita = tipoInfo.segno === '-';
    var metodo = METODI.find(function(x) { return x.id === m.metodo_pagamento_id; });
    var isContante = metodo && metodo.is_contante;

    if (m.is_fattoria) {
      totFattoria += m.importo;
    } else if (isEntrata && (m.tipo === 'scontrino' || m.tipo === 'fattura' || m.tipo === 'caparra')) {
      totFiscale += m.importo;
    }
    if (m.tipo === 'prelievo') totPrelievi += m.importo;
    if (isContante) {
      if (isEntrata) saldoContanti += m.importo;
      if (isUscita) saldoContanti -= m.importo;
    }
    if (m.alert_centro_costo) {
      alertsGiornata.push('Spesa ' + formatEuro(m.importo) + ' senza centro di costo' + (m.provenienza ? ' (' + m.provenienza + ')' : ''));
    }
  });

  function handleSaveMovimento(salvato) {
    setMovimenti(function(prev) { return prev.concat([salvato]); });
    setShowForm(false);
  }

  function handleAnnulla(id) {
    supabase
      .from('movimenti_cassa')
      .update({ annullato: true, annullato_da: userId, annullato_at: new Date().toISOString() })
      .eq('id', id)
      .then(function(r) {
        if (!r.error) {
          setMovimenti(function(prev) {
            return prev.map(function(m) {
              return m.id === id ? Object.assign({}, m, { annullato: true }) : m;
            });
          });
        }
      });
  }

  function handleChiusura() {
    var chiusura = {
      cassa_id: cassaId,
      data: data,
      turno: 'giornata',
      contanti_apertura: 0,
      contanti_chiusura: saldoContanti,
      totale_scontrini_contanti: 0,
      totale_scontrini_carta: 0,
      totale_scontrini_bonifico: 0,
      totale_scontrini_assegno: 0,
      totale_scontrini_hotel_cloud: 0,
      totale_scontrini_stripe: 0,
      totale_scontrini_pan: 0,
      totale_scontrini_fattoria: totFattoria,
      totale_fatture_contanti: 0,
      totale_fatture_carta: 0,
      totale_fatture_bonifico: 0,
      totale_fatture_hotel_cloud: 0,
      totale_fatture_fattoria: 0,
      totale_versamenti_ricevuti: 0,
      totale_prelievi: totPrelievi,
      totale_trasferimenti_uscita: 0,
      totale_trasferimenti_entrata: 0,
      incasso_fiscale: totFiscale,
      incasso_fattoria: totFattoria,
      incasso_totale: totFiscale + totFattoria,
      quadratura_ok: true,
      differenza_contanti: 0,
      chiusa_da: userId
    };

    // Calcola per metodo
    movimenti.forEach(function(m) {
      if (m.annullato) return;
      var tipoInfo = getTipoInfo(m.tipo);
      var metodo = METODI.find(function(x) { return x.id === m.metodo_pagamento_id; });
      if (!metodo) return;

      if (m.tipo === 'scontrino') {
        if (metodo.nome === 'Contanti') chiusura.totale_scontrini_contanti += m.importo;
        else if (metodo.nome === 'Carta') chiusura.totale_scontrini_carta += m.importo;
        else if (metodo.nome === 'Bonifico') chiusura.totale_scontrini_bonifico += m.importo;
        else if (metodo.nome === 'Assegno') chiusura.totale_scontrini_assegno += m.importo;
        else if (metodo.nome === 'Hotel in Cloud') chiusura.totale_scontrini_hotel_cloud += m.importo;
        else if (metodo.nome === 'Stripe') chiusura.totale_scontrini_stripe += m.importo;
        else if (metodo.nome === 'PAN manuale') chiusura.totale_scontrini_pan += m.importo;
      }
      if (m.tipo === 'fattura') {
        if (metodo.nome === 'Contanti') chiusura.totale_fatture_contanti += m.importo;
        else if (metodo.nome === 'Carta') chiusura.totale_fatture_carta += m.importo;
        else if (metodo.nome === 'Bonifico') chiusura.totale_fatture_bonifico += m.importo;
        else if (metodo.nome === 'Hotel in Cloud') chiusura.totale_fatture_hotel_cloud += m.importo;
      }
      if (m.tipo === 'versamento_ricevuto') chiusura.totale_versamenti_ricevuti += m.importo;
      if (m.tipo === 'trasferimento_uscita') chiusura.totale_trasferimenti_uscita += m.importo;
      if (m.tipo === 'trasferimento_entrata') chiusura.totale_trasferimenti_entrata += m.importo;
    });

    supabase
      .from('chiusure_cassa')
      .insert([chiusura])
      .then(function(r) {
        if (r.error) {
          setMsgChiusura('Errore: ' + r.error.message);
        } else {
          setMsgChiusura('Chiusura registrata con successo per ' + cassa.nome + ' — ' + data);
        }
      });
  }

  // ── RENDER ────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', fontFamily: "'Segoe UI', system-ui, sans-serif", color: '#f8fafc' }}>

      {/* HEADER */}
      <div style={{
        background: '#1a1f2e', borderBottom: '1px solid #2d3448',
        padding: '0 24px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px'
      }}>
        <div style={{ padding: '18px 0', marginRight: '24px' }}>
          <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>I Cacciagalli</div>
          <div style={{ color: '#c9a96e', fontFamily: 'Georgia, serif', fontSize: '18px', fontWeight: '700' }}>Gestione Cassa</div>
        </div>

        {/* Selettore cassa */}
        <div style={{ display: 'flex', gap: '4px', marginRight: '16px' }}>
          {CASSE.map(function(c) {
            var sel = c.id === cassaId;
            return (
              <button key={c.id} onClick={function() { setCassaId(c.id); setMsgChiusura(''); }} style={{
                padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: sel ? '#c9a96e' : 'transparent',
                color: sel ? '#0f1117' : '#64748b',
                fontWeight: sel ? '700' : '400', fontSize: '14px', transition: 'all 0.2s'
              }}>{c.nome}</button>
            );
          })}
        </div>

        {/* Data */}
        <input type="date" value={data} onChange={function(e) { setData(e.target.value); setMsgChiusura(''); }}
          style={{
            background: '#0f1117', border: '1px solid #2d3448', borderRadius: '8px',
            color: '#e2e8f0', padding: '8px 12px', fontSize: '14px', cursor: 'pointer'
          }}
        />

        {/* Tab navigazione */}
        <div style={{ display: 'flex', gap: '2px', marginLeft: 'auto' }}>
          {[
            { id: 'movimenti', label: 'Movimenti' },
            { id: 'chiusura', label: 'Chiusura' },
            puoVedereCassaforte ? { id: 'cassaforte', label: 'Cassaforte' } : null
          ].filter(Boolean).map(function(s) {
            var sel = s.id === sezione;
            return (
              <button key={s.id} onClick={function() { setSezione(s.id); }} style={{
                padding: '8px 16px', border: 'none', cursor: 'pointer',
                background: 'transparent',
                color: sel ? '#c9a96e' : '#64748b',
                fontWeight: sel ? '600' : '400', fontSize: '14px',
                borderBottom: sel ? '3px solid #c9a96e' : '3px solid transparent',
                transition: 'all 0.15s'
              }}>{s.label}</button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: '960px', margin: '0 auto' }}>

        {/* ALERTS GIORNATA */}
        {alertsGiornata.length > 0 && (
          <div style={{
            background: '#f59e0b0e', border: '1px solid #f59e0b44',
            borderRadius: '10px', padding: '12px 16px', marginBottom: '20px'
          }}>
            <div style={{ color: '#f59e0b', fontWeight: '600', fontSize: '13px', marginBottom: '6px' }}>
              ⚠ Attenzione — {cassa.nome} · {data}
            </div>
            {alertsGiornata.map(function(a, i) {
              return <div key={i} style={{ color: '#fbbf24', fontSize: '13px' }}>• {a}</div>;
            })}
          </div>
        )}

        {/* ═══ SEZIONE MOVIMENTI ═══ */}
        {sezione === 'movimenti' && (
          <div>
            {/* Cards riepilogo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              <CardNum titolo="Incasso Fiscale" valore={totFiscale} colore="#4ade80" grande={true} />
              <CardNum titolo="Fattoria" valore={totFattoria} colore="#a78bfa" />
              <CardNum titolo="Prelievi / Spese" valore={totPrelievi} colore="#f87171" />
              <CardNum titolo="Saldo Contanti" valore={saldoContanti} colore="#c9a96e" sub="movimenti contanti del giorno" />
            </div>

            {/* Barra azioni */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ color: '#64748b', fontSize: '14px' }}>
                {loading ? 'Caricamento...' : (movimenti.length === 0 ? 'Nessun movimento' : movimenti.length + ' movimenti')}
              </div>
              <button onClick={function() { setShowForm(true); }} style={{
                background: '#c9a96e', color: '#0f1117', border: 'none',
                borderRadius: '8px', padding: '10px 20px', cursor: 'pointer',
                fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                <span style={{ fontSize: '20px', lineHeight: 1 }}>+</span> Nuovo movimento
              </button>
            </div>

            {/* Lista */}
            {!loading && movimenti.length === 0 ? (
              <div style={{
                background: '#1a1f2e', borderRadius: '12px', padding: '48px',
                textAlign: 'center', border: '1px dashed #2d3448'
              }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
                <div style={{ color: '#475569', fontSize: '15px' }}>
                  Nessun movimento per {cassa.nome} — {data}
                </div>
                <div style={{ color: '#374151', fontSize: '13px', marginTop: '6px' }}>
                  Clicca "Nuovo movimento" per iniziare
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {movimenti.map(function(m) {
                  return (
                    <RigaMovimento
                      key={m.id}
                      movimento={m}
                      onAnnulla={handleAnnulla}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ SEZIONE CHIUSURA ═══ */}
        {sezione === 'chiusura' && (
          <div style={{ background: '#1a1f2e', borderRadius: '16px', padding: '28px', border: '1px solid #2d3448' }}>
            <h2 style={{ color: '#f8fafc', fontFamily: 'Georgia, serif', fontSize: '20px', marginTop: 0, marginBottom: '6px' }}>
              Chiusura Cassa — {cassa.nome}
            </h2>
            <div style={{ color: '#64748b', marginBottom: '24px', fontSize: '14px' }}>
              {data} · {movimenti.filter(function(m) { return !m.annullato; }).length} movimenti attivi
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              <CardNum titolo="Incasso Fiscale" valore={totFiscale} colore="#4ade80" grande={true} />
              <CardNum titolo="Incasso Fattoria" valore={totFattoria} colore="#a78bfa" grande={true} />
              <CardNum titolo="Totale Prelievi" valore={totPrelievi} colore="#f87171" />
              <CardNum titolo="Saldo Contanti" valore={saldoContanti} colore="#c9a96e" />
            </div>

            {/* Riepilogo per metodo */}
            <div style={{ background: '#0f1117', borderRadius: '10px', padding: '16px 20px', border: '1px solid #2d3448', marginBottom: '20px' }}>
              <div style={{ color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                Dettaglio per metodo di pagamento
              </div>
              {METODI.map(function(met) {
                var tot = movimenti.filter(function(m) {
                  return !m.annullato && m.metodo_pagamento_id === met.id;
                }).reduce(function(acc, m) {
                  var ti = getTipoInfo(m.tipo);
                  return acc + (ti.segno === '+' ? m.importo : -m.importo);
                }, 0);
                if (tot === 0) return null;
                return (
                  <div key={met.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: '1px solid #1a1f2e'
                  }}>
                    <span style={{ color: '#94a3b8', fontSize: '14px' }}>{met.nome}</span>
                    <span style={{
                      fontFamily: 'Georgia, serif', fontWeight: '700', fontSize: '15px',
                      color: tot >= 0 ? '#4ade80' : '#f87171'
                    }}>{formatEuro(Math.abs(tot))}</span>
                  </div>
                );
              })}
            </div>

            {msgChiusura && (
              <div style={{
                background: msgChiusura.startsWith('Errore') ? '#ef444412' : '#22c55e12',
                border: '1px solid ' + (msgChiusura.startsWith('Errore') ? '#ef444444' : '#22c55e44'),
                borderRadius: '8px', padding: '12px 16px', marginBottom: '16px',
                color: msgChiusura.startsWith('Errore') ? '#f87171' : '#4ade80', fontSize: '14px'
              }}>{msgChiusura}</div>
            )}

            <button onClick={handleChiusura} style={{
              width: '100%', background: '#c9a96e', color: '#0f1117',
              border: 'none', borderRadius: '10px', padding: '16px',
              fontWeight: '700', fontSize: '16px', cursor: 'pointer'
            }}>
              Conferma Chiusura Cassa
            </button>
          </div>
        )}

        {/* ═══ SEZIONE CASSAFORTE ═══ */}
        {sezione === 'cassaforte' && puoVedereCassaforte && (
          <div style={{ background: '#1a1f2e', borderRadius: '16px', padding: '28px', border: '1px solid #2d3448' }}>
            <h2 style={{ color: '#f8fafc', fontFamily: 'Georgia, serif', fontSize: '20px', marginTop: 0 }}>
              Cassaforte
            </h2>
            <div style={{ background: '#0f1117', borderRadius: '12px', padding: '20px', border: '1px solid #2d3448', marginBottom: '20px' }}>
              <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px' }}>
                Saldo attuale per taglio
              </div>
              {saldoCassaforte ? (
                <div>
                  {[
                    { label: '500€', campo: 'tagli_500', valore: 500 },
                    { label: '200€', campo: 'tagli_200', valore: 200 },
                    { label: '100€', campo: 'tagli_100', valore: 100 },
                    { label: '50€', campo: 'tagli_50', valore: 50 },
                    { label: '20€', campo: 'tagli_20', valore: 20 },
                    { label: '10€', campo: 'tagli_10', valore: 10 },
                    { label: '5€', campo: 'tagli_5', valore: 5 }
                  ].map(function(t) {
                    var quantita = saldoCassaforte[t.campo] || 0;
                    if (quantita === 0) return null;
                    return (
                      <div key={t.campo} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 0', borderBottom: '1px solid #1a1f2e'
                      }}>
                        <span style={{ color: '#94a3b8' }}>Banconote {t.label}</span>
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                          <span style={{ color: '#475569', fontSize: '13px' }}>{quantita} × {t.valore}€</span>
                          <span style={{ color: '#c9a96e', fontFamily: 'Georgia, serif', fontWeight: '700' }}>
                            {formatEuro(quantita * t.valore)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', marginTop: '16px',
                    paddingTop: '12px', borderTop: '2px solid #2d3448'
                  }}>
                    <span style={{ color: '#f8fafc', fontWeight: '700', fontSize: '16px' }}>Totale Cassaforte</span>
                    <span style={{ color: '#c9a96e', fontFamily: 'Georgia, serif', fontSize: '24px', fontWeight: '700' }}>
                      {formatEuro(saldoCassaforte.totale)}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ color: '#475569', textAlign: 'center', padding: '20px' }}>Caricamento...</div>
              )}
            </div>
            <div style={{ color: '#64748b', fontSize: '13px', textAlign: 'center' }}>
              I movimenti cassaforte con dettaglio tagli saranno disponibili nella prossima versione.
            </div>
          </div>
        )}

      </div>

      {/* MODAL FORM */}
      {showForm && (
        <FormMovimento
          cassaId={cassaId}
          centri={centri}
          userId={userId}
          onSave={handleSaveMovimento}
          onClose={function() { setShowForm(false); }}
        />
      )}
    </div>
  );
}

// ── STILI COMUNI ─────────────────────────────────────────────
var S = {
  label: {
    display: 'block', color: '#64748b', fontSize: '12px',
    textTransform: 'uppercase', letterSpacing: '0.8px',
    marginBottom: '6px', marginTop: '0'
  },
  input: {
    width: '100%', background: '#0f1117', border: '1px solid #2d3448',
    borderRadius: '8px', color: '#e2e8f0', padding: '10px 14px',
    fontSize: '15px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px'
  },
  select: {
    width: '100%', background: '#0f1117', border: '1px solid #2d3448',
    borderRadius: '8px', color: '#e2e8f0', padding: '10px 14px',
    fontSize: '15px', outline: 'none', boxSizing: 'border-box',
    marginBottom: '16px', cursor: 'pointer'
  },
  btnPrimario: {
    flex: 1, background: '#c9a96e', color: '#0f1117', border: 'none',
    borderRadius: '8px', padding: '12px 20px', cursor: 'pointer',
    fontWeight: '700', fontSize: '14px'
  },
  btnSecondario: {
    flex: 1, background: 'transparent', color: '#94a3b8',
    border: '1px solid #2d3448', borderRadius: '8px',
    padding: '12px 20px', cursor: 'pointer', fontSize: '14px'
  }
};
