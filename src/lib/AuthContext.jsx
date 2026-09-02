import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

var AuthContext = createContext(null)

// ============================================================
// Elenco delle funzioni/menu' del sistema.
// type 'standard' = livelli none/read/write. E' l'UNICO tipo esistente:
//                   il vecchio type 'cassa' (none/light/full) non e' piu'
//                   usato da nessuna voce da quando il permesso cassa e'
//                   stato spezzato in reception e ristorante.
// loginReale true = ramo che il PIN NON puo' sbloccare: richiede
//                   il login vero (il database ricontrolla chi sei).
//                   Nella matrice permessi viene mostrato con un
//                   colore diverso.
// gruppo '<key>'  = raggruppa la voce sotto un'intestazione nella
//                   matrice permessi (vedi GRUPPI_FEATURE piu' sotto).
//                   E' SOLO estetico: il permesso resta sulla voce.
// Unica fonte di verita': importata anche da UserManagement.
//
// NOTA sui due rami CAMERE (Dashboard HotelInCloud):
//   hic_operativo — occupazione, ospiti, camere, anticipo.
//   hic_economico — fatturato lordo/netto, canali, consumi.
// La voce di menu' compare a chi ha almeno uno dei due. Le schede
// non concesse NON esistono: non compaiono spente o grigie.
// Sono dati in SOLA LETTURA, quindi 'read' basta per vedere tutto;
// il livello 'write' su hic_economico servira' per marcare a mano
// quali prenotazioni sono eventi (pannello in arrivo).
// ============================================================
export var FEATURES = [
  { key: 'prenotazioni',         label: 'Prenotazioni',         type: 'standard', gruppo: 'prenotazioni' },
  { key: 'importa_prenotazioni', label: 'Importa',              type: 'standard', gruppo: 'prenotazioni' },
  { key: 'limiti',               label: 'Limiti coperti',       type: 'standard', gruppo: 'prenotazioni' },
  { key: 'alert_prenotazioni',   label: 'Alert',                type: 'standard', gruppo: 'prenotazioni' },
  { key: 'hic_operativo',        label: 'Operativo',            type: 'standard', gruppo: 'camere' },
  { key: 'hic_economico',        label: 'Economico',            type: 'standard', gruppo: 'camere' },
  { key: 'clienti',              label: 'Clienti',              type: 'standard' },
  { key: 'sale',                 label: 'Sale e Tavoli',        type: 'standard' },
  { key: 'staff',                label: 'Staff',                type: 'standard' },
  { key: 'turni',                label: 'Turni',                type: 'standard' },
  { key: 'cassa_reception',      label: 'Cassa Reception',      type: 'standard', gruppo: 'cassa' },
  { key: 'cassa_ristorante',     label: 'Cassa Ristorante',     type: 'standard', gruppo: 'cassa' },
  { key: 'totali_cassa',         label: 'Totali sensibili',     type: 'standard', gruppo: 'cassa' },
  { key: 'cassaforte',           label: 'Cassaforte',           type: 'standard', gruppo: 'cassa' },
  { key: 'variabili_cassa',      label: 'Variabili',            type: 'standard', gruppo: 'cassa' },
  { key: 'centri_costo',         label: 'Centri di costo',      type: 'standard', gruppo: 'cassa' },
  { key: 'ordini_bordo',         label: 'Ordini',               type: 'standard', gruppo: 'bordo' },
  { key: 'listino_bordo',        label: 'Listino',              type: 'standard', gruppo: 'bordo' },
  { key: 'gift_card',            label: 'Gift Card',            type: 'standard', gruppo: 'esperienze' },
  { key: 'wine_tour',            label: 'Wine Tour',            type: 'standard', gruppo: 'esperienze' },
  { key: 'cooking_class',        label: 'Cooking Class',        type: 'standard', gruppo: 'esperienze' },
  { key: 'stipendi',             label: 'Stipendi',             type: 'standard' },
  { key: 'campagna_riepilogo',   label: 'Riepilogo',            type: 'standard', gruppo: 'campagna' },
  { key: 'campagna_importa',     label: 'Importa',              type: 'standard', gruppo: 'campagna' },
  { key: 'campagna_stipendi',    label: 'In stipendi',          type: 'standard', gruppo: 'campagna' },
  { key: 'impostazioni',         label: 'Impostazioni',         type: 'standard' },
  { key: 'utenti',               label: 'Utenti App',           type: 'standard', loginReale: true }
]

