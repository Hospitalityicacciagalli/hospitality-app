import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, PencilLine, ChevronDown, ChevronUp, ToggleLeft, ToggleRight } from 'lucide-react'

// ── MODALE CONFERMA ELIMINAZIONE ─────────────────────────────
function ModaleConferma(props) {
  var testo = props.testo
  var onConferma = props.onConferma
  var onAnnulla = props.onAnnulla

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <p className="text-gray-800 text-sm mb-6">{testo}</p>
        <div className="flex gap-3">
          <button
            onClick={onAnnulla}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Annulla
          </button>
          <button
            onClick={onConferma}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
          >
            Elimina
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MODALE NUOVA SALA ─────────────────────────────────────────
function ModaleSala(props) {
  var onSave = props.onSave
  var onClose = props.onClose
  var salaEsistente = props.sala || null
  var isModifica = salaEsistente !== null

  var [nome, setNome] = useState(isModifica ? salaEsistente.nome : '')
  var [prefisso, setPrefisso] = useState(isModifica ? (salaEsistente.prefisso_tavolo || '') : '')
  var [numInizio, setNumInizio] = useState(isModifica ? String(salaEsistente.numero_iniziale || 10) : '10')
  var [ordine, setOrdine] = useState(isModifica ? String(salaEsistente.ordine || 1) : '1')
  var [errore, setErrore] = useState('')
  var [saving, setSaving] = useState(false)

  function handleSave() {
    if (!nome.trim()) { setErrore('Inserisci il nome della sala.'); return }
    if (!prefisso.trim()) { setErrore('Inserisci il prefisso (es. P, S, W).'); return }
    setErrore('')
    setSaving(true)

    var payload = {
      nome: nome.trim(),
      prefisso_tavolo: prefisso.trim().toUpperCase(),
      numero_iniziale: parseInt(numInizio, 10) || 10,
      ordine: parseInt(ordine, 10) || 1,
      attiva: true
    }

    var query = isModifica
      ? supabase.from('sale').update(payload).eq('id', salaEsistente.id).select()
      : supabase.from('sale').insert([payload]).select()

    query.then(function(result) {
      setSaving(false)
      if (result.error) { setErrore('Errore: ' + result.error.message); return }
      if (result.data && result.data.length > 0) { onSave(result.data[0], isModifica) }
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{isModifica ? 'Modifica Sala' : 'Nuova Sala'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome sala *</label>
            <input
              type="text"
              placeholder="es. Pergola, Wine Bar, Terrazza..."
              value={nome}
              onChange={function(e) { setNome(e.target.value) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prefisso tavoli *</label>
            <input
              type="text"
              placeholder="es. P, S, W, T..."
              value={prefisso}
              onChange={function(e) { setPrefisso(e.target.value) }}
              maxLength={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
            />
            <p className="text-xs text-gray-400 mt-1">Lettera o lettere che precedono il numero del tavolo (es. P → P10, P11...)</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Numero primo tavolo</label>
              <input
                type="number"
                min="1"
                value={numInizio}
                onChange={function(e) { setNumInizio(e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
              />
              <p className="text-xs text-gray-400 mt-1">es. 10 → primo tavolo sarà {prefisso || 'X'}{numInizio || '10'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ordine visualizzazione</label>
              <input
                type="number"
                min="1"
                value={ordine}
                onChange={function(e) { setOrdine(e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
              />
            </div>
          </div>
          {errore && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{errore}</div>
          )}
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={"flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors " + (saving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-wine-700 text-white hover:bg-wine-800')}
          >
            {saving ? 'Salvataggio...' : (isModifica ? 'Aggiorna' : 'Crea Sala')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MODALE NUOVO TAVOLO ───────────────────────────────────────
function ModaleTavolo(props) {
  var onSave = props.onSave
  var onClose = props.onClose
  var salaId = props.salaId
  var prefisso = props.prefisso || ''

  var [nome, setNome] = useState(prefisso)
  var [errore, setErrore] = useState('')
  var [saving, setSaving] = useState(false)

  function handleSave() {
    var nomePulito = nome.trim().toUpperCase()
    if (!nomePulito) { setErrore('Inserisci il nome del tavolo.'); return }
    setErrore('')
    setSaving(true)

    supabase
      .from('tavoli_sala')
      .insert([{ sala_id: salaId, nome: nomePulito, attivo: true }])
      .select()
      .then(function(result) {
        setSaving(false)
        if (result.error) { setErrore('Errore: ' + result.error.message); return }
        if (result.data && result.data.length > 0) { onSave(result.data[0]) }
      })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Nuovo Tavolo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome tavolo *</label>
            <input
              type="text"
              placeholder={"es. " + prefisso + "10"}
              value={nome}
              onChange={function(e) { setNome(e.target.value.toUpperCase()) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500"
              autoFocus
            />
          </div>
          {errore && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{errore}</div>
          )}
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={"flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors " + (saving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-wine-700 text-white hover:bg-wine-800')}
          >
            {saving ? 'Salvataggio...' : 'Aggiungi Tavolo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── GRIGLIA TAVOLI DI UNA SALA ────────────────────────────────
function GrigliaTavoli(props) {
  var sala = props.sala
  var tavoli = props.tavoli
  var onToggleAttivo = props.onToggleAttivo
  var onElimina = props.onElimina
  var onAggiungi = props.onAggiungi

  // Raggruppa per decina (colonna)
  function getDecina(nome) {
    var num = parseInt(nome.replace(/[^0-9]/g, ''), 10)
    if (isNaN(num)) return 0
    return Math.floor(num / 10) * 10
  }

  var colonneMap = {}
  tavoli.forEach(function(t) {
    var dec = getDecina(t.nome)
    if (!colonneMap[dec]) colonneMap[dec] = []
    colonneMap[dec].push(t)
  })

  var colonneKeys = Object.keys(colonneMap).map(Number).sort(function(a, b) { return a - b })

  return (
    <div>
      {tavoli.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          Nessun tavolo. Aggiungine uno con il pulsante +.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex gap-3 min-w-max pb-2">
            {colonneKeys.map(function(dec) {
              var col = colonneMap[dec]
              col.sort(function(a, b) {
                var na = parseInt(a.nome.replace(/[^0-9]/g, ''), 10)
                var nb = parseInt(b.nome.replace(/[^0-9]/g, ''), 10)
                return na - nb
              })
              return (
                <div key={dec} className="flex flex-col gap-2">
                  {col.map(function(t) {
                    return (
                      <div
                        key={t.id}
                        className={"flex items-center gap-2 rounded-lg border px-3 py-2 " + (t.attivo ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-50')}
                      >
                        <span className={"text-sm font-mono font-medium " + (t.attivo ? 'text-gray-800' : 'text-gray-400')}>
                          {t.nome}
                        </span>
                        <button
                          onClick={function() { onToggleAttivo(t) }}
                          className={"transition-colors " + (t.attivo ? 'text-green-500 hover:text-gray-400' : 'text-gray-300 hover:text-green-500')}
                          title={t.attivo ? 'Disattiva' : 'Attiva'}
                        >
                          {t.attivo
                            ? <ToggleRight size={18} />
                            : <ToggleLeft size={18} />
                          }
                        </button>
                        <button
                          onClick={function() { onElimina(t) }}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          title="Elimina"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}
      <button
        onClick={onAggiungi}
        className="mt-4 flex items-center gap-2 text-sm text-wine-700 hover:text-wine-900 font-medium"
      >
        <Plus size={16} />
        Aggiungi tavolo
      </button>
    </div>
  )
}

// ── PAGINA PRINCIPALE ─────────────────────────────────────────
export default function GestioneSalePage() {
  var [sale, setSale] = useState([])
  var [tavoliPerSala, setTavoliPerSala] = useState({})
  var [loading, setLoading] = useState(true)
  var [saleAperte, setSaleAperte] = useState({})

  var [showModaleSala, setShowModaleSala] = useState(false)
  var [salaInModifica, setSalaInModifica] = useState(null)

  var [showModaleTavolo, setShowModaleTavolo] = useState(false)
  var [salaPerNuovoTavolo, setSalaPerNuovoTavolo] = useState(null)

  var [confermaElimina, setConfermaElimina] = useState(null) // { tipo: 'sala'|'tavolo', item: ... }

  useEffect(function() {
    loadTutto()
  }, [])

  function loadTutto() {
    setLoading(true)
    supabase
      .from('sale')
      .select('*')
      .order('ordine', { ascending: true })
      .then(function(result) {
        if (result.error || !result.data) { setLoading(false); return }
        var saleData = result.data
        setSale(saleData)

        // Apri la prima sala di default
        if (saleData.length > 0) {
          var aperte = {}
          aperte[saleData[0].id] = true
          setSaleAperte(aperte)
        }

        return supabase
          .from('tavoli_sala')
          .select('*')
          .order('nome', { ascending: true })
      })
      .then(function(result) {
        setLoading(false)
        if (!result || result.error || !result.data) return
        var mappa = {}
        result.data.forEach(function(t) {
          if (!mappa[t.sala_id]) mappa[t.sala_id] = []
          mappa[t.sala_id].push(t)
        })
        setTavoliPerSala(mappa)
      })
  }

  function toggleSala(salaId) {
    setSaleAperte(function(prev) {
      var next = Object.assign({}, prev)
      next[salaId] = !prev[salaId]
      return next
    })
  }

  function toggleAttivaSala(sala) {
    supabase
      .from('sale')
      .update({ attiva: !sala.attiva })
      .eq('id', sala.id)
      .then(function(result) {
        if (!result.error) {
          setSale(function(prev) {
            return prev.map(function(s) { return s.id === sala.id ? Object.assign({}, s, { attiva: !s.attiva }) : s })
          })
        }
      })
  }

  function handleSaveSala(salaSalvata, isModifica) {
    if (isModifica) {
      setSale(function(prev) {
        return prev.map(function(s) { return s.id === salaSalvata.id ? salaSalvata : s })
      })
    } else {
      setSale(function(prev) { return prev.concat([salaSalvata]) })
      setTavoliPerSala(function(prev) {
        var next = Object.assign({}, prev)
        next[salaSalvata.id] = []
        return next
      })
      setSaleAperte(function(prev) {
        var next = Object.assign({}, prev)
        next[salaSalvata.id] = true
        return next
      })
    }
    setShowModaleSala(false)
    setSalaInModifica(null)
  }

  function handleEliminaSala(sala) {
    setConfermaElimina({ tipo: 'sala', item: sala })
  }

  function eseguiEliminaSala() {
    var sala = confermaElimina.item
    supabase
      .from('sale')
      .delete()
      .eq('id', sala.id)
      .then(function(result) {
        setConfermaElimina(null)
        if (!result.error) {
          setSale(function(prev) { return prev.filter(function(s) { return s.id !== sala.id }) })
          setTavoliPerSala(function(prev) {
            var next = Object.assign({}, prev)
            delete next[sala.id]
            return next
          })
        } else {
          alert('Errore eliminazione: ' + result.error.message)
        }
      })
  }

  function handleSaveTavolo(tavolo) {
    setTavoliPerSala(function(prev) {
      var next = Object.assign({}, prev)
      var lista = (next[tavolo.sala_id] || []).concat([tavolo])
      next[tavolo.sala_id] = lista
      return next
    })
    setShowModaleTavolo(false)
    setSalaPerNuovoTavolo(null)
  }

  function handleToggleAttivoTavolo(tavolo) {
    supabase
      .from('tavoli_sala')
      .update({ attivo: !tavolo.attivo })
      .eq('id', tavolo.id)
      .then(function(result) {
        if (!result.error) {
          setTavoliPerSala(function(prev) {
            var next = Object.assign({}, prev)
            next[tavolo.sala_id] = (next[tavolo.sala_id] || []).map(function(t) {
              return t.id === tavolo.id ? Object.assign({}, t, { attivo: !t.attivo }) : t
            })
            return next
          })
        }
      })
  }

  function handleEliminaTavolo(tavolo) {
    setConfermaElimina({ tipo: 'tavolo', item: tavolo })
  }

  function eseguiEliminaTavolo() {
    var tavolo = confermaElimina.item
    supabase
      .from('tavoli_sala')
      .delete()
      .eq('id', tavolo.id)
      .then(function(result) {
        setConfermaElimina(null)
        if (!result.error) {
          setTavoliPerSala(function(prev) {
            var next = Object.assign({}, prev)
            next[tavolo.sala_id] = (next[tavolo.sala_id] || []).filter(function(t) { return t.id !== tavolo.id })
            return next
          })
        } else {
          alert('Errore eliminazione: ' + result.error.message)
        }
      })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Caricamento...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestione Sale e Tavoli</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configura sale e tavoli disponibili per il servizio</p>
        </div>
        <button
          onClick={function() { setSalaInModifica(null); setShowModaleSala(true) }}
          className="inline-flex items-center gap-2 bg-wine-700 text-white px-4 py-2.5 rounded-xl hover:bg-wine-800 transition-colors font-medium shadow-sm text-sm"
        >
          <Plus size={16} />
          Nuova Sala
        </button>
      </div>

      {sale.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">Nessuna sala configurata. Creane una con il pulsante in alto.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sale.map(function(sala) {
            var aperta = !!saleAperte[sala.id]
            var tavoli = tavoliPerSala[sala.id] || []
            var tavoliAttivi = tavoli.filter(function(t) { return t.attivo }).length

            return (
              <div
                key={sala.id}
                className={"bg-white rounded-xl border shadow-sm " + (sala.attiva ? 'border-gray-200' : 'border-gray-100 opacity-60')}
              >
                {/* Header sala */}
                <div className="flex items-center justify-between p-4">
                  <button
                    onClick={function() { toggleSala(sala.id) }}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <span className="font-semibold text-gray-900">{sala.nome}</span>
                    {sala.prefisso_tavolo && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-gray-100 text-gray-600">
                        {sala.prefisso_tavolo}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {tavoliAttivi} tavoli attivi
                    </span>
                    {!sala.attiva && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">Disattiva</span>
                    )}
                    {aperta ? <ChevronUp size={16} className="text-gray-400 ml-auto" /> : <ChevronDown size={16} className="text-gray-400 ml-auto" />}
                  </button>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={function() { toggleAttivaSala(sala) }}
                      className={"transition-colors " + (sala.attiva ? 'text-green-500 hover:text-gray-400' : 'text-gray-300 hover:text-green-500')}
                      title={sala.attiva ? 'Disattiva sala' : 'Attiva sala'}
                    >
                      {sala.attiva ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>
                    <button
                      onClick={function() { setSalaInModifica(sala); setShowModaleSala(true) }}
                      className="text-gray-400 hover:text-wine-700 transition-colors"
                      title="Modifica sala"
                    >
                      <PencilLine size={16} />
                    </button>
                    <button
                      onClick={function() { handleEliminaSala(sala) }}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      title="Elimina sala"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Griglia tavoli (collassabile) */}
                {aperta && (
                  <div className="border-t border-gray-100 p-4">
                    <GrigliaTavoli
                      sala={sala}
                      tavoli={tavoli}
                      onToggleAttivo={handleToggleAttivoTavolo}
                      onElimina={handleEliminaTavolo}
                      onAggiungi={function() { setSalaPerNuovoTavolo(sala); setShowModaleTavolo(true) }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modali */}
      {showModaleSala && (
        <ModaleSala
          sala={salaInModifica}
          onSave={handleSaveSala}
          onClose={function() { setShowModaleSala(false); setSalaInModifica(null) }}
        />
      )}

      {showModaleTavolo && salaPerNuovoTavolo && (
        <ModaleTavolo
          salaId={salaPerNuovoTavolo.id}
          prefisso={salaPerNuovoTavolo.prefisso_tavolo || ''}
          onSave={handleSaveTavolo}
          onClose={function() { setShowModaleTavolo(false); setSalaPerNuovoTavolo(null) }}
        />
      )}

      {confermaElimina && (
        <ModaleConferma
          testo={
            confermaElimina.tipo === 'sala'
              ? 'Eliminare la sala "' + confermaElimina.item.nome + '" e tutti i suoi tavoli? Questa azione non è reversibile.'
              : 'Eliminare il tavolo "' + confermaElimina.item.nome + '"? Questa azione non è reversibile.'
          }
          onConferma={confermaElimina.tipo === 'sala' ? eseguiEliminaSala : eseguiEliminaTavolo}
          onAnnulla={function() { setConfermaElimina(null) }}
        />
      )}

    </div>
  )
}
