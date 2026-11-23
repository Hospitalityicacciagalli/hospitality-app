-- ============================================================
-- MIGRAZIONE 67 — STORICO DEL CLIENTE (funzione cliente_storico)
-- 23 novembre 2026 (disegno: 0.6 v76 sessione 1; risposte di
-- Florestano del 23/11; letture Storico_S1…S6 del 23/11)
--
-- Una funzione SOLA (regola 31) che, dato un cliente, restituisce
-- tutte le righe del suo storico:
--   * 'ristorante' — ogni prenotazione in cui il cliente compare,
--     da intestatario o da collegato, UNA VOLTA SOLA. Si legge da
--     tutti e due i posti dove vive l'intestatario
--     (reservations.customer_id e prenotazione_clienti): S5 ha
--     trovato 8 prenotazioni con l'intestatario solo nel primo
--     (i pasti creati dalla pagina Gift card).
--     La gift card si legge da tutti e due i lati del legame
--     (reservations.gift_card_id e gift_card.prenotazione_id, S3).
--   * 'evento' — UNA RIGA PER SERVIZIO (risposta 5), con titolo,
--     tipologia e stato dell'evento. Il numero di ospiti NON si
--     calcola qui: la funzione restituisce i numeri grezzi e la
--     pagina usa numeroServizio() di EventiPage (copia di quella del
--     database, migrazione 60) — nessuna terza copia.
--   * 'soggiorno' — le prenotazioni HiC del cliente collegato in
--     hic_clienti_legame. Chi conta lo decide hic_perimetro_ok(...,
--     'standard') come in Camere e colazioni: niente annullate,
--     blocchi, preventivi, virtuali. Camera esclusa dai totali fuori
--     come in hic_camere_notte.
--
-- PERMESSI (risposta 6): la funzione gira con i permessi di chi la
-- chiama (NON security definer). Le regole delle tabelle (S6)
-- decidono da sole: chi non ha il permesso Eventi non riceve le
-- righe 'evento'. Prenotazioni, gift card e soggiorni li leggono
-- tutti i loggati.
--
-- Nessun indice nuovo: S4 ha mostrato che ci sono già tutti.
-- Nessuna tabella toccata: la migrazione è solo una funzione.
--
-- ⚠️ RETURNS TABLE: per cambiare in futuro le colonne servirà
-- DROP + CREATE (regola 18). Si può fare senza paura: la usa solo
-- CustomerDetail.
--
-- Si esegue UN PASSO ALLA VOLTA, in ordine. Tutto ripetibile.
-- ============================================================


-- ------------------------------------------------------------
-- PASSO 0a — sola lettura: le colonne che la funzione usa e che
-- S1 NON ha letto (tabelle hic_camere, gift_card, eventi_tipologie,
-- customers).
-- PREVISIONE: 9 righe —
--   customers        first_name text, id uuid, last_name text
--   eventi_tipologie nome text
--   gift_card        codice text, prenotazione_id uuid
--   hic_camere       escludi_dai_totali boolean, nome_hic text, unita text
-- Se ne manca una FERMARSI e mandarmi il risultato.
-- ------------------------------------------------------------
select c.relname as tabella,
       a.attname as colonna,
       format_type(a.atttypid, a.atttypmod) as tipo
from pg_attribute a
join pg_class c on c.oid = a.attrelid
where c.relnamespace = 'public'::regnamespace
  and a.attnum > 0 and not a.attisdropped
  and (c.relname, a.attname) in (
        ('customers', 'id'), ('customers', 'first_name'), ('customers', 'last_name'),
        ('eventi_tipologie', 'nome'),
        ('gift_card', 'codice'), ('gift_card', 'prenotazione_id'),
        ('hic_camere', 'unita'), ('hic_camere', 'nome_hic'), ('hic_camere', 'escludi_dai_totali'))
order by 1, 2;


-- ------------------------------------------------------------
-- PASSO 0b — sola lettura: la regola di chi conta come presente
-- esiste con la firma attesa, e la funzione nuova non esiste ancora.
-- PREVISIONE: 1 riga —
--   hic_perimetro_ok | p_stato text, p_block boolean,
--                      p_virtuale boolean, p_perimetro text
-- (se è la seconda esecuzione, una riga in più: cliente_storico)
-- ------------------------------------------------------------
select p.proname as funzione,
       pg_get_function_identity_arguments(p.oid) as argomenti
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('hic_perimetro_ok', 'cliente_storico')
order by 1;


