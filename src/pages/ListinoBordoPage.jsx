import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

function emptyProdotto() {
  return {
    id: null,
    nome_it: '',
    nome_en: '',
    descrizione_it: '',
    descrizione_en: '',
    prezzo: '',
    categoria_id: '',
    disponibile: true,
    ordine: 0
  };
}

function emptyCategoria() {
  return { id: null, nome_it: '', nome_en: '', ordine: 0, attivo: true };
}

function emptyCamera() {
  return { id: null, nome: '', attivo: true, ordine: 0 };
}

export default function ListinoBordoPage() {
  var [tab, setTab] = useState('prodotti');

  // ---- Prodotti ----
  var [voci, setVoci] = useState([]);
  var [loadingVoci, setLoadingVoci] = useState(true);
  var [errorVoci, setErrorVoci] = useState(null);
  var [showProdModal, setShowProdModal] = useState(false);
  var [prodForm, setProdForm] = useState(emptyProdotto());
  var [savingProd, setSavingProd] = useState(false);
  var [prodModalError, setProdModalError] = useState(null);
  var [delProd, setDelProd] = useState(null);

  // ---- Categorie ----
  var [categorie, setCategorie] = useState([]);
  var [loadingCateg, setLoadingCateg] = useState(true);
  var [errorCateg, setErrorCateg] = useState(null);
  var [showCategModal, setShowCategModal] = useState(false);
  var [categForm, setCategForm] = useState(emptyCategoria());
  var [savingCateg, setSavingCateg] = useState(false);
  var [categModalError, setCategModalError] = useState(null);
  var [delCateg, setDelCateg] = useState(null);

  // ---- Camere ----
  var [camere, setCamere] = useState([]);
  var [loadingCam, setLoadingCam] = useState(true);
  var [errorCam, setErrorCam] = useState(null);
  var [showCamModal, setShowCamModal] = useState(false);
  var [camForm, setCamForm] = useState(emptyCamera());
  var [savingCam, setSavingCam] = useState(false);
  var [camModalError, setCamModalError] = useState(null);
  var [delCam, setDelCam] = useState(null);

  // ===== Caricamenti =====
  function loadVoci() {
    setLoadingVoci(true);
    setErrorVoci(null);
    supabase
      .from('listino_bordo')
      .select('*')
      .order('categoria', { ascending: true })
      .order('ordine', { ascending: true })
      .order('nome_it', { ascending: true })
      .then(function(result) {
        setLoadingVoci(false);
        if (result.error) {
          setErrorVoci('Errore caricamento listino: ' + result.error.message);
        } else {
          setVoci(result.data || []);
        }
      });
  }

  function loadCamere() {
    setLoadingCam(true);
    setErrorCam(null);
    supabase
      .from('camere')
      .select('*')
      .order('ordine', { ascending: true })
      .order('nome', { ascending: true })
      .then(function(result) {
        setLoadingCam(false);
        if (result.error) {
          setErrorCam('Errore caricamento camere: ' + result.error.message);
        } else {
          setCamere(result.data || []);
        }
      });
  }

  function loadCategorie() {
    setLoadingCateg(true);
    setErrorCateg(null);
    supabase
      .from('categorie_bordo')
      .select('*')
      .order('ordine', { ascending: true })
      .order('nome_it', { ascending: true })
      .then(function(result) {
        setLoadingCateg(false);
        if (result.error) {
          setErrorCateg('Errore caricamento categorie: ' + result.error.message);
        } else {
          setCategorie(result.data || []);
        }
      });
  }

  useEffect(function() {
    loadVoci();
    loadCamere();
    loadCategorie();
  }, []);

  // ===== Prodotti: handlers =====
  function setProdField(field, value) {
    setProdForm(function(prev) {
      var next = {};
      for (var k in prev) { next[k] = prev[k]; }
      next[field] = value;
      return next;
    });
  }

  function openNewProd() {
    setProdForm(emptyProdotto());
    setProdModalError(null);
    setShowProdModal(true);
  }

  function openEditProd(voce) {
    setProdForm({
      id: voce.id,
      nome_it: voce.nome_it || '',
      nome_en: voce.nome_en || '',
      descrizione_it: voce.descrizione_it || '',
      descrizione_en: voce.descrizione_en || '',
      prezzo: voce.prezzo != null ? String(voce.prezzo) : '',
      categoria_id: voce.categoria_id || '',
      disponibile: voce.disponibile !== false,
      ordine: voce.ordine || 0
    });
    setProdModalError(null);
    setShowProdModal(true);
  }

  function openDuplicateProd(voce) {
    setProdForm({
      id: null,
      nome_it: (voce.nome_it || '') + ' (copia)',
      nome_en: voce.nome_en || '',
      descrizione_it: voce.descrizione_it || '',
      descrizione_en: voce.descrizione_en || '',
      prezzo: voce.prezzo != null ? String(voce.prezzo) : '',
      categoria_id: voce.categoria_id || '',
      disponibile: voce.disponibile !== false,
      ordine: voce.ordine || 0
    });
    setProdModalError(null);
    setShowProdModal(true);
  }

  function saveProd() {
    setProdModalError(null);
    if (!prodForm.nome_it.trim()) {
      setProdModalError('Il nome in italiano è obbligatorio.');
      return;
    }
    var prezzoNum = parseFloat(String(prodForm.prezzo).replace(',', '.'));
    if (isNaN(prezzoNum) || prezzoNum < 0) {
      setProdModalError('Inserisci un prezzo valido.');
      return;
    }
    var catSel = null;
    for (var ci = 0; ci < categorie.length; ci++) {
      if (categorie[ci].id === prodForm.categoria_id) { catSel = categorie[ci]; break; }
    }
    var payload = {
      nome_it: prodForm.nome_it.trim(),
      nome_en: prodForm.nome_en.trim() ? prodForm.nome_en.trim() : null,
      descrizione_it: prodForm.descrizione_it.trim() ? prodForm.descrizione_it.trim() : null,
      descrizione_en: prodForm.descrizione_en.trim() ? prodForm.descrizione_en.trim() : null,
      prezzo: prezzoNum,
      categoria_id: prodForm.categoria_id ? prodForm.categoria_id : null,
      categoria: catSel ? catSel.nome_it : null,
      disponibile: Boolean(prodForm.disponibile),
      ordine: parseInt(prodForm.ordine, 10) || 0
    };
    setSavingProd(true);
    var q = prodForm.id
      ? supabase.from('listino_bordo').update(payload).eq('id', prodForm.id)
      : supabase.from('listino_bordo').insert(payload);
    q.then(function(result) {
      setSavingProd(false);
      if (result.error) {
        setProdModalError('Errore salvataggio: ' + result.error.message);
      } else {
        setShowProdModal(false);
        loadVoci();
      }
    });
  }

  function toggleProdDisponibile(voce) {
    supabase
      .from('listino_bordo')
      .update({ disponibile: !(voce.disponibile !== false) })
      .eq('id', voce.id)
      .then(function(result) {
        if (!result.error) { loadVoci(); }
      });
  }

  function deleteProd() {
    if (!delProd) return;
    supabase.from('listino_bordo').delete().eq('id', delProd.id).then(function(result) {
      setDelProd(null);
      if (!result.error) { loadVoci(); }
      else { setErrorVoci('Errore eliminazione: ' + result.error.message); }
    });
  }

  // ===== Camere: handlers =====
  function setCamField(field, value) {
    setCamForm(function(prev) {
      var next = {};
      for (var k in prev) { next[k] = prev[k]; }
      next[field] = value;
      return next;
    });
  }

  function openNewCam() {
    setCamForm(emptyCamera());
    setCamModalError(null);
    setShowCamModal(true);
  }

  function openEditCam(c) {
    setCamForm({ id: c.id, nome: c.nome || '', attivo: c.attivo !== false, ordine: c.ordine || 0 });
    setCamModalError(null);
    setShowCamModal(true);
  }

  function saveCam() {
    setCamModalError(null);
    if (!camForm.nome.trim()) {
      setCamModalError('Il nome della camera è obbligatorio.');
      return;
    }
    var payload = {
      nome: camForm.nome.trim(),
      attivo: Boolean(camForm.attivo),
      ordine: parseInt(camForm.ordine, 10) || 0
    };
    setSavingCam(true);
    var q = camForm.id
      ? supabase.from('camere').update(payload).eq('id', camForm.id)
      : supabase.from('camere').insert(payload);
    q.then(function(result) {
      setSavingCam(false);
      if (result.error) {
        setCamModalError('Errore salvataggio: ' + result.error.message);
      } else {
        setShowCamModal(false);
        loadCamere();
      }
    });
  }

  function toggleCamAttivo(c) {
    supabase
      .from('camere')
      .update({ attivo: !(c.attivo !== false) })
      .eq('id', c.id)
      .then(function(result) {
        if (!result.error) { loadCamere(); }
      });
  }

  function deleteCam() {
    if (!delCam) return;
    supabase.from('camere').delete().eq('id', delCam.id).then(function(result) {
      setDelCam(null);
      if (!result.error) { loadCamere(); }
      else { setErrorCam('Errore eliminazione: ' + result.error.message); }
    });
  }

  // ===== Categorie: handlers =====
  function setCategField(field, value) {
    setCategForm(function(prev) {
      var next = {};
      for (var k in prev) { next[k] = prev[k]; }
      next[field] = value;
      return next;
    });
  }

  function openNewCateg() {
    setCategForm(emptyCategoria());
    setCategModalError(null);
    setShowCategModal(true);
  }

  function openEditCateg(c) {
    setCategForm({
      id: c.id,
      nome_it: c.nome_it || '',
      nome_en: c.nome_en || '',
      ordine: c.ordine || 0,
      attivo: c.attivo !== false
    });
    setCategModalError(null);
    setShowCategModal(true);
  }

  function saveCateg() {
    setCategModalError(null);
    if (!categForm.nome_it.trim()) {
      setCategModalError('Il nome in italiano è obbligatorio.');
      return;
    }
    var payload = {
      nome_it: categForm.nome_it.trim(),
      nome_en: categForm.nome_en.trim() ? categForm.nome_en.trim() : null,
      ordine: parseInt(categForm.ordine, 10) || 0,
      attivo: Boolean(categForm.attivo)
    };
    setSavingCateg(true);
    var q = categForm.id
      ? supabase.from('categorie_bordo').update(payload).eq('id', categForm.id)
      : supabase.from('categorie_bordo').insert(payload);
    q.then(function(result) {
      setSavingCateg(false);
      if (result.error) {
        setCategModalError('Errore salvataggio: ' + result.error.message);
      } else {
        setShowCategModal(false);
        loadCategorie();
        // I prodotti mostrano il nome categoria: ricarico per riflettere eventuali rinomine.
        loadVoci();
      }
    });
  }

  function toggleCategAttiva(c) {
    supabase
      .from('categorie_bordo')
      .update({ attivo: !(c.attivo !== false) })
      .eq('id', c.id)
      .then(function(result) {
        if (!result.error) { loadCategorie(); }
      });
  }

  function deleteCateg() {
    if (!delCateg) return;
    supabase.from('categorie_bordo').delete().eq('id', delCateg.id).then(function(result) {
      setDelCateg(null);
      if (!result.error) {
        loadCategorie();
        loadVoci();
      } else {
        setErrorCateg('Errore eliminazione: ' + result.error.message);
      }
    });
  }

  function nomeCategoria(voce) {
    for (var i = 0; i < categorie.length; i++) {
      if (categorie[i].id === voce.categoria_id) {
        return categorie[i].nome_en
          ? categorie[i].nome_it + ' / ' + categorie[i].nome_en
          : categorie[i].nome_it;
      }
    }
    return voce.categoria || '—';
  }

  var tabBtn = 'px-4 py-2 rounded-lg text-sm font-medium ';

  return (
    <div className="p-6">

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Listino e Camere</h1>
        <p className="text-gray-500 mt-1 text-sm">Prodotti ordinabili e anagrafica camere per gli ordini bordo</p>
      </div>

      {/* Tab */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={function() { setTab('prodotti'); }}
          className={tabBtn + (tab === 'prodotti' ? 'bg-wine-700 text-white' : 'bg-white border border-gray-300 text-gray-600')}
        >
          Prodotti
        </button>
        <button
          onClick={function() { setTab('camere'); }}
          className={tabBtn + (tab === 'camere' ? 'bg-wine-700 text-white' : 'bg-white border border-gray-300 text-gray-600')}
        >
          Camere
        </button>
        <button
          onClick={function() { setTab('categorie'); }}
          className={tabBtn + (tab === 'categorie' ? 'bg-wine-700 text-white' : 'bg-white border border-gray-300 text-gray-600')}
        >
          Categorie
        </button>
      </div>

      {/* ===================== TAB PRODOTTI ===================== */}
      {tab === 'prodotti' && (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={openNewProd} className="bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Nuovo prodotto</button>
          </div>

          {errorVoci && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{errorVoci}</div>}

          {loadingVoci ? (
            <div className="text-center py-12 text-gray-400">Caricamento...</div>
          ) : voci.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">Nessun prodotto in listino.</div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Prodotto</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Categoria</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Prezzo</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Disponibile</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {voci.map(function(voce) {
                    var disp = voce.disponibile !== false;
                    return (
                      <tr key={voce.id} className={disp ? 'hover:bg-gray-50' : 'bg-gray-50 opacity-70'}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{voce.nome_it}</div>
                          {voce.nome_en && <div className="text-xs text-gray-400">{voce.nome_en}</div>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{nomeCategoria(voce)}</td>
                        <td className="px-4 py-3 text-right text-gray-900">€ {Number(voce.prezzo).toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={function() { toggleProdDisponibile(voce); }}
                            className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + (disp ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600')}
                          >
                            {disp ? 'Sì' : 'No'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={function() { openEditProd(voce); }} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Modifica</button>
                            <button onClick={function() { openDuplicateProd(voce); }} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Duplica</button>
                            <button onClick={function() { setDelProd(voce); }} className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50">Elimina</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ===================== TAB CAMERE ===================== */}
      {tab === 'camere' && (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={openNewCam} className="bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Nuova camera</button>
          </div>

          {errorCam && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{errorCam}</div>}

          {loadingCam ? (
            <div className="text-center py-12 text-gray-400">Caricamento...</div>
          ) : camere.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">Nessuna camera inserita. Aggiungi la prima: comparirà nel menù a tendina della pagina cliente.</div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Camera</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Attiva</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {camere.map(function(c) {
                    var att = c.attivo !== false;
                    return (
                      <tr key={c.id} className={att ? 'hover:bg-gray-50' : 'bg-gray-50 opacity-70'}>
                        <td className="px-4 py-3 font-medium text-gray-900">{c.nome}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={function() { toggleCamAttivo(c); }}
                            className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + (att ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600')}
                          >
                            {att ? 'Sì' : 'No'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={function() { openEditCam(c); }} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Modifica</button>
                            <button onClick={function() { setDelCam(c); }} className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50">Elimina</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ===================== TAB CATEGORIE ===================== */}
      {tab === 'categorie' && (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={openNewCateg} className="bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Nuova categoria</button>
          </div>

          {errorCateg && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{errorCateg}</div>}

          {loadingCateg ? (
            <div className="text-center py-12 text-gray-400">Caricamento...</div>
          ) : categorie.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">Nessuna categoria. Aggiungi la prima: comparirà nel menù del prodotto e raggrupperà il listino nella pagina cliente.</div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Nome (IT)</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Nome (EN)</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Ordine</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Attiva</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {categorie.map(function(c) {
                    var att = c.attivo !== false;
                    return (
                      <tr key={c.id} className={att ? 'hover:bg-gray-50' : 'bg-gray-50 opacity-70'}>
                        <td className="px-4 py-3 font-medium text-gray-900">{c.nome_it}</td>
                        <td className="px-4 py-3 text-gray-600">{c.nome_en || <span className="text-gray-300">— da tradurre —</span>}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{c.ordine || 0}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={function() { toggleCategAttiva(c); }}
                            className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + (att ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600')}
                          >
                            {att ? 'Sì' : 'No'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={function() { openEditCateg(c); }} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Modifica</button>
                            <button onClick={function() { setDelCateg(c); }} className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50">Elimina</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* MODALE PRODOTTO */}
      {showProdModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{prodForm.id ? 'Modifica prodotto' : 'Nuovo prodotto'}</h2>
              <button onClick={function() { setShowProdModal(false); }} className="text-gray-400 hover:text-gray-600 text-xl font-light">x</button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              {prodModalError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{prodModalError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nome (IT) *</label>
                  <input type="text" value={prodForm.nome_it} onChange={function(e) { setProdField('nome_it', e.target.value); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nome (EN)</label>
                  <input type="text" value={prodForm.nome_en} onChange={function(e) { setProdField('nome_en', e.target.value); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Descrizione (IT)</label>
                  <textarea value={prodForm.descrizione_it} onChange={function(e) { setProdField('descrizione_it', e.target.value); }} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Descrizione (EN)</label>
                  <textarea value={prodForm.descrizione_en} onChange={function(e) { setProdField('descrizione_en', e.target.value); }} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Prezzo (€) *</label>
                  <input type="text" inputMode="decimal" value={prodForm.prezzo} onChange={function(e) { setProdField('prezzo', e.target.value); }} placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Categoria</label>
                  <select
                    value={prodForm.categoria_id}
                    onChange={function(e) { setProdField('categoria_id', e.target.value); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wine-500"
                  >
                    <option value="">— Nessuna —</option>
                    {categorie.map(function(c) {
                      return <option key={c.id} value={c.id}>{c.nome_it}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ordine</label>
                  <input type="number" value={prodForm.ordine} onChange={function(e) { setProdField('ordine', e.target.value); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={Boolean(prodForm.disponibile)} onChange={function(e) { setProdField('disponibile', e.target.checked); }} className="w-4 h-4" />
                Disponibile (visibile ai clienti)
              </label>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
              <button type="button" onClick={function() { setShowProdModal(false); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
              <button type="button" onClick={saveProd} disabled={savingProd} className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium">{savingProd ? 'Salvataggio...' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE CAMERA */}
      {showCamModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{camForm.id ? 'Modifica camera' : 'Nuova camera'}</h2>
              <button onClick={function() { setShowCamModal(false); }} className="text-gray-400 hover:text-gray-600 text-xl font-light">x</button>
            </div>
            <div className="p-6 space-y-4">
              {camModalError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{camModalError}</div>}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome / Numero camera *</label>
                <input type="text" value={camForm.nome} onChange={function(e) { setCamField('nome', e.target.value); }} placeholder="es. 101, Suite Vigna" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ordine</label>
                <input type="number" value={camForm.ordine} onChange={function(e) { setCamField('ordine', e.target.value); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={Boolean(camForm.attivo)} onChange={function(e) { setCamField('attivo', e.target.checked); }} className="w-4 h-4" />
                Attiva (selezionabile dai clienti)
              </label>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
              <button type="button" onClick={function() { setShowCamModal(false); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
              <button type="button" onClick={saveCam} disabled={savingCam} className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium">{savingCam ? 'Salvataggio...' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFERMA ELIMINAZIONE PRODOTTO */}
      {delProd && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Elimina prodotto</h2>
            <p className="text-sm text-gray-600 mb-6">Vuoi eliminare <strong>{delProd.nome_it}</strong> dal listino? Gli ordini già registrati non vengono toccati.</p>
            <div className="flex gap-3">
              <button onClick={function() { setDelProd(null); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
              <button onClick={deleteProd} className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Elimina</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFERMA ELIMINAZIONE CAMERA */}
      {delCam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Elimina camera</h2>
            <p className="text-sm text-gray-600 mb-6">Vuoi eliminare <strong>{delCam.nome}</strong>? In alternativa puoi solo disattivarla per nasconderla ai clienti.</p>
            <div className="flex gap-3">
              <button onClick={function() { setDelCam(null); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
              <button onClick={deleteCam} className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Elimina</button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE CATEGORIA */}
      {showCategModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{categForm.id ? 'Modifica categoria' : 'Nuova categoria'}</h2>
              <button onClick={function() { setShowCategModal(false); }} className="text-gray-400 hover:text-gray-600 text-xl font-light">x</button>
            </div>
            <div className="p-6 space-y-4">
              {categModalError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{categModalError}</div>}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome (IT) *</label>
                <input type="text" value={categForm.nome_it} onChange={function(e) { setCategField('nome_it', e.target.value); }} placeholder="es. Bibite" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome (EN)</label>
                <input type="text" value={categForm.nome_en} onChange={function(e) { setCategField('nome_en', e.target.value); }} placeholder="es. Drinks" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ordine</label>
                <input type="number" value={categForm.ordine} onChange={function(e) { setCategField('ordine', e.target.value); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={Boolean(categForm.attivo)} onChange={function(e) { setCategField('attivo', e.target.checked); }} className="w-4 h-4" />
                Attiva (mostrata ai clienti)
              </label>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
              <button type="button" onClick={function() { setShowCategModal(false); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
              <button type="button" onClick={saveCateg} disabled={savingCateg} className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium">{savingCateg ? 'Salvataggio...' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFERMA ELIMINAZIONE CATEGORIA */}
      {delCateg && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Elimina categoria</h2>
            <p className="text-sm text-gray-600 mb-6">Vuoi eliminare la categoria <strong>{delCateg.nome_it}</strong>? I prodotti che la usano resteranno senza categoria (finiranno in "Altro"). In alternativa puoi solo disattivarla.</p>
            <div className="flex gap-3">
              <button onClick={function() { setDelCateg(null); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
              <button onClick={deleteCateg} className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Elimina</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
