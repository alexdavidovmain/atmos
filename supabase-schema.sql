-- ATMOS BACKEND RESET + SETUP
-- Paste this whole file into Supabase > SQL Editor and press Run ONCE.
-- This replaces the earlier test tables/policies so they exactly match Atmos.
-- It deletes existing test beach reviews in this project.

create extension if not exists pgcrypto;

drop table if exists public.beach_reviews cascade;
drop table if exists public.beaches cascade;

create table public.beach_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  beach_key text not null,
  beach_name text not null check (char_length(beach_name) between 1 and 120),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  author text not null check (char_length(author) between 1 and 30),
  description text not null check (char_length(description) between 8 and 500),
  overall smallint not null check (overall between 1 and 5),
  cleanliness smallint not null check (cleanliness between 1 and 5),
  water smallint not null check (water between 1 and 5),
  crowds smallint not null check (crowds between 1 and 5),
  safety smallint not null check (safety between 1 and 5),
  amenities smallint not null check (amenities between 1 and 5),
  created_at timestamptz not null default now()
);

create index beach_reviews_beach_key_created_at_idx
  on public.beach_reviews (beach_key, created_at desc);
create index beach_reviews_user_id_idx
  on public.beach_reviews (user_id);

alter table public.beach_reviews enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.beach_reviews to anon, authenticated;
grant insert on public.beach_reviews to authenticated;

create policy "Beach reviews are publicly readable"
  on public.beach_reviews
  for select
  to anon, authenticated
  using (true);

create policy "Users can post their own beach reviews"
  on public.beach_reviews
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
