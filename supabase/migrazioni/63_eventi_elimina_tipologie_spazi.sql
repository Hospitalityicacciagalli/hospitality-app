-- ============================================================
-- MIGRAZIONE 63 — tipologie e spazi degli eventi si possono
-- ELIMINARE, con una sostituta per gli eventi che li usano
-- 12 novembre 2026 (verbale prova veloce delle correzioni, passi 5-6)
--
-- Fino a oggi tipologie e spazi «solo per eventi» non si cancellavano:
-- si spegnevano. Un errore di battitura restava per sempre.
-- Da oggi si eliminano:
--   * se nessun evento li usa, si eliminano e basta;
--   * se qualche evento li usa, chi elimina sceglie con che cosa
--     sostituirli (oppure «nessuna»/«nessuno»): il database sposta gli
--     eventi e cancella, IN UN'OPERAZIONE SOLA. O riesce tutto o non
--     cambia niente.
-- Solo chi ha Eventi = modifica (come per aggiungere e rinominare).
-- Gli spazi: solo quelli «solo per eventi». Le sale del ristorante
-- restano in Sale e Tavoli.
-- ⚠️ Il passo 0 del 12/11 ha mostrato che CINQUE tabelle di Sale e
-- Tavoli (tavoli_sala, layout_base, layout_sala, ostacoli_sala,
-- etichette_servizio) si cancellerebbero DA SOLE insieme allo spazio
-- (on delete cascade). Per questo spazio_elimina rifiuta se QUALUNQUE
-- tabella che punta a sale (lette dal database al momento, non scritte
-- qui: vale anche per quelle future) ha dati di quello spazio. L'unica
-- che tocca da sola e' eventi_servizi_sale, i legami coi servizi.
--
-- Si esegue UN PASSO ALLA VOLTA, in ordine. Tutto ripetibile.
-- I passi 1 e 4 sono lunghi: vanno copiati tutti, da "create or
-- replace function" fino a "$fn$;".
-- ⚠️ Il SQL Editor puo' mostrare l'avviso «destructive operations»
-- (per la parola delete dentro le funzioni): e' atteso, si va avanti
-- con «Run». Le funzioni cancellano solo quando qualcuno preme
-- «Elimina» nella pagina.
-- ============================================================


-- ------------------------------------------------------------
-- PASSO 0 — sola lettura: chi punta a sale e a eventi_tipologie,
-- e che cosa succede a quelle righe se la riga puntata si cancella.
-- PREVISIONE:
--   * eventi_tipologie: UNA riga, eventi.tipologia_id, «blocca»
--     (ON DELETE RESTRICT, sez. 0.3 v63).
--   * sale: eventi_servizi_sale.sala_id e tavoli_sala.sala_id, piu'
--     forse qualche altra tabella del ristorante (da 2 a 4 righe).
-- ESITO 12/11: eventi_tipologie come previsto; sale 6 righe, 5 con
-- «cancella anche loro» -> spazio_elimina riscritta (passo 4).
-- ⚠️ FERMARSI e mandarmi il CSV se, fuori da eventi_servizi_sale,
-- compare «cancella anche loro» o «svuota il campo»: vorrebbe dire
-- che eliminare uno spazio toccherebbe altri dati senza dirlo.
-- ------------------------------------------------------------
select c.confrelid::regclass::text as puntata,
       c.conrelid::regclass::text as tabella,
       a.attname as colonna,
       case c.confdeltype
         when 'a' then 'blocca'
         when 'r' then 'blocca'
         when 'c' then 'cancella anche loro'
         when 'n' then 'svuota il campo'
         when 'd' then 'mette il valore di base'
       end as se_si_cancella
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
where c.contype = 'f'
  and c.confrelid in ('public.sale'::regclass, 'public.eventi_tipologie'::regclass)
order by 1, 2, 3;


-- ------------------------------------------------------------
-- PASSO 0-BIS — sola lettura (aggiunto dopo il passo 0 del 12/11):
-- gli spazi «solo per eventi» hanno gia' dati nelle cinque tabelle di
-- Sale e Tavoli che si cancellerebbero insieme a loro?
-- PREVISIONE: una riga per ogni spazio «solo per eventi» (Piscina e gli
-- altri creati da Eventi), con TUTTI ZERO. Uno spazio con un numero
-- diverso da zero non si potra' eliminare (solo spegnere): non e' un
-- errore, ma mandami il CSV.
-- ------------------------------------------------------------
select s.nome,
       (select count(*) from public.tavoli_sala x where x.sala_id = s.id) as tavoli,
       (select count(*) from public.layout_base x where x.sala_id = s.id) as layout_base,
       (select count(*) from public.layout_sala x where x.sala_id = s.id) as layout_sala,
       (select count(*) from public.ostacoli_sala x where x.sala_id = s.id) as ostacoli,
       (select count(*) from public.etichette_servizio x where x.sala_id = s.id) as etichette
from public.sale s
where s.solo_eventi = true
order by s.nome;


