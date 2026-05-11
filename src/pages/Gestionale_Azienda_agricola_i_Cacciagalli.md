# Gestionale Vinificazione Cacciagalli - Specifiche Complete per Claude Project

## Introduzione
Software per Azienda Agricola i Cacciagalli (Teano, CE, P.IVA 03208680615): gestione filiera vinicola uva → bottiglia, dual-track "verità oggettiva" (reale) vs "registri SIAN", multi-utente, mappe magazzino con editor su PC e visualizzazione su mobile, PWA, dati Google Drive/Sheets (gratuiti). Integrazioni: analisi enologiche, lavorazioni chimiche, Cassa in Cloud API per giacenza bottiglie real-time. Compliance IGT Roccamonfina, registri telematici SIAN.

---

## Flusso Produzione Vinicola
Fasi con lavorazioni/analisi:

- **Raccolta Uve:** Varietà (Fiano/Falanghina), data, appezzamento(i), kg.
- **Prima Lavorazione:** Raspi/vinacce/mosto (kg); assegna contenitore.
- **Fermentazione:** Storia + lavorazioni (es. metabisolfito sodio: tipo, data, kg, %).
- **Vino Finito:** Feccia; + analisi (pH, alcol, acidità; link PDF Drive).
- **Imbottigliamento:** 0.75/1.5L, n. bottiglie; etichetta/lotto (Zagreo 2024 IGT Roccamonfina Fiano Bio). ≥85% una varietà = purezza; altrimenti misto.
- **Lavorazioni Extra:** Additivi/chimici per fase/contenitore.
- **Analisi:** Parametri lab (JSON), data, file_URL; aggregate in storia.

---

## Gestione Contenitori e Magazzino

**Contenitori:** Tipi (tini/bottiglie), foto Drive, ID, posizione mappa, composizione (fasi, tagli, lavorazioni, analisi), quantità oggettiva/registro.

**Mappe magazzino — architettura mista PC/mobile:**
- *Editor su PC:* interfaccia drag & drop per posizionare i contenitori sulla planimetria della cantina. Le modifiche alla mappa (posizioni, layout) sono possibili solo da PC. Una volta salvate, le posizioni vengono scritte su Sheets.
- *Visualizzatore su mobile:* la mappa viene mostrata in forma semplificata (planimetria con punti cliccabili). Il cantiniere può cliccare su un contenitore per vederne i dettagli e registrare operazioni, ma non può modificare il layout.
- Il PC può essere un PC fisso in cantina, un laptop, o entrambi — la scelta è rimandata. L'editor funziona via browser, quindi è accessibile da qualsiasi dispositivo con schermo adeguato.

**Movimentazioni:** Trasferisci tutto/parte; traccia data/utente/tipo_verità.

**Giacenza Bottiglie:** Real-time via Cassa sync.

---

## Architettura Centro/Periferia (PC + Mobile)

Il sistema adotta un modello con **centro di controllo (PC)** e **terminale di annotazione (mobile)**.

### PC — Centro di controllo
- Operazioni principali: gestione mappa, convalida lavorazioni, registri SIAN, report, riconciliazione dati.
- Visione completa su tutti i dati (oggettivi e registro).
- Unico punto da cui modificare il layout della mappa magazzino.

### Mobile — Terminale di annotazione
- Pensato per l'uso in cantina, in movimento, con connessione potenzialmente lenta.
- Permette di annotare immediatamente operazioni sul campo: trasferimento vino tra contenitori, trasferimento bottiglie, registrazione lavorazioni (es. aggiunta SO2).
- Le annotazioni vengono salvate immediatamente su Sheets come **bozze** (stato: `da_confermare`), non influenzano ancora le giacenze ufficiali.
- Visualizzazione mappa in sola lettura con punti cliccabili.

