-- Allerede kørt på databasen (migration "capacity_rules_systemadmin_per_user", 9. okt 2026). Gemmes her til repoets historik.
-- Resumé (fuld SQL står i Supabase-migrationshistorikken):
create table if not exists public.user_capacity_rules (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  regler jsonb not null default '{}'::jsonb check (jsonb_typeof(regler) = 'object' and octet_length(regler::text) < 2000),
  updated_at timestamptz not null default now()
);
alter table public.user_capacity_rules enable row level security;
-- læs: egen række eller systemadmin; skriv/slet: kun systemadmin
-- RPC update_capacity_rules(p_store_id, p_regler): kun systemadmin, validerer niveauer fra/raadgivende/krav
-- RPC update_capacity_settings: bevarer de gemte regler uanset hvad klienten sender
-- Ny rettighed: insert into permissions (key,label,category) values ('overstyr_kapacitet','Overrule kapacitetsmotoren (booke trods blokerende regler)','sag');
