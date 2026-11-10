-- ============================================================
-- MIGRAZIONE 61 — permesso dedicato «normalizza_prenotazioni»
-- 10 novembre 2026
--
-- La voce di menu' «Normalizza prenotazioni» e il pulsante
-- «Normalizza questa prenotazione» seguivano il permesso di
-- MODIFICA delle prenotazioni: li vedevano anche reception e sala.
-- Da oggi hanno un permesso loro, normalizza_prenotazioni:
-- super_admin = write, tutti gli altri ruoli = none.
--
-- Regola 31: permessi_ruolo e' la SECONDA COPIA di
-- DEFAULT_PERMS_BY_ROLE in AuthContext.jsx. Questa migrazione la
-- allinea alla prima (stesso commit dei JSX).
--
-- Le matrici PERSONALI in user_profiles.permissions NON si toccano:
-- una chiave assente vale 'none', che e' proprio il valore voluto.
--
-- Si esegue UN PASSO ALLA VOLTA, in ordine. Tutto ripetibile.
-- ============================================================


-- ------------------------------------------------------------
-- PASSO 0 — sola lettura: le colonne di permessi_ruolo.
-- PREVISIONE: una colonna di testo col ruolo e UNA SOLA colonna
-- jsonb coi permessi (piu' eventuali date). Se le jsonb sono due o
-- nessuna, FERMARSI: il passo 1 si rifiuterebbe comunque.
-- ------------------------------------------------------------
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'permessi_ruolo'
order by ordinal_position;


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

  -- la colonna del ruolo: quella di testo che contiene 'super_admin'
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
        set %1$I = %1$I || jsonb_build_object(''normalizza_prenotazioni'',
                     case when %2$I = ''super_admin'' then ''write'' else ''none'' end)',
    col_json, col_ruolo);
end
$$;


-- ------------------------------------------------------------
-- PASSO 2 — ricarica lo schema dell'API.
-- ------------------------------------------------------------
notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- V1 — il valore della chiave nuova, ruolo per ruolo.
-- PREVISIONE: 1 riga 'write' (super_admin) e 5 righe 'none'.
-- ------------------------------------------------------------
select j.value ->> 'normalizza_prenotazioni' as normalizza, count(*) as ruoli
from public.permessi_ruolo p,
     jsonb_each(to_jsonb(p)) j
where jsonb_typeof(j.value) = 'object'
group by 1
order by 1;


-- ------------------------------------------------------------
-- V2 — quante chiavi ha ogni ruolo.
-- PREVISIONE: una sola riga, 30 chiavi, 6 ruoli
-- (erano 29: le 29 voci di FEATURES + la nuova).
-- ------------------------------------------------------------
select (select count(*) from jsonb_object_keys(j.value)) as chiavi, count(*) as ruoli
from public.permessi_ruolo p,
     jsonb_each(to_jsonb(p)) j
where jsonb_typeof(j.value) = 'object'
group by 1;
