import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2, X, Banknote, Coins, Calendar, RefreshCw, AlertCircle, ArrowDown, ArrowUp, Save, Search } from 'lucide-react';

// ============================================================
// PAGINA STIPENDI -> MESE
// Replica evoluta del foglio Excel mensile.
// Una riga per ogni dipendente con profilo paghe.
// I bonifici chiudono la busta paga; i contanti saldano il resto.
// ============================================================

var MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

function fmtEuro(n) {
  if (n === null || n === undefined || n === '' || isNaN(parseFloat(n))) return '0,00';
  var num = parseFloat(n);
  return num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function parseNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function todayIso() {
  var d = new Date();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

function fmtDate(iso) {
  if (!iso) return '';
  var m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return m[3] + '/' + m[2];
}

export default function StipendiMesePage() {
  var navigate = useNavigate();

  var oggi = new Date();
  var [anno, setAnno] = useState(oggi.getFullYear());
  var [mese, setMese] = useState(oggi.getMonth() + 1);

  // Filtro di sola visualizzazione per nominativo.
  // Quando valorizzato mostra soltanto le righe il cui nome contiene il testo,
  // cosi' pagando una persona non si vedono gli stipendi altrui.
  // Non e' una barriera di sicurezza: chi accede alla pagina puo' azzerarlo.
  var [filtroNome, setFiltroNome] = useState('');

  var [loading, setLoading] = useState(true);
  var [members, setMembers] = useState([]);          // anagrafica staff con profilo
  var [stipendiStorico, setStipendiStorico] = useState({});  // staff_id -> [stipendi]
  var [tariffeStorico, setTariffeStorico] = useState({});    // staff_id -> [tariffe]
  var [righe, setRighe] = useState([]);              // righe stip_mesi del mese
  var [movimenti, setMovimenti] = useState({});      // staff_id -> [movimenti]
  var [meseScorsoMap, setMeseScorsoMap] = useState({}); // staff_id -> restano in contanti del mese prima

  var [showAddDipendente, setShowAddDipendente] = useState(false);

  // Settori chiusi (collassati). Chiave = nome settore, valore = true se chiuso.
  var [collassati, setCollassati] = useState({});

  // Movimenti popup
  var [movPopup, setMovPopup] = useState(null);      // { staff_id, tipo } o null

  useEffect(function() {
    loadAll();
  }, [anno, mese]);

  function loadAll() {
    setLoading(true);

    // 1. Dipendenti attivi con profilo paghe
    var pMembers = supabase
      .from('stip_profili')
      .select('*, staff:staff_members(id, first_name, last_name, is_active, hire_date, contract_end_date)')
      .order('ordine', { ascending: true });

    // 2. Storico stipendi (tutti)
    var pStip = supabase
      .from('stip_stipendi_storico')
      .select('*')
      .order('valido_dal', { ascending: false });

    // 3. Storico tariffe (tutti)
    var pTar = supabase
      .from('stip_tariffe_storico')
      .select('*')
      .order('valido_dal', { ascending: false });

    // 4. Righe del mese corrente
    var pRighe = supabase
      .from('stip_mesi')
      .select('*')
      .eq('anno', anno)
      .eq('mese', mese);

    // 5. Movimenti del mese corrente
    var pMov = supabase
      .from('stip_movimenti')
      .select('*')
      .eq('anno', anno)
      .eq('mese', mese)
      .order('data_movimento', { ascending: true });

    // 6. Righe del mese precedente (per recuperare "restano in contanti")
    var meseScorsoMm = mese === 1 ? 12 : mese - 1;
    var meseScorsoAa = mese === 1 ? anno - 1 : anno;
    var pRigheScorse = supabase
      .from('stip_mesi')
      .select('staff_id, conteggio_euro, extra, riporto_precedente, tfr, busta_definitiva, busta_prova')
      .eq('anno', meseScorsoAa)
      .eq('mese', meseScorsoMm);

    var pMovScorso = supabase
      .from('stip_movimenti')
      .select('staff_id, tipo, importo')
      .eq('anno', meseScorsoAa)
      .eq('mese', meseScorsoMm);

    Promise.all([pMembers, pStip, pTar, pRighe, pMov, pRigheScorse, pMovScorso]).then(function(results) {
      // Quali dipendenti hanno gia' dati salvati su questo mese?
      // (busta, conteggio, extra, tfr, ore o movimenti) -> non vanno mai nascosti.
      var righeMeseData = results[3].data || [];
      var movMeseData = results[4].data || [];
      var movCountByStaff = {};
      movMeseData.forEach(function(m) {
        movCountByStaff[m.staff_id] = (movCountByStaff[m.staff_id] || 0) + 1;
      });
      var hasDati = {};
      righeMeseData.forEach(function(r) {
        var ha = (r.busta_prova !== null && r.busta_prova !== undefined)
          || (r.busta_definitiva !== null && r.busta_definitiva !== undefined)
          || parseNum(r.conteggio_euro) > 0
          || parseNum(r.extra) !== 0
          || parseNum(r.tfr) !== 0
          || parseNum(r.ore) > 0
          || (movCountByStaff[r.staff_id] > 0);
        if (ha) hasDati[r.staff_id] = true;
      });

      // L'organico del mese si basa sul CONTRATTO (non sullo stato attuale):
      // entra chi era assunto in quel mese. In piu' mostro chi ha gia' dati salvati.
      var membersData = (results[0].data || []).filter(function(p) {
        if (!p.staff) return false;
        return (p.attivo && lavoraNelMese(p.staff)) || hasDati[p.staff_id];
      });

      // Ordina per settore poi cognome
      membersData.sort(function(a, b) {
        var sa = (a.settore_paghe || 'zzz').toLowerCase();
        var sb = (b.settore_paghe || 'zzz').toLowerCase();
        if (sa !== sb) return sa < sb ? -1 : 1;
        var na = (a.staff.last_name + ' ' + a.staff.first_name).toLowerCase();
        var nb = (b.staff.last_name + ' ' + b.staff.first_name).toLowerCase();
        return na < nb ? -1 : 1;
      });
      setMembers(membersData);

      // Mappa storico stipendi
      var mapStip = {};
      (results[1].data || []).forEach(function(s) {
        if (!mapStip[s.staff_id]) mapStip[s.staff_id] = [];
        mapStip[s.staff_id].push(s);
      });
      setStipendiStorico(mapStip);

      // Mappa storico tariffe
      var mapTar = {};
      (results[2].data || []).forEach(function(t) {
        if (!mapTar[t.staff_id]) mapTar[t.staff_id] = [];
        mapTar[t.staff_id].push(t);
      });
      setTariffeStorico(mapTar);

      setRighe(results[3].data || []);

      // Mappa movimenti
      var mapMov = {};
      (results[4].data || []).forEach(function(m) {
        if (!mapMov[m.staff_id]) mapMov[m.staff_id] = [];
        mapMov[m.staff_id].push(m);
      });
      setMovimenti(mapMov);

      // Calcola "restano in contanti" del mese scorso = totale_scorso - busta_scorsa - contanti_dati_scorso
      var righeScorse = results[5].data || [];
      var movScorsi = results[6].data || [];
      var mapResto = {};

      var contantiScorsiPerStaff = {};
      movScorsi.forEach(function(m) {
        if (m.tipo === 'contanti' || m.tipo === 'anticipo') {
          contantiScorsiPerStaff[m.staff_id] = (contantiScorsiPerStaff[m.staff_id] || 0) + parseNum(m.importo);
        }
      });

      righeScorse.forEach(function(r) {
        var totale = parseNum(r.conteggio_euro) + parseNum(r.extra) + parseNum(r.riporto_precedente) + parseNum(r.tfr);
        var busta = r.busta_definitiva !== null && r.busta_definitiva !== undefined
          ? parseNum(r.busta_definitiva)
          : parseNum(r.busta_prova);
        var contanti = contantiScorsiPerStaff[r.staff_id] || 0;
        var resto = totale - busta - contanti;
        mapResto[r.staff_id] = resto;
      });
      setMeseScorsoMap(mapResto);

      // Genera righe automatiche per i dipendenti che non ne hanno una nel mese
      autoGenerateRighe(membersData, results[3].data || [], mapResto, mapStip, mapTar);

      setLoading(false);
    });
  }

  // Un dipendente "lavora nel mese" se il suo contratto copre il mese selezionato:
  // assunto entro la fine del mese e non cessato prima dell'inizio del mese.
  function lavoraNelMese(staff) {
    if (!staff) return false;
    var mm = String(mese).padStart(2, '0');
    var primo = anno + '-' + mm + '-01';
    var ultimo = anno + '-' + mm + '-31';
    var assunto = staff.hire_date ? String(staff.hire_date).slice(0, 10) : null;
    var cessato = staff.contract_end_date ? String(staff.contract_end_date).slice(0, 10) : null;
    if (assunto && assunto > ultimo) return false;   // assunto dopo il mese
    if (cessato && cessato < primo) return false;    // cessato prima del mese
    return true;
  }

  // Calcola conteggio_euro suggerito (resort: stipendio vigente; campagna: ore x tariffa)
  function suggestConteggio(profilo, stipendi, tariffe, ore) {
    var dataValuta = anno + '-' + String(mese).padStart(2, '0') + '-01';

    if (profilo.tipo === 'resort') {
      var stip = (stipendi || []).find(function(s) { return s.valido_dal <= dataValuta; });
      return stip ? parseNum(stip.importo_mensile) : 0;
    } else {
      var tar = (tariffe || []).find(function(t) { return t.valido_dal <= dataValuta; });
      if (!tar) return 0;
      return parseNum(ore) * parseNum(tar.tariffa_oraria);
    }
  }

  // Crea automaticamente righe mancanti
  function autoGenerateRighe(membersData, righeEsistenti, mapResto, mapStip, mapTar) {
    var existingByStaff = {};
    righeEsistenti.forEach(function(r) { existingByStaff[r.staff_id] = true; });

    var nuove = [];
    membersData.forEach(function(p) {
      if (!existingByStaff[p.staff_id]) {
        var riporto = mapResto[p.staff_id] || 0;
        var conteggio = suggestConteggio(p, mapStip[p.staff_id], mapTar[p.staff_id], 0);
        nuove.push({
          staff_id: p.staff_id,
          anno: anno,
          mese: mese,
          ore: null,
          conteggio_euro: p.tipo === 'resort' ? conteggio : null,
          extra: 0,
          riporto_precedente: riporto,
          tfr: 0,
          busta_prova: null,
          busta_definitiva: null
        });
      }
    });

    if (nuove.length === 0) return;

    supabase
      .from('stip_mesi')
      .insert(nuove)
      .select()
      .then(function(res) {
        if (!res.error && res.data) {
          setRighe(function(prev) { return prev.concat(res.data); });
        }
      });
  }

  function getRiga(staffId) {
    return righe.find(function(r) { return r.staff_id === staffId; });
  }

  function getProfilo(staffId) {
    return members.find(function(m) { return m.staff_id === staffId; });
  }

  // Il dipendente passa il filtro nominativo? (filtro vuoto = passano tutti)
  // Confronta sia "Cognome Nome" sia "Nome Cognome" per comodita'.
  function nomeMatch(staffId) {
    var q = filtroNome.trim().toLowerCase();
    if (!q) return true;
    var p = getProfilo(staffId);
    if (!p || !p.staff) return false;
    var cognome = (p.staff.last_name || '').toLowerCase();
    var nome = (p.staff.first_name || '').toLowerCase();
    var a = (cognome + ' ' + nome).trim();
    var b = (nome + ' ' + cognome).trim();
    return a.indexOf(q) !== -1 || b.indexOf(q) !== -1;
  }

  function totaleRiga(riga) {
    if (!riga) return 0;
    return parseNum(riga.conteggio_euro) + parseNum(riga.extra) + parseNum(riga.riporto_precedente) + parseNum(riga.tfr);
  }

  function bustaDaUsare(riga) {
    if (!riga) return 0;
    return riga.busta_definitiva !== null && riga.busta_definitiva !== undefined
      ? parseNum(riga.busta_definitiva)
      : parseNum(riga.busta_prova);
  }

  function sommaBonifici(staffId) {
    var movs = movimenti[staffId] || [];
    return movs.filter(function(m) { return m.tipo === 'bonifico'; })
      .reduce(function(sum, m) { return sum + parseNum(m.importo); }, 0);
  }

  function sommaContanti(staffId) {
    var movs = movimenti[staffId] || [];
    return movs.filter(function(m) { return m.tipo === 'contanti' || m.tipo === 'anticipo'; })
      .reduce(function(sum, m) { return sum + parseNum(m.importo); }, 0);
  }

  function restanoDaBonificare(riga) {
    if (!riga) return 0;
    return bustaDaUsare(riga) - sommaBonifici(riga.staff_id);
  }

  function restanoInContanti(riga) {
    if (!riga) return 0;
    return totaleRiga(riga) - bustaDaUsare(riga) - sommaContanti(riga.staff_id);
  }

  function updateRigaField(staffId, field, value) {
    var riga = getRiga(staffId);
    if (!riga) return;

    var newVal = value === '' ? null : parseNum(value);

    // Aggiorna localmente subito (per reattivita')
    setRighe(function(prev) {
      return prev.map(function(r) {
        if (r.id === riga.id) {
          var nr = {};
          for (var k in r) nr[k] = r[k];
          nr[field] = newVal;
          // Se cambiano ore o tariffa/stipendio, ricalcola conteggio per la campagna
          if (field === 'ore') {
            var prof = getProfilo(staffId);
            if (prof && prof.tipo === 'campagna') {
              nr.conteggio_euro = suggestConteggio(prof, stipendiStorico[staffId], tariffeStorico[staffId], newVal);
            }
          }
          return nr;
        }
        return r;
      });
    });

    // Persisti su DB
    var payload = {};
    payload[field] = newVal;
    if (field === 'ore') {
      var prof2 = getProfilo(staffId);
      if (prof2 && prof2.tipo === 'campagna') {
        payload.conteggio_euro = suggestConteggio(prof2, stipendiStorico[staffId], tariffeStorico[staffId], newVal);
      }
    }
    supabase.from('stip_mesi').update(payload).eq('id', riga.id).then(function(res) {
      if (res.error) {
        console.error('Errore aggiornamento riga:', res.error);
      }
    });
  }

  function deleteRiga(staffId) {
    var riga = getRiga(staffId);
    if (!riga) return;
    if (!confirm('Rimuovere questa riga dal mese? I movimenti del dipendente di questo mese saranno eliminati.')) return;

    // Rimuovi anche i movimenti
    Promise.all([
      supabase.from('stip_movimenti').delete().eq('staff_id', staffId).eq('anno', anno).eq('mese', mese),
      supabase.from('stip_mesi').delete().eq('id', riga.id)
    ]).then(function() {
      setRighe(function(prev) { return prev.filter(function(r) { return r.id !== riga.id; }); });
      setMovimenti(function(prev) {
        var next = {};
        for (var k in prev) if (k !== staffId) next[k] = prev[k];
        return next;
      });
    });
  }

  function aggiungiDipendente(staffId) {
    var p = members.find(function(m) { return m.staff_id === staffId; });
    if (!p) return;
    var conteggio = suggestConteggio(p, stipendiStorico[staffId], tariffeStorico[staffId], 0);
    var riporto = meseScorsoMap[staffId] || 0;
    supabase
      .from('stip_mesi')
      .insert({
        staff_id: staffId,
        anno: anno,
        mese: mese,
        conteggio_euro: p.tipo === 'resort' ? conteggio : null,
        extra: 0,
        riporto_precedente: riporto,
        tfr: 0
      })
      .select()
      .single()
      .then(function(res) {
        if (!res.error && res.data) {
          setRighe(function(prev) { return prev.concat([res.data]); });
          setShowAddDipendente(false);
        }
      });
  }

  function ricaricaRiporto(staffId) {
    var riga = getRiga(staffId);
    if (!riga) return;
    var nuovoRiporto = meseScorsoMap[staffId] || 0;
    updateRigaField(staffId, 'riporto_precedente', nuovoRiporto);
  }

  // Quante righe hanno un "mese precedente" diverso dal "restano" reale del mese scorso?
  function contaRiportiDaAggiornare() {
    var n = 0;
    righe.forEach(function(r) {
      var atteso = meseScorsoMap[r.staff_id] || 0;
      if (Math.abs(parseNum(r.riporto_precedente) - atteso) > 0.01) n++;
    });
    return n;
  }

  // Allinea tutti i riporti al "restano in contanti" reale del mese scorso.
  function aggiornaTuttiRiporti() {
    righe.forEach(function(r) {
      var atteso = meseScorsoMap[r.staff_id] || 0;
      if (Math.abs(parseNum(r.riporto_precedente) - atteso) > 0.01) {
        updateRigaField(r.staff_id, 'riporto_precedente', atteso);
      }
    });
  }

  // Navigazione mese
  function meseProx() {
    if (mese === 12) { setAnno(anno + 1); setMese(1); } else { setMese(mese + 1); }
  }
  function mesePrec() {
    if (mese === 1) { setAnno(anno - 1); setMese(12); } else { setMese(mese - 1); }
  }

  // Totali colonna
  function totaliColonna() {
    var tot = { conteggio: 0, extra: 0, riporto: 0, tfr: 0, totale: 0, busta: 0, bonifici: 0, contanti: 0, restanoBon: 0, restanoCnt: 0 };
    righe.forEach(function(r) {
      if (!nomeMatch(r.staff_id)) return;
      tot.conteggio += parseNum(r.conteggio_euro);
      tot.extra += parseNum(r.extra);
      tot.riporto += parseNum(r.riporto_precedente);
      tot.tfr += parseNum(r.tfr);
      tot.totale += totaleRiga(r);
      tot.busta += bustaDaUsare(r);
      tot.bonifici += sommaBonifici(r.staff_id);
      tot.contanti += sommaContanti(r.staff_id);
      tot.restanoBon += restanoDaBonificare(r);
      tot.restanoCnt += restanoInContanti(r);
    });
    return tot;
  }

  // Apre/chiude un settore
  function toggleSettore(settore) {
    setCollassati(function(prev) {
      var next = {};
      for (var k in prev) next[k] = prev[k];
      next[settore] = !next[settore];
      return next;
    });
  }

  function chiudiTutti(settori) {
    var next = {};
    settori.forEach(function(s) { next[s] = true; });
    setCollassati(next);
  }

  function apriTutti() {
    setCollassati({});
  }

  // Subtotali di un settore (stessa forma dei totali di colonna)
  function totaliLista(lista) {
    var t = { ore: 0, conteggio: 0, extra: 0, riporto: 0, tfr: 0, totale: 0, busta: 0, bonifici: 0, contanti: 0, restanoBon: 0, restanoCnt: 0 };
    lista.forEach(function(item) {
      var r = item.riga;
      t.ore += parseNum(r.ore);
      t.conteggio += parseNum(r.conteggio_euro);
      t.extra += parseNum(r.extra);
      t.riporto += parseNum(r.riporto_precedente);
      t.tfr += parseNum(r.tfr);
      t.totale += totaleRiga(r);
      t.busta += bustaDaUsare(r);
      t.bonifici += sommaBonifici(r.staff_id);
      t.contanti += sommaContanti(r.staff_id);
      t.restanoBon += restanoDaBonificare(r);
      t.restanoCnt += restanoInContanti(r);
    });
    return t;
  }

  // Dipendenti con profilo che NON sono ancora nella lista del mese
  function dipendentiAggiungibili() {
    var inMese = {};
    righe.forEach(function(r) { inMese[r.staff_id] = true; });
    return members.filter(function(m) { return !inMese[m.staff_id]; });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">Caricamento mese...</div>
      </div>
    );
  }

  var tot = totaliColonna();
  var aggiungibili = dipendentiAggiungibili();

  // Conteggi "visibili" (rispettano il filtro nominativo) per la card in alto.
  var righeVisibili = righe.filter(function(r) { return nomeMatch(r.staff_id); });
  var membersVisibili = members.filter(function(m) { return nomeMatch(m.staff_id); });

  // Raggruppa righe per settore (in ordine: come da members),
  // includendo solo i nominativi che passano il filtro.
  var righePerSettore = {};
  members.forEach(function(p) {
    if (!nomeMatch(p.staff_id)) return;
    var riga = getRiga(p.staff_id);
    if (!riga) return;
    var settore = p.settore_paghe || 'Altri';
    if (!righePerSettore[settore]) righePerSettore[settore] = [];
    righePerSettore[settore].push({ profilo: p, riga: riga });
  });

  var filtroAttivo = filtroNome.trim() !== '';

  return (
    <div className="p-4 sm:p-6 max-w-full">

      {/* Intestazione: titolo + selettore mese affiancati a sinistra */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Calendar size={26} className="text-wine-700" />
          Stipendi
        </h1>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1">
          <button onClick={mesePrec} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <div className="px-4 text-sm font-semibold text-gray-900 min-w-[160px] text-center">
            {MESI[mese - 1]} {anno}
          </div>
          <button onClick={meseProx} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* Riepilogo numerico */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Totale maturato</div>
          <div className="text-lg font-bold text-gray-900 mt-1">€ {fmtEuro(tot.totale)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Totale buste paga</div>
          <div className="text-lg font-bold text-gray-900 mt-1">€ {fmtEuro(tot.busta)}</div>
        </div>
        <div className="bg-white border border-blue-200 rounded-xl p-3">
          <div className="text-xs text-blue-700 uppercase tracking-wide flex items-center gap-1">
            <Banknote size={12} />
            Bonifici
          </div>
          <div className="text-lg font-bold text-blue-700 mt-1">€ {fmtEuro(tot.bonifici)}</div>
          <div className="text-xs text-gray-500">restano € {fmtEuro(tot.restanoBon)}</div>
        </div>
        <div className="bg-white border border-emerald-200 rounded-xl p-3">
          <div className="text-xs text-emerald-700 uppercase tracking-wide flex items-center gap-1">
            <Coins size={12} />
            Contanti dati
          </div>
          <div className="text-lg font-bold text-emerald-700 mt-1">€ {fmtEuro(tot.contanti)}</div>
          <div className={"text-xs " + (tot.restanoCnt < 0 ? "text-red-600" : "text-gray-500")}>
            restano € {fmtEuro(tot.restanoCnt)}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Dipendenti</div>
          <div className="text-lg font-bold text-gray-900 mt-1">
            {filtroAttivo ? (righeVisibili.length + '/' + membersVisibili.length) : (righe.length + '/' + members.length)}
          </div>
        </div>
      </div>

      {/* Avviso: riporti del mese precedente non allineati al "restano" reale */}
      {contaRiportiDaAggiornare() > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2">
            <RefreshCw size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              {contaRiportiDaAggiornare()} dipendenti hanno un "mese precedente" diverso dal valore
              "restano" reale del mese scorso (di solito perché questo mese era stato aperto prima
              di completare il precedente).
            </p>
          </div>
          <button
            onClick={aggiornaTuttiRiporti}
            className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">
            Aggiorna tutti i riporti
          </button>
        </div>
      )}

      {/* Pulsante aggiungi dipendente */}
      {aggiungibili.length > 0 && (
        <div className="mb-4">
          {!showAddDipendente ? (
            <button
              onClick={function() { setShowAddDipendente(true); }}
              className="flex items-center gap-2 text-sm text-wine-700 hover:text-wine-800 font-medium">
              <Plus size={16} />
              Aggiungi un dipendente al mese ({aggiungibili.length} disponibili)
            </button>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Quale dipendente vuoi aggiungere?</p>
                <button onClick={function() { setShowAddDipendente(false); }} className="text-gray-400 hover:text-gray-600">
                  <X size={18} />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {aggiungibili.map(function(p) {
                  return (
                    <button
                      key={p.staff_id}
                      onClick={function() { aggiungiDipendente(p.staff_id); }}
                      className="flex items-center gap-1 bg-gray-100 hover:bg-wine-100 hover:text-wine-700 text-gray-700 px-3 py-1.5 rounded-lg text-sm transition-colors">
                      <Plus size={12} />
                      {p.staff.last_name} {p.staff.first_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtro per nominativo (sola visualizzazione) */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={filtroNome}
            onChange={function(e) { setFiltroNome(e.target.value); }}
            placeholder="Filtra per nominativo..."
            className="w-72 max-w-full border border-gray-200 rounded-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
          {filtroAttivo && (
            <button
              onClick={function() { setFiltroNome(''); }}
              title="Mostra tutti"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded">
              <X size={15} />
            </button>
          )}
        </div>
        {filtroAttivo && (
          <span className="text-xs text-gray-500">
            Mostro solo chi contiene &ldquo;<span className="font-medium text-gray-700">{filtroNome}</span>&rdquo;.
            <button onClick={function() { setFiltroNome(''); }} className="ml-1 text-wine-700 hover:underline">Mostra tutti</button>
          </span>
        )}
      </div>

      {/* Comandi apri/chiudi settori */}
      {Object.keys(righePerSettore).length > 0 && (
        <div className="mb-2 flex items-center gap-3 text-xs">
          <span className="text-gray-400">Settori:</span>
          <button onClick={apriTutti} className="text-wine-700 hover:underline font-medium">Apri tutti</button>
          <button onClick={function() { chiudiTutti(Object.keys(righePerSettore)); }} className="text-wine-700 hover:underline font-medium">Chiudi tutti</button>
        </div>
      )}

      {/* Tabella */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border-separate border-spacing-0">
            <thead className="text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="sticky top-0 left-0 z-30 bg-gray-50 border-b border-r border-gray-200 px-3 py-2 text-left">Nominativo</th>
                <th className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-3 py-2 text-right">Ore</th>
                <th className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-3 py-2 text-right">Conteggio €</th>
                <th className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-3 py-2 text-right">Extra</th>
                <th className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-3 py-2 text-right" title="Restano in contanti dal mese precedente">Mese prec.</th>
                <th className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-3 py-2 text-right">TFR</th>
                <th className="sticky top-0 z-20 bg-gray-100 border-b border-gray-200 px-3 py-2 text-right">Totale</th>
                <th className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-3 py-2 text-right">Busta</th>
                <th className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-3 py-2 text-right" title="Totale - Busta paga">Diff.</th>
                <th className="sticky top-0 z-20 bg-blue-50 border-b border-gray-200 px-3 py-2 text-right">Bonifici</th>
                <th className="sticky top-0 z-20 bg-blue-50 border-b border-gray-200 px-3 py-2 text-right" title="Busta - Bonifici">Da bonif.</th>
                <th className="sticky top-0 z-20 bg-emerald-50 border-b border-gray-200 px-3 py-2 text-right">Contanti</th>
                <th className="sticky top-0 z-20 bg-emerald-50 border-b border-gray-200 px-3 py-2 text-right" title="Totale - Busta - Contanti">Restano</th>
                <th className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(righePerSettore).length === 0 && filtroAttivo && (
                <tr>
                  <td colSpan={14} className="px-3 py-8 text-center text-gray-400 italic">
                    Nessun nominativo corrisponde a &ldquo;{filtroNome}&rdquo;.
                    <button onClick={function() { setFiltroNome(''); }} className="ml-1 text-wine-700 hover:underline not-italic">Mostra tutti</button>
                  </td>
                </tr>
              )}
              {Object.keys(righePerSettore).length === 0 && !filtroAttivo && (
                <tr>
                  <td colSpan={14} className="px-3 py-8 text-center text-gray-400 italic">
                    Nessun dipendente configurato. Vai su Stipendi → Dipendenti per impostare i profili paghe.
                  </td>
                </tr>
              )}
              {Object.keys(righePerSettore).map(function(settore) {
                var lista = righePerSettore[settore];
                var isCollapsed = !!collassati[settore];
                var st = totaliLista(lista);
                var diffSet = st.totale - st.busta;
                return (
                  <Fragment key={'sett-' + settore}>
                    <tr
                      onClick={function() { toggleSettore(settore); }}
                      className="bg-wine-50 cursor-pointer hover:bg-wine-100 select-none">
                      {isCollapsed ? (
                        <>
                          <td className="sticky left-0 z-10 bg-wine-50 border-r border-gray-100 px-3 py-1.5 text-xs font-semibold text-wine-800 uppercase tracking-wide whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <ChevronRight size={14} className="text-wine-500 flex-shrink-0" />
                              {settore} <span className="text-wine-500 font-normal">({lista.length})</span>
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-wine-800 whitespace-nowrap">{st.ore > 0 ? st.ore : ''}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-wine-900 whitespace-nowrap">{fmtEuro(st.conteggio)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-wine-800 whitespace-nowrap">{fmtEuro(st.extra)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-wine-800 whitespace-nowrap">{fmtEuro(st.riporto)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-wine-800 whitespace-nowrap">{fmtEuro(st.tfr)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-bold text-wine-900 bg-wine-100 whitespace-nowrap">{fmtEuro(st.totale)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-wine-800 whitespace-nowrap">{fmtEuro(st.busta)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-wine-800 whitespace-nowrap">{Math.abs(diffSet) < 0.01 ? '—' : (diffSet > 0 ? '+' : '') + fmtEuro(diffSet)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-blue-700 bg-blue-50 whitespace-nowrap">{fmtEuro(st.bonifici)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-blue-700 bg-blue-50 whitespace-nowrap">{fmtEuro(st.restanoBon)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-emerald-700 bg-emerald-50 whitespace-nowrap">{fmtEuro(st.contanti)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-emerald-700 bg-emerald-50 whitespace-nowrap">{fmtEuro(st.restanoCnt)}</td>
                          <td className="px-3 py-1.5 bg-wine-50"></td>
                        </>
                      ) : (
                        <td colSpan={14} className="sticky left-0 z-10 bg-wine-50 px-3 py-1.5 text-xs font-semibold text-wine-800 uppercase tracking-wide">
                          <div className="flex items-center gap-1">
                            <ChevronDown size={14} className="text-wine-500 flex-shrink-0" />
                            {settore} <span className="text-wine-500 font-normal">({lista.length})</span>
                          </div>
                        </td>
                      )}
                    </tr>
                    {!isCollapsed && lista.map(function(item) {
                      var p = item.profilo;
                      var r = item.riga;
                      var diff = totaleRiga(r) - bustaDaUsare(r);
                      var rest = restanoInContanti(r);
                      var restBon = restanoDaBonificare(r);

                      // Avviso se il riporto registrato sulla riga differisce da quello atteso
                      var riportoAtteso = meseScorsoMap[p.staff_id] || 0;
                      var riportoDiverso = Math.abs(parseNum(r.riporto_precedente) - riportoAtteso) > 0.01;

                      return (
                        <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="sticky left-0 z-10 bg-white border-r border-gray-100 px-3 py-2 whitespace-nowrap font-medium text-gray-900">
                            <div className="flex items-center gap-1.5">
                              <span className={
                                'w-1.5 h-1.5 rounded-full ' +
                                (p.tipo === 'campagna' ? 'bg-emerald-500' : 'bg-blue-500')
                              }></span>
                              {p.staff.last_name} {p.staff.first_name}
                            </div>
                          </td>
                          <td className="px-2 py-1">
                            {p.tipo === 'campagna' ? (
                              <input type="number" step="0.5"
                                value={r.ore === null || r.ore === undefined ? '' : r.ore}
                                onChange={function(e) { updateRigaField(p.staff_id, 'ore', e.target.value); }}
                                className="w-16 text-right bg-transparent border border-transparent hover:border-gray-200 focus:border-wine-300 rounded px-1 py-1 focus:outline-none" />
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            <input type="number" step="0.01"
                              value={r.conteggio_euro === null || r.conteggio_euro === undefined ? '' : r.conteggio_euro}
                              onChange={function(e) { updateRigaField(p.staff_id, 'conteggio_euro', e.target.value); }}
                              className="w-24 text-right bg-transparent border border-transparent hover:border-gray-200 focus:border-wine-300 rounded px-1 py-1 focus:outline-none" />
                          </td>
                          <td className="px-2 py-1">
                            <input type="number" step="0.01"
                              value={r.extra === null || r.extra === undefined ? '' : r.extra}
                              onChange={function(e) { updateRigaField(p.staff_id, 'extra', e.target.value); }}
                              className="w-20 text-right bg-transparent border border-transparent hover:border-gray-200 focus:border-wine-300 rounded px-1 py-1 focus:outline-none" />
                          </td>
                          <td className="px-2 py-1 relative">
                            <input type="number" step="0.01"
                              value={r.riporto_precedente === null || r.riporto_precedente === undefined ? '' : r.riporto_precedente}
                              onChange={function(e) { updateRigaField(p.staff_id, 'riporto_precedente', e.target.value); }}
                              className={
                                'w-20 text-right bg-transparent border border-transparent hover:border-gray-200 focus:border-wine-300 rounded px-1 py-1 focus:outline-none ' +
                                (riportoDiverso ? 'text-amber-700' : '')
                              } />
                            {riportoDiverso && (
                              <button
                                onClick={function() { ricaricaRiporto(p.staff_id); }}
                                title={'Il mese scorso ora segna ' + fmtEuro(riportoAtteso) + '. Clicca per aggiornare.'}
                                className="absolute -right-0.5 top-1/2 -translate-y-1/2 p-0.5 text-amber-600 hover:bg-amber-100 rounded">
                                <RefreshCw size={12} />
                              </button>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            <input type="number" step="0.01"
                              value={r.tfr === null || r.tfr === undefined ? '' : r.tfr}
                              onChange={function(e) { updateRigaField(p.staff_id, 'tfr', e.target.value); }}
                              className="w-20 text-right bg-transparent border border-transparent hover:border-gray-200 focus:border-wine-300 rounded px-1 py-1 focus:outline-none" />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900 bg-gray-50 whitespace-nowrap">
                            {fmtEuro(totaleRiga(r))}
                          </td>
                          <td className="px-2 py-1">
                            <input type="number" step="0.01"
                              value={
                                r.busta_definitiva !== null && r.busta_definitiva !== undefined
                                  ? r.busta_definitiva
                                  : (r.busta_prova !== null && r.busta_prova !== undefined ? r.busta_prova : '')
                              }
                              onChange={function(e) { updateRigaField(p.staff_id, 'busta_definitiva', e.target.value); }}
                              title={
                                (r.busta_definitiva === null || r.busta_definitiva === undefined) && (r.busta_prova !== null && r.busta_prova !== undefined)
                                  ? 'Valore della busta di prova. Scrivi qui la busta finale per confermarlo.'
                                  : ''
                              }
                              className={
                                'w-24 text-right bg-transparent border border-transparent hover:border-gray-200 focus:border-wine-300 rounded px-1 py-1 focus:outline-none ' +
                                ((r.busta_definitiva === null || r.busta_definitiva === undefined) && (r.busta_prova !== null && r.busta_prova !== undefined)
                                  ? 'text-gray-400 italic'
                                  : 'text-gray-900')
                              } />
                          </td>
                          <td className={
                            "px-3 py-2 text-right whitespace-nowrap font-medium " +
                            (Math.abs(diff) < 0.01 ? "text-gray-400" : (diff > 0 ? "text-emerald-600" : "text-red-600"))
                          }>
                            {Math.abs(diff) < 0.01 ? '—' : (diff > 0 ? '+' : '') + fmtEuro(diff)}
                          </td>
                          <td className="px-2 py-2 text-right bg-blue-50">
                            <button
                              onClick={function() { setMovPopup({ staff_id: p.staff_id, tipo: 'bonifico' }); }}
                              className="text-blue-700 hover:text-blue-900 font-medium underline decoration-dotted">
                              {fmtEuro(sommaBonifici(p.staff_id))}
                            </button>
                          </td>
                          <td className={
                            "px-3 py-2 text-right whitespace-nowrap bg-blue-50 " +
                            (Math.abs(restBon) < 0.01 ? "text-gray-400" : (restBon > 0 ? "text-blue-700 font-medium" : "text-red-600"))
                          }>
                            {Math.abs(restBon) < 0.01 ? '✓' : fmtEuro(restBon)}
                          </td>
                          <td className="px-2 py-2 text-right bg-emerald-50">
                            <button
                              onClick={function() { setMovPopup({ staff_id: p.staff_id, tipo: 'contanti' }); }}
                              className="text-emerald-700 hover:text-emerald-900 font-medium underline decoration-dotted">
                              {fmtEuro(sommaContanti(p.staff_id))}
                            </button>
                          </td>
                          <td className={
                            "px-3 py-2 text-right whitespace-nowrap bg-emerald-50 font-medium " +
                            (Math.abs(rest) < 0.01 ? "text-gray-400" : (rest > 0 ? "text-emerald-700" : "text-red-600"))
                          }>
                            {Math.abs(rest) < 0.01 ? '✓' : (rest > 0 ? '' : '') + fmtEuro(rest)}
                          </td>
                          <td className="px-2 py-2">
                            <button
                              onClick={function() { deleteRiga(p.staff_id); }}
                              title="Rimuovi riga"
                              className="p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}

              {/* Riga totali */}
              {righeVisibili.length > 0 && (
                <tr className="bg-gray-100 border-t-2 border-gray-300 font-semibold">
                  <td className="sticky left-0 z-10 bg-gray-100 border-r border-gray-200 px-3 py-2 text-gray-700">TOTALI</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtEuro(tot.conteggio)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtEuro(tot.extra)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtEuro(tot.riporto)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtEuro(tot.tfr)}</td>
                  <td className="px-3 py-2 text-right text-gray-900 bg-gray-200">{fmtEuro(tot.totale)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtEuro(tot.busta)}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right text-blue-700 bg-blue-100">{fmtEuro(tot.bonifici)}</td>
                  <td className="px-3 py-2 text-right text-blue-700 bg-blue-100">{fmtEuro(tot.restanoBon)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700 bg-emerald-100">{fmtEuro(tot.contanti)}</td>
                  <td className={"px-3 py-2 text-right bg-emerald-100 " + (tot.restanoCnt < 0 ? "text-red-600" : "text-emerald-700")}>
                    {fmtEuro(tot.restanoCnt)}
                  </td>
                  <td className="px-3 py-2"></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Popup movimenti */}
      {movPopup && (
        <MovimentiPopup
          staffId={movPopup.staff_id}
          tipo={movPopup.tipo}
          anno={anno}
          mese={mese}
          dipendente={members.find(function(m) { return m.staff_id === movPopup.staff_id; })}
          movimenti={(movimenti[movPopup.staff_id] || []).filter(function(m) {
            return movPopup.tipo === 'bonifico'
              ? m.tipo === 'bonifico'
              : (m.tipo === 'contanti' || m.tipo === 'anticipo');
          })}
          onClose={function() { setMovPopup(null); }}
          onAdded={function(nuovo) {
            setMovimenti(function(prev) {
              var copy = {};
              for (var k in prev) copy[k] = prev[k].slice();
              if (!copy[nuovo.staff_id]) copy[nuovo.staff_id] = [];
              copy[nuovo.staff_id].push(nuovo);
              return copy;
            });
          }}
          onDeleted={function(idDel, staffIdDel) {
            setMovimenti(function(prev) {
              var copy = {};
              for (var k in prev) copy[k] = prev[k].slice();
              if (copy[staffIdDel]) {
                copy[staffIdDel] = copy[staffIdDel].filter(function(m) { return m.id !== idDel; });
              }
              return copy;
            });
          }}
        />
      )}

      <div className="h-8" />
    </div>
  );
}

// ============================================================
// POPUP MOVIMENTI (bonifici o contanti)
// ============================================================

function MovimentiPopup(props) {
  var staffId = props.staffId;
  var tipo = props.tipo;
  var anno = props.anno;
  var mese = props.mese;
  var dipendente = props.dipendente;
  var movimenti = props.movimenti;
  var onClose = props.onClose;
  var onAdded = props.onAdded;
  var onDeleted = props.onDeleted;

  var [data, setData] = useState(todayIso());
  var [importo, setImporto] = useState('');
  var [nota, setNota] = useState('');
  var [saving, setSaving] = useState(false);

  var isContanti = tipo === 'contanti';
  var titolo = isContanti ? 'Contanti dati' : 'Bonifici fatti';
  var color = isContanti ? 'emerald' : 'blue';

  function aggiungi() {
    if (!importo || !data) {
      alert('Inserisci data e importo.');
      return;
    }
    var imp = parseNum(importo);
    if (imp === 0) {
      alert('L\'importo deve essere diverso da zero.');
      return;
    }
    setSaving(true);
    supabase
      .from('stip_movimenti')
      .insert({
        staff_id: staffId,
        anno: anno,
        mese: mese,
        tipo: tipo === 'bonifico' ? 'bonifico' : 'contanti',
        importo: imp,
        data_movimento: data,
        note: nota.trim() || null
      })
      .select()
      .single()
      .then(function(res) {
        setSaving(false);
        if (res.error) {
          alert('Errore: ' + res.error.message);
          return;
        }
        onAdded(res.data);
        setImporto('');
        setNota('');
        setData(todayIso());
      });
  }

  function elimina(id) {
    if (!confirm('Eliminare questo movimento?')) return;
    supabase
      .from('stip_movimenti')
      .delete()
      .eq('id', id)
      .then(function(res) {
        if (res.error) {
          alert('Errore: ' + res.error.message);
          return;
        }
        onDeleted(id, staffId);
      });
  }

  var totale = movimenti.reduce(function(s, m) { return s + parseNum(m.importo); }, 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={function(e) { e.stopPropagation(); }}>

        {/* Header */}
        <div className={'border-b border-gray-200 px-5 py-4 flex items-center justify-between ' + (isContanti ? 'bg-emerald-50' : 'bg-blue-50')}>
          <div>
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              {isContanti ? <Coins size={18} className="text-emerald-700" /> : <Banknote size={18} className="text-blue-700" />}
              {titolo}
            </h2>
            {dipendente && dipendente.staff && (
              <p className="text-xs text-gray-500 mt-0.5">
                {dipendente.staff.last_name} {dipendente.staff.first_name} — {MESI[mese - 1]} {anno}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Lista movimenti */}
        <div className="flex-1 overflow-y-auto p-4">
          {movimenti.length === 0 ? (
            <p className="text-sm text-gray-400 italic text-center py-6">Nessun movimento registrato.</p>
          ) : (
            <div className="space-y-2">
              {movimenti.map(function(m) {
                return (
                  <div key={m.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 w-12 font-medium">{fmtDate(m.data_movimento)}</div>
                    <div className="flex-1 min-w-0">
                      <div className={'font-semibold ' + (isContanti ? 'text-emerald-700' : 'text-blue-700')}>€ {fmtEuro(m.importo)}</div>
                      {m.note && <div className="text-xs text-gray-500 mt-0.5">{m.note}</div>}
                    </div>
                    <button
                      onClick={function() { elimina(m.id); }}
                      className="p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-700">Totale</span>
                <span className={'font-bold ' + (isContanti ? 'text-emerald-700' : 'text-blue-700')}>€ {fmtEuro(totale)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Form aggiunta */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Aggiungi movimento</p>
          <div className="grid grid-cols-12 gap-2">
            <input type="date" value={data} onChange={function(e) { setData(e.target.value); }}
              className="col-span-5 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
            <input type="number" step="0.01" placeholder="Importo €" value={importo}
              onChange={function(e) { setImporto(e.target.value); }}
              className="col-span-4 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
            <button onClick={aggiungi} disabled={saving}
              className={'col-span-3 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1 ' + (isContanti ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700')}>
              <Plus size={14} />
              {saving ? '...' : 'Aggiungi'}
            </button>
            <input type="text" placeholder="Nota (opzionale)" value={nota}
              onChange={function(e) { setNota(e.target.value); }}
              className="col-span-12 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine-300" />
          </div>
        </div>
      </div>
    </div>
  );
}
