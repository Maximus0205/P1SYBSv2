-- Automatiske kunde-SMS'er (oktober 2026): bekræftelse når en sag bookes, besked når den flyttes,
-- og påmindelse aftenen før og/eller om morgenen på dagen. Alt er SLÅET FRA som standard og styres pr. butik
-- af butikkens admin (admin_butik) under Admin -> SMS.
--
-- Arkitektur: ingen trigger på orders. En Edge Function (sms-automatik) kører hvert 2. minut via pg_cron/pg_net,
-- sammenholder sagerne med tabellen sms_automation_state og sender det, der mangler. Det betyder, at ALLE veje til at
-- gemme en sag (app, import, andre klienter) dækkes, og at en fejl i SMS aldrig kan blokere en booking.
-- Funktionen har ingen brugerlogin: den kaldes med en hemmelighed (vault: sms_cron_secret), som kun databasen og
-- funktionen kan validere via sms_cron_ok(). Hemmeligheden ligger ikke i repoet.

-- ===== DEL A: tabeller, regler og RPC =====

create table if not exists public.store_sms_automation (
  store_id uuid primary key references public.stores(id) on delete cascade,
  bekraeftelse_enabled boolean not null default false,
  aendring_enabled boolean not null default false,
  aften_enabled boolean not null default false,
  morgen_enabled boolean not null default false,
  aften_min integer not null default 1080 check (aften_min between 720 and 1290),
  morgen_min integer not null default 450 check (morgen_min between 360 and 660),
  tpl_bekraeftelse text not null,
  tpl_aendring text not null,
  tpl_aften text not null,
  tpl_morgen text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.store_sms_automation enable row level security;
drop policy if exists store_sms_automation_select on public.store_sms_automation;
create policy store_sms_automation_select on public.store_sms_automation for select to authenticated
  using (store_id = my_store_id() or is_system_admin());
revoke insert, update, delete on public.store_sms_automation from anon, authenticated;

-- Samme regler som src/lib/smsAutomationLogik.js (skabelonFejl). Kun disse pladsholdere, ingen links.
create or replace function public.sms_auto_template_error(t text)
returns text language plpgsql immutable set search_path = public as $$
declare ph text; rest text;
begin
  if t is null then return 'Teksten mangler.'; end if;
  if length(btrim(t)) < 10 then return 'Teksten skal være mindst 10 tegn.'; end if;
  if length(t) > 320 then return 'Teksten må højst være 320 tegn.'; end if;
  if t ~ '[[:cntrl:]]' then return 'Teksten må ikke indeholde linjeskift eller styretegn.'; end if;
  rest := t;
  for ph in select (regexp_matches(t, '\{([^{}]*)\}', 'g'))[1] loop
    if ph not in ('fornavn','dato','tidsrum','butik') then
      return 'Ukendt pladsholder {' || ph || '}.';
    end if;
    rest := replace(rest, '{' || ph || '}', '');
  end loop;
  if rest ~ '[{}]' then return 'Teksten har en tuborg, der ikke hører til en pladsholder.'; end if;
  if t ~* '(https?:|www\.|\.(dk|com|net|org|eu)\y)' then return 'Links er ikke tilladt i en SMS.'; end if;
  return null;
end $$;

create table if not exists public.sms_automation_state (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id text not null,
  kind text not null check (kind in ('bekraeftelse','aendring','paamindelse_aften','paamindelse_morgen')),
  noegle text not null,
  status text not null check (status in ('baseline','sprunget','afventer','sendt','fejl','usikker','afvist')),
  forsoeg integer not null default 0,
  fejl text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, order_id, kind, noegle)
);
create index if not exists sms_automation_state_order_idx on public.sms_automation_state (store_id, order_id);
alter table public.sms_automation_state enable row level security;
revoke all on public.sms_automation_state from anon, authenticated;
-- (ingen policies: kun service_role - Edge Function - læser og skriver)

-- Automatiske SMS har ingen bruger bag sig.
alter table public.sms_log alter column user_id drop not null;
alter table public.sms_log add column if not exists kind text;

create or replace function public.save_sms_automation(
  p_store_id uuid, p_bekraeftelse boolean, p_aendring boolean, p_aften boolean, p_morgen boolean,
  p_aften_min integer, p_morgen_min integer,
  p_tpl_bekraeftelse text, p_tpl_aendring text, p_tpl_aften text, p_tpl_morgen text)
returns void language plpgsql security definer set search_path = public as $$
declare
  target uuid := coalesce(p_store_id, my_store_id());
  fejl text;
  var_boek boolean;
  gammel public.store_sms_automation%rowtype;
