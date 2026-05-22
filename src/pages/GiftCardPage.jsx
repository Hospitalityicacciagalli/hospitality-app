import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Search, X, Check, Gift, PencilLine, Trash2, ChevronDown, ChevronUp, AlertTriangle, Hotel, Wine, ChefHat, UtensilsCrossed } from 'lucide-react'

// ── UTILITY ──────────────────────────────────────────────────
function formatData(dateStr) {
  if (!dateStr) return '—'
  var parts = String(dateStr).split('T')[0].split('-')
  if (parts.length !== 3) return dateStr
  return parts[2] + '/' + parts[1] + '/' + parts[0]
}

function isScaduta(scadenza) {
  if (!scadenza) return false
  return new Date(scadenza) < new Date()
}

function badgeStato(gc) {
  if (gc.usata) return { label: 'Utilizzata', cls: 'bg-gray-100 text-gray-600' }
  if (isScaduta(gc.scadenza)) return { label: 'Scaduta', cls: 'bg-red-100 text-red-700' }
  return { label: 'Valida', cls: 'bg-green-100 text-green-700' }
}

function badgeLingua(lingua) {
  if (!lingua || lingua === 'ITA') return null
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">🇬🇧 ENG</span>
}

function aggiungiMesi(dateStr, mesi) {
  if (!dateStr) return ''
  var d = new Date(dateStr)
  d.setMonth(d.getMonth() + mesi)
  return d.toISOString().split('T')[0]
}

function aggiungiGiorni(dateStr, giorni) {
  if (!dateStr) return ''
  var d = new Date(dateStr)
  d.setDate(d.getDate() + giorni)
  return d.toISOString().split('T')[0]
}

// ── MODALE CONFERMA ───────────────────────────────────────────
function ModaleConferma(props) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <p className="text-gray-800 text-sm mb-6">{props.testo}</p>
        <div className="flex gap-3">
          <button onClick={props.onAnnulla} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Annulla</button>
          <button onClick={props.onConferma} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Elimina</button>
        </div>
      </div>
    </div>
  )
}