// ============================================================
// GRUPPI_FEATURE — raggruppamento VISIVO delle voci nella matrice
// permessi (UserManagement), per rispecchiare la struttura del menu'
// laterale (voce padre + rami). NON sono permessi: il permesso vero
// resta sulle voci figlie di FEATURES.
//
// LEGGE DEL PROGETTO: ogni menu' con piu' rami deve avere il suo
// gruppo qui e le sue voci figlie marcate con `gruppo: '<key>'` in
// FEATURES (con etichette corte, perche' l'intestazione mostra gia'
// il nome del gruppo). Le voci senza `gruppo` restano righe singole.
//
// Per aggiungere un gruppo (es. Cassa) bastano due mosse:
//   1) aggiungere qui: { key: 'cassa', label: 'Cassa', icon: '💰' }
//   2) mettere `gruppo: 'cassa'` sulle relative voci di FEATURES
//      (cassa, cassaforte, totali_cassa, variabili_cassa, centri_costo).
// Le voci di uno stesso gruppo conviene tenerle vicine in FEATURES.
// ============================================================
export var GRUPPI_FEATURE = [
  { key: 'prenotazioni', label: 'Prenotazioni',  icon: '📅' },
  { key: 'camere',       label: 'Camere',        icon: '🛏️' },
  { key: 'cassa',        label: 'Cassa',         icon: '💰' },
  { key: 'bordo',        label: 'Bordo piscina', icon: '🍹' },
  { key: 'esperienze',   label: 'Esperienze',    icon: '🎁' },
  { key: 'campagna',     label: 'Campagna',      icon: '🌾' }
]

// Rami che il PIN non puo' sbloccare (richiedono login reale).
// Per ora solo "utenti"; se in futuro se ne aggiungono, basta
// mettere loginReale:true nella riga di FEATURES qui sopra.
export function featureRichiedeLoginReale(feature) {
  for (var i = 0; i < FEATURES.length; i++) {
    if (FEATURES[i].key === feature) return FEATURES[i].loginReale === true
  }
  return false
}

