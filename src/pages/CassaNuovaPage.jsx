import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth, defaultPermissionsForRole } from '../lib/AuthContext';
import ConfermaPin from '../components/ConfermaPin';

// ─────────────────────────────────────────────────────────────
// CASSA (nuovo modulo, tabelle cassa2_*). Vive dentro il Layout.
// Due casse separate via URL: /cassa/reception e /cassa/ristorante.
// Movimenti: ENTRATA (scontrino/fattura/fattoria/caparra) / SPESA / GIRO.
// Chiusure MULTIPLE al giorno, confermate con PIN (chi + quando).
// Cassaforte NON e' qui: pagina dedicata sotto permesso 'cassaforte'.
// ─────────────────────────────────────────────────────────────

var ID_RECEPTION = 'd375c1de-04b9-490e-ab8f-5f11a6cb969f';
var ID_RISTORANTE = '4805dd45-da57-4442-9a09-a0141804cc9a';

function cassaDaSlug(slug) { return slug === 'ristorante' ? ID_RISTORANTE : ID_RECEPTION; }
function nomeCassa(id) { return id === ID_RISTORANTE ? 'Ristorante' : 'Reception'; }

var NATURE = [
  { v: 'scontrino', label: 'Scontrino' },
  { v: 'fattura', label: 'Fattura' },
  { v: 'fattoria', label: 'Fattoria' },
  { v: 'caparra', label: 'Caparra' }
];

var PAGAMENTI = [
  { v: 'contanti', label: 'Contanti' },
  { v: 'carta', label: 'Carta' },
  { v: 'bonifico', label: 'Bonifico' },
  { v: 'assegno', label: 'Assegno' }
];

var TAGLI = [500, 200, 100, 50, 20, 10, 5];

function oggiISO() { return new Date().toISOString().split('T')[0]; }
function arrotonda(n) { return Math.round((n || 0) * 100) / 100; }
function formatEuro(n) { return arrotonda(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }); }

function labelNatura(v) { for (var i = 0; i < NATURE.length; i++) { if (NATURE[i].v === v) return NATURE[i].label; } return v || ''; }
function labelPagamento(v) { for (var i = 0; i < PAGAMENTI.length; i++) { if (PAGAMENTI[i].v === v) return PAGAMENTI[i].label; } return v || ''; }
function labelGiro(v) { return v === 'versa_cassaforte' ? 'Versa in cassaforte' : (v === 'preleva_cassaforte' ? 'Preleva da cassaforte' : v); }

function spostaData(iso, giorni) {
  var d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + giorni);
  return d.toISOString().split('T')[0];
}
function dataLeggibile(iso) {
  var d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}
