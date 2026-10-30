// ============================================================
// NOMI SIMILI — riconoscere due schede che sono la stessa persona
// ============================================================
//
// Nato il 30/10/2026 dal doppione "AMHED" / "Ahmed Juned": la scheda
// inserita a mano aveva un trattino come nome e due lettere invertite
// nel cognome, e il vecchio controllo (codice fiscale, oppure nome e
// cognome IDENTICI) non poteva vederla.
//
// Regole del confronto:
//   - maiuscole, accenti, apostrofi e trattini non contano;
//   - l'ordine nome/cognome non conta ("Ahmed Juned" = "Juned Ahmed");
//   - parole di 2-3 lettere: devono essere uguali;
//   - parole di 4-6 lettere: tollerato UN errore (lettera sbagliata,
//     mancante, in piu', o due lettere invertite: AMHED / AHMED);
//   - parole di 7 o piu' lettere: tollerati DUE errori;
//   - una parola che e' l'inizio dell'altra conta come simile
//     ("Giuse" / "Giuseppe"), da 4 lettere in su;
//   - due persone sono simili se OGNI parola del nome piu' corto ha
//     una parola simile nell'altro. Cosi' "AMHED" (una parola) somiglia
//     ad "Ahmed Juned", ma "Maria Rossi" NON somiglia a "Maria Bianchi".
//
// E' un AVVISO, mai un blocco: con nomi comuni i falsi allarmi sono
// voluti e costano un tocco su "E' un'altra persona".

function normalizza(s) {
  if (!s) return "";
  var t = String(s).toLowerCase();
  if (t.normalize) t = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return t.replace(/[^a-z]+/g, " ").trim();
}

export function parole(nome, cognome) {
  var t = normalizza((nome || "") + " " + (cognome || ""));
  if (!t) return [];
  return t.split(" ").filter(function(p) { return p.length >= 2; });
}

// Distanza fra due parole: quante correzioni servono per passare
// dall'una all'altra (inversione di due lettere vicine = una correzione).
function distanza(a, b) {
  var d = [];
  var i, j;
  for (i = 0; i <= a.length; i++) { d.push([i]); }
  for (j = 1; j <= b.length; j++) { d[0][j] = j; }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      var costo = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      var v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
        v = Math.min(v, d[i - 2][j - 2] + 1);
      }
      d[i][j] = v;
    }
  }
  return d[a.length][b.length];
}

function paroleSimili(x, y) {
  if (x === y) return true;
  var corta = x.length <= y.length ? x : y;
  var lunga = x.length <= y.length ? y : x;
  if (corta.length < 4) return false;
  if (lunga.indexOf(corta) === 0) return true;
  var soglia = corta.length >= 7 ? 2 : 1;
  return distanza(x, y) <= soglia;
}

export function personeSimili(paroleA, paroleB) {
  if (!paroleA.length || !paroleB.length) return false;
  var corte = paroleA.length <= paroleB.length ? paroleA : paroleB;
  var lunghe = paroleA.length <= paroleB.length ? paroleB : paroleA;
  for (var i = 0; i < corte.length; i++) {
    var trovata = false;
    for (var j = 0; j < lunghe.length; j++) {
      if (paroleSimili(corte[i], lunghe[j])) { trovata = true; break; }
    }
    if (!trovata) return false;
  }
  return true;
}

// Restituisce le schede di "elenco" che somigliano a nome + cognome.
// "escludiId" serve a non trovare se stessi quando si modifica una scheda.
export function cercaSimili(nome, cognome, elenco, escludiId) {
  var cercate = parole(nome, cognome);
  if (!cercate.length) return [];
  return (elenco || []).filter(function(s) {
    if (escludiId && String(s.id) === String(escludiId)) return false;
    return personeSimili(cercate, parole(s.first_name, s.last_name));
  });
}

// Almeno due lettere vere: un trattino o un'iniziale non bastano.
export function haLettereSufficienti(s) {
  var lettere = normalizza(s).replace(/ /g, "");
  return lettere.length >= 2;
}
