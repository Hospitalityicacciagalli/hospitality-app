-- ============================================================
-- MIGRAZIONE 66 — event_dates diventa ARCHIVIO IN SOLA LETTURA
-- 16 novembre 2026 (disegno: 0.5 punto «dopo il collaudo» v61,
-- 0.3 punto 2 v72; decisione di Florestano del 16/11: due lucchetti)
--
-- Dalla migrazione 64 gli eventi vivono in public.eventi: le 123
-- righe di event_dates ci sono state travasate con gli stessi id, e
-- dal commit c97c88f nessuna pagina ci scrive piu'. L'unica che la
-- legge ancora e' la cassa VECCHIA (CassaPage.jsx), in sola lettura.
--
-- Oggi pero' la tabella e' ancora scrivibile da chiunque abbia fatto
-- il login: la regola «Admin can manage event_dates», nonostante il
-- nome, vale per tutti i loggati (auth.uid() IS NOT NULL) e permette
-- di inserire, modificare e cancellare (0.2 v60).
--
-- Questa migrazione mette DUE lucchetti:
--   1. toglie la regola «Admin can manage event_dates» (resta solo
--      quella di lettura);
--   2. toglie ai ruoli dell'app (anon, authenticated) il diritto di
--      inserire, modificare, cancellare e svuotare la tabella, come
--      la 60 ha fatto per pin_gettoni. Se un giorno qualcuno
--      riaprisse per sbaglio una regola, la tabella resta chiusa.
-- La LETTURA non cambia. Florestano dal Table Editor di Supabase
-- (utente postgres) puo' ancora correggere a mano. Niente DROP:
-- la cassa vecchia punta ancora qui.
--
-- Si esegue UN PASSO ALLA VOLTA, in ordine. Tutto ripetibile.
-- Le PROVE (0g e V3) sono blocchi "do": vanno copiati interi, da
-- "do $prova$" fino a "$prova$;". Finiscono SEMPRE con un ERRORE
-- rosso che comincia con «PROVA ANNULLATA»: e' voluto, e' il modo
-- per far vedere il risultato e annullare tutto quello che la prova
-- ha toccato.
-- ============================================================


-- ------------------------------------------------------------
-- PASSO 0a — sola lettura: la sicurezza per riga e' accesa.
-- PREVISIONE: 1 riga, rls_accesa = true, rls_forzata = false.
-- Se rls_accesa e' false FERMARSI e mandarmi la riga: togliere la
-- regola non chiuderebbe niente.
-- ------------------------------------------------------------
select c.relrowsecurity as rls_accesa,
       c.relforcerowsecurity as rls_forzata
from pg_class c
where c.oid = 'public.event_dates'::regclass;


-- ------------------------------------------------------------
-- PASSO 0b — sola lettura: le regole di accesso della tabella.
-- PREVISIONE: 2 righe —
--   «Active users can read event_dates»  cmd SELECT
--   «Admin can manage event_dates»       cmd ALL,
--                                         condizione (auth.uid() IS NOT NULL)
-- La condizione della regola di LETTURA non e' mai stata letta:
-- previsione «legata all'utente loggato / attivo».
-- Se c'e' una TERZA regola che permette di scrivere (cmd INSERT,
-- UPDATE, DELETE o ALL) FERMARSI e mandarmi le righe.
-- ------------------------------------------------------------
select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'event_dates'
order by policyname;


-- ------------------------------------------------------------
-- PASSO 0c — sola lettura: i diritti di tabella.
-- PREVISIONE (quelli di base di Supabase): 4 righe — anon,
-- authenticated, postgres, service_role — ognuna con
-- DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE.
-- ------------------------------------------------------------
select grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as diritti
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'event_dates'
group by grantee
order by grantee;


-- ------------------------------------------------------------
-- PASSO 0d — sola lettura: funzioni del database che nominano
-- event_dates (una funzione «security definer» scriverebbe anche a
-- tabella chiusa).
-- PREVISIONE: 0 righe (la 64 ha ricreato riepilogo_alert sul
-- conteggio unico coperti_eventi, che legge eventi).
-- Se esce una riga FERMARSI e mandarmela.
-- ------------------------------------------------------------
select p.proname as funzione,
       p.prosecdef as security_definer
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prosrc ilike '%event_dates%'
order by 1;


-- ------------------------------------------------------------
-- PASSO 0e — sola lettura: trigger sulla tabella.
-- PREVISIONE: 0 righe.
-- Se esce una riga FERMARSI e mandarmela (la prova 0g fa un
-- aggiornamento finto, e un trigger potrebbe scrivere altrove).
-- ------------------------------------------------------------
select t.tgname as trigger, p.proname as funzione
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.event_dates'::regclass
  and not t.tgisinternal;


