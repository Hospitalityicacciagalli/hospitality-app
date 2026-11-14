-- =====================================================================
-- MIGRAZIONE 64 — Modulo Eventi, fase 1, sessione 2: IL PASSAGGIO
-- Hospitality 2026 — 14 novembre 2026 — sez. 0.5 punti 4, 5, 6 v61
-- =====================================================================
-- COME SI ESEGUE: Supabase -> SQL Editor, UN PASSO ALLA VOLTA (dalla
-- riga "PASSO n" alla riga vuota successiva, commenti compresi), Run,
-- "Success", poi il passo dopo. Ogni passo e' ripetibile.
-- ⚠️ I passi con una funzione sono LUNGHI: si copia da "create" fino
-- a "$fn$;" compreso.
--
-- ⚠️ MIGRAZIONE E COMMIT VANNO INSIEME (0.7 v61): appena finito il
-- passo V3, si fa SUBITO il commit dei file JSX. In mezzo nessuno deve
-- segnare eventi dalla pagina del giorno. Se qualcuno lo fa, si
-- ripetono i passi 3 e 4 dopo il commit: prendono solo le righe nuove.
--
-- PRIMA DI COMINCIARE: eliminati dalla pagina Eventi i due eventi di
-- prova («NUOVA PROVA» e «prova»). Il passo 0c lo controlla.
--
-- COSA FA:
--   A. travaso: ogni riga di event_dates diventa un evento con lo
--      STESSO id + un servizio (stessa data e fascia). event_dates non
--      si tocca: resta come archivio (si chiudera' in scrittura con
--      una migrazione a parte, dopo la prova sul campo).
--   B. la cassa nuova (cassa2_movimenti.event_id) punta a eventi, con
--      «non cancellare se ci sono movimenti». La cassa vecchia resta
--      su event_dates.
--   C. riepilogo_alert conta gli eventi con coperti_eventi (la funzione
--      unica della 60) e restituisce in piu' gli ospiti in opzione e
--      l'esclusiva.
--
-- REGOLE DEL TRAVASO (decise in v61, confermate il 14/11):
--   * confirmed -> confermato; option -> opzione con scadenza = la
--     data dell'evento;
--   * "Adulti: x · Bambini: y" nelle note -> ipotetici adulti/bambini,
--     SOLO se la somma e' uguale ai coperti (> 0); gli altri numeri ->
--     ospiti storici (totale senza divisione); vuoto o 0 -> senza numero;
--   * tipologia, cliente e spazi VUOTI: non si deducono dal titolo ne'
--     dalle note. L'esclusiva resta SPENTA: «pergola in esclusiva»
--     nelle note vuol dire la pergola e' loro, non ristorante chiuso;
--   * le note restano sull'evento; created_at conservato;
--     provenienza 'event_dates'.
-- =====================================================================


-- =====================================================================
-- PASSO 0a — sola lettura. Le colonne delle tre tabelle del travaso,
-- con obbligatorieta' e valore di partenza, e i controlli di eventi
-- ed eventi_servizi.
-- PREVISIONE: in eventi, created_by e updated_by FACOLTATIVE (il
-- travaso non le scrive: le righe d'archivio non hanno un autore);
-- un controllo sullo stato con i quattro valori e uno sulla
-- provenienza con 'event_dates' e 'modulo'.
-- ⛔ PUNTO D'ARRESTO: mandare il CSV a Claude prima di andare avanti.
-- =====================================================================
select 'colonna' as cosa, c.table_name as tabella, c.column_name as nome,
       c.data_type || case when c.is_nullable = 'NO' then ' OBBLIGATORIA' else '' end as dettaglio,
       coalesce(c.column_default, '') as partenza
from information_schema.columns c
where c.table_schema = 'public' and c.table_name in ('eventi', 'eventi_servizi', 'event_dates')
union all
select 'controllo', r.relname, k.conname, pg_get_constraintdef(k.oid), ''
from pg_constraint k
join pg_class r on r.oid = k.conrelid
join pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public' and r.relname in ('eventi', 'eventi_servizi') and k.contype = 'c'
order by 1, 2, 3;


-- =====================================================================
-- PASSO 0b — sola lettura (regola 58: si chiede al database chi
-- legge, non lo si ricorda). Funzioni e viste che nominano event_dates
-- o riepilogo_alert.
-- PREVISIONE: una riga sola, la funzione riepilogo_alert. Se compare
-- anche solo un'altra funzione o una vista, FERMARSI: il passo 7
-- (che cancella e ricrea riepilogo_alert) potrebbe fallire o
-- lasciare indietro chi la usa.
-- ⛔ PUNTO D'ARRESTO.
-- =====================================================================
select 'funzione' as cosa, p.proname as nome
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.prosrc ilike '%event_dates%' or p.prosrc ilike '%riepilogo_alert%')
union all
select 'vista', v.viewname
from pg_views v
where v.schemaname = 'public'
  and (v.definition ilike '%event_dates%' or v.definition ilike '%riepilogo_alert%')
