import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Users, Search, Tractor, Hotel, ChevronRight, Settings } from 'lucide-react';

// Pagina elenco dipendenti del modulo Stipendi.
// Mostra tutti i dipendenti attivi di staff_members e per ciascuno
// indica se ha un profilo paghe configurato. Cliccando su una riga
// si apre la sua scheda dove si imposta tipo, settore, target,
// storico stipendi/tariffe e ferie.

export default function StipendiDipendentiPage() {
  var navigate = useNavigate();

  var [loading, setLoading] = useState(true);
  var [members, setMembers] = useState([]);
  var [profili, setProfili] = useState({});       // mappa staff_id -> profilo paghe
  var [searchTerm, setSearchTerm] = useState('');
  var [filterTipo, setFilterTipo] = useState('tutti');  // tutti / campagna / resort / senza_profilo
  var [mostraCessati, setMostraCessati] = useState(false);

  useEffect(function() {
    loadAll();
  }, []);

  function loadAll() {
    setLoading(true);

    // Carica tutti i dipendenti (attivi e cessati): per recuperare i mesi
    // passati serve poter configurare anche la paga di chi non lavora piu'.
    var pStaff = supabase
      .from('staff_members')
      .select('id, first_name, last_name, is_active, hire_date, contract_end_date, fiscal_code')
      .order('last_name', { ascending: true });

    // Carica profili paghe
    var pProfili = supabase
      .from('stip_profili')
      .select('*');

    Promise.all([pStaff, pProfili]).then(function(results) {
      var staffRes = results[0];
      var profRes = results[1];

      if (staffRes.error) {
        alert('Errore caricamento staff: ' + staffRes.error.message);
        setLoading(false);
        return;
      }
      if (profRes.error) {
        alert('Errore caricamento profili paghe: ' + profRes.error.message);
        setLoading(false);
        return;
      }

      // Costruisci mappa staff_id -> profilo
      var map = {};
      var profData = profRes.data || [];
      for (var i = 0; i < profData.length; i++) {
        map[profData[i].staff_id] = profData[i];
      }

      setMembers(staffRes.data || []);
      setProfili(map);
      setLoading(false);
    });
  }

  function filtered() {
    var list = members;
    if (!mostraCessati) {
      list = list.filter(function(m) { return m.is_active !== false; });
    }
    var term = searchTerm.trim().toLowerCase();
    if (term) {
      list = list.filter(function(m) {
        var full = (m.last_name + ' ' + m.first_name).toLowerCase();
        return full.indexOf(term) !== -1;
      });
    }
    if (filterTipo !== 'tutti') {
      list = list.filter(function(m) {
        var p = profili[m.id];
        if (filterTipo === 'senza_profilo') return !p;
        if (!p) return false;
        return p.tipo === filterTipo;
      });
    }
    return list;
  }

  function attivi() {
    return members.filter(function(m) { return m.is_active !== false; });
  }

  function totaleConProfilo() {
    return attivi().filter(function(m) { return !!profili[m.id]; }).length;
  }

  function totalePerTipo(tipo) {
    return attivi().filter(function(m) {
      var p = profili[m.id];
      return p && p.tipo === tipo;
    }).length;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">Caricamento dipendenti...</div>
      </div>
    );
  }

  var list = filtered();

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Intestazione */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users size={26} className="text-wine-700" />
          Stipendi — Dipendenti
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Configura il profilo paghe di ciascun dipendente: tipo (campagna o resort),
          settore, target giornate annue, storico stipendi/tariffe e ferie.
        </p>
      </div>

      {/* Riepilogo numerico */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Totale attivi</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{attivi().length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Con profilo paghe</div>
          <div className="text-2xl font-bold text-wine-700 mt-1">{totaleConProfilo()}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
            <Tractor size={12} />
            Campagna
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{totalePerTipo('campagna')}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
            <Hotel size={12} />
            Resort
          </div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{totalePerTipo('resort')}</div>
        </div>
      </div>

      {/* Filtri */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Cerca per nome o cognome..."
              value={searchTerm}
              onChange={function(e) { setSearchTerm(e.target.value); }}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 text-sm"
            />
          </div>
          <select
            value={filterTipo}
            onChange={function(e) { setFilterTipo(e.target.value); }}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-wine-500 bg-white text-sm">
            <option value="tutti">Tutti</option>
            <option value="campagna">Solo campagna</option>
            <option value="resort">Solo resort</option>
            <option value="senza_profilo">Senza profilo paghe</option>
          </select>
          <label className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-sm cursor-pointer whitespace-nowrap select-none">
            <input
              type="checkbox"
              checked={mostraCessati}
              onChange={function(e) { setMostraCessati(e.target.checked); }}
              className="rounded border-gray-300 text-wine-600 focus:ring-wine-500"
            />
            <span className="text-gray-700">Includi cessati</span>
          </label>
        </div>
      </div>

      {/* Lista dipendenti */}
      {list.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
          Nessun dipendente trovato con questi filtri.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(function(m) {
            var p = profili[m.id];
            var hasProfile = !!p;
            return (
              <div
                key={m.id}
                onClick={function() { navigate('/stipendi/dipendenti/' + m.id); }}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:border-wine-300 hover:shadow-sm transition-all cursor-pointer">
                <div className="flex items-center gap-4">

                  {/* Avatar */}
                  <div className={
                    'w-11 h-11 rounded-full flex items-center justify-center font-bold flex-shrink-0 ' +
                    (hasProfile ? (p.tipo === 'campagna' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700') : 'bg-gray-100 text-gray-400')
                  }>
                    {m.first_name[0]}{m.last_name[0]}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">
                        {m.last_name} {m.first_name}
                      </h3>
                      {m.is_active === false && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                          Cessato
                        </span>
                      )}
                      {hasProfile ? (
                        <span className={
                          'text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ' +
                          (p.tipo === 'campagna' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700')
                        }>
                          {p.tipo === 'campagna' ? <Tractor size={11} /> : <Hotel size={11} />}
                          {p.tipo === 'campagna' ? 'Campagna' : 'Resort'}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 flex items-center gap-1">
                          <Settings size={11} />
                          Da configurare
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {hasProfile && p.settore_paghe && (
                        <span>{p.settore_paghe}</span>
                      )}
                      {hasProfile && p.settore_paghe && p.giornate_target_annue && (
                        <span className="text-gray-300 mx-2">—</span>
                      )}
                      {hasProfile && p.giornate_target_annue && (
                        <span>Target {p.giornate_target_annue} giornate/anno</span>
                      )}
                      {!hasProfile && (
                        <span className="text-amber-600">Profilo paghe non ancora impostato</span>
                      )}
                    </div>
                  </div>

                  <ChevronRight size={20} className="text-gray-400 flex-shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="h-6" />
    </div>
  );
}
