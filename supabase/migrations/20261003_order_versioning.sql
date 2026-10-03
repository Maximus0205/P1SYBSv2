-- VERSIONERING AF SAGER (optimistisk låsning) - 3. oktober 2026
--
-- PROBLEM 1: to personer der rettede samme sag, overskrev hinanden uden
-- advarsel (hele sagen gemmes som ét objekt; sidste skrivning vandt).
-- LØSNING: hver sag får et versionsnummer. save_order() gemmer kun, hvis
-- kalderen byggede på den NUVÆRENDE version - ellers afvises skrivningen og
-- den nyeste udgave returneres, så appen kan flette eller spørge brugeren.
--
-- PROBLEM 2 (fundet under arbejdet): appen gemmer med INSERT ... ON CONFLICT
-- DO UPDATE. Postgres afvikler BEFORE INSERT-triggere på den foreslåede
-- række FØR konflikten opdages - så assign_order_number() trak et NYT
-- sagsnummer og overskrev data.nr ved HVER gem-handling af en eksisterende
-- sag. Resultat: sagsnummeret vist i appen afveg fra order_number og talte
-- op ved hver rettelse. Rettes her, og eksisterende data repareres.
--
-- Additiv og bagudkompatibel: den nuværende app virker uændret, indtil den
-- nye udgave er udrullet. (En senere migration kan lukke for direkte
-- skrivninger uden om save_order.)

alter table public.orders add column if not exists version integer not null default 0;

-- Hvert opdaterende kald tæller versionen op. Kan ikke omgås af klienten.
create or replace function public.orders_bump_version()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  NEW.version := coalesce(OLD.version, 0) + 1;
  return NEW;
end;
$$;

drop trigger if exists orders_bump_version on public.orders;
create trigger orders_bump_version
  before update on public.orders
  for each row execute function public.orders_bump_version();

-- Rettelse af sagsnummer-tildelingen: en række der FINDES allerede får
-- IKKE trukket et nyt nummer, og beholder sit eget.
create or replace function public.assign_order_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_number integer;
  v_year text := to_char(now(), 'YY');
  v_existing text;
begin
  if NEW.order_number is null then
    select o.order_number into v_existing
      from public.orders o
     where o.store_id = NEW.store_id and o.id = NEW.id;

    if v_existing is not null then
      NEW.order_number := v_existing;
      NEW.data := jsonb_set(coalesce(NEW.data, '{}'::jsonb), '{nr}', to_jsonb(v_existing));
      return NEW;
    end if;

    update stores set next_order_number = next_order_number + 1
      where id = NEW.store_id
      returning next_order_number into v_number;

    NEW.order_number := v_year || '-' || v_number;
    NEW.data := jsonb_set(coalesce(NEW.data, '{}'::jsonb), '{nr}', to_jsonb(NEW.order_number));
  end if;
  return NEW;
end;
$$;

-- Reparation: order_number blev tildelt ved oprettelsen og er det rigtige
-- nummer; data.nr er driftet væk ved senere gem-handlinger.
update public.orders
   set data = jsonb_set(data, '{nr}', to_jsonb(order_number))
 where order_number is not null
   and data->>'nr' is distinct from order_number;

-- Gem én sag med versionskontrol. SECURITY INVOKER: række-sikkerheden (RLS)
-- og rettighedstriggerne gælder præcis som ved direkte tabeladgang.
--
-- p_expected_version = NULL  -> opret ny sag (afvises som 'exists', hvis id findes)
-- p_expected_version = N     -> opdatér kun hvis sagen STADIG er på version N
--
-- Svar (jsonb):
--   {status:'ok', version, data?}      data medfølger ved oprettelse (får sagsnummeret)
--   {status:'conflict', version, data} nogen nåede først; data = nyeste udgave
--   {status:'exists', version}         oprettelse, men id findes allerede
--   {status:'not_found'}               sagen findes ikke (slettet, eller ingen adgang)
create or replace function public.save_order(
  p_store_id uuid,
  p_id text,
  p_data jsonb,
  p_expected_version integer
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_version integer;
  v_data jsonb;
begin
  if p_store_id is null or p_id is null or p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Ugyldige data';
  end if;
  if octet_length(p_data::text) > 8000000 then
    raise exception 'Sagen er for stor til at blive gemt';
  end if;

  if p_expected_version is null then
    insert into public.orders (id, store_id, data, updated_at)
    values (p_id, p_store_id, p_data, now())
    on conflict (id, store_id) do nothing
    returning version, data into v_version, v_data;

    if found then
      return jsonb_build_object('status', 'ok', 'version', v_version, 'data', v_data);
    end if;

    select o.version into v_version from public.orders o where o.store_id = p_store_id and o.id = p_id;
    return jsonb_build_object('status', 'exists', 'version', v_version);
  end if;

  update public.orders o
     set data = case when o.order_number is null then p_data
                     else jsonb_set(p_data, '{nr}', to_jsonb(o.order_number)) end,
         updated_at = now()
   where o.store_id = p_store_id and o.id = p_id and o.version = p_expected_version
  returning o.version into v_version;

  if found then
    return jsonb_build_object('status', 'ok', 'version', v_version);
  end if;

  select o.version, o.data into v_version, v_data
    from public.orders o where o.store_id = p_store_id and o.id = p_id;
  if found then
    return jsonb_build_object('status', 'conflict', 'version', v_version, 'data', v_data);
  end if;

  return jsonb_build_object('status', 'not_found');
end;
$$;

revoke all on function public.save_order(uuid, text, jsonb, integer) from public, anon;
grant execute on function public.save_order(uuid, text, jsonb, integer) to authenticated;