order by 1, 2;


-- =====================================================================
-- PASSO 0c — sola lettura. Cosa c'e' prima del travaso.
-- PREVISIONE: eventi 0 (le due prove eliminate), event_dates 123 o
-- poco piu', id in comune 0, soldi collegati 0.
-- ⛔ PUNTO D'ARRESTO se eventi non e' 0.
-- =====================================================================
select
  (select count(*) from public.eventi)                                             as eventi,
  (select count(*) from public.event_dates)                                        as event_dates,
  (select count(*) from public.eventi e join public.event_dates d on d.id = e.id)  as id_in_comune,
  (select count(*) from public.cassa2_movimenti where event_id is not null)        as soldi_cassa_nuova;


-- =====================================================================
-- A. IL TRAVASO
-- =====================================================================

-- PASSO 1 — le testate. Prende solo le righe non ancora travasate:
-- ripetibile, e ripetendolo dopo il commit raccoglie un evento segnato
-- nel frattempo dalla pagina vecchia.
insert into public.eventi (id, titolo, tipologia_id, stato, cliente_id, scadenza_opzione, note, provenienza, created_at, updated_at)
select d.id,
       coalesce(nullif(btrim(d.title), ''), 'Evento'),
       null,
       case when d.event_type = 'option' then 'opzione' else 'confermato' end,
       null,
       case when d.event_type = 'option' then d.event_date else null end,
       nullif(btrim(coalesce(d.notes, '')), ''),
       'event_dates',
       coalesce(d.created_at, now()),
       coalesce(d.created_at, now())
from public.event_dates d
where not exists (select 1 from public.eventi e where e.id = d.id);

-- PASSO 2 — i servizi: uno per evento travasato che non ne ha ancora.
insert into public.eventi_servizi (evento_id, nome, data, fascia, ipotetici_adulti, ipotetici_bambini, ospiti_storici, occupa_coperti, esclusiva, ordine)
select x.id, null, x.event_date, x.meal_type,
       case when x.divisione then x.adulti end,
       case when x.divisione then x.bambini end,
       case when not x.divisione and coalesce(x.covers_reserved, 0) > 0 then x.covers_reserved end,
       true,
       false,
       1
from (
  select d.id, d.event_date, d.meal_type, d.covers_reserved,
         coalesce(substring(d.notes from '(?i)adulti:\s*([0-9]+)')::int, 0) as adulti,
         coalesce(substring(d.notes from '(?i)bambini:\s*([0-9]+)')::int, 0) as bambini,
         (coalesce(d.covers_reserved, 0) > 0
          and d.notes ~* 'adulti:\s*[0-9]+'
          and coalesce(substring(d.notes from '(?i)adulti:\s*([0-9]+)')::int, 0)
            + coalesce(substring(d.notes from '(?i)bambini:\s*([0-9]+)')::int, 0)
            = d.covers_reserved) as divisione
  from public.event_dates d
  join public.eventi e on e.id = d.id and e.provenienza = 'event_dates'
  where not exists (select 1 from public.eventi_servizi s where s.evento_id = d.id)
) x;

