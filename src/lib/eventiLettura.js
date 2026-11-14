// ============================================================
// EVENTI — LETTURA PER LE PAGINE DEL RISTORANTE
// ============================================================
//
// Nato il 14/11/2026 con la migrazione 64 (travaso): da qui in poi le
// pagine del ristorante (Giorno, Calendario, Prenotazione, Turni)
// leggono gli eventi dal MODULO (eventi + eventi_servizi) e non piu'
// dall'archivio event_dates.
//
// DUE LETTURE, DUE MESTIERI (regola 31):
//
//   caricaCopertiEventi(dal, al) — I NUMERI. Chiama la funzione unica
//     del database coperti_eventi (migrazione 60): per giorno e fascia
//     (pranzo/cena) ospiti confermati, ospiti in opzione, servizi senza
//     numero, esclusiva. E' l'UNICO conteggio dei coperti degli eventi:
//     totali, limiti e alert si fanno con questo, mai sommando i servizi
//     nella pagina. La puo' leggere ogni utente collegato.
//
//   caricaServiziEventi(dal, al) — LE SCHEDE. I servizi (con il titolo
//     e lo stato del loro evento) da mostrare nella pagina: titolo,
//     stato, fascia, spazi, note, e il numero di quel servizio solo da
//     LEGGERE. Le regole del database fanno vedere queste righe solo a
//     chi ha il permesso Eventi: per gli altri la lista arriva vuota, e
//     la pagina mostra «Evento riservato» con il numero preso da
//     caricaCopertiEventi (vedi righeRiservate).
//
// Contano (e si vedono) solo gli eventi in OPZIONE e CONFERMATI:
// richieste e annullati non occupano posti (0.5 punto 2 v61).
// ============================================================

import { supabase } from './supabase'
import { numeroServizio } from '../pages/EventiPage'

// Chiave di una cella del conteggio: 'AAAA-MM-GG|lunch'
export function chiaveTurno(data, fascia) {
  return data + '|' + fascia
}

// Un turno (pranzo o cena) e' toccato da un servizio se ha la stessa
// fascia o se il servizio e' «giornata intera».
export function servizioNelTurno(fasciaServizio, turno) {
  return fasciaServizio === turno || fasciaServizio === 'both'
}

// I numeri: { 'AAAA-MM-GG|lunch': { confermati, opzione, ospiti,
// senzaNumero, esclusiva } }. ospiti = confermati + opzione (anche
// un'opzione occupa). In caso di errore: oggetto vuoto + errore in
// console (la pagina resta usabile, i numeri degli eventi mancano).
export function caricaCopertiEventi(dal, al) {
  return supabase.rpc('coperti_eventi', { p_dal: dal, p_al: al }).then(function(result) {
    var mappa = {}
    if (result.error) {
      console.error('coperti_eventi:', result.error)
      return mappa
    }
    var righe = result.data || []
    for (var i = 0; i < righe.length; i++) {
      var r = righe[i]
      var conf = r.ospiti_confermati || 0
      var opz = r.ospiti_opzione || 0
      mappa[chiaveTurno(r.giorno, r.fascia)] = {
        confermati: conf,
        opzione: opz,
        ospiti: conf + opz,
        senzaNumero: r.servizi_senza_numero || 0,
        esclusiva: r.esclusiva === true
      }
    }
    return mappa
  })
}

// Il conteggio di UN turno, con i valori a zero se non c'e' niente.
export function copertiDelTurno(mappa, data, turno) {
  var c = mappa ? mappa[chiaveTurno(data, turno)] : null
  if (!c) return { confermati: 0, opzione: 0, ospiti: 0, senzaNumero: 0, esclusiva: false }
  return c
}

