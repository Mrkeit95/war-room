-- Chatter schedule board (chat-stars/18402773333). Each Monday group represents
-- a page (e.g. "POD C - T8 CHINKERBELL"); each item inside is a shift slot
-- (MORNING/DAY/NIGHT/FILLER) with a chatter assigned. Used to compute how many
-- chatters are *already* on a page so onboarding deficits are accurate (the
-- standby pool isn't the only supply — chatters can also be pulled from other
-- pages).

create table if not exists public.page_assignments (
  id uuid primary key default gen_random_uuid(),
  monday_item_id text not null unique,
  monday_board_id text not null,
  group_title text,           -- e.g. "POD C - T8 CHINKERBELL"
  pod text,                   -- parsed from group_title, e.g. "C"
  team text,                  -- parsed from group_title, e.g. "T8"
  page_name text,             -- parsed from group_title, e.g. "CHINKERBELL"
  shift_name text,            -- from item.name, e.g. "MORNING SHIFT"
  chatter_name text,          -- from "Chatter" column
  monday_created_at timestamptz,
  monday_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  raw_data jsonb
);

create index if not exists page_assignments_page_name_idx on public.page_assignments(page_name);
create index if not exists page_assignments_group_title_idx on public.page_assignments(group_title);

alter table public.page_assignments enable row level security;
-- No policies → service-role only.