-- ------------------------------------------------------------
-- PASSO 0f — sola lettura: le righe dell'archivio.
-- PREVISIONE: 1 riga — righe = 123, dopo_il_14 = 0 (nessuno ci ha
-- scritto dopo il travaso), non_travasate = 0.
-- ------------------------------------------------------------
select count(*) as righe,
       count(*) filter (where d.created_at >= date '2026-11-15') as dopo_il_14,
       count(*) filter (where not exists (
         select 1 from public.eventi e where e.id = d.id)) as non_travasate
from public.event_dates d;


-- ------------------------------------------------------------
-- PASSO 0g — PROVA «PRIMA»: l'app oggi puo' scrivere?
-- Fa finta di essere il primo super admin attivo collegato
-- dall'app (ruolo authenticated), conta le righe che vede e prova a
-- "modificare" tutte le note rimettendo la stessa nota. Poi annulla
-- TUTTO con un errore voluto.
-- Serve a dimostrare che la prova SA vedere una scrittura: senza
-- questo, il «rifiutata» del V3 potrebbe essere solo una prova che
-- non funziona (regola 44).
-- PREVISIONE: errore rosso
--   «PROVA ANNULLATA - righe lette = 123; righe che l'app poteva
--    modificare = 123»
-- Se invece dice «permission denied to set role» mandarmelo: la
-- prova non si puo' fare cosi' e la cambio.
-- Eseguire SOLO se 0e ha dato 0 righe.
-- ------------------------------------------------------------
do $prova$
declare
  v_uid uuid;
  v_lette integer;
  v_scritte integer;
  v_esito text;
begin
  select up.id into v_uid
  from public.user_profiles up
  where up.role = 'super_admin' and up.is_active is true
  order by up.id
  limit 1;
  if v_uid is null then
    raise exception 'PROVA ANNULLATA - nessun super admin attivo trovato';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  select count(*) into v_lette from public.event_dates;
  begin
    update public.event_dates set notes = notes;
    get diagnostics v_scritte = row_count;
    v_esito := 'righe che l''app poteva modificare = ' || v_scritte;
  exception when insufficient_privilege then
    v_esito := 'scrittura RIFIUTATA (permesso negato)';
  end;
  raise exception 'PROVA ANNULLATA - righe lette = %; %', v_lette, v_esito;
end
$prova$;


-- ============================================================
-- DA QUI SI SCRIVE. Solo se 0a–0g sono come previsto.
-- ============================================================

-- ------------------------------------------------------------
-- PASSO 1 — primo lucchetto: via la regola che permetteva a tutti
-- i loggati di scrivere.
-- ------------------------------------------------------------
drop policy if exists "Admin can manage event_dates" on public.event_dates;


-- ------------------------------------------------------------
-- PASSO 2 — secondo lucchetto: i ruoli dell'app non possono piu'
-- inserire, modificare, cancellare ne' svuotare la tabella.
-- SELECT resta (la cassa vecchia legge).
-- ------------------------------------------------------------
revoke insert, update, delete, truncate on table public.event_dates
  from anon, authenticated;


-- ------------------------------------------------------------
-- PASSO 3 — un cartello sulla tabella, per chi la apre in Supabase.
-- ------------------------------------------------------------
comment on table public.event_dates is
  'ARCHIVIO IN SOLA LETTURA dalla migrazione 66 (16/11/2026). Gli eventi vivono in public.eventi (travaso: migrazione 64, stessi id). La legge ancora la cassa vecchia (CassaPage). Non si cancella: movimenti_cassa.event_id punta qui.';


-- ------------------------------------------------------------
-- PASSO 4 — avvisare l'API.
-- ------------------------------------------------------------
notify pgrst, 'reload schema';


-- ============================================================
-- VERIFICHE
-- ============================================================

-- ------------------------------------------------------------
-- V1 — resta solo la regola di lettura.
-- PREVISIONE: 1 riga, «Active users can read event_dates», SELECT,
-- con la stessa condizione letta al passo 0b.
-- ------------------------------------------------------------
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'event_dates'
order by policyname;


-- ------------------------------------------------------------
-- V2 — i diritti di tabella.
-- PREVISIONE: anon e authenticated = REFERENCES, SELECT, TRIGGER;
-- postgres e service_role uguali al passo 0c.
-- ------------------------------------------------------------
select grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as diritti
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'event_dates'
group by grantee
order by grantee;


-- ------------------------------------------------------------
-- V3 — PROVA «DOPO»: la stessa prova del passo 0g.
-- PREVISIONE: errore rosso
--   «PROVA ANNULLATA - righe lette = 123; scrittura RIFIUTATA
--    (permesso negato)»
-- Le righe lette devono essere ancora 123: la lettura non si tocca.
-- ------------------------------------------------------------
do $prova$
declare
  v_uid uuid;
  v_lette integer;
  v_scritte integer;
  v_esito text;
