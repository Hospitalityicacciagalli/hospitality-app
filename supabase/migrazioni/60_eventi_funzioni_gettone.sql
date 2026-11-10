-- =====================================================================
-- MIGRAZIONE 60 — Modulo Eventi, fase 1: gettone di elevazione,
-- scritture degli eventi, conteggio unico dei coperti
-- Hospitality 2026 — 29 ottobre 2026 — sez. 0.5 v63
-- =====================================================================
-- COME SI ESEGUE: come la 59. Supabase -> SQL Editor, UN PASSO ALLA
-- VOLTA (dalla riga "PASSO n" alla riga vuota successiva, commenti
-- compresi), Run, "Success", poi il passo dopo. Ogni passo e'
-- ripetibile. I PASSI V sono sole letture: CSV a Claude.
-- ⚠️ I passi con una funzione sono LUNGHI: si copia da "create or
-- replace function" fino a "$fn$;" compreso.
--
-- COSA FA:
--   A. gettone di elevazione: tabella pin_gettoni, controllo del PIN in
--      UNA copia sola (pin_controlla), apri/chiudi elevazione, firmatario
--   B. scritture degli eventi (solo con Eventi = modifica di chi firma):
--      salva evento con servizi e spazi, cambio stato, cancellazione
--      (bloccata dal database se ci sono soldi), tipologie, spazi
--   C. conteggio unico dei coperti degli eventi (non ancora usato)
--
-- NON TOCCA LE PAGINE: la finestra PIN di oggi continua a chiamare
-- verify_pin_utente, che ora usa lo stesso controllo del gettone.
-- =====================================================================


-- =====================================================================
-- PASSO 0 — sola lettura, PRIMA di tutto (aggiunto il 9/11, non cambia
-- niente). Le funzioni plpgsql non controllano i nomi delle colonne
-- quando vengono create, ma solo quando vengono usate: un nome sbagliato
-- salterebbe fuori alla prova sul campo. Questa lettura elenca le
-- colonne che la 60 usa (59) e che NON esistono nel database.
-- Previsione: 0 righe ("Success. No rows returned").
-- =====================================================================
select t.tabella, t.colonna from (values ('eventi', 'id'), ('eventi', 'titolo'), ('eventi', 'tipologia_id'), ('eventi', 'stato'), ('eventi', 'cliente_id'), ('eventi', 'scadenza_opzione'), ('eventi', 'note'), ('eventi', 'provenienza'), ('eventi', 'created_by'), ('eventi', 'updated_by'), ('eventi', 'updated_at'), ('eventi', 'annullato_il'), ('eventi', 'motivo_annullamento'), ('eventi_servizi', 'id'), ('eventi_servizi', 'evento_id'), ('eventi_servizi', 'nome'), ('eventi_servizi', 'data'), ('eventi_servizi', 'fascia'), ('eventi_servizi', 'ora_inizio'), ('eventi_servizi', 'ora_fine'), ('eventi_servizi', 'ipotetici_adulti'), ('eventi_servizi', 'ipotetici_bambini'), ('eventi_servizi', 'minimo_garantito_adulti'), ('eventi_servizi', 'minimo_garantito_bambini'), ('eventi_servizi', 'definitivi_adulti'), ('eventi_servizi', 'definitivi_bambini'), ('eventi_servizi', 'effettivi_adulti'), ('eventi_servizi', 'effettivi_bambini'), ('eventi_servizi', 'ospiti_storici'), ('eventi_servizi', 'occupa_coperti'), ('eventi_servizi', 'esclusiva'), ('eventi_servizi', 'note'), ('eventi_servizi', 'ordine'), ('eventi_servizi', 'updated_at'), ('eventi_servizi_sale', 'servizio_id'), ('eventi_servizi_sale', 'sala_id'), ('eventi_tipologie', 'id'), ('eventi_tipologie', 'nome'), ('eventi_tipologie', 'attiva'), ('eventi_tipologie', 'ordine'), ('sale', 'id'), ('sale', 'nome'), ('sale', 'ordine'), ('sale', 'attiva'), ('sale', 'attivo'), ('sale', 'solo_eventi'), ('user_profiles', 'id'), ('user_profiles', 'pin_hash'), ('user_profiles', 'pin_failed_attempts'), ('user_profiles', 'pin_locked_until'), ('user_profiles', 'is_active'), ('user_profiles', 'display_name'), ('user_profiles', 'first_name'), ('user_profiles', 'last_name'), ('user_profiles', 'role'), ('user_profiles', 'permissions'), ('restaurant_settings', 'elevazione_minuti'), ('cassa2_movimenti', 'event_id'), ('movimenti_cassa', 'event_id')) as t(tabella, colonna) where not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t.tabella and c.column_name = t.colonna) order by 1, 2;


