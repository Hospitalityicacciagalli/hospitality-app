import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, FEATURES, defaultPermissionsForRole } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

// ============================================================
// PROFILI DI PERMESSI
//
// Tre cose che prima non si potevano fare:
//   1. VEDERE i profili salvati, e cosa danno davvero.
//   2. RINOMINARLI e CANCELLARLI (regola 48: chi sa creare deve
//      sapere anche togliere; prima si potevano solo creare, e un
//      nome sbagliato restava li' per sempre).
//   3. APPLICARLI A PIU' PERSONE in un gesto solo, e DISAPPLICARLI.
//
// ⚠️ NIENTE SI SCRIVE SENZA UN'ANTEPRIMA. Prima di salvare, la
// pagina mostra riga per riga cosa cambia per ciascuna persona: chi
// non cambia lo dice, e chi cambia dice da cosa a cosa. Cinque
// persone confermate senza guardarle sono la stessa cosa di cento
// proposte accettate senza guardarne nessuna.
//
// COSA VUOL DIRE DISAPPLICARE (decisione E4)
// Disapplicare NON rimette i permessi che la persona aveva prima:
// per farlo servirebbe un posto dove conservarli, e un annullamento
// che vale una volta sola e' peggio di nessun annullamento perche'
// ci si conta sopra. Disapplicare AZZERA il jsonb: la persona torna
// al default del proprio ruolo. E' una pulizia dichiarata, non un
// passo indietro, e la pagina lo scrive dove si preme il pulsante.
// ============================================================

// Etichetta leggibile di un livello.
function nomeLivello(l) {
  if (l === 'write') return 'Scrittura'
  if (l === 'read') return 'Lettura'
  return 'Nessuno'
}

// Etichetta di una funzione, dal registro unico.
function nomeFeature(key) {
  for (var i = 0; i < FEATURES.length; i++) {
    if (FEATURES[i].key === key) return FEATURES[i].label
  }
  return key
}

// Nome da mostrare per un utente.
function nomeUtente(u) {
  if (u.display_name) return u.display_name
  return (u.first_name || '') + ' ' + (u.last_name || '')
}

// Permessi con cui una persona vive OGGI: il suo jsonb se c'e',
// altrimenti il default del ruolo (regola: il ruolo resta il ripiego).
function permessiAttuali(u) {
  if (u.permissions && typeof u.permissions === 'object') return u.permissions
  return defaultPermissionsForRole(u.role)
}

// Normalizza un insieme di permessi su TUTTE le funzioni note.
// Una chiave che il profilo non nomina vale 'Nessuno': e' cosi' che
// un profilo vecchio, salvato quando le funzioni erano meno, spegne
// in silenzio quelle nate dopo. L'anteprima lo rende visibile.
function normalizza(src) {
  var out = {}
  var s = src || {}
  FEATURES.forEach(function(f) {
    out[f.key] = s[f.key] || 'none'
  })
  return out
}

// Le differenze fra due insiemi di permessi, come elenco leggibile.
function differenze(prima, dopo) {
  var righe = []
  FEATURES.forEach(function(f) {
    var a = prima[f.key] || 'none'
    var b = dopo[f.key] || 'none'
    if (a !== b) {
      righe.push({ key: f.key, label: f.label, da: a, a: b })
    }
  })
  return righe
}

