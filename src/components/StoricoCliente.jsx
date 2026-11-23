// ============================================================
// STORICO DEL CLIENTE — riquadro della scheda cliente
// ============================================================
//
// Nato il 23/11/2026 con la migrazione 67 (0.6 v76, sessione 1).
//
// Tutte le righe arrivano da UNA funzione del database,
// cliente_storico(p_cliente) (regola 31): prenotazioni del ristorante
// (da intestatario o da collegato, una volta sola), servizi degli
// eventi (una riga per servizio), soggiorni in hotel delle schede
// collegate a HiC. Qui si mostra e basta: nessuna regola su chi conta
// viene riscritta nella pagina.
//
// Decisioni di Florestano (23/11):
//  - prima le visite IN PROGRAMMA (dalla piu' vicina), poi le PASSATE
//    dalla piu' recente;
//  - prenotazione -> link alla GIORNATA (basta Prenotazioni = Lettura);
//    evento -> link alla scheda evento; soggiorno -> nessun link;
//  - cancellate, no show ed eventi annullati: IN GRIGIO, non nascosti;
//  - ognuno vede cio' che il suo permesso gli fa vedere: la funzione
//    gira coi permessi di chi la chiama, e chi non ha il permesso
//    Eventi non riceve le righe degli eventi;
//  - riga di riepilogo in cima;
//  - oltre 20 visite passate: si mostrano le ultime 20, con una riga
//    ben visibile «ultime 20 su N» e il pulsante «Mostra tutte e N».
//
// Il numero di ospiti di un servizio evento lo calcola
// numeroServizio() di EventiPage (copia della regola del database,
// migrazione 60): qui non se ne scrive un'altra.
// ============================================================

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { History, Utensils, PartyPopper, BedDouble, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { numeroServizio, oggiIso, formatData, etichettaFascia, STATI } from '../pages/EventiPage'

var MASSIMO_PASSATE = 20

var STATI_PRENOTAZIONE = {
  confirmed: { label: 'Confermata', classe: 'bg-blue-50 text-blue-700' },
  arrived:   { label: 'Arrivato',   classe: 'bg-yellow-50 text-yellow-800' },
  seated:    { label: 'Accomodato', classe: 'bg-green-50 text-green-700' },
  completed: { label: 'Completato', classe: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'Cancellata', classe: 'bg-red-50 text-red-700' },
  no_show:   { label: 'No show',    classe: 'bg-orange-50 text-orange-700' }
}

// Una visita e' «in programma» se non e' ancora passata:
// pasto o servizio di oggi o dopo; soggiorno con la partenza dopo oggi
// (chi e' in casa stanotte e' ancora «in programma»).
function inProgramma(r, oggi) {
  if (r.tipo === 'soggiorno') return (r.data_fine || r.data) > oggi
  return r.data >= oggi
}

function plurale(n, uno, molti) {
  return n + ' ' + (n === 1 ? uno : molti)
}

function Riepilogo(props) {
  var passate = props.passate
  var programmate = props.programmate
  var vere = passate.filter(function(r) { return !r.in_grigio })
  var rist = vere.filter(function(r) { return r.tipo === 'ristorante' }).length
  var serv = vere.filter(function(r) { return r.tipo === 'evento' }).length
  var sogg = vere.filter(function(r) { return r.tipo === 'soggiorno' }).length
  var grigie = passate.length - vere.length

  var pezzi = []
  if (rist > 0) pezzi.push(rist + ' al ristorante')
  if (serv > 0) pezzi.push(plurale(serv, 'servizio evento', 'servizi evento'))
  if (sogg > 0) pezzi.push(plurale(sogg, 'soggiorno', 'soggiorni'))

  return (
    <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700">
      <p>
        <span className="font-semibold text-gray-900">{plurale(vere.length, 'visita passata', 'visite passate')}</span>
        {pezzi.length > 0 && <span>{': ' + pezzi.join(', ')}</span>}
        {vere.length > 0 && <span>{' · ultima il ' + formatData(vere[0].data)}</span>}
      </p>
      {(programmate.length > 0 || grigie > 0) && (
        <p className="text-gray-500 mt-1">
          {programmate.length > 0 && <span>{plurale(programmate.length, 'in programma', 'in programma')}</span>}
          {programmate.length > 0 && grigie > 0 && <span>{' · '}</span>}
          {grigie > 0 && <span>{plurale(grigie, 'cancellata, no show o annullata', 'cancellate, no show o annullate')}</span>}
        </p>
      )}
    </div>
  )
}

function RigaRistorante(props) {
  var r = props.riga
  var st = STATI_PRENOTAZIONE[r.stato] || null
  var dettagli = []
  dettagli.push(r.ruolo === 'collegato'
    ? 'Collegato' + (r.intestatario_nome ? ' · con ' + r.intestatario_nome : '')
    : 'Intestatario')
  if (r.camera) dettagli.push('camera ' + r.camera)

  return (
    <Link
      to={'/prenotazioni/giorno/' + r.data}
      className={r.in_grigio
        ? 'flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors opacity-60'
        : 'flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors'}
    >
      <Utensils size={18} className="text-wine-700 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className={r.in_grigio ? 'text-sm font-medium text-gray-500 line-through' : 'text-sm font-medium text-gray-900'}>
          {formatData(r.data, true) + ' · ' + etichettaFascia(r.fascia) + (r.coperti ? ' · ' + plurale(r.coperti, 'coperto', 'coperti') : '')}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{dettagli.join(' · ')}</p>
        {r.gift_card_codice && (
          <p className="text-xs text-wine-700 mt-0.5 font-mono">{'🎁 ' + r.gift_card_codice}</p>
        )}
      </div>
      {st && r.stato !== 'confirmed' && (
        <span className={'shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ' + st.classe}>{st.label}</span>
      )}
    </Link>
  )
}

function RigaEvento(props) {
  var r = props.riga
  var st = STATI[r.stato] || STATI.richiesta
  var ospiti = numeroServizio(r)
  var dettagli = []
  if (r.tipologia) dettagli.push(r.tipologia)
  dettagli.push(etichettaFascia(r.fascia))
  if (ospiti !== null) dettagli.push(plurale(ospiti, 'ospite', 'ospiti'))

  return (
    <Link
      to={'/eventi/' + r.evento_id}
      className={r.in_grigio
        ? 'flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors opacity-60'
        : 'flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors'}
    >
      <PartyPopper size={18} className="text-purple-700 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className={r.in_grigio ? 'text-sm font-medium text-gray-500 line-through' : 'text-sm font-medium text-gray-900'}>
          {formatData(r.data, true) + ' · ' + (r.titolo || 'Evento') + (r.servizio_nome ? ' · ' + r.servizio_nome : '')}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{dettagli.join(' · ')}</p>
      </div>
      <span className={'shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ' + st.classe}>{st.label}</span>
    </Link>
  )
}

function RigaSoggiorno(props) {
  var r = props.riga
  var dettagli = []
  if (r.notti) dettagli.push(plurale(r.notti, 'notte', 'notti'))
  if (r.camera) dettagli.push('camera ' + r.camera)
  if (r.coperti) dettagli.push(plurale(r.coperti, 'ospite', 'ospiti'))

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg">
      <BedDouble size={18} className="text-green-700 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">
          {'Soggiorno dal ' + formatData(r.data, true) + ' al ' + formatData(r.data_fine)}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{dettagli.join(' · ')}</p>
      </div>
      {r.stato && r.stato !== 'Confermata' && (
        <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800">{r.stato}</span>
      )}
    </div>
  )
}