function oraDa(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

// ordina per "ordine" se presente, altrimenti per "nome" (senza assumere colonne)
function ordinaPer(righe) {
  var copia = righe.slice();
  copia.sort(function(a, b) {
    var oa = (a.ordine != null) ? a.ordine : 9999;
    var ob = (b.ordine != null) ? b.ordine : 9999;
    if (oa !== ob) return oa - ob;
    var na = a.nome || '';
    var nb = b.nome || '';
    return na < nb ? -1 : (na > nb ? 1 : 0);
  });
  return copia;
}

function labelEvento(ev) {
  var pasto = ev.meal_type === 'lunch' ? 'Pranzo' : (ev.meal_type === 'dinner' ? 'Cena' : 'Giornata');
  return ev.event_date + ' · ' + ev.title + ' (' + pasto + ')';
}

// ── gruppo di pulsanti tappabili (sostituisce i menu' nativi) ──
function Pills(props) {
  return (
    <div className="flex flex-wrap gap-2">
      {props.opzioni.map(function(o) {
        var sel = o.v === props.value;
        var cls = sel
          ? 'px-4 py-2 rounded-full text-sm font-medium border-2 border-wine-700 bg-wine-700 text-white'
          : 'px-4 py-2 rounded-full text-sm font-medium border-2 border-gray-300 bg-white text-gray-600 hover:border-wine-400';
        if (props.disabled && !sel) cls = 'px-4 py-2 rounded-full text-sm font-medium border-2 border-gray-200 bg-gray-100 text-gray-400';
        return (
          <button key={o.v} type="button" disabled={props.disabled && !sel}
            onClick={function() { if (!props.disabled) props.onChange(o.v); }}
            className={cls}>{o.label}</button>
        );
      })}
    </div>
  );
}

// ── selettore tavoli raggruppati per sala, a griglia che va a capo ──
// mode 'modal'  -> "senza tavolo" + tavoli (value '' = senza tavolo)
// mode 'filtro' -> "tutti" + "senza tavolo" + tavoli
//                  (value '' = tutti, '__senza__' = senza tavolo)
function SelettoreTavoli(props) {
  var sale = props.sale;
  var tavoli = props.tavoli;
  var value = props.value;
  var onChange = props.onChange;
  var isFiltro = props.mode === 'filtro';

  function chip(attivo, label, onClick, key) {
    var cls = attivo
      ? 'px-3 py-1.5 rounded-lg text-sm border-2 border-wine-700 bg-wine-700 text-white'
      : 'px-3 py-1.5 rounded-lg text-sm border-2 border-gray-300 bg-white text-gray-600 hover:border-wine-400';
    return <button key={key} type="button" onClick={onClick} className={cls}>{label}</button>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {isFiltro && chip(value === '', 'tutti', function() { onChange(''); }, '__tutti')}
        {chip(isFiltro ? value === '__senza__' : value === '',
          'senza tavolo',
          function() { onChange(isFiltro ? '__senza__' : ''); },
          '__senza')}
      </div>
      {sale.map(function(s) {
        var tav = tavoli.filter(function(t) { return t.sala_id === s.id; });
        if (tav.length === 0) return null;
        return (
          <div key={s.id}>
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{s.nome}</div>
            <div className="flex flex-wrap gap-2">
              {tav.map(function(t) {
                return chip(value === t.id, t.nome, function() { onChange(t.id); }, t.id);
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// MODALE NUOVO / MODIFICA MOVIMENTO
// ═════════════════════════════════════════════════════════════
function ModaleMovimento(props) {
  var cassaId = props.cassaId;
  var centri = props.centri;
  var sale = props.sale;
  var tavoli = props.tavoli;
  var eventi = props.eventi;
  var userId = props.userId;
  var puoUsareCassaforte = props.puoUsareCassaforte;
  var esistente = props.movimento || null;
  var onSalvato = props.onSalvato;
  var onChiudi = props.onChiudi;
  var onGestisci = props.onGestisci;

  var isRistorante = cassaId === ID_RISTORANTE;
  var isReception = cassaId === ID_RECEPTION;
  var isModifica = esistente !== null;

  var [tipo, setTipo] = useState(isModifica ? esistente.tipo : 'entrata');
  var [natura, setNatura] = useState(isModifica ? (esistente.natura || 'scontrino') : 'scontrino');
  var [pagamento, setPagamento] = useState(isModifica ? (esistente.pagamento || 'contanti') : 'contanti');
  var [giroTipo, setGiroTipo] = useState(isModifica ? (esistente.giro_tipo || 'versa_cassaforte') : 'versa_cassaforte');
  var [importoStr, setImportoStr] = useState(isModifica ? String(esistente.importo) : '');
  var [isHotelCloud, setIsHotelCloud] = useState(isModifica ? !!esistente.is_hotel_cloud : false);
  var [centroId, setCentroId] = useState(isModifica ? (esistente.centro_di_costo_id || '') : '');
  var [tavoloId, setTavoloId] = useState(isModifica ? (esistente.tavolo_id || '') : '');
  var [eventoId, setEventoId] = useState(isModifica ? (esistente.event_id || '') : '');
  var [daCausale, setDaCausale] = useState(isModifica ? (esistente.da_causale || '') : '');
  var [nota, setNota] = useState(isModifica ? (esistente.nota || '') : '');
  var [versaSubito, setVersaSubito] = useState(false);
  var [salvando, setSalvando] = useState(false);
  var [errore, setErrore] = useState('');

  // La fattoria e' sempre in contanti: blocca il pagamento.
  var pagamentoBloccato = tipo === 'entrata' && natura === 'fattoria';
  useEffect(function() {
    if (pagamentoBloccato && pagamento !== 'contanti') setPagamento('contanti');
  }, [natura, tipo]);

  var importo = parseFloat(importoStr) || 0;
  // "Versa subito in cassaforte" ha senso solo per entrata in contanti.
  var mostraVersaSubito = tipo === 'entrata' && pagamento === 'contanti';

  // Opzioni del giro: "preleva" solo con permesso cassaforte.
  var opzGiro = [{ v: 'versa_cassaforte', label: 'Versa in cassaforte' }];
  if (puoUsareCassaforte) opzGiro.push({ v: 'preleva_cassaforte', label: 'Preleva da cassaforte' });

  function handleSalva() {
    if (importo <= 0) { setErrore('Inserisci un importo maggiore di zero.'); return; }
    setErrore('');
    setSalvando(true);

    var riga = {
      cassa_id: cassaId,
      data: props.data,
      tipo: tipo,
      natura: tipo === 'entrata' ? natura : null,
      pagamento: tipo === 'giro' ? null : pagamento,
      importo: importo,
      is_hotel_cloud: (tipo === 'entrata' && isReception) ? isHotelCloud : false,
      centro_di_costo_id: (tipo === 'spesa' && centroId) ? centroId : null,
      giro_tipo: tipo === 'giro' ? giroTipo : null,
      cassa_collegata_id: null,
      tavolo_id: (tipo === 'entrata' && isRistorante && tavoloId) ? tavoloId : null,
      event_id: (tipo === 'entrata' && eventoId) ? eventoId : null,
      da_causale: daCausale || null,
      nota: nota || null,
      inserito_da: userId || null
    };

    if (isModifica) {
      supabase.from('cassa2_movimenti').update(riga).eq('id', esistente.id).select().then(function(r) {
        setSalvando(false);
        if (r.error) { setErrore('Errore: ' + r.error.message); return; }
        onSalvato([r.data[0]], true);
      });
      return;
    }

    // Nuovo: eventuale giro "versa subito in cassaforte" contestuale.
    var righe = [riga];
    if (mostraVersaSubito && versaSubito) {
      righe.push({
        cassa_id: cassaId, data: props.data, tipo: 'giro',
        natura: null, pagamento: null, importo: importo,
        is_hotel_cloud: false, centro_di_costo_id: null,
        giro_tipo: 'versa_cassaforte', cassa_collegata_id: null,
        tavolo_id: null, event_id: (eventoId || null),
        da_causale: daCausale || 'Versamento caparra', nota: 'Da entrata contestuale',
        inserito_da: userId || null
      });
    }
    supabase.from('cassa2_movimenti').insert(righe).select().then(function(r) {
      setSalvando(false);
      if (r.error) { setErrore('Errore: ' + r.error.message); return; }
      onSalvato(r.data, false);
    });
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[94vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{isModifica ? 'Modifica movimento' : 'Nuovo movimento'}</h2>
          <button onClick={onChiudi} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5">

          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tipo</div>
            <Pills opzioni={[{ v: 'entrata', label: 'Entrata' }, { v: 'spesa', label: 'Spesa' }, { v: 'giro', label: 'Giro' }]}
              value={tipo} onChange={setTipo} />
          </div>

          {tipo === 'entrata' && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Natura del documento</div>
              <Pills opzioni={NATURE} value={natura} onChange={setNatura} />
            </div>
          )}

          {tipo === 'giro' && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Giro di contanti</div>
              <Pills opzioni={opzGiro} value={giroTipo} onChange={setGiroTipo} />
              <div className="text-xs text-gray-400 mt-2">Il giro sposta contanti fra cassa e cassaforte: non e' un incasso.</div>
            </div>
          )}

          {tipo !== 'giro' && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Pagamento{pagamentoBloccato && <span className="text-wine-600 normal-case font-normal ml-2">la fattoria e' sempre in contanti</span>}
              </div>
              <Pills opzioni={PAGAMENTI} value={pagamento} onChange={setPagamento} disabled={pagamentoBloccato} />
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Importo</div>
            <input type="number" step="0.01" min="0" placeholder="0,00" value={importoStr}
              onChange={function(e) { setImportoStr(e.target.value); }}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-2xl font-semibold text-right text-gray-900 focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>

          {/* Versa subito in cassaforte (entrata in contanti, utile per caparre) */}
          {mostraVersaSubito && (
            <label className="flex items-center gap-3 cursor-pointer bg-wine-50 border border-wine-200 rounded-lg px-3 py-2">
              <input type="checkbox" checked={versaSubito}
                onChange={function(e) { setVersaSubito(e.target.checked); }}
                className="w-5 h-5 accent-wine-700" />
              <span className="text-sm text-gray-700">Versa subito questo importo in cassaforte</span>
            </label>
          )}

          {tipo === 'entrata' && isReception && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={isHotelCloud}
                onChange={function(e) { setIsHotelCloud(e.target.checked); }}
                className="w-5 h-5 accent-wine-700" />
              <span className="text-sm text-gray-700">Passato da Hotel in Cloud</span>
            </label>
          )}

          {tipo === 'spesa' && isRistorante && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Centro di costo</div>
                <button type="button" onClick={function() { if (onGestisci) onGestisci(); }} className="text-xs text-wine-700 hover:underline">Gestisci</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={function() { setCentroId(''); }}
                  className={'px-3 py-1.5 rounded-lg text-sm border-2 ' + (centroId === '' ? 'border-wine-700 bg-wine-700 text-white' : 'border-gray-300 bg-white text-gray-600 hover:border-wine-400')}>
                  nessuno
                </button>
                {centri.map(function(c) {
                  var sel = c.id === centroId;
                  return (
                    <button key={c.id} type="button" onClick={function() { setCentroId(c.id); }}
                      className={'px-3 py-1.5 rounded-lg text-sm border-2 ' + (sel ? 'border-wine-700 bg-wine-700 text-white' : 'border-gray-300 bg-white text-gray-600 hover:border-wine-400')}>
                      {c.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tipo === 'entrata' && isRistorante && tavoli.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tavolo (opzionale)</div>
                <button type="button" onClick={function() { if (onGestisci) onGestisci(); }} className="text-xs text-wine-700 hover:underline">Gestisci</button>
              </div>
              <SelettoreTavoli sale={sale} tavoli={tavoli} value={tavoloId} onChange={setTavoloId} mode="modal" />
            </div>
          )}

          {tipo === 'entrata' && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Evento collegato (opzionale)</div>
              {eventi.length > 0 ? (
                <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  <button type="button" onClick={function() { setEventoId(''); }}
                    className={'w-full text-left px-3 py-2 text-sm ' + (eventoId === '' ? 'bg-wine-50 text-wine-800 font-medium' : 'bg-white text-gray-700 hover:bg-gray-50')}>
                    nessuno
                  </button>
                  {eventi.map(function(ev) {
                    var sel = ev.id === eventoId;
                    return (
                      <button key={ev.id} type="button" onClick={function() { setEventoId(ev.id); }}
                        className={'w-full text-left px-3 py-2 text-sm ' + (sel ? 'bg-wine-50 text-wine-800 font-medium' : 'bg-white text-gray-700 hover:bg-gray-50')}>
                        {labelEvento(ev)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-gray-400">Nessun evento in agenda. La caparra si registra comunque; l'evento si collega quando c'e'.</div>
              )}
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              {tipo === 'spesa' ? 'Da / causale' : 'Provenienza / note brevi'}
            </div>
            <input type="text" placeholder="es. Tavolo 5, Direttore, Rossi..." value={daCausale}
              onChange={function(e) { setDaCausale(e.target.value); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>

          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Nota</div>
            <textarea rows={2} placeholder="Nota libera..." value={nota}
              onChange={function(e) { setNota(e.target.value); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>

          {errore && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{errore}</div>}

          <div className="flex gap-3 pt-2">
            <button onClick={onChiudi} className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
            <button onClick={handleSalva} disabled={salvando}
              className="flex-1 px-4 py-3 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white rounded-lg text-sm font-medium">
              {salvando ? 'Salvataggio...' : (isModifica ? 'Aggiorna' : 'Salva')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── card numero ──
function CardNum(props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{props.titolo}</div>
      <div className={'font-semibold ' + (props.grande ? 'text-2xl' : 'text-xl') + ' ' + (props.colore || 'text-gray-900')}>
        {formatEuro(props.valore)}
      </div>
      {props.sub && <div className="text-xs text-gray-400 mt-1">{props.sub}</div>}
    </div>
  );
}

// ── riga movimento ──
function RigaMovimento(props) {
  var m = props.movimento;
  var isEntrata = m.tipo === 'entrata';
  var isSpesa = m.tipo === 'spesa';
  var isGiroPreleva = m.tipo === 'giro' && m.giro_tipo === 'preleva_cassaforte';
  var positivo = isEntrata || isGiroPreleva;

  var titolo;
  if (isEntrata) titolo = 'Entrata · ' + labelNatura(m.natura) + ' · ' + labelPagamento(m.pagamento);
  else if (isSpesa) titolo = 'Spesa · ' + labelPagamento(m.pagamento);
  else titolo = 'Giro · ' + labelGiro(m.giro_tipo);

  var dettagli = [];
  if (m.is_hotel_cloud) dettagli.push('Hotel in Cloud');
  if (m._centro_nome) dettagli.push(m._centro_nome);
  if (m._tavolo_nome) dettagli.push('Tav. ' + m._tavolo_nome);
  if (m._evento_titolo) dettagli.push('Evento: ' + m._evento_titolo);
  if (m.da_causale) dettagli.push(m.da_causale);
  if (m.nota) dettagli.push(m.nota);

  var bordo = m.annullato ? 'border-gray-200 bg-gray-50 opacity-60' : (positivo ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50');
  var coloreImporto = m.annullato ? 'text-gray-400' : (positivo ? 'text-green-700' : 'text-red-700');

  return (
    <div className={'flex items-center gap-3 p-3 rounded-lg border ' + bordo}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800">{titolo}</span>
          {m.annullato && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Annullato</span>}
        </div>
        {dettagli.length > 0 && <div className="text-xs text-gray-500 mt-0.5 truncate">{dettagli.join(' · ')}</div>}
      </div>
      <div className={'font-semibold text-lg ' + coloreImporto}>{positivo ? '+' : '-'}{formatEuro(m.importo)}</div>
      {props.puoScrivere && !m.annullato && (
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button onClick={function() { props.onModifica(m); }} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-white">Modifica</button>
          <button onClick={function() { props.onAnnulla(m.id); }} className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-white">Annulla</button>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// PAGINA PRINCIPALE
// ═════════════════════════════════════════════════════════════
export default function CassaNuovaPage(props) {
  var params = useParams();
  var navigate = useNavigate();
  var auth = useAuth();
  var profile = auth.profile;
  var userId = profile ? profile.id : null;

  // Quale cassa: dallo slug passato come prop dalle rotte esplicite
  // (/cassa/reception, /cassa/ristorante); fallback al parametro URL.
  var quale = props.quale || params.quale;
  var cassaId = cassaDaSlug(quale);
  var isRistorante = cassaId === ID_RISTORANTE;

  // Permessi PER-CASSA (split del vecchio permesso unico 'cassa'): ogni
  // cassa ha la sua chiave indipendente. Il pulsante "vai all'altra cassa"
  // compare solo se hai anche il permesso dell'altra.
  var featureCassa = isRistorante ? 'cassa_ristorante' : 'cassa_reception';
  var featureAltra = isRistorante ? 'cassa_reception' : 'cassa_ristorante';
  var puoVedereQuesta = auth.canView(featureCassa);
  var puoVedereAltra = auth.canView(featureAltra);
  var puoScrivere = auth.canEdit(featureCassa);
  var puoUsareCassaforte = auth.canEdit('cassaforte');
  // Solo chi ha il permesso "Totali cassa" (persona affidabile) vede il totale
  // "Movimenti di denaro" (l'incasso comprensivo di fattoria e caparre).
  var puoVedereFlusso = auth.canView('totali_cassa');

  var [data, setData] = useState(oggiISO());
  var [sezione, setSezione] = useState('movimenti');
  var [movimenti, setMovimenti] = useState([]);
  var [centri, setCentri] = useState([]);
  var [sale, setSale] = useState([]);
  var [tavoli, setTavoli] = useState([]);
  var [eventi, setEventi] = useState([]);
  var [fondoApertura, setFondoApertura] = useState(0);
  var [loading, setLoading] = useState(false);
  var [showForm, setShowForm] = useState(false);
  var [movimentoDaModificare, setMovimentoDaModificare] = useState(null);
  var [filtroTavolo, setFiltroTavolo] = useState('');
  var [showPinGestione, setShowPinGestione] = useState(false);
  var [msgGestione, setMsgGestione] = useState('');

  // riferimenti
  useEffect(function() {
    supabase.from('centri_di_costo').select('id, nome').eq('attivo', true).order('nome').then(function(r) {
      if (r.data) setCentri(r.data);
    });
    supabase.from('sale').select('*').then(function(r) {
      if (r.data) setSale(ordinaPer(r.data));
    });
    supabase.from('tavoli_sala').select('*').eq('attivo', true).then(function(r) {
      if (r.data) setTavoli(ordinaPer(r.data));
    });
    var treMesiFa = spostaData(oggiISO(), -90);
    supabase.from('event_dates').select('id, event_date, title, event_type, meal_type')
      .gte('event_date', treMesiFa).order('event_date', { ascending: false }).then(function(r) {
        if (r.data) setEventi(r.data);
      });
  }, []);

  // fondo di apertura = contato dell'ULTIMA chiusura di una data precedente
  useEffect(function() {
    supabase.from('cassa2_chiusure').select('contato_contanti, data, chiusa_il')
      .eq('cassa_id', cassaId).lt('data', data)
      .order('data', { ascending: false }).order('chiusa_il', { ascending: false }).limit(1)
      .then(function(r) {
        if (r.data && r.data.length > 0) setFondoApertura(arrotonda(r.data[0].contato_contanti));
        else setFondoApertura(0);
      });
  }, [cassaId, data]);

  // movimenti del giorno
  useEffect(function() {
    setLoading(true);
    setFiltroTavolo('');
    supabase.from('cassa2_movimenti').select('*')
      .eq('cassa_id', cassaId).eq('data', data).order('creato_il', { ascending: true })
      .then(function(r) {
        setLoading(false);
        setMovimenti(r.data || []);
      });
  }, [cassaId, data]);

  function arricchisci(m) {
    var copia = Object.assign({}, m);
    if (m.centro_di_costo_id) { for (var i = 0; i < centri.length; i++) { if (centri[i].id === m.centro_di_costo_id) { copia._centro_nome = centri[i].nome; break; } } }
    if (m.tavolo_id) { for (var j = 0; j < tavoli.length; j++) { if (tavoli[j].id === m.tavolo_id) { copia._tavolo_nome = tavoli[j].nome; break; } } }
    if (m.event_id) { for (var k = 0; k < eventi.length; k++) { if (eventi[k].id === m.event_id) { copia._evento_titolo = eventi[k].title; break; } } }
    return copia;
  }

  var movimentiRicchi = movimenti.map(arricchisci);
  var attivi = movimentiRicchi.filter(function(m) { return !m.annullato; });

  var ufficiale = 0, fattoria = 0, caparre = 0, spese = 0;
  var entrateContanti = 0, speseContanti = 0, versaCassaforte = 0, prelevaCassaforte = 0;
  attivi.forEach(function(m) {
    if (m.tipo === 'entrata') {
      if (m.natura === 'fattoria') fattoria += m.importo;
      else if (m.natura === 'caparra') caparre += m.importo;
      else ufficiale += m.importo;
      if (m.pagamento === 'contanti') entrateContanti += m.importo;
    } else if (m.tipo === 'spesa') {
      spese += m.importo;
      if (m.pagamento === 'contanti') speseContanti += m.importo;
    } else if (m.tipo === 'giro') {
      if (m.giro_tipo === 'versa_cassaforte') versaCassaforte += m.importo;
      if (m.giro_tipo === 'preleva_cassaforte') prelevaCassaforte += m.importo;
    }
  });
  ufficiale = arrotonda(ufficiale);
  var reale = arrotonda(ufficiale + fattoria + caparre);
  spese = arrotonda(spese);
  var contantiOggi = arrotonda(entrateContanti - speseContanti - versaCassaforte + prelevaCassaforte);
  var contantiInCassa = arrotonda(fondoApertura + contantiOggi);

  var listaVisibile = movimentiRicchi;
  if (filtroTavolo === '__senza__') listaVisibile = movimentiRicchi.filter(function(m) { return !m.tavolo_id; });
  else if (filtroTavolo) listaVisibile = movimentiRicchi.filter(function(m) { return m.tavolo_id === filtroTavolo; });

  function handleSalvato(righe, isModifica) {
    if (isModifica) {
      setMovimenti(function(prev) { return prev.map(function(m) { return m.id === righe[0].id ? righe[0] : m; }); });
    } else {
      setMovimenti(function(prev) { return prev.concat(righe); });
    }
    setShowForm(false);
    setMovimentoDaModificare(null);
  }

  function handleAnnulla(id) {
    supabase.from('cassa2_movimenti')
      .update({ annullato: true, annullato_da: userId, annullato_il: new Date().toISOString() })
      .eq('id', id).then(function(r) {
        if (!r.error) setMovimenti(function(prev) { return prev.map(function(m) { return m.id === id ? Object.assign({}, m, { annullato: true }) : m; }); });
      });
  }

  function apriNuovo() { setMovimentoDaModificare(null); setShowForm(true); }
  function apriModifica(m) { setMovimentoDaModificare(m); setShowForm(true); }
  function vaiAllaAltra() { navigate('/cassa/' + (isRistorante ? 'reception' : 'ristorante')); }

  // Livello del permesso variabili_cassa dell'utente che conferma col PIN
  // (stessa logica di AuthContext: super_admin sempre write; jsonb se c'e',
  // altrimenti default del ruolo).
  function livelloVariabili(info) {
    if (info.role === 'super_admin') return 'write';
    var perms = (info.permissions && typeof info.permissions === 'object') ? info.permissions : defaultPermissionsForRole(info.role);
    return perms['variabili_cassa'] || 'none';
  }
  function chiediGestione() {
    setMsgGestione('');
    setShowForm(false);
    setMovimentoDaModificare(null);
    setShowPinGestione(true);
  }
  function onPinGestione(info) {
    if (livelloVariabili(info) !== 'write') {
      setShowPinGestione(false);
      setMsgGestione('L\'utente scelto non ha il permesso per gestire le variabili cassa.');
      return;
    }
    setShowPinGestione(false);
    auth.attivaElevazione(info);
    navigate('/variabili-cassa');
  }

  var tabs = [{ id: 'movimenti', label: 'Movimenti' }, { id: 'chiusura', label: 'Chiusura' }];

  // Cintura di sicurezza: se si arriva qui senza il permesso di QUESTA cassa
  // (es. link diretto), non mostriamo la pagina. Le rotte gia' filtrano;
  // questa e' ridondanza difensiva.
  if (!puoVedereQuesta) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          Non hai accesso a questa cassa.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Cassa {nomeCassa(cassaId)}</h1>
        {puoVedereAltra && (
          <button onClick={vaiAllaAltra}
            className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">
            Vai a Cassa {isRistorante ? 'Reception' : 'Ristorante'} &rarr;
          </button>
        )}
        <button onClick={chiediGestione}
          className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">
          ⚙️ Gestisci
        </button>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={function() { setData(spostaData(data, -1)); }} className="px-2 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">&lsaquo;</button>
          <input type="date" value={data} onChange={function(e) { setData(e.target.value); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700" />
          <button onClick={function() { setData(spostaData(data, 1)); }} className="px-2 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">&rsaquo;</button>
        </div>
      </div>

      {msgGestione && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">{msgGestione}</div>
      )}

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {tabs.map(function(t) {
          var sel = t.id === sezione;
          return (
            <button key={t.id} onClick={function() { setSezione(t.id); }}
              className={'px-4 py-2 text-sm font-medium border-b-2 ' + (sel ? 'border-wine-700 text-wine-800' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              {t.label}
            </button>
          );
        })}
      </div>

      {sezione === 'movimenti' && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <CardNum titolo="INCASSO" valore={ufficiale} colore="text-green-700" grande={true} sub="scontrini + fatture" />
            {puoVedereFlusso && (
              <CardNum titolo="Movimenti di denaro" valore={reale} colore="text-wine-700" grande={true} />
            )}
            <CardNum titolo="Spese" valore={spese} colore="text-red-600" />
            <CardNum titolo="Contanti in cassa" valore={contantiInCassa} colore="text-gray-900" sub={'fondo ' + formatEuro(fondoApertura)} />
          </div>

          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="text-sm text-gray-500">
              {loading ? 'Caricamento...' : (attivi.length + ' movimenti attivi' + (filtroTavolo ? ' (filtrati)' : ''))}
            </div>
            {puoScrivere && (
              <button onClick={apriNuovo} className="px-4 py-2 bg-wine-700 hover:bg-wine-800 text-white rounded-lg text-sm font-medium">+ Nuovo movimento</button>
            )}
          </div>

          {isRistorante && tavoli.length > 0 && (
            <div className="mb-4 bg-white border border-gray-200 rounded-xl p-3">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Filtra per tavolo</div>
              <SelettoreTavoli sale={sale} tavoli={tavoli} value={filtroTavolo} onChange={setFiltroTavolo} mode="filtro" />
            </div>
          )}

          {!loading && listaVisibile.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-400 text-sm">
              Nessun movimento per {nomeCassa(cassaId)} · {dataLeggibile(data)}
            </div>
          ) : (
            <div className="space-y-2">
              {listaVisibile.map(function(m) {
                return <RigaMovimento key={m.id} movimento={m} puoScrivere={puoScrivere} onModifica={apriModifica} onAnnulla={handleAnnulla} />;
              })}
            </div>
          )}
        </div>
      )}

      {sezione === 'chiusura' && (
        <ChiusuraTab
          cassaId={cassaId} data={data} puoScrivere={puoScrivere}
          fondoApertura={fondoApertura} contantiInCassa={contantiInCassa}
          ufficiale={ufficiale} spese={spese} attivi={attivi} />
      )}

      {showForm && (
        <ModaleMovimento
          cassaId={cassaId} data={data} centri={centri} sale={sale} tavoli={tavoli} eventi={eventi}
          userId={userId} puoUsareCassaforte={puoUsareCassaforte}
          movimento={movimentoDaModificare}
          onGestisci={chiediGestione}
          onSalvato={handleSalvato}
          onChiudi={function() { setShowForm(false); setMovimentoDaModificare(null); }} />
      )}

      <ConfermaPin
        open={showPinGestione}
        title="Gestione variabili cassa"
        message="Scegli il tuo nome e inserisci il PIN per aprire la gestione di sale, tavoli e centri di costo."
        onCancel={function() { setShowPinGestione(false); }}
        onConfirmed={onPinGestione} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SCHEDA CHIUSURA — piu' chiusure al giorno, confermate con PIN
// ═════════════════════════════════════════════════════════════
function ChiusuraTab(props) {
  var teorico = props.contantiInCassa;
  var [tagli, setTagli] = useState(function() {
    var t = { monete: '' };
    for (var i = 0; i < TAGLI.length; i++) { t['t' + TAGLI[i]] = ''; }
    return t;
  });
  var [notaDiff, setNotaDiff] = useState('');
  var [chiusure, setChiusure] = useState([]);
  var [showPin, setShowPin] = useState(false);
  var [msg, setMsg] = useState('');

  function caricaChiusure() {
    supabase.from('cassa2_chiusure').select('*')
      .eq('cassa_id', props.cassaId).eq('data', props.data)
      .order('chiusa_il', { ascending: false })
      .then(function(r) { setChiusure(r.data || []); });
  }
  useEffect(caricaChiusure, [props.cassaId, props.data]);

  function setTaglio(campo, val) {
    setTagli(function(prev) { var n = Object.assign({}, prev); n[campo] = val; return n; });
  }

  var contato = 0;
  for (var i = 0; i < TAGLI.length; i++) { contato += (parseInt(tagli['t' + TAGLI[i]], 10) || 0) * TAGLI[i]; }
  contato += parseFloat(tagli.monete || 0);
  contato = arrotonda(contato);
  var differenza = arrotonda(contato - teorico);

  function costruisciRiepilogo() {
    var perPagamento = {};
    var perNatura = {};
    props.attivi.forEach(function(m) {
      if (m.tipo === 'entrata') {
        perNatura[m.natura] = arrotonda((perNatura[m.natura] || 0) + m.importo);
        perPagamento[m.pagamento] = arrotonda((perPagamento[m.pagamento] || 0) + m.importo);
      }
    });
    return { per_pagamento: perPagamento, per_natura: perNatura, spese: props.spese };
  }

  // Confermata dal PIN: info = { user_id, nome, role, permissions }
  function onPinConfermato(info) {
    setShowPin(false);
    var riga = {
      cassa_id: props.cassaId, data: props.data,
      fondo_apertura: props.fondoApertura,
      teorico_contanti: teorico,
      contato_contanti: contato,
      differenza: differenza,
      tagli: tagli,
      riepilogo: costruisciRiepilogo(),
      nota_differenza: notaDiff || null,
      bloccata: true,
      chiusa_da: info.user_id || null,
      chiusa_da_nome: info.nome || null
    };
    supabase.from('cassa2_chiusure').insert([riga]).select().then(function(r) {
      if (r.error) { setMsg('Errore: ' + r.error.message); return; }
      setMsg('Chiusura registrata da ' + (info.nome || '') + '. Il contato diventa il fondo successivo.');
      caricaChiusure();
    });
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-5 lg:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Nuova chiusura</h2>
        <div className="text-sm text-gray-500 mb-5">{dataLeggibile(props.data)} · fotografia della cassa, firmata col PIN</div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <CardNum titolo="Fondo apertura" valore={props.fondoApertura} colore="text-gray-600" />
          <CardNum titolo="INCASSO" valore={props.ufficiale} colore="text-green-700" />
          <CardNum titolo="Spese" valore={props.spese} colore="text-red-600" />
          <CardNum titolo="Teorico contanti" valore={teorico} colore="text-gray-900" grande={true} />
        </div>

        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Conta fisica del cassetto</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {TAGLI.map(function(t) {
            return (
              <div key={t} className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-10 text-right">{t}&euro;</span>
                <input type="number" min="0" step="1" value={tagli['t' + t]}
                  onChange={function(e) { setTaglio('t' + t, e.target.value); }}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-wine-500" />
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 w-10 text-right">mon.</span>
            <input type="number" min="0" step="0.01" placeholder="0,00" value={tagli.monete}
              onChange={function(e) { setTaglio('monete', e.target.value); }}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <CardNum titolo="Contato" valore={contato} colore="text-gray-900" grande={true} />
          <div className={'rounded-xl border p-4 ' + (Math.abs(differenza) < 0.01 ? 'border-green-200 bg-green-50' : 'border-amber-300 bg-amber-50')}>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Differenza</div>
            <div className={'text-2xl font-semibold ' + (Math.abs(differenza) < 0.01 ? 'text-green-700' : 'text-amber-700')}>
              {differenza > 0 ? '+' : ''}{formatEuro(differenza)}
            </div>
            <div className="text-xs text-gray-400 mt-1">{Math.abs(differenza) < 0.01 ? 'la cassa quadra' : 'contato - teorico'}</div>
          </div>
        </div>

        {Math.abs(differenza) >= 0.01 && (
          <div className="mb-5">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Nota sulla differenza</div>
            <input type="text" placeholder="Motivo della differenza..." value={notaDiff}
              onChange={function(e) { setNotaDiff(e.target.value); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>
        )}

        {msg && (
          <div className={'mb-4 p-3 rounded-lg text-sm ' + (msg.indexOf('Errore') === 0 ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800')}>
            {msg}
          </div>
        )}

        {props.puoScrivere && (
          <button onClick={function() { setShowPin(true); }}
            className="w-full bg-wine-700 hover:bg-wine-800 text-white rounded-lg py-3 font-medium">
            Registra chiusura (con PIN)
          </button>
        )}
      </div>

      {/* Elenco chiusure di oggi */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Chiusure di oggi</h3>
        {chiusure.length === 0 ? (
          <div className="text-sm text-gray-400">Ancora nessuna chiusura registrata oggi.</div>
        ) : (
          <div className="space-y-2">
            {chiusure.map(function(c) {
              var quadra = Math.abs(c.differenza) < 0.01;
              return (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">{oraDa(c.chiusa_il)} · {c.chiusa_da_nome || '—'}</div>
                    <div className="text-xs text-gray-500">Contato {formatEuro(c.contato_contanti)} · teorico {formatEuro(c.teorico_contanti)}</div>
                  </div>
                  <div className={'text-sm font-semibold ' + (quadra ? 'text-green-700' : 'text-amber-700')}>
                    {c.differenza > 0 ? '+' : ''}{formatEuro(c.differenza)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfermaPin
        open={showPin}
        title="Firma la chiusura"
        message="Scegli il tuo nome e inserisci il PIN per registrare la chiusura a tuo nome."
        onCancel={function() { setShowPin(false); }}
        onConfirmed={onPinConfermato} />
    </div>
  );
}
