import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

function emptyForm() {
  return {
    id: null,
    nome_it: '',
    nome_en: '',
    descrizione_it: '',
    descrizione_en: '',
    prezzo: '',
    categoria: '',
    disponibile: true,
    ordine: 0
  };
}

export default function ListinoBordoPage() {
  var [voci, setVoci] = useState([]);
  var [loading, setLoading] = useState(true);
  var [error, setError] = useState(null);

  var [showModal, setShowModal] = useState(false);
  var [form, setForm] = useState(emptyForm());
  var [saving, setSaving] = useState(false);
  var [modalError, setModalError] = useState(null);

  var [deleteTarget, setDeleteTarget] = useState(null);

  function loadVoci() {
    setLoading(true);
    setError(null);
    supabase
      .from('listino_bordo')
      .select('*')
      .order('categoria', { ascending: true })
      .order('ordine', { ascending: true })
      .order('nome_it', { ascending: true })
      .then(function(result) {
        setLoading(false);
        if (result.error) {
          setError('Errore caricamento listino: ' + result.error.message);
        } else {
          setVoci(result.data || []);
        }
      });
  }

  useEffect(function() {
    loadVoci();
  }, []);

  function setField(field, value) {
    setForm(function(prev) {
      var next = {};
      for (var k in prev) { next[k] = prev[k]; }
      next[field] = value;
      return next;
    });
  }

  function openNew() {
    setForm(emptyForm());
    setModalError(null);
    setShowModal(true);
  }

  function openEdit(voce) {
    setForm({
      id: voce.id,
      nome_it: voce.nome_it || '',
      nome_en: voce.nome_en || '',
      descrizione_it: voce.descrizione_it || '',
      descrizione_en: voce.descrizione_en || '',
      prezzo: voce.prezzo != null ? String(voce.prezzo) : '',
      categoria: voce.categoria || '',
      disponibile: voce.disponibile !== false,
      ordine: voce.ordine || 0
    });
    setModalError(null);
    setShowModal(true);
  }

  function handleSave() {
    setModalError(null);

    if (!form.nome_it.trim()) {
      setModalError('Il nome in italiano è obbligatorio.');
      return;
    }
    var prezzoNum = parseFloat(String(form.prezzo).replace(',', '.'));
    if (isNaN(prezzoNum) || prezzoNum < 0) {
      setModalError('Inserisci un prezzo valido.');
      return;
    }

    var payload = {
      nome_it: form.nome_it.trim(),
      nome_en: form.nome_en.trim() ? form.nome_en.trim() : null,
      descrizione_it: form.descrizione_it.trim() ? form.descrizione_it.trim() : null,
      descrizione_en: form.descrizione_en.trim() ? form.descrizione_en.trim() : null,
      prezzo: prezzoNum,
      categoria: form.categoria.trim() ? form.categoria.trim() : null,
      disponibile: Boolean(form.disponibile),
      ordine: parseInt(form.ordine, 10) || 0
    };

    setSaving(true);

    if (form.id) {
      supabase
        .from('listino_bordo')
        .update(payload)
        .eq('id', form.id)
        .then(function(result) {
          setSaving(false);
          if (result.error) {
            setModalError('Errore salvataggio: ' + result.error.message);
          } else {
            setShowModal(false);
            loadVoci();
          }
        });
    } else {
      supabase
        .from('listino_bordo')
        .insert(payload)
        .then(function(result) {
          setSaving(false);
          if (result.error) {
            setModalError('Errore salvataggio: ' + result.error.message);
          } else {
            setShowModal(false);
            loadVoci();
          }
        });
    }
  }

  function toggleDisponibile(voce) {
    supabase
      .from('listino_bordo')
      .update({ disponibile: !(voce.disponibile !== false) })
      .eq('id', voce.id)
      .then(function(result) {
        if (!result.error) {
          loadVoci();
        }
      });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    supabase
      .from('listino_bordo')
      .delete()
      .eq('id', deleteTarget.id)
      .then(function(result) {
        setDeleteTarget(null);
        if (!result.error) {
          loadVoci();
        } else {
          setError('Errore eliminazione: ' + result.error.message);
        }
      });
  }

  return (
    <div className="p-6">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Listino Bordo</h1>
          <p className="text-gray-500 mt-1 text-sm">Prodotti ordinabili da piscina e biolago</p>
        </div>
        <button
          onClick={openNew}
          className="bg-wine-700 hover:bg-wine-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Nuovo prodotto
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Caricamento...</div>
      ) : voci.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
          Nessun prodotto in listino. Aggiungi il primo!
        </div>
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
                    <td className="px-4 py-3 text-gray-600">{voce.categoria || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-900">€ {Number(voce.prezzo).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={function() { toggleDisponibile(voce); }}
                        className={
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' +
                          (disp ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600')
                        }
                      >
                        {disp ? 'Sì' : 'No'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={function() { openEdit(voce); }}
                          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                          Modifica
                        </button>
                        <button
                          onClick={function() { setDeleteTarget(voce); }}
                          className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50"
                        >
                          Elimina
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODALE PRODOTTO */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{form.id ? 'Modifica prodotto' : 'Nuovo prodotto'}</h2>
              <button onClick={function() { setShowModal(false); }} className="text-gray-400 hover:text-gray-600 text-xl font-light">x</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{modalError}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nome (IT) *</label>
                  <input
                    type="text"
                    value={form.nome_it}
                    onChange={function(e) { setField('nome_it', e.target.value); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nome (EN)</label>
                  <input
                    type="text"
                    value={form.nome_en}
                    onChange={function(e) { setField('nome_en', e.target.value); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Descrizione (IT)</label>
                  <textarea
                    value={form.descrizione_it}
                    onChange={function(e) { setField('descrizione_it', e.target.value); }}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Descrizione (EN)</label>
                  <textarea
                    value={form.descrizione_en}
                    onChange={function(e) { setField('descrizione_en', e.target.value); }}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Prezzo (€) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.prezzo}
                    onChange={function(e) { setField('prezzo', e.target.value); }}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Categoria</label>
                  <input
                    type="text"
                    value={form.categoria}
                    onChange={function(e) { setField('categoria', e.target.value); }}
                    placeholder="es. Bibite"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ordine</label>
                  <input
                    type="number"
                    value={form.ordine}
                    onChange={function(e) { setField('ordine', e.target.value); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.disponibile)}
                  onChange={function(e) { setField('disponibile', e.target.checked); }}
                  className="w-4 h-4"
                />
                Disponibile (visibile ai clienti)
              </label>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
              <button
                type="button"
                onClick={function() { setShowModal(false); }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {saving ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFERMA ELIMINAZIONE */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Elimina prodotto</h2>
            <p className="text-sm text-gray-600 mb-6">
              Vuoi eliminare <strong>{deleteTarget.nome_it}</strong> dal listino? Gli ordini già registrati non vengono toccati.
            </p>
            <div className="flex gap-3">
              <button onClick={function() { setDeleteTarget(null); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Elimina</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
