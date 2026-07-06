import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  ChevronLeft, ChevronRight, Save, Trash2, Check, CalendarDays,
  LayoutGrid, Layers, Play, Copy, Info, Utensils, Moon
} from 'lucide-react'

// ============================================================
// LimitiPage — Limiti coperti per giorno/fascia
//
// Tre blocchi:
//  A) Limite di DEFAULT  -> restaurant_settings.max_covers_lunch/dinner
//  B) Strada 1 (Mensile) -> griglia calendario, override per giorno+fascia
//                           su limiti_coperti (assenza riga = usa default)
//  C) Strada 2 (Massivo) -> dal/al + giorni settimana + fascia + limite,
//                           materializza in limiti_coperti; modelli salvabili
//                           su limiti_modelli (rilanciabili).
//
// Fascia usata: 'lunch'/'dinner' (coerente con reservations/event_dates).
// La LETTURA del limite altrove (vista giorno, form) usa la funzione DB
// limite_effettivo(data, fascia) — aggancio in uno step successivo.
// ============================================================

function pad(n) { return n < 10 ? '0' + n : '' + n }

function isoDate(y, m, d) { return y + '-' + pad(m) + '-' + pad(d) }

function isoFromDate(date) {
  return isoDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

// da 'YYYY-MM-DD' a Date locale (niente shift UTC)
function dateFromIso(iso) {
  var p = iso.split('-')
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10))
}

// ISO weekday: 1 = lunedi ... 7 = domenica
function isoDow(date) {
  var g = date.getDay() // 0=dom ... 6=sab
  return g === 0 ? 7 : g
}

var MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
]
var DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

var GIORNI_SETTIMANA = [
  { iso: 1, label: 'Lun' },
  { iso: 2, label: 'Mar' },
  { iso: 3, label: 'Mer' },
  { iso: 4, label: 'Gio' },
  { iso: 5, label: 'Ven' },
  { iso: 6, label: 'Sab' },
  { iso: 7, label: 'Dom' }
]

