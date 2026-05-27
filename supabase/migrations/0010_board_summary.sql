-- Per-board summary stats from the BOARDS DATA tab on the revenue tracker.
-- Captures the operator-curated month-to-date figures (running sales, goal,
-- ratio, MoM%) so the revenue dashboard can display them directly.

create table if not exists public.board_summary (
  id uuid primary key default gen_random_uuid(),
  board_name text not null unique,         -- "BOARD 1", "BOARD 2", "BOARD 3", "TRAINING BOARD", "TOWER", "TOTALS"
  running_sales numeric,
  projection numeric,
  goal numeric,
  active_count int,
  up_count int,
  down_count int,
  ratio numeric,
  subs_pct numeric,                        -- e.g. 0.2767 for 27.67%
  mom_pct numeric,                         -- May/Apr% delta
  pct_to_goal numeric,                     -- 0.699 for 69.90%
  sub_revenue numeric,
  last_synced_at timestamptz not null default now()
);

alter table public.board_summary enable row level security;