-- ------------------------------------------------------------
-- PASSO 1 — elimina una tipologia.
-- p_sostituta: la tipologia da mettere sugli eventi che usavano
-- quella eliminata; null = «nessuna» (il campo resta vuoto).
-- Restituisce quanti eventi sono stati spostati.
-- ------------------------------------------------------------
create or replace function public.tipologia_elimina(p_gettone uuid, p_id uuid, p_sostituta uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_firma uuid;
  v_nome text;
  v_spostati integer := 0;
begin
  v_firma := public.eventi_firma_modifica(p_gettone);

  select t.nome into v_nome
    from public.eventi_tipologie t
    where t.id = p_id
    for update;
  if not found then
    raise exception 'Tipologia non trovata: forse e'' gia'' stata eliminata.';
  end if;

  if p_sostituta is not null then
    if p_sostituta = p_id then
      raise exception 'La tipologia sostituta deve essere diversa da quella che elimini.';
    end if;
    if not exists (select 1 from public.eventi_tipologie t where t.id = p_sostituta) then
      raise exception 'La tipologia sostituta non esiste piu'': ricarica la pagina.';
    end if;
  end if;

  update public.eventi e
    set tipologia_id = p_sostituta,
        updated_at = now(),
        updated_by = v_firma
    where e.tipologia_id = p_id;
  get diagnostics v_spostati = row_count;

  begin
    delete from public.eventi_tipologie t where t.id = p_id;
  exception when foreign_key_violation then
    raise exception 'La tipologia "%" e'' ancora usata altrove e non si puo'' eliminare: si puo'' solo spegnere.', v_nome;
  end;

  return v_spostati;
end;
$fn$;

-- PASSO 2
revoke execute on function public.tipologia_elimina(uuid, uuid, uuid) from public, anon;

-- PASSO 3
grant execute on function public.tipologia_elimina(uuid, uuid, uuid) to authenticated;


-- ------------------------------------------------------------
-- PASSO 4 — elimina uno spazio «solo per eventi».
-- p_sostituto: lo spazio da mettere sui servizi che usavano quello
-- eliminato; null = «nessuno» (il servizio perde solo quello spazio).
-- Se un servizio ha gia' anche il sostituto, non lo si raddoppia.
-- Restituisce quanti servizi sono stati toccati.
-- ------------------------------------------------------------
create or replace function public.spazio_elimina(p_gettone uuid, p_id uuid, p_sostituto uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_firma uuid;
  v_nome text;
  v_solo_eventi boolean;
  v_toccati integer := 0;
  r record;
  v_c_e boolean;
  v_altrove text[] := '{}';
begin
  v_firma := public.eventi_firma_modifica(p_gettone);

  select s.nome, s.solo_eventi into v_nome, v_solo_eventi
    from public.sale s
    where s.id = p_id
    for update;
  if not found then
    raise exception 'Spazio non trovato: forse e'' gia'' stato eliminato.';
  end if;
  if v_solo_eventi is distinct from true then
    raise exception 'Da Eventi si eliminano solo gli spazi "solo per eventi": le sale del ristorante si gestiscono da Sale e Tavoli.';
  end if;
  -- Dati di questo spazio in QUALUNQUE altra tabella che punta a sale
  -- (lette ora dal catalogo del database: tavoli, layout, ostacoli,
  -- etichette... e anche quelle che nasceranno). Molte si cancellerebbero
  -- da sole insieme allo spazio: se ce n'e' anche una sola, NON si elimina.
  for r in
    select c.conrelid::regclass::text as tabella, a.attname as colonna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.sale'::regclass
      and c.conrelid <> 'public.eventi_servizi_sale'::regclass
      and array_length(c.conkey, 1) = 1
  loop
    execute format('select exists (select 1 from %s where %I = $1)', r.tabella, r.colonna)
      into v_c_e
      using p_id;
    if v_c_e then
      v_altrove := v_altrove || r.tabella;
    end if;
  end loop;
  if array_length(v_altrove, 1) > 0 then
    raise exception 'Lo spazio "%" ha dati in Sale e Tavoli (%): non si elimina, si puo'' solo spegnere.', v_nome, array_to_string(v_altrove, ', ');
  end if;

  if p_sostituto is not null then
    if p_sostituto = p_id then
      raise exception 'Lo spazio sostituto deve essere diverso da quello che elimini.';
    end if;
    if not exists (select 1 from public.sale s where s.id = p_sostituto) then
      raise exception 'Lo spazio sostituto non esiste piu'': ricarica la pagina.';
    end if;
  end if;

  select count(distinct x.servizio_id) into v_toccati
    from public.eventi_servizi_sale x
    where x.sala_id = p_id;

  if p_sostituto is not null then
    insert into public.eventi_servizi_sale (servizio_id, sala_id)
      select distinct x.servizio_id, p_sostituto
      from public.eventi_servizi_sale x
      where x.sala_id = p_id
        and not exists (
          select 1 from public.eventi_servizi_sale y
          where y.servizio_id = x.servizio_id and y.sala_id = p_sostituto
        );
  end if;

  -- l'evento risulta modificato da chi ha eliminato lo spazio
  update public.eventi e
    set updated_at = now(),
        updated_by = v_firma
    where e.id in (
      select s.evento_id
      from public.eventi_servizi s
      join public.eventi_servizi_sale x on x.servizio_id = s.id
      where x.sala_id = p_id
    );

  delete from public.eventi_servizi_sale x where x.sala_id = p_id;

  begin
    delete from public.sale s where s.id = p_id;
  exception when foreign_key_violation then
    raise exception 'Lo spazio "%" e'' ancora usato altrove e non si puo'' eliminare: si puo'' solo spegnere.', v_nome;
  end;

  return v_toccati;
end;
$fn$;

-- PASSO 5
revoke execute on function public.spazio_elimina(uuid, uuid, uuid) from public, anon;

-- PASSO 6
grant execute on function public.spazio_elimina(uuid, uuid, uuid) to authenticated;

-- PASSO 7
notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- V1 — sola lettura: le due funzioni e chi le puo' usare.
-- PREVISIONE: 2 righe, tipologia_elimina e spazio_elimina, ciascuna
-- con authenticated = true e anon = false.
-- ------------------------------------------------------------
select p.proname as funzione,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('anon', p.oid, 'execute') as anon
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('tipologia_elimina', 'spazio_elimina')
order by 1;
