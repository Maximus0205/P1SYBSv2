-- Kør denne i Supabase → SQL Editor (én gang).
--
-- Design: hver "ting" (sag, bil, montør, varetype) ligger som ÉN RÆKKE med
-- et jsonb data-felt, der indeholder det præcis samme objekt som appen altid
-- har brugt internt (samme felter som i src/data/appData.js). Det betyder
-- vi IKKE skal skrive hele datamodellen om i resten af appen - kun
-- lagerlaget (src/lib/storage.js) skifter fra "én stor JSON-blob" til
-- "én række pr. ting, med adgangsstyring pr. butik".
--
-- butik_id på alt fra start = klar til flere butikker/kæde-platform senere,
-- uden at det kræver en ny omskrivning.

create extension if not exists "pgcrypto";

-- ---------- Butikker (tenants) ----------
create table if not exists butikker (
  id uuid primary key default gen_random_uuid(),
  navn text not null,
  oprettet timestamptz not null default now()
);

-- ---------- Profiler: kobler en Supabase Auth-bruger til butik + rolle ----------
create table if not exists profiler (
  id uuid primary key references auth.users(id) on delete cascade,
  butik_id uuid references butikker(id),
  navn text,
  rolle text not null default 'saelger' check (rolle in ('admin', 'saelger', 'montor', 'lager')),
  montor_id text,
  oprettet timestamptz not null default now()
);

-- Når en ny bruger oprettes i Auth, laves der automatisk en tom profilrække,
-- så en admin bagefter kan sætte butik_id + rolle (se note i README).
create or replace function opret_profil_for_ny_bruger()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into profiler (id, navn) values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function opret_profil_for_ny_bruger();

-- Hjælpefunktion RLS-policies kan bruge til at slå den indloggede brugers
-- butik_id op, uden at det giver uendelig rekursion i policyen selv.
create or replace function min_butik_id()
returns uuid
language sql stable security definer
as $$
  select butik_id from profiler where id = auth.uid()
$$;

-- ---------- De fire datatabeller ----------
create table if not exists sager (
  id text primary key,
  butik_id uuid not null references butikker(id),
  data jsonb not null,
  opdateret timestamptz not null default now()
);

create table if not exists biler (
  id text primary key,
  butik_id uuid not null references butikker(id),
  data jsonb not null,
  opdateret timestamptz not null default now()
);

create table if not exists montorer (
  id text primary key,
  butik_id uuid not null references butikker(id),
  data jsonb not null,
  opdateret timestamptz not null default now()
);

create table if not exists varetyper (
  id text primary key,
  butik_id uuid not null references butikker(id),
  data jsonb not null,
  opdateret timestamptz not null default now()
);

-- ---------- Row Level Security: kan kun se/ændre egen butiks data ----------
alter table profiler enable row level security;
alter table sager enable row level security;
alter table biler enable row level security;
alter table montorer enable row level security;
alter table varetyper enable row level security;

create policy "se egen profil" on profiler for select using (id = auth.uid());
create policy "opdater egen profil" on profiler for update using (id = auth.uid());

create policy "egen butiks sager" on sager for all
  using (butik_id = min_butik_id()) with check (butik_id = min_butik_id());
create policy "egen butiks biler" on biler for all
  using (butik_id = min_butik_id()) with check (butik_id = min_butik_id());
create policy "egen butiks montorer" on montorer for all
  using (butik_id = min_butik_id()) with check (butik_id = min_butik_id());
create policy "egen butiks varetyper" on varetyper for all
  using (butik_id = min_butik_id()) with check (butik_id = min_butik_id());

-- ---------- Opsætning efter kørsel (gøres manuelt, kun første gang) ----------
-- 1. Opret jeres butik:
--      insert into butikker (navn) values ('Jeres butiksnavn') returning id;
-- 2. Opret jer selv som brugere via appens login-side (se LoginSide.jsx) -
--    det opretter automatisk en tom profilrække via triggeren ovenfor.
-- 3. Sæt butik_id og rolle på hver profil (kør for hver bruger, med id fra
--    trin 1 og brugerens e-mail):
--      update profiler set butik_id = '<id fra trin 1>', rolle = 'admin'
--      where id = (select id from auth.users where email = 'din@mail.dk');