### Flusso di convalida
1. Il cantiniere annota un'operazione da mobile → viene salvata come bozza su Sheets.
2. L'Admin/Enologo accede da PC → trova le bozze in attesa di convalida.
3. Rivede, corregge se necessario, conferma → l'operazione diventa ufficiale e aggiorna le giacenze.
4. Le bozze confermate alimentano la colonna "oggettiva"; l'Admin decide cosa entra nel registro SIAN.

---

## Verità Oggettiva vs Registri SIAN

- **Oggettiva:** Dati reali (kg, uscite Cassa, analisi, operazioni confermate).
- **Registri:** Formattati SIAN (esporta XML/CSV).
- **Bozze mobile:** stato intermedio, visibili ma non ancora ufficiali.
- **Utenti:** Admin (accesso a tutto), Operativi (annotazioni mobile + visualizzazione), permessi granulari.

---

## Integrazione Cassa in Cloud (api.cassanova.com)

- **API:** POST /apikey/token (Bearer auth).
- **Webhooks:** INVOICE/CREATE/EDIT; verifica HMAC (x-cn-signature).
- **Flusso:** Webhook fatture uscite → estrai lotto/bottiglie → aggiorna giacenza → genera SIAN.
- **Query:** GET /invoices?filter; StockMovement per sync.
- **Ricezione webhook:** gestita tramite Make.com (piano gratuito) per maggiore affidabilità rispetto ad Apps Script diretto.

---

## Requisiti Funzionali

| Modulo | Key Features | Utenti/Integrazioni |
|---|---|---|
| Produzione | Fasi, tagli, lavorazioni (SO2%), analisi link | Enologo; Drive |
| Magazzino | Editor mappa su PC, visualizzazione mobile, giacenza real-time | Cantiniere mobile; Cassa |
| Annotazioni mobile | Bozze lavorazioni/movimentazioni, convalida differita da PC | Cantiniere; Admin |
| SIAN | Esporta da uscite/oggettiva | Admin |
| Cassa | Intercetta fatture, conta bottiglie | Automatizzato via Make.com |
| Report | Giacenze, lotti, compliance IGT | Tutti |

---

## Requisiti Tecnici

- **Stack:** Google Apps Script (backend), Sheets (DB normalizzato), HTML/JS/Vue (UI responsive PWA).
- **Mobile:** visualizzazione mappa, annotazioni rapide, scan barcode.
- **PC:** editor mappa drag & drop, convalida bozze, gestione completa.
- **Webhook receiver:** Make.com (piano free, più affidabile di Apps Script per ricezione real-time).
- **Sicurezza:** Google Auth, audit trail.
- **Scalabilità:** infrastruttura gratuita; export SIAN automatico.

---

## Architettura Dati (Google Sheets — fogli normalizzati)

Ogni entità ha il suo foglio dedicato. Nessun JSON annidato nelle celle per dati che devono essere filtrati o incrociati.

**Uve:** id, varieta, data, appezzamento, kg.

**Contenitori:** id, tipo, foto_url, posizione_x, posizione_y, sala, qta_oggettiva, qta_registro.

**Lavorazioni:** id, contenitore_id, tipo, data, kg, percentuale, utente, stato (confermata / da_confermare).

**Analisi:** id, contenitore_id, data_lab, ph, alcol, acidita, url_pdf.

**Fasi_Contenitore:** id, contenitore_id, fase (raccolta/fermentazione/vino_finito/ecc.), data_inizio, data_fine.

**Lotti:** id, etichetta, annata, varieta_principale, purezza (bool), bott_075, bott_15, giacenza_realtime.

**Uscite:** id, lotto_id, fattura_id, n_bottiglie, data.

**Movimentazioni:** id, contenitore_da, contenitore_a, kg, data, utente, verita (oggettiva/registro), stato (confermata / da_confermare).

**Bozze_Mobile:** id, tipo (lavorazione/movimentazione), payload_json, utente, data_annotazione, stato (in_attesa / confermata / rifiutata).