-- ------------------------------------------------------------
-- PASSO 1 — la funzione.
-- Copiare da "create or replace" fino a "$storico$;" compreso.
-- ------------------------------------------------------------
create or replace function public.cliente_storico(p_cliente uuid)
returns table (
  tipo                 text,     -- 'ristorante' | 'evento' | 'soggiorno'
  data                 date,     -- giorno del pasto / del servizio / di arrivo
  data_fine            date,     -- solo soggiorno: giorno di partenza
  fascia               text,     -- lunch / dinner / both (soggiorno: null)
  stato                text,     -- stato della prenotazione / dell'evento / HiC
  in_grigio            boolean,  -- cancellata, no show, evento annullato
  ruolo                text,     -- ristorante: 'intestatario' | 'collegato'
  intestatario_nome    text,     -- ristorante, se collegato: «Rossi Mario»
  prenotazione_id      uuid,     -- ristorante
  evento_id            uuid,     -- evento
  servizio_id          uuid,     -- evento
  hic_prenotazione_id  bigint,   -- soggiorno
  titolo               text,     -- evento: titolo
  servizio_nome        text,     -- evento: nome del servizio
  tipologia            text,     -- evento: nome della tipologia
  camera               text,     -- ristorante: camera del cliente; soggiorno: camera
  coperti              integer,  -- ristorante: coperti; soggiorno: ospiti
  adulti               integer,
  bambini              integer,
  notti                integer,  -- soggiorno
  gift_card_codice     text,     -- ristorante
  ipotetici_adulti     integer,  -- evento: i numeri per numeroServizio()
  ipotetici_bambini    integer,
  definitivi_adulti    integer,
  definitivi_bambini   integer,
  effettivi_adulti     integer,
  effettivi_bambini    integer,
  ospiti_storici       integer,
  ordine               integer   -- evento: ordine del servizio nella giornata
)
language sql
stable
set search_path to 'public'
as $storico$
  select x.* from (
  with pren as (
    -- l'intestatario vive in due posti: si leggono tutti e due,
    -- union toglie i doppioni (stessa prenotazione, stesso ruolo)
    select r.id
    from reservations r
    where r.customer_id = p_cliente
    union
    select pc.prenotazione_id
    from prenotazione_clienti pc
    where pc.cliente_id = p_cliente
  )
  select
    'ristorante'::text,
    r.reservation_date,
    null::date,
    r.meal_type,
    r.status,
    (r.status in ('cancelled', 'no_show')),
    case when r.customer_id = p_cliente then 'intestatario' else 'collegato' end,
    case when r.customer_id = p_cliente then null
         else nullif(btrim(coalesce(cu.last_name, '') || ' ' || coalesce(cu.first_name, '')), '')
    end,
    r.id,
    null::uuid, null::uuid, null::bigint,
    null::text, null::text, null::text,
    coalesce(nullif(btrim(io.camera), ''),
             case when r.customer_id = p_cliente then nullif(btrim(r.camera), '') end),
    r.guests_count,
    r.adults_count,
    r.children_count,
    null::integer,
    coalesce(g1.codice, g2.codice),
    null::integer, null::integer, null::integer, null::integer,
    null::integer, null::integer, null::integer, null::integer
  from pren
  join reservations r on r.id = pren.id
  left join customers cu on cu.id = r.customer_id
  left join prenotazione_clienti io
         on io.prenotazione_id = r.id and io.cliente_id = p_cliente
  left join gift_card g1 on g1.id = r.gift_card_id
  left join lateral (
    select g.codice from gift_card g
    where g.prenotazione_id = r.id
    order by g.codice
    limit 1
  ) g2 on true

  union all

  select
    'evento'::text,
    s.data,
    null::date,
    s.fascia,
    e.stato,
    (e.stato = 'annullato'),
    null::text, null::text,
    null::uuid,
    e.id,
    s.id,
    null::bigint,
    e.titolo,
    s.nome,
    t.nome,
    null::text,
    null::integer, null::integer, null::integer, null::integer,
    null::text,
    s.ipotetici_adulti, s.ipotetici_bambini,
    s.definitivi_adulti, s.definitivi_bambini,
    s.effettivi_adulti, s.effettivi_bambini,
    s.ospiti_storici,
    s.ordine
  from eventi e
  join eventi_servizi s on s.evento_id = e.id
  left join eventi_tipologie t on t.id = e.tipologia_id
  where e.cliente_id = p_cliente

  union all

  select
    'soggiorno'::text,
    p.check_in,
    p.check_out,
    null::text,
    p.stato,
    false,
    null::text, null::text,
    null::uuid, null::uuid, null::uuid,
    p.id,
    null::text, null::text, null::text,
    coalesce(c.unita, c.nome_hic),
    p.n_ospiti,
    p.adulti,
    p.bambini,
    coalesce(p.notti, (p.check_out - p.check_in))::integer,
    null::text,
    null::integer, null::integer, null::integer, null::integer,
    null::integer, null::integer, null::integer,
    null::integer
  from hic_clienti_legame l
  join hic_prenotazioni p on p.customer_id = l.hic_customer_id
  join hic_camere c
    on c.accommodation_id = p.accommodation_id
   and not coalesce(c.escludi_dai_totali, false)
  where l.customer_id = p_cliente
    and p.check_in is not null
    and p.check_out is not null
    and hic_perimetro_ok(p.stato, p.block, coalesce(p.escludi_dai_totali, false), 'standard')
  ) x (tipo, data, data_fine, fascia, stato, in_grigio, ruolo,
         intestatario_nome, prenotazione_id, evento_id, servizio_id,
         hic_prenotazione_id, titolo, servizio_nome, tipologia, camera,
         coperti, adulti, bambini, notti, gift_card_codice,
         ipotetici_adulti, ipotetici_bambini, definitivi_adulti,
         definitivi_bambini, effettivi_adulti, effettivi_bambini,
         ospiti_storici, ordine)
  -- dal più recente; nello stesso giorno: cena, giornata intera,
  -- pranzo, soggiorno; i servizi di un evento dall'ultimo al primo.
  -- La pagina rimette in ordine crescente le visite in programma.
  order by x.data desc,
           case x.fascia when 'dinner' then 1 when 'both' then 2 when 'lunch' then 3 else 4 end,
           x.ordine desc nulls last
