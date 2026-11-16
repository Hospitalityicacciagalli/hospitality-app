-- ============================================================
-- MIGRAZIONE 65 — permesso «Richieste» per la reception
-- 16 novembre 2026 (disegno: sez. 0.3 punto 1 v69)
--
-- Voce nuova nella matrice dei permessi, gruppo Eventi: «Richieste»,
-- chiave eventi_richieste. Chi ce l'ha in MODIFICA (e non ha «Scheda»
-- in modifica):
--   - crea eventi SOLO in stato Richiesta (niente opzione/confermato);
--   - modifica e salva SOLO gli eventi che sono in stato Richiesta
--     (anche quelli scritti dal Direttore), e restano richiesta;
--   - deve FIRMARE COL PIN: senza gettone il database rifiuta, anche
--     da un login personale. Su ogni richiesta resta cosi' il nome di
--     chi ha risposto al telefono.
-- Cambi di stato, cancellazione, tipologie e spazi restano solo per
-- «Scheda» = modifica: quelle funzioni NON si toccano.
-- «Lettura» su Richieste vale come «nessuno». Per VEDERE gli eventi
-- serve sempre «Scheda» almeno in lettura (la reception ce l'ha).
--
-- Di base: modifica per super_admin, direttore, reception; nessuno per
-- proprieta', sala, cucina.
-- Regola 31: permessi_ruolo e' la SECONDA COPIA di
-- DEFAULT_PERMS_BY_ROLE in AuthContext.jsx: stesso commit dei JSX.
-- Le matrici PERSONALI in user_profiles.permissions NON si toccano
-- (decisione 7a, 11/11): la voce la mette Florestano a mano a chi
-- decide lui. Chiave assente = nessuno.
--
-- Si esegue UN PASSO ALLA VOLTA, in ordine. Tutto ripetibile.
-- Il passo 2 e' lungo: va copiato tutto, da "create or replace
-- function" fino a "$fn$;".
-- ============================================================


-- ------------------------------------------------------------
-- PASSO 0a — sola lettura: le colonne di permessi_ruolo.
-- PREVISIONE: come alla 61 — una colonna di testo col ruolo e UNA
-- SOLA colonna jsonb coi permessi (piu' eventuali date).
-- ------------------------------------------------------------
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'permessi_ruolo'
order by ordinal_position;


-- ------------------------------------------------------------
-- PASSO 0b — sola lettura: evento_salva nel database e' quella della
-- 62 (quella che il passo 2 sostituisce).
-- PREVISIONE: 1 riga, della_62 = true, gia_65 = false.
-- Se della_62 e' false FERMARSI e mandarmi la riga: qualcuno l'ha
-- cambiata dopo, e il passo 2 la cancellerebbe.
-- ------------------------------------------------------------
select position('NOVITA'' 62' in pg_get_functiondef(p.oid)) > 0 as della_62,
       position('NOVITA'' 65' in pg_get_functiondef(p.oid)) > 0 as gia_65
from pg_proc p
where p.proname = 'evento_salva' and p.pronamespace = 'public'::regnamespace;


-- ------------------------------------------------------------
-- PASSO 0c — sola lettura: la chiave non esiste ancora da nessuna
-- parte. PREVISIONE: 1 riga, ruoli_con_chiave = 0,
-- matrici_personali_con_chiave = 0.
-- ------------------------------------------------------------
select
  (select count(*) from public.permessi_ruolo p, jsonb_each(to_jsonb(p)) j
     where jsonb_typeof(j.value) = 'object' and j.value ? 'eventi_richieste') as ruoli_con_chiave,
  (select count(*) from public.user_profiles up
     where up.permissions ? 'eventi_richieste') as matrici_personali_con_chiave;


-- ------------------------------------------------------------
-- PASSO 1 — aggiunge la chiave a tutti e sei i ruoli.
-- I nomi delle colonne si leggono dal database (regola 29).
-- L'operatore || sovrascrive la chiave se c'e' gia': ripetibile.
-- ------------------------------------------------------------
do $$
declare
  col_json  text;
  col_ruolo text;
  n_json    int;
  n_righe   int;
begin
  select count(*) into n_json
  from information_schema.columns
  where table_schema = 'public' and table_name = 'permessi_ruolo'
    and data_type = 'jsonb';
  if n_json <> 1 then
    raise exception 'permessi_ruolo ha % colonne jsonb, ne serve esattamente una', n_json;
  end if;

  select column_name into col_json
  from information_schema.columns
  where table_schema = 'public' and table_name = 'permessi_ruolo'
    and data_type = 'jsonb';

  select c.column_name into col_ruolo
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'permessi_ruolo'
    and c.data_type in ('text', 'character varying')
  order by c.ordinal_position
  limit 1;
  if col_ruolo is null then
    raise exception 'permessi_ruolo non ha una colonna di testo per il ruolo';
  end if;

  execute format('select count(*) from public.permessi_ruolo where %I = %L', col_ruolo, 'super_admin')
    into n_righe;
  if n_righe <> 1 then
    raise exception 'colonna % : trovate % righe super_admin invece di 1', col_ruolo, n_righe;
  end if;

  execute format(
    'update public.permessi_ruolo
        set %1$I = %1$I || jsonb_build_object(''eventi_richieste'',
                     case when %2$I in (''super_admin'', ''direttore'', ''reception'') then ''write'' else ''none'' end)',
    col_json, col_ruolo);
end
$$;


-- ------------------------------------------------------------
-- PASSO 2 — evento_salva: stessa firma, stessi permessi d'esecuzione
-- (create or replace li conserva). Tutto come la 62, piu' le parti
-- segnate NOVITA' 65: chi puo' salvare.
-- ------------------------------------------------------------
create or replace function public.evento_salva(p_gettone uuid, p_evento jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_firma uuid;
  v_id uuid;
  v_stato text;
  v_scad date;
  r record;
  s jsonb;
  v_sid uuid;
  v_tenuti uuid[] := '{}';
  -- NOVITA' 65: true = chi firma ha solo il permesso Richieste
  v_solo_richieste boolean := false;
  v_stato_ora text;
begin
  -- NOVITA' 65 — CHI PUO' SALVARE (regola 55: lo decide il database).
  --   Scheda (eventi) = modifica      -> tutto, come prima;
  --   altrimenti Richieste = modifica -> solo eventi che SONO e RESTANO
  --                                      richiesta, e solo con la firma
  --                                      col PIN (gettone), anche da un
  --                                      login personale.
  v_firma := public.firmatario(p_gettone);
  if public.permesso_utente(v_firma, 'eventi') = 'write' then
    v_solo_richieste := false;
  elsif public.permesso_utente(v_firma, 'eventi_richieste') = 'write' then
    if p_gettone is null then
      raise exception 'Per salvare una richiesta serve la firma col PIN.';
    end if;
    v_solo_richieste := true;
  else
    raise exception 'Serve il permesso Eventi in modifica (oppure Richieste, solo per le richieste).';
  end if;

  if p_evento is null or jsonb_typeof(p_evento) <> 'object' then
    raise exception 'Dati dell''evento mancanti.';
  end if;
  if coalesce(btrim(p_evento ->> 'titolo'), '') = '' then
    raise exception 'Il titolo dell''evento e'' obbligatorio.';
  end if;
  if jsonb_typeof(p_evento -> 'servizi') is distinct from 'array' or jsonb_array_length(p_evento -> 'servizi') = 0 then
    raise exception 'Un evento deve avere almeno un servizio (data e fascia).';
  end if;

  v_id := nullif(p_evento ->> 'id', '')::uuid;

  if v_id is null then
    v_stato := coalesce(nullif(p_evento ->> 'stato', ''), 'richiesta');
    if v_stato not in ('richiesta', 'opzione', 'confermato') then
      raise exception 'Stato iniziale non valido: %.', v_stato;
    end if;
    -- NOVITA' 65
    if v_solo_richieste and v_stato <> 'richiesta' then
      raise exception 'Con il permesso Richieste si creano solo richieste: opzione e conferma le decide chi ha il permesso Eventi.';
    end if;
    v_scad := nullif(p_evento ->> 'scadenza_opzione', '')::date;
    if v_stato = 'opzione' and v_scad is null then
      raise exception 'Un''opzione deve avere la data di scadenza.';
    end if;
    if v_stato <> 'opzione' then
      v_scad := null;
    end if;
    if nullif(p_evento ->> 'cliente_id', '') is null then
      raise exception 'Il cliente e'' obbligatorio.';
    end if;
    insert into public.eventi (titolo, tipologia_id, stato, cliente_id, scadenza_opzione, note, provenienza, created_by, updated_by)
      values (
        btrim(p_evento ->> 'titolo'),
        nullif(p_evento ->> 'tipologia_id', '')::uuid,
        v_stato,
        nullif(p_evento ->> 'cliente_id', '')::uuid,
        v_scad,
        nullif(btrim(coalesce(p_evento ->> 'note', '')), ''),
        'modulo',
        v_firma,
        v_firma
      )
      returning id into v_id;
  else
    -- NOVITA' 65: con il solo permesso Richieste l'evento deve essere una
    -- richiesta ADESSO (riga bloccata fino alla fine, cosi' nessuno lo
    -- conferma a meta' salvataggio). Lo stato qui non cambia mai: resta
    -- richiesta. I cambi di stato passano da evento_cambia_stato, che
    -- chiede il permesso Eventi.
    if v_solo_richieste then
      select e.stato into v_stato_ora from public.eventi e where e.id = v_id for update;
      if not found then
        raise exception 'Evento non trovato.';
      end if;
      if v_stato_ora <> 'richiesta' then
        raise exception 'Questo evento non e'' piu'' una richiesta: lo modifica solo chi ha il permesso Eventi.';
      end if;
    end if;
    update public.eventi e
      set titolo = btrim(p_evento ->> 'titolo'),
          tipologia_id = nullif(p_evento ->> 'tipologia_id', '')::uuid,
          cliente_id = nullif(p_evento ->> 'cliente_id', '')::uuid,
          note = nullif(btrim(coalesce(p_evento ->> 'note', '')), ''),
          -- NOVITA' 62: la scadenza di un'opzione si corregge anche da qui.
          -- Vale solo se l'evento E' in opzione e la data arriva; negli
          -- altri casi la scadenza resta com'e'.
          scadenza_opzione = case
            when e.stato = 'opzione' and nullif(p_evento ->> 'scadenza_opzione', '') is not null
              then (p_evento ->> 'scadenza_opzione')::date
            else e.scadenza_opzione
          end,
          updated_at = now(),
          updated_by = v_firma
      where e.id = v_id;
    if not found then
      raise exception 'Evento non trovato.';
    end if;
  end if;

  for r in select x.value as v, x.ordinality as n from jsonb_array_elements(p_evento -> 'servizi') with ordinality x loop
    s := r.v;
    if nullif(s ->> 'data', '') is null then
      raise exception 'Servizio %: manca la data.', r.n;
    end if;
    if coalesce(s ->> 'fascia', '') not in ('lunch', 'dinner', 'both') then
      raise exception 'Servizio %: la fascia deve essere pranzo, cena o giornata intera.', r.n;
    end if;
    v_sid := nullif(s ->> 'id', '')::uuid;
    if v_sid is null then
      insert into public.eventi_servizi (
        evento_id, nome, data, fascia, ora_inizio, ora_fine,
        ipotetici_adulti, ipotetici_bambini, minimo_garantito_adulti, minimo_garantito_bambini,
        definitivi_adulti, definitivi_bambini, effettivi_adulti, effettivi_bambini,
        occupa_coperti, esclusiva, note, ordine)
      values (
        v_id,
        nullif(btrim(coalesce(s ->> 'nome', '')), ''),
        (s ->> 'data')::date,
        s ->> 'fascia',
        nullif(s ->> 'ora_inizio', '')::time,
        nullif(s ->> 'ora_fine', '')::time,
        nullif(s ->> 'ipotetici_adulti', '')::integer,
        nullif(s ->> 'ipotetici_bambini', '')::integer,
        nullif(s ->> 'minimo_garantito_adulti', '')::integer,
        nullif(s ->> 'minimo_garantito_bambini', '')::integer,
        nullif(s ->> 'definitivi_adulti', '')::integer,
        nullif(s ->> 'definitivi_bambini', '')::integer,
        nullif(s ->> 'effettivi_adulti', '')::integer,
        nullif(s ->> 'effettivi_bambini', '')::integer,
        coalesce(nullif(s ->> 'occupa_coperti', '')::boolean, true),
        coalesce(nullif(s ->> 'esclusiva', '')::boolean, false),
        nullif(btrim(coalesce(s ->> 'note', '')), ''),
        r.n::integer)
      returning id into v_sid;
    else
      update public.eventi_servizi es
        set nome = nullif(btrim(coalesce(s ->> 'nome', '')), ''),
            data = (s ->> 'data')::date,
            fascia = s ->> 'fascia',
            ora_inizio = nullif(s ->> 'ora_inizio', '')::time,
            ora_fine = nullif(s ->> 'ora_fine', '')::time,
            ipotetici_adulti = nullif(s ->> 'ipotetici_adulti', '')::integer,
            ipotetici_bambini = nullif(s ->> 'ipotetici_bambini', '')::integer,
            minimo_garantito_adulti = nullif(s ->> 'minimo_garantito_adulti', '')::integer,
            minimo_garantito_bambini = nullif(s ->> 'minimo_garantito_bambini', '')::integer,
            definitivi_adulti = nullif(s ->> 'definitivi_adulti', '')::integer,
            definitivi_bambini = nullif(s ->> 'definitivi_bambini', '')::integer,
            effettivi_adulti = nullif(s ->> 'effettivi_adulti', '')::integer,
            effettivi_bambini = nullif(s ->> 'effettivi_bambini', '')::integer,
            occupa_coperti = coalesce(nullif(s ->> 'occupa_coperti', '')::boolean, true),
            esclusiva = coalesce(nullif(s ->> 'esclusiva', '')::boolean, false),
            note = nullif(btrim(coalesce(s ->> 'note', '')), ''),
            ordine = r.n::integer,
            updated_at = now()
        where es.id = v_sid
          and es.evento_id = v_id;
      if not found then
        raise exception 'Servizio %: non appartiene a questo evento.', r.n;
      end if;
    end if;
    v_tenuti := v_tenuti || v_sid;

    delete from public.eventi_servizi_sale ess where ess.servizio_id = v_sid;
    if jsonb_typeof(s -> 'sale') = 'array' then
      insert into public.eventi_servizi_sale (servizio_id, sala_id)
        select v_sid, t.sala::uuid
        from jsonb_array_elements_text(s -> 'sale') as t(sala)
        where nullif(t.sala, '') is not null
        on conflict do nothing;
    end if;
  end loop;

  delete from public.eventi_servizi es where es.evento_id = v_id and not (es.id = any (v_tenuti));

  -- NOVITA' 62: i controlli rimandati (la scadenza) si fanno ADESSO,
  -- cosi' l'errore torna alla pagina come quelli qui sopra.
  set constraints all immediate;

  return v_id;
end;
$fn$;



-- ------------------------------------------------------------
-- PASSO 3 — ricarica lo schema dell'API.
-- ------------------------------------------------------------
notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- V1 — il valore della chiave nuova, ruolo per ruolo.
-- PREVISIONE: 2 righe — 'none' 3 ruoli, 'write' 3 ruoli.
-- ------------------------------------------------------------
select j.value ->> 'eventi_richieste' as richieste, count(*) as ruoli,
       string_agg(coalesce(to_jsonb(p) ->> 'ruolo', to_jsonb(p) ->> 'role', '?'), ', ') as quali
from public.permessi_ruolo p,
     jsonb_each(to_jsonb(p)) j
where jsonb_typeof(j.value) = 'object'
group by 1
order by 1;


-- ------------------------------------------------------------
-- V2 — quante chiavi ha ogni ruolo.
-- PREVISIONE: una sola riga, 31 chiavi, 6 ruoli (erano 30 dopo la 61).
-- ------------------------------------------------------------
select (select count(*) from jsonb_object_keys(j.value)) as chiavi, count(*) as ruoli
from public.permessi_ruolo p,
     jsonb_each(to_jsonb(p)) j
where jsonb_typeof(j.value) = 'object'
group by 1;


-- ------------------------------------------------------------
-- V3 — evento_salva e' quella nuova.
-- PREVISIONE: 1 riga, nuova = true, solo_authenticated = true.
-- ------------------------------------------------------------
select position('NOVITA'' 65' in pg_get_functiondef(p.oid)) > 0 as nuova,
       has_function_privilege('authenticated', p.oid, 'execute')
         and not has_function_privilege('anon', p.oid, 'execute') as solo_authenticated
from pg_proc p
where p.proname = 'evento_salva' and p.pronamespace = 'public'::regnamespace;
