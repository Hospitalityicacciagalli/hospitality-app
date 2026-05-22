import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Trash2, PencilLine, ChevronLeft, ChevronRight, Users, Clock, ChefHat, Globe } from 'lucide-react'

// ── UTILITY ──────────────────────────────────────────────────
function formatData(dateStr) {
  if (!dateStr) return '—'
  var parts = String(dateStr).split('T')[0].split('-')
  if (parts.length !== 3) return dateStr
  return parts[2] + '/' + parts[1] + '/' + parts[0]
}

function formatDataISO(date) {
  var y = date.getFullYear()
  var m = String(date.getMonth() + 1).padStart(2, '0')
  var d = String(date.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function nomeMese(anno, mese) {
  var mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
  return mesi[mese] + ' ' + anno
}

function nomeGiornoBreve(dayIndex) {
  return ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'][dayIndex]
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

// ── MODALE SESSIONE ───────────────────────────────────────────
function ModaleSessione(props) {
  var onSave = props.onSave
  var onClose = props.onClose
  var sessioneEsistente = props.sessione || null
  var dataPreselezionata = props.dataPreselezionata || ''
  var isModifica = sessioneEsistente !== null

  var [form, setForm] = useState({
    data: isModifica ? (sessioneEsistente.data || '') : dataPreselezionata,
    orario: isModifica ? (sessioneEsistente.orario || '18:00') : '18:00',
    lingua: isModifica ? (sessioneEsistente.lingua || 'ITA') : 'ITA',
    max_partecipanti: isModifica ? String(sessioneEsistente.max_partecipanti || '') : '',
    note: isModifica ? (sessioneEsistente.note || '') : ''
  })
  var [saving, setSaving] = useState(false)
  var [errore, setErrore] = useState('')

  function hc(campo, val) { setForm(function(p) { var n = Object.assign({}, p); n[campo] = val; return n }) }

  function handleSave() {
    if (!form.data) { setErrore('Inserisci la data.'); return }
    if (!form.orario) { setErrore('Inserisci l\'orario.'); return }
    setErrore('')
    setSaving(true)
    var payload = {
      data: form.data,
      orario: form.orario,
      lingua: form.lingua,
      max_partecipanti: form.max_partecipanti ? parseInt(form.max_partecipanti) : null,
      note: form.note.trim() || null
    }
    var query = isModifica
      ? supabase.from('cooking_class_sessioni').update(payload).eq('id', sessioneEsistente.id).select()
      : supabase.from('cooking_class_sessioni').insert([payload]).select()
    query.then(function(result) {
      setSaving(false)
      if (result.error) { setErrore('Errore: ' + result.error.message); return }
      if (result.data && result.data.length > 0) onSave(result.data[0], isModifica)
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{isModifica ? 'Modifica Sessione' : 'Nuova Sessione Cooking Class'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
              <input type="date" value={form.data} onChange={function(e) { hc('data', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Orario *</label>
              <input type="time" value={form.orario} onChange={function(e) { hc('orario', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lingua</label>
              <select value={form.lingua} onChange={function(e) { hc('lingua', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="ITA">🇮🇹 Italiano</option>
                <option value="ENG">🇬🇧 English</option>
                <option value="MISTO">🇮🇹/🇬🇧 Misto</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max partecipanti</label>
              <input type="number" min="1" value={form.max_partecipanti} onChange={function(e) { hc('max_partecipanti', e.target.value) }}
                placeholder="Nessun limite"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea rows={2} value={form.note} onChange={function(e) { hc('note', e.target.value) }}
              placeholder="Note interne sulla sessione..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
          </div>
          {errore && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{errore}</div>}
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Annulla</button>
          <button onClick={handleSave} disabled={saving}
            className={"flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors " + (saving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-orange-700 text-white hover:bg-orange-800')}>
            {saving ? 'Salvataggio...' : (isModifica ? 'Aggiorna' : 'Crea Sessione')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MODALE PRENOTAZIONE ───────────────────────────────────────
function ModalePrenotazione(props) {
  var onSave = props.onSave
  var onClose = props.onClose
  var sessione = props.sessione
  var prenotazioneEsistente = props.prenotazione || null
  var isModifica = prenotazioneEsistente !== null

  var [form, setForm] = useState({
    nome_gruppo: isModifica ? (prenotazioneEsistente.nome_gruppo || '') : '',
    num_persone: isModifica ? String(prenotazioneEsistente.num_persone || '2') : '2',
    lingua: isModifica ? (prenotazioneEsistente.lingua || sessione.lingua || 'ITA') : (sessione.lingua || 'ITA'),
    note: isModifica ? (prenotazioneEsistente.note || '') : ''
  })
  var [giftCardSearch, setGiftCardSearch] = useState('')
  var [giftCardTrovate, setGiftCardTrovate] = useState([])
  var [giftCardSelezionata, setGiftCardSelezionata] = useState(
    isModifica && prenotazioneEsistente.gift_card_id ? { id: prenotazioneEsistente.gift_card_id, codice: prenotazioneEsistente.gift_card_codice || '' } : null
  )
  var [saving, setSaving] = useState(false)
  var [errore, setErrore] = useState('')

  function hc(campo, val) { setForm(function(p) { var n = Object.assign({}, p); n[campo] = val; return n }) }

  function cercaGiftCard(query) {
    setGiftCardSearch(query)
    if (query.length < 2) { setGiftCardTrovate([]); return }
    supabase.from('gift_card')
      .select('id, codice, committente_nome, beneficiario_nome, gift_card_tipologie(nome)')
      .eq('usata', false)
      .or('codice.ilike.%' + query + '%,committente_nome.ilike.%' + query + '%,beneficiario_nome.ilike.%' + query + '%')
      .limit(6)
      .then(function(result) {
        if (!result.error && result.data) setGiftCardTrovate(result.data)
      })
  }

  function handleSave() {
    if (!form.nome_gruppo.trim()) { setErrore('Inserisci il nome del gruppo o del cliente.'); return }
    setErrore('')
    setSaving(true)
    var payload = {
      sessione_id: sessione.id,
      gift_card_id: giftCardSelezionata ? giftCardSelezionata.id : null,
      nome_gruppo: form.nome_gruppo.trim(),
      num_persone: parseInt(form.num_persone) || 1,
      lingua: form.lingua,
      note: form.note.trim() || null
    }
    var query = isModifica
      ? supabase.from('cooking_class_prenotazioni').update(payload).eq('id', prenotazioneEsistente.id).select()
      : supabase.from('cooking_class_prenotazioni').insert([payload]).select()
    query.then(function(result) {
      setSaving(false)
      if (result.error) { setErrore('Errore: ' + result.error.message); return }
      if (result.data && result.data.length > 0) onSave(result.data[0], isModifica)
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">{isModifica ? 'Modifica Prenotazione' : 'Nuova Prenotazione'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Cooking Class · {formatData(sessione.data)} · {sessione.orario}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome cliente / gruppo *</label>
            <input type="text" value={form.nome_gruppo} onChange={function(e) { hc('nome_gruppo', e.target.value) }}
              placeholder="es. Famiglia Rossi, Gruppo Azienda XYZ..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">N° persone</label>
              <input type="number" min="1" value={form.num_persone} onChange={function(e) { hc('num_persone', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lingua</label>
              <select value={form.lingua} onChange={function(e) { hc('lingua', e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="ITA">🇮🇹 Italiano</option>
                <option value="ENG">🇬🇧 English</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Collega Gift Card (opzionale)</label>
            {giftCardSelezionata ? (
              <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div>
                  <p className="text-sm font-mono font-bold text-orange-700">{giftCardSelezionata.codice}</p>
                  {giftCardSelezionata.committente_nome && <p className="text-xs text-gray-500">{giftCardSelezionata.committente_nome}</p>}
                </div>
                <button onClick={function() { setGiftCardSelezionata(null); setGiftCardSearch('') }} className="text-gray-400 hover:text-red-500 p-1"><X size={16} /></button>
              </div>
            ) : (
              <div>
                <input type="text" value={giftCardSearch} onChange={function(e) { cercaGiftCard(e.target.value) }}
                  placeholder="Cerca per codice o nome..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                {giftCardTrovate.length > 0 && (
                  <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden">
                    {giftCardTrovate.map(function(gc) {
                      return (
                        <button key={gc.id} onClick={function() { setGiftCardSelezionata(gc); setGiftCardTrovate([]) }}
                          className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0 text-sm">
                          <span className="font-mono font-bold text-orange-700">{gc.codice}</span>
                          <span className="text-gray-500 ml-2 text-xs">{gc.gift_card_tipologie ? gc.gift_card_tipologie.nome : ''}</span>
                          {gc.committente_nome && <span className="text-gray-400 ml-2 text-xs">{gc.committente_nome}</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea rows={2} value={form.note} onChange={function(e) { hc('note', e.target.value) }}
              placeholder="Richieste particolari, allergie, note varie..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
          </div>
          {errore && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{errore}</div>}
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Annulla</button>
          <button onClick={handleSave} disabled={saving}
            className={"flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors " + (saving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-orange-700 text-white hover:bg-orange-800')}>
            {saving ? 'Salvataggio...' : (isModifica ? 'Aggiorna' : 'Aggiungi')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── DETTAGLIO SESSIONE ────────────────────────────────────────
function DettaglioSessione(props) {
  var sessione = props.sessione
  var onClose = props.onClose
  var onModificaSessione = props.onModificaSessione
  var onEliminaSessione = props.onEliminaSessione

  var [prenotazioni, setPrenotazioni] = useState([])
  var [loading, setLoading] = useState(true)
  var [showModalePrenotazione, setShowModalePrenotazione] = useState(false)
  var [prenotazioneInModifica, setPrenotazioneInModifica] = useState(null)
  var [confermaElimina, setConfermaElimina] = useState(null)

  useEffect(function() { loadPrenotazioni() }, [sessione.id])

  function loadPrenotazioni() {
    setLoading(true)
    supabase.from('cooking_class_prenotazioni')
      .select('*, gift_card(codice, committente_nome)')
      .eq('sessione_id', sessione.id)
      .order('created_at', { ascending: true })
      .then(function(result) {
        setLoading(false)
        if (!result.error && result.data) setPrenotazioni(result.data)
      })
  }

  function handleSavePrenotazione(prenotazioneSalvata, isModifica) {
    if (isModifica) {
      setPrenotazioni(function(prev) { return prev.map(function(p) { return p.id === prenotazioneSalvata.id ? Object.assign({}, p, prenotazioneSalvata) : p }) })
    } else {
      setPrenotazioni(function(prev) { return prev.concat([prenotazioneSalvata]) })
    }
    setShowModalePrenotazione(false)
    setPrenotazioneInModifica(null)
  }

  function eliminaPrenotazione() {
    var p = confermaElimina
    supabase.from('cooking_class_prenotazioni').delete().eq('id', p.id).then(function(result) {
      setConfermaElimina(null)
      if (!result.error) setPrenotazioni(function(prev) { return prev.filter(function(x) { return x.id !== p.id }) })
      else alert('Errore: ' + result.error.message)
    })
  }

  var totPartecipanti = prenotazioni.reduce(function(acc, p) { return acc + (p.num_persone || 0) }, 0)
  var linguaLabel = { ITA: '🇮🇹 Italiano', ENG: '🇬🇧 English', MISTO: '🇮🇹/🇬🇧 Misto' }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col max-h-screen sm:max-h-[85vh]">
        <div className="flex items-start justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-gray-900">Cooking Class</h2>
              {sessione.lingua !== 'ITA' && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">🇬🇧 ENG</span>}
            </div>
            <p className="text-sm text-gray-600 mt-0.5">{formatData(sessione.data)} · {sessione.orario} · {linguaLabel[sessione.lingua] || sessione.lingua}</p>
            <p className="text-xs text-gray-400 mt-0.5">{totPartecipanti} partecipanti totali{sessione.max_partecipanti ? ' / max ' + sessione.max_partecipanti : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={22} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Caricamento...</div>
          ) : prenotazioni.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Nessuna prenotazione ancora.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {prenotazioni.map(function(p) {
                return (
                  <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{p.nome_gruppo}</span>
                        {p.lingua === 'ENG' && <span className="text-xs">🇬🇧</span>}
                        {p.gift_card && (
                          <span className="px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded text-xs font-mono">🎁 {p.gift_card.codice}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                        <span className="flex items-center gap-1"><Users size={11} />{p.num_persone} pers.</span>
                        {p.note && <span className="italic truncate">{p.note}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={function() { setPrenotazioneInModifica(p); setShowModalePrenotazione(true) }}
                        className="text-gray-400 hover:text-orange-700 p-1"><PencilLine size={15} /></button>
                      <button onClick={function() { setConfermaElimina(p) }}
                        className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={15} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex-shrink-0 space-y-2">
          <button onClick={function() { setPrenotazioneInModifica(null); setShowModalePrenotazione(true) }}
            className="w-full py-2.5 bg-orange-700 text-white rounded-xl text-sm font-medium hover:bg-orange-800 flex items-center justify-center gap-2">
            <Plus size={16} />Aggiungi prenotazione
          </button>
          <div className="flex gap-2">
            <button onClick={function() { onModificaSessione(sessione) }}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1">
              <PencilLine size={13} />Modifica sessione
            </button>
            <button onClick={function() { onEliminaSessione(sessione) }}
              className="flex-1 py-2 border border-red-200 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 flex items-center justify-center gap-1">
              <Trash2 size={13} />Elimina sessione
            </button>
          </div>
        </div>

        {showModalePrenotazione && (
          <ModalePrenotazione
            sessione={sessione}
            prenotazione={prenotazioneInModifica}
            onSave={handleSavePrenotazione}
            onClose={function() { setShowModalePrenotazione(false); setPrenotazioneInModifica(null) }}
          />
        )}
        {confermaElimina && (
          <ModaleConferma
            testo={'Eliminare la prenotazione di "' + confermaElimina.nome_gruppo + '"?'}
            onConferma={eliminaPrenotazione}
            onAnnulla={function() { setConfermaElimina(null) }}
          />
        )}
      </div>
    </div>
  )
}

// ── PAGINA PRINCIPALE ─────────────────────────────────────────
export default function CookingClassPage() {
  var oggi = new Date()
  var [anno, setAnno] = useState(oggi.getFullYear())
  var [mese, setMese] = useState(oggi.getMonth())
  var [sessioni, setSessioni] = useState([])
  var [loading, setLoading] = useState(true)
  var [sessioneSelezionata, setSessioneSelezionata] = useState(null)
  var [showModaleSessione, setShowModaleSessione] = useState(false)
  var [sessioneInModifica, setSessioneInModifica] = useState(null)
  var [dataPreselezionata, setDataPreselezionata] = useState('')
  var [confermaElimina, setConfermaElimina] = useState(null)

  useEffect(function() { loadSessioni() }, [anno, mese])

  function loadSessioni() {
    setLoading(true)
    var inizioMese = anno + '-' + String(mese + 1).padStart(2, '0') + '-01'
    var fineMese = anno + '-' + String(mese + 1).padStart(2, '0') + '-' + new Date(anno, mese + 1, 0).getDate()
    supabase.from('cooking_class_sessioni')
      .select('*, cooking_class_prenotazioni(id, num_persone, lingua)')
      .gte('data', inizioMese)
      .lte('data', fineMese)
      .order('data', { ascending: true })
      .order('orario', { ascending: true })
      .then(function(result) {
        setLoading(false)
        if (!result.error && result.data) setSessioni(result.data)
      })
  }

  function meseSuccessivo() {
    if (mese === 11) { setAnno(anno + 1); setMese(0) } else { setMese(mese + 1) }
  }

  function mesePrecedente() {
    if (mese === 0) { setAnno(anno - 1); setMese(11) } else { setMese(mese - 1) }
  }

  function handleSaveSessione(sessioneSalvata, isModifica) {
    if (isModifica) {
      setSessioni(function(prev) { return prev.map(function(s) { return s.id === sessioneSalvata.id ? Object.assign({}, s, sessioneSalvata) : s }) })
      if (sessioneSelezionata && sessioneSelezionata.id === sessioneSalvata.id) {
        setSessioneSelezionata(Object.assign({}, sessioneSelezionata, sessioneSalvata))
      }
    } else {
      sessioneSalvata.cooking_class_prenotazioni = []
      setSessioni(function(prev) {
        var nuove = prev.concat([sessioneSalvata])
        return nuove.sort(function(a, b) {
          if (a.data !== b.data) return a.data > b.data ? 1 : -1
          return a.orario > b.orario ? 1 : -1
        })
      })
    }
    setShowModaleSessione(false)
    setSessioneInModifica(null)
  }

  function handleEliminaSessione(sessione) {
    setConfermaElimina(sessione)
    setSessioneSelezionata(null)
  }

  function eseguiEliminaSessione() {
    var s = confermaElimina
    supabase.from('cooking_class_sessioni').delete().eq('id', s.id).then(function(result) {
      setConfermaElimina(null)
      if (!result.error) {
        setSessioni(function(prev) { return prev.filter(function(x) { return x.id !== s.id }) })
      } else { alert('Errore: ' + result.error.message) }
    })
  }

  // Costruzione calendario
  var primoGiorno = new Date(anno, mese, 1).getDay()
  var giorniNelMese = new Date(anno, mese + 1, 0).getDate()
  var celle = []
  for (var i = 0; i < primoGiorno; i++) celle.push(null)
  for (var g = 1; g <= giorniNelMese; g++) celle.push(g)

  function sessioniDelGiorno(giorno) {
    var dataStr = anno + '-' + String(mese + 1).padStart(2, '0') + '-' + String(giorno).padStart(2, '0')
    return sessioni.filter(function(s) { return s.data === dataStr })
  }

  function isOggi(giorno) {
    return anno === oggi.getFullYear() && mese === oggi.getMonth() && giorno === oggi.getDate()
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ChefHat size={24} className="text-orange-700" />Cooking Class
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Calendario sessioni cooking class e orto</p>
        </div>
        <button onClick={function() { setSessioneInModifica(null); setDataPreselezionata(''); setShowModaleSessione(true) }}
          className="inline-flex items-center gap-2 bg-orange-700 text-white px-4 py-2.5 rounded-xl hover:bg-orange-800 transition-colors font-medium shadow-sm text-sm">
          <Plus size={16} />Nuova Sessione
        </button>
      </div>

      {/* Navigazione mese */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={mesePrecedente} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-gray-900">{nomeMese(anno, mese)}</h2>
        <button onClick={meseSuccessivo} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Calendario */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        {/* Intestazione giorni */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {['Dom','Lun','Mar','Mer','Gio','Ven','Sab'].map(function(g) {
            return (
              <div key={g} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase">{g}</div>
            )
          })}
        </div>

        {/* Griglia giorni */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Caricamento...</div>
        ) : (
          <div className="grid grid-cols-7">
            {celle.map(function(giorno, idx) {
              if (!giorno) return <div key={'vuoto-' + idx} className="min-h-16 border-b border-r border-gray-50" />
              var sessioniGiorno = sessioniDelGiorno(giorno)
              var oggiFlag = isOggi(giorno)
              return (
                <div key={giorno}
                  className={"min-h-16 border-b border-r border-gray-100 p-1.5 cursor-pointer hover:bg-orange-50 transition-colors " + (oggiFlag ? 'bg-orange-50' : '')}
                  onClick={function() {
                    var d = anno + '-' + String(mese + 1).padStart(2, '0') + '-' + String(giorno).padStart(2, '0')
                    setDataPreselezionata(d)
                    setSessioneInModifica(null)
                    setShowModaleSessione(true)
                  }}>
                  <div className={"text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full " + (oggiFlag ? 'bg-orange-700 text-white' : 'text-gray-700')}>
                    {giorno}
                  </div>
                  {sessioniGiorno.map(function(s) {
                    var totPers = (s.cooking_class_prenotazioni || []).reduce(function(acc, p) { return acc + (p.num_persone || 0) }, 0)
                    var hasEng = (s.cooking_class_prenotazioni || []).some(function(p) { return p.lingua === 'ENG' }) || s.lingua === 'ENG' || s.lingua === 'MISTO'
                    return (
                      <div key={s.id}
                        onClick={function(e) { e.stopPropagation(); setSessioneSelezionata(s) }}
                        className="mb-1 px-1.5 py-1 rounded-md bg-orange-100 hover:bg-orange-200 transition-colors cursor-pointer">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-semibold text-orange-800">{s.orario.substring(0,5)}</span>
                          {hasEng && <span className="text-xs">🇬🇧</span>}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-orange-600">
                          <Users size={10} />
                          <span>{totPers} pers.</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Lista sessioni del mese */}
      {!loading && sessioni.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">{sessioni.length === 1 ? '1 sessione' : sessioni.length + ' sessioni'} nel mese</p>
          </div>
          <div className="divide-y divide-gray-100">
            {sessioni.map(function(s) {
              var totPers = (s.cooking_class_prenotazioni || []).reduce(function(acc, p) { return acc + (p.num_persone || 0) }, 0)
              var nGruppi = (s.cooking_class_prenotazioni || []).length
              var hasEng = (s.cooking_class_prenotazioni || []).some(function(p) { return p.lingua === 'ENG' }) || s.lingua === 'ENG' || s.lingua === 'MISTO'
              return (
                <button key={s.id} onClick={function() { setSessioneSelezionata(s) }}
                  className="w-full text-left px-5 py-3.5 hover:bg-gray-50 transition-colors flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-12">
                      <p className="text-xs text-gray-400 font-medium">{nomeGiornoBreve(new Date(s.data).getDay())}</p>
                      <p className="text-lg font-bold text-gray-900">{parseInt(s.data.split('-')[2])}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{s.orario.substring(0,5)}</span>
                        {hasEng && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">🇬🇧 ENG</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {nGruppi === 0 ? 'Nessuna prenotazione' : nGruppi + (nGruppi === 1 ? ' gruppo' : ' gruppi') + ' · ' + totPers + ' partecipanti'}
                        {s.max_partecipanti ? ' / max ' + s.max_partecipanti : ''}
                      </p>
                      {s.note && <p className="text-xs text-gray-400 italic mt-0.5">{s.note}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(s.cooking_class_prenotazioni || []).map(function(p) {
                      return (
                        <span key={p.id} className="w-6 h-6 rounded-full bg-orange-200 flex items-center justify-center text-xs font-bold text-orange-800">
                          {p.num_persone}
                        </span>
                      )
                    })}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!loading && sessioni.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <ChefHat size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nessuna sessione questo mese.</p>
          <p className="text-xs mt-1">Clicca su un giorno nel calendario per aggiungerne una.</p>
        </div>
      )}

      {/* Modali */}
      {showModaleSessione && (
        <ModaleSessione
          sessione={sessioneInModifica}
          dataPreselezionata={dataPreselezionata}
          onSave={handleSaveSessione}
          onClose={function() { setShowModaleSessione(false); setSessioneInModifica(null) }}
        />
      )}

      {sessioneSelezionata && (
        <DettaglioSessione
          sessione={sessioneSelezionata}
          onClose={function() { setSessioneSelezionata(null) }}
          onModificaSessione={function(s) {
            setSessioneSelezionata(null)
            setSessioneInModifica(s)
            setShowModaleSessione(true)
          }}
          onEliminaSessione={handleEliminaSessione}
        />
      )}

      {confermaElimina && (
        <ModaleConferma
          testo={'Eliminare la sessione del ' + formatData(confermaElimina.data) + ' alle ' + confermaElimina.orario + '? Verranno eliminate anche le prenotazioni collegate.'}
          onConferma={eseguiEliminaSessione}
          onAnnulla={function() { setConfermaElimina(null) }}
        />
      )}
    </div>
  )
}
