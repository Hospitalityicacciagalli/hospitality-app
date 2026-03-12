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

var ID_CONTANTI = '3a2f24bc-6a09-43cb-b236-ae3e02b62a87';

var TIPI_MOVIMENTO = [
  { value: 'scontrino', label: 'Scontrino', segno: '+' },
  { value: 'fattura', label: 'Fattura', segno: '+' },
  { value: 'versamento_ricevuto', label: 'Versamento ricevuto', segno: '+' },
  { value: 'prelievo', label: 'Prelievo / Spesa', segno: '-' },
  { value: 'trasferimento_uscita', label: 'Trasferimento a cassa', segno: '-' },
  { value: 'trasferimento_entrata', label: 'Trasferimento da cassa', segno: '+' },
  { value: 'caparra', label: 'Caparra evento', segno: '+' },
  { value: 'cassaforte_versamento', label: 'Versamento in cassaforte', segno: '-' },
  { value: 'cassaforte_prelievo', label: 'Prelievo da cassaforte', segno: '+' }
];

var TAGLI = [500, 200, 100, 50, 20, 10, 5];
var TIPI_CHE_RICHIEDONO_CENTRO = ['prelievo', 'cassaforte_versamento'];

function oggiISO() {
  return new Date().toISOString().split('T')[0];
}

function arrotonda(n) {
  return Math.round((n || 0) * 100) / 100;
}

