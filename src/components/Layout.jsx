import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import ConfermaPin from './ConfermaPin';

// ============================================================
// SOGLIA DI ALLARME SINCRONIZZAZIONE HOTEL IN CLOUD
//
// Il PC della reception aggiorna da solo alle 07, 11, 15, 19 e 23.
// Il piu' lungo silenzio LEGITTIMO e' la notte: 8 ore fra le 23:00 e
// le 07:00. Se pero' il risveglio dallo standby delle 23:00 non
// funziona, il buco vero diventa 19:00 -> 07:00, cioe' 12 ore.
//
// 14 e' il numero piu' basso che regge ANCHE quel caso: sotto le 12
// suonerebbe il falso allarme ogni mattina, e un avviso che grida al
// lupo ogni giorno smette di essere letto. Sopra le 18 un blocco
// iniziato la sera si scoprirebbe a meta' del giorno dopo.
// ============================================================
var SOGLIA_HIC_ORE = 14;

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

// Ore trascorse dall'ultimo giro andato a buon fine. null = mai.
function oreDaAggiornamento(valore) {
  if (!valore) return null;
  var d = new Date(valore);
  if (isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / 3600000;
}

function quandoBreve(valore) {
  var d = new Date(valore);
  if (isNaN(d.getTime())) return '';
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function daQuanto(ore) {
  if (ore >= 48) return Math.floor(ore / 24) + ' giorni';
  return Math.floor(ore) + ' ore';
}

export default function Layout({ children }) {
  var {
    profile, signOut, canView, canEdit,
    elevato, elevazione, secondiResidui,
    attivaElevazione, terminaElevazione
  } = useAuth();
  var navigate = useNavigate();
  var location = useLocation();
  var [mobileOpen, setMobileOpen] = useState(false);

  // Dispositivo condiviso: letto dal localStorage (impostato in ProfilePage).
  var [sharedDevice, setSharedDevice] = useState(function() {
    try { return localStorage.getItem('icg_shared_device') === '1'; } catch (e) { return false; }
  });

  // Preferenza di postazione: quale cassa mostrare a menu' su QUESTO
  // dispositivo. 'entrambe' | 'reception' | 'ristorante'. Impostata nel Profilo.
  // Non e' un permesso: filtra solo la visibilita' della voce nel menu'.
  var [cassaMenu, setCassaMenu] = useState(function() {
    try { return localStorage.getItem('icg_cassa_menu') || 'entrambe'; } catch (e) { return 'entrambe'; }
  });

  // Minuti di elevazione, letti da restaurant_settings (default 5).
  var [minutiElevazione, setMinutiElevazione] = useState(5);

  // Modale PIN per elevazione / rinnovo.
  var [showPinModal, setShowPinModal] = useState(false);

  // Ultimo giro di sincronizzazione HiC andato a buon fine.
  // NON lo calcoliamo qui: lo chiediamo alla funzione SQL
  // hic_ultimo_aggiornamento(), che e' l'unica copia della regola
  // (max(finito_il) dove esito = 'ok'). Se un giorno la regola cambia,
  // cambia in un posto solo.
  var [hicUltimo, setHicUltimo] = useState(null);
  var [hicLetto, setHicLetto] = useState(false);

  useEffect(function() {
    // Rileggo il flag "dispositivo condiviso" a ogni cambio pagina:
    // cosi' se lo attivi/disattivi nel profilo, il pulsante compare/sparisce.
    try { setSharedDevice(localStorage.getItem('icg_shared_device') === '1'); } catch (e) {}
    try { setCassaMenu(localStorage.getItem('icg_cassa_menu') || 'entrambe'); } catch (e) {}
  }, [location.pathname]);

  useEffect(function() {
    supabase.from('restaurant_settings')
      .select('elevazione_minuti')
      .limit(1)
      .then(function(result) {
        if (!result.error && result.data && result.data.length > 0) {
          var m = result.data[0].elevazione_minuti;
          if (m && m > 0) setMinutiElevazione(m);
        }
      });
  }, []);

  // Lettura della freschezza dei dati HiC: una volta all'apertura e poi
  // ogni 15 minuti. Non a ogni cambio pagina: sarebbe una richiesta a
  // vuoto ogni clic per un dato che cambia cinque volte al giorno.
  var vediHic = canView('hic_operativo') || canView('hic_economico');

  useEffect(function() {
    if (!vediHic) return;

    function leggiHic() {
      supabase.rpc('hic_ultimo_aggiornamento').then(function(res) {
        setHicLetto(true);
        if (res.error) {
          setHicUltimo(null);
          return;
        }
        setHicUltimo(res.data ? res.data : null);
      });
    }

    leggiHic();
    var timer = setInterval(leggiHic, 15 * 60 * 1000);
    return function() { clearInterval(timer); };
  }, [vediHic]);

  function handleSignOut() {
    signOut().then(function() {
      navigate('/login');
    });
  }

  function openEleva() {
    setShowPinModal(true);
  }

  function onPinConfirmed(info) {
    setShowPinModal(false);
    // Chiunque confermi con nick + PIN ottiene una finestra fresca
    // con i propri rami. Vale sia per l'ingresso sia per l'estensione.
    attivaElevazione(info, minutiElevazione);
  }

  function tornaAlBase() {
    terminaElevazione();
  }

  function formatTempo(sec) {
    if (sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function getRoleLabel(role) {
    var labels = {
      super_admin: 'Super Admin',
      proprieta: 'Proprietà',
      direttore: 'Direttore',
      reception: 'Reception',
      sala: 'Sala',
      cucina: 'Cucina'
    };
    return labels[role] || role;
  }

  var navLinkBase = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ';
  var navLinkActive = 'bg-wine-800 text-white';
  var navLinkInactive = 'text-wine-200 hover:bg-wine-800 hover:text-white';

  function navClass(isActive) {
    return navLinkBase + (isActive ? navLinkActive : navLinkInactive);
  }

  // Voce attenuata (per "Cassa OLD"): piu' piccola e spenta.
  function navClassOld(isActive) {
    var base = 'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ';
    return base + (isActive ? 'bg-wine-800 text-white' : 'text-wine-400 hover:bg-wine-800 hover:text-wine-200');
  }

  // Cassa attiva se siamo su una qualunque /cassa/...
  var cassaReceptionActive = location.pathname === '/cassa/reception' || location.pathname === '/cassa';
  var cassaRistoranteActive = location.pathname === '/cassa/ristorante';

  // La voce cassa compare a menu' se la preferenza di postazione la include.
  function cassaMenuMostra(quale) {
    return cassaMenu === 'entrambe' || cassaMenu === quale;
  }

  // Per il menu Stipendi: e' attivo se siamo su una qualunque sotto-pagina
  var stipendiActive = location.pathname.indexOf('/stipendi') === 0;

  // Per il menu Campagna: attivo su qualunque sotto-pagina campagna.
  var campagnaActive = location.pathname.indexOf('/campagna') === 0;

  // Campagna: ogni sotto-voce ha il suo permesso indipendente.
  var vediCampagnaRiepilogo = canView('campagna_riepilogo');
  var vediCampagnaImporta = canView('campagna_importa');
  var vediCampagnaStipendi = canView('campagna_stipendi');
  var vediCampagna = vediCampagnaRiepilogo || vediCampagnaImporta || vediCampagnaStipendi;
  // La voce principale porta alla prima sotto-pagina che l'utente puo' vedere.
  var campagnaLanding = vediCampagnaRiepilogo
    ? '/campagna/riepilogo'
    : (vediCampagnaImporta ? '/campagna/importa' : '/campagna/stipendi');

  var showAdminSection = canView('impostazioni');

  // Stato della sincronizzazione HiC.
  // hicMai = nessun giro andato mai a buon fine (la funzione torna vuoto).
  // hicFermo = superata la soglia. Il colore compare SOLO in questo caso:
  // se fosse sempre acceso diventerebbe arredamento e nessuno lo leggerebbe.
  var hicOre = oreDaAggiornamento(hicUltimo);
  var hicMai = vediHic && hicLetto && hicOre === null;
  var hicFermo = vediHic && hicLetto && (hicMai || hicOre > SOGLIA_HIC_ORE);

  // Percentuale della barra del timer (residuo su totale).
  var totaleSec = minutiElevazione * 60;
  var pct = (elevato && totaleSec > 0) ? Math.max(0, Math.min(100, Math.round(secondiResidui / totaleSec * 100))) : 0;
  var inScadenza = elevato && secondiResidui <= 20;

  var sidebarContent = (
    <div className="flex flex-col h-full">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-wine-800">
        <div className="text-white font-bold text-lg leading-tight">I Cacciagalli</div>
        <div className="text-wine-300 text-xs mt-0.5">Hospitality 2026</div>
      </div>

      {/* Navigazione principale */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">

        <div className="text-wine-400 text-xs font-semibold uppercase tracking-wider px-3 mb-2">Gestione</div>

        {canView('prenotazioni') && (
          <NavLink
            to="/prenotazioni"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">📅</span>
            Prenotazioni
          </NavLink>
        )}

        {canView('importa_prenotazioni') && (
          <NavLink
            to="/prenotazioni/importa"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">📥</span>
            Importa prenotazioni
          </NavLink>
        )}

        {canView('limiti') && (
          <NavLink
            to="/limiti"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🪑</span>
            Limiti coperti
          </NavLink>
        )}

        {/* Le DUE voci camere si distinguono per USO, non per tecnologia:
            "Dashboard Camere" e' l'analisi (fatturato, occupazione, canali),
            "Camere e colazioni" e' l'operativo del giorno (chi dorme stanotte,
            quante colazioni domattina). Entrambe leggono i dati di Hotel in
            Cloud, quindi mettere "HiC" nel nome di una sola direbbe il falso.
            E "Prenotazioni", qui dentro, e' il RISTORANTE: chi arriva nuovo
            non deve poterle confondere. */}
        {vediHic && (
          <NavLink
            to="/camere"
            end
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🛏️</span>
            Dashboard Camere
          </NavLink>
        )}

        {canView('hic_operativo') && (
          <NavLink
            to="/camere/oggi"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🌅</span>
            Camere e colazioni
          </NavLink>
        )}

        {canView('clienti') && (
          <NavLink
            to="/clienti"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">👥</span>
            Clienti
          </NavLink>
        )}

        {canView('sale') && (
          <NavLink
            to="/sale"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🗺️</span>
            Sale e Tavoli
          </NavLink>
        )}

        {canView('staff') && (
          <NavLink
            to="/staff"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🏷️</span>
            Staff
          </NavLink>
        )}

        {canView('turni') && (
          <NavLink
            to="/turni"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🗓️</span>
            Turni
          </NavLink>
        )}

        {/* Cassa: due casse separate. Compare se hai il permesso di QUELLA
            cassa E se la preferenza di postazione (Profilo) la include. */}
        {canView('cassa_reception') && cassaMenuMostra('reception') && (
          <NavLink
            to="/cassa/reception"
            className={function() { return navClass(cassaReceptionActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">💰</span>
            Cassa Reception
          </NavLink>
        )}

        {canView('cassa_ristorante') && cassaMenuMostra('ristorante') && (
          <NavLink
            to="/cassa/ristorante"
            className={function() { return navClass(cassaRistoranteActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🍽️</span>
            Cassa Ristorante
          </NavLink>
        )}

        {/* Cassaforte: permesso dedicato */}
        {canView('cassaforte') && (
          <NavLink
            to="/cassaforte"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🏦</span>
            Cassaforte
          </NavLink>
        )}

        {/* Variabili cassa: sale, tavoli, centri di costo */}
        {canView('variabili_cassa') && (
          <NavLink
            to="/variabili-cassa"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🧩</span>
            Variabili cassa
          </NavLink>
        )}

        {/* Centri di costo: dashboard + revisore */}
        {canView('centri_costo') && (
          <NavLink
            to="/centri-costo"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">📊</span>
            Centri di costo
          </NavLink>
        )}

        {canView('ordini_bordo') && (
          <NavLink
            to="/ordini-bordo"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🍹</span>
            Ordini Bordo
          </NavLink>
        )}

        {canView('listino_bordo') && (
          <NavLink
            to="/listino-bordo"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">📋</span>
            Listino Bordo
          </NavLink>
        )}

        {/* Gift Card ed esperienze — ognuna con permesso dedicato. */}
        {canView('gift_card') && (
          <NavLink
            to="/gift-card"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🎁</span>
            Gift Card
          </NavLink>
        )}

        {canView('wine_tour') && (
          <NavLink
            to="/wine-tour"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🍷</span>
            Wine Tour
          </NavLink>
        )}

        {canView('cooking_class') && (
          <NavLink
            to="/cooking-class"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">👨‍🍳</span>
            Cooking Class
          </NavLink>
        )}

        {/* Stipendi: voce principale + sotto-voci se attivo */}
        {canView('stipendi') && (
          <>
            <NavLink
              to="/stipendi/mese"
              className={function(p) {
                var isActive = p.isActive || location.pathname === '/stipendi';
                return navClass(isActive);
              }}
              onClick={function() { setMobileOpen(false); }}>
              <span className="text-base">💶</span>
              Stipendi
            </NavLink>
            {stipendiActive && (
              <div className="ml-3 pl-3 border-l border-wine-700 space-y-1">
                <NavLink
                  to="/stipendi/mese"
                  className={function(p) {
                    var base = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ';
                    return base + (p.isActive ? 'bg-wine-800 text-white' : 'text-wine-300 hover:text-white');
                  }}
                  onClick={function() { setMobileOpen(false); }}>
                  Mese
                </NavLink>
                <NavLink
                  to="/stipendi/buste"
                  className={function(p) {
                    var base = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ';
                    return base + (p.isActive ? 'bg-wine-800 text-white' : 'text-wine-300 hover:text-white');
                  }}
                  onClick={function() { setMobileOpen(false); }}>
                  Buste paga
                </NavLink>
                <NavLink
                  to="/stipendi/giornate"
                  className={function(p) {
                    var base = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ';
                    return base + (p.isActive ? 'bg-wine-800 text-white' : 'text-wine-300 hover:text-white');
                  }}
                  onClick={function() { setMobileOpen(false); }}>
                  Giornate
                </NavLink>
                <NavLink
                  to="/stipendi/dipendenti"
                  className={function(p) {
                    var isActive = p.isActive || location.pathname.indexOf('/stipendi/dipendenti') === 0;
                    var base = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ';
                    return base + (isActive ? 'bg-wine-800 text-white' : 'text-wine-300 hover:text-white');
                  }}
                  onClick={function() { setMobileOpen(false); }}>
                  Dipendenti
                </NavLink>
              </div>
            )}
          </>
        )}

        {/* Campagna: voce principale se almeno una sotto-voce e' concessa;
            ogni sotto-voce compare solo con il proprio permesso. */}
        {vediCampagna && (
          <>
            <NavLink
              to={campagnaLanding}
              className={function() { return navClass(campagnaActive); }}
              onClick={function() { setMobileOpen(false); }}>
              <span className="text-base">🌾</span>
              Campagna
            </NavLink>
            {campagnaActive && (
              <div className="ml-3 pl-3 border-l border-wine-700 space-y-1">
                {vediCampagnaRiepilogo && (
                  <NavLink
                    to="/campagna/riepilogo"
                    className={function(p) {
                      var base = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ';
                      return base + (p.isActive ? 'bg-wine-800 text-white' : 'text-wine-300 hover:text-white');
                    }}
                    onClick={function() { setMobileOpen(false); }}>
                    Riepilogo
                  </NavLink>
                )}
                {vediCampagnaImporta && (
                  <NavLink
                    to="/campagna/importa"
                    className={function(p) {
                      var base = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ';
                      return base + (p.isActive ? 'bg-wine-800 text-white' : 'text-wine-300 hover:text-white');
                    }}
                    onClick={function() { setMobileOpen(false); }}>
                    Importa
                  </NavLink>
                )}
                {vediCampagnaStipendi && (
                  <NavLink
                    to="/campagna/stipendi"
                    className={function(p) {
                      var base = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ';
                      return base + (p.isActive ? 'bg-wine-800 text-white' : 'text-wine-300 hover:text-white');
                    }}
                    onClick={function() { setMobileOpen(false); }}>
                    In stipendi
                  </NavLink>
                )}
              </div>
            )}
          </>
        )}

        {showAdminSection && (
          <>
            <div className="text-wine-400 text-xs font-semibold uppercase tracking-wider px-3 mt-4 mb-2">Amministrazione</div>

            {canView('impostazioni') && (
              <NavLink
                to="/impostazioni"
                className={function(p) { return navClass(p.isActive); }}
                onClick={function() { setMobileOpen(false); }}>
                <span className="text-base">⚙️</span>
                Impostazioni
              </NavLink>
            )}
          </>
        )}

        {canView('utenti') && (
          <NavLink
            to="/utenti"
            className={function(p) { return navClass(p.isActive); }}
            onClick={function() { setMobileOpen(false); }}>
            <span className="text-base">🔐</span>
            Utenti App
          </NavLink>
        )}

      </nav>

      {/* Sezione profilo utente in fondo */}
      <div className="px-3 py-3 border-t border-wine-800">

        {/* Freschezza dei dati HiC. Grigia e discreta quando va tutto bene,
            ambra quando supera la soglia. E' anche una scorciatoia: portando
            alla pagina Camere fa da secondo ingresso. */}
        {vediHic && hicLetto && (
          <NavLink
            to="/camere"
            onClick={function() { setMobileOpen(false); }}
            className={
              hicFermo
                ? 'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors mb-2'
                : 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-wine-400 hover:bg-wine-800 hover:text-wine-200 transition-colors mb-2'
            }>
            {hicFermo ? (
              <span className="text-sm">⚠️</span>
            ) : (
              <span className="text-sm">🔄</span>
            )}
            {hicMai
              ? 'Camere: mai aggiornate'
              : (hicFermo
                  ? 'Camere: dati fermi da ' + daQuanto(hicOre)
                  : 'Camere agg. ' + quandoBreve(hicUltimo))}
          </NavLink>
        )}

        {/* Elevazione: entra / torna al base (solo su dispositivo condiviso) */}
        {elevato ? (
          <button
            onClick={function() { tornaAlBase(); setMobileOpen(false); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors mb-1">
            <span className="text-base">🔒</span>
            Torna al base
          </button>
        ) : (sharedDevice && (
          <button
            onClick={function() { openEleva(); setMobileOpen(false); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium bg-wine-700 text-white hover:bg-wine-600 transition-colors mb-1">
            <span className="text-base">🔓</span>
            Entra con PIN
          </button>
        ))}

        <NavLink
          to="/profilo"
          className={function(p) { return navClass(p.isActive); }}
          onClick={function() { setMobileOpen(false); }}>
          <span className="text-base">👤</span>
          Il mio profilo
        </NavLink>

        <div className="mt-2 px-3 py-2">
          <div className="text-white text-sm font-medium truncate">
            {profile ? (profile.first_name + ' ' + profile.last_name) : '—'}
          </div>
          <div className="text-wine-300 text-xs mt-0.5">
            {profile ? getRoleLabel(profile.role) : '—'}
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-wine-300 hover:bg-wine-800 hover:text-white transition-colors mt-1">
          <span className="text-base">🚪</span>
          Esci
        </button>

      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-gray-50">

      {/* Sidebar desktop */}
      <aside className="hidden lg:flex lg:w-60 flex-col bg-wine-900 fixed inset-y-0 left-0 z-30">
        {sidebarContent}
      </aside>

      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={function() { setMobileOpen(false); }}
        />
      )}

      {/* Sidebar mobile */}
      <aside className={
        'fixed inset-y-0 left-0 z-50 w-60 bg-wine-900 flex flex-col transform transition-transform duration-200 lg:hidden ' +
        (mobileOpen ? 'translate-x-0' : '-translate-x-full')
      }>
        {sidebarContent}
      </aside>

      {/* Contenuto principale */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen min-w-0">

        {/* Fascia ELEVAZIONE attiva */}
        {elevato && (
          <div className={'text-white ' + (inScadenza ? 'bg-red-700' : 'bg-wine-800')}>
            <div className="px-4 py-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">🔓</span>
                <span className="text-sm font-medium truncate">
                  Attivo come {elevazione ? elevazione.nome : ''}
                </span>
                <span className="text-sm font-mono tabular-nums bg-black bg-opacity-20 px-2 py-0.5 rounded ml-1">
                  {formatTempo(secondiResidui)}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {inScadenza && (
                  <button
                    onClick={openEleva}
                    className="text-sm font-medium bg-white text-red-700 px-3 py-1 rounded-lg hover:bg-red-50">
                    Estendi
                  </button>
                )}
                <button
                  onClick={tornaAlBase}
                  className="text-sm font-medium bg-black bg-opacity-25 text-white px-3 py-1 rounded-lg hover:bg-opacity-40">
                  Torna al base
                </button>
              </div>
            </div>
            {/* Barra che si accorcia */}
            <div className="h-1 bg-black bg-opacity-20">
              <div
                className={'h-full transition-all duration-1000 ease-linear ' + (inScadenza ? 'bg-white' : 'bg-amber-400')}
                style={{ width: pct + '%' }}
              />
            </div>
            {inScadenza && (
              <div className="px-4 py-1.5 text-xs bg-black bg-opacity-20">
                La sessione sta per scadere. Premi <span className="font-semibold">Estendi</span> e reinserisci il PIN per continuare.
              </div>
            )}
          </div>
        )}

        {/* Fascia AGGIORNAMENTO HiC FERMO.
            Compare su ogni pagina, non solo dentro la Dashboard: un avviso
            che vive in una pagina sola si vede solo se qualcuno apre quella
            pagina. Il programma NON lancia e NON prenota niente: legge
            hic_sync_log tramite la funzione SQL e avvisa. Sola lettura. */}
        {vediHic && hicFermo && (
          <div className="bg-amber-500 text-white">
            <div className="px-4 py-2 flex items-start gap-2">
              <span className="text-base flex-shrink-0">⚠️</span>
              <div className="text-sm">
                <span className="font-semibold">
                  {hicMai
                    ? 'I dati di Hotel in Cloud non sono mai stati aggiornati.'
                    : 'I dati di Hotel in Cloud non si aggiornano da ' + daQuanto(hicOre) + '.'}
                </span>
                <span className="ml-1">
                  Quello che vedi in Dashboard Camere e in Camere e colazioni e' vecchio:
                  chi e' arrivato o partito dopo quell'ora non c'e'. Vai a un computer dove
                  e' installato l'aggiornamento, apri la finestra Sincronizzazione
                  HotelInCloud e premi Aggiorna ora.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Header mobile */}
        <header className="lg:hidden bg-wine-900 px-4 py-3 flex items-center justify-between">
          <button
            onClick={function() { setMobileOpen(true); }}
            className="text-white p-1">
            <div className="w-5 h-0.5 bg-white mb-1"></div>
            <div className="w-5 h-0.5 bg-white mb-1"></div>
            <div className="w-5 h-0.5 bg-white"></div>
          </button>
          <div className="text-white font-semibold text-sm">I Cacciagalli</div>
          <div className="w-7"></div>
        </header>

        {/* Contenuto pagina */}
        <main className="flex-1 overflow-auto min-w-0">
          {children}
        </main>

      </div>

      {/* Modale PIN: ingresso ed estensione dell'elevazione */}
      <ConfermaPin
        open={showPinModal}
        title={elevato ? 'Estendi la sessione' : 'Entra con PIN'}
        message={elevato
          ? 'Scegli il tuo nome e reinserisci il PIN per estendere la sessione.'
          : 'Scegli il tuo nome e inserisci il tuo PIN a 6 cifre per accedere ai tuoi rami su questo dispositivo condiviso.'}
        onCancel={function() { setShowPinModal(false); }}
        onConfirmed={onPinConfirmed}
      />

    </div>
  );
}