// ============================================================
// Permessi predefiniti per ruolo.
// Deve coincidere con la migrazione SQL.
// Usato come fallback se un profilo non ha ancora il jsonb popolato.
// ============================================================
export var DEFAULT_PERMS_BY_ROLE = {
  super_admin: { prenotazioni: 'write', importa_prenotazioni: 'write', limiti: 'write', alert_prenotazioni: 'write', hic_operativo: 'write', hic_economico: 'write', clienti: 'write', sale: 'write', staff: 'write', turni: 'write', cassa_reception: 'write', cassa_ristorante: 'write', cassaforte: 'write', totali_cassa: 'write', variabili_cassa: 'write', centri_costo: 'write', ordini_bordo: 'write', listino_bordo: 'write', gift_card: 'write', wine_tour: 'write', cooking_class: 'write', stipendi: 'write', campagna_riepilogo: 'write', campagna_importa: 'write', campagna_stipendi: 'write', impostazioni: 'write', utenti: 'write' },
  proprieta:   { prenotazioni: 'write', importa_prenotazioni: 'none',  limiti: 'write', alert_prenotazioni: 'write', hic_operativo: 'write', hic_economico: 'write', clienti: 'write', sale: 'read',  staff: 'none',  turni: 'none',  cassa_reception: 'read', cassa_ristorante: 'read', cassaforte: 'write', totali_cassa: 'write', variabili_cassa: 'write', centri_costo: 'write', ordini_bordo: 'read',  listino_bordo: 'none',  gift_card: 'write', wine_tour: 'write', cooking_class: 'write', stipendi: 'write', campagna_riepilogo: 'write', campagna_importa: 'write', campagna_stipendi: 'write', impostazioni: 'none',  utenti: 'none' },
  direttore:   { prenotazioni: 'write', importa_prenotazioni: 'write', limiti: 'write', alert_prenotazioni: 'write', hic_operativo: 'write', hic_economico: 'write', clienti: 'write', sale: 'read',  staff: 'write', turni: 'write', cassa_reception: 'write', cassa_ristorante: 'write', cassaforte: 'write', totali_cassa: 'write', variabili_cassa: 'write', centri_costo: 'write', ordini_bordo: 'write', listino_bordo: 'write', gift_card: 'write', wine_tour: 'write', cooking_class: 'write', stipendi: 'none',  campagna_riepilogo: 'write', campagna_importa: 'write', campagna_stipendi: 'write', impostazioni: 'write', utenti: 'none' },
  reception:   { prenotazioni: 'write', importa_prenotazioni: 'none',  limiti: 'none', alert_prenotazioni: 'none',  hic_operativo: 'read',  hic_economico: 'none',  clienti: 'write', sale: 'read',  staff: 'read',  turni: 'none',  cassa_reception: 'write', cassa_ristorante: 'write', cassaforte: 'none',  totali_cassa: 'none', variabili_cassa: 'none', centri_costo: 'none', ordini_bordo: 'write', listino_bordo: 'write', gift_card: 'write', wine_tour: 'write', cooking_class: 'write', stipendi: 'none',  campagna_riepilogo: 'none', campagna_importa: 'none', campagna_stipendi: 'none', impostazioni: 'none',  utenti: 'none' },
  sala:        { prenotazioni: 'write', importa_prenotazioni: 'none',  limiti: 'none', alert_prenotazioni: 'none',  hic_operativo: 'none',  hic_economico: 'none',  clienti: 'write', sale: 'read',  staff: 'none',  turni: 'none',  cassa_reception: 'write', cassa_ristorante: 'write', cassaforte: 'none',  totali_cassa: 'none', variabili_cassa: 'none', centri_costo: 'none', ordini_bordo: 'write', listino_bordo: 'write', gift_card: 'read',  wine_tour: 'read',  cooking_class: 'read',  stipendi: 'none',  campagna_riepilogo: 'none', campagna_importa: 'none', campagna_stipendi: 'none', impostazioni: 'none',  utenti: 'none' },
  cucina:      { prenotazioni: 'read',  importa_prenotazioni: 'none',  limiti: 'none', alert_prenotazioni: 'none',  hic_operativo: 'none',  hic_economico: 'none',  clienti: 'read',  sale: 'none',  staff: 'none',  turni: 'none',  cassa_reception: 'none', cassa_ristorante: 'none', cassaforte: 'none',  totali_cassa: 'none', variabili_cassa: 'none', centri_costo: 'none', ordini_bordo: 'none',  listino_bordo: 'none',  gift_card: 'none',  wine_tour: 'none',  cooking_class: 'none',  stipendi: 'none',  campagna_riepilogo: 'none', campagna_importa: 'none', campagna_stipendi: 'none', impostazioni: 'none',  utenti: 'none' }
}

// Pavimento di sicurezza per ruoli non previsti.
var BASE_FALLBACK = { prenotazioni: 'write', importa_prenotazioni: 'none', limiti: 'none', alert_prenotazioni: 'none', hic_operativo: 'none', hic_economico: 'none', clienti: 'write', sale: 'none', staff: 'none', turni: 'none', cassa_reception: 'none', cassa_ristorante: 'none', cassaforte: 'none', totali_cassa: 'none', variabili_cassa: 'none', centri_costo: 'none', ordini_bordo: 'none', listino_bordo: 'none', gift_card: 'none', wine_tour: 'none', cooking_class: 'none', stipendi: 'none', campagna_riepilogo: 'none', campagna_importa: 'none', campagna_stipendi: 'none', impostazioni: 'none', utenti: 'none' }

export function defaultPermissionsForRole(role) {
  return DEFAULT_PERMS_BY_ROLE[role] || BASE_FALLBACK
}

// Durata di default dell'elevazione se Impostazioni non fornisce un valore.
var ELEVAZIONE_DEFAULT_MINUTI = 5

