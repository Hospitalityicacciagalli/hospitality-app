import { useState, useEffect, useRef } from 'react'

// ============================================================
// CONTROLLO DI VERSIONE DELL'APP (v74, appunto 0.5 punto 1 v73)
//
// Il problema: un dispositivo che ha gia' aperto l'app continua a usare
// il programma che ha caricato, anche per giorni (regola 49). Il 14-15/11
// un dispositivo vecchio ha scritto eventi nell'archivio che nessuno
// leggeva piu' (regola 60). I telefoni con l'app sulla schermata Home
// non hanno nemmeno un pulsante per ricaricare.
//
// Come funziona:
//  - a ogni costruzione su Vercel (vite.config.js) il programma riceve un
//    numero di versione (le prime 7 cifre del commit) e lo stesso numero
//    viene scritto nel file /versione.json del sito;
//  - ogni 5 minuti, e quando il dispositivo torna in uso, l'app legge
//    /versione.json (senza copie salvate, vercel.json) e lo confronta col
//    suo. Diverso = e' uscita una versione nuova;
//  - allora compare la striscia «Aggiorna ora» (Layout.jsx) e l'app si
//    ricarica DA SOLA solo nei momenti sicuri (decisione 1B, 18/11):
//      a) al cambio pagina (si sta uscendo comunque; la scheda Evento ha
//         gia' la sua finestra «Modifiche non salvate» che ferma il menu');
//      b) dopo 10 minuti senza che nessuno tocchi il dispositivo.
//    MAI mentre la postazione e' elevata col PIN: l'elevazione vive solo
//    nella memoria della pagina e un ricaricamento la chiuderebbe.
//    MAI mentre una scheda dichiara modifiche non salvate (registraModifiche).
//
// Fuori da Vercel (npm run dev, build sul PC) la versione e' «locale» e
// il controllo e' spento: non c'e' nessun /versione.json da leggere.
//
// ⚠️ NON sostituisce la regola 60: la protezione vera resta chiudere nel
// database quello che non si usa piu'. Questo riduce da giorni a minuti
// il tempo in cui un dispositivo vecchio puo' fare danni.
// ============================================================

/* global __VERSIONE_APP__, __VERSIONE_DATA__ */
export var VERSIONE = (typeof __VERSIONE_APP__ !== 'undefined') ? __VERSIONE_APP__ : 'locale'
export var VERSIONE_DATA = (typeof __VERSIONE_DATA__ !== 'undefined') ? __VERSIONE_DATA__ : ''

var OGNI_MS = 5 * 60 * 1000          // controllo periodico
var FERMO_MS = 10 * 60 * 1000        // «fermo» = nessun tocco da 10 minuti
var PAUSA_MINIMA_MS = 30 * 1000      // fra due letture ravvicinate
var CHIAVE_TENTATIVO = 'icg_versione_ricarica'
var TENTATIVO_VALIDO_MS = 10 * 60 * 1000

// ---- Modifiche non salvate ----------------------------------
// Una pagina con un modulo che sa di avere modifiche non salvate
// registra qui il suo ref (oggi: EventoScheda, modificatoRef). Un ref
// e non un valore, cosi' si legge sempre lo stato del momento.
var refModifiche = null

export function registraModifiche(ref) {
  refModifiche = ref
}

export function liberaModifiche(ref) {
  if (refModifiche === ref) refModifiche = null
}

function ciSonoModifiche() {
  return !!(refModifiche && refModifiche.current)
}

// ---- Data della versione, per la riga in fondo al menu' -----
function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

