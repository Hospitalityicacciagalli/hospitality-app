import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ============================================================
// NUMERO DI VERSIONE (v74 — controllo di versione dell'app)
//
// Su Vercel la versione e' il commit (prime 7 cifre, la stessa sigla
// che si vede in GitHub Desktop). Se Vercel non passasse il commit, si
// usa l'ora della costruzione: cambia comunque a ogni pubblicazione.
// Sul PC (npm run dev / build) la versione e' «locale» e il controllo
// nell'app resta spento (src/lib/controlloVersione.js).
//
// Lo stesso numero finisce in due posti:
//  - dentro il programma (__VERSIONE_APP__, __VERSIONE_DATA__);
//  - nel file /versione.json del sito, che l'app rilegge ogni 5 minuti.
// ============================================================
var commit = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7)
var dataCostruzione = new Date().toISOString()
var versione = commit || (process.env.VERCEL ? 'b' + Date.now().toString(36) : 'locale')

function fileVersione() {
  return {
    name: 'icg-file-versione',
    apply: 'build',
    generateBundle: function() {
      this.emitFile({
        type: 'asset',
        fileName: 'versione.json',
        source: JSON.stringify({ versione: versione, data: dataCostruzione })
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), fileVersione()],
  define: {
    __VERSIONE_APP__: JSON.stringify(versione),
    __VERSIONE_DATA__: JSON.stringify(dataCostruzione)
  }
})
