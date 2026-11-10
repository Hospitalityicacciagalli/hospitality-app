-- ============================================================
-- MIGRAZIONE 62 — la scadenza di un'opzione non puo' essere dopo
-- il primo servizio dell'evento
-- 10 novembre 2026 (verbale Eventi fase 1, passo 25)
--
-- Un'opzione che scade a evento gia' cominciato non ha senso. Succedeva
-- togliendo o spostando servizi: l'evento si accorciava e la scadenza
-- restava indietro. Da oggi il database lo rifiuta, da QUALUNQUE strada
-- (creazione, Salva, proroga, riapertura): un controllo solo, sulle
-- tabelle, invece di tre copie nelle funzioni (regola 31).
--
-- Il controllo e' RIMANDATO alla fine dell'operazione (deferrable):
-- evento_salva cambia prima l'evento e poi i servizi uno alla volta, e
-- a meta' strada i dati possono essere incoerenti anche quando il
-- risultato finale e' giusto.
--
-- In piu' evento_salva accetta la scadenza anche per un evento
-- esistente in opzione: dalla scheda si possono correggere insieme le
-- date e la scadenza, senza restare chiusi in un vicolo cieco.
--
-- Si esegue UN PASSO ALLA VOLTA, in ordine. Tutto ripetibile.
-- Il passo 5 e' lungo: va copiato tutto, da "create or replace
-- function" fino a "$fn$;".
-- ============================================================


-- ------------------------------------------------------------
-- PASSO 0 — sola lettura: opzioni che GIA' oggi sono incoerenti.
-- PREVISIONE: 0 righe. L'opzione d'archivio scade il giorno stesso
-- del suo servizio (uguale e' permesso), e «Matrimonio Rossi-Bianchi
-- PROVA DATI» scade il 09/11 col primo servizio il 09/11.
-- Se esce qualche riga NON e' un blocco: quell'evento si potra'
-- salvare solo dopo aver corretto la scadenza o le date. Mandamela.
-- ------------------------------------------------------------
select e.id, e.titolo, e.scadenza_opzione, min(s.data) as primo_servizio
from public.eventi e
join public.eventi_servizi s on s.evento_id = e.id
where e.stato = 'opzione'
group by e.id, e.titolo, e.scadenza_opzione
having e.scadenza_opzione > min(s.data);


-- ------------------------------------------------------------
-- PASSO 1 — il controllo, in una copia sola.
-- ------------------------------------------------------------
create or replace function public.eventi_controlla_scadenza()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_evento uuid;
  v_stato text;
  v_scad date;
  v_primo date;
begin
  if tg_table_name = 'eventi' then
    v_evento := new.id;
  elsif tg_op = 'DELETE' then
    v_evento := old.evento_id;
  else
    v_evento := new.evento_id;
  end if;

  select e.stato, e.scadenza_opzione into v_stato, v_scad
    from public.eventi e where e.id = v_evento;
  -- evento cancellato (i servizi se ne vanno con lui), o non in opzione
  if not found or v_stato <> 'opzione' or v_scad is null then
    return null;
  end if;

  select min(es.data) into v_primo
    from public.eventi_servizi es where es.evento_id = v_evento;
  if v_primo is not null and v_scad > v_primo then
    raise exception 'La scadenza dell''opzione (%) e'' dopo il primo servizio (%): anticipa la scadenza oppure correggi le date dei servizi.',
      to_char(v_scad, 'DD/MM/YYYY'), to_char(v_primo, 'DD/MM/YYYY');
  end if;
  return null;
end;
$fn$;


-- ------------------------------------------------------------
-- PASSO 2 — nessuno la chiama dall'app: la usano solo i controlli.
-- ------------------------------------------------------------
revoke execute on function public.eventi_controlla_scadenza() from public, anon, authenticated;


-- ------------------------------------------------------------
-- PASSO 3 — controllo sull'evento (nascita, cambio di stato,
-- proroga, riapertura).
-- ------------------------------------------------------------
drop trigger if exists eventi_scadenza_coerente on public.eventi;


-- ------------------------------------------------------------
-- PASSO 3b
-- ------------------------------------------------------------
create constraint trigger eventi_scadenza_coerente
  after insert or update of stato, scadenza_opzione on public.eventi
  deferrable initially deferred
  for each row execute function public.eventi_controlla_scadenza();


-- ------------------------------------------------------------
-- PASSO 4 — controllo sui servizi (aggiunti, spostati, tolti).
-- ------------------------------------------------------------
drop trigger if exists eventi_servizi_scadenza_coerente on public.eventi_servizi;


-- ------------------------------------------------------------
-- PASSO 4b
-- ------------------------------------------------------------
create constraint trigger eventi_servizi_scadenza_coerente
  after insert or update of data or delete on public.eventi_servizi
  deferrable initially deferred
  for each row execute function public.eventi_controlla_scadenza();


-- ------------------------------------------------------------
-- PASSO 5 — evento_salva: stessa firma e stessi permessi della 60
-- (create or replace li conserva). Due novita', segnate NOVITA' 62:
-- la scadenza di un evento esistente in opzione, e i controlli
-- rimandati fatti alla fine della funzione.
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
-- PASSO 6 — ricarica lo schema dell'API.
-- ------------------------------------------------------------
notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- V1 — i due controlli. PREVISIONE: 2 righe, rimandabile = true,
-- rimandato = true.
-- ------------------------------------------------------------
select t.tgname as controllo, t.tgrelid::regclass as tabella,
       t.tgdeferrable as rimandabile, t.tginitdeferred as rimandato
from pg_trigger t
where t.tgname in ('eventi_scadenza_coerente', 'eventi_servizi_scadenza_coerente')
order by 1;


-- ------------------------------------------------------------
-- V2 — evento_salva e' quella nuova. PREVISIONE: 1 riga,
-- nuova = true, solo_authenticated = true.
-- ------------------------------------------------------------
select position('NOVITA'' 62' in pg_get_functiondef(p.oid)) > 0 as nuova,
       has_function_privilege('authenticated', p.oid, 'execute')
         and not has_function_privilege('anon', p.oid, 'execute') as solo_authenticated
from pg_proc p
where p.proname = 'evento_salva' and p.pronamespace = 'public'::regnamespace;