function LimitiPage() {
  var auth = useAuth()
  var canView = auth.canView
  var canEdit = auth.canEdit
  var user = auth.user
  var profile = auth.profile
  var elevato = auth.elevato
  var elevazione = auth.elevazione

  var puoModificare = canEdit('limiti')

  // firma "autore efficace": elevazione se attiva, altrimenti utente loggato
  function autoreEffettivo() {
    if (elevato && elevazione) {
      return { id: elevazione.user_id || null, nome: elevazione.nome || null }
    }
    var nome = profile ? (profile.display_name || (profile.first_name + ' ' + profile.last_name)) : null
    return { id: user ? user.id : null, nome: nome }
  }

  var [tab, setTab] = useState('mensile')

  // ---- Limite di default (restaurant_settings) ----
  var [settingsId, setSettingsId] = useState(null)
  var [defLunch, setDefLunch] = useState('')
  var [defDinner, setDefDinner] = useState('')
  var [defLoading, setDefLoading] = useState(true)
  var [defSaving, setDefSaving] = useState(false)
  var [defMsg, setDefMsg] = useState(null)

  // ---- Griglia mensile ----
  var now = new Date()
  var [anno, setAnno] = useState(now.getFullYear())
  var [mese, setMese] = useState(now.getMonth()) // 0-based
  var [overrides, setOverrides] = useState({})   // key 'YYYY-MM-DD|lunch' -> limite
  var [edits, setEdits] = useState({})           // key -> stringa (valore nel campo)
  var [gridLoading, setGridLoading] = useState(true)
  var [gridSaving, setGridSaving] = useState(false)

  // ---- Massivo + modelli ----
  var [mNome, setMNome] = useState('')
  var [mDal, setMDal] = useState(isoFromDate(now))
  var [mAl, setMAl] = useState(isoFromDate(now))
  var [mGiorni, setMGiorni] = useState([])       // array iso 1..7
  var [mPranzo, setMPranzo] = useState(true)
  var [mCena, setMCena] = useState(false)
  var [mLimite, setMLimite] = useState('')
  var [modelli, setModelli] = useState([])
  var [massMsg, setMassMsg] = useState(null)
  var [massBusy, setMassBusy] = useState(false)

  useEffect(function() {
    caricaDefault()
    caricaModelli()
  }, [])

  useEffect(function() {
    caricaMese()
  }, [anno, mese])

  // ---------------- DEFAULT ----------------
  function caricaDefault() {
    setDefLoading(true)
    supabase.from('restaurant_settings')
      .select('id, max_covers_lunch, max_covers_dinner')
      .limit(1)
      .then(function(result) {
        setDefLoading(false)
        if (result.error) { setDefMsg({ tipo: 'err', testo: 'Errore nel caricamento del default.' }); return }
        var rows = result.data || []
        if (rows.length > 0) {
          setSettingsId(rows[0].id)
          setDefLunch(rows[0].max_covers_lunch == null ? '' : String(rows[0].max_covers_lunch))
          setDefDinner(rows[0].max_covers_dinner == null ? '' : String(rows[0].max_covers_dinner))
        }
      })
  }

  function salvaDefault() {
    setDefMsg(null)
    if (!settingsId) { setDefMsg({ tipo: 'err', testo: 'Impostazioni ristorante non trovate.' }); return }
    var l = parseInt(defLunch, 10)
    var d = parseInt(defDinner, 10)
    if (isNaN(l) || l < 0 || isNaN(d) || d < 0) {
      setDefMsg({ tipo: 'err', testo: 'Inserisci due numeri validi (0 o piu).' })
      return
    }
    setDefSaving(true)
    supabase.from('restaurant_settings')
      .update({ max_covers_lunch: l, max_covers_dinner: d })
      .eq('id', settingsId)
      .then(function(result) {
        setDefSaving(false)
        if (result.error) { setDefMsg({ tipo: 'err', testo: 'Errore nel salvataggio: ' + result.error.message }); return }
        setDefMsg({ tipo: 'ok', testo: 'Limite di default salvato.' })
      })
  }

  var numDefLunch = parseInt(defLunch, 10)
  var numDefDinner = parseInt(defDinner, 10)

  // ---------------- MENSILE ----------------
  function caricaMese() {
    setGridLoading(true)
    setEdits({})
    var primo = isoDate(anno, mese + 1, 1)
    var ultimoDate = new Date(anno, mese + 1, 0)
    var ultimo = isoDate(anno, mese + 1, ultimoDate.getDate())
    supabase.from('limiti_coperti')
      .select('data, fascia, limite')
      .gte('data', primo)
      .lte('data', ultimo)
      .then(function(result) {
        setGridLoading(false)
        if (result.error) { setOverrides({}); return }
        var mappa = {}
        var righe = result.data || []
        righe.forEach(function(r) {
          mappa[r.data + '|' + r.fascia] = r.limite
        })
        setOverrides(mappa)
      })
  }

  function cambiaMese(delta) {
    var m = mese + delta
    var a = anno
    if (m < 0) { m = 11; a = anno - 1 }
    else if (m > 11) { m = 0; a = anno + 1 }
    setMese(m)
    setAnno(a)
  }

  function vaiOggi() {
    var t = new Date()
    setMese(t.getMonth())
    setAnno(t.getFullYear())
  }

  // valore mostrato nel campo di una cella
  function valoreCampo(key) {
    if (Object.prototype.hasOwnProperty.call(edits, key)) return edits[key]
    if (Object.prototype.hasOwnProperty.call(overrides, key)) return String(overrides[key])
    return ''
  }

  // la cella ha un override attivo (per evidenziarla)
  function haOverride(key) {
    if (Object.prototype.hasOwnProperty.call(edits, key)) return edits[key] !== ''
    return Object.prototype.hasOwnProperty.call(overrides, key)
  }

  function setCampo(key, valore) {
    var v = valore.replace(/[^0-9]/g, '')
    setEdits(function(prev) {
      var u = {}; for (var k in prev) { u[k] = prev[k] }
      u[key] = v
      return u
    })
  }

  function azzeraCella(key) {
    // riporta la cella al default (svuota -> nessun override)
    setEdits(function(prev) {
      var u = {}; for (var k in prev) { u[k] = prev[k] }
      u[key] = ''
      return u
    })
  }

  function pendingKeys() {
    var out = []
    for (var key in edits) {
      var cur = edits[key]
      var saved = Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : undefined
      if (cur === '' || cur == null) {
        if (saved !== undefined) out.push(key)
      } else {
        var n = parseInt(cur, 10)
        if (!isNaN(n) && n !== saved) out.push(key)
      }
    }
    return out
  }

  function salvaMensile() {
    if (!puoModificare) return
    var keys = pendingKeys()
    if (keys.length === 0) return
    setGridSaving(true)

    var autore = autoreEffettivo()
    var upserts = []
    var delLunch = []
    var delDinner = []

    keys.forEach(function(key) {
      var parts = key.split('|')
      var data = parts[0]
      var fascia = parts[1]
      var cur = edits[key]
      if (cur === '' || cur == null) {
        if (fascia === 'lunch') delLunch.push(data)
        else delDinner.push(data)
      } else {
        upserts.push({
          data: data,
          fascia: fascia,
          limite: parseInt(cur, 10),
          creato_da: autore.id,
          creato_da_nome: autore.nome
        })
      }
    })

    var chain = Promise.resolve()
    if (upserts.length > 0) {
      chain = chain.then(function() {
        return supabase.from('limiti_coperti').upsert(upserts, { onConflict: 'data,fascia' })
      })
    }
    if (delLunch.length > 0) {
      chain = chain.then(function() {
        return supabase.from('limiti_coperti').delete().eq('fascia', 'lunch').in('data', delLunch)
      })
    }
    if (delDinner.length > 0) {
      chain = chain.then(function() {
        return supabase.from('limiti_coperti').delete().eq('fascia', 'dinner').in('data', delDinner)
      })
    }

    chain.then(function(result) {
      setGridSaving(false)
      if (result && result.error) { alert('Errore nel salvataggio: ' + result.error.message); return }
      caricaMese()
    })
  }

  function buildCalendarDays() {
    var firstOfMonth = new Date(anno, mese, 1)
    var lastOfMonth = new Date(anno, mese + 1, 0)
    var startDow = firstOfMonth.getDay()
    startDow = startDow === 0 ? 6 : startDow - 1
    var daysInMonth = lastOfMonth.getDate()
    var days = []
    for (var i = startDow - 1; i >= 0; i--) {
      var prev = new Date(anno, mese, -i)
      days.push({ date: prev, inMonth: false })
    }
    for (var d = 1; d <= daysInMonth; d++) {
      days.push({ date: new Date(anno, mese, d), inMonth: true })
    }
    var remaining = 7 - (days.length % 7)
    if (remaining < 7) {
      for (var j = 1; j <= remaining; j++) {
        days.push({ date: new Date(anno, mese + 1, j), inMonth: false })
      }
    }
    return days
  }

  var nPending = pendingKeys().length

  // ---------------- MASSIVO ----------------
  function caricaModelli() {
    supabase.from('limiti_modelli')
      .select('*')
      .order('created_at', { ascending: false })
      .then(function(result) {
        if (!result.error) setModelli(result.data || [])
      })
  }

  function toggleGiorno(iso) {
    setMGiorni(function(prev) {
      if (prev.indexOf(iso) !== -1) return prev.filter(function(x) { return x !== iso })
      return prev.concat([iso]).sort(function(a, b) { return a - b })
    })
  }

  function dateDelRange() {
    if (!mDal || !mAl) return []
    var d = dateFromIso(mDal)
    var fine = dateFromIso(mAl)
    if (d > fine) return []
    var out = []
    var guard = 0
    while (d <= fine && guard < 1000) {
      if (mGiorni.length === 0 || mGiorni.indexOf(isoDow(d)) !== -1) {
        out.push(isoFromDate(d))
      }
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      guard++
    }
    return out
  }

  function fasceSelezionate() {
    var f = []
    if (mPranzo) f.push('lunch')
    if (mCena) f.push('dinner')
    return f
  }

  var anteprimaDate = dateDelRange()
  var anteprimaFasce = fasceSelezionate()
  var anteprimaCelle = anteprimaDate.length * anteprimaFasce.length

  function validaMassivo() {
    if (!mDal || !mAl) return 'Indica le date "dal" e "al".'
    if (dateFromIso(mDal) > dateFromIso(mAl)) return 'La data "dal" deve precedere la data "al".'
    if (anteprimaFasce.length === 0) return 'Seleziona almeno una fascia (pranzo o cena).'
    var lim = parseInt(mLimite, 10)
    if (isNaN(lim) || lim < 0) return 'Indica un limite valido (0 o piu).'
    if (anteprimaDate.length === 0) return 'Nessun giorno rientra nella selezione.'
    return null
  }

  function applicaMassivo() {
    if (!puoModificare) return
    setMassMsg(null)
    var err = validaMassivo()
    if (err) { setMassMsg({ tipo: 'err', testo: err }); return }
    setMassBusy(true)

    var autore = autoreEffettivo()
    var lim = parseInt(mLimite, 10)
    var righe = []
    anteprimaDate.forEach(function(data) {
      anteprimaFasce.forEach(function(fascia) {
        righe.push({
          data: data,
          fascia: fascia,
          limite: lim,
          creato_da: autore.id,
          creato_da_nome: autore.nome
        })
      })
    })

    supabase.from('limiti_coperti').upsert(righe, { onConflict: 'data,fascia' })
      .then(function(result) {
        setMassBusy(false)
        if (result.error) { setMassMsg({ tipo: 'err', testo: 'Errore: ' + result.error.message }); return }
        setMassMsg({ tipo: 'ok', testo: 'Impostati ' + righe.length + ' giorni-fascia a ' + lim + ' coperti.' })
        caricaMese()
      })
  }

  function salvaModello() {
    if (!puoModificare) return
    setMassMsg(null)
    if (!mNome.trim()) { setMassMsg({ tipo: 'err', testo: 'Dai un nome al modello per salvarlo.' }); return }
    var err = validaMassivo()
    if (err) { setMassMsg({ tipo: 'err', testo: err }); return }
    setMassBusy(true)

    var autore = autoreEffettivo()
    supabase.from('limiti_modelli').insert({
      nome: mNome.trim(),
      data_da: mDal,
      data_a: mAl,
      giorni: mGiorni,
      fascia_pranzo: mPranzo,
      fascia_cena: mCena,
      limite: parseInt(mLimite, 10),
      creato_da: autore.id,
      creato_da_nome: autore.nome
    }).select().then(function(result) {
      setMassBusy(false)
      if (result.error) { setMassMsg({ tipo: 'err', testo: 'Errore: ' + result.error.message }); return }
      setMassMsg({ tipo: 'ok', testo: 'Modello salvato.' })
      caricaModelli()
    })
  }

  function caricaModelloNelForm(m) {
    setMNome(m.nome || '')
    setMDal(m.data_da)
    setMAl(m.data_a)
    setMGiorni(m.giorni || [])
    setMPranzo(!!m.fascia_pranzo)
    setMCena(!!m.fascia_cena)
    setMLimite(m.limite == null ? '' : String(m.limite))
    setMassMsg({ tipo: 'ok', testo: 'Modello caricato nel form: modificalo e applicalo.' })
  }

  function applicaModelloDiretto(m) {
    if (!puoModificare) return
    setMassBusy(true)
    setMassMsg(null)
    var autore = autoreEffettivo()

    var d = dateFromIso(m.data_da)
    var fine = dateFromIso(m.data_a)
    var giorni = m.giorni || []
    var fasce = []
    if (m.fascia_pranzo) fasce.push('lunch')
    if (m.fascia_cena) fasce.push('dinner')

    var righe = []
    var guard = 0
    while (d <= fine && guard < 1000) {
      if (giorni.length === 0 || giorni.indexOf(isoDow(d)) !== -1) {
        var iso = isoFromDate(d)
        fasce.forEach(function(fascia) {
          righe.push({ data: iso, fascia: fascia, limite: m.limite, creato_da: autore.id, creato_da_nome: autore.nome })
        })
      }
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      guard++
    }

    if (righe.length === 0) { setMassBusy(false); setMassMsg({ tipo: 'err', testo: 'Il modello non produce alcun giorno-fascia.' }); return }

    supabase.from('limiti_coperti').upsert(righe, { onConflict: 'data,fascia' })
      .then(function(result) {
        setMassBusy(false)
        if (result.error) { setMassMsg({ tipo: 'err', testo: 'Errore: ' + result.error.message }); return }
        setMassMsg({ tipo: 'ok', testo: 'Modello "' + m.nome + '" applicato: ' + righe.length + ' giorni-fascia.' })
        caricaMese()
      })
  }

  function eliminaModello(id) {
    if (!puoModificare) return
    if (!confirm('Eliminare questo modello? I limiti gia impostati NON vengono toccati.')) return
    supabase.from('limiti_modelli').delete().eq('id', id)
      .then(function(result) {
        if (result.error) { alert('Errore: ' + result.error.message); return }
        caricaModelli()
      })
  }

  function etichettaModello(m) {
    var giorni = (m.giorni && m.giorni.length > 0)
      ? m.giorni.map(function(iso) { return GIORNI_SETTIMANA[iso - 1].label }).join(' ')
      : 'tutti i giorni'
    var fasce = []
    if (m.fascia_pranzo) fasce.push('Pranzo')
    if (m.fascia_cena) fasce.push('Cena')
    return giorni + ' \u00b7 ' + (fasce.join(' + ') || 'nessuna fascia') + ' \u00b7 ' + m.limite + ' coperti'
  }

  // ---------------- guardia permessi ----------------
  if (!canView('limiti')) {
    return (
      <div className="text-center py-16 text-gray-400">
        <LayoutGrid size={48} className="mx-auto mb-3 opacity-30" />
        <p>Non hai accesso alla gestione dei limiti coperti.</p>
      </div>
    )
  }

  var calendarDays = buildCalendarDays()

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">

      {/* Intestazione */}
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-wine-100 p-2 rounded-lg">
          <Utensils className="text-wine-700" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Limiti coperti</h1>
          <p className="text-sm text-gray-500">Massimo coperti accettati per giorno e fascia, prima che scatti la richiesta al direttore.</p>
        </div>
      </div>

      {!puoModificare && (
        <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Puoi consultare i limiti ma non modificarli.
        </div>
      )}

      {/* A) LIMITE DI DEFAULT */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Info className="text-wine-700" size={18} />
          <h2 className="font-semibold text-gray-800">Limite di default</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Valore usato per ogni giorno che non ha un limite specifico. E il tuo limite generale di sempre.
        </p>

        {defMsg && (
          <div className={'mb-3 p-3 rounded-lg text-sm border ' + (defMsg.tipo === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800')}>
            {defMsg.testo}
          </div>
        )}

        {defLoading ? (
          <div className="text-sm text-gray-400">Caricamento...</div>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1"><Utensils size={12} /> Pranzo</label>
              <input type="number" min="0" value={defLunch} disabled={!puoModificare}
                onChange={function(e) { setDefLunch(e.target.value.replace(/[^0-9]/g, '')); setDefMsg(null) }}
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1"><Moon size={12} /> Cena</label>
              <input type="number" min="0" value={defDinner} disabled={!puoModificare}
                onChange={function(e) { setDefDinner(e.target.value.replace(/[^0-9]/g, '')); setDefMsg(null) }}
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>
            {puoModificare && (
              <button onClick={salvaDefault} disabled={defSaving}
                className="flex items-center gap-2 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Save size={15} />
                {defSaving ? 'Salvataggio...' : 'Salva default'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* TAB */}
      <div className="flex gap-2 mb-4">
        <button onClick={function() { setTab('mensile') }}
          className={'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm border transition-colors ' + (tab === 'mensile' ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}>
          <LayoutGrid size={16} /> Mensile
        </button>
        <button onClick={function() { setTab('massivo') }}
          className={'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm border transition-colors ' + (tab === 'massivo' ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}>
          <Layers size={16} /> Massivo
        </button>
      </div>

      {/* ---------- TAB MENSILE ---------- */}
      {tab === 'mensile' && (
        <div>
          {/* Navigazione mese */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between">
              <button onClick={function() { cambiaMese(-1) }} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <ChevronLeft size={22} />
              </button>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{MONTH_NAMES[mese] + ' ' + anno}</p>
                <button onClick={vaiOggi} className="text-sm text-wine-600 hover:text-wine-800 mt-0.5">Vai a oggi</button>
              </div>
              <button onClick={function() { cambiaMese(1) }} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <ChevronRight size={22} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-3 text-xs text-gray-500 px-1 flex-wrap">
            <span className="flex items-center gap-1"><Utensils size={12} /> Pranzo</span>
            <span className="flex items-center gap-1"><Moon size={12} /> Cena</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-wine-100 border border-wine-400 inline-block"></span> limite specifico</span>
            <span>Campo vuoto = usa il default ({isNaN(numDefLunch) ? '—' : numDefLunch}/{isNaN(numDefDinner) ? '—' : numDefDinner}).</span>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-200">
              {DAY_NAMES.map(function(d) {
                return <div key={d} className="py-2 text-center text-xs font-medium text-gray-500 border-r border-gray-100 last:border-r-0">{d}</div>
              })}
            </div>

            {gridLoading ? (
              <div className="flex items-center justify-center h-48"><p className="text-gray-400 text-sm">Caricamento...</p></div>
            ) : (
              <div className="grid grid-cols-7">
                {calendarDays.map(function(dayObj, idx) {
                  var dd = dayObj.date
                  var dateStr = isoFromDate(dd)
                  var inMonth = dayObj.inMonth
                  var keyL = dateStr + '|lunch'
                  var keyD = dateStr + '|dinner'
                  return (
                    <div key={idx} className={'border-b border-r border-gray-100 p-1.5 min-h-[92px] ' + (inMonth ? '' : 'bg-gray-50 opacity-40')}>
                      <div className="text-xs font-semibold text-gray-700 mb-1">{dd.getDate()}</div>
                      {inMonth && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <Utensils size={11} className="text-gray-400 flex-shrink-0" />
                            <input type="number" min="0" inputMode="numeric"
                              value={valoreCampo(keyL)} disabled={!puoModificare}
                              onChange={function(e) { setCampo(keyL, e.target.value) }}
                              placeholder={isNaN(numDefLunch) ? '' : String(numDefLunch)}
                              className={'w-full px-1 py-1 rounded text-xs text-center border focus:outline-none focus:ring-1 focus:ring-wine-500 ' + (haOverride(keyL) ? 'border-wine-400 bg-wine-50 text-wine-800 font-semibold' : 'border-gray-200 text-gray-500')} />
                          </div>
                          <div className="flex items-center gap-1">
                            <Moon size={11} className="text-gray-400 flex-shrink-0" />
                            <input type="number" min="0" inputMode="numeric"
                              value={valoreCampo(keyD)} disabled={!puoModificare}
                              onChange={function(e) { setCampo(keyD, e.target.value) }}
                              placeholder={isNaN(numDefDinner) ? '' : String(numDefDinner)}
                              className={'w-full px-1 py-1 rounded text-xs text-center border focus:outline-none focus:ring-1 focus:ring-wine-500 ' + (haOverride(keyD) ? 'border-wine-400 bg-wine-50 text-wine-800 font-semibold' : 'border-gray-200 text-gray-500')} />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {puoModificare && (
            <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-4 px-4 py-3 mt-4 flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500">
                {nPending === 0 ? 'Nessuna modifica da salvare' : (nPending === 1 ? '1 modifica da salvare' : nPending + ' modifiche da salvare')}
              </span>
              <button onClick={salvaMensile} disabled={gridSaving || nPending === 0}
                className="flex items-center gap-2 bg-wine-700 text-white px-5 py-2.5 rounded-lg hover:bg-wine-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                <Save size={16} />
                {gridSaving ? 'Salvataggio...' : 'Salva modifiche'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------- TAB MASSIVO ---------- */}
      {tab === 'massivo' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Imposta in blocco</h2>

            {massMsg && (
              <div className={'mb-4 p-3 rounded-lg text-sm border ' + (massMsg.tipo === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800')}>
                {massMsg.testo}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Dal</label>
                <input type="date" value={mDal} disabled={!puoModificare}
                  onChange={function(e) { setMDal(e.target.value) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Al</label>
                <input type="date" value={mAl} disabled={!puoModificare}
                  onChange={function(e) { setMAl(e.target.value) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-2">Giorni della settimana <span className="text-gray-400 font-normal">(nessuno = tutti)</span></label>
              <div className="flex flex-wrap gap-2">
                {GIORNI_SETTIMANA.map(function(g) {
                  var sel = mGiorni.indexOf(g.iso) !== -1
                  return (
                    <button key={g.iso} type="button" disabled={!puoModificare}
                      onClick={function() { toggleGiorno(g.iso) }}
                      className={'px-3 py-2 rounded-lg text-sm font-medium border transition-colors ' + (sel ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}>
                      {g.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-2">Fasce</label>
              <div className="flex gap-2">
                <button type="button" disabled={!puoModificare} onClick={function() { setMPranzo(!mPranzo) }}
                  className={'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ' + (mPranzo ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}>
                  <Utensils size={14} /> Pranzo
                </button>
                <button type="button" disabled={!puoModificare} onClick={function() { setMCena(!mCena) }}
                  className={'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ' + (mCena ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}>
                  <Moon size={14} /> Cena
                </button>
              </div>
            </div>

            <div className="mb-4 max-w-xs">
              <label className="block text-xs font-medium text-gray-700 mb-1">Limite coperti</label>
              <input type="number" min="0" value={mLimite} disabled={!puoModificare}
                onChange={function(e) { setMLimite(e.target.value.replace(/[^0-9]/g, '')) }}
                placeholder="es. 55"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
            </div>

            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 mb-4">
              {anteprimaCelle > 0
                ? ('Verranno impostati ' + anteprimaCelle + ' giorni-fascia' + (mLimite !== '' ? ' a ' + mLimite + ' coperti' : '') + '.')
                : 'Completa i campi per vedere l\u2019anteprima.'}
            </div>

            {puoModificare && (
              <div className="flex flex-wrap gap-2">
                <button onClick={applicaMassivo} disabled={massBusy}
                  className="flex items-center gap-2 bg-wine-700 text-white px-5 py-2.5 rounded-lg hover:bg-wine-800 font-medium disabled:opacity-50">
                  <Play size={15} /> Applica ora
                </button>
                <div className="flex-1 flex flex-wrap items-center gap-2 justify-end">
                  <input type="text" value={mNome}
                    onChange={function(e) { setMNome(e.target.value) }}
                    placeholder="Nome per salvare come modello"
                    className="flex-1 min-w-[180px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                  <button onClick={salvaModello} disabled={massBusy}
                    className="flex items-center gap-2 border border-wine-300 text-wine-700 px-4 py-2.5 rounded-lg hover:bg-wine-50 font-medium text-sm disabled:opacity-50">
                    <Save size={15} /> Salva modello
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Modelli salvati */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-3">Modelli salvati</h2>
            {modelli.length === 0 ? (
              <p className="text-sm text-gray-400">Nessun modello salvato. Compila il blocco qui sopra e premi "Salva modello".</p>
            ) : (
              <div className="space-y-2">
                {modelli.map(function(m) {
                  return (
                    <div key={m.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{m.nome}</p>
                        <p className="text-xs text-gray-500 truncate">{dateFromIso(m.data_da).toLocaleDateString('it-IT') + ' \u2192 ' + dateFromIso(m.data_a).toLocaleDateString('it-IT') + ' \u00b7 ' + etichettaModello(m)}</p>
                      </div>
                      {puoModificare && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={function() { caricaModelloNelForm(m) }} title="Carica nel form"
                            className="flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">
                            <Copy size={13} /> Carica
                          </button>
                          <button onClick={function() { applicaModelloDiretto(m) }} disabled={massBusy} title="Applica subito"
                            className="flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-wine-200 text-wine-700 hover:bg-wine-50 disabled:opacity-50">
                            <Play size={13} /> Applica
                          </button>
                          <button onClick={function() { eliminaModello(m.id) }} title="Elimina"
                            className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="h-8" />
    </div>
  )
}

export default LimitiPage
