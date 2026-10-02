-- ATMOS v4.8 ACCOUNT + CLOUD + DETAILED BEACH REVIEWS
-- Run this once in Supabase SQL Editor. It keeps existing reviews.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
grant select,insert,update on public.profiles to authenticated;
drop policy if exists "Profiles readable" on public.profiles;
drop policy if exists "Users create profile" on public.profiles;
drop policy if exists "Users update profile" on public.profiles;
create policy "Profiles readable" on public.profiles for select to authenticated using (true);
create policy "Users create profile" on public.profiles for insert to authenticated with check (auth.uid()=id);
create policy "Users update profile" on public.profiles for update to authenticated using (auth.uid()=id) with check (auth.uid()=id);

create table if not exists public.saved_places (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 place_id text not null, name text not null, admin text, country_code text, latitude double precision not null, longitude double precision not null,
 kind text not null default 'city', is_airport boolean not null default false, created_at timestamptz not null default now(),
 unique(user_id,place_id)
);
alter table public.saved_places enable row level security;
grant select,insert,delete,update on public.saved_places to authenticated;
drop policy if exists "Users manage saved places" on public.saved_places;
create policy "Users manage saved places" on public.saved_places for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);

alter table public.beach_reviews add column if not exists parking smallint check (parking between 1 and 5);
alter table public.beach_reviews add column if not exists family smallint check (family between 1 and 5);
alter table public.beach_reviews add column if not exists scenery smallint check (scenery between 1 and 5);
alter table public.beach_reviews add column if not exists water_clarity smallint check (water_clarity between 1 and 5);
alter table public.beach_reviews add column if not exists sand_quality smallint check (sand_quality between 1 and 5);
alter table public.beach_reviews add column if not exists bathrooms smallint check (bathrooms between 1 and 5);
alter table public.beach_reviews add column if not exists visit_date date;
alter table public.beach_reviews alter column description type text;

-- New accounts automatically receive a profile row.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1),'Atmos user')) on conflict(id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