function formatEuro(n) {
  return arrotonda(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function getTipoInfo(value) {
  for (var i = 0; i < TIPI_MOVIMENTO.length; i++) {
    if (TIPI_MOVIMENTO[i].value === value) return TIPI_MOVIMENTO[i];
  }
  return { segno: '+', label: value };
}

function getMetodoNome(id) {
  for (var i = 0; i < METODI.length; i++) {
    if (METODI[i].id === id) return METODI[i].nome;
  }
  return '-';
}

function taglioKey(t) { return 't' + t; }

function taglioVuoto() {
  var t = { spiccioli: '' };
  for (var i = 0; i < TAGLI.length; i++) { t[taglioKey(TAGLI[i])] = 0; }
  return t;
}

function sommaTagli(tagli) {
  var tot = 0;
  for (var i = 0; i < TAGLI.length; i++) {
    tot += (parseInt(tagli[taglioKey(TAGLI[i])], 10) || 0) * TAGLI[i];
  }
  tot += parseFloat(tagli['spiccioli'] || 0);
  return arrotonda(tot);
}

function nuovoPagamento() {
  return {
    uid: Date.now() + Math.random(),
    metodoId: ID_CONTANTI,
    importo: '',
    tagli_ricevuto: taglioVuoto(),
    tagli_resto: taglioVuoto()
  };
}

// ── FORM TAGLI DOPPIO (Ricevuto / Resto) ────────────────────
function FormTagliDoppio(props) {
  var ricevuto = props.ricevuto;
  var resto = props.resto;
  var onChangeRicevuto = props.onChangeRicevuto;
  var onChangeResto = props.onChangeResto;
  var netto = arrotonda(sommaTagli(ricevuto) - sommaTagli(resto));

  function setRiga(obj, campo, val, cb) {
    var nuovo = Object.assign({}, obj);
    if (campo === 'spiccioli') {
      nuovo[campo] = val;
    } else {
      var n = parseInt(val, 10) || 0;
      if (n < 0) n = 0;
      nuovo[campo] = n;
    }
    cb(nuovo);
  }

  function colonna(titolo, colore, tagli, onChange) {
    return (
      <div style={{ flex: 1 }}>
        <div style={{ color: colore, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', fontWeight: '700', textAlign: 'center' }}>{titolo}</div>
        {TAGLI.map(function(t) {
          var k = taglioKey(t);
          var q = tagli[k] || 0;
          return (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <span style={{ color: '#64748b', fontSize: '12px', width: '34px', textAlign: 'right', flexShrink: 0 }}>{t}€</span>
              <input
                type="number" min="0" step="1" value={q}
                onChange={function(e) { setRiga(tagli, k, e.target.value, onChange); }}
                style={{ width: '52px', background: '#0f1117', border: '1px solid #2d3448', borderRadius: '6px', color: '#e2e8f0', padding: '5px 6px', fontSize: '13px', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }}
              />
              {q > 0 && <span style={{ color: '#475569', fontSize: '11px' }}>{formatEuro(q * t)}</span>}
            </div>
          );
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#64748b', fontSize: '12px', width: '34px', textAlign: 'right', flexShrink: 0 }}>€</span>
          <input
            type="number" min="0" step="0.01" placeholder="0.00"
            value={tagli['spiccioli']}
            onChange={function(e) { setRiga(tagli, 'spiccioli', e.target.value, onChange); }}
            style={{ width: '72px', background: '#0f1117', border: '1px solid #2d3448', borderRadius: '6px', color: '#e2e8f0', padding: '5px 6px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
          />
          <span style={{ color: '#64748b', fontSize: '11px' }}>spiccioli</span>
        </div>
        <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #2d3448', color: colore, fontSize: '13px', fontWeight: '700', textAlign: 'right' }}>
          {formatEuro(sommaTagli(tagli))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#0f1117', borderRadius: '10px', padding: '14px', marginBottom: '10px', border: '1px solid #2d3448' }}>
      <div style={{ display: 'flex', gap: '16px' }}>
        {colonna('Ricevuto', '#4ade80', ricevuto, onChangeRicevuto)}
        <div style={{ width: '1px', background: '#2d3448', flexShrink: 0 }} />
        {colonna('Resto dato', '#f87171', resto, onChangeResto)}
      </div>
      <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '2px solid #2d3448', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1f2e', borderRadius: '6px', padding: '8px 12px' }}>
        <span style={{ color: '#94a3b8', fontSize: '13px' }}>Netto contanti</span>
        <span style={{ color: netto >= 0 ? '#c9a96e' : '#f87171', fontFamily: 'Georgia, serif', fontWeight: '700', fontSize: '18px' }}>
          {formatEuro(netto)}
        </span>
      </div>
    </div>
  );
}

// ── RIGA PAGAMENTO ───────────────────────────────────────────
function RigaPagamento(props) {
  var pag = props.pag;
  var residuo = props.residuo;
  var onUpdate = props.onUpdate;
  var onRemove = props.onRemove;
  var puoRimuovere = props.puoRimuovere;
  var isContanti = pag.metodoId === ID_CONTANTI;

  function aggiornaMetodo(id) {
    onUpdate(Object.assign({}, pag, { metodoId: id }));
  }

  function aggiornaImporto(val) {
    onUpdate(Object.assign({}, pag, { importo: val }));
  }

  function usaResiduo() {
    if (residuo > 0) onUpdate(Object.assign({}, pag, { importo: String(arrotonda(residuo)) }));
  }

  function aggiornaRicevuto(nuovi) {
    var netto = arrotonda(sommaTagli(nuovi) - sommaTagli(pag.tagli_resto));
    onUpdate(Object.assign({}, pag, { tagli_ricevuto: nuovi, importo: netto > 0 ? String(netto) : pag.importo }));
  }

  function aggiornaResto(nuovi) {
    var netto = arrotonda(sommaTagli(pag.tagli_ricevuto) - sommaTagli(nuovi));
    onUpdate(Object.assign({}, pag, { tagli_resto: nuovi, importo: netto > 0 ? String(netto) : pag.importo }));
  }

  return (
    <div style={{ background: '#131929', borderRadius: '10px', padding: '14px', border: '1px solid #2d3448', marginBottom: '10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
        {METODI.map(function(m) {
          var sel = m.id === pag.metodoId;
          return (
            <button key={m.id} onClick={function() { aggiornaMetodo(m.id); }} style={{
              padding: '5px 12px', borderRadius: '16px', fontSize: '12px', cursor: 'pointer',
              border: sel ? '2px solid #c9a96e' : '2px solid #2d3448',
              background: sel ? '#c9a96e22' : 'transparent',
              color: sel ? '#c9a96e' : '#64748b', transition: 'all 0.15s'
            }}>{m.nome}</button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: isContanti ? '12px' : '0' }}>
        <input
          type="number" step="0.01" min="0" placeholder="0.00"
          value={pag.importo}
          onChange={function(e) { aggiornaImporto(e.target.value); }}
          style={{ flex: 1, background: '#0f1117', border: '1px solid #2d3448', borderRadius: '8px', color: '#4ade80', padding: '10px 14px', fontSize: '20px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'right', letterSpacing: '-0.5px' }}
        />
        {residuo > 0.009 && (
          <button onClick={usaResiduo} style={{ background: '#c9a96e22', border: '1px solid #c9a96e55', color: '#c9a96e', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            Usa {formatEuro(residuo)}
          </button>
        )}
        {puoRimuovere && (
          <button onClick={onRemove} style={{ background: 'transparent', border: '1px solid #2d3448', color: '#ef4444', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', fontSize: '14px', flexShrink: 0 }}>X</button>
        )}
      </div>

      {isContanti && (
        <FormTagliDoppio
          ricevuto={pag.tagli_ricevuto}
          resto={pag.tagli_resto}
          onChangeRicevuto={aggiornaRicevuto}
          onChangeResto={aggiornaResto}
        />
      )}
    </div>
  );
}

// ── FORM MOVIMENTO ───────────────────────────────────────────
function FormMovimento(props) {
  var cassaId = props.cassaId;
  var onSave = props.onSave;
  var onClose = props.onClose;
  var centri = props.centri;
  var userId = props.userId;
  var movimentoEsistente = props.movimento || null;
  var altreCase = CASSE.filter(function(c) { return c.id !== cassaId; });
  var isModifica = movimentoEsistente !== null;

  var [tipo, setTipo] = useState(isModifica ? movimentoEsistente.tipo : 'scontrino');
  var [totaleStr, setTotaleStr] = useState(isModifica ? String(movimentoEsistente.importo) : '');
  var [pagamenti, setPagamenti] = useState([nuovoPagamento()]);
  var [isfattoria, setIsfattoria] = useState(isModifica ? movimentoEsistente.is_fattoria : false);
  var [centroCostoId, setCentroCostoId] = useState(isModifica ? (movimentoEsistente.centro_di_costo_id || '') : '');
  var [provenienza, setProvenienza] = useState(isModifica ? (movimentoEsistente.provenienza || '') : '');
  var [cassaCollegataId, setCassaCollegataId] = useState(isModifica ? (movimentoEsistente.cassa_collegata_id || '') : '');
  var [nota, setNota] = useState(isModifica ? (movimentoEsistente.nota || '') : '');
  var [saving, setSaving] = useState(false);
  var [errore, setErrore] = useState('');

  var tipoInfo = getTipoInfo(tipo);
  var isEntrata = tipoInfo.segno === '+';
  var richiedeCentro = TIPI_CHE_RICHIEDONO_CENTRO.indexOf(tipo) !== -1;
  var richiedeCassa = tipo === 'trasferimento_uscita' || tipo === 'trasferimento_entrata';
  var totale = parseFloat(totaleStr) || 0;
  var sommaPagamenti = arrotonda(pagamenti.reduce(function(acc, p) { return acc + (parseFloat(p.importo) || 0); }, 0));
  var residuo = arrotonda(totale - sommaPagamenti);
  var saldato = totale > 0 && Math.abs(residuo) < 0.01;

  function aggiornaPagamento(uid, nuovoPag) {
    setPagamenti(function(prev) { return prev.map(function(p) { return p.uid === uid ? nuovoPag : p; }); });
  }

  function rimuoviPagamento(uid) {
    setPagamenti(function(prev) { return prev.filter(function(p) { return p.uid !== uid; }); });
  }

  function aggiungiPagamento() {
    setPagamenti(function(prev) { return prev.concat([nuovoPagamento()]); });
  }

  var alertsVivi = [];
  if (richiedeCentro && !centroCostoId) alertsVivi.push('Nessun centro di costo selezionato.');
  if (isfattoria && !nota) alertsVivi.push('Movimento Fattoria senza nota esplicativa.');
  if (richiedeCassa && !cassaCollegataId) alertsVivi.push('Trasferimento senza cassa collegata.');

  function handleSave() {
    if (totale <= 0) { setErrore('Inserisci il totale del movimento.'); return; }
    if (!saldato) { setErrore('Il totale dei pagamenti (' + formatEuro(sommaPagamenti) + ') non corrisponde al totale (' + formatEuro(totale) + ').'); return; }
    setErrore('');
    setSaving(true);

    var gruppoId = pagamenti.length > 1 ? ('grp_' + Date.now()) : null;
    var ora = new Date().toTimeString().slice(0, 8);
    var dataOggi = oggiISO();

    var righe = [];
    pagamenti.forEach(function(pag) {
      var imp = parseFloat(pag.importo) || 0;
      if (imp <= 0) return;
      righe.push({
        cassa_id: cassaId, data: dataOggi, ora: ora, tipo: tipo,
        metodo_pagamento_id: pag.metodoId,
        importo: imp,
        is_fattoria: isfattoria,
        centro_di_costo_id: centroCostoId || null,
        provenienza: provenienza || null,
        cassa_collegata_id: cassaCollegataId || null,
        nota: gruppoId ? ((nota ? nota + ' ' : '') + '(totale ' + formatEuro(totale) + ')') : (nota || null),
        alert_centro_costo: richiedeCentro && !centroCostoId,
        annullato: false,
        inserito_da: userId || null,
        _tagli: pag.metodoId === ID_CONTANTI ? { ricevuto: pag.tagli_ricevuto, resto: pag.tagli_resto } : null,
        _gruppo: gruppoId
      });
    });

    var righeDB = righe.map(function(r) {
      return {
        cassa_id: r.cassa_id, data: r.data, ora: r.ora, tipo: r.tipo,
        metodo_pagamento_id: r.metodo_pagamento_id, importo: r.importo,
        is_fattoria: r.is_fattoria, centro_di_costo_id: r.centro_di_costo_id,
        provenienza: r.provenienza, cassa_collegata_id: r.cassa_collegata_id,
        nota: r.nota, alert_centro_costo: r.alert_centro_costo,
        annullato: r.annullato, inserito_da: r.inserito_da
      };
    });

    supabase.from('movimenti_cassa').insert(righeDB).select().then(function(result) {
      setSaving(false);
      if (result.error) { setErrore('Errore: ' + result.error.message); return; }
      var salvati = result.data.map(function(salvato, idx) {
        var riga = righe[idx] || righe[0];
        if (centroCostoId) {
          for (var i = 0; i < centri.length; i++) {
            if (centri[i].id === centroCostoId) { salvato._centro_nome = centri[i].nome; break; }
          }
        }
        if (riga._tagli) salvato._tagli = riga._tagli;
        if (riga._gruppo) salvato._gruppo = riga._gruppo;
        return salvato;
      });
      onSave(salvati, isModifica);
    });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
      <div style={{ background: '#1a1f2e', borderRadius: '16px', width: '100%', maxWidth: '580px', padding: '28px', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', border: '1px solid #2d3448', maxHeight: '94vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ color: '#f8fafc', fontFamily: 'Georgia, serif', fontSize: '20px', margin: 0 }}>
            {isModifica ? 'Modifica Movimento' : 'Nuovo Movimento'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '24px', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>x</button>
        </div>

        <label style={S.label}>Tipo movimento</label>
        <select value={tipo} onChange={function(e) { setTipo(e.target.value); }} style={S.select}>
          {TIPI_MOVIMENTO.map(function(t) {
            return <option key={t.value} value={t.value}>{t.segno === '+' ? 'ENTRATA' : 'USCITA'} - {t.label}</option>;
          })}
        </select>

        <label style={S.label}>Totale {isEntrata ? 'incassato' : 'pagato'} (euro)</label>
        <input
          type="number" step="0.01" min="0" placeholder="0.00"
          value={totaleStr}
          onChange={function(e) { setTotaleStr(e.target.value); }}
          style={Object.assign({}, S.input, {
            fontSize: '32px', textAlign: 'right',
            color: isEntrata ? '#4ade80' : '#f87171',
            fontWeight: '700', letterSpacing: '-1px',
            borderColor: totale > 0 ? (isEntrata ? '#22c55e55' : '#ef444455') : '#2d3448',
            background: totale > 0 ? (isEntrata ? '#0a1f0a' : '#1f0a0a') : '#0f1117'
          })}
        />

        {totale > 0 && (
          <div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderRadius: '8px', marginBottom: '12px',
              background: saldato ? '#22c55e12' : (sommaPagamenti > 0 ? '#f59e0b12' : '#1e2538'),
              border: '1px solid ' + (saldato ? '#22c55e44' : (sommaPagamenti > 0 ? '#f59e0b44' : '#2d3448'))
            }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                {saldato ? 'Pagamento completo' : (sommaPagamenti > 0 ? 'Residuo da saldare' : 'Da ripartire')}
              </span>
              <span style={{ fontFamily: 'Georgia, serif', fontWeight: '700', fontSize: '16px', color: saldato ? '#4ade80' : (sommaPagamenti > 0 ? '#f59e0b' : '#64748b') }}>
                {saldato ? formatEuro(totale) : formatEuro(residuo > 0 ? residuo : totale)}
              </span>
            </div>

            {pagamenti.map(function(pag) {
              return (
                <RigaPagamento
                  key={pag.uid}
                  pag={pag}
                  residuo={residuo}
                  onUpdate={function(np) { aggiornaPagamento(pag.uid, np); }}
                  onRemove={function() { rimuoviPagamento(pag.uid); }}
                  puoRimuovere={pagamenti.length > 1}
                />
              );
            })}

            {!saldato && (
              <button onClick={aggiungiPagamento} style={{ width: '100%', background: 'transparent', border: '1px dashed #2d3448', color: '#64748b', borderRadius: '8px', padding: '10px', cursor: 'pointer', fontSize: '13px', marginBottom: '16px' }}
                onMouseEnter={function(e) { e.currentTarget.style.borderColor = '#c9a96e'; e.currentTarget.style.color = '#c9a96e'; }}
                onMouseLeave={function(e) { e.currentTarget.style.borderColor = '#2d3448'; e.currentTarget.style.color = '#64748b'; }}>
                + Aggiungi pagamento
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 16px' }}>
          <input type="checkbox" id="chk-fattoria" checked={isfattoria}
            onChange={function(e) { setIsfattoria(e.target.checked); }}
            style={{ width: '18px', height: '18px', accentColor: '#c9a96e', cursor: 'pointer' }}
          />
          <label htmlFor="chk-fattoria" style={{ color: '#94a3b8', fontSize: '14px', cursor: 'pointer' }}>Fattoria</label>
        </div>

        <label style={S.label}>
          Centro di costo
          {richiedeCentro && <span style={{ color: '#f59e0b', marginLeft: '6px', fontSize: '11px', textTransform: 'none', letterSpacing: 0 }}>consigliato per spese</span>}
        </label>
        <select value={centroCostoId} onChange={function(e) { setCentroCostoId(e.target.value); }} style={S.select}>
          <option value="">nessuno</option>
          {centri.map(function(c) { return <option key={c.id} value={c.id}>{c.nome}</option>; })}
        </select>

        {richiedeCassa && (
          <div>
            <label style={S.label}>Cassa collegata</label>
            <select value={cassaCollegataId} onChange={function(e) { setCassaCollegataId(e.target.value); }} style={S.select}>
              <option value="">seleziona cassa</option>
              {altreCase.map(function(c) { return <option key={c.id} value={c.id}>{c.nome}</option>; })}
            </select>
          </div>
        )}

        <label style={S.label}>{tipoInfo.segno === '-' ? 'Destinatario / Causale' : 'Provenienza / Da chi'}</label>
        <input type="text" placeholder="es. Tavolo 5, Cliente Rossi, Direttore..." value={provenienza} onChange={function(e) { setProvenienza(e.target.value); }} style={S.input} />

        <label style={S.label}>Nota</label>
        <textarea rows={2} placeholder="Nota libera..." value={nota} onChange={function(e) { setNota(e.target.value); }} style={Object.assign({}, S.input, { resize: 'vertical', lineHeight: '1.5' })} />

        {alertsVivi.length > 0 && (
          <div style={{ background: '#f59e0b10', border: '1px solid #f59e0b44', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
            {alertsVivi.map(function(a, i) {
              return <div key={i} style={{ color: '#f59e0b', fontSize: '13px', display: 'flex', gap: '8px' }}><span>!</span><span>{a}</span></div>;
            })}
          </div>
        )}

        {errore && <div style={{ background: '#ef444412', border: '1px solid #ef444444', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', color: '#f87171', fontSize: '13px' }}>{errore}</div>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button onClick={onClose} style={S.btnSecondario}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={Object.assign({}, S.btnPrimario, { opacity: saving ? 0.6 : 1 })}>
            {saving ? 'Salvataggio...' : (isModifica ? 'Aggiorna' : 'Salva')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RIEPILOGO TAGLI IN CASSA ─────────────────────────────────
function RiepilogoTagliCassa(props) {
  var tagliCassa = props.tagliCassa;
  var totale = arrotonda(tagliCassa._totale || 0);
  if (totale <= 0) return null;

  return (
    <div style={{ background: '#1e2538', borderRadius: '12px', padding: '16px 20px', border: '1px solid #2d3448', marginBottom: '16px' }}>
      <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Contanti in cassa per taglio</div>
      {TAGLI.map(function(t) {
        var q = tagliCassa[taglioKey(t)] || 0;
        if (q === 0) return null;
        return (
          <div key={t} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #1a1f2e' }}>
            <span style={{ color: '#94a3b8', fontSize: '13px' }}>{q} x {t}€</span>
            <span style={{ color: '#c9a96e', fontFamily: 'Georgia, serif', fontWeight: '600', fontSize: '14px' }}>{formatEuro(q * t)}</span>
          </div>
        );
      })}
      {(tagliCassa['spiccioli'] || 0) > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #1a1f2e' }}>
          <span style={{ color: '#94a3b8', fontSize: '13px' }}>Spiccioli</span>
          <span style={{ color: '#c9a96e', fontFamily: 'Georgia, serif', fontWeight: '600', fontSize: '14px' }}>{formatEuro(tagliCassa['spiccioli'])}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', paddingTop: '8px', borderTop: '2px solid #2d3448' }}>
        <span style={{ color: '#f8fafc', fontWeight: '700', fontSize: '14px' }}>Totale contanti</span>
        <span style={{ color: '#c9a96e', fontFamily: 'Georgia, serif', fontWeight: '700', fontSize: '20px' }}>{formatEuro(totale)}</span>
      </div>
    </div>
  );
}

// ── RIGA MOVIMENTO ───────────────────────────────────────────
function RigaMovimento(props) {
  var m = props.movimento;
  var onAnnulla = props.onAnnulla;
  var onModifica = props.onModifica;
  var tipoInfo = getTipoInfo(m.tipo);
  var isUscita = tipoInfo.segno === '-';
  var coloreRiga = m.annullato ? '#161a27' : (isUscita ? '#2a1a1a' : '#1a2a1a');
  var coloreBordo = m.annullato ? '#2d3448' : (m.alert_centro_costo ? '#f59e0b55' : (isUscita ? '#7f1d1d55' : '#14532d55'));
  var coloreImporto = m.annullato ? '#374151' : (isUscita ? '#f87171' : '#4ade80');
  var coloreAccento = m.annullato ? '#374151' : (isUscita ? '#ef4444' : '#22c55e');

  var tagliBadge = [];
  if (m._tagli && m._tagli.ricevuto) {
    TAGLI.forEach(function(t) {
      var qr = parseInt(m._tagli.ricevuto[taglioKey(t)], 10) || 0;
      var qd = parseInt(m._tagli.resto[taglioKey(t)], 10) || 0;
      var q = qr - qd;
      if (q !== 0) tagliBadge.push({ label: (q > 0 ? '+' : '') + q + 'x' + t + 'eu', neg: q < 0 });
    });
    var spr = parseFloat(m._tagli.ricevuto['spiccioli'] || 0);
    var spd = parseFloat(m._tagli.resto['spiccioli'] || 0);
    var sp = arrotonda(spr - spd);
    if (Math.abs(sp) > 0.001) tagliBadge.push({ label: (sp > 0 ? '+' : '') + formatEuro(sp), neg: sp < 0 });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '10px', background: coloreRiga, border: '1px solid ' + coloreBordo, opacity: m.annullato ? 0.5 : 1, position: 'relative' }}>
      <div style={{ width: '4px', height: '44px', borderRadius: '2px', flexShrink: 0, background: coloreAccento }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: '600' }}>{tipoInfo.label}</span>
          {m._gruppo && <span style={{ background: '#3730a322', color: '#818cf8', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', border: '1px solid #3730a344' }}>multiplo</span>}
          {m.is_fattoria && <span style={{ background: '#7c3aed22', color: '#a78bfa', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', border: '1px solid #7c3aed44' }}>Fattoria</span>}
          {m.alert_centro_costo && !m.annullato && <span style={{ background: '#f59e0b18', color: '#f59e0b', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', border: '1px solid #f59e0b55' }}>no centro costo</span>}
          {m.annullato && <span style={{ background: '#37415122', color: '#6b7280', fontSize: '11px', padding: '2px 8px', borderRadius: '10px' }}>Annullato</span>}
        </div>
        <div style={{ color: '#475569', fontSize: '12px', marginTop: '3px' }}>
          {getMetodoNome(m.metodo_pagamento_id)}
          {m._centro_nome && ' - ' + m._centro_nome}
          {m.provenienza && ' - ' + m.provenienza}
          {m.nota && ' - ' + m.nota}
          {m.ora && <span style={{ marginLeft: '8px', color: '#374151' }}>{String(m.ora).slice(0, 5)}</span>}
        </div>
        {tagliBadge.length > 0 && (
          <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {tagliBadge.map(function(b, i) {
              return <span key={i} style={{ background: '#0f1117', color: b.neg ? '#f87171' : '#64748b', fontSize: '11px', padding: '2px 6px', borderRadius: '6px' }}>{b.label}</span>;
            })}
          </div>
        )}
      </div>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: '18px', fontWeight: '700', color: coloreImporto, letterSpacing: '-0.5px', flexShrink: 0, paddingRight: m.annullato ? '12px' : '76px' }}>
        {isUscita ? '-' : '+'}{formatEuro(m.importo)}
      </div>
      {!m.annullato && (
        <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '4px' }}>
          <button onClick={function() { onModifica(m); }} title="Modifica"
            style={{ background: '#1e2538', border: '1px solid #2d3448', color: '#64748b', cursor: 'pointer', fontSize: '12px', padding: '5px 9px', borderRadius: '6px' }}
            onMouseEnter={function(e) { e.currentTarget.style.color = '#c9a96e'; }}
            onMouseLeave={function(e) { e.currentTarget.style.color = '#64748b'; }}>M</button>
          <button onClick={function() { onAnnulla(m.id); }} title="Annulla"
            style={{ background: '#1e2538', border: '1px solid #2d3448', color: '#64748b', cursor: 'pointer', fontSize: '12px', padding: '5px 9px', borderRadius: '6px' }}
            onMouseEnter={function(e) { e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={function(e) { e.currentTarget.style.color = '#64748b'; }}>X</button>
        </div>
      )}
    </div>
  );
}

// ── CARD NUMERO ──────────────────────────────────────────────
function CardNum(props) {
  return (
    <div style={{ background: '#1e2538', borderRadius: '12px', padding: '16px 20px', border: '1px solid #2d3448' }}>
      <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{props.titolo}</div>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: props.grande ? '26px' : '20px', fontWeight: '700', color: props.colore || '#f8fafc', letterSpacing: '-0.5px' }}>
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
  var [saldoContantiStorico, setSaldoContantiStorico] = useState(0);
  var [saldoCassaforte, setSaldoCassaforte] = useState(null);
  var [loading, setLoading] = useState(false);
  var [showForm, setShowForm] = useState(false);
  var [movimentoDaModificare, setMovimentoDaModificare] = useState(null);
  var [msgChiusura, setMsgChiusura] = useState('');

  var cassa = CASSE.find(function(c) { return c.id === cassaId; });

  useEffect(function() {
    supabase.from('centri_di_costo').select('id, nome').eq('attivo', true).order('nome').then(function(r) {
      if (r.data) setCentri(r.data);
    });
  }, []);

  useEffect(function() {
    supabase.from('movimenti_cassa').select('tipo, metodo_pagamento_id, importo')
      .eq('cassa_id', cassaId).eq('annullato', false).eq('metodo_pagamento_id', ID_CONTANTI).lt('data', data)
      .then(function(r) {
        if (!r.data) { setSaldoContantiStorico(0); return; }
        var saldo = 0;
        r.data.forEach(function(m) {
          var ti = getTipoInfo(m.tipo);
          if (ti.segno === '+') saldo += m.importo; else saldo -= m.importo;
        });
        setSaldoContantiStorico(arrotonda(saldo));
      });
  }, [cassaId, data]);

  useEffect(function() {
    setLoading(true); setMovimenti([]);
    supabase.from('movimenti_cassa').select('*').eq('cassa_id', cassaId).eq('data', data).order('created_at', { ascending: true })
      .then(function(r) { setLoading(false); if (r.data) setMovimenti(r.data); });
  }, [cassaId, data]);

  useEffect(function() {
    if (!puoVedereCassaforte) return;
    supabase.from('cassaforte_saldo').select('*').limit(1).then(function(r) {
      if (r.data && r.data.length > 0) setSaldoCassaforte(r.data[0]);
    });
  }, [puoVedereCassaforte]);

  var totFiscaleGiorno = 0;
  var totPrelieviGiorno = 0;
  var contantiGiorno = 0;
  var tagliCassaAgg = { spiccioli: 0, _totale: 0 };
  for (var ii = 0; ii < TAGLI.length; ii++) { tagliCassaAgg[taglioKey(TAGLI[ii])] = 0; }
  var alertsGiornata = [];

  movimenti.forEach(function(m) {
    if (m.annullato) return;
    var ti = getTipoInfo(m.tipo);
    var isEnt = ti.segno === '+';
    var isUsc = ti.segno === '-';
    var isCont = m.metodo_pagamento_id === ID_CONTANTI;
    if (!m.is_fattoria && isEnt && (m.tipo === 'scontrino' || m.tipo === 'fattura' || m.tipo === 'caparra')) totFiscaleGiorno += m.importo;
    if (m.tipo === 'prelievo') totPrelieviGiorno += m.importo;
    if (isCont) {
      if (isEnt) contantiGiorno += m.importo;
      if (isUsc) contantiGiorno -= m.importo;
      if (m._tagli && m._tagli.ricevuto) {
        TAGLI.forEach(function(t) {
          var k = taglioKey(t);
          var qr = parseInt(m._tagli.ricevuto[k], 10) || 0;
          var qd = parseInt(m._tagli.resto[k], 10) || 0;
          var netto = isEnt ? (qr - qd) : -(qr - qd);
          tagliCassaAgg[k] = (tagliCassaAgg[k] || 0) + netto;
        });
        var spr = parseFloat(m._tagli.ricevuto['spiccioli'] || 0);
        var spd = parseFloat(m._tagli.resto['spiccioli'] || 0);
        var spn = isEnt ? (spr - spd) : -(spr - spd);
        tagliCassaAgg['spiccioli'] = arrotonda((tagliCassaAgg['spiccioli'] || 0) + spn);
      }
    }
    if (m.alert_centro_costo) alertsGiornata.push('Spesa ' + formatEuro(m.importo) + ' senza centro di costo' + (m.provenienza ? ' (' + m.provenienza + ')' : ''));
  });

  var saldoContantiTotale = arrotonda(saldoContantiStorico + contantiGiorno);
  tagliCassaAgg._totale = saldoContantiTotale;

  function handleSaveMovimento(salvati, isModifica) {
    if (isModifica) {
      var s = salvati[0];
      setMovimenti(function(prev) { return prev.map(function(m) { return m.id === s.id ? s : m; }); });
    } else {
      setMovimenti(function(prev) { return prev.concat(salvati); });
    }
    setShowForm(false);
    setMovimentoDaModificare(null);
  }

  function handleAnnulla(id) {
    supabase.from('movimenti_cassa').update({ annullato: true, annullato_da: userId, annullato_at: new Date().toISOString() }).eq('id', id)
      .then(function(r) {
        if (!r.error) setMovimenti(function(prev) { return prev.map(function(m) { return m.id === id ? Object.assign({}, m, { annullato: true }) : m; }); });
      });
  }

  function handleModifica(movimento) { setMovimentoDaModificare(movimento); setShowForm(true); }

  function handleChiusura() {
    var chiusura = {
      cassa_id: cassaId, data: data, turno: 'giornata',
      contanti_apertura: saldoContantiStorico, contanti_chiusura: saldoContantiTotale,
      totale_scontrini_contanti: 0, totale_scontrini_carta: 0, totale_scontrini_bonifico: 0,
      totale_scontrini_assegno: 0, totale_scontrini_hotel_cloud: 0, totale_scontrini_stripe: 0,
      totale_scontrini_pan: 0, totale_scontrini_fattoria: 0,
      totale_fatture_contanti: 0, totale_fatture_carta: 0, totale_fatture_bonifico: 0,
      totale_fatture_hotel_cloud: 0, totale_fatture_fattoria: 0,
      totale_versamenti_ricevuti: 0, totale_prelievi: totPrelieviGiorno,
      totale_trasferimenti_uscita: 0, totale_trasferimenti_entrata: 0,
      incasso_fiscale: totFiscaleGiorno, incasso_fattoria: 0, incasso_totale: totFiscaleGiorno,
      quadratura_ok: true, differenza_contanti: 0, chiusa_da: userId
    };
    movimenti.forEach(function(m) {
      if (m.annullato) return;
      var met = METODI.find(function(x) { return x.id === m.metodo_pagamento_id; });
      if (!met) return;
      if (m.tipo === 'scontrino') {
        if (met.nome === 'Contanti') chiusura.totale_scontrini_contanti += m.importo;
        else if (met.nome === 'Carta') chiusura.totale_scontrini_carta += m.importo;
        else if (met.nome === 'Bonifico') chiusura.totale_scontrini_bonifico += m.importo;
        else if (met.nome === 'Assegno') chiusura.totale_scontrini_assegno += m.importo;
        else if (met.nome === 'Hotel in Cloud') chiusura.totale_scontrini_hotel_cloud += m.importo;
        else if (met.nome === 'Stripe') chiusura.totale_scontrini_stripe += m.importo;
        else if (met.nome === 'PAN manuale') chiusura.totale_scontrini_pan += m.importo;
      }
      if (m.tipo === 'fattura') {
        if (met.nome === 'Contanti') chiusura.totale_fatture_contanti += m.importo;
        else if (met.nome === 'Carta') chiusura.totale_fatture_carta += m.importo;
        else if (met.nome === 'Bonifico') chiusura.totale_fatture_bonifico += m.importo;
        else if (met.nome === 'Hotel in Cloud') chiusura.totale_fatture_hotel_cloud += m.importo;
      }
      if (m.tipo === 'versamento_ricevuto') chiusura.totale_versamenti_ricevuti += m.importo;
      if (m.tipo === 'trasferimento_uscita') chiusura.totale_trasferimenti_uscita += m.importo;
      if (m.tipo === 'trasferimento_entrata') chiusura.totale_trasferimenti_entrata += m.importo;
    });
    supabase.from('chiusure_cassa').insert([chiusura]).then(function(r) {
      if (r.error) setMsgChiusura('Errore: ' + r.error.message);
      else setMsgChiusura('Chiusura registrata - ' + cassa.nome + ' - ' + data);
    });
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', fontFamily: "'Segoe UI', system-ui, sans-serif", color: '#f8fafc' }}>
      <div style={{ background: '#1a1f2e', borderBottom: '1px solid #2d3448', padding: '0 24px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ padding: '18px 0', marginRight: '24px' }}>
          <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>I Cacciagalli</div>
          <div style={{ color: '#c9a96e', fontFamily: 'Georgia, serif', fontSize: '18px', fontWeight: '700' }}>Gestione Cassa</div>
        </div>
        <div style={{ display: 'flex', gap: '4px', marginRight: '16px' }}>
          {CASSE.map(function(c) {
            var sel = c.id === cassaId;
            return <button key={c.id} onClick={function() { setCassaId(c.id); setMsgChiusura(''); }} style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: sel ? '#c9a96e' : 'transparent', color: sel ? '#0f1117' : '#64748b', fontWeight: sel ? '700' : '400', fontSize: '14px' }}>{c.nome}</button>;
          })}
        </div>
        <input type="date" value={data} onChange={function(e) { setData(e.target.value); setMsgChiusura(''); }}
          style={{ background: '#0f1117', border: '1px solid #2d3448', borderRadius: '8px', color: '#e2e8f0', padding: '8px 12px', fontSize: '14px', cursor: 'pointer' }} />
        <div style={{ display: 'flex', gap: '2px', marginLeft: 'auto' }}>
          {[{ id: 'movimenti', label: 'Movimenti' }, { id: 'chiusura', label: 'Chiusura' }, puoVedereCassaforte ? { id: 'cassaforte', label: 'Cassaforte' } : null].filter(Boolean).map(function(s) {
            var sel = s.id === sezione;
            return <button key={s.id} onClick={function() { setSezione(s.id); }} style={{ padding: '8px 16px', border: 'none', cursor: 'pointer', background: 'transparent', color: sel ? '#c9a96e' : '#64748b', fontWeight: sel ? '600' : '400', fontSize: '14px', borderBottom: sel ? '3px solid #c9a96e' : '3px solid transparent' }}>{s.label}</button>;
          })}
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: '960px', margin: '0 auto' }}>
        {alertsGiornata.length > 0 && (
          <div style={{ background: '#f59e0b0e', border: '1px solid #f59e0b44', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
            <div style={{ color: '#f59e0b', fontWeight: '600', fontSize: '13px', marginBottom: '6px' }}>Attenzione - {cassa.nome} - {data}</div>
            {alertsGiornata.map(function(a, i) { return <div key={i} style={{ color: '#fbbf24', fontSize: '13px' }}>- {a}</div>; })}
          </div>
        )}

        {sezione === 'movimenti' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              <CardNum titolo="Incasso Fiscale" valore={totFiscaleGiorno} colore="#4ade80" grande={true} />
              <CardNum titolo="Prelievi / Spese" valore={totPrelieviGiorno} colore="#f87171" />
              <CardNum titolo="Fondo cassa iniziale" valore={saldoContantiStorico} colore="#94a3b8" sub="contanti giorni precedenti" />
              <CardNum titolo="Contanti in cassa" valore={saldoContantiTotale} colore="#c9a96e" grande={true} sub="fondo + movimenti oggi" />
            </div>
            <RiepilogoTagliCassa tagliCassa={tagliCassaAgg} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ color: '#64748b', fontSize: '14px' }}>{loading ? 'Caricamento...' : (movimenti.length === 0 ? 'Nessun movimento' : movimenti.length + ' movimenti')}</div>
              <button onClick={function() { setMovimentoDaModificare(null); setShowForm(true); }} style={{ background: '#c9a96e', color: '#0f1117', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>+ Nuovo movimento</button>
            </div>
            {!loading && movimenti.length === 0 ? (
              <div style={{ background: '#1a1f2e', borderRadius: '12px', padding: '48px', textAlign: 'center', border: '1px dashed #2d3448' }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
                <div style={{ color: '#475569', fontSize: '15px' }}>Nessun movimento per {cassa.nome} - {data}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {movimenti.map(function(m) { return <RigaMovimento key={m.id} movimento={m} onAnnulla={handleAnnulla} onModifica={handleModifica} />; })}
              </div>
            )}
          </div>
        )}

        {sezione === 'chiusura' && (
          <div style={{ background: '#1a1f2e', borderRadius: '16px', padding: '28px', border: '1px solid #2d3448' }}>
            <h2 style={{ color: '#f8fafc', fontFamily: 'Georgia, serif', fontSize: '20px', marginTop: 0, marginBottom: '6px' }}>Chiusura Cassa - {cassa.nome}</h2>
            <div style={{ color: '#64748b', marginBottom: '24px', fontSize: '14px' }}>{data} - {movimenti.filter(function(m) { return !m.annullato; }).length} movimenti attivi</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              <CardNum titolo="Incasso Fiscale" valore={totFiscaleGiorno} colore="#4ade80" grande={true} />
              <CardNum titolo="Totale Prelievi" valore={totPrelieviGiorno} colore="#f87171" />
              <CardNum titolo="Fondo iniziale contanti" valore={saldoContantiStorico} colore="#94a3b8" />
              <CardNum titolo="Contanti fine giornata" valore={saldoContantiTotale} colore="#c9a96e" grande={true} />
            </div>
            <div style={{ background: '#0f1117', borderRadius: '10px', padding: '16px 20px', border: '1px solid #2d3448', marginBottom: '20px' }}>
              <div style={{ color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Dettaglio per metodo</div>
              {METODI.map(function(met) {
                var tot = movimenti.filter(function(m) { return !m.annullato && m.metodo_pagamento_id === met.id; }).reduce(function(acc, m) { var ti = getTipoInfo(m.tipo); return acc + (ti.segno === '+' ? m.importo : -m.importo); }, 0);
                if (Math.abs(tot) < 0.001) return null;
                return (
                  <div key={met.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1a1f2e' }}>
                    <span style={{ color: '#94a3b8', fontSize: '14px' }}>{met.nome}</span>
                    <span style={{ fontFamily: 'Georgia, serif', fontWeight: '700', fontSize: '15px', color: tot >= 0 ? '#4ade80' : '#f87171' }}>{formatEuro(Math.abs(tot))}</span>
                  </div>
                );
              })}
            </div>
            {msgChiusura && (
              <div style={{ background: msgChiusura.startsWith('Errore') ? '#ef444412' : '#22c55e12', border: '1px solid ' + (msgChiusura.startsWith('Errore') ? '#ef444444' : '#22c55e44'), borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: msgChiusura.startsWith('Errore') ? '#f87171' : '#4ade80', fontSize: '14px' }}>{msgChiusura}</div>
            )}
            <button onClick={handleChiusura} style={{ width: '100%', background: '#c9a96e', color: '#0f1117', border: 'none', borderRadius: '10px', padding: '16px', fontWeight: '700', fontSize: '16px', cursor: 'pointer' }}>Conferma Chiusura Cassa</button>
          </div>
        )}

        {sezione === 'cassaforte' && puoVedereCassaforte && (
          <div style={{ background: '#1a1f2e', borderRadius: '16px', padding: '28px', border: '1px solid #2d3448' }}>
            <h2 style={{ color: '#f8fafc', fontFamily: 'Georgia, serif', fontSize: '20px', marginTop: 0 }}>Cassaforte</h2>
            <div style={{ background: '#0f1117', borderRadius: '12px', padding: '20px', border: '1px solid #2d3448', marginBottom: '20px' }}>
              <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px' }}>Saldo attuale per taglio</div>
              {saldoCassaforte ? (
                <div>
                  {[{ campo: 'tagli_500', valore: 500 }, { campo: 'tagli_200', valore: 200 }, { campo: 'tagli_100', valore: 100 }, { campo: 'tagli_50', valore: 50 }, { campo: 'tagli_20', valore: 20 }, { campo: 'tagli_10', valore: 10 }, { campo: 'tagli_5', valore: 5 }].map(function(t) {
                    var q = saldoCassaforte[t.campo] || 0;
                    if (q === 0) return null;
                    return (
                      <div key={t.campo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1a1f2e' }}>
                        <span style={{ color: '#94a3b8' }}>{q} x {t.valore}€</span>
                        <span style={{ color: '#c9a96e', fontFamily: 'Georgia, serif', fontWeight: '700' }}>{formatEuro(q * t.valore)}</span>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', paddingTop: '12px', borderTop: '2px solid #2d3448' }}>
                    <span style={{ color: '#f8fafc', fontWeight: '700', fontSize: '16px' }}>Totale Cassaforte</span>
                    <span style={{ color: '#c9a96e', fontFamily: 'Georgia, serif', fontSize: '24px', fontWeight: '700' }}>{formatEuro(saldoCassaforte.totale)}</span>
                  </div>
                </div>
              ) : (
                <div style={{ color: '#475569', textAlign: 'center', padding: '20px' }}>Caricamento...</div>
              )}
            </div>
            <div style={{ color: '#64748b', fontSize: '13px', textAlign: 'center' }}>I movimenti cassaforte con dettaglio tagli saranno disponibili nella prossima versione.</div>
          </div>
        )}
      </div>

      {showForm && (
        <FormMovimento
          cassaId={cassaId}
          centri={centri}
          userId={userId}
          movimento={movimentoDaModificare}
          onSave={handleSaveMovimento}
          onClose={function() { setShowForm(false); setMovimentoDaModificare(null); }}
        />
      )}
    </div>
  );
}

var S = {
  label: { display: 'block', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px', marginTop: '0' },
  input: { width: '100%', background: '#0f1117', border: '1px solid #2d3448', borderRadius: '8px', color: '#e2e8f0', padding: '10px 14px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' },
  select: { width: '100%', background: '#0f1117', border: '1px solid #2d3448', borderRadius: '8px', color: '#e2e8f0', padding: '10px 14px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px', cursor: 'pointer' },
  btnPrimario: { flex: 1, background: '#c9a96e', color: '#0f1117', border: 'none', borderRadius: '8px', padding: '12px 20px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' },
  btnSecondario: { flex: 1, background: 'transparent', color: '#94a3b8', border: '1px solid #2d3448', borderRadius: '8px', padding: '12px 20px', cursor: 'pointer', fontSize: '14px' }
};
