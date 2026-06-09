import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Testi dell'interfaccia nelle due lingue.
var T = {
  it: {
    title: 'Ordina dal tuo lettino',
    subtitle: 'Scegli i prodotti, indica dove ti trovi e invia. Te li portiamo noi.',
    room: 'Camera',
    selectRoom: 'Seleziona la camera',
    name: 'Nome',
    place: 'Dove ti trovi',
    pool: 'Piscina',
    lake: 'Biolago',
    notes: 'Note (allergie, preferenze...)',
    total: 'Totale',
    review: 'Rivedi e invia',
    summaryTitle: 'Riepilogo ordine',
    confirmSend: 'Conferma e invia',
    sending: 'Invio in corso...',
    edit: 'Modifica',
    okTitle: 'Ordine inviato!',
    okText: 'Lo staff ha ricevuto la tua richiesta. Arriviamo il prima possibile.',
    newOrder: 'Nuovo ordine',
    errRoom: 'Seleziona la camera e inserisci il nome.',
    errEmpty: 'Seleziona almeno un prodotto.',
    errGeneric: 'Si è verificato un errore. Riprova.',
    loading: 'Caricamento listino...',
    noItems: 'Al momento non ci sono prodotti disponibili.',
    other: 'Altro',
    yourData: 'I tuoi dati',
    items: 'Prodotti'
  },
  en: {
    title: 'Order from your sunbed',
    subtitle: 'Pick what you like, tell us where you are and send. We bring it to you.',
    room: 'Room',
    selectRoom: 'Select your room',
    name: 'Name',
    place: 'Where you are',
    pool: 'Pool',
    lake: 'Natural pond',
    notes: 'Notes (allergies, preferences...)',
    total: 'Total',
    review: 'Review and send',
    summaryTitle: 'Order summary',
    confirmSend: 'Confirm and send',
    sending: 'Sending...',
    edit: 'Edit',
    okTitle: 'Order sent!',
    okText: 'Our staff received your request. We will be there as soon as possible.',
    newOrder: 'New order',
    errRoom: 'Please select your room and enter your name.',
    errEmpty: 'Please select at least one item.',
    errGeneric: 'Something went wrong. Please try again.',
    loading: 'Loading menu...',
    noItems: 'There are no available items at the moment.',
    other: 'Other',
    yourData: 'Your details',
    items: 'Items'
  }
};

