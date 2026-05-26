-- Authoritative pod/team → board mapping. Each AE has their own Monday board
-- (BOARD 1/2/3/TRAINING BOARD) and the groups on those boards are named
-- "POD A TEAM 1" etc. — that's where the truth lives, not in candidate
-- board_assignment which can drift.

create table if not exists public.board_groups (
  id uuid primary key default gen_random_uuid(),
  monday_board_id text not null,
  monday_group_id text not null,
  board_name text not null,         -- "BOARD 1", "BOARD 2", "BOARD 3", "TRAINING BOARD"
  group_title text not null,         -- raw, e.g. "POD A TEAM 1"
  pod text,                          -- parsed: "A"
  team text,                         -- normalised to T# form: "T1"
  last_synced_at timestamptz not null default now(),
  unique (monday_board_id, monday_group_id)
);

create index if not exists board_groups_board_idx on public.board_groups(board_name);
create index if not exists board_groups_lookup_idx on public.board_groups(pod, team);

alter table public.board_groups enable row level security;
-- No policies → service-role only.
