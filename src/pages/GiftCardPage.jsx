import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Search, X, Check, Gift, PencilLine, Trash2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'

// ── UTILITY ──────────────────────────────────────────────────
function formatData(dateStr) {
  if (!dateStr) return '—'
  var parts = dateStr.split('-')
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

// ── MODALE GIFT CARD (nuovo / modifica) ──────────────────────
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
    scadenza: isModifica ? (gcEsistente.scadenza || '') : '',
    numero_scontrino: isModifica ? (gcEsistente.numero_scontrino || '') : '',
    prezzo_pagato: isModifica ? String(gcEsistente.prezzo_pagato || '') : '',
    numero_persone: isModifica ? String(gcEsistente.numero_persone || '1') : '1',
    note: isModifica ? (gcEsistente.note || '') : ''
  })

  var [saving, setSaving] = useState(false)
  var [errore, setErrore] = useState('')

  // Quando cambia tipologia, precompila il prezzo
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
      numero_scontrino: form.numero_scontrino.trim() || null,
      prezzo_pagato: parseFloat(form.prezzo_pagato) || null,
      numero_persone: parseInt(form.numero_persone, 10) || 1,
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

          {/* Tipologia */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipologia *</label>
            <select value={form.tipologia_id}
              onChange={function(e) { handleTipologiaChange(e.target.value) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white">
              <option value="">Seleziona tipologia...</option>
              {tipologie.map(function(t) {
                return <option key={t.id} value={t.id}>{t.nome}{!t.attiva ? ' (legacy)' : ''}</option>
              })}
            </select>
            {tipologiaSelezionata && (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="px-2 py-0.5 bg-wine-50 text-wine-700 rounded text-xs">€{tipologiaSelezionata.prezzo}{tipologiaSelezionata.prezzo_per_persona ? '/persona' : ' per coppia'}</span>
                {tipologiaSelezionata.pernottamento && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{tipologiaSelezionata.notti} notte/i</span>}
                {tipologiaSelezionata.wine_tour && <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">Wine Tour</span>}
                {tipologiaSelezionata.cooking_class && <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded text-xs">Cooking Class</span>}
              </div>
            )}
          </div>

          {/* Codice e codici collegati */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Codice *</label>
              <input type="text" value={form.codice}
                onChange={function(e) { handleChange('codice', e.target.value.toUpperCase()) }}
                placeholder="es. FB40-855A"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Codici collegati</label>
              <input type="text" value={form.codici_collegati}
                onChange={function(e) { handleChange('codici_collegati', e.target.value.toUpperCase()) }}
                placeholder="es. AB12-CD34, EF56-GH78"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-wine-500" />
              <p className="text-xs text-gray-400 mt-0.5">Separa più codici con una virgola</p>
            </div>
          </div>

          {/* Committente e beneficiario */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Committente (chi acquista)</label>
              <input type="text" value={form.committente_nome}
                onChange={function(e) { handleChange('committente_nome', e.target.value) }}
                placeholder="Nome e cognome"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contatto committente</label>
              <input type="text" value={form.committente_contatto}
                onChange={function(e) { handleChange('committente_contatto', e.target.value) }}
                placeholder="Telefono o email"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beneficiario (chi riceve)</label>
            <input type="text" value={form.beneficiario_nome}
              onChange={function(e) { handleChange('beneficiario_nome', e.target.value) }}
              placeholder="Nome e cognome"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Messaggio</label>
            <textarea rows={2} value={form.messaggio}
              onChange={function(e) { handleChange('messaggio', e.target.value) }}
              placeholder="Messaggio personalizzato della gift card..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 resize-none" />
          </div>

          {/* Dati acquisto */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data acquisto</label>
              <input type="date" value={form.data_acquisto}
                onChange={function(e) { handleChange('data_acquisto', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scadenza</label>
              <input type="date" value={form.scadenza}
                onChange={function(e) { handleChange('scadenza', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">N° scontrino</label>
              <input type="text" value={form.numero_scontrino}
                onChange={function(e) { handleChange('numero_scontrino', e.target.value) }}
                placeholder="es. 1856-0002"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prezzo pagato €</label>
              <input type="number" step="0.01" min="0" value={form.prezzo_pagato}
                onChange={function(e) { handleChange('prezzo_pagato', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Numero persone</label>
            <input type="number" min="1" max="20" value={form.numero_persone}
              onChange={function(e) { handleChange('numero_persone', e.target.value) }}
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note interne</label>
            <textarea rows={2} value={form.note}
              onChange={function(e) { handleChange('note', e.target.value) }}
              placeholder="Note interne..."
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

// ── MODALE SEGNA COME USATA ───────────────────────────────────
function ModaleUtilizzo(props) {
  var gc = props.gc
  var onSave = props.onSave
  var onClose = props.onClose

  var oggi = new Date().toISOString().split('T')[0]
  var [dataUtilizzo, setDataUtilizzo] = useState(oggi)
  var [prenotazioneSearch, setPrenotazioneSearch] = useState('')
  var [prenotazioniTrovate, setPrenotazioniTrovate] = useState([])
  var [prenotazioneSelezionata, setPrenotazioneSelezionata] = useState(null)
  var [saving, setSaving] = useState(false)
  var [cercando, setCercando] = useState(false)

  function cercaPrenotazione(query) {
    setPrenotazioneSearch(query)
    if (query.length < 2) { setPrenotazioniTrovate([]); return }
    setCercando(true)
    supabase.from('reservations')
      .select('id, reservation_date, meal_type, guests_count, customers(first_name, last_name)')
      .or('customers.last_name.ilike.%' + query + '%,customers.first_name.ilike.%' + query + '%')
      .order('reservation_date', { ascending: false })
      .limit(8)
      .then(function(result) {
        setCercando(false)
        if (!result.error && result.data) setPrenotazioniTrovate(result.data)
      })
  }

  function handleSalva() {
    setSaving(true)
    var payload = {
      usata: true,
      data_utilizzo: dataUtilizzo,
      prenotazione_id: prenotazioneSelezionata ? prenotazioneSelezionata.id : null
    }
    supabase.from('gift_card').update(payload).eq('id', gc.id).select()
      .then(function(result) {
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
            <input type="date" value={dataUtilizzo}
              onChange={function(e) { setDataUtilizzo(e.target.value) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Collega a prenotazione (opzionale)</label>
            {prenotazioneSelezionata ? (
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {prenotazioneSelezionata.customers.last_name + ' ' + prenotazioneSelezionata.customers.first_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatData(prenotazioneSelezionata.reservation_date) + ' · ' + (mealLabels[prenotazioneSelezionata.meal_type] || prenotazioneSelezionata.meal_type) + ' · ' + prenotazioneSelezionata.guests_count + ' ospiti'}
                  </p>
                </div>
                <button onClick={function() { setPrenotazioneSelezionata(null); setPrenotazioneSearch('') }}
                  className="text-gray-400 hover:text-red-500 p-1"><X size={16} /></button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input type="text" value={prenotazioneSearch}
                    onChange={function(e) { cercaPrenotazione(e.target.value) }}
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
                {cercando && <p className="text-xs text-gray-400 mt-1">Ricerca...</p>}
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
  var tipologiaEsistente = props.tipologia || null
  var isModifica = tipologiaEsistente !== null

  function initForm(t) {
    return {
      nome: t ? t.nome : '',
      prezzo: t ? String(t.prezzo) : '',
      prezzo_precedente: t ? String(t.prezzo_precedente || '') : '',
      persone_min: t ? String(t.persone_min) : '1',
      persone_max: t ? String(t.persone_max) : '1',
      prezzo_per_persona: t ? t.prezzo_per_persona : true,
      pernottamento: t ? t.pernottamento : false,
      notti: t ? String(t.notti) : '0',
      calice_benvenuto: t ? t.calice_benvenuto : false,
      wine_tour: t ? t.wine_tour : false,
      visita_orto: t ? t.visita_orto : false,
      degustazione_vini_1: t ? (t.degustazione_vini_1 || '') : '',
      degustazione_vini_2: t ? (t.degustazione_vini_2 || '') : '',
      tipologia_pasto_1: t ? (t.tipologia_pasto_1 || '') : '',
      tipologia_pasto_2: t ? (t.tipologia_pasto_2 || '') : '',
      cooking_class: t ? t.cooking_class : false,
      omaggio: t ? (t.omaggio || '') : '',
      attiva: t ? t.attiva : true,
      note: t ? (t.note || '') : ''
    }
  }

  var [form, setForm] = useState(initForm(tipologiaEsistente))
  var [saving, setSaving] = useState(false)
  var [errore, setErrore] = useState('')

  function handleChange(campo, valore) {
    setForm(function(prev) {
      var next = Object.assign({}, prev)
      next[campo] = valore
      return next
    })
  }

  function handleSave() {
    if (!form.nome.trim()) { setErrore('Il nome è obbligatorio.'); return }
    if (!form.prezzo) { setErrore('Il prezzo è obbligatorio.'); return }
    setErrore('')
    setSaving(true)

    var payload = {
      nome: form.nome.trim(),
      prezzo: parseFloat(form.prezzo),
      prezzo_precedente: form.prezzo_precedente ? parseFloat(form.prezzo_precedente) : null,
      persone_min: parseInt(form.persone_min, 10) || 1,
      persone_max: parseInt(form.persone_max, 10) || 1,
      prezzo_per_persona: form.prezzo_per_persona,
      pernottamento: form.pernottamento,
      notti: parseInt(form.notti, 10) || 0,
      calice_benvenuto: form.calice_benvenuto,
      wine_tour: form.wine_tour,
      visita_orto: form.visita_orto,
      degustazione_vini_1: form.degustazione_vini_1.trim() || null,
      degustazione_vini_2: form.degustazione_vini_2.trim() || null,
      tipologia_pasto_1: form.tipologia_pasto_1.trim() || null,
      tipologia_pasto_2: form.tipologia_pasto_2.trim() || null,
      cooking_class: form.cooking_class,
      omaggio: form.omaggio.trim() || null,
      attiva: form.attiva,
      note: form.note.trim() || null
    }

    // Se il prezzo è cambiato in modifica, aggiorna data_variazione_prezzo
    if (isModifica && tipologiaEsistente.prezzo !== payload.prezzo) {
      payload.data_variazione_prezzo = new Date().toISOString().split('T')[0]
    }

    var query = isModifica
      ? supabase.from('gift_card_tipologie').update(payload).eq('id', tipologiaEsistente.id).select()
      : supabase.from('gift_card_tipologie').insert([payload]).select()

    query.then(function(result) {
      setSaving(false)
      if (result.error) { setErrore('Errore: ' + result.error.message); return }
      if (result.data && result.data.length > 0) onSave(result.data[0], isModifica)
    })
  }

  function Toggle(tprops) {
    return (
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-gray-700">{tprops.label}</span>
        <button type="button" onClick={function() { handleChange(tprops.campo, !form[tprops.campo]) }}
          className={"w-10 h-6 rounded-full transition-colors flex-shrink-0 " + (form[tprops.campo] ? 'bg-wine-700' : 'bg-gray-300')}>
          <span className={"block w-4 h-4 rounded-full bg-white shadow transform transition-transform mx-1 " + (form[tprops.campo] ? 'translate-x-4' : 'translate-x-0')} />
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input type="text" value={form.nome} onChange={function(e) { handleChange('nome', e.target.value) }}
              placeholder="es. L'Anfora nel Bicchiere"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prezzo attuale € *</label>
              <input type="number" step="0.01" min="0" value={form.prezzo}
                onChange={function(e) { handleChange('prezzo', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prezzo precedente €</label>
              <input type="number" step="0.01" min="0" value={form.prezzo_precedente}
                onChange={function(e) { handleChange('prezzo_precedente', e.target.value) }}
                placeholder="Lascia vuoto se invariato"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Persone min</label>
              <input type="number" min="1" value={form.persone_min}
                onChange={function(e) { handleChange('persone_min', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Persone max</label>
              <input type="number" min="1" value={form.persone_max}
                onChange={function(e) { handleChange('persone_max', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notti</label>
              <input type="number" min="0" value={form.notti}
                onChange={function(e) { handleChange('notti', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Degustazione vini 1</label>
            <input type="text" value={form.degustazione_vini_1}
              onChange={function(e) { handleChange('degustazione_vini_1', e.target.value) }}
              placeholder="es. 3 vini in anfora"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Degustazione vini 2</label>
            <input type="text" value={form.degustazione_vini_2}
              onChange={function(e) { handleChange('degustazione_vini_2', e.target.value) }}
              placeholder="es. 4 vini i Cacciagalli"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipologia pasto 1</label>
            <input type="text" value={form.tipologia_pasto_1}
              onChange={function(e) { handleChange('tipologia_pasto_1', e.target.value) }}
              placeholder="es. Tapas, Pranzo/Cena 4 portate"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipologia pasto 2</label>
            <input type="text" value={form.tipologia_pasto_2}
              onChange={function(e) { handleChange('tipologia_pasto_2', e.target.value) }}
              placeholder="es. Pranzo/Cena 4 portate"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Omaggio</label>
            <input type="text" value={form.omaggio}
              onChange={function(e) { handleChange('omaggio', e.target.value) }}
              placeholder="es. Grembiule e tote bag I Cacciagalli"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
          </div>

          <div className="border border-gray-200 rounded-xl p-4">
            <Toggle label="Tipologia attiva (in vendita)" campo="attiva" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note interne</label>
            <textarea rows={2} value={form.note}
              onChange={function(e) { handleChange('note', e.target.value) }}
              placeholder="Note interne sulla tipologia..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-500 resize-none" />
          </div>

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
  var [confermaElimina, setConfermaElimina] = useState(null)

  useEffect(function() { loadGiftCard() }, [])

  function loadGiftCard() {
    setLoading(true)
    supabase.from('gift_card')
      .select('*, gift_card_tipologie(nome, prezzo, prezzo_per_persona, pernottamento, wine_tour, cooking_class, tipologia_pasto_1)')
      .order('created_at', { ascending: false })
      .then(function(result) {
        setLoading(false)
        if (!result.error && result.data) setGiftCard(result.data)
      })
  }

  function handleSaveGc(gcSalvata, isModifica) {
    if (isModifica) {
      setGiftCard(function(prev) { return prev.map(function(g) { return g.id === gcSalvata.id ? Object.assign({}, gcSalvata, { gift_card_tipologie: g.gift_card_tipologie }) : g }) })
    } else {
      loadGiftCard()
    }
    setShowModale(false)
    setGcInModifica(null)
  }

  function handleSaveUtilizzo(gcAggiornata) {
    setGiftCard(function(prev) { return prev.map(function(g) { return g.id === gcAggiornata.id ? Object.assign({}, g, gcAggiornata) : g }) })
    setGcPerUtilizzo(null)
  }

  function handleElimina() {
    var gc = confermaElimina
    supabase.from('gift_card').delete().eq('id', gc.id).then(function(result) {
      setConfermaElimina(null)
      if (!result.error) setGiftCard(function(prev) { return prev.filter(function(g) { return g.id !== gc.id }) })
      else alert('Errore eliminazione: ' + result.error.message)
    })
  }

  // Filtraggio
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

  return (
    <div>
      {/* Contatori */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { key: 'valide', label: 'Valide', count: countValide, color: 'green' },
          { key: 'usate', label: 'Utilizzate', count: countUsate, color: 'gray' },
          { key: 'scadute', label: 'Scadute', count: countScadute, color: 'red' }
        ].map(function(s) {
          var isAttivo = filtroStato === s.key
          return (
            <button key={s.key} onClick={function() { setFiltroStato(s.key) }}
              className={"rounded-xl border p-3 text-center transition-all " + (isAttivo
                ? (s.color === 'green' ? 'bg-green-600 border-green-600 text-white' : s.color === 'red' ? 'bg-red-600 border-red-600 text-white' : 'bg-gray-600 border-gray-600 text-white')
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')}>
              <p className="text-2xl font-bold">{s.count}</p>
              <p className="text-xs font-medium mt-0.5">{s.label}</p>
            </button>
          )
        })}
      </div>

      {/* Filtri */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input type="text" value={ricerca}
            onChange={function(e) { setRicerca(e.target.value) }}
            placeholder="Cerca codice, nome..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
        </div>
        <select value={filtroTipologia}
          onChange={function(e) { setFiltroTipologia(e.target.value) }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wine-500">
          <option value="">Tutte le tipologie</option>
          {tipologie.map(function(t) { return <option key={t.id} value={t.id}>{t.nome}</option> })}
        </select>
        <button onClick={function() { setGcInModifica(null); setShowModale(true) }}
          className="inline-flex items-center gap-2 bg-wine-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-wine-800">
          <Plus size={16} />Nuova
        </button>
      </div>

      {/* Lista */}
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
                    {/* Header */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono font-bold text-wine-700 text-sm">{gc.codice}</span>
                      {gc.codici_collegati && gc.codici_collegati.length > 0 && (
                        <span className="text-xs text-gray-400">+ {gc.codici_collegati.join(', ')}</span>
                      )}
                      <span className={"px-2 py-0.5 rounded-full text-xs font-medium " + stato.cls}>{stato.label}</span>
                      {tip && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-wine-50 text-wine-700 font-medium">{tip.nome}</span>
                      )}
                    </div>

                    {/* Persone */}
                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-1 flex-wrap">
                      {gc.committente_nome && (
                        <span>Da: <span className="text-gray-700 font-medium">{gc.committente_nome}</span></span>
                      )}
                      {gc.beneficiario_nome && (
                        <span>A: <span className="text-gray-700 font-medium">{gc.beneficiario_nome}</span></span>
                      )}
                      {gc.numero_persone > 1 && (
                        <span>{gc.numero_persone} persone</span>
                      )}
                    </div>

                    {/* Date e prezzo */}
                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-1 flex-wrap">
                      {gc.data_acquisto && <span>Acquistata: {formatData(gc.data_acquisto)}</span>}
                      {gc.scadenza && (
                        <span className={isScaduta(gc.scadenza) ? 'text-red-600 font-medium' : ''}>
                          Scade: {formatData(gc.scadenza)}
                        </span>
                      )}
                      {gc.prezzo_pagato && <span className="font-medium text-gray-700">€{gc.prezzo_pagato}</span>}
                      {gc.numero_scontrino && <span>Scontrino: {gc.numero_scontrino}</span>}
                    </div>

                    {/* Servizi */}
                    {tip && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {tip.pernottamento && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">Pernottamento</span>}
                        {tip.wine_tour && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">Wine Tour</span>}
                        {tip.cooking_class && <span className="px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded text-xs">Cooking Class</span>}
                        {tip.tipologia_pasto_1 && <span className="px-1.5 py-0.5 bg-gray-50 text-gray-600 rounded text-xs">{tip.tipologia_pasto_1}</span>}
                      </div>
                    )}

                    {gc.usata && gc.data_utilizzo && (
                      <p className="text-xs text-gray-400 mt-1">Utilizzata il {formatData(gc.data_utilizzo)}</p>
                    )}
                    {gc.note && <p className="text-xs text-gray-400 italic mt-1">{gc.note}</p>}
                  </div>

                  {/* Azioni */}
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {!gc.usata && !isScaduta(gc.scadenza) && (
                      <button onClick={function() { setGcPerUtilizzo(gc) }}
                        className="text-xs px-2 py-1.5 bg-green-50 text-green-700 rounded-lg border border-green-200 hover:bg-green-100 font-medium">
                        Segna usata
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

      {showModale && (
        <ModaleGiftCard
          tipologie={tipologie}
          gc={gcInModifica}
          onSave={handleSaveGc}
          onClose={function() { setShowModale(false); setGcInModifica(null) }}
        />
      )}

      {gcPerUtilizzo && (
        <ModaleUtilizzo
          gc={gcPerUtilizzo}
          onSave={handleSaveUtilizzo}
          onClose={function() { setGcPerUtilizzo(null) }}
        />
      )}

      {confermaElimina && (
        <ModaleConferma
          testo={'Eliminare la gift card "' + confermaElimina.codice + '"? Questa azione non è reversibile.'}
          onConferma={handleElimina}
          onAnnulla={function() { setConfermaElimina(null) }}
        />
      )}
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

  function handleSave(tipSalvata, isModifica) {
    onUpdate(tipSalvata, isModifica)
    setShowModale(false)
    setTipologiaInModifica(null)
  }

  function handleElimina() {
    var tip = confermaElimina
    supabase.from('gift_card_tipologie').delete().eq('id', tip.id).then(function(result) {
      setConfermaElimina(null)
      if (!result.error) onUpdate(tip, false, true)
      else alert('Errore: ' + result.error.message)
    })
  }

  function toggleAperta(id) {
    setAperte(function(prev) {
      var next = Object.assign({}, prev)
      next[id] = !prev[id]
      return next
    })
  }

  var attive = tipologie.filter(function(t) { return t.attiva })
  var legacy = tipologie.filter(function(t) { return !t.attiva })

  function RigaTipologia(rprops) {
    var t = rprops.t
    var aperta = !!aperte[t.id]
    return (
      <div className={"bg-white rounded-xl border shadow-sm " + (t.attiva ? 'border-gray-200' : 'border-gray-100 opacity-70')}>
        <div className="flex items-center gap-3 p-4">
          <button onClick={function() { toggleAperta(t.id) }} className="flex-1 text-left flex items-center gap-3">
            <span className="font-semibold text-gray-900 text-sm">{t.nome}</span>
            <span className="text-wine-700 font-bold text-sm">€{t.prezzo}</span>
            {t.prezzo_per_persona && <span className="text-xs text-gray-400">/persona</span>}
            {!t.attiva && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">Legacy</span>}
            {aperta ? <ChevronUp size={14} className="text-gray-400 ml-auto" /> : <ChevronDown size={14} className="text-gray-400 ml-auto" />}
          </button>
          <button onClick={function() { setTipologiaInModifica(t); setShowModale(true) }}
            className="text-gray-400 hover:text-wine-700 p-1"><PencilLine size={15} /></button>
          <button onClick={function() { setConfermaElimina(t) }}
            className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={15} /></button>
        </div>

        {aperta && (
          <div className="border-t border-gray-100 px-4 pb-4 pt-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {[
                { label: 'Persone', val: t.persone_min === t.persone_max ? t.persone_min : t.persone_min + '-' + t.persone_max },
                { label: 'Pernottamento', val: t.pernottamento ? (t.notti + ' notte/i') : 'No' },
                { label: 'Calice benvenuto', val: t.calice_benvenuto ? 'Sì' : 'No' },
                { label: 'Wine Tour', val: t.wine_tour ? 'Sì' : 'No' },
                { label: 'Visita Orto', val: t.visita_orto ? 'Sì' : 'No' },
                { label: 'Cooking Class', val: t.cooking_class ? 'Sì' : 'No' }
              ].map(function(item) {
                return (
                  <div key={item.label} className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-400 text-xs">{item.label}</p>
                    <p className="font-medium text-gray-700">{item.val}</p>
                  </div>
                )
              })}
            </div>
            {t.degustazione_vini_1 && (
              <p className="text-xs text-gray-500 mt-2">Degustazione: {t.degustazione_vini_1}{t.degustazione_vini_2 ? ' + ' + t.degustazione_vini_2 : ''}</p>
            )}
            {t.tipologia_pasto_1 && (
              <p className="text-xs text-gray-500 mt-1">Pasto: {t.tipologia_pasto_1}{t.tipologia_pasto_2 ? ' + ' + t.tipologia_pasto_2 : ''}</p>
            )}
            {t.omaggio && (
              <p className="text-xs text-gray-500 mt-1">Omaggio: {t.omaggio}</p>
            )}
            {t.prezzo_precedente && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} />
                Prezzo precedente: €{t.prezzo_precedente}{t.data_variazione_prezzo ? ' (variato il ' + formatData(t.data_variazione_prezzo) + ')' : ''}
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

      <div className="space-y-3">
        {attive.map(function(t) { return <RigaTipologia key={t.id} t={t} /> })}
      </div>

      {legacy.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Legacy — non più in vendita</p>
          <div className="space-y-3">
            {legacy.map(function(t) { return <RigaTipologia key={t.id} t={t} /> })}
          </div>
        </div>
      )}

      {showModale && (
        <ModaleTipologia
          tipologia={tipologiaInModifica}
          onSave={handleSave}
          onClose={function() { setShowModale(false); setTipologiaInModifica(null) }}
        />
      )}

      {confermaElimina && (
        <ModaleConferma
          testo={'Eliminare la tipologia "' + confermaElimina.nome + '"? Questa azione non è reversibile.'}
          onConferma={handleElimina}
          onAnnulla={function() { setConfermaElimina(null) }}
        />
      )}
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
    supabase.from('gift_card_tipologie')
      .select('*')
      .order('attiva', { ascending: false })
      .order('prezzo', { ascending: true })
      .then(function(result) {
        setLoadingTipologie(false)
        if (!result.error && result.data) setTipologie(result.data)
      })
  }

  function handleUpdateTipologia(tipSalvata, isModifica, isElimina) {
    if (isElimina) {
      setTipologie(function(prev) { return prev.filter(function(t) { return t.id !== tipSalvata.id }) })
    } else if (isModifica) {
      setTipologie(function(prev) { return prev.map(function(t) { return t.id === tipSalvata.id ? tipSalvata : t }) })
    } else {
      setTipologie(function(prev) { return prev.concat([tipSalvata]) })
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Gift size={24} className="text-wine-700" />
            Gift Card
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Archivio e gestione buoni regalo</p>
        </div>
      </div>

      {/* Tab */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {[
          { key: 'archivio', label: 'Archivio' },
          { key: 'tipologie', label: 'Tipologie pacchetti' }
        ].map(function(tab) {
          return (
            <button key={tab.key} onClick={function() { setTabAttiva(tab.key) }}
              className={"px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px " + (tabAttiva === tab.key ? 'border-wine-700 text-wine-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              {tab.label}
            </button>
          )
        })}
      </div>

      {loadingTipologie ? (
        <div className="text-center py-12 text-gray-400 text-sm">Caricamento...</div>
      ) : tabAttiva === 'archivio' ? (
        <TabArchivio tipologie={tipologie} />
      ) : (
        <TabTipologie tipologie={tipologie} onUpdate={handleUpdateTipologia} />
      )}

    </div>
  )
}