-- PASSO 3 — verifica del travaso (sola lettura).
-- PREVISIONE: travasati = righe di event_dates (123 o poco piu');
-- con_servizio uguale; senza_servizio 0; mancanti 0; confermati 122,
-- opzioni 1; con_divisione fino a 30 (servono coperti > 0);
-- senza_numero 29; storici = il resto; futuri 44.
select
  (select count(*) from public.eventi where provenienza = 'event_dates')                         as travasati,
  (select count(distinct s.evento_id) from public.eventi_servizi s join public.eventi e on e.id = s.evento_id and e.provenienza = 'event_dates') as con_servizio,
  (select count(*) from public.eventi e where e.provenienza = 'event_dates' and not exists (select 1 from public.eventi_servizi s where s.evento_id = e.id)) as senza_servizio,
  (select count(*) from public.event_dates d where not exists (select 1 from public.eventi e where e.id = d.id)) as mancanti,
  (select count(*) from public.eventi where provenienza = 'event_dates' and stato = 'confermato') as confermati,
  (select count(*) from public.eventi where provenienza = 'event_dates' and stato = 'opzione')    as opzioni,
  (select count(*) from public.eventi_servizi s join public.eventi e on e.id = s.evento_id and e.provenienza = 'event_dates' where s.ipotetici_adulti is not null) as con_divisione,
  (select count(*) from public.eventi_servizi s join public.eventi e on e.id = s.evento_id and e.provenienza = 'event_dates' where s.ospiti_storici is not null) as storici,
  (select count(*) from public.eventi_servizi s join public.eventi e on e.id = s.evento_id and e.provenienza = 'event_dates' where s.ipotetici_adulti is null and s.ospiti_storici is null) as senza_numero,
  (select count(*) from public.eventi_servizi s join public.eventi e on e.id = s.evento_id and e.provenienza = 'event_dates' where s.data >= current_date) as futuri;

-- PASSO 4 — la prova del conteggio (sola lettura): per ogni giorno e
-- turno, i coperti come li contava event_dates e come li conta il
-- modulo. PREVISIONE: 0 righe (nessuna differenza).
with vecchio as (
  select d.event_date as giorno, f.fascia,
         coalesce(sum(d.covers_reserved) filter (where d.covers_reserved > 0), 0)::int as ospiti,
         (count(*) filter (where coalesce(d.covers_reserved, 0) = 0))::int as senza_numero
  from public.event_dates d
  cross join lateral unnest(case when d.meal_type = 'both' then array['lunch', 'dinner'] else array[d.meal_type] end) as f(fascia)
  group by 1, 2
),
nuovo as (
  select c.giorno, c.fascia, (c.ospiti_confermati + c.ospiti_opzione) as ospiti, c.servizi_senza_numero as senza_numero
  from public.coperti_eventi('2000-01-01', '2100-12-31') c
)
select coalesce(v.giorno, n.giorno) as giorno, coalesce(v.fascia, n.fascia) as fascia,
       v.ospiti as ospiti_prima, n.ospiti as ospiti_dopo,
       v.senza_numero as senza_numero_prima, n.senza_numero as senza_numero_dopo
from vecchio v
full join nuovo n on n.giorno = v.giorno and n.fascia = v.fascia
where v.ospiti is distinct from n.ospiti or v.senza_numero is distinct from n.senza_numero
order by 1, 2;


-- =====================================================================
-- B. IL GANCIO DELLA CASSA NUOVA
-- =====================================================================

-- PASSO 5 — cassa2_movimenti.event_id punta a eventi, con «non
-- cancellare se ci sono movimenti». Nessun movimento viene riscritto
-- (oggi nessuno e' collegato). Il tipo delle due colonne si controlla
-- prima (regola 29): se non coincide, si ferma senza cambiare niente.
do $$
declare
  t_mov text;
  t_ev  text;
begin
  select format_type(a.atttypid, a.atttypmod) into t_mov
    from pg_attribute a
    where a.attrelid = 'public.cassa2_movimenti'::regclass and a.attname = 'event_id' and not a.attisdropped;
  select format_type(a.atttypid, a.atttypmod) into t_ev
    from pg_attribute a
    where a.attrelid = 'public.eventi'::regclass and a.attname = 'id' and not a.attisdropped;
  if t_mov is distinct from t_ev then
    raise exception 'Tipi diversi: cassa2_movimenti.event_id e'' %, eventi.id e'' %. Niente cambiato.', t_mov, t_ev;
  end if;
  alter table public.cassa2_movimenti drop constraint if exists cassa2_movimenti_event_id_fkey;
  alter table public.cassa2_movimenti drop constraint if exists cassa2_movimenti_evento_fkey;
  alter table public.cassa2_movimenti
    add constraint cassa2_movimenti_evento_fkey
    foreign key (event_id) references public.eventi(id) on delete restrict;
end
$$;


-- =====================================================================
-- C. RIEPILOGO_ALERT SUL CONTEGGIO UNICO
-- =====================================================================

-- PASSO 6 — si cancella per ricrearla con due colonne in piu' in fondo
-- (una funzione che restituisce una tabella non cambia le colonne con
-- un semplice "replace"). Il calendario legge le colonne per nome:
-- quelle di prima restano tutte, uguali.
drop function if exists public.riepilogo_alert(date, date);

-- PASSO 7 — stessa regola di prima per prenotazioni, limiti e alert
-- manuali; gli eventi arrivano da coperti_eventi:
--   coperti_evento   = confermati + opzioni (un'opzione occupa);
--   coperti_opzione  = NUOVA, quanti di quelli sono in opzione;
--   evento_senza_numero = almeno un servizio senza numero;
--   esclusiva        = NUOVA, almeno un servizio in esclusiva.
-- Richieste e annullati non contano (lo decide coperti_eventi).
create function public.riepilogo_alert(p_dal date, p_al date)
returns table(data date, fascia text, coperti_spicciolata integer, coperti_evento integer, coperti integer, limite integer, in_alert_auto boolean, evento_senza_numero boolean, alert_manuale boolean, alert_testo text, coperti_opzione integer, esclusiva boolean)
language sql
stable
set search_path to 'public'
as $fn$
  with coperti_cte as (
    select
      r.reservation_date as data,
      r.meal_type        as fascia,
      coalesce(sum(r.guests_count), 0)::int as coperti
    from public.reservations r
    where r.reservation_date between p_dal and p_al
      and r.meal_type in ('lunch', 'dinner')
      and r.status is distinct from 'cancelled'
    group by r.reservation_date, r.meal_type
  ),
  eventi_cte as (
    select
      c.giorno as data,
      c.fascia,
      (c.ospiti_confermati + c.ospiti_opzione)::int as coperti_evento,
      c.ospiti_opzione::int as coperti_opzione,
      (c.servizi_senza_numero > 0) as evento_senza_numero,
      coalesce(c.esclusiva, false) as esclusiva
    from public.coperti_eventi(p_dal, p_al) c
    where c.fascia in ('lunch', 'dinner')
  ),
  manuali_cte as (
    select a.data, a.fascia, a.testo
    from public.alert_prenotazioni a
    where a.data between p_dal and p_al
      and a.attivo = true
      and a.fascia in ('lunch', 'dinner')
  ),
  chiavi as (
    select data, fascia from coperti_cte
    union
    select data, fascia from eventi_cte
    union
    select data, fascia from manuali_cte
  )
  select
    k.data,
    k.fascia,
    coalesce(c.coperti, 0) as coperti_spicciolata,
    coalesce(e.coperti_evento, 0) as coperti_evento,
    (coalesce(c.coperti, 0) + coalesce(e.coperti_evento, 0)) as coperti,
    public.limite_effettivo(k.data, k.fascia)::int as limite,
    ((coalesce(c.coperti, 0) + coalesce(e.coperti_evento, 0)) >= public.limite_effettivo(k.data, k.fascia)::int) as in_alert_auto,
    coalesce(e.evento_senza_numero, false) as evento_senza_numero,
    (m.data is not null) as alert_manuale,
    m.testo as alert_testo,
    coalesce(e.coperti_opzione, 0) as coperti_opzione,
    coalesce(e.esclusiva, false) as esclusiva
  from chiavi k
  left join coperti_cte c on c.data = k.data and c.fascia = k.fascia
  left join eventi_cte  e on e.data = k.data and e.fascia = k.fascia
  left join manuali_cte m on m.data = k.data and m.fascia = k.fascia;
$fn$;

-- PASSO 8
revoke execute on function public.riepilogo_alert(date, date) from public, anon;

-- PASSO 9
grant execute on function public.riepilogo_alert(date, date) to authenticated;

-- PASSO 10
notify pgrst, 'reload schema';


-- =====================================================================
-- VERIFICHE (sole letture) -> CSV a Claude, poi SUBITO il commit
-- =====================================================================

-- PASSO V1 — il gancio della cassa.
-- PREVISIONE: una riga, cassa2_movimenti_evento_fkey verso eventi,
-- in_cancellazione = r (restrict). La cassa vecchia non compare qui:
-- punta ancora a event_dates.
select c.conname, c.confrelid::regclass as punta_a, c.confdeltype as in_cancellazione
from pg_constraint c
where c.contype = 'f' and c.conrelid = 'public.cassa2_movimenti'::regclass
  and c.conname like '%event%';

-- PASSO V2 — riepilogo_alert. PREVISIONE: 12 colonne, eseguibile da
-- authenticated (t) e non da anon (f).
select p.oid::regprocedure as firma,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       pg_get_function_result(p.oid) as colonne
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'riepilogo_alert';

-- PASSO V3 — la prova sul mese corrente e il prossimo: righe con
-- eventi. PREVISIONE: le stesse date e gli stessi coperti che il
-- calendario mostra oggi; esclusiva sempre falsa; coperti_opzione 0
-- (l'unica opzione e' del 4 ottobre).
select data, fascia, coperti_spicciolata, coperti_evento, coperti_opzione, coperti, limite, in_alert_auto, evento_senza_numero, esclusiva
from public.riepilogo_alert(date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '2 months' - interval '1 day')::date)
where coperti_evento > 0 or evento_senza_numero
order by data, fascia;