// Le schede dei servizi in un periodo, in ordine di data e fascia.
// Ogni riga:
//   { id (del servizio), evento_id, data, fascia, titolo, nome_servizio,
//     stato ('opzione' | 'confermato'), numero (null = senza numero),
//     occupa_coperti, esclusiva, spazi: ['Pergola', ...],
//     note_evento, note_servizio, ora_inizio, ora_fine, riservato: false }
export function caricaServiziEventi(dal, al) {
  var servizi = supabase.from('eventi_servizi')
    .select('id, evento_id, nome, data, fascia, ora_inizio, ora_fine, ipotetici_adulti, ipotetici_bambini, definitivi_adulti, definitivi_bambini, effettivi_adulti, effettivi_bambini, ospiti_storici, occupa_coperti, esclusiva, note, ordine, eventi!inner(id, titolo, stato, note), eventi_servizi_sale(sala_id)')
    .gte('data', dal)
    .lte('data', al)
    .in('eventi.stato', ['opzione', 'confermato'])
    .order('data', { ascending: true })
    .order('ordine', { ascending: true })
  var sale = supabase.from('sale').select('id, nome')

  return Promise.all([servizi, sale]).then(function(esiti) {
    var rs = esiti[0]
    var rsale = esiti[1]
    if (rs.error) {
      console.error('eventi_servizi:', rs.error)
      return []
    }
    var nomiSale = {}
    var elencoSale = (rsale && !rsale.error && rsale.data) ? rsale.data : []
    for (var k = 0; k < elencoSale.length; k++) nomiSale[elencoSale[k].id] = elencoSale[k].nome

    var out = []
    var righe = rs.data || []
    for (var i = 0; i < righe.length; i++) {
      var s = righe[i]
      var ev = s.eventi || {}
      var spazi = []
      var legami = s.eventi_servizi_sale || []
      for (var j = 0; j < legami.length; j++) {
        if (nomiSale[legami[j].sala_id]) spazi.push(nomiSale[legami[j].sala_id])
      }
      out.push({
        id: s.id,
        evento_id: s.evento_id,
        data: s.data,
        fascia: s.fascia,
        titolo: ev.titolo || 'Evento',
        nome_servizio: s.nome || '',
        stato: ev.stato,
        numero: numeroServizio(s),
        occupa_coperti: s.occupa_coperti !== false,
        esclusiva: s.esclusiva === true,
        spazi: spazi,
        note_evento: ev.note || '',
        note_servizio: s.note || '',
        ora_inizio: s.ora_inizio || null,
        ora_fine: s.ora_fine || null,
        riservato: false
      })
    }
    out.sort(function(a, b) {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1
      var fa = a.fascia === 'lunch' ? 0 : (a.fascia === 'both' ? 1 : 2)
      var fb = b.fascia === 'lunch' ? 0 : (b.fascia === 'both' ? 1 : 2)
      return fa - fb
    })
    return out
  })
}

// Per chi NON vede le schede (niente permesso Eventi): una riga
// «Evento riservato» per ogni turno della giornata che ha eventi, con
// il numero del conteggio unico. Solo numeri: niente nome, niente note.
// Si usa SOLO quando caricaServiziEventi non ha restituito niente per
// quel giorno ma il conteggio dice che ci sono eventi.
export function righeRiservate(mappa, data) {
  var out = []
  var turni = ['lunch', 'dinner']
  for (var i = 0; i < turni.length; i++) {
    var c = copertiDelTurno(mappa, data, turni[i])
    if (c.ospiti > 0 || c.senzaNumero > 0 || c.esclusiva) {
      out.push({
        id: 'riservato-' + data + '-' + turni[i],
        evento_id: null,
        data: data,
        fascia: turni[i],
        titolo: 'Evento riservato',
        nome_servizio: '',
        stato: c.confermati > 0 || c.opzione === 0 ? 'confermato' : 'opzione',
        numero: c.ospiti > 0 ? c.ospiti : null,
        occupa_coperti: true,
        esclusiva: c.esclusiva,
        spazi: [],
        note_evento: '',
        note_servizio: '',
        ora_inizio: null,
        ora_fine: null,
        riservato: true
      })
    }
  }
  return out
}

// Il titolo da mostrare: «Matrimonio Rossi · Cena sera prima».
export function titoloServizio(r) {
  return r.nome_servizio ? r.titolo + ' · ' + r.nome_servizio : r.titolo
}