export default function OrdineBordoPubblico() {
  var [lang, setLang] = useState('it');
  var [voci, setVoci] = useState([]);
  var [categorie, setCategorie] = useState([]);
  var [camere, setCamere] = useState([]);
  var [loading, setLoading] = useState(true);

  var [quantita, setQuantita] = useState({}); // { listino_id: qta }
  var [camera, setCamera] = useState('');     // nome camera selezionata
  var [nome, setNome] = useState('');
  var [luogo, setLuogo] = useState('piscina');
  var [note, setNote] = useState('');

  var [aperte, setAperte] = useState({}); // { categoria: true }
  var [mostraRiepilogo, setMostraRiepilogo] = useState(false);

  var [sending, setSending] = useState(false);
  var [error, setError] = useState(null);
  var [sent, setSent] = useState(false);

  var t = T[lang];

  useEffect(function() {
    supabase
      .from('listino_bordo')
      .select('*')
      .eq('disponibile', true)
      .order('categoria', { ascending: true })
      .order('ordine', { ascending: true })
      .order('nome_it', { ascending: true })
      .then(function(result) {
        setLoading(false);
        if (!result.error) {
          setVoci(result.data || []);
        }
      });

    supabase
      .from('camere')
      .select('*')
      .eq('attivo', true)
      .order('ordine', { ascending: true })
      .order('nome', { ascending: true })
      .then(function(result) {
        if (!result.error) {
          setCamere(result.data || []);
        }
      });

    supabase
      .from('categorie_bordo')
      .select('*')
      .eq('attivo', true)
      .order('ordine', { ascending: true })
      .order('nome_it', { ascending: true })
      .then(function(result) {
        if (!result.error) {
          setCategorie(result.data || []);
        }
      });
  }, []);

  function nomeVoce(v) {
    if (lang === 'en') return v.nome_en || v.nome_it;
    return v.nome_it;
  }
  function descVoce(v) {
    if (lang === 'en') return v.descrizione_en || v.descrizione_it || '';
    return v.descrizione_it || '';
  }

  function setQta(id, delta) {
    setQuantita(function(prev) {
      var next = {};
      for (var k in prev) { next[k] = prev[k]; }
      var nuovo = (next[id] || 0) + delta;
      if (nuovo <= 0) {
        delete next[id];
      } else {
        next[id] = nuovo;
      }
      return next;
    });
  }

  function totale() {
    var tot = 0;
    voci.forEach(function(v) {
      var q = quantita[v.id] || 0;
      tot = tot + (Number(v.prezzo) * q);
    });
    return tot;
  }

  function vociSelezionate() {
    return voci.filter(function(v) { return (quantita[v.id] || 0) > 0; });
  }

  function righeSelezionate() {
    var righe = [];
    voci.forEach(function(v) {
      var q = quantita[v.id] || 0;
      if (q > 0) {
        righe.push({ listino_id: v.id, quantita: q });
      }
    });
    return righe;
  }

  function toggleCat(cat) {
    setAperte(function(prev) {
      var next = {};
      for (var k in prev) { next[k] = prev[k]; }
      next[cat] = !next[cat];
      return next;
    });
  }

  function articoliInCategoria(lista) {
    var n = 0;
    lista.forEach(function(v) { n = n + (quantita[v.id] || 0); });
    return n;
  }

  function vaiAlRiepilogo() {
    setError(null);
    if (!camera.trim() || !nome.trim()) {
      setError(t.errRoom);
      return;
    }
    if (righeSelezionate().length === 0) {
      setError(t.errEmpty);
      return;
    }
    setMostraRiepilogo(true);
    if (typeof window !== 'undefined') { window.scrollTo(0, 0); }
  }

  function confermaInvio() {
    setError(null);
    setSending(true);
    supabase.rpc('crea_ordine_bordo', {
      p_numero_camera: camera.trim(),
      p_nome_cliente: nome.trim(),
      p_luogo: luogo,
      p_note: note.trim(),
      p_righe: righeSelezionate()
    }).then(function(result) {
      setSending(false);
      if (result.error) {
        setError(t.errGeneric);
      } else {
        setSent(true);
      }
    });
  }

  function reset() {
    setQuantita({});
    setNote('');
    setAperte({});
    setMostraRiepilogo(false);
    setSent(false);
    setError(null);
  }

  // Raggruppa per categoria (via categoria_id), nell'ordine definito nella
  // tabella categorie; l'etichetta segue la lingua scelta. I prodotti senza
  // categoria finiscono nel gruppo "Altro", in fondo.
  var mappaGruppi = {};
  categorie.forEach(function(c) {
    mappaGruppi[c.id] = {
      key: c.id,
      label: (lang === 'en' ? (c.nome_en || c.nome_it) : c.nome_it),
      items: []
    };
  });
  voci.forEach(function(v) {
    var k = v.categoria_id;
    if (!k || !mappaGruppi[k]) k = '__altro__';
    if (!mappaGruppi[k]) {
      mappaGruppi[k] = { key: '__altro__', label: t.other, items: [] };
    }
    mappaGruppi[k].items.push(v);
  });
  var gruppi = [];
  categorie.forEach(function(c) {
    if (mappaGruppi[c.id] && mappaGruppi[c.id].items.length > 0) {
      gruppi.push(mappaGruppi[c.id]);
    }
  });
  if (mappaGruppi['__altro__'] && mappaGruppi['__altro__'].items.length > 0) {
    gruppi.push(mappaGruppi['__altro__']);
  }

  function luogoLabel() {
    return luogo === 'piscina' ? t.pool : t.lake;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-wine-50 to-white">
      <div className="max-w-xl mx-auto px-4 py-6 pb-40">

        {/* Intestazione + lingua */}
        <div className="flex items-start justify-between mb-2">
          <div className="text-wine-800 font-bold text-xl leading-tight">I Cacciagalli</div>
          <div className="flex gap-1">
            <button
              onClick={function() { setLang('it'); }}
              className={'px-3 py-1.5 rounded-lg text-sm font-medium ' + (lang === 'it' ? 'bg-wine-700 text-white' : 'bg-white border border-gray-300 text-gray-600')}
            >
              IT
            </button>
            <button
              onClick={function() { setLang('en'); }}
              className={'px-3 py-1.5 rounded-lg text-sm font-medium ' + (lang === 'en' ? 'bg-wine-700 text-white' : 'bg-white border border-gray-300 text-gray-600')}
            >
              EN
            </button>
          </div>
        </div>

        {sent ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center mt-8">
            <div className="text-5xl mb-4">🍹</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">{t.okTitle}</h1>
            <p className="text-gray-500 text-sm mb-6">{t.okText}</p>
            <button
              onClick={reset}
              className="bg-wine-700 hover:bg-wine-800 text-white px-6 py-3 rounded-xl text-sm font-medium"
            >
              {t.newOrder}
            </button>
          </div>
        ) : mostraRiepilogo ? (
          /* ---- RIEPILOGO ---- */
          <div className="mt-2">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">{t.summaryTitle}</h1>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t.yourData}</div>
              <div className="flex justify-between py-1 text-sm">
                <span className="text-gray-500">{t.room}</span>
                <span className="font-medium text-gray-900">{camera}</span>
              </div>
              <div className="flex justify-between py-1 text-sm">
                <span className="text-gray-500">{t.name}</span>
                <span className="font-medium text-gray-900">{nome}</span>
              </div>
              <div className="flex justify-between py-1 text-sm">
                <span className="text-gray-500">{t.place}</span>
                <span className="font-medium text-gray-900">{luogoLabel()}</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t.items}</div>
              <ul className="divide-y divide-gray-100">
                {vociSelezionate().map(function(v) {
                  var q = quantita[v.id] || 0;
                  return (
                    <li key={v.id} className="flex justify-between py-2 text-sm">
                      <span className="text-gray-800"><span className="font-medium">{q}×</span> {nomeVoce(v)}</span>
                      <span className="text-gray-500">€ {(Number(v.prezzo) * q).toFixed(2)}</span>
                    </li>
                  );
                })}
              </ul>
              {note.trim() ? (
                <div className="mt-3 p-2 bg-amber-50 border border-amber-100 rounded text-xs text-amber-800">{note}</div>
              ) : null}
            </div>

            <button
              onClick={function() { setMostraRiepilogo(false); }}
              className="text-sm text-wine-700 font-medium underline"
            >
              {t.edit}
            </button>
          </div>
        ) : (
          /* ---- LISTINO ---- */
          <>
            <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
            <p className="text-gray-500 text-sm mt-1 mb-5">{t.subtitle}</p>

            {/* Dati cliente */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t.room}</label>
                  <select
                    value={camera}
                    onChange={function(e) { setCamera(e.target.value); }}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base bg-white focus:outline-none focus:ring-2 focus:ring-wine-500"
                  >
                    <option value="">{t.selectRoom}</option>
                    {camere.map(function(c) {
                      return <option key={c.id} value={c.nome}>{c.nome}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t.name}</label>
                  <input
                    type="text"
                    value={nome}
                    onChange={function(e) { setNome(e.target.value); }}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.place}</label>
                <div className="flex gap-2">
                  <button
                    onClick={function() { setLuogo('piscina'); }}
                    className={'flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border ' + (luogo === 'piscina' ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300')}
                  >
                    🏊 {t.pool}
                  </button>
                  <button
                    onClick={function() { setLuogo('biolago'); }}
                    className={'flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border ' + (luogo === 'biolago' ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300')}
                  >
                    🌿 {t.lake}
                  </button>
                </div>
              </div>
            </div>

            {/* Listino a fisarmonica per categoria */}
            {loading ? (
              <div className="text-center py-12 text-gray-400">{t.loading}</div>
            ) : voci.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-400">{t.noItems}</div>
            ) : (
              <div className="space-y-3">
                {gruppi.map(function(g) {
                  var lista = g.items;
                  var aperta = !!aperte[g.key];
                  var nSel = articoliInCategoria(lista);
                  return (
                    <div key={g.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <button
                        onClick={function() { toggleCat(g.key); }}
                        className="w-full flex items-center justify-between px-4 py-3 text-left"
                      >
                        <span className="flex items-center gap-2 font-semibold text-gray-900">
                          <span className="text-gray-400">{aperta ? '▾' : '▸'}</span>
                          {g.label}
                        </span>
                        <span className="flex items-center gap-2">
                          {nSel > 0 && (
                            <span className="bg-wine-700 text-white text-xs font-medium rounded-full w-6 h-6 flex items-center justify-center">{nSel}</span>
                          )}
                          <span className="text-xs text-gray-400">{lista.length}</span>
                        </span>
                      </button>

                      {aperta && (
                        <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-3">
                          {lista.map(function(v) {
                            var q = quantita[v.id] || 0;
                            var desc = descVoce(v);
                            return (
                              <div key={v.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900">{nomeVoce(v)}</div>
                                  {desc ? <div className="text-xs text-gray-500 mt-0.5">{desc}</div> : null}
                                  <div className="text-sm text-wine-700 font-medium mt-1">€ {Number(v.prezzo).toFixed(2)}</div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {q > 0 && (
                                    <button
                                      onClick={function() { setQta(v.id, -1); }}
                                      className="w-9 h-9 rounded-full bg-gray-200 text-gray-700 text-lg font-medium flex items-center justify-center"
                                    >
                                      −
                                    </button>
                                  )}
                                  {q > 0 && <span className="w-6 text-center font-medium">{q}</span>}
                                  <button
                                    onClick={function() { setQta(v.id, 1); }}
                                    className="w-9 h-9 rounded-full bg-wine-700 text-white text-lg font-medium flex items-center justify-center"
                                  >
                                    +
                                  </button>
                                </div>
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

            {/* Note */}
            {voci.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mt-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.notes}</label>
                <textarea
                  value={note}
                  onChange={function(e) { setNote(e.target.value); }}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-wine-500"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Barra inferiore fissa */}
      {!sent && voci.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3">
          <div className="max-w-xl mx-auto">
            {error && (
              <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 text-center">{error}</div>
            )}
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-gray-500">{t.total}</div>
                <div className="text-xl font-bold text-gray-900">€ {totale().toFixed(2)}</div>
              </div>
              {mostraRiepilogo ? (
                <button
                  onClick={confermaInvio}
                  disabled={sending}
                  className="flex-1 max-w-[220px] bg-wine-700 hover:bg-wine-800 disabled:bg-gray-300 text-white px-6 py-3.5 rounded-xl text-base font-semibold"
                >
                  {sending ? t.sending : t.confirmSend}
                </button>
              ) : (
                <button
                  onClick={vaiAlRiepilogo}
                  disabled={righeSelezionate().length === 0}
                  className="flex-1 max-w-[220px] bg-wine-700 hover:bg-wine-800 disabled:bg-gray-300 text-white px-6 py-3.5 rounded-xl text-base font-semibold"
                >
                  {t.review}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
