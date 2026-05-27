-- Authoritative page → board mapping pulled from the Stellar OPS revenue
-- tracker (Google Sheet). Each row = one page (model). The board column on
-- that sheet is the source of truth for which AE board a page belongs to —
-- more up-to-date than the per-AE Monday board layouts we sync separately.

create table if not exists public.page_board_map (
  id uuid primary key default gen_random_uuid(),
  page_name text not null unique,
  board_name text not null,         -- normalised: "BOARD 1", "BOARD 2", "BOARD 3", "TRAINING BOARD", "TOWER"
  agency text,
  active boolean,
  handle text,
  inflow_username text,
  last_synced_at timestamptz not null default now()
);

create index if not exists page_board_map_board_idx on public.page_board_map(board_name);

alter table public.page_board_map enable row level security;
-- service-role only
