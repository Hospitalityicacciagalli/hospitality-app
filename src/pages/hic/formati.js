// ============================================================
// Formattazione condivisa dalle schede della Dashboard HotelInCloud.
// Sta in un file suo per non riscriverla in ogni scheda.
//
// REGOLA: qui NON si arrotonda e non si somma nulla. Gli importi
// arrivano gia' sommati e gia' arrotondati dal database (migrazione
// 32, regola "somma prima / arrotonda dopo" della sezione 17.9).
// Queste funzioni mettono solo il punto delle migliaia e la virgola.
// ============================================================

var MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'
];

var MESI_BREVI = [
  'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
  'lug', 'ago', 'set', 'ott', 'nov', 'dic'
];

export function numero(valore) {
  var n = Number(valore);
  if (valore === null || valore === undefined || isNaN(n)) return '—';
  return n.toLocaleString('it-IT');
}

export function euro(valore) {
  var n = Number(valore);
  if (valore === null || valore === undefined || isNaN(n)) return '—';
  return n.toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' €';
}

export function euroBreve(valore) {
  var n = Number(valore);
  if (valore === null || valore === undefined || isNaN(n)) return '—';
  if (Math.abs(n) >= 1000) {
    return Math.round(n / 1000) + 'k';
  }
  return Math.round(n) + '';
}

export function percentuale(valore, decimali) {
  var n = Number(valore);
  if (valore === null || valore === undefined || isNaN(n)) return '—';
  var d = (decimali === undefined || decimali === null) ? 1 : decimali;
  return n.toLocaleString('it-IT', {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  }) + '%';
}

// '2026-05-01' (primo giorno del mese, come lo restituisce il DB)
// diventa 'maggio 2026' oppure 'mag 26'.
export function nomeMese(dataIso, breve) {
  if (!dataIso) return '—';
  var pezzi = String(dataIso).split('-');
  if (pezzi.length < 2) return String(dataIso);
  var anno = pezzi[0];
  var indice = parseInt(pezzi[1], 10) - 1;
  if (indice < 0 || indice > 11) return String(dataIso);
  if (breve) return MESI_BREVI[indice] + ' ' + anno.slice(2);
  return MESI[indice] + ' ' + anno;
}

// Variazione percentuale fra due valori. null se il riferimento e' zero.
export function variazione(valore, riferimento) {
  var v = Number(valore);
  var r = Number(riferimento);
  if (isNaN(v) || isNaN(r) || r === 0) return null;
  return (v - r) / r * 100;
}