-- =====================================================================
-- A. IL GETTONE DI ELEVAZIONE
-- =====================================================================

-- PASSO 1 — i gettoni: uno per ogni PIN inserito.
-- id = il gettone (casuale); postazione = chi ha fatto il login;
-- firmatario = chi ha inserito il PIN.
create table if not exists public.pin_gettoni (
  id uuid primary key default gen_random_uuid(),
  postazione_id uuid not null,
  firmatario_id uuid not null references public.user_profiles(id) on delete cascade,
  creato_il timestamptz not null default now(),
  scade_il timestamptz not null,
  chiuso_il timestamptz
);

-- PASSO 2 — nessuno la legge o la scrive dall'app: solo le funzioni
alter table public.pin_gettoni enable row level security;

-- PASSO 3
revoke all on table public.pin_gettoni from anon, authenticated;

-- PASSO 4 — IL controllo del PIN, in una copia sola (regola 31).
-- Restituisce l'id dell'utente se il PIN e' giusto, null se sbagliato;
-- conta gli errori (5 -> blocco 15 minuti); se bloccato: errore.
-- Interna: non la chiama nessuna pagina.
create or replace function public.pin_controlla(p_user_id uuid, p_pin text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $fn$
declare
  r record;
  v_minuti integer;
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    return null;
  end if;

  select up.id, up.pin_hash, up.pin_failed_attempts, up.pin_locked_until
    into r
    from public.user_profiles up
    where up.id = p_user_id
      and up.pin_hash is not null
      and up.is_active is not false;

  if not found then
    return null;
  end if;

  if r.pin_locked_until is not null and r.pin_locked_until > now() then
    v_minuti := greatest(1, ceil(extract(epoch from (r.pin_locked_until - now())) / 60)::integer);
    raise exception 'PIN bloccato per troppi tentativi errati: riprova tra % minuti.', v_minuti;
  end if;

  if r.pin_hash = crypt(p_pin, r.pin_hash) then
    if r.pin_failed_attempts <> 0 or r.pin_locked_until is not null then
      update public.user_profiles
        set pin_failed_attempts = 0, pin_locked_until = null
        where id = r.id;
    end if;
    return r.id;
  end if;

  if r.pin_failed_attempts + 1 >= 5 then
    update public.user_profiles
      set pin_failed_attempts = 0,
          pin_locked_until = now() + interval '15 minutes'
      where id = r.id;
  else
    update public.user_profiles
      set pin_failed_attempts = r.pin_failed_attempts + 1,
          pin_locked_until = null
      where id = r.id;
  end if;

  return null;
end;
$fn$;

-- PASSO 5
revoke execute on function public.pin_controlla(uuid, text) from public, anon, authenticated;

-- PASSO 6 — verify_pin_utente (usata dalla finestra PIN di oggi):
-- stessa firma e stesso risultato, ma il controllo ora e' pin_controlla.
create or replace function public.verify_pin_utente(p_user_id uuid, p_pin text)
returns table(user_id uuid, nome text, role text, permissions jsonb)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $fn$
declare
  v_id uuid;
begin
  v_id := public.pin_controlla(p_user_id, p_pin);
  if v_id is null then
    return;
  end if;
  return query
    select up.id, coalesce(up.display_name, up.first_name || ' ' || up.last_name), up.role, up.permissions
    from public.user_profiles up
    where up.id = v_id;
end;
$fn$;

-- PASSO 7 — apri_elevazione: la chiamera' la finestra PIN (tutte e sei).
-- Come verify_pin_utente, in piu' rilascia il gettone e la scadenza.
-- Durata = Impostazioni (restaurant_settings.elevazione_minuti), ripiego 5.
-- Solo da loggati: il gettone vale per QUESTA postazione.
create or replace function public.apri_elevazione(p_user_id uuid, p_pin text)
returns table(user_id uuid, nome text, role text, permissions jsonb, gettone uuid, scadenza timestamptz)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $fn$
declare
  v_id uuid;
  v_minuti integer;
  v_scade timestamptz;
  v_gettone uuid;
begin
  if auth.uid() is null then
    raise exception 'Non autenticato.';
  end if;

  v_id := public.pin_controlla(p_user_id, p_pin);
  if v_id is null then
    return;
  end if;

  select rs.elevazione_minuti into v_minuti from public.restaurant_settings rs limit 1;
  if v_minuti is null or v_minuti <= 0 then
    v_minuti := 5;
  end if;
  v_scade := now() + make_interval(mins => v_minuti);

  -- pulizia: i gettoni scaduti da piu' di un giorno non servono piu'
  delete from public.pin_gettoni pg where pg.scade_il < now() - interval '1 day';

  insert into public.pin_gettoni (postazione_id, firmatario_id, scade_il)
    values (auth.uid(), v_id, v_scade)
    returning id into v_gettone;

  return query
    select up.id, coalesce(up.display_name, up.first_name || ' ' || up.last_name), up.role, up.permissions, v_gettone, v_scade
    from public.user_profiles up
    where up.id = v_id;
end;
$fn$;

-- PASSO 8
revoke execute on function public.apri_elevazione(uuid, text) from public, anon;

-- PASSO 9
grant execute on function public.apri_elevazione(uuid, text) to authenticated;

-- PASSO 10 — chiudi_elevazione: fine elevazione o logout
create or replace function public.chiudi_elevazione(p_gettone uuid)
returns void
language sql
security definer
set search_path to 'public'
as $fn$
  update public.pin_gettoni
    set chiuso_il = now()
    where id = p_gettone
      and postazione_id = auth.uid()
      and chiuso_il is null;
$fn$;

-- PASSO 11
revoke execute on function public.chiudi_elevazione(uuid) from public, anon;

-- PASSO 12
grant execute on function public.chiudi_elevazione(uuid) to authenticated;

-- PASSO 13 — chi sta firmando? Interna.
-- Senza gettone: l'utente loggato. Con gettone: chi ha inserito il PIN,
-- ma solo se il gettone e' di QUESTA postazione e non e' scaduto/chiuso.
-- Gettone non valido -> errore, MAI la firma in silenzio come utente base.
create or replace function public.firmatario(p_gettone uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  r record;
begin
  if auth.uid() is null then
    raise exception 'Non autenticato.';
  end if;
  if p_gettone is null then
    return auth.uid();
  end if;
  select g.postazione_id, g.firmatario_id, g.scade_il, g.chiuso_il
    into r
    from public.pin_gettoni g
    where g.id = p_gettone;
  if not found or r.postazione_id <> auth.uid() then
    raise exception 'Elevazione non valida: reinserisci il PIN.';
  end if;
  if r.chiuso_il is not null or r.scade_il <= now() then
    raise exception 'Elevazione scaduta: reinserisci il PIN.';
  end if;
  return r.firmatario_id;
end;
$fn$;

-- PASSO 14
revoke execute on function public.firmatario(uuid) from public, anon, authenticated;

-- PASSO 15 — firmatario + controllo "Eventi = modifica". Interna.
create or replace function public.eventi_firma_modifica(p_gettone uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_firma uuid;
begin
  v_firma := public.firmatario(p_gettone);
  if public.permesso_utente(v_firma, 'eventi') <> 'write' then
    raise exception 'Serve il permesso Eventi in modifica.';
  end if;
  return v_firma;
end;
$fn$;

-- PASSO 16
revoke execute on function public.eventi_firma_modifica(uuid) from public, anon, authenticated;


-- =====================================================================
-- B. LE SCRITTURE DEGLI EVENTI
-- =====================================================================

-- PASSO 17 — l'evento ha soldi collegati? (in una delle due casse)
-- Restituisce solo si'/no: la pagina la usa per mostrare il pulsante giusto.
create or replace function public.evento_ha_soldi(p_evento_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select exists (select 1 from public.cassa2_movimenti m where m.event_id = p_evento_id)
      or exists (select 1 from public.movimenti_cassa m where m.event_id = p_evento_id);
$fn$;

-- PASSO 18
revoke execute on function public.evento_ha_soldi(uuid) from public, anon;

-- PASSO 19
grant execute on function public.evento_ha_soldi(uuid) to authenticated;

-- PASSO 20 — il controllo dei soldi vive nel DATABASE: qualunque strada
-- provi a cancellare un evento con soldi, viene fermata qui.
create or replace function public.eventi_blocca_cancellazione()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if public.evento_ha_soldi(old.id) then
    raise exception 'L''evento ha soldi collegati in cassa: non si cancella, si puo'' solo annullare.';
  end if;
  return old;
end;
$fn$;

-- PASSO 21
drop trigger if exists eventi_blocca_cancellazione on public.eventi;

-- PASSO 22
create trigger eventi_blocca_cancellazione before delete on public.eventi for each row execute function public.eventi_blocca_cancellazione();

-- PASSO 23 — salva un evento con TUTTI i suoi servizi e i loro spazi,
-- in un colpo solo (o tutto o niente). p_evento e' un oggetto:
--   { id (vuoto = nuovo), titolo, tipologia_id, cliente_id, note,
--     stato e scadenza_opzione (SOLO per un evento nuovo),
--     servizi: [ { id (vuoto = nuovo), nome, data, fascia, ora_inizio,
--       ora_fine, ipotetici_adulti, ipotetici_bambini,
--       minimo_garantito_adulti, minimo_garantito_bambini,
--       definitivi_adulti, definitivi_bambini, effettivi_adulti,
--       effettivi_bambini, occupa_coperti, esclusiva, note,
--       sale: [id, ...] } ] }
-- I servizi che non sono nell'elenco vengono tolti. Lo stato di un
-- evento esistente si cambia solo con evento_cambia_stato.
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
begin
  v_firma := public.eventi_firma_modifica(p_gettone);

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
    update public.eventi e
      set titolo = btrim(p_evento ->> 'titolo'),
          tipologia_id = nullif(p_evento ->> 'tipologia_id', '')::uuid,
          cliente_id = nullif(p_evento ->> 'cliente_id', '')::uuid,
          note = nullif(btrim(coalesce(p_evento ->> 'note', '')), ''),
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

  return v_id;
end;
$fn$;

-- PASSO 24
revoke execute on function public.evento_salva(uuid, jsonb) from public, anon;

-- PASSO 25
grant execute on function public.evento_salva(uuid, jsonb) to authenticated;

-- PASSO 26 — cambio di stato (e riapertura di un annullato).
--   opzione: scadenza obbligatoria (vale anche come proroga);
--   richiesta / confermato: la scadenza si toglie;
--   annullato: motivo obbligatorio.
--   RIAPERTURA (decisa da Florestano il 29/10): un evento annullato puo'
--   tornare richiesta / opzione / confermato; data e motivo
--   dell'annullamento non spariscono ma si aggiungono alle note:
--   "Riaperto il gg/mm/aaaa — era annullato il gg/mm/aaaa: motivo".
create or replace function public.evento_cambia_stato(p_gettone uuid, p_evento_id uuid, p_stato text, p_scadenza date, p_motivo text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_firma uuid;
  v_attuale text;
  v_annullato_il timestamptz;
  v_motivo text;
  v_traccia text;
begin
  v_firma := public.eventi_firma_modifica(p_gettone);

  select e.stato, e.annullato_il, e.motivo_annullamento
    into v_attuale, v_annullato_il, v_motivo
    from public.eventi e where e.id = p_evento_id for update;
  if not found then
    raise exception 'Evento non trovato.';
  end if;
  if v_attuale = 'annullato' and p_stato = 'annullato' then
    raise exception 'L''evento e'' gia'' annullato.';
  end if;

  -- Riapertura: in UNA sola scrittura cambia lo stato, la traccia
  -- dell'annullamento passa nelle note e i suoi campi si svuotano
  -- (il vincolo eventi_annullato_con_motivo lo richiede).
  if v_attuale = 'annullato' and p_stato in ('richiesta', 'opzione', 'confermato') then
    if p_stato = 'opzione' and p_scadenza is null then
      raise exception 'Un''opzione deve avere la data di scadenza.';
    end if;
    v_traccia := 'Riaperto il ' || to_char(now() at time zone 'Europe/Rome', 'DD/MM/YYYY')
      || ' — era annullato il ' || coalesce(to_char(v_annullato_il at time zone 'Europe/Rome', 'DD/MM/YYYY'), '?')
      || ': ' || coalesce(v_motivo, '');
    update public.eventi e
      set stato = p_stato,
          scadenza_opzione = case when p_stato = 'opzione' then p_scadenza else null end,
          note = case when coalesce(btrim(e.note), '') = '' then v_traccia else e.note || E'\n' || v_traccia end,
          annullato_il = null,
          motivo_annullamento = null,
          updated_at = now(),
          updated_by = v_firma
      where e.id = p_evento_id;
    return;
  end if;

  if p_stato = 'annullato' then
    if coalesce(btrim(p_motivo), '') = '' then
      raise exception 'Per annullare serve il motivo.';
    end if;
    update public.eventi e
      set stato = 'annullato', annullato_il = now(), motivo_annullamento = btrim(p_motivo),
          scadenza_opzione = null, updated_at = now(), updated_by = v_firma
      where e.id = p_evento_id;
  elsif p_stato = 'opzione' then
    if p_scadenza is null then
      raise exception 'Un''opzione deve avere la data di scadenza.';
    end if;
    update public.eventi e
      set stato = 'opzione', scadenza_opzione = p_scadenza, updated_at = now(), updated_by = v_firma
      where e.id = p_evento_id;
  elsif p_stato in ('richiesta', 'confermato') then
    update public.eventi e
      set stato = p_stato, scadenza_opzione = null, updated_at = now(), updated_by = v_firma
      where e.id = p_evento_id;
  else
    raise exception 'Stato non valido: %.', p_stato;
  end if;
end;
$fn$;

-- PASSO 27
revoke execute on function public.evento_cambia_stato(uuid, uuid, text, date, text) from public, anon;

-- PASSO 28
grant execute on function public.evento_cambia_stato(uuid, uuid, text, date, text) to authenticated;

-- PASSO 29 — cancellazione vera (servizi e spazi se ne vanno con l'evento).
-- Con soldi collegati la ferma il controllo del PASSO 20.
create or replace function public.evento_elimina(p_gettone uuid, p_evento_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.eventi_firma_modifica(p_gettone);
  delete from public.eventi e where e.id = p_evento_id;
  if not found then
    raise exception 'Evento non trovato.';
  end if;
end;
$fn$;

-- PASSO 30
revoke execute on function public.evento_elimina(uuid, uuid) from public, anon;

-- PASSO 31
grant execute on function public.evento_elimina(uuid, uuid) to authenticated;

-- PASSO 32 — tipologie: aggiungi, rinomina, spegni. MAI cancellare.
create or replace function public.tipologia_salva(p_gettone uuid, p_id uuid, p_nome text, p_attiva boolean, p_ordine integer)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_id uuid;
begin
  perform public.eventi_firma_modifica(p_gettone);
  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'Il nome della tipologia e'' obbligatorio.';
  end if;
  begin
    if p_id is null then
      insert into public.eventi_tipologie (nome, attiva, ordine)
        values (btrim(p_nome), coalesce(p_attiva, true),
                coalesce(p_ordine, (select coalesce(max(t.ordine), 0) + 1 from public.eventi_tipologie t)))
        returning id into v_id;
    else
      update public.eventi_tipologie t
        set nome = btrim(p_nome), attiva = coalesce(p_attiva, t.attiva), ordine = coalesce(p_ordine, t.ordine)
        where t.id = p_id
        returning t.id into v_id;
      if v_id is null then
        raise exception 'Tipologia non trovata.';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Esiste gia'' una tipologia con il nome "%".', btrim(p_nome);
  end;
  return v_id;
end;
$fn$;

-- PASSO 33
revoke execute on function public.tipologia_salva(uuid, uuid, text, boolean, integer) from public, anon;

-- PASSO 34
grant execute on function public.tipologia_salva(uuid, uuid, text, boolean, integer) to authenticated;

-- PASSO 35 — spazi (tabella sale) dalla pagina Eventi.
-- Nuovo spazio: nasce "solo per eventi" (salvo diversa scelta).
-- Modifica: SOLO degli spazi "solo per eventi" — le sale del ristorante
-- si gestiscono da Sale e Tavoli. Togliendo la spunta, lo spazio passa al
-- ristorante (e da quel momento non si modifica piu' da qui).
-- attivo (il doppione) segue attiva.
create or replace function public.spazio_salva(p_gettone uuid, p_id uuid, p_nome text, p_solo_eventi boolean, p_attiva boolean, p_ordine integer)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_id uuid;
begin
  perform public.eventi_firma_modifica(p_gettone);
  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'Il nome dello spazio e'' obbligatorio.';
  end if;
  if p_id is null then
    insert into public.sale (nome, ordine, attiva, attivo, solo_eventi)
      values (btrim(p_nome),
              coalesce(p_ordine, (select coalesce(max(s.ordine), 0) + 1 from public.sale s)),
              coalesce(p_attiva, true),
              coalesce(p_attiva, true),
              coalesce(p_solo_eventi, true))
      returning id into v_id;
  else
    update public.sale s
      set nome = btrim(p_nome),
          solo_eventi = coalesce(p_solo_eventi, s.solo_eventi),
          attiva = coalesce(p_attiva, s.attiva),
          attivo = coalesce(p_attiva, s.attiva),
          ordine = coalesce(p_ordine, s.ordine)
      where s.id = p_id
        and s.solo_eventi = true
      returning s.id into v_id;
    if v_id is null then
      raise exception 'Da Eventi si modificano solo gli spazi "solo per eventi": le sale del ristorante si gestiscono da Sale e Tavoli.';
    end if;
  end if;
  return v_id;
end;
$fn$;

-- PASSO 36
revoke execute on function public.spazio_salva(uuid, uuid, text, boolean, boolean, integer) from public, anon;

-- PASSO 37
grant execute on function public.spazio_salva(uuid, uuid, text, boolean, boolean, integer) to authenticated;


-- =====================================================================
-- C. IL CONTEGGIO UNICO DEI COPERTI DEGLI EVENTI (0.5 punto 6 v61)
-- =====================================================================

-- PASSO 38 — per giorno e fascia (pranzo/cena) in un periodo:
-- ospiti confermati, ospiti in opzione, servizi senza numero, esclusiva.
--   * 'both' conta su pranzo E cena;
--   * richieste e annullati non contano;
--   * "occupa i coperti" spento -> non conta nei numeri (l'esclusiva si');
--   * numero = ultimo noto: effettivi -> definitivi -> ipotetici -> storici
--     (adulti + bambini; il minimo garantito NON e' una presenza);
--   * vuoto o 0 -> "senza numero".
-- Solo numeri (livello Occupazione): la legge ogni loggato.
create or replace function public.coperti_eventi(p_dal date, p_al date)
returns table(giorno date, fascia text, ospiti_confermati integer, ospiti_opzione integer, servizi_senza_numero integer, esclusiva boolean)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with servizi as (
    select es.data as d,
           f.fascia as fa,
           e.stato as st,
           es.occupa_coperti as occ,
           es.esclusiva as escl,
           coalesce(
             case when es.effettivi_adulti is not null or es.effettivi_bambini is not null
                  then coalesce(es.effettivi_adulti, 0) + coalesce(es.effettivi_bambini, 0) end,
             case when es.definitivi_adulti is not null or es.definitivi_bambini is not null
                  then coalesce(es.definitivi_adulti, 0) + coalesce(es.definitivi_bambini, 0) end,
             case when es.ipotetici_adulti is not null or es.ipotetici_bambini is not null
                  then coalesce(es.ipotetici_adulti, 0) + coalesce(es.ipotetici_bambini, 0) end,
             es.ospiti_storici
           ) as n
    from public.eventi_servizi es
    join public.eventi e on e.id = es.evento_id
    cross join lateral unnest(case when es.fascia = 'both' then array['lunch', 'dinner'] else array[es.fascia] end) as f(fascia)
    where es.data between p_dal and p_al
      and e.stato in ('opzione', 'confermato')
  )
  select s.d,
         s.fa,
         coalesce(sum(s.n) filter (where s.occ and s.st = 'confermato'), 0)::integer,
         coalesce(sum(s.n) filter (where s.occ and s.st = 'opzione'), 0)::integer,
         (count(*) filter (where s.occ and coalesce(s.n, 0) = 0))::integer,
         bool_or(s.escl)
  from servizi s
  group by s.d, s.fa
  order by s.d, s.fa;
$fn$;

-- PASSO 39
revoke execute on function public.coperti_eventi(date, date) from public, anon;

-- PASSO 40
grant execute on function public.coperti_eventi(date, date) to authenticated;

-- PASSO 41
notify pgrst, 'reload schema';


-- =====================================================================
-- VERIFICHE (sole letture) -> CSV a Claude
-- =====================================================================

-- PASSO V1 — chi esegue le funzioni. Previsione (anon / authenticated):
-- apri_elevazione f/t, chiudi_elevazione f/t, coperti_eventi f/t,
-- evento_cambia_stato f/t, evento_elimina f/t, evento_ha_soldi f/t,
-- evento_salva f/t, spazio_salva f/t, tipologia_salva f/t,
-- verify_pin_utente f/t; INTERNE f/f: eventi_firma_modifica,
-- firmatario, pin_controlla. Tutte definer = true. 13 righe.
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as authenticated, p.prosecdef as definer from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('pin_controlla', 'verify_pin_utente', 'apri_elevazione', 'chiudi_elevazione', 'firmatario', 'eventi_firma_modifica', 'evento_ha_soldi', 'evento_salva', 'evento_cambia_stato', 'evento_elimina', 'tipologia_salva', 'spazio_salva', 'coperti_eventi') order by p.proname;

-- PASSO V2 — gettoni e trigger. Previsione: pin_gettoni con rls = true e
-- 0 righe; 1 trigger eventi_blocca_cancellazione su eventi.
select 'pin_gettoni' as cosa, (select relrowsecurity::text from pg_class where oid = 'public.pin_gettoni'::regclass) as valore, (select count(*) from public.pin_gettoni)::text as righe union all select 'trigger ' || tgname::text, tgrelid::regclass::text, '' from pg_trigger where tgname = 'eventi_blocca_cancellazione';