begin
  select up.id into v_uid
  from public.user_profiles up
  where up.role = 'super_admin' and up.is_active is true
  order by up.id
  limit 1;
  if v_uid is null then
    raise exception 'PROVA ANNULLATA - nessun super admin attivo trovato';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  select count(*) into v_lette from public.event_dates;
  begin
    update public.event_dates set notes = notes;
    get diagnostics v_scritte = row_count;
    v_esito := 'righe che l''app poteva modificare = ' || v_scritte;
  exception when insufficient_privilege then
    v_esito := 'scrittura RIFIUTATA (permesso negato)';
  end;
  raise exception 'PROVA ANNULLATA - righe lette = %; %', v_lette, v_esito;
end
$prova$;


-- ------------------------------------------------------------
-- V4 — l'archivio e' intatto.
-- PREVISIONE: righe = 123, non_travasate = 0 (come al passo 0f).
-- ------------------------------------------------------------
select count(*) as righe,
       count(*) filter (where not exists (
         select 1 from public.eventi e where e.id = d.id)) as non_travasate
from public.event_dates d;


-- ============================================================
-- AGGIUNTA DEL 16/11 POMERIGGIO — IL RECUPERO
-- La lettura 0f NON e' andata come previsto: righe 125 (non 123),
-- dopo_il_14 = 1, non_travasate = 3. Dopo il travaso del 14/11
-- qualcuno ha usato la pagina VECCHIA (un dispositivo col programma
-- di prima, regola 49), che scriveva ancora qui:
--   - 14/11 17:10 nuovo  COMUNIONE GIGLIO          02/06/2027 pranzo 75
--   - 14/11 20:02 nuovo  EVENTO TERRACCIANO ...    06/03/2027 pranzo 50
--                 (era al 27/03/2027 con nota PERGOLA: cancellato e
--                 riscritto = spostato; nel modulo e' ancora al 27/03)
--   - 15/11 17:45 nuovo  COMUNION CORVINO CARLO    13/06/2027 pranzo 60
--   - corretto il titolo ABBANDANDOLO -> ABBONDANDOLO (02/06/2027)
-- Nel modulo: 123 eventi d'archivio, mai modificati (updated_at =
-- created_at), 0 soldi collegati.
-- Decisione di Florestano: Terracciano e Abbondandolo si correggono A
-- MANO nel modulo (data del servizio al 06/03, nota e codice restano);
-- Giglio e Corvino entrano con i passi 1-2 della 64, ESCLUDENDO la
-- riga nuova di Terracciano (sarebbe un doppione senza nota).
-- Si fanno DOPO i passi 1-4 (archivio gia' chiuso: niente di nuovo
-- puo' arrivare nel frattempo).
-- ============================================================

-- ------------------------------------------------------------
-- PASSO R1 — le testate di Giglio e Corvino (passo 1 della 64 con
-- l'esclusione della riga nuova di Terracciano). Ripetibile.
-- PREVISIONE: Success (inserisce 2 righe; il SQL Editor non lo dice,
-- lo dice la RV).
-- ------------------------------------------------------------
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
where not exists (select 1 from public.eventi e where e.id = d.id)
  and d.id <> '626c98f6-a928-4cfd-8805-27cdad68eb6b';

-- ------------------------------------------------------------
-- PASSO R2 — i loro servizi (passo 2 della 64, identico). Ripetibile.
-- PREVISIONE: Success (inserisce 2 righe).
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- PASSO RV — i quattro eventi come devono essere.
-- PREVISIONE: 4 righe —
--   EVENTO TERRACCIANO 1 CPMPLEANNO  2027-03-06 lunch  50  PERGOLA
--                                    (modificato oggi, a mano)
--   COMUNIONE ABBONDANDOLO           2027-06-02 lunch  35  SALA PERGOLA...
--                                    (modificato oggi, a mano)
--   COMUNIONE GIGLIO                 2027-06-02 lunch  75  PRINCIPALE IN ESCLUSIVA
--   COMUNION CORVINO CARLO           2027-06-13 lunch  60  PRINCIPALE
-- tutti confermato, esclusiva false (il travaso non la accende mai).
-- ------------------------------------------------------------
select e.titolo, e.stato, s.data, s.fascia,
       coalesce(s.ospiti_storici, s.ipotetici_adulti + coalesce(s.ipotetici_bambini, 0)) as numero,
       s.esclusiva, e.note,
       to_char(e.updated_at at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI') as modificato
from public.eventi e
join public.eventi_servizi s on s.evento_id = e.id and s.ordine = 1
where e.id in ('abee8967-bdc3-4714-aaea-6cfc832029dd',
               'ab5944ab-2cf4-49a2-9755-84f7f1381fcd',
               '6c094e83-b57b-4811-9136-ea99bdf0ba98')
   or e.titolo ilike 'COMUNIONE ABB%'
order by s.data, e.titolo;

-- ------------------------------------------------------------
-- V4 (ripetuta, previsione AGGIORNATA dopo il recupero):
-- righe = 125, non_travasate = 1 (la riga nuova di Terracciano,
-- esclusa di proposito: nel modulo vive come l'evento abee8967
-- spostato al 06/03).
-- ------------------------------------------------------------
