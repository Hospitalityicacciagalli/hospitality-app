import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

// ─────────────────────────────────────────────────────────────
// GESTIONE VARIABILI CASSA
// Una sola anagrafica condivisa con le prenotazioni:
//   sale + tavoli_sala + centri_di_costo.
// Non si elimina mai (storico e FK): si DISATTIVA (attivo=false).
// ─────────────────────────────────────────────────────────────

function ordinaPer(righe) {
  var copia = righe.slice();
  copia.sort(function(a, b) {
    var oa = (a.ordine != null) ? a.ordine : 9999;
    var ob = (b.ordine != null) ? b.ordine : 9999;
    if (oa !== ob) return oa - ob;
    var na = (a.nome || '') + '';
    var nb = (b.nome || '') + '';
    // ordinamento "naturale" per numeri di tavolo
    var ia = parseInt(na, 10), ib = parseInt(nb, 10);
    if (!isNaN(ia) && !isNaN(ib) && String(ia) === na && String(ib) === nb) return ia - ib;
    return na < nb ? -1 : (na > nb ? 1 : 0);
  });
  return copia;
}

export default function GestioneVariabiliCassa() {
  var auth = useAuth();
  var navigate = useNavigate();
  var puoScrivere = auth.canEdit('variabili_cassa');

  var [sezione, setSezione] = useState('saletavoli');
  var [sale, setSale] = useState([]);
  var [tavoli, setTavoli] = useState([]);
  var [centri, setCentri] = useState([]);
  var [mostraDisattivati, setMostraDisattivati] = useState(false);
  var [msg, setMsg] = useState('');

  // editing inline: { kind:'sala'|'tavolo'|'centro', id, val }
  var [edit, setEdit] = useState(null);

  // nuovi inserimenti
  var [nuovaSala, setNuovaSala] = useState('');
  var [nuovoCentro, setNuovoCentro] = useState('');
  // per ogni sala: stato locale del pannello "aggiungi tavoli"
  var [aggTavolo, setAggTavolo] = useState({}); // { [sala_id]: { nome, da, a } }

  function caricaTutto() {
    supabase.from('sale').select('*').then(function(r) { if (r.data) setSale(ordinaPer(r.data)); });
    supabase.from('tavoli_sala').select('*').then(function(r) { if (r.data) setTavoli(ordinaPer(r.data)); });
    supabase.from('centri_di_costo').select('*').then(function(r) { if (r.data) setCentri(ordinaPer(r.data)); });
  }
  useEffect(caricaTutto, []);

  function flash(t) { setMsg(t); setTimeout(function() { setMsg(''); }, 3500); }

  // ── SALE ──────────────────────────────────────────────
  function aggiungiSala() {
    var nome = (nuovaSala || '').trim();
    if (!nome) return;
    var ordine = sale.length + 1;
    supabase.from('sale').insert([{ nome: nome, attivo: true, ordine: ordine }]).select().then(function(r) {
      if (r.error) { flash('Errore: ' + r.error.message); return; }
      setNuovaSala('');
      setSale(function(prev) { return ordinaPer(prev.concat(r.data)); });
    });
  }

  function salvaRinomina() {
    if (!edit) return;
    var tabella = edit.kind === 'centro' ? 'centri_di_costo' : (edit.kind === 'tavolo' ? 'tavoli_sala' : 'sale');
    var nome = (edit.val || '').trim();
    if (!nome) { setEdit(null); return; }
    supabase.from(tabella).update({ nome: nome }).eq('id', edit.id).select().then(function(r) {
      if (r.error) { flash('Errore: ' + r.error.message); return; }
      var applica = function(prev) { return ordinaPer(prev.map(function(x) { return x.id === edit.id ? Object.assign({}, x, { nome: nome }) : x; })); };
      if (edit.kind === 'centro') setCentri(applica);
      else if (edit.kind === 'tavolo') setTavoli(applica);
      else setSale(applica);
      setEdit(null);
    });
  }

  function setAttivo(kind, id, attivo) {
    var tabella = kind === 'centro' ? 'centri_di_costo' : (kind === 'tavolo' ? 'tavoli_sala' : 'sale');
    supabase.from(tabella).update({ attivo: attivo }).eq('id', id).select().then(function(r) {
      if (r.error) { flash('Errore: ' + r.error.message); return; }
      var applica = function(prev) { return prev.map(function(x) { return x.id === id ? Object.assign({}, x, { attivo: attivo }) : x; }); };
      if (kind === 'centro') setCentri(applica);
      else if (kind === 'tavolo') setTavoli(applica);
      else setSale(applica);
    });
  }

  // ── TAVOLI ────────────────────────────────────────────
  function statoAgg(salaId) {
    return aggTavolo[salaId] || { nome: '', da: '', a: '' };
  }
  function setAgg(salaId, campo, val) {
    setAggTavolo(function(prev) {
      var n = Object.assign({}, prev);
      var cur = Object.assign({ nome: '', da: '', a: '' }, n[salaId]);
      cur[campo] = val;
      n[salaId] = cur;
      return n;
    });
  }

  function aggiungiTavoloSingolo(salaId) {
    var st = statoAgg(salaId);
    var nome = (st.nome || '').trim();
    if (!nome) return;
    var esistenti = tavoli.filter(function(t) { return t.sala_id === salaId; }).length;
    supabase.from('tavoli_sala').insert([{ sala_id: salaId, nome: nome, attivo: true, ordine: esistenti + 1 }]).select().then(function(r) {
      if (r.error) { flash('Errore: ' + r.error.message); return; }
      setTavoli(function(prev) { return ordinaPer(prev.concat(r.data)); });
      setAgg(salaId, 'nome', '');
    });
  }

  function aggiungiTavoliBlocco(salaId) {
    var st = statoAgg(salaId);
    var da = parseInt(st.da, 10);
    var a = parseInt(st.a, 10);
    if (isNaN(da) || isNaN(a) || da < 0 || a < da) { flash('Intervallo tavoli non valido.'); return; }
    if (a - da > 200) { flash('Intervallo troppo ampio (max 200).'); return; }
    var righe = [];
    for (var i = da; i <= a; i++) {
      righe.push({ sala_id: salaId, nome: String(i), attivo: true, ordine: i });
    }
    supabase.from('tavoli_sala').insert(righe).select().then(function(r) {
      if (r.error) { flash('Errore: ' + r.error.message); return; }
      setTavoli(function(prev) { return ordinaPer(prev.concat(r.data)); });
      setAgg(salaId, 'da', ''); setAgg(salaId, 'a', '');
      flash('Aggiunti ' + righe.length + ' tavoli.');
    });
  }

  // ── CENTRI ────────────────────────────────────────────
  function aggiungiCentro() {
    var nome = (nuovoCentro || '').trim();
    if (!nome) return;
    var ordine = centri.length + 1;
    supabase.from('centri_di_costo').insert([{ nome: nome, attivo: true, ordine: ordine }]).select().then(function(r) {
      if (r.error) { flash('Errore: ' + r.error.message); return; }
      setNuovoCentro('');
      setCentri(function(prev) { return ordinaPer(prev.concat(r.data)); });
    });
  }

  // ── RENDER helpers ────────────────────────────────────
  function BadgeDisattivo() {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">disattivo</span>;
  }

  function RigaEditabile(props) {
    var item = props.item;
    var kind = props.kind;
    var inEdit = edit && edit.kind === kind && edit.id === item.id;
    return (
      <div className={'flex items-center gap-2 px-3 py-2 rounded-lg border ' + (item.attivo ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50')}>
        {inEdit ? (
          <input autoFocus value={edit.val}
            onChange={function(e) { setEdit({ kind: kind, id: item.id, val: e.target.value }); }}
            onKeyDown={function(e) { if (e.key === 'Enter') salvaRinomina(); }}
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm" />
        ) : (
          <span className={'flex-1 text-sm ' + (item.attivo ? 'text-gray-800' : 'text-gray-400')}>{item.nome}</span>
        )}
        {!item.attivo && !inEdit && <BadgeDisattivo />}
        {puoScrivere && (inEdit ? (
          <>
            <button onClick={salvaRinomina} className="text-xs px-2 py-1 rounded bg-wine-700 text-white">Salva</button>
            <button onClick={function() { setEdit(null); }} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600">Annulla</button>
          </>
        ) : (
          <>
            <button onClick={function() { setEdit({ kind: kind, id: item.id, val: item.nome }); }}
              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">Rinomina</button>
            {item.attivo ? (
              <button onClick={function() { setAttivo(kind, item.id, false); }}
                className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-50">Disattiva</button>
            ) : (
              <button onClick={function() { setAttivo(kind, item.id, true); }}
                className="text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50">Riattiva</button>
            )}
          </>
        ))}
      </div>
    );
  }

  var saleVisibili = mostraDisattivati ? sale : sale.filter(function(s) { return s.attivo; });
  var centriVisibili = mostraDisattivati ? centri : centri.filter(function(c) { return c.attivo; });

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Gestione variabili cassa</h1>
        <button onClick={function() { navigate(-1); }}
          className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">
          &larr; Torna alla cassa
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={mostraDisattivati}
            onChange={function(e) { setMostraDisattivati(e.target.checked); }}
            className="w-4 h-4 accent-wine-700" />
          Mostra disattivati
        </label>
      </div>

      {!puoScrivere && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Sola consultazione: non hai il permesso di modificare le variabili.
        </div>
      )}

      {msg && (
        <div className={'mb-4 p-3 rounded-lg text-sm ' + (msg.indexOf('Errore') === 0 ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800')}>
          {msg}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {[{ id: 'saletavoli', label: 'Sale e tavoli' }, { id: 'centri', label: 'Centri di costo' }].map(function(t) {
          var sel = t.id === sezione;
          return (
            <button key={t.id} onClick={function() { setSezione(t.id); }}
              className={'px-4 py-2 text-sm font-medium border-b-2 ' + (sel ? 'border-wine-700 text-wine-800' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ─────────── SALE E TAVOLI ─────────── */}
      {sezione === 'saletavoli' && (
        <div className="space-y-5">

          {puoScrivere && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Nuova sala</div>
                <input value={nuovaSala} onChange={function(e) { setNuovaSala(e.target.value); }}
                  onKeyDown={function(e) { if (e.key === 'Enter') aggiungiSala(); }}
                  placeholder="es. Sala Principale, Sala Pergola"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <button onClick={aggiungiSala} className="px-4 py-2 bg-wine-700 hover:bg-wine-800 text-white rounded-lg text-sm font-medium">+ Aggiungi sala</button>
            </div>
          )}

          {saleVisibili.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm">Nessuna sala.</div>
          ) : saleVisibili.map(function(s) {
            var tav = tavoli.filter(function(t) { return t.sala_id === s.id; });
            var tavVisibili = mostraDisattivati ? tav : tav.filter(function(t) { return t.attivo; });
            var st = statoAgg(s.id);
            return (
              <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="mb-3"><RigaEditabile item={s} kind="sala" /></div>

                {/* tavoli della sala */}
                <div className="ml-1 pl-3 border-l-2 border-gray-100">
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Tavoli</div>
                  {tavVisibili.length === 0 ? (
                    <div className="text-sm text-gray-400 mb-3">Nessun tavolo in questa sala.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      {tavVisibili.map(function(t) { return <RigaEditabile key={t.id} item={t} kind="tavolo" />; })}
                    </div>
                  )}

                  {puoScrivere && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-[140px]">
                          <div className="text-xs text-gray-500 mb-1">Aggiungi un tavolo</div>
                          <input value={st.nome} onChange={function(e) { setAgg(s.id, 'nome', e.target.value); }}
                            onKeyDown={function(e) { if (e.key === 'Enter') aggiungiTavoloSingolo(s.id); }}
                            placeholder="nome o numero"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        </div>
                        <button onClick={function() { aggiungiTavoloSingolo(s.id); }}
                          className="px-3 py-2 bg-wine-700 hover:bg-wine-800 text-white rounded-lg text-sm">+ Aggiungi</button>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Da n.</div>
                          <input type="number" value={st.da} onChange={function(e) { setAgg(s.id, 'da', e.target.value); }}
                            className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center" />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">A n.</div>
                          <input type="number" value={st.a} onChange={function(e) { setAgg(s.id, 'a', e.target.value); }}
                            className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center" />
                        </div>
                        <button onClick={function() { aggiungiTavoliBlocco(s.id); }}
                          className="px-3 py-2 border-2 border-wine-700 text-wine-700 hover:bg-wine-50 rounded-lg text-sm font-medium">
                          + Aggiungi tavoli in blocco
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─────────── CENTRI DI COSTO ─────────── */}
      {sezione === 'centri' && (
        <div className="space-y-5">
          {puoScrivere && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Nuovo centro di costo</div>
                <input value={nuovoCentro} onChange={function(e) { setNuovoCentro(e.target.value); }}
                  onKeyDown={function(e) { if (e.key === 'Enter') aggiungiCentro(); }}
                  placeholder="es. Spese Sala, Animazione, Fiori"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <button onClick={aggiungiCentro} className="px-4 py-2 bg-wine-700 hover:bg-wine-800 text-white rounded-lg text-sm font-medium">+ Aggiungi centro</button>
            </div>
          )}

          {centriVisibili.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm">Nessun centro di costo.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {centriVisibili.map(function(c) { return <RigaEditabile key={c.id} item={c} kind="centro" />; })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