// ── MODALE GIFT CARD ──────────────────────────────────────────
function ModaleGiftCard(props) {
  var onSave = props.onSave
  var onClose = props.onClose
  var tipologie = props.tipologie
  var gcEsistente = props.gc || null
  var isModifica = gcEsistente !== null
  var oggi = new Date().toISOString().split('T')[0]

  var [form, setForm] = useState({
    tipologia_id: isModifica ? (gcEsistente.tipologia_id || '') : '',
    codice: isModifica ? (gcEsistente.codice || '') : '',
    codici_collegati: isModifica ? (gcEsistente.codici_collegati || []).join(', ') : '',
    committente_nome: isModifica ? (gcEsistente.committente_nome || '') : '',
    committente_contatto: isModifica ? (gcEsistente.committente_contatto || '') : '',
    beneficiario_nome: isModifica ? (gcEsistente.beneficiario_nome || '') : '',
    messaggio: isModifica ? (gcEsistente.messaggio || '') : '',
    data_acquisto: isModifica ? (gcEsistente.data_acquisto || '') : oggi,
    scadenza: isModifica ? (gcEsistente.scadenza || '') : aggiungiMesi(oggi, 6),
    data_utilizzo: isModifica ? (gcEsistente.data_utilizzo || '') : '',
    numero_scontrino: isModifica ? (gcEsistente.numero_scontrino || '') : '',
    prezzo_pagato: isModifica ? String(gcEsistente.prezzo_pagato || '') : '',
    numero_persone: isModifica ? String(gcEsistente.numero_persone || '1') : '1',
    lingua: isModifica ? (gcEsistente.lingua || 'ITA') : 'ITA',
    note: isModifica ? (gcEsistente.note || '') : ''
  })
  var [saving, setSaving] = useState(false)
  var [errore, setErrore] = useState('')

  function handleTipologiaChange(tipologiaId) {
    setForm(function(prev) {
      var next = Object.assign({}, prev)
      next.tipologia_id = tipologiaId
      if (!isModifica && tipologiaId) {
        var tip = tipologie.find(function(t) { return t.id === tipologiaId })
        if (tip) {
          next.prezzo_pagato = String(tip.prezzo)
          next.numero_persone = String(tip.persone_min)
        }
      }
      return next
    })
  }

  function handleChange(campo, valore) {
    setForm(function(prev) {
      var next = Object.assign({}, prev)
      next[campo] = valore
      if (campo === 'data_acquisto' && valore) {
        next.scadenza = aggiungiMesi(valore, 6)
      }
      return next
    })
  }

  function handleSave() {
    if (!form.codice.trim()) { setErrore('Il codice è obbligatorio.'); return }
    if (!form.tipologia_id) { setErrore('Seleziona una tipologia.'); return }
    setErrore('')
    setSaving(true)
    var codiciCollegatiArr = form.codici_collegati.trim()
      ? form.codici_collegati.split(',').map(function(c) { return c.trim() }).filter(function(c) { return c.length > 0 })
      : []
    var payload = {
      tipologia_id: form.tipologia_id,
      codice: form.codice.trim().toUpperCase(),
      codici_collegati: codiciCollegatiArr,
      committente_nome: form.committente_nome.trim() || null,
      committente_contatto: form.committente_contatto.trim() || null,
      beneficiario_nome: form.beneficiario_nome.trim() || null,
      messaggio: form.messaggio.trim() || null,
      data_acquisto: form.data_acquisto || null,
      scadenza: form.scadenza || null,
      data_utilizzo: form.data_utilizzo || null,
      numero_scontrino: form.numero_scontrino.trim() || null,
      prezzo_pagato: parseFloat(form.prezzo_pagato) || null,
      numero_persone: parseInt(form.numero_persone, 10) || 1,
      lingua: form.lingua,
      note: form.note.trim() || null
    }
    var query = isModifica
      ? supabase.from('gift_card').update(payload).eq('id', gcEsistente.id).select()
      : supabase.from('gift_card').insert([payload]).select()
    query.then(function(result) {
      setSaving(false)
      if (result.error) {
        if (result.error.code === '23505') { setErrore('Esiste già una gift card con questo codice.') }
        else { setErrore('Errore: ' + result.error.message) }
        return
      }
      if (result.data && result.data.length > 0) onSave(result.data[0], isModifica)
    })
  }

  var tipologiaSelezionata = tipologie.find(function(t) { return t.id === form.tipologia_id })

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[92vh]">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900">{isModifica ? 'Modifica Gift Card' : 'Nuova Gift Card'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={22} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipologia *</label>
            <select value={form.tipologia_id} onChange={function(e) { handleTipologiaChange(e.target.value) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white">
              <option value="">Seleziona tipologia...</option>
              {tipologie.map(function(t) {
                return <option key={t.id} value={t.id}>{t.nome}{!t.attiva ? ' (legacy)' : ''}</option>
              })}
            </select>
            {tipologiaSelezionata && (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="px-2 py-0.5 bg-wine-50 text-wine-700 rounded text-xs">€{tipologiaSelezionata.prezzo}{tipologiaSelezionata.prezzo_per_persona ? '/p' : ' coppia'}</span>
                {tipologiaSelezionata.pernottamento && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{tipologiaSelezionata.notti} notte/i</span>}
                {tipologiaSelezionata.wine_tour && <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">Wine Tour</span>}
                {tipologiaSelezionata.cooking_class && <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded text-xs">Cooking Class</span>}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Codice *</label>
              <input type="text" value={form.codice} onChange={function(e) { handleChange('codice', e.target.value.toUpperCase()) }}
                placeholder="es. FB40-855A" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Codici collegati</label>
              <input type="text" value={form.codici_collegati} onChange={function(e) { handleChange('codici_collegati', e.target.value.toUpperCase()) }}
                placeholder="es. AB12-CD34, EF56-GH78" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Committente</label>
              <input type="text" value={form.committente_nome} onChange={function(e) { handleChange('committente_nome', e.target.value) }}
                placeholder="Nome e cognome" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contatto</label>
              <input type="text" value={form.committente_contatto} onChange={function(e) { handleChange('committente_contatto', e.target.value) }}
                placeholder="Telefono o email" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beneficiario</label>
            <input type="text" value={form.beneficiario_nome} onChange={function(e) { handleChange('beneficiario_nome', e.target.value) }}
              placeholder="Nome e cognome" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Messaggio</label>
            <textarea rows={2} value={form.messaggio} onChange={function(e) { handleChange('messaggio', e.target.value) }}
              placeholder="Messaggio personalizzato..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data acquisto</label>
              <input type="date" value={form.data_acquisto} onChange={function(e) { handleChange('data_acquisto', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scadenza</label>
              <input type="date" value={form.scadenza} onChange={function(e) { handleChange('scadenza', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">N° scontrino</label>
              <input type="text" value={form.numero_scontrino} onChange={function(e) { handleChange('numero_scontrino', e.target.value) }}
                placeholder="es. 1856-0002" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prezzo €</label>
              <input type="number" step="0.01" min="0" value={form.prezzo_pagato} onChange={function(e) { handleChange('prezzo_pagato', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
          </div>
          <div>
            <label className={"block text-sm font-medium mb-1 " + (form.data_utilizzo ? 'text-gray-500' : 'text-gray-700')}>
              Data utilizzo {form.data_utilizzo ? '✓' : '(vuoto = non ancora utilizzata)'}
            </label>
            <input type="date" value={form.data_utilizzo} onChange={function(e) { handleChange('data_utilizzo', e.target.value) }}
              className={"w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 " + (form.data_utilizzo ? 'border-green-300 bg-green-50' : 'border-gray-300')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">N° persone</label>
              <input type="number" min="1" max="20" value={form.numero_persone} onChange={function(e) { handleChange('numero_persone', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lingua servizio</label>
              <select value={form.lingua} onChange={function(e) { handleChange('lingua', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white">
                <option value="ITA">🇮🇹 Italiano</option>
                <option value="ENG">🇬🇧 English</option>
                <option value="ENTRAMBE">🇮🇹/🇬🇧 Entrambe</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note interne</label>
            <textarea rows={2} value={form.note} onChange={function(e) { handleChange('note', e.target.value) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 resize-none" />
          </div>
          {errore && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{errore}</div>}
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Annulla</button>
          <button onClick={handleSave} disabled={saving}
            className={"flex-1 py-3 rounded-xl text-sm font-medium transition-colors " + (saving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-wine-700 text-white hover:bg-wine-800')}>
            {saving ? 'Salvataggio...' : (isModifica ? 'Aggiorna' : 'Salva Gift Card')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PANNELLO RIEPILOGO SERVIZI ────────────────────────────────
function PannelloServizi(props) {
  var gc = props.gc
  var tipologia = props.tipologia
  var onClose = props.onClose
  var onAggiorna = props.onAggiorna

  // Calcolo data di riferimento (check-in o oggi)
  var dataRiferimento = gc.pernottamento_data_inizio || new Date().toISOString().split('T')[0]

  var [formPernottamento, setFormPernottamento] = useState({
    pernottamento_data_inizio: gc.pernottamento_data_inizio || '',
    pernottamento_data_fine: gc.pernottamento_data_fine || '',
    pernottamento_camera: gc.pernottamento_camera || '',
    pernottamento_note: gc.pernottamento_note || ''
  })
  var [savingPernottamento, setSavingPernottamento] = useState(false)
  var [pernottamentoAperto, setPernottamentoAperto] = useState(!gc.pernottamento_data_inizio)

  var [prenotazioniWT, setPrenotazioniWT] = useState([])
  var [prenotazioniCC, setPrenotazioniCC] = useState([])
  var [pastiCollegati, setPastiCollegati] = useState([])
  var [loading, setLoading] = useState(true)

  // Form wine tour
  var [showFormWT, setShowFormWT] = useState(false)
  var [formWT, setFormWT] = useState({ data: dataRiferimento, orario: '18:00', lingua: gc.lingua || 'ITA', num_persone: String(gc.numero_persone || 2), note: '' })
  var [wtInModifica, setWtInModifica] = useState(null)
  var [savingWT, setSavingWT] = useState(false)

  // Form cooking class
  var [showFormCC, setShowFormCC] = useState(false)
  var [formCC, setFormCC] = useState({ data: dataRiferimento, orario: '15:00', lingua: gc.lingua || 'ITA', num_persone: String(gc.numero_persone || 2), note: '' })
  var [ccInModifica, setCcInModifica] = useState(null)
  var [savingCC, setSavingCC] = useState(false)

  // Form pasto
  var [showFormPasto, setShowFormPasto] = useState(false)
  var [pastoInModifica, setPastoInModifica] = useState(null)
  var [formPasto, setFormPasto] = useState({ data: dataRiferimento, turno: 'dinner', adulti: String(gc.numero_persone || 2), bambini: '0', note: '', tipo: 'degustazione' })
  var [savingPasto, setSavingPasto] = useState(false)

  useEffect(function() { loadDatiServizi() }, [])

  function loadDatiServizi() {
    setLoading(true)
    Promise.all([
      supabase.from('wine_tour_prenotazioni').select('*, wine_tour_sessioni(id, data, orario, lingua)').eq('gift_card_id', gc.id),
      supabase.from('cooking_class_prenotazioni').select('*, cooking_class_sessioni(id, data, orario, lingua)').eq('gift_card_id', gc.id),
      supabase.from('reservations').select('id, reservation_date, meal_type, guests_count, adults_count, children_count, notes').eq('gift_card_id', gc.id)
    ]).then(function(results) {
      setLoading(false)
      if (!results[0].error) setPrenotazioniWT(results[0].data || [])
      if (!results[1].error) setPrenotazioniCC(results[1].data || [])
      if (!results[2].error) setPastiCollegati(results[2].data || [])
    })
  }

  // Aggiorna date di riferimento quando cambia check-in
  function handleCheckInChange(val) {
    setFormPernottamento(function(p) {
      var next = Object.assign({}, p)
      next.pernottamento_data_inizio = val
      if (val && tipologia && tipologia.notti) {
        next.pernottamento_data_fine = aggiungiGiorni(val, tipologia.notti)
      }
      return next
    })
    // Aggiorna date suggerite per gli altri servizi
    if (val) {
      setFormWT(function(p) { return Object.assign({}, p, { data: val }) })
      setFormCC(function(p) { return Object.assign({}, p, { data: val }) })
      setFormPasto(function(p) { return Object.assign({}, p, { data: aggiungiGiorni(val, 1) }) })
    }
  }

  function salvaPernottamento() {
    setSavingPernottamento(true)
    supabase.from('gift_card').update({
      pernottamento_data_inizio: formPernottamento.pernottamento_data_inizio || null,
      pernottamento_data_fine: formPernottamento.pernottamento_data_fine || null,
      pernottamento_camera: formPernottamento.pernottamento_camera || null,
      pernottamento_note: formPernottamento.pernottamento_note || null
    }).eq('id', gc.id).select().then(function(result) {
      setSavingPernottamento(false)
      if (!result.error && result.data && result.data.length > 0) {
        onAggiorna(result.data[0])
        setPernottamentoAperto(false)
        // Aggiorna date di riferimento
        var nuovaDataInizio = formPernottamento.pernottamento_data_inizio
        if (nuovaDataInizio) {
          setFormWT(function(p) { return Object.assign({}, p, { data: nuovaDataInizio }) })
          setFormCC(function(p) { return Object.assign({}, p, { data: nuovaDataInizio }) })
          setFormPasto(function(p) { return Object.assign({}, p, { data: aggiungiGiorni(nuovaDataInizio, 1) }) })
        }
      }
    })
  }

  // ── WINE TOUR ──────────────────────────────────────────────
  function salvaWT() {
    if (!formWT.data) { alert('Inserisci la data del wine tour.'); return }
    setSavingWT(true)
    if (wtInModifica) {
      // Modifica sessione esistente
      supabase.from('wine_tour_sessioni').update({
        data: formWT.data, orario: formWT.orario, lingua: formWT.lingua
      }).eq('id', wtInModifica.wine_tour_sessioni.id).then(function() {
        return supabase.from('wine_tour_prenotazioni').update({
          num_persone: parseInt(formWT.num_persone) || 2,
          lingua: formWT.lingua,
          note: formWT.note || null
        }).eq('id', wtInModifica.id).select('*, wine_tour_sessioni(id, data, orario, lingua)')
      }).then(function(result) {
        setSavingWT(false)
        if (result && !result.error && result.data) {
          setPrenotazioniWT(function(prev) { return prev.map(function(p) { return p.id === wtInModifica.id ? result.data[0] : p }) })
          setShowFormWT(false); setWtInModifica(null)
        }
      })
    } else {
      // Nuova sessione
      supabase.from('wine_tour_sessioni').insert([{ data: formWT.data, orario: formWT.orario, lingua: formWT.lingua }]).select()
        .then(function(result) {
          if (result.error || !result.data || !result.data.length) { setSavingWT(false); alert('Errore.'); return }
          return supabase.from('wine_tour_prenotazioni').insert([{
            sessione_id: result.data[0].id, gift_card_id: gc.id,
            num_persone: parseInt(formWT.num_persone) || 2, lingua: formWT.lingua, note: formWT.note || null
          }]).select('*, wine_tour_sessioni(id, data, orario, lingua)')
        })
        .then(function(result) {
          setSavingWT(false)
          if (result && !result.error && result.data) {
            setPrenotazioniWT(function(prev) { return prev.concat(result.data) })
            setShowFormWT(false)
          }
        })
    }
  }

  function apriModificaWT(p) {
    var s = p.wine_tour_sessioni
    setFormWT({ data: s ? s.data : '', orario: s ? s.orario : '18:00', lingua: p.lingua || 'ITA', num_persone: String(p.num_persone || 2), note: p.note || '' })
    setWtInModifica(p)
    setShowFormWT(true)
  }

  function eliminaWT(p) {
    if (!confirm('Eliminare questa prenotazione wine tour?')) return
    supabase.from('wine_tour_prenotazioni').delete().eq('id', p.id).then(function(result) {
      if (!result.error) setPrenotazioniWT(function(prev) { return prev.filter(function(x) { return x.id !== p.id }) })
    })
  }

  // ── COOKING CLASS ──────────────────────────────────────────
  function salvaCC() {
    if (!formCC.data) { alert('Inserisci la data della cooking class.'); return }
    setSavingCC(true)
    if (ccInModifica) {
      supabase.from('cooking_class_sessioni').update({
        data: formCC.data, orario: formCC.orario, lingua: formCC.lingua
      }).eq('id', ccInModifica.cooking_class_sessioni.id).then(function() {
        return supabase.from('cooking_class_prenotazioni').update({
          num_persone: parseInt(formCC.num_persone) || 2,
          lingua: formCC.lingua, note: formCC.note || null
        }).eq('id', ccInModifica.id).select('*, cooking_class_sessioni(id, data, orario, lingua)')
      }).then(function(result) {
        setSavingCC(false)
        if (result && !result.error && result.data) {
          setPrenotazioniCC(function(prev) { return prev.map(function(p) { return p.id === ccInModifica.id ? result.data[0] : p }) })
          setShowFormCC(false); setCcInModifica(null)
        }
      })
    } else {
      supabase.from('cooking_class_sessioni').insert([{ data: formCC.data, orario: formCC.orario, lingua: formCC.lingua }]).select()
        .then(function(result) {
          if (result.error || !result.data || !result.data.length) { setSavingCC(false); alert('Errore.'); return }
          return supabase.from('cooking_class_prenotazioni').insert([{
            sessione_id: result.data[0].id, gift_card_id: gc.id,
            num_persone: parseInt(formCC.num_persone) || 2, lingua: formCC.lingua, note: formCC.note || null
          }]).select('*, cooking_class_sessioni(id, data, orario, lingua)')
        })
        .then(function(result) {
          setSavingCC(false)
          if (result && !result.error && result.data) {
            setPrenotazioniCC(function(prev) { return prev.concat(result.data) })
            setShowFormCC(false)
          }
        })
    }
  }

  function apriModificaCC(p) {
    var s = p.cooking_class_sessioni
    setFormCC({ data: s ? s.data : '', orario: s ? s.orario : '15:00', lingua: p.lingua || 'ITA', num_persone: String(p.num_persone || 2), note: p.note || '' })
    setCcInModifica(p)
    setShowFormCC(true)
  }

  function eliminaCC(p) {
    if (!confirm('Eliminare questa prenotazione cooking class?')) return
    supabase.from('cooking_class_prenotazioni').delete().eq('id', p.id).then(function(result) {
      if (!result.error) setPrenotazioniCC(function(prev) { return prev.filter(function(x) { return x.id !== p.id }) })
    })
  }

  // ── PASTI ──────────────────────────────────────────────────
  function apriModificaPasto(p) {
    var noteOriginale = p.notes || ''
    var tipo = noteOriginale.indexOf('Cooking Class') !== -1 ? 'cooking' : 'degustazione'
    setFormPasto({
      data: p.reservation_date || dataRiferimento,
      turno: p.meal_type || 'dinner',
      adulti: String(p.adults_count || gc.numero_persone || 2),
      bambini: String(p.children_count || 0),
      note: noteOriginale.replace(/^\[.*?\]\s*/, ''),
      tipo: tipo
    })
    setPastoInModifica(p)
    setShowFormPasto(true)
  }

  async function salvaPasto() {
    if (!formPasto.data) { alert('Inserisci la data del pasto.'); return }
    setSavingPasto(true)
    var adulti = parseInt(formPasto.adulti) || 0
    var bambini = parseInt(formPasto.bambini) || 0
    var totale = adulti + bambini
    var tipoLabel = formPasto.tipo === 'cooking' ? '[Pasto Cooking Class]' : '[Pasto Degustazione]'
    var noteFinale = tipoLabel + (formPasto.note.trim() ? ' ' + formPasto.note.trim() : '')

    try {
      if (pastoInModifica) {
        var upd = await supabase.from('reservations').update({
          reservation_date: formPasto.data,
          meal_type: formPasto.turno,
          guests_count: totale,
          adults_count: adulti,
          children_count: bambini,
          notes: noteFinale
        }).eq('id', pastoInModifica.id).select('id, reservation_date, meal_type, guests_count, adults_count, children_count, notes')
        if (upd.error) throw new Error(upd.error.message)
        if (upd.data && upd.data.length > 0) {
          setPastiCollegati(function(prev) { return prev.map(function(p) { return p.id === pastoInModifica.id ? upd.data[0] : p }) })
        }
        setShowFormPasto(false)
        setPastoInModifica(null)
      } else {
        // Trova o crea cliente automatico
        var nomeCliente = 'Gift Card ' + gc.codice
        var cercaCliente = await supabase.from('customers').select('id').eq('last_name', nomeCliente).limit(1)
        var customerId
        if (cercaCliente.data && cercaCliente.data.length > 0) {
          customerId = cercaCliente.data[0].id
        } else {
          var nuovoCliente = await supabase.from('customers').insert([{
            first_name: gc.beneficiario_nome || gc.committente_nome || 'Beneficiario',
            last_name: nomeCliente,
            category: 'standard',
            is_active: true,
            source: 'manual',
            notes: 'Cliente automatico per gift card ' + gc.codice
          }]).select('id')
          if (nuovoCliente.error) throw new Error(nuovoCliente.error.message)
          customerId = nuovoCliente.data[0].id
        }
        var ins = await supabase.from('reservations').insert([{
          gift_card_id: gc.id,
          customer_id: customerId,
          reservation_date: formPasto.data,
          meal_type: formPasto.turno,
          guests_count: totale,
          adults_count: adulti,
          children_count: bambini,
          status: 'confirmed',
          source: 'manual',
          notes: noteFinale
        }]).select('id, reservation_date, meal_type, guests_count, adults_count, children_count, notes')
        if (ins.error) throw new Error(ins.error.message)
        if (ins.data && ins.data.length > 0) {
          setPastiCollegati(function(prev) { return prev.concat(ins.data) })
        }
        // Resetta il form ma tienilo aperto se ci sono ancora pasti da inserire
        var pastiNecessariTot = (tipologia && tipologia.tipologia_pasto_1 ? 1 : 0) + (tipologia && tipologia.tipologia_pasto_2 ? 1 : 0)
        var pastiGiaInseriti = pastiCollegati.length + 1
        if (pastiGiaInseriti >= pastiNecessariTot) {
          setShowFormPasto(false)
        } else {
          // Resetta solo il tipo per il secondo pasto, tenendo la data
          var altroTipo = formPasto.tipo === 'cooking' ? 'degustazione' : 'cooking'
          setFormPasto(function(prev) { return Object.assign({}, prev, { tipo: altroTipo, note: '' }) })
        }
      }
    } catch(err) {
      alert('Errore: ' + err.message)
    }
    setSavingPasto(false)
  }

  function eliminaPasto(p) {
    if (!confirm('Eliminare questa prenotazione pasto?')) return
    supabase.from('reservations').delete().eq('id', p.id).then(function(result) {
      if (!result.error) setPastiCollegati(function(prev) { return prev.filter(function(x) { return x.id !== p.id }) })
    })
  }

  var mealLabels = { lunch: 'Pranzo', dinner: 'Cena' }
  var linguaLabels = { ITA: '🇮🇹', ENG: '🇬🇧', ENTRAMBE: '🇮🇹/🇬🇧' }

  var serviziPrevisti = []
  if (tipologia) {
    if (tipologia.pernottamento) serviziPrevisti.push('pernottamento')
    if (tipologia.wine_tour) serviziPrevisti.push('wine_tour')
    if (tipologia.cooking_class) serviziPrevisti.push('cooking_class')
    if (tipologia.tipologia_pasto_1) serviziPrevisti.push('pasto_1')
    if (tipologia.tipologia_pasto_2) serviziPrevisti.push('pasto_2')
  }

  var serviziCompletati = 0
  if (gc.pernottamento_data_inizio) serviziCompletati++
  if (prenotazioniWT.length > 0) serviziCompletati++
  if (prenotazioniCC.length > 0) serviziCompletati++
  var pastiNecessari = (tipologia && tipologia.tipologia_pasto_1 ? 1 : 0) + (tipologia && tipologia.tipologia_pasto_2 ? 1 : 0)
  serviziCompletati += Math.min(pastiCollegati.length, pastiNecessari)
  var totServizi = serviziPrevisti.length

  function FormServizio(fprops) {
    return (
      <div className="mt-3 bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
        {fprops.children}
        <div className="flex gap-2 pt-1">
          <button onClick={fprops.onAnnulla} className="flex-1 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100">Annulla</button>
          <button onClick={fprops.onSalva} disabled={fprops.saving}
            className={"flex-1 py-2 rounded-lg text-xs font-medium " + (fprops.saving ? 'bg-gray-300 text-gray-400' : 'bg-wine-700 text-white hover:bg-wine-800')}>
            {fprops.saving ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[94vh]">

        <div className="flex items-start justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-gray-900">{tipologia ? tipologia.nome : 'Gift Card'}</h2>
              {badgeLingua(gc.lingua)}
              <span className={"px-2 py-0.5 rounded-full text-xs font-medium " + badgeStato(gc).cls}>{badgeStato(gc).label}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{gc.codice}</p>
            {(gc.committente_nome || gc.beneficiario_nome) && (
              <p className="text-xs text-gray-500 mt-0.5">
                {gc.committente_nome && 'Da: ' + gc.committente_nome}
                {gc.committente_nome && gc.beneficiario_nome && ' → '}
                {gc.beneficiario_nome && gc.beneficiario_nome}
              </p>
            )}
            {totServizi > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                  <div className="bg-wine-600 h-1.5 rounded-full" style={{ width: Math.round((serviziCompletati / totServizi) * 100) + '%' }} />
                </div>
                <span className="text-xs text-gray-500">{serviziCompletati}/{totServizi} servizi</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 ml-3"><X size={22} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? <div className="text-center py-8 text-gray-400 text-sm">Caricamento...</div> : (
            <>
              {/* PERNOTTAMENTO */}
              {tipologia && tipologia.pernottamento && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <button onClick={function() { setPernottamentoAperto(!pernottamentoAperto) }}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left">
                    <div className="flex items-center gap-3">
                      <Hotel size={18} className={gc.pernottamento_data_inizio ? 'text-green-600' : 'text-gray-300'} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Pernottamento ({tipologia.notti} notte/i)</p>
                        {gc.pernottamento_data_inizio
                          ? <p className="text-xs text-gray-500">{formatData(gc.pernottamento_data_inizio)} → {formatData(gc.pernottamento_data_fine)}{gc.pernottamento_camera ? ' · Camera ' + gc.pernottamento_camera : ''}</p>
                          : <p className="text-xs text-amber-600">⏳ Da pianificare</p>}
                      </div>
                    </div>
                    {pernottamentoAperto ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </button>
                  {pernottamentoAperto && (
                    <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Check-in</label>
                          <input type="date" value={formPernottamento.pernottamento_data_inizio}
                            onChange={function(e) { handleCheckInChange(e.target.value) }}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Check-out (calcolato)</label>
                          <input type="date" value={formPernottamento.pernottamento_data_fine}
                            onChange={function(e) { setFormPernottamento(function(p) { return Object.assign({}, p, { pernottamento_data_fine: e.target.value }) }) }}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Camera</label>
                        <input type="text" value={formPernottamento.pernottamento_camera}
                          onChange={function(e) { setFormPernottamento(function(p) { return Object.assign({}, p, { pernottamento_camera: e.target.value }) }) }}
                          placeholder="es. Camera 12" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Note (es. upgrade)</label>
                        <input type="text" value={formPernottamento.pernottamento_note}
                          onChange={function(e) { setFormPernottamento(function(p) { return Object.assign({}, p, { pernottamento_note: e.target.value }) }) }}
                          placeholder="es. Upgrade a Deluxe con extra €30" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                      </div>
                      <button onClick={salvaPernottamento} disabled={savingPernottamento}
                        className={"w-full py-2 rounded-lg text-sm font-medium " + (savingPernottamento ? 'bg-gray-300 text-gray-400' : 'bg-wine-700 text-white hover:bg-wine-800')}>
                        {savingPernottamento ? 'Salvataggio...' : 'Salva pernottamento'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* WINE TOUR */}
              {tipologia && tipologia.wine_tour && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <Wine size={18} className={prenotazioniWT.length > 0 ? 'text-purple-600' : 'text-gray-300'} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Wine Tour</p>
                        {tipologia.degustazione_vini_1 && <p className="text-xs text-gray-400">{tipologia.degustazione_vini_1}</p>}
                      </div>
                    </div>
                    {prenotazioniWT.length === 0 && !showFormWT && (
                      <button onClick={function() { setWtInModifica(null); setShowFormWT(true) }}
                        className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg border border-purple-200 hover:bg-purple-100 font-medium">
                        + Pianifica
                      </button>
                    )}
                  </div>
                  {prenotazioniWT.map(function(p) {
                    var s = p.wine_tour_sessioni
                    return (
                      <div key={p.id} className="border-t border-gray-100 px-4 py-3 bg-purple-50 flex items-center justify-between">
                        <div className="text-sm">
                          <span className="font-medium text-gray-800">{s ? formatData(s.data) : '—'}</span>
                          <span className="text-gray-500 ml-2">{s ? s.orario.substring(0,5) : ''}</span>
                          <span className="ml-2">{linguaLabels[p.lingua] || p.lingua}</span>
                          <span className="text-gray-400 ml-2">{p.num_persone} pers.</span>
                          {p.note && <span className="text-gray-400 ml-2 italic text-xs">{p.note}</span>}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={function() { apriModificaWT(p) }} className="text-gray-400 hover:text-purple-700 p-1"><PencilLine size={14} /></button>
                          <button onClick={function() { eliminaWT(p) }} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    )
                  })}
                  {prenotazioniWT.length === 0 && !showFormWT && (
                    <div className="border-t border-gray-100 px-4 pb-3"><p className="text-xs text-amber-600">⏳ Da pianificare</p></div>
                  )}
                  {showFormWT && (
                    <div className="border-t border-gray-100 p-4">
                      <FormServizio onAnnulla={function() { setShowFormWT(false); setWtInModifica(null) }} onSalva={salvaWT} saving={savingWT}>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Data</label>
                            <input type="date" value={formWT.data} onChange={function(e) { setFormWT(function(p) { return Object.assign({}, p, { data: e.target.value }) }) }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Orario</label>
                            <input type="time" value={formWT.orario} onChange={function(e) { setFormWT(function(p) { return Object.assign({}, p, { orario: e.target.value }) }) }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Lingua</label>
                            <select value={formWT.lingua} onChange={function(e) { setFormWT(function(p) { return Object.assign({}, p, { lingua: e.target.value }) }) }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wine-500">
                              <option value="ITA">🇮🇹 Italiano</option><option value="ENG">🇬🇧 English</option>
                            </select></div>
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">N° persone</label>
                            <input type="number" min="1" value={formWT.num_persone} onChange={function(e) { setFormWT(function(p) { return Object.assign({}, p, { num_persone: e.target.value }) }) }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
                        </div>
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
                          <input type="text" value={formWT.note} onChange={function(e) { setFormWT(function(p) { return Object.assign({}, p, { note: e.target.value }) }) }}
                            placeholder="Note aggiuntive..." className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
                      </FormServizio>
                    </div>
                  )}
                </div>
              )}

              {/* COOKING CLASS */}
              {tipologia && tipologia.cooking_class && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <ChefHat size={18} className={prenotazioniCC.length > 0 ? 'text-orange-600' : 'text-gray-300'} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Cooking Class</p>
                        <p className="text-xs text-gray-400">Inclusa visita all'orto</p>
                      </div>
                    </div>
                    {prenotazioniCC.length === 0 && !showFormCC && (
                      <button onClick={function() { setCcInModifica(null); setShowFormCC(true) }}
                        className="text-xs px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg border border-orange-200 hover:bg-orange-100 font-medium">
                        + Pianifica
                      </button>
                    )}
                  </div>
                  {prenotazioniCC.map(function(p) {
                    var s = p.cooking_class_sessioni
                    return (
                      <div key={p.id} className="border-t border-gray-100 px-4 py-3 bg-orange-50 flex items-center justify-between">
                        <div className="text-sm">
                          <span className="font-medium text-gray-800">{s ? formatData(s.data) : '—'}</span>
                          <span className="text-gray-500 ml-2">{s ? s.orario.substring(0,5) : ''}</span>
                          <span className="ml-2">{linguaLabels[p.lingua] || p.lingua}</span>
                          <span className="text-gray-400 ml-2">{p.num_persone} pers.</span>
                          {p.note && <span className="text-gray-400 ml-2 italic text-xs">{p.note}</span>}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={function() { apriModificaCC(p) }} className="text-gray-400 hover:text-orange-700 p-1"><PencilLine size={14} /></button>
                          <button onClick={function() { eliminaCC(p) }} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    )
                  })}
                  {prenotazioniCC.length === 0 && !showFormCC && (
                    <div className="border-t border-gray-100 px-4 pb-3"><p className="text-xs text-amber-600">⏳ Da pianificare</p></div>
                  )}
                  {showFormCC && (
                    <div className="border-t border-gray-100 p-4">
                      <FormServizio onAnnulla={function() { setShowFormCC(false); setCcInModifica(null) }} onSalva={salvaCC} saving={savingCC}>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Data</label>
                            <input type="date" value={formCC.data} onChange={function(e) { setFormCC(function(p) { return Object.assign({}, p, { data: e.target.value }) }) }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Orario (pref. pomeriggio)</label>
                            <input type="time" value={formCC.orario} onChange={function(e) { setFormCC(function(p) { return Object.assign({}, p, { orario: e.target.value }) }) }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Lingua</label>
                            <select value={formCC.lingua} onChange={function(e) { setFormCC(function(p) { return Object.assign({}, p, { lingua: e.target.value }) }) }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wine-500">
                              <option value="ITA">🇮🇹 Italiano</option><option value="ENG">🇬🇧 English</option>
                            </select></div>
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">N° persone</label>
                            <input type="number" min="1" value={formCC.num_persone} onChange={function(e) { setFormCC(function(p) { return Object.assign({}, p, { num_persone: e.target.value }) }) }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
                        </div>
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
                          <input type="text" value={formCC.note} onChange={function(e) { setFormCC(function(p) { return Object.assign({}, p, { note: e.target.value }) }) }}
                            placeholder="Note aggiuntive..." className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
                      </FormServizio>
                    </div>
                  )}
                </div>
              )}

              {/* PASTI */}
              {tipologia && (tipologia.tipologia_pasto_1 || tipologia.tipologia_pasto_2) && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <UtensilsCrossed size={18} className={pastiCollegati.length > 0 ? 'text-wine-600' : 'text-gray-300'} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Pasti inclusi</p>
                        <p className="text-xs text-gray-400">{[tipologia.tipologia_pasto_1, tipologia.tipologia_pasto_2].filter(Boolean).join(' + ')}</p>
                      </div>
                    </div>
                    {!showFormPasto && (
                      <button onClick={function() { setPastoInModifica(null); setShowFormPasto(true) }}
                        className="text-xs px-3 py-1.5 bg-wine-50 text-wine-700 rounded-lg border border-wine-200 hover:bg-wine-100 font-medium">
                        + Aggiungi
                      </button>
                    )}
                  </div>
                  {pastiCollegati.map(function(p) {
                    var noteVisibile = (p.notes || '').replace(/^\[.*?\]\s*/, '')
                    var tipoLabel = (p.notes || '').indexOf('Cooking') !== -1 ? '👨‍🍳' : '🍽️'
                    return (
                      <div key={p.id} className="border-t border-gray-100 px-4 py-3 bg-wine-50 flex items-center justify-between">
                        <div className="text-sm">
                          <span className="mr-1">{tipoLabel}</span>
                          <span className="font-medium text-gray-800">{formatData(p.reservation_date)}</span>
                          <span className="text-gray-500 ml-2">{mealLabels[p.meal_type] || p.meal_type}</span>
                          <span className="text-gray-400 ml-2">{p.adults_count} ad. + {p.children_count} ba.</span>
                          {noteVisibile && <span className="text-gray-400 ml-2 italic text-xs">{noteVisibile}</span>}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={function() { apriModificaPasto(p) }} className="text-gray-400 hover:text-wine-700 p-1"><PencilLine size={14} /></button>
                          <button onClick={function() { eliminaPasto(p) }} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    )
                  })}
                  {pastiCollegati.length === 0 && !showFormPasto && (
                    <div className="border-t border-gray-100 px-4 pb-3"><p className="text-xs text-amber-600">⏳ Da pianificare</p></div>
                  )}
                  {showFormPasto && (
                    <div className="border-t border-gray-100 p-4">
                      <FormServizio onAnnulla={function() { setShowFormPasto(false); setPastoInModifica(null) }} onSalva={salvaPasto} saving={savingPasto}>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo pasto</label>
                          <select value={formPasto.tipo} onChange={function(e) { setFormPasto(function(p) { return Object.assign({}, p, { tipo: e.target.value }) }) }}
                            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wine-500">
                            {tipologia.tipologia_pasto_1 && <option value="cooking">👨‍🍳 Pasto Cooking Class</option>}
                            {tipologia.tipologia_pasto_2 && <option value="degustazione">🍽️ Pasto Degustazione</option>}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Data</label>
                            <input type="date" value={formPasto.data} onChange={function(e) { setFormPasto(function(p) { return Object.assign({}, p, { data: e.target.value }) }) }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Turno</label>
                            <select value={formPasto.turno} onChange={function(e) { setFormPasto(function(p) { return Object.assign({}, p, { turno: e.target.value }) }) }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wine-500">
                              <option value="lunch">Pranzo</option><option value="dinner">Cena</option>
                            </select></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Adulti</label>
                            <input type="number" min="0" value={formPasto.adulti} onChange={function(e) { setFormPasto(function(p) { return Object.assign({}, p, { adulti: e.target.value }) }) }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Bambini</label>
                            <input type="number" min="0" value={formPasto.bambini} onChange={function(e) { setFormPasto(function(p) { return Object.assign({}, p, { bambini: e.target.value }) }) }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
                        </div>
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
                          <input type="text" value={formPasto.note} onChange={function(e) { setFormPasto(function(p) { return Object.assign({}, p, { note: e.target.value }) }) }}
                            placeholder="Richieste particolari, allergeni..." className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
                      </FormServizio>
                    </div>
                  )}
                </div>
              )}

              {(!tipologia || (!tipologia.pernottamento && !tipologia.wine_tour && !tipologia.cooking_class && !tipologia.tipologia_pasto_1)) && (
                <div className="text-center py-6 text-gray-400 text-sm">
                  <Gift size={32} className="mx-auto mb-2 opacity-30" />
                  <p>Nessun servizio strutturato per questa tipologia.</p>
                  <p className="text-xs mt-1">Usa le note per tracciare i servizi concordati.</p>
                </div>
              )}
            </>
          )}
        </div>
        <div className="p-5 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="w-full py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Chiudi</button>
        </div>
      </div>
    </div>
  )
}

// ── MODALE SEGNA COME USATA ───────────────────────────────────
function ModaleUtilizzo(props) {
  var gc = props.gc
  var onSave = props.onSave
  var onClose = props.onClose
  var oggi = new Date().toISOString().split('T')[0]
  var [dataUtilizzo, setDataUtilizzo] = useState(gc.data_utilizzo || oggi)
  var [prenotazioneSearch, setPrenotazioneSearch] = useState('')
  var [prenotazioniTrovate, setPrenotazioniTrovate] = useState([])
  var [prenotazioneSelezionata, setPrenotazioneSelezionata] = useState(null)
  var [saving, setSaving] = useState(false)

  function cercaPrenotazione(query) {
    setPrenotazioneSearch(query)
    if (query.length < 2) { setPrenotazioniTrovate([]); return }
    supabase.from('reservations')
      .select('id, reservation_date, meal_type, guests_count, customers(first_name, last_name)')
      .not('customer_id', 'is', null)
      .order('reservation_date', { ascending: false }).limit(8)
      .then(function(result) { if (!result.error && result.data) setPrenotazioniTrovate(result.data) })
  }

  function handleSalva() {
    setSaving(true)
    supabase.from('gift_card').update({
      usata: true, data_utilizzo: dataUtilizzo,
      prenotazione_id: prenotazioneSelezionata ? prenotazioneSelezionata.id : null
    }).eq('id', gc.id).select().then(function(result) {
      setSaving(false)
      if (result.error) { alert('Errore: ' + result.error.message); return }
      if (result.data && result.data.length > 0) onSave(result.data[0])
    })
  }

  var mealLabels = { lunch: 'Pranzo', dinner: 'Cena' }
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Segna come utilizzata</h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{gc.codice}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data utilizzo</label>
            <input type="date" value={dataUtilizzo} onChange={function(e) { setDataUtilizzo(e.target.value) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Collega a prenotazione (opzionale)</label>
            {prenotazioneSelezionata ? (
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{prenotazioneSelezionata.customers.last_name + ' ' + prenotazioneSelezionata.customers.first_name}</p>
                  <p className="text-xs text-gray-500">{formatData(prenotazioneSelezionata.reservation_date) + ' · ' + (mealLabels[prenotazioneSelezionata.meal_type] || prenotazioneSelezionata.meal_type)}</p>
                </div>
                <button onClick={function() { setPrenotazioneSelezionata(null); setPrenotazioneSearch('') }} className="text-gray-400 hover:text-red-500 p-1"><X size={16} /></button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input type="text" value={prenotazioneSearch} onChange={function(e) { cercaPrenotazione(e.target.value) }}
                    placeholder="Cerca per cognome cliente..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                </div>
                {prenotazioniTrovate.length > 0 && (
                  <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden">
                    {prenotazioniTrovate.map(function(p) {
                      return (
                        <button key={p.id} onClick={function() { setPrenotazioneSelezionata(p); setPrenotazioniTrovate([]) }}
                          className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0 text-sm">
                          <span className="font-medium">{p.customers.last_name + ' ' + p.customers.first_name}</span>
                          <span className="text-gray-400 ml-2 text-xs">{formatData(p.reservation_date) + ' · ' + (mealLabels[p.meal_type] || p.meal_type)}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Annulla</button>
          <button onClick={handleSalva} disabled={saving}
            className={"flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors " + (saving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-wine-700 text-white hover:bg-wine-800')}>
            {saving ? 'Salvataggio...' : 'Conferma utilizzo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MODALE TIPOLOGIA ──────────────────────────────────────────
function ModaleTipologia(props) {
  var onSave = props.onSave
  var onClose = props.onClose
  var t = props.tipologia || null
  var isModifica = t !== null

  function initForm(tip) {
    return {
      nome: tip ? tip.nome : '', prezzo: tip ? String(tip.prezzo) : '',
      prezzo_precedente: tip ? String(tip.prezzo_precedente || '') : '',
      persone_min: tip ? String(tip.persone_min) : '1', persone_max: tip ? String(tip.persone_max) : '1',
      prezzo_per_persona: tip ? tip.prezzo_per_persona : true,
      pernottamento: tip ? tip.pernottamento : false, notti: tip ? String(tip.notti) : '0',
      calice_benvenuto: tip ? tip.calice_benvenuto : false, wine_tour: tip ? tip.wine_tour : false,
      visita_orto: tip ? tip.visita_orto : false,
      degustazione_vini_1: tip ? (tip.degustazione_vini_1 || '') : '',
      degustazione_vini_2: tip ? (tip.degustazione_vini_2 || '') : '',
      tipologia_pasto_1: tip ? (tip.tipologia_pasto_1 || '') : '',
      tipologia_pasto_2: tip ? (tip.tipologia_pasto_2 || '') : '',
      cooking_class: tip ? tip.cooking_class : false, omaggio: tip ? (tip.omaggio || '') : '',
      attiva: tip ? tip.attiva : true, note: tip ? (tip.note || '') : ''
    }
  }

  var [form, setForm] = useState(initForm(t))
  var [saving, setSaving] = useState(false)
  var [errore, setErrore] = useState('')

  function hc(campo, valore) { setForm(function(prev) { var next = Object.assign({}, prev); next[campo] = valore; return next }) }

  function handleSave() {
    if (!form.nome.trim()) { setErrore('Il nome è obbligatorio.'); return }
    if (!form.prezzo) { setErrore('Il prezzo è obbligatorio.'); return }
    setErrore(''); setSaving(true)
    var payload = {
      nome: form.nome.trim(), prezzo: parseFloat(form.prezzo),
      prezzo_precedente: form.prezzo_precedente ? parseFloat(form.prezzo_precedente) : null,
      persone_min: parseInt(form.persone_min) || 1, persone_max: parseInt(form.persone_max) || 1,
      prezzo_per_persona: form.prezzo_per_persona, pernottamento: form.pernottamento,
      notti: parseInt(form.notti) || 0, calice_benvenuto: form.calice_benvenuto,
      wine_tour: form.wine_tour, visita_orto: form.visita_orto,
      degustazione_vini_1: form.degustazione_vini_1.trim() || null,
      degustazione_vini_2: form.degustazione_vini_2.trim() || null,
      tipologia_pasto_1: form.tipologia_pasto_1.trim() || null,
      tipologia_pasto_2: form.tipologia_pasto_2.trim() || null,
      cooking_class: form.cooking_class, omaggio: form.omaggio.trim() || null,
      attiva: form.attiva, note: form.note.trim() || null
    }
    if (isModifica && t.prezzo !== payload.prezzo) payload.data_variazione_prezzo = new Date().toISOString().split('T')[0]
    var query = isModifica
      ? supabase.from('gift_card_tipologie').update(payload).eq('id', t.id).select()
      : supabase.from('gift_card_tipologie').insert([payload]).select()
    query.then(function(result) {
      setSaving(false)
      if (result.error) { setErrore('Errore: ' + result.error.message); return }
      if (result.data && result.data.length > 0) onSave(result.data[0], isModifica)
    })
  }

  function Toggle(tp) {
    return (
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-gray-700">{tp.label}</span>
        <button type="button" onClick={function() { hc(tp.campo, !form[tp.campo]) }}
          className={"w-10 h-6 rounded-full transition-colors flex-shrink-0 " + (form[tp.campo] ? 'bg-wine-700' : 'bg-gray-300')}>
          <span className={"block w-4 h-4 rounded-full bg-white shadow transform transition-transform mx-1 " + (form[tp.campo] ? 'translate-x-4' : 'translate-x-0')} />
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col max-h-screen sm:max-h-[92vh]">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900">{isModifica ? 'Modifica Tipologia' : 'Nuova Tipologia'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={22} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input type="text" value={form.nome} onChange={function(e) { hc('nome', e.target.value) }} autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Prezzo attuale €</label>
              <input type="number" step="0.01" min="0" value={form.prezzo} onChange={function(e) { hc('prezzo', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Prezzo precedente €</label>
              <input type="number" step="0.01" min="0" value={form.prezzo_precedente} onChange={function(e) { hc('prezzo_precedente', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Pers. min</label>
              <input type="number" min="1" value={form.persone_min} onChange={function(e) { hc('persone_min', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Pers. max</label>
              <input type="number" min="1" value={form.persone_max} onChange={function(e) { hc('persone_max', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Notti</label>
              <input type="number" min="0" value={form.notti} onChange={function(e) { hc('notti', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>
          </div>
          <div className="border border-gray-200 rounded-xl p-4 space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Servizi inclusi</p>
            <Toggle label="Prezzo per persona" campo="prezzo_per_persona" />
            <Toggle label="Pernottamento" campo="pernottamento" />
            <Toggle label="Calice di benvenuto" campo="calice_benvenuto" />
            <Toggle label="Wine Tour" campo="wine_tour" />
            <Toggle label="Visita Orto" campo="visita_orto" />
            <Toggle label="Cooking Class" campo="cooking_class" />
          </div>
          {[['degustazione_vini_1','Degustazione vini 1','es. 3 vini in anfora'],
            ['degustazione_vini_2','Degustazione vini 2','es. 4 vini i Cacciagalli'],
            ['tipologia_pasto_1','Tipologia pasto 1','es. Tapas, Pranzo/Cena 4 portate'],
            ['tipologia_pasto_2','Tipologia pasto 2','es. Pranzo/Cena 4 portate'],
            ['omaggio','Omaggio','es. Grembiule e tote bag I Cacciagalli']].map(function(f) {
            return (<div key={f[0]}><label className="block text-sm font-medium text-gray-700 mb-1">{f[1]}</label>
              <input type="text" value={form[f[0]]} onChange={function(e) { hc(f[0], e.target.value) }} placeholder={f[2]}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" /></div>)
          })}
          <div className="border border-gray-200 rounded-xl p-4"><Toggle label="Tipologia attiva (in vendita)" campo="attiva" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Note interne</label>
            <textarea rows={2} value={form.note} onChange={function(e) { hc('note', e.target.value) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 resize-none" /></div>
          {errore && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{errore}</div>}
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Annulla</button>
          <button onClick={handleSave} disabled={saving}
            className={"flex-1 py-3 rounded-xl text-sm font-medium transition-colors " + (saving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-wine-700 text-white hover:bg-wine-800')}>
            {saving ? 'Salvataggio...' : (isModifica ? 'Aggiorna' : 'Crea Tipologia')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TAB ARCHIVIO ──────────────────────────────────────────────
function TabArchivio(props) {
  var tipologie = props.tipologie
  var [giftCard, setGiftCard] = useState([])
  var [loading, setLoading] = useState(true)
  var [filtroStato, setFiltroStato] = useState('valide')
  var [filtroTipologia, setFiltroTipologia] = useState('')
  var [ricerca, setRicerca] = useState('')
  var [showModale, setShowModale] = useState(false)
  var [gcInModifica, setGcInModifica] = useState(null)
  var [gcPerUtilizzo, setGcPerUtilizzo] = useState(null)
  var [gcPerServizi, setGcPerServizi] = useState(null)
  var [confermaElimina, setConfermaElimina] = useState(null)

  useEffect(function() { loadGiftCard() }, [])

  function loadGiftCard() {
    setLoading(true)
    supabase.from('gift_card')
      .select('*, gift_card_tipologie(id, nome, prezzo, prezzo_per_persona, pernottamento, notti, wine_tour, cooking_class, tipologia_pasto_1, tipologia_pasto_2, degustazione_vini_1, calice_benvenuto, visita_orto, omaggio)')
      .order('created_at', { ascending: false })
      .then(function(result) {
        setLoading(false)
        if (!result.error && result.data) setGiftCard(result.data)
      })
  }

  function handleSaveGc(gcSalvata, isModifica) {
    if (isModifica) {
      setGiftCard(function(prev) { return prev.map(function(g) { return g.id === gcSalvata.id ? Object.assign({}, g, gcSalvata) : g }) })
    } else { loadGiftCard() }
    setShowModale(false); setGcInModifica(null)
  }

  function handleSaveUtilizzo(gcAggiornata) {
    setGiftCard(function(prev) { return prev.map(function(g) { return g.id === gcAggiornata.id ? Object.assign({}, g, gcAggiornata) : g }) })
    setGcPerUtilizzo(null)
  }

  function handleAggiornaGc(gcAggiornata) {
    setGiftCard(function(prev) { return prev.map(function(g) { return g.id === gcAggiornata.id ? Object.assign({}, g, gcAggiornata) : g }) })
    if (gcPerServizi && gcPerServizi.id === gcAggiornata.id) setGcPerServizi(Object.assign({}, gcPerServizi, gcAggiornata))
  }

  function handleElimina() {
    var gc = confermaElimina
    supabase.from('gift_card').delete().eq('id', gc.id).then(function(result) {
      setConfermaElimina(null)
      if (!result.error) setGiftCard(function(prev) { return prev.filter(function(g) { return g.id !== gc.id }) })
      else alert('Errore: ' + result.error.message)
    })
  }

  var oggi = new Date()
  var gcFiltrate = giftCard.filter(function(gc) {
    var scaduta = gc.scadenza && new Date(gc.scadenza) < oggi
    if (filtroStato === 'valide' && (gc.usata || scaduta)) return false
    if (filtroStato === 'usate' && !gc.usata) return false
    if (filtroStato === 'scadute' && (!scaduta || gc.usata)) return false
    if (filtroTipologia && gc.tipologia_id !== filtroTipologia) return false
    if (ricerca) {
      var r = ricerca.toLowerCase()
      var match = (gc.codice || '').toLowerCase().indexOf(r) !== -1
        || (gc.committente_nome || '').toLowerCase().indexOf(r) !== -1
        || (gc.beneficiario_nome || '').toLowerCase().indexOf(r) !== -1
        || (gc.numero_scontrino || '').toLowerCase().indexOf(r) !== -1
      if (!match) return false
    }
    return true
  })

  var countValide = giftCard.filter(function(gc) { return !gc.usata && !(gc.scadenza && new Date(gc.scadenza) < oggi) }).length
  var countUsate = giftCard.filter(function(gc) { return gc.usata }).length
  var countScadute = giftCard.filter(function(gc) { return !gc.usata && gc.scadenza && new Date(gc.scadenza) < oggi }).length
  var countTutte = giftCard.length

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[{ key: 'valide', label: 'Valide', count: countValide, color: 'green' },
          { key: 'usate', label: 'Utilizzate', count: countUsate, color: 'gray' },
          { key: 'scadute', label: 'Scadute', count: countScadute, color: 'red' },
          { key: 'tutte', label: 'Tutte', count: countTutte, color: 'blue' }].map(function(s) {
          var isAttivo = filtroStato === s.key
          return (
            <button key={s.key} onClick={function() { setFiltroStato(s.key) }}
              className={"rounded-xl border p-3 text-center transition-all " + (isAttivo
                ? (s.color === 'green' ? 'bg-green-600 border-green-600 text-white'
                  : s.color === 'red' ? 'bg-red-600 border-red-600 text-white'
                  : s.color === 'blue' ? 'bg-wine-700 border-wine-700 text-white'
                  : 'bg-gray-600 border-gray-600 text-white')
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')}>
              <p className="text-2xl font-bold">{s.count}</p>
              <p className="text-xs font-medium mt-0.5">{s.label}</p>
            </button>
          )
        })}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input type="text" value={ricerca} onChange={function(e) { setRicerca(e.target.value) }}
            placeholder="Cerca codice, nome..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
        </div>
        <select value={filtroTipologia} onChange={function(e) { setFiltroTipologia(e.target.value) }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wine-500">
          <option value="">Tutte le tipologie</option>
          {tipologie.map(function(t) { return <option key={t.id} value={t.id}>{t.nome}</option> })}
        </select>
        <button onClick={function() { setGcInModifica(null); setShowModale(true) }}
          className="inline-flex items-center gap-2 bg-wine-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-wine-800">
          <Plus size={16} />Nuova
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Caricamento...</div>
      ) : gcFiltrate.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">Nessuna gift card trovata</div>
      ) : (
        <div className="space-y-3">
          {gcFiltrate.map(function(gc) {
            var stato = badgeStato(gc)
            var tip = gc.gift_card_tipologie
            return (
              <div key={gc.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono font-bold text-wine-700 text-sm">{gc.codice}</span>
                      {gc.codici_collegati && gc.codici_collegati.length > 0 && (
                        <span className="text-xs text-gray-400">+ {gc.codici_collegati.join(', ')}</span>
                      )}
                      <span className={"px-2 py-0.5 rounded-full text-xs font-medium " + stato.cls}>{stato.label}</span>
                      {tip && <span className="px-2 py-0.5 rounded-full text-xs bg-wine-50 text-wine-700 font-medium">{tip.nome}</span>}
                      {gc.lingua && gc.lingua !== 'ITA' && badgeLingua(gc.lingua)}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                      {gc.committente_nome && <span>Da: <span className="text-gray-700 font-medium">{gc.committente_nome}</span></span>}
                      {gc.beneficiario_nome && <span>A: <span className="text-gray-700 font-medium">{gc.beneficiario_nome}</span></span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                      {gc.data_acquisto && <span>Acquistata: {formatData(gc.data_acquisto)}</span>}
                      {gc.scadenza && <span className={isScaduta(gc.scadenza) ? 'text-red-600 font-medium' : ''}>Scade: {formatData(gc.scadenza)}</span>}
                      {gc.prezzo_pagato && <span className="font-medium text-gray-700">€{gc.prezzo_pagato}</span>}
                      {gc.numero_scontrino && <span>Scontrino: {gc.numero_scontrino}</span>}
                    </div>
                    {tip && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {tip.pernottamento && <span className={"px-1.5 py-0.5 rounded text-xs " + (gc.pernottamento_data_inizio ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-600')}>🏨 {gc.pernottamento_data_inizio ? formatData(gc.pernottamento_data_inizio) : 'Da pianif.'}</span>}
                        {tip.wine_tour && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">🍷 Wine Tour</span>}
                        {tip.cooking_class && <span className="px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded text-xs">👨‍🍳 Cooking</span>}
                      </div>
                    )}
                    {gc.usata && (
                      <p className="text-xs mt-1">
                        {gc.data_utilizzo
                          ? <span className="text-gray-400">Utilizzata il <span className="font-medium text-gray-600">{formatData(gc.data_utilizzo)}</span></span>
                          : <span className="text-amber-600">⚠ Data utilizzo non inserita</span>}
                      </p>
                    )}
                    {gc.note && <p className="text-xs text-gray-400 italic mt-1">{gc.note}</p>}
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={function() { setGcPerServizi(gc) }}
                      className="text-xs px-2 py-1.5 bg-wine-50 text-wine-700 rounded-lg border border-wine-200 hover:bg-wine-100 font-medium flex items-center gap-1">
                      <Gift size={12} />Servizi
                    </button>
                    {!gc.usata && !isScaduta(gc.scadenza) && (
                      <button onClick={function() { setGcPerUtilizzo(gc) }}
                        className="text-xs px-2 py-1.5 bg-green-50 text-green-700 rounded-lg border border-green-200 hover:bg-green-100 font-medium">
                        ✓ Usata
                      </button>
                    )}
                    <button onClick={function() { setGcInModifica(gc); setShowModale(true) }}
                      className="text-xs px-2 py-1.5 bg-gray-50 text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-100">
                      Modifica
                    </button>
                    <button onClick={function() { setConfermaElimina(gc) }}
                      className="text-xs px-2 py-1.5 bg-red-50 text-red-600 rounded-lg border border-red-200 hover:bg-red-100">
                      Elimina
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModale && <ModaleGiftCard tipologie={tipologie} gc={gcInModifica} onSave={handleSaveGc} onClose={function() { setShowModale(false); setGcInModifica(null) }} />}
      {gcPerUtilizzo && <ModaleUtilizzo gc={gcPerUtilizzo} onSave={handleSaveUtilizzo} onClose={function() { setGcPerUtilizzo(null) }} />}
      {gcPerServizi && <PannelloServizi gc={gcPerServizi} tipologia={gcPerServizi.gift_card_tipologie} onClose={function() { setGcPerServizi(null) }} onAggiorna={handleAggiornaGc} />}
      {confermaElimina && <ModaleConferma testo={'Eliminare la gift card "' + confermaElimina.codice + '"?'} onConferma={handleElimina} onAnnulla={function() { setConfermaElimina(null) }} />}
    </div>
  )
}

// ── TAB TIPOLOGIE ─────────────────────────────────────────────
function TabTipologie(props) {
  var tipologie = props.tipologie
  var onUpdate = props.onUpdate
  var [showModale, setShowModale] = useState(false)
  var [tipologiaInModifica, setTipologiaInModifica] = useState(null)
  var [confermaElimina, setConfermaElimina] = useState(null)
  var [aperte, setAperte] = useState({})

  function handleSave(tipSalvata, isModifica) { onUpdate(tipSalvata, isModifica); setShowModale(false); setTipologiaInModifica(null) }
  function handleElimina() {
    supabase.from('gift_card_tipologie').delete().eq('id', confermaElimina.id).then(function(result) {
      setConfermaElimina(null)
      if (!result.error) onUpdate(confermaElimina, false, true)
      else alert('Errore: ' + result.error.message)
    })
  }
  function toggleAperta(id) { setAperte(function(prev) { var next = Object.assign({}, prev); next[id] = !prev[id]; return next }) }

  var attive = tipologie.filter(function(t) { return t.attiva })
  var legacy = tipologie.filter(function(t) { return !t.attiva })

  function RigaTipologia(rp) {
    var t = rp.t; var aperta = !!aperte[t.id]
    return (
      <div className={"bg-white rounded-xl border shadow-sm " + (t.attiva ? 'border-gray-200' : 'border-gray-100 opacity-70')}>
        <div className="flex items-center gap-3 p-4">
          <button onClick={function() { toggleAperta(t.id) }} className="flex-1 text-left flex items-center gap-3">
            <span className="font-semibold text-gray-900 text-sm">{t.nome}</span>
            <span className="text-wine-700 font-bold text-sm">€{t.prezzo}</span>
            {t.prezzo_per_persona && <span className="text-xs text-gray-400">/p</span>}
            {!t.attiva && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">Legacy</span>}
            {aperta ? <ChevronUp size={14} className="text-gray-400 ml-auto" /> : <ChevronDown size={14} className="text-gray-400 ml-auto" />}
          </button>
          <button onClick={function() { setTipologiaInModifica(t); setShowModale(true) }} className="text-gray-400 hover:text-wine-700 p-1"><PencilLine size={15} /></button>
          <button onClick={function() { setConfermaElimina(t) }} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={15} /></button>
        </div>
        {aperta && (
          <div className="border-t border-gray-100 px-4 pb-4 pt-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {[['Persone', t.persone_min === t.persone_max ? t.persone_min : t.persone_min + '-' + t.persone_max],
                ['Pernottamento', t.pernottamento ? t.notti + ' notte/i' : 'No'],
                ['Calice benvenuto', t.calice_benvenuto ? 'Sì' : 'No'],
                ['Wine Tour', t.wine_tour ? 'Sì' : 'No'],
                ['Visita Orto', t.visita_orto ? 'Sì' : 'No'],
                ['Cooking Class', t.cooking_class ? 'Sì' : 'No']].map(function(item) {
                return (<div key={item[0]} className="bg-gray-50 rounded-lg p-2">
                  <p className="text-gray-400">{item[0]}</p><p className="font-medium text-gray-700">{item[1]}</p></div>)
              })}
            </div>
            {t.degustazione_vini_1 && <p className="text-xs text-gray-500 mt-2">Degustazione: {t.degustazione_vini_1}{t.degustazione_vini_2 ? ' + ' + t.degustazione_vini_2 : ''}</p>}
            {t.tipologia_pasto_1 && <p className="text-xs text-gray-500 mt-1">Pasto: {t.tipologia_pasto_1}{t.tipologia_pasto_2 ? ' + ' + t.tipologia_pasto_2 : ''}</p>}
            {t.omaggio && <p className="text-xs text-gray-500 mt-1">Omaggio: {t.omaggio}</p>}
            {t.prezzo_precedente && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} />Prezzo precedente: €{t.prezzo_precedente}{t.data_variazione_prezzo ? ' (variato il ' + formatData(t.data_variazione_prezzo) + ')' : ''}
              </p>
            )}
            {t.note && <p className="text-xs text-gray-400 italic mt-1">{t.note}</p>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{attive.length} tipologie attive{legacy.length > 0 ? ' · ' + legacy.length + ' legacy' : ''}</p>
        <button onClick={function() { setTipologiaInModifica(null); setShowModale(true) }}
          className="inline-flex items-center gap-2 bg-wine-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-wine-800">
          <Plus size={16} />Nuova tipologia
        </button>
      </div>
      <div className="space-y-3">{attive.map(function(t) { return <RigaTipologia key={t.id} t={t} /> })}</div>
      {legacy.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Legacy — non più in vendita</p>
          <div className="space-y-3">{legacy.map(function(t) { return <RigaTipologia key={t.id} t={t} /> })}</div>
        </div>
      )}
      {showModale && <ModaleTipologia tipologia={tipologiaInModifica} onSave={handleSave} onClose={function() { setShowModale(false); setTipologiaInModifica(null) }} />}
      {confermaElimina && <ModaleConferma testo={'Eliminare la tipologia "' + confermaElimina.nome + '"?'} onConferma={handleElimina} onAnnulla={function() { setConfermaElimina(null) }} />}
    </div>
  )
}

// ── PAGINA PRINCIPALE ─────────────────────────────────────────
export default function GiftCardPage() {
  var [tabAttiva, setTabAttiva] = useState('archivio')
  var [tipologie, setTipologie] = useState([])
  var [loadingTipologie, setLoadingTipologie] = useState(true)

  useEffect(function() { loadTipologie() }, [])

  function loadTipologie() {
    setLoadingTipologie(true)
    supabase.from('gift_card_tipologie').select('*')
      .order('attiva', { ascending: false }).order('prezzo', { ascending: true })
      .then(function(result) {
        setLoadingTipologie(false)
        if (!result.error && result.data) setTipologie(result.data)
      })
  }

  function handleUpdateTipologia(tipSalvata, isModifica, isElimina) {
    if (isElimina) { setTipologie(function(prev) { return prev.filter(function(t) { return t.id !== tipSalvata.id }) }) }
    else if (isModifica) { setTipologie(function(prev) { return prev.map(function(t) { return t.id === tipSalvata.id ? tipSalvata : t }) }) }
    else { setTipologie(function(prev) { return prev.concat([tipSalvata]) }) }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Gift size={24} className="text-wine-700" />Gift Card</h1>
          <p className="text-sm text-gray-500 mt-0.5">Archivio e gestione buoni regalo</p>
        </div>
      </div>
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {[{ key: 'archivio', label: 'Archivio' }, { key: 'tipologie', label: 'Tipologie pacchetti' }].map(function(tab) {
          return (
            <button key={tab.key} onClick={function() { setTabAttiva(tab.key) }}
              className={"px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px " + (tabAttiva === tab.key ? 'border-wine-700 text-wine-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              {tab.label}
            </button>
          )
        })}
      </div>
      {loadingTipologie ? <div className="text-center py-12 text-gray-400 text-sm">Caricamento...</div>
        : tabAttiva === 'archivio' ? <TabArchivio tipologie={tipologie} />
        : <TabTipologie tipologie={tipologie} onUpdate={handleUpdateTipologia} />}
    </div>
  )
}
