import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Save, Tractor, Hotel, Calendar, Euro, Clock, Plus, Trash2, Sun, TrendingUp, AlertTriangle } from 'lucide-react';

// Formatta un importo come "1.234,56"
function fmtEuro(n) {
  if (n === null || n === undefined || n === '') return '—';
  var num = parseFloat(n);
  if (isNaN(num)) return '—';
  return num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Formatta una tariffa oraria con fino a 4 decimali significativi (es. 5,6250 → 5,625)
function fmtTariffa(n) {
  if (n === null || n === undefined || n === '' || isNaN(parseFloat(n))) return '0,0000';
  var num = parseFloat(n);
  // Mostra fino a 4 decimali, rimuovendo gli zeri finali oltre il secondo
  var s = num.toFixed(4);
  // Rimuove zeri finali dal terzo decimale in poi, ma lascia almeno 2
  s = s.replace(/(\.\d{2})0+$/, '$1');
  return s.replace('.', ',');
}

// Da yyyy-mm-dd a dd/mm/yyyy
function fmtDate(iso) {
  if (!iso) return '—';
  var m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return m[3] + '/' + m[2] + '/' + m[1];
}

// Primo giorno del mese di una data ISO (yyyy-mm-01)
function firstOfMonth(iso) {
  var m = (iso || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return m[1] + '-' + m[2] + '-01';
}

// Oggi in ISO yyyy-mm-dd
function todayIso() {
  var d = new Date();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

export default function StipendioDipendenteDetail() {
  var params = useParams();
  var navigate = useNavigate();
  var staffId = params.id;

  var [loading, setLoading] = useState(true);
  var [member, setMember] = useState(null);

  // Profilo paghe (form)
  var [profileId, setProfileId] = useState(null);
  var [tipo, setTipo] = useState('campagna');
  var [settorePaghe, setSettorePaghe] = useState('');
  var [target, setTarget] = useState('');
  var [giorniFerie, setGiorniFerie] = useState('21');
  var [note, setNote] = useState('');
  var [profileSaving, setProfileSaving] = useState(false);
  var [profileMsg, setProfileMsg] = useState(null);

  // Storico stipendi (resort)
  var [stipendi, setStipendi] = useState([]);
  var [newStipImporto, setNewStipImporto] = useState('');
  var [newStipDal, setNewStipDal] = useState(firstOfMonth(todayIso()));
  var [newStipNote, setNewStipNote] = useState('');

  // Storico tariffe (campagna)
  var [tariffe, setTariffe] = useState([]);
  var [newTarImporto, setNewTarImporto] = useState('');
  var [newTarDal, setNewTarDal] = useState(firstOfMonth(todayIso()));
  var [newTarNote, setNewTarNote] = useState('');

  // Ferie
  var [annoFerie, setAnnoFerie] = useState(new Date().getFullYear());
  var [situazioneFerie, setSituazioneFerie] = useState(null);
  var [ferieMovimenti, setFerieMovimenti] = useState([]);
  var [newFerieData, setNewFerieData] = useState(todayIso());
  var [newFerieGiorni, setNewFerieGiorni] = useState('1');
  var [newFerieNote, setNewFerieNote] = useState('');

  useEffect(function() {
    loadAll();
  }, [staffId]);

  useEffect(function() {
    loadFerie();
  }, [annoFerie, staffId]);

  function loadAll() {
    setLoading(true);

    var pMember = supabase
      .from('staff_members')
      .select('id, first_name, last_name, fiscal_code, hire_date, contract_end_date, is_active')
      .eq('id', staffId)
      .single();

    var pProfilo = supabase
      .from('stip_profili')
      .select('*')
      .eq('staff_id', staffId);

    var pStip = supabase
      .from('stip_stipendi_storico')
      .select('*')
      .eq('staff_id', staffId)
      .order('valido_dal', { ascending: false });

    var pTar = supabase
      .from('stip_tariffe_storico')
      .select('*')
      .eq('staff_id', staffId)
      .order('valido_dal', { ascending: false });

    Promise.all([pMember, pProfilo, pStip, pTar]).then(function(results) {
      var mRes = results[0];
      if (mRes.error || !mRes.data) {
        alert('Dipendente non trovato.');
        navigate('/stipendi/dipendenti');
        return;
      }
      setMember(mRes.data);

      var profData = results[1].data || [];
      if (profData.length > 0) {
        var p = profData[0];
        setProfileId(p.id);
        setTipo(p.tipo || 'campagna');
        setSettorePaghe(p.settore_paghe || '');
        setTarget(p.giornate_target_annue ? String(p.giornate_target_annue) : '');
        setGiorniFerie(p.giorni_ferie_annui ? String(p.giorni_ferie_annui) : '21');
        setNote(p.note || '');
      } else {
        setProfileId(null);
      }

      setStipendi(results[2].data || []);
      setTariffe(results[3].data || []);

      setLoading(false);
    });
  }

  function loadFerie() {
    if (!staffId) return;

    // Chiama la funzione SQL che calcola la situazione
    supabase
      .rpc('stip_ferie_situazione', { p_staff_id: staffId, p_anno: parseInt(annoFerie, 10) })
      .then(function(res) {
        if (!res.error && res.data && res.data.length > 0) {
          setSituazioneFerie(res.data[0]);
        } else {
          setSituazioneFerie(null);
        }
      });

    // Carica i movimenti di ferie dell'anno
    var inizio = annoFerie + '-01-01';
    var fine = annoFerie + '-12-31';
    supabase
      .from('stip_ferie_movimenti')
      .select('*')
      .eq('staff_id', staffId)
      .gte('data_inizio', inizio)
      .lte('data_inizio', fine)
      .order('data_inizio', { ascending: false })
      .then(function(res) {
        if (!res.error) {
          setFerieMovimenti(res.data || []);
        }
      });
  }

  // ----------------------------------------------------------
  // PROFILO PAGHE — salva / aggiorna
  // ----------------------------------------------------------
  function saveProfilo() {
    setProfileSaving(true);
    setProfileMsg(null);

    var payload = {
      staff_id: staffId,
      tipo: tipo,
      settore_paghe: settorePaghe.trim() || null,
      giornate_target_annue: target ? parseInt(target, 10) : null,
      giorni_ferie_annui: giorniFerie ? parseFloat(giorniFerie) : 21,
      note: note.trim() || null
    };

    var query = profileId
      ? supabase.from('stip_profili').update(payload).eq('id', profileId).select().single()
      : supabase.from('stip_profili').insert(payload).select().single();

    query.then(function(res) {
      setProfileSaving(false);
      if (res.error) {
        setProfileMsg({ type: 'error', text: 'Errore: ' + res.error.message });
        return;
      }
      setProfileId(res.data.id);
      setProfileMsg({ type: 'ok', text: 'Profilo paghe salvato.' });
      // Pulisci il messaggio dopo qualche secondo
      setTimeout(function() { setProfileMsg(null); }, 3500);
      // Ricarica la situazione ferie nel caso sia cambiato giorni_ferie_annui
      loadFerie();
    });
  }

  // ----------------------------------------------------------
  // STORICO STIPENDI (resort)
  // ----------------------------------------------------------
  function addStipendio() {
    if (!newStipImporto || !newStipDal) {
      alert('Inserisci importo e data di validita.');
      return;
    }
    var payload = {
      staff_id: staffId,
      importo_mensile: parseFloat(newStipImporto.replace(',', '.')),
      valido_dal: newStipDal,
      note: newStipNote.trim() || null
    };
    supabase
      .from('stip_stipendi_storico')
      .insert(payload)
      .select()
      .single()
      .then(function(res) {
        if (res.error) {
          alert('Errore: ' + res.error.message);
          return;
        }
        setStipendi(function(prev) {
          var next = prev.concat([res.data]);
          next.sort(function(a, b) { return a.valido_dal < b.valido_dal ? 1 : -1; });
          return next;
        });
        setNewStipImporto('');
        setNewStipNote('');
      });
  }

  function deleteStipendio(id) {
    if (!confirm('Rimuovere questa voce dallo storico stipendi?')) return;
    supabase
      .from('stip_stipendi_storico')
      .delete()
      .eq('id', id)
      .then(function(res) {
        if (res.error) {
          alert('Errore: ' + res.error.message);
          return;
        }
        setStipendi(function(prev) { return prev.filter(function(s) { return s.id !== id; }); });
      });
  }

  // ----------------------------------------------------------
  // STORICO TARIFFE (campagna)
  // ----------------------------------------------------------
  function addTariffa() {
    if (!newTarImporto || !newTarDal) {
      alert('Inserisci tariffa e data di validita.');
      return;
    }
    var payload = {
      staff_id: staffId,
      tariffa_oraria: parseFloat(newTarImporto.replace(',', '.')),
      valido_dal: newTarDal,
      note: newTarNote.trim() || null
    };
    supabase
      .from('stip_tariffe_storico')
      .insert(payload)
      .select()
      .single()
      .then(function(res) {
        if (res.error) {
          alert('Errore: ' + res.error.message);
          return;
        }
        setTariffe(function(prev) {
          var next = prev.concat([res.data]);
          next.sort(function(a, b) { return a.valido_dal < b.valido_dal ? 1 : -1; });
          return next;
        });
        setNewTarImporto('');
        setNewTarNote('');
      });
  }

  function deleteTariffa(id) {
    if (!confirm('Rimuovere questa voce dallo storico tariffe?')) return;
    supabase
      .from('stip_tariffe_storico')
      .delete()
      .eq('id', id)
      .then(function(res) {
        if (res.error) {
          alert('Errore: ' + res.error.message);
          return;
        }
        setTariffe(function(prev) { return prev.filter(function(t) { return t.id !== id; }); });
      });
  }

  // ----------------------------------------------------------
  // FERIE — aggiungi / rimuovi giorni goduti
  // ----------------------------------------------------------
  function addFerie() {
    if (!newFerieData || !newFerieGiorni) {
      alert('Inserisci data inizio e numero di giorni.');
      return;
    }
    var giorni = parseFloat(newFerieGiorni.replace(',', '.'));
    if (isNaN(giorni) || giorni <= 0) {
      alert('Inserisci un numero di giorni valido.');
      return;
    }
    var payload = {
      staff_id: staffId,
      data_inizio: newFerieData,
      giorni: giorni,
      note: newFerieNote.trim() || null
    };
    supabase
      .from('stip_ferie_movimenti')
      .insert(payload)
      .select()
      .single()
      .then(function(res) {
        if (res.error) {
          alert('Errore: ' + res.error.message);
          return;
        }
        setNewFerieData(todayIso());
        setNewFerieGiorni('1');
        setNewFerieNote('');
        loadFerie();
      });
  }

  function deleteFerie(id) {
    if (!confirm('Rimuovere questa registrazione di ferie?')) return;
    supabase
      .from('stip_ferie_movimenti')
      .delete()
      .eq('id', id)
      .then(function(res) {
        if (res.error) {
          alert('Errore: ' + res.error.message);
          return;
        }
        loadFerie();
      });
  }

  if (loading || !member) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">Caricamento...</div>
      </div>
    );
  }

  // Anni disponibili per la selezione ferie (da assunzione a oggi)
  var anniFerie = [];
  var annoCorrente = new Date().getFullYear();
  var primoAnno = member.hire_date ? parseInt(member.hire_date.substring(0, 4), 10) : annoCorrente;
  for (var y = annoCorrente + 1; y >= primoAnno; y--) anniFerie.push(y);

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Intestazione */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={function() { navigate('/stipendi/dipendenti'); }}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {member.last_name} {member.first_name}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Profilo paghe e gestione stipendi
            {!member.is_active && <span className="text-amber-600 ml-2">(dipendente non attivo)</span>}
          </p>
        </div>
      </div>

      <div className="space-y-6">

        {/* PROFILO PAGHE */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar size={18} className="text-wine-600" />
            Profilo paghe
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo dipendente</label>
              <div className="flex gap-3">
                <button
                  onClick={function() { setTipo('campagna'); }}
                  className={
                    'flex-1 flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium transition-colors ' +
                    (tipo === 'campagna'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')
                  }>
                  <Tractor size={16} />
                  Campagna (a giornata/ora)
                </button>
                <button
                  onClick={function() { setTipo('resort'); }}
                  className={
                    'flex-1 flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-medium transition-colors ' +
                    (tipo === 'resort'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')
                  }>
                  <Hotel size={16} />
                  Resort (stipendio fisso)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Settore paghe</label>
              <input
                type="text"
                value={settorePaghe}
                onChange={function(e) { setSettorePaghe(e.target.value); }}
                placeholder="Es. CAMPAGNA, SALA, CUCINA, CAMERE"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target giornate annue</label>
              <input
                type="number"
                value={target}
                onChange={function(e) { setTarget(e.target.value); }}
                placeholder="Es. 156, 180"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
              <p className="text-xs text-gray-400 mt-1">
                Usato nelle proiezioni della busta paga.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giorni di ferie l'anno</label>
              <input
                type="number"
                step="0.5"
                value={giorniFerie}
                onChange={function(e) { setGiorniFerie(e.target.value); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
              <p className="text-xs text-gray-400 mt-1">
                Di norma 21. Maturazione giornaliera: {giorniFerie || '21'}/365 al giorno.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
              <textarea
                value={note}
                onChange={function(e) { setNote(e.target.value); }}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
            </div>

          </div>

          {profileMsg && (
            <div className={
              'mt-4 p-3 rounded-lg text-sm ' +
              (profileMsg.type === 'ok'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-700')
            }>
              {profileMsg.text}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={saveProfilo}
              disabled={profileSaving}
              className="flex items-center gap-2 bg-wine-700 text-white px-4 py-2 rounded-lg hover:bg-wine-800 transition-colors text-sm font-medium disabled:opacity-50">
              <Save size={16} />
              {profileSaving ? 'Salvataggio...' : 'Salva profilo paghe'}
            </button>
          </div>
        </div>

        {/* STORICO STIPENDI (resort) */}
        {tipo === 'resort' && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
              <Euro size={18} className="text-wine-600" />
              Storico stipendio mensile
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Quando lo stipendio cambia, aggiungi una nuova riga indicando la data dalla quale e' valido.
              Retribuzione giornaliera = stipendio mensile / 26.
            </p>

            {stipendi.length === 0 ? (
              <p className="text-sm text-gray-400 italic mb-4">Nessuno stipendio inserito.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {stipendi.map(function(s, idx) {
                  var giornaliera = s.importo_mensile / 26;
                  var isCorrente = idx === 0;
                  return (
                    <div key={s.id} className={
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 border ' +
                      (isCorrente ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200')
                    }>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">€ {fmtEuro(s.importo_mensile)}/mese</span>
                          <span className="text-xs text-gray-500">(€ {fmtEuro(giornaliera)}/giorno)</span>
                          {isCorrente && (
                            <span className="text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full font-medium">Vigente</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Dal {fmtDate(s.valido_dal)}
                          {s.note && <span className="ml-2 text-gray-400">— {s.note}</span>}
                        </div>
                      </div>
                      <button
                        onClick={function() { deleteStipendio(s.id); }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Aggiungi nuovo stipendio</p>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <input
                  type="text"
                  value={newStipImporto}
                  onChange={function(e) { setNewStipImporto(e.target.value); }}
                  placeholder="Importo €"
                  className="sm:col-span-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
                <input
                  type="date"
                  value={newStipDal}
                  onChange={function(e) { setNewStipDal(e.target.value); }}
                  className="sm:col-span-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
                <input
                  type="text"
                  value={newStipNote}
                  onChange={function(e) { setNewStipNote(e.target.value); }}
                  placeholder="Note (opzionale)"
                  className="sm:col-span-4 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
                <button
                  onClick={addStipendio}
                  className="sm:col-span-2 flex items-center justify-center gap-1 bg-wine-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-wine-800 transition-colors">
                  <Plus size={14} />
                  Aggiungi
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STORICO TARIFFE (campagna) */}
        {tipo === 'campagna' && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
              <Clock size={18} className="text-wine-600" />
              Storico tariffa oraria
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Quando la tariffa oraria cambia, aggiungi una nuova riga indicando da quando vale.
            </p>

            {tariffe.length === 0 ? (
              <p className="text-sm text-gray-400 italic mb-4">Nessuna tariffa inserita.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {tariffe.map(function(t, idx) {
                  var isCorrente = idx === 0;
                  return (
                    <div key={t.id} className={
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 border ' +
                      (isCorrente ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200')
                    }>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">€ {fmtTariffa(t.tariffa_oraria)}/ora</span>
                          {isCorrente && (
                            <span className="text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full font-medium">Vigente</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Dal {fmtDate(t.valido_dal)}
                          {t.note && <span className="ml-2 text-gray-400">— {t.note}</span>}
                        </div>
                      </div>
                      <button
                        onClick={function() { deleteTariffa(t.id); }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Aggiungi nuova tariffa</p>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <input
                  type="text"
                  value={newTarImporto}
                  onChange={function(e) { setNewTarImporto(e.target.value); }}
                  placeholder="€/ora"
                  className="sm:col-span-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
                <input
                  type="date"
                  value={newTarDal}
                  onChange={function(e) { setNewTarDal(e.target.value); }}
                  className="sm:col-span-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
                <input
                  type="text"
                  value={newTarNote}
                  onChange={function(e) { setNewTarNote(e.target.value); }}
                  placeholder="Note (opzionale)"
                  className="sm:col-span-4 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
                <button
                  onClick={addTariffa}
                  className="sm:col-span-2 flex items-center justify-center gap-1 bg-wine-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-wine-800 transition-colors">
                  <Plus size={14} />
                  Aggiungi
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FERIE */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Sun size={18} className="text-wine-600" />
              Ferie
            </h2>
            <select
              value={annoFerie}
              onChange={function(e) { setAnnoFerie(parseInt(e.target.value, 10)); }}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300">
              {anniFerie.map(function(y) {
                return <option key={y} value={y}>Anno {y}</option>;
              })}
            </select>
          </div>

          {situazioneFerie && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-xs text-gray-500">Giorni di servizio</div>
                <div className="text-lg font-bold text-gray-900 mt-0.5">
                  {situazioneFerie.giorni_servizio}/{situazioneFerie.giorni_anno}
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <div className="text-xs text-emerald-700 flex items-center gap-1">
                  <TrendingUp size={11} />
                  Maturato
                </div>
                <div className="text-lg font-bold text-emerald-700 mt-0.5">
                  {fmtEuro(situazioneFerie.maturato)} gg
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-xs text-blue-700">Goduto</div>
                <div className="text-lg font-bold text-blue-700 mt-0.5">
                  {fmtEuro(situazioneFerie.goduto)} gg
                </div>
              </div>
              <div className={
                'border rounded-lg p-3 ' +
                (parseFloat(situazioneFerie.residuo) >= 0
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-red-50 border-red-200')
              }>
                <div className={
                  'text-xs flex items-center gap-1 ' +
                  (parseFloat(situazioneFerie.residuo) >= 0 ? 'text-amber-700' : 'text-red-700')
                }>
                  Residuo
                  {parseFloat(situazioneFerie.residuo) < 0 && <AlertTriangle size={11} />}
                </div>
                <div className={
                  'text-lg font-bold mt-0.5 ' +
                  (parseFloat(situazioneFerie.residuo) >= 0 ? 'text-amber-700' : 'text-red-700')
                }>
                  {fmtEuro(situazioneFerie.residuo)} gg
                </div>
              </div>
            </div>
          )}

          {situazioneFerie && parseFloat(situazioneFerie.residuo) < 0 && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-start gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                Attenzione: ferie godute in eccesso rispetto al maturato.
                In caso di cessazione i giorni in eccesso vanno trattenuti in busta paga.
              </span>
            </div>
          )}

          {/* Registro ferie godute */}
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Giorni goduti</p>

          {ferieMovimenti.length === 0 ? (
            <p className="text-sm text-gray-400 italic mb-4">Nessuna giornata di ferie registrata per il {annoFerie}.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {ferieMovimenti.map(function(f) {
                return (
                  <div key={f.id} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <span className="font-medium text-gray-900">{fmtDate(f.data_inizio)}</span>
                        <span className="text-gray-400">—</span>
                        <span className="text-gray-700">{fmtEuro(f.giorni)} {parseFloat(f.giorni) === 1 ? 'giorno' : 'giorni'}</span>
                        {f.note && <span className="text-xs text-gray-500">({f.note})</span>}
                      </div>
                    </div>
                    <button
                      onClick={function() { deleteFerie(f.id); }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="border-t border-gray-200 pt-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Registra ferie godute</p>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="date"
                value={newFerieData}
                onChange={function(e) { setNewFerieData(e.target.value); }}
                className="sm:col-span-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
              <input
                type="text"
                value={newFerieGiorni}
                onChange={function(e) { setNewFerieGiorni(e.target.value); }}
                placeholder="Giorni"
                className="sm:col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
              <input
                type="text"
                value={newFerieNote}
                onChange={function(e) { setNewFerieNote(e.target.value); }}
                placeholder="Note (opzionale)"
                className="sm:col-span-5 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
              <button
                onClick={addFerie}
                className="sm:col-span-2 flex items-center justify-center gap-1 bg-wine-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-wine-800 transition-colors">
                <Plus size={14} />
                Aggiungi
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Inserisci la data del primo giorno di ferie e quanti giorni (puoi usare anche frazioni, es. 0,5 per mezza giornata).
            </p>
          </div>
        </div>

      </div>

      <div className="h-8" />
    </div>
  );
}
