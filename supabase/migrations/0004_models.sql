-- Model onboarding board. Lives on a separate Monday board from the chatter
-- pipeline (chat-stars.monday.com/boards/8307745433).
--
-- Each row is a page/model we onboard, not a chatter. Capacity math: every
-- $40k of revenue = 1 team of 4 chatters for 24h coverage. Sub-$40k pages
-- are paired and excluded from capacity calcs.

create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  monday_item_id text not null unique,
  monday_board_id text not null,
  name text not null,
  agency text,
  page_type text,
  revenue numeric,
  start_date date,
  board text,            -- BOARD 1 / BOARD 2 / BOARD 3
  ae text,               -- assigned AE
  status text,           -- PENDING / ACTIVE / etc.
  telegram_group text,
  marketing text,
  group_title text,
  monday_created_at timestamptz,
  monday_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  raw_data jsonb
);

create index if not exists models_status_idx on public.models(status);
create index if not exists models_start_date_idx on public.models(start_date);
create index if not exists models_board_idx on public.models(board);

alter table public.models enable row level security;
-- No policies → service-role only (server-side reads via admin client).