export function AuthProvider(props) {
  var sessionState = useState(null)
  var session = sessionState[0]
  var setSession = sessionState[1]

  var profileState = useState(null)
  var profile = profileState[0]
  var setProfile = profileState[1]

  var loadingState = useState(true)
  var loading = loadingState[0]
  var setLoading = loadingState[1]

  // ----------------------------------------------------------
  // Stato ELEVAZIONE (Funzione C)
  //   elevazione = null quando si e' al base.
  //   Quando attiva: { user_id, nome, role, permissions, scadenza }
  //   scadenza e' un timestamp (ms) oltre il quale si torna al base.
  // ----------------------------------------------------------
  var elevazioneState = useState(null)
  var elevazione = elevazioneState[0]
  var setElevazione = elevazioneState[1]

  // Secondi residui prima della scadenza (per la barra/timer nel Layout).
  var secondiResiduiState = useState(0)
  var secondiResidui = secondiResiduiState[0]
  var setSecondiResidui = secondiResiduiState[1]

  var elevazioneTimerRef = useRef(null)

  useEffect(function() {
    supabase.auth.getSession().then(function(result) {
      setSession(result.data.session)
      if (result.data.session) {
        loadProfile(result.data.session.user.id)
      } else {
        setLoading(false)
      }
    })

    var listener = supabase.auth.onAuthStateChange(function(event, newSession) {
      setSession(newSession)
      if (newSession) {
        loadProfile(newSession.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
      // Solo un vero logout (o assenza di sessione) annulla l'elevazione.
      // Gli eventi di routine (rinnovo del token, ritorno in primo piano)
      // NON devono spegnerla, altrimenti la finestra cade da sola.
      if (event === 'SIGNED_OUT' || !newSession) {
        terminaElevazione()
      }
    })

    return function() {
      listener.data.subscription.unsubscribe()
      if (elevazioneTimerRef.current) clearInterval(elevazioneTimerRef.current)
    }
  }, [])

  // ----------------------------------------------------------
  // COLONNE DEL PROFILO — elencate per nome, mai select('*').
  //
  // In user_profiles vivono anche pin_hash, pin_failed_attempts e
  // pin_locked_until. La migrazione 56 toglie a chi si collega dal
  // browser il permesso di leggerle: da quel momento un select('*')
  // fallirebbe, il profilo non si caricherebbe e l'utente vedrebbe
  // un'app vuota senza nessun messaggio d'errore.
  //
  // Il PIN si legge solo dentro le funzioni del database
  // (verify_pin_utente, set_pin, reset_pin), che girano coi permessi
  // del proprietario. Qui non serve, e quindi qui non si chiede.
  //
  // ⚠️ Chi aggiunge una colonna a user_profiles e la vuole nel
  // profilo deve aggiungerla a questo elenco: non arriva da sola.
  // ----------------------------------------------------------
  var COLONNE_PROFILO = 'id, first_name, last_name, display_name, role, is_active, created_at, updated_at, permissions'

  function loadProfile(userId) {
    supabase
      .from('user_profiles')
      .select(COLONNE_PROFILO)
      .eq('id', userId)
      .single()
      .then(function(result) {
        if (!result.error) {
          setProfile(result.data)
        }
        setLoading(false)
      })
  }

  function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email: email, password: password })
  }

  function signOut() {
    terminaElevazione()
    return supabase.auth.signOut().then(function() {
      setSession(null)
      setProfile(null)
    })
  }

  // ----------------------------------------------------------
  // ELEVAZIONE — avvio, rinnovo, termine, tic del timer
  // ----------------------------------------------------------

  // Fa partire (o rinnova) il tic al secondo che aggiorna i secondi
  // residui e, alla scadenza, riporta automaticamente al base.
  function avviaTimer(scadenza) {
    if (elevazioneTimerRef.current) clearInterval(elevazioneTimerRef.current)
    function aggiorna() {
      var ms = scadenza - Date.now()
      if (ms <= 0) {
        setSecondiResidui(0)
        terminaElevazione()
      } else {
        setSecondiResidui(Math.ceil(ms / 1000))
      }
    }
    aggiorna()
    elevazioneTimerRef.current = setInterval(aggiorna, 1000)
  }

  // Attiva l'elevazione con i dati verificati (info) e la durata in minuti.
  // info = { user_id, nome, role, permissions } (da verify_pin_utente).
  function attivaElevazione(info, minuti) {
    var durata = (minuti && minuti > 0) ? minuti : ELEVAZIONE_DEFAULT_MINUTI
    var scadenza = Date.now() + durata * 60 * 1000
    var dato = {
      user_id: info.user_id,
      nome: info.nome,
      role: info.role,
      permissions: (info.permissions && typeof info.permissions === 'object') ? info.permissions : null,
      scadenza: scadenza
    }
    setElevazione(dato)
    avviaTimer(scadenza)
  }

  // Estende la finestra ripartendo da adesso (usato al rinnovo col PIN).
  function rinnovaElevazione(minuti) {
    if (!elevazione) return
    var durata = (minuti && minuti > 0) ? minuti : ELEVAZIONE_DEFAULT_MINUTI
    var scadenza = Date.now() + durata * 60 * 1000
    setElevazione(function(prev) {
      if (!prev) return prev
      var u = {}; for (var k in prev) { u[k] = prev[k] }
      u.scadenza = scadenza
      return u
    })
    avviaTimer(scadenza)
  }

  // Torna al base: spegne l'elevazione e ferma il timer.
  function terminaElevazione() {
    if (elevazioneTimerRef.current) {
      clearInterval(elevazioneTimerRef.current)
      elevazioneTimerRef.current = null
    }
    setSecondiResidui(0)
    setElevazione(null)
  }

  var elevato = elevazione !== null

  // ----------------------------------------------------------
  // PERMESSI per funzione.
  // Se elevati, si guardano ruolo/permessi dell'utente elevato;
  // altrimenti quelli del profilo base loggato.
  // ----------------------------------------------------------

  // Ruolo/permessi "efficaci": elevazione se attiva, altrimenti base.
  function ruoloEfficace() {
    if (elevato) return elevazione.role
    return profile ? profile.role : null
  }

  function permessiEfficaci() {
    if (elevato) {
      if (elevazione.permissions) return elevazione.permissions
      return defaultPermissionsForRole(elevazione.role)
    }
    if (!profile) return {}
    if (profile.permissions && typeof profile.permissions === 'object') {
      return profile.permissions
    }
    return defaultPermissionsForRole(profile.role)
  }

  // Mantengo currentPermissions per compatibilita' con chi la usa gia'.
  function currentPermissions() {
    return permessiEfficaci()
  }

  function permissionLevel(feature) {
    var role = ruoloEfficace()
    if (!role) return 'none'
    if (role === 'super_admin') {
      return 'write'
    }
    var perms = permessiEfficaci()
    return perms[feature] || 'none'
  }

  function canView(feature) {
    return permissionLevel(feature) !== 'none'
  }

  function canEdit(feature) {
    var lvl = permissionLevel(feature)
    return lvl === 'write'
  }

  // ----------------------------------------------------------
  // isSuperAdminReale — l'ULTIMO controllo basato sul ruolo.
  //
  // Il vecchio sistema a ruoli (hasRole, canWrite) e' stato rimosso:
  // ogni pulsante dell'app si protegge con canEdit(feature), che
  // onora la matrice dei permessi e l'elevazione col PIN (regola 35).
  //
  // Resta questa sola funzione, e ha un mestiere preciso: dire se il
  // PROFILO BASE LOGGATO e' super_admin, ignorando deliberatamente
  // l'elevazione. Serve dove nemmeno il PIN deve poter aprire, e oggi
  // c'e' un solo posto: la durata dell'elevazione stessa, dentro
  // Impostazioni. Senza questo controllo si chiuderebbe un anello:
  // mi elevo col PIN e la prima cosa che posso fare e' allungare la
  // durata dell'elevazione.
  //
  // ⚠️ Il nome dice che cosa fa apposta. NON usarla per proteggere un
  // pulsante qualunque: quello e' esattamente il modo in cui era nata
  // la regola 35. Se serve limitare una funzione, si usa canEdit.
  // ----------------------------------------------------------
  function isSuperAdminReale() {
    if (!profile) return false
    return profile.role === 'super_admin'
  }

  var user = session ? session.user : null

  var value = {
    session: session,
    user: user,
    profile: profile,
    loading: loading,
    signIn: signIn,
    signOut: signOut,
    permissionLevel: permissionLevel,
    canView: canView,
    canEdit: canEdit,
    currentPermissions: currentPermissions,
    isSuperAdminReale: isSuperAdminReale,
    // --- Elevazione (Funzione C) ---
    elevazione: elevazione,
    elevato: elevato,
    secondiResidui: secondiResidui,
    attivaElevazione: attivaElevazione,
    rinnovaElevazione: rinnovaElevazione,
    terminaElevazione: terminaElevazione
  }

  return (
    <AuthContext.Provider value={value}>
      {props.children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  var context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve essere usato dentro AuthProvider')
  }
  return context
}