function ProfiliPermessiPage() {
  var navigate = useNavigate()
  var { canView } = useAuth()

  var [profili, setProfili] = useState([])
  var [utenti, setUtenti] = useState([])
  var [loading, setLoading] = useState(true)
  var [errore, setErrore] = useState('')
  var [messaggio, setMessaggio] = useState('')

  // Profilo aperto per vedere cosa contiene.
  var [apertoId, setApertoId] = useState('')

  // Rinomina
  var [rinominaId, setRinominaId] = useState('')
  var [rinominaNome, setRinominaNome] = useState('')

  // Cancellazione: chiede conferma, non cancella al primo tocco.
  var [cancellaId, setCancellaId] = useState('')

  // Applicazione in blocco
  var [applicaProfiloId, setApplicaProfiloId] = useState('')
  var [scelti, setScelti] = useState({})
  var [anteprima, setAnteprima] = useState(null)
  var [salvando, setSalvando] = useState(false)

  // Disapplicazione (azzeramento)
  var [azzeraScelti, setAzzeraScelti] = useState({})
  var [anteprimaAzzera, setAnteprimaAzzera] = useState(null)

  function carica() {
    setLoading(true)
    setErrore('')
    supabase.from('permission_profiles')
      .select('id, name, permissions')
      .order('name', { ascending: true })
      .then(function(rp) {
        if (rp.error) {
          setErrore('Errore nel caricamento dei profili: ' + rp.error.message)
          setLoading(false)
          return
        }
        setProfili(rp.data || [])
        supabase.from('user_profiles')
          .select('id, first_name, last_name, display_name, role, is_active, permissions')
          .order('last_name', { ascending: true })
          .then(function(ru) {
            setLoading(false)
            if (ru.error) {
              setErrore('Errore nel caricamento degli utenti: ' + ru.error.message)
              return
            }
            setUtenti(ru.data || [])
          })
      })
  }

  useEffect(function() { carica() }, [])

  function profiloPerId(id) {
    for (var i = 0; i < profili.length; i++) {
      if (profili[i].id === id) return profili[i]
    }
    return null
  }

  // --- Rinomina -------------------------------------------------
  function avviaRinomina(p) {
    setMessaggio('')
    setErrore('')
    setRinominaId(p.id)
    setRinominaNome(p.name)
  }

  function salvaRinomina() {
    var nome = (rinominaNome || '').trim()
    if (!nome) { setErrore('Il nome non puo\' essere vuoto.'); return }
    setErrore('')
    supabase.from('permission_profiles')
      .update({ name: nome })
      .eq('id', rinominaId)
      .then(function(r) {
        if (r.error) { setErrore('Errore: ' + r.error.message); return }
        setRinominaId('')
        setMessaggio('Profilo rinominato.')
        carica()
      })
  }

  // --- Cancellazione --------------------------------------------
  function confermaCancella() {
    var p = profiloPerId(cancellaId)
    supabase.from('permission_profiles')
      .delete()
      .eq('id', cancellaId)
      .then(function(r) {
        setCancellaId('')
        if (r.error) { setErrore('Errore: ' + r.error.message); return }
        setMessaggio('Profilo "' + (p ? p.name : '') + '" cancellato. Le persone a cui era stato applicato non cambiano: i permessi erano stati copiati addosso a loro.')
        carica()
      })
  }

  // --- Applicazione in blocco -----------------------------------
  function spunta(id) {
    setAnteprima(null)
    setScelti(function(prev) {
      var next = {}
      for (var k in prev) { next[k] = prev[k] }
      next[id] = !next[id]
      return next
    })
  }

  function elencoScelti(mappa) {
    var out = []
    utenti.forEach(function(u) {
      if (mappa[u.id]) out.push(u)
    })
    return out
  }

  // Costruisce l'anteprima: per ogni persona scelta, cosa cambia.
  // Non scrive niente: prepara solo quello che si vedra'.
  function preparaAnteprima() {
    setErrore('')
    setMessaggio('')
    var p = profiloPerId(applicaProfiloId)
    if (!p) { setErrore('Scegli prima un profilo.'); return }
    var persone = elencoScelti(scelti)
    if (persone.length === 0) { setErrore('Scegli almeno una persona.'); return }
    var dopo = normalizza(p.permissions)
    var righe = persone.map(function(u) {
      var prima = normalizza(permessiAttuali(u))
      return {
        id: u.id,
        nome: nomeUtente(u),
        senzaJsonb: !(u.permissions && typeof u.permissions === 'object'),
        cambi: differenze(prima, dopo)
      }
    })
    setAnteprima({ profilo: p.name, permessi: dopo, righe: righe })
  }

  // Scrive davvero. Una persona alla volta, e si ferma al primo errore
  // dicendo quante ne aveva gia' fatte: un'operazione a meta' dichiarata
  // e' meglio di un'operazione a meta' silenziosa.
  function confermaApplica() {
    if (!anteprima) return
    setSalvando(true)
    setErrore('')
    var ids = anteprima.righe.map(function(r) { return r.id })
    var permessi = anteprima.permessi
    var fatti = 0

    function passo(i) {
      if (i >= ids.length) {
        setSalvando(false)
        setAnteprima(null)
        setScelti({})
        setMessaggio('Profilo "' + anteprima.profilo + '" applicato a ' + fatti + (fatti === 1 ? ' persona.' : ' persone.'))
        carica()
        return
      }
      supabase.from('user_profiles')
        .update({ permissions: permessi })
        .eq('id', ids[i])
        .then(function(r) {
          if (r.error) {
            setSalvando(false)
            setErrore('Errore dopo ' + fatti + ' persone su ' + ids.length + ': ' + r.error.message)
            carica()
            return
          }
          fatti = fatti + 1
          passo(i + 1)
        })
    }
    passo(0)
  }

  // --- Disapplicazione (azzeramento) ----------------------------
  function spuntaAzzera(id) {
    setAnteprimaAzzera(null)
    setAzzeraScelti(function(prev) {
      var next = {}
      for (var k in prev) { next[k] = prev[k] }
      next[id] = !next[id]
      return next
    })
  }

  function preparaAnteprimaAzzera() {
    setErrore('')
    setMessaggio('')
    var persone = elencoScelti(azzeraScelti)
    if (persone.length === 0) { setErrore('Scegli almeno una persona.'); return }
    var righe = persone.map(function(u) {
      var prima = normalizza(permessiAttuali(u))
      var dopo = normalizza(defaultPermissionsForRole(u.role))
      return {
        id: u.id,
        nome: nomeUtente(u),
        ruolo: u.role,
        senzaJsonb: !(u.permissions && typeof u.permissions === 'object'),
        cambi: differenze(prima, dopo)
      }
    })
    setAnteprimaAzzera({ righe: righe })
  }

  function confermaAzzera() {
    if (!anteprimaAzzera) return
    setSalvando(true)
    setErrore('')
    var ids = anteprimaAzzera.righe.map(function(r) { return r.id })
    var fatti = 0

    function passo(i) {
      if (i >= ids.length) {
        setSalvando(false)
        setAnteprimaAzzera(null)
        setAzzeraScelti({})
        setMessaggio('Azzerate ' + fatti + (fatti === 1 ? ' persona: torna' : ' persone: tornano') + ' al default del proprio ruolo.')
        carica()
        return
      }
      supabase.from('user_profiles')
        .update({ permissions: null })
        .eq('id', ids[i])
        .then(function(r) {
          if (r.error) {
            setSalvando(false)
            setErrore('Errore dopo ' + fatti + ' persone su ' + ids.length + ': ' + r.error.message)
            carica()
            return
          }
          fatti = fatti + 1
          passo(i + 1)
        })
    }
    passo(0)
  }

  if (!canView('utenti')) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          Accesso negato. Questa pagina e riservata a chi gestisce gli utenti.
        </div>
      </div>
    )
  }

  var profiloScelto = profiloPerId(applicaProfiloId)
  var quantiScelti = elencoScelti(scelti).length
  var quantiAzzera = elencoScelti(azzeraScelti).length

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">

      <div className="mb-6">
        <button type="button" onClick={function() { navigate('/utenti') }}
          className="text-sm text-wine-700 hover:text-wine-900 mb-2">
          &#8592; Torna a Utenti App
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Profili di permessi</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configurazioni salvate, da applicare a piu persone in un gesto solo.
          Prima di scrivere qualsiasi cosa, la pagina ti mostra cosa cambia per ciascuno.
        </p>
      </div>

      {errore !== '' && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{errore}</div>
      )}
      {messaggio !== '' && (
        <div className="mb-5 bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">{messaggio}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Caricamento...</div>
      ) : (
        <div className="space-y-6">

          {/* ---------- I profili salvati ---------- */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-1">I profili salvati</h2>
            <p className="text-xs text-gray-500 mb-4">
              Si creano da Utenti App, dalla matrice di una persona. Qui si guardano, si rinominano e si cancellano.
            </p>

            {profili.length === 0 && (
              <p className="text-sm text-gray-400 py-3">
                Nessun profilo salvato. Se ne crea uno aprendo i permessi di una persona,
                sistemando la matrice e usando "Salva questa configurazione come nuovo profilo-tipo".
              </p>
            )}

            <div className="space-y-2">
              {profili.map(function(p) {
                var perm = normalizza(p.permissions)
                var quanteConcesse = 0
                FEATURES.forEach(function(f) { if (perm[f.key] !== 'none') quanteConcesse = quanteConcesse + 1 })
                var aperto = apertoId === p.id

                return (
                  <div key={p.id} className="border border-gray-200 rounded-lg">

                    {rinominaId === p.id ? (
                      <div className="p-3 flex items-center gap-2">
                        <input type="text" value={rinominaNome}
                          onChange={function(e) { setRinominaNome(e.target.value) }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wine-500" />
                        <button type="button" onClick={salvaRinomina}
                          className="px-3 py-2 bg-wine-700 text-white rounded-lg text-sm hover:bg-wine-800">Salva</button>
                        <button type="button" onClick={function() { setRinominaId('') }}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annulla</button>
                      </div>
                    ) : (
                      <div className="p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{p.name}</p>
                          <p className="text-xs text-gray-500">
                            {quanteConcesse} funzioni concesse su {FEATURES.length}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button type="button" onClick={function() { setApertoId(aperto ? '' : p.id) }}
                            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">
                            {aperto ? 'Nascondi' : 'Vedi'}
                          </button>
                          <button type="button" onClick={function() { avviaRinomina(p) }}
                            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">
                            Rinomina
                          </button>
                          <button type="button" onClick={function() { setCancellaId(p.id) }}
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50">
                            Cancella
                          </button>
                        </div>
                      </div>
                    )}

                    {aperto && (
                      <div className="border-t border-gray-100 px-3 py-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                          {FEATURES.map(function(f) {
                            var l = perm[f.key]
                            return (
                              <div key={f.key} className="flex items-center justify-between text-xs py-0.5">
                                <span className={l === 'none' ? 'text-gray-400' : 'text-gray-800'}>{f.label}</span>
                                <span className={
                                  l === 'write' ? 'text-wine-700 font-medium'
                                    : (l === 'read' ? 'text-gray-600' : 'text-gray-300')
                                }>{nomeLivello(l)}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                  </div>
                )
              })}
            </div>
          </div>

          {/* ---------- Applica a piu persone ---------- */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Applica un profilo a piu persone</h2>
            <p className="text-xs text-gray-500 mb-4">
              Prima il profilo, poi le persone. Niente viene scritto finche non hai guardato l anteprima.
            </p>

            <p className="text-xs font-medium text-gray-700 mb-1">1. Il profilo</p>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-4">
              {profili.length === 0 && (
                <div className="px-3 py-3 text-sm text-gray-400">Nessun profilo salvato.</div>
              )}
              {profili.map(function(p) {
                var attivo = applicaProfiloId === p.id
                return (
                  <button key={p.id} type="button"
                    onClick={function() { setApplicaProfiloId(p.id); setAnteprima(null) }}
                    className={'w-full text-left px-3 py-2.5 text-sm flex items-center justify-between ' +
                      (attivo ? 'bg-wine-700 text-white font-medium' : 'bg-white text-gray-800 hover:bg-gray-50')}>
                    <span>{p.name}</span>
                    {attivo && <span className="text-base">&#10003;</span>}
                  </button>
                )
              })}
            </div>

            <p className="text-xs font-medium text-gray-700 mb-1">2. Le persone</p>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-4">
              {utenti.map(function(u) {
                var attivo = scelti[u.id] === true
                return (
                  <button key={u.id} type="button"
                    onClick={function() { spunta(u.id) }}
                    className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-50">
                    <span className={'w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 text-xs ' +
                      (attivo ? 'bg-wine-700 border-wine-700 text-white' : 'border-gray-300')}>
                      {attivo ? '\u2713' : ''}
                    </span>
                    <span className="text-gray-800">{nomeUtente(u)}</span>
                    {u.is_active === false && <span className="text-xs text-red-600">(bloccato)</span>}
                  </button>
                )
              })}
            </div>

            <button type="button" onClick={preparaAnteprima} disabled={salvando}
              className="w-full bg-white border border-wine-300 text-wine-700 px-4 py-3 rounded-xl hover:bg-wine-50 font-medium disabled:opacity-50">
              Vedi cosa cambia {quantiScelti > 0 ? '(' + quantiScelti + ')' : ''}
            </button>
          </div>

          {/* ---------- Disapplica ---------- */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Disapplica</h2>
            <p className="text-xs text-gray-500 mb-1">
              Cancella i permessi personali di una o piu persone: da quel momento vivono sul
              default del loro ruolo.
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              Attenzione: questo <strong>non</strong> rimette i permessi che avevano prima di
              ricevere un profilo. Azzera, e basta. Anche qui, prima si guarda cosa cambia.
            </p>

            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-4">
              {utenti.map(function(u) {
                var attivo = azzeraScelti[u.id] === true
                var haJsonb = u.permissions && typeof u.permissions === 'object'
                return (
                  <button key={u.id} type="button"
                    onClick={function() { spuntaAzzera(u.id) }}
                    className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-50">
                    <span className={'w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 text-xs ' +
                      (attivo ? 'bg-wine-700 border-wine-700 text-white' : 'border-gray-300')}>
                      {attivo ? '\u2713' : ''}
                    </span>
                    <span className="text-gray-800">{nomeUtente(u)}</span>
                    {!haJsonb && <span className="text-xs text-gray-400">(gia sul default del ruolo)</span>}
                  </button>
                )
              })}
            </div>

            <button type="button" onClick={preparaAnteprimaAzzera} disabled={salvando}
              className="w-full bg-white border border-amber-300 text-amber-800 px-4 py-3 rounded-xl hover:bg-amber-50 font-medium disabled:opacity-50">
              Vedi cosa cambia {quantiAzzera > 0 ? '(' + quantiAzzera + ')' : ''}
            </button>
          </div>

        </div>
      )}

      {/* ---------- CONFERMA CANCELLAZIONE PROFILO ---------- */}
      {cancellaId !== '' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Cancellare il profilo?</h2>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-700 mb-4">
                Il profilo sparisce dall elenco. Le persone a cui era stato applicato
                <strong> non cambiano</strong>: i permessi erano stati copiati addosso a loro,
                non collegati al profilo.
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={function() { setCancellaId('') }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  Annulla
                </button>
                <button type="button" onClick={confermaCancella}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  Cancella
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- ANTEPRIMA APPLICAZIONE ---------- */}
      {anteprima !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Cosa cambia</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Profilo "{anteprima.profilo}" su {anteprima.righe.length} {anteprima.righe.length === 1 ? 'persona' : 'persone'}. Niente e stato ancora scritto.
              </p>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {anteprima.righe.map(function(r) {
                return (
                  <div key={r.id} className="border border-gray-200 rounded-lg p-3">
                    <p className="font-medium text-gray-900 text-sm">{r.nome}</p>
                    {r.senzaJsonb && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Oggi vive sul default del suo ruolo: il confronto parte da li.
                      </p>
                    )}
                    {r.cambi.length === 0 ? (
                      <p className="text-xs text-green-700 mt-1">Nessun cambiamento.</p>
                    ) : (
                      <div className="mt-2 space-y-0.5">
                        {r.cambi.map(function(c) {
                          return (
                            <p key={c.key} className="text-xs text-gray-700">
                              {c.label}: <span className="text-gray-400">{nomeLivello(c.da)}</span>
                              {' \u2192 '}
                              <span className="font-medium text-wine-700">{nomeLivello(c.a)}</span>
                            </p>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
              <button type="button" onClick={function() { setAnteprima(null) }} disabled={salvando}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Annulla
              </button>
              <button type="button" onClick={confermaApplica} disabled={salvando}
                className="flex-1 bg-wine-700 hover:bg-wine-800 disabled:bg-wine-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
                {salvando ? 'Scrivo...' : 'Conferma e scrivi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- ANTEPRIMA AZZERAMENTO ---------- */}
      {anteprimaAzzera !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Cosa cambia azzerando</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {anteprimaAzzera.righe.length} {anteprimaAzzera.righe.length === 1 ? 'persona' : 'persone'}. Niente e stato ancora scritto.
              </p>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {anteprimaAzzera.righe.map(function(r) {
                return (
                  <div key={r.id} className="border border-gray-200 rounded-lg p-3">
                    <p className="font-medium text-gray-900 text-sm">{r.nome}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Tornera al default del ruolo <strong>{r.ruolo}</strong>.
                      {r.senzaJsonb ? ' Ci vive gia: non cambia niente.' : ''}
                    </p>
                    {r.cambi.length === 0 ? (
                      <p className="text-xs text-green-700 mt-1">Nessun cambiamento.</p>
                    ) : (
                      <div className="mt-2 space-y-0.5">
                        {r.cambi.map(function(c) {
                          return (
                            <p key={c.key} className="text-xs text-gray-700">
                              {c.label}: <span className="text-gray-400">{nomeLivello(c.da)}</span>
                              {' \u2192 '}
                              <span className="font-medium text-amber-800">{nomeLivello(c.a)}</span>
                            </p>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
              <button type="button" onClick={function() { setAnteprimaAzzera(null) }} disabled={salvando}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Annulla
              </button>
              <button type="button" onClick={confermaAzzera} disabled={salvando}
                className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
                {salvando ? 'Scrivo...' : 'Conferma e azzera'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="h-8" />
    </div>
  )
}

export default ProfiliPermessiPage