begin
  if target is null then raise exception 'Ingen butik angivet'; end if;
  if not coalesce((is_system_admin() or (target = my_store_id() and has_permission('admin_butik'))), false) then
    raise exception 'Du har ikke rettighed til at ændre butikkens automatiske SMS''er';
  end if;
  if p_aften_min is null or p_aften_min not between 720 and 1290 then raise exception 'Aften-påmindelsen skal sendes mellem kl. 12:00 og 21:30'; end if;
  if p_morgen_min is null or p_morgen_min not between 360 and 660 then raise exception 'Morgen-påmindelsen skal sendes mellem kl. 06:00 og 11:00'; end if;
  fejl := sms_auto_template_error(p_tpl_bekraeftelse); if fejl is not null then raise exception 'Bekræftelse: %', fejl; end if;
  fejl := sms_auto_template_error(p_tpl_aendring); if fejl is not null then raise exception 'Ændring: %', fejl; end if;
  fejl := sms_auto_template_error(p_tpl_aften); if fejl is not null then raise exception 'Påmindelse aftenen før: %', fejl; end if;
  fejl := sms_auto_template_error(p_tpl_morgen); if fejl is not null then raise exception 'Påmindelse om morgenen: %', fejl; end if;

  select * into gammel from store_sms_automation where store_id = target;
  -- Når bekræftelse/ændring TÆNDES, må eksisterende bookinger ikke få en "ny booking"-SMS: de noteres som kendt (baseline).
  var_boek := coalesce(p_bekraeftelse, false) or coalesce(p_aendring, false);
  if var_boek and not (found and (gammel.bekraeftelse_enabled or gammel.aendring_enabled)) then
    insert into sms_automation_state (store_id, order_id, kind, noegle, status)
    select o.store_id, o.id, 'bekraeftelse',
           (o.data->>'dato') || '|' || coalesce(nullif(o.data->>'tidsrumId',''), 'heldag'), 'baseline'
    from orders o
    where o.store_id = target and o.deleted_at is null
      and coalesce(o.data->>'status','') <> 'afsluttet'
      and (o.data->>'dato') ~ '^\d{4}-\d{2}-\d{2}$' and (o.data->>'dato') >= to_char(now() at time zone 'Europe/Copenhagen', 'YYYY-MM-DD')
      and not exists (select 1 from sms_automation_state s where s.store_id = o.store_id and s.order_id = o.id and s.kind in ('bekraeftelse','aendring'))
    on conflict do nothing;
  end if;

  insert into store_sms_automation (store_id, bekraeftelse_enabled, aendring_enabled, aften_enabled, morgen_enabled, aften_min, morgen_min,
    tpl_bekraeftelse, tpl_aendring, tpl_aften, tpl_morgen, updated_at, updated_by)
  values (target, coalesce(p_bekraeftelse,false), coalesce(p_aendring,false), coalesce(p_aften,false), coalesce(p_morgen,false), p_aften_min, p_morgen_min,
    btrim(p_tpl_bekraeftelse), btrim(p_tpl_aendring), btrim(p_tpl_aften), btrim(p_tpl_morgen), now(), auth.uid())
  on conflict (store_id) do update set
    bekraeftelse_enabled = excluded.bekraeftelse_enabled, aendring_enabled = excluded.aendring_enabled,
    aften_enabled = excluded.aften_enabled, morgen_enabled = excluded.morgen_enabled,
    aften_min = excluded.aften_min, morgen_min = excluded.morgen_min,
    tpl_bekraeftelse = excluded.tpl_bekraeftelse, tpl_aendring = excluded.tpl_aendring,
    tpl_aften = excluded.tpl_aften, tpl_morgen = excluded.tpl_morgen,
    updated_at = now(), updated_by = auth.uid();
end $$;
revoke all on function public.save_sms_automation(uuid,boolean,boolean,boolean,boolean,integer,integer,text,text,text,text) from public, anon;
grant execute on function public.save_sms_automation(uuid,boolean,boolean,boolean,boolean,integer,integer,text,text,text,text) to authenticated;

-- Hemmelighed til cron-kaldet. Oprettes kun hvis den ikke findes; værdien står kun i vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sms_cron_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'sms_cron_secret', 'Hemmelighed til sms-automatik (pg_cron -> Edge Function)');
  end if;
end $$;

create or replace function public.sms_cron_ok(p text)
returns boolean language sql security definer stable set search_path = public, vault as $$
  select p is not null and length(p) >= 32 and exists (select 1 from vault.decrypted_secrets where name = 'sms_cron_secret' and decrypted_secret = p);
$$;
revoke all on function public.sms_cron_ok(text) from public, anon, authenticated;
grant execute on function public.sms_cron_ok(text) to service_role;

-- ===== DEL B: planlægning (køres EFTER at Edge Function sms-automatik er deployet) =====

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sms-automatik') then perform cron.unschedule('sms-automatik'); end if;
  perform cron.schedule('sms-automatik', '*/2 * * * *', $job$
    select net.http_post(
      url := 'https://pjrgohqvbtwtzyhdyozj.supabase.co/functions/v1/sms-automatik',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sms_cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000);
  $job$);
end $$;
