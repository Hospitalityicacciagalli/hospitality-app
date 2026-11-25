// ============================================================
// CARICAMENTO A BLOCCHI — una copia sola (regola 31)
// 25/11/2026, sessione «fusione ed eliminazione dei clienti».
//
// Supabase restituisce al massimo 1.000 righe per richiesta e TAGLIA
// IN SILENZIO il resto: nessun errore, solo un elenco che sembra
// completo e non lo è (regola 14 della 17.9). Le schede cliente erano
// 865 il 25/11 e crescevano di circa 8 al giorno: verso metà dicembre
// i cognomi in fondo all'alfabeto sarebbero spariti dall'elenco clienti
// e dalla lista clienti delle prenotazioni.
//
// Uso:
//   caricaABlocchi(function() {
//     return supabase.from('customers')
//       .select('id, first_name, last_name')
//       .eq('is_active', true)
//       .order('last_name', { ascending: true })
//       .order('id', { ascending: true })
//   }).then(function(res) { ... res.data / res.error ... })
//
// ⚠️ La funzione passata deve costruire una query NUOVA ogni volta, e
// con un ordine STABILE (in fondo sempre .order('id')): due righe con
// lo stesso cognome senza un secondo ordine possono scambiarsi di posto
// fra un blocco e l'altro, e una salterebbe.
// ============================================================

export var BLOCCO = 1000

export function caricaABlocchi(costruisci) {
  var tutte = []
  function giro(da) {
    return costruisci().range(da, da + BLOCCO - 1).then(function(res) {
      if (res.error) return { data: null, error: res.error }
      var righe = res.data || []
      for (var i = 0; i < righe.length; i++) tutte.push(righe[i])
      if (righe.length < BLOCCO) return { data: tutte, error: null }
      return giro(da + BLOCCO)
    })
  }
  return giro(0)
}