function Riga(props) {
  var r = props.riga
  if (r.tipo === 'ristorante') return <RigaRistorante riga={r} />
  if (r.tipo === 'evento') return <RigaEvento riga={r} />
  if (r.tipo === 'soggiorno') return <RigaSoggiorno riga={r} />
  return null
}

function chiaveRiga(r) {
  return r.tipo + '|' + (r.prenotazione_id || r.servizio_id || r.hic_prenotazione_id)
}

function StoricoCliente(props) {
  var clienteId = props.clienteId
  var [righe, setRighe] = useState(null)        // null = non ancora arrivate
  var [errore, setErrore] = useState('')
  var [mostraTutte, setMostraTutte] = useState(false)

  useEffect(function() {
    var attivo = true
    setRighe(null)
    setErrore('')
    setMostraTutte(false)
    if (!clienteId) return function() { attivo = false }
    supabase.rpc('cliente_storico', { p_cliente: clienteId }).then(function(result) {
      // Se nel frattempo si e' passati a un'altra scheda, questa
      // risposta non e' piu' la sua: si butta (regola 50).
      if (!attivo) return
      if (result.error) {
        console.error('Storico cliente:', result.error)
        setErrore('Non è stato possibile caricare lo storico.')
        setRighe([])
        return
      }
      setRighe(result.data || [])
    })
    return function() { attivo = false }
  }, [clienteId])

  var oggi = oggiIso()
  var programmate = []
  var passate = []
  if (righe) {
    righe.forEach(function(r) {
      if (inProgramma(r, oggi)) programmate.push(r)
      else passate.push(r)
    })
    // il database le manda dalla piu' recente: quelle in programma
    // si leggono dalla piu' vicina
    programmate.reverse()
  }
  var passateVisibili = mostraTutte ? passate : passate.slice(0, MASSIMO_PASSATE)
  var nascoste = passate.length - passateVisibili.length

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <History size={20} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">Storico</h2>
      </div>

      {righe === null && (
        <p className="text-gray-400 italic">Caricamento...</p>
      )}

      {righe !== null && errore && (
        <p className="text-red-600 text-sm">{errore}</p>
      )}

      {righe !== null && !errore && righe.length === 0 && (
        <p className="text-gray-400 italic">Nessuna visita registrata</p>
      )}

      {righe !== null && !errore && righe.length > 0 && (
        <div>
          <Riepilogo passate={passate} programmate={programmate} />

          {programmate.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1 px-3">In programma</h3>
              <div className="divide-y divide-gray-100">
                {programmate.map(function(r) {
                  return <Riga key={chiaveRiga(r)} riga={r} />
                })}
              </div>
            </div>
          )}

          {passate.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1 px-3">Passate</h3>
              <div className="divide-y divide-gray-100">
                {passateVisibili.map(function(r) {
                  return <Riga key={chiaveRiga(r)} riga={r} />
                })}
              </div>
            </div>
          )}

          {nascoste > 0 && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-amber-900 font-medium">
                {'Sono mostrate le ultime ' + passateVisibili.length + ' visite passate su ' + passate.length}
              </p>
              <button
                type="button"
                onClick={function() { setMostraTutte(true) }}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-wine-700 text-white hover:bg-wine-800 text-sm font-medium"
              >
                <ChevronDown size={16} />
                <span>{'Mostra tutte e ' + passate.length}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default StoricoCliente