export function dataVersioneBreve() {
  if (!VERSIONE_DATA) return ''
  var d = new Date(VERSIONE_DATA)
  if (isNaN(d.getTime())) return ''
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() +
    ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

// ---- Lettura della versione pubblicata sul sito -------------
// Restituisce il numero di versione del sito, o null se non si riesce a
// leggere (rete assente, file mancante): in quel caso non si fa niente.
function leggiVersioneSito() {
  return fetch('/versione.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function(r) { return r.ok ? r.json() : null })
    .then(function(j) { return (j && j.versione) ? String(j.versione) : null })
    .catch(function() { return null })
}

// ---- Freno contro i ricaricamenti a catena ------------------
// Se dopo un ricaricamento il programma e' ancora quello vecchio (il sito
// non ha finito di pubblicare), non si riprova da soli per 10 minuti:
// resta la striscia col pulsante. sessionStorage vale per questa scheda.
function giaTentata(versioneSito) {
  try {
    var s = JSON.parse(window.sessionStorage.getItem(CHIAVE_TENTATIVO) || 'null')
    return !!(s && s.versione === versioneSito && (Date.now() - s.il) < TENTATIVO_VALIDO_MS)
  } catch (e) {
    return false
  }
}

function segnaTentativo(versioneSito) {
  try {
    window.sessionStorage.setItem(CHIAVE_TENTATIVO, JSON.stringify({ versione: versioneSito, il: Date.now() }))
  } catch (e) { /* niente: al peggio un ricaricamento in piu' */ }
}

// Ricarica la pagina su cui si e' (l'indirizzo resta lo stesso).
export function aggiornaOra(versioneSito) {
  if (versioneSito) segnaTentativo(versioneSito)
  window.location.reload()
}

// ---- Il controllo -------------------------------------------
// elevato: true se la postazione e' elevata col PIN (useAuth).
// percorso: location.pathname, per riconoscere il cambio pagina.
// Restituisce la versione nuova del sito (o null se non ce n'e').
export function useControlloVersione(elevato, percorso) {
  var nuovaState = useState(null)
  var nuova = nuovaState[0]
  var setNuova = nuovaState[1]

  var nuovaRef = useRef(null)
  var elevatoRef = useRef(elevato)
  elevatoRef.current = elevato
  var ultimoTocco = useRef(Date.now())
  var ultimaLettura = useRef(0)
  var percorsoPrima = useRef(percorso)

  function siPuoRicaricare() {
    var v = nuovaRef.current
    if (!v) return false
    if (elevatoRef.current) return false
    if (ciSonoModifiche()) return false
    if (giaTentata(v)) return false
    return true
  }

  useEffect(function() {
    if (VERSIONE === 'locale') return

    function tocco() {
      ultimoTocco.current = Date.now()
    }

    // Momento sicuro b): fermo da almeno 10 minuti.
    function provaSeFermo() {
      if (!siPuoRicaricare()) return
      if (Date.now() - ultimoTocco.current < FERMO_MS) return
      aggiornaOra(nuovaRef.current)
    }

    function controlla() {
      var adesso = Date.now()
      if (adesso - ultimaLettura.current < PAUSA_MINIMA_MS) {
        provaSeFermo()
        return
      }
      ultimaLettura.current = adesso
      leggiVersioneSito().then(function(v) {
        if (!v || v === VERSIONE) return
        nuovaRef.current = v
        setNuova(v)
        provaSeFermo()
      })
    }

    function suVisibilita() {
      if (document.visibilityState === 'visible') controlla()
    }

    controlla()
    var timer = setInterval(controlla, OGNI_MS)
    document.addEventListener('visibilitychange', suVisibilita)
    window.addEventListener('focus', controlla)
    window.addEventListener('pointerdown', tocco, true)
    window.addEventListener('keydown', tocco, true)
    window.addEventListener('touchstart', tocco, { capture: true, passive: true })

    return function() {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', suVisibilita)
      window.removeEventListener('focus', controlla)
      window.removeEventListener('pointerdown', tocco, true)
      window.removeEventListener('keydown', tocco, true)
      window.removeEventListener('touchstart', tocco, { capture: true, passive: true })
    }
  }, [])

  // Momento sicuro a): cambio pagina. L'indirizzo nuovo e' gia' nella
  // barra, quindi il ricaricamento apre direttamente la pagina scelta.
  useEffect(function() {
    if (percorsoPrima.current === percorso) return
    percorsoPrima.current = percorso
    if (siPuoRicaricare()) aggiornaOra(nuovaRef.current)
  }, [percorso])

  return nuova
}