$storico$;


-- ------------------------------------------------------------
-- PASSO 2 — chi può chiamarla: solo chi ha fatto il login.
-- ------------------------------------------------------------
revoke all on function public.cliente_storico(uuid) from public, anon;


-- ------------------------------------------------------------
-- PASSO 3
-- ------------------------------------------------------------
grant execute on function public.cliente_storico(uuid) to authenticated;


-- ------------------------------------------------------------
-- PASSO 4
-- ------------------------------------------------------------
notify pgrst, 'reload schema';


-- ============================================================
-- VERIFICHE — sola lettura. Nel SQL Editor si è «postgres», che
-- vede tutto: le righe 'evento' qui escono anche se nell'app un
-- utente senza permesso Eventi non le vedrà (è giusto così).
-- ============================================================

-- ------------------------------------------------------------
-- V1 — la funzione c'è, NON è security definer, la chiamano solo
-- authenticated (più postgres e service_role, che sono dei padroni).
-- PREVISIONE: 1 riga — security_definer = false,
-- chi_puo = authenticated, postgres, service_role (in qualche
-- ordine). Se compare anon o PUBLIC FERMARSI.
-- ------------------------------------------------------------
select p.proname as funzione,
       p.prosecdef as security_definer,
       (select string_agg(distinct r.grantee, ', ')
        from information_schema.routine_privileges r
        where r.specific_schema = 'public'
          and r.specific_name = p.proname || '_' || p.oid) as chi_puo
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname = 'cliente_storico';


-- ------------------------------------------------------------
-- V2 — le 10 schede più lunghe di S5, contate dalla funzione.
-- PREVISIONE:
--   ristorante = la colonna «pren» di S5, uguale per tutte e 10
--   evento     = 0 per tutte (S5: 0 servizi evento nelle 10)
--   soggiorno  = MINORE O UGUALE a «sogg.» di S5: S5 toglieva solo i
--                blocchi, qui escono anche annullate e preventivi.
--                Pietralunga: meno di 37.
--   Se un nome esce su DUE righe sono due schede omonime: va bene,
--   S5 le contava separate.
-- Costo: 10 chiamate, ciascuna su indici — trascurabile.
-- ------------------------------------------------------------
select btrim(c.last_name || ' ' || c.first_name) as cliente,
       c.id as scheda,
       count(*) filter (where s.tipo = 'ristorante') as ristorante,
       count(*) filter (where s.tipo = 'evento')     as evento,
       count(*) filter (where s.tipo = 'soggiorno')  as soggiorno,
       count(*) filter (where s.in_grigio)           as in_grigio
from customers c
cross join lateral public.cliente_storico(c.id) s
where (c.last_name, c.first_name) in (
  ('Pietralunga', 'Fausto'), ('BONAFIGLIA', 'ALESSANDRO'), ('Iannaccone', 'Florestano'),
  ('Pusceddu', 'Simone'), ('Danila', 'Pascarella'), ('Procida', 'Clelia'),
  ('Contini', 'Riccardo'), ('Del Vecchio', 'Carlo'), ('Albanese', 'Andrea'),
  ('Caserta', 'Alessia'))
group by c.id, 1
order by 1, 2;


-- ------------------------------------------------------------
-- V3 — tutte le schede: il totale delle righe 'ristorante' e
-- 'evento' deve coincidere con S5, che le contava con una lettura
-- scritta a parte.
-- PREVISIONE: ristorante = 793, evento = 5,
--             soggiorno ≤ 94 (vedi V2).
-- Costo: una chiamata per scheda (~840), ciascuna su indici:
-- circa un secondo. Nessuna scrittura.
-- ------------------------------------------------------------
select count(*) filter (where s.tipo = 'ristorante') as ristorante,
       count(*) filter (where s.tipo = 'evento')     as evento,
       count(*) filter (where s.tipo = 'soggiorno')  as soggiorno
from customers c
cross join lateral public.cliente_storico(c.id) s;
