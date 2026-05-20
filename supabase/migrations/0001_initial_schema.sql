-- War Room initial schema
-- One row per Monday item across all 4 boards, plus tables for change tracking.

create extension if not exists "pgcrypto";

-- Each candidate, one row per person across all 4 boards
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  monday_item_id text unique not null,
  monday_board_id text not null,
  region text not null check (region in ('PH', 'EU', 'SA', 'UK')),
  name text not null,
  current_stage text not null,        -- normalized stage key (e.g. 'training')
  current_group_title text,           -- original Monday group title (for debugging / sub-stage display)
  current_status text,                -- value of Monday "Status" column
  tier text,                          -- value of Monday "Tier" column (level, not formal grade)
  track text check (track is null or track in ('exp', 'non_exp')),
  assigned_manager text,
  telegram text,
  phone text,
  email text,
  country text,
  source text,
  picture_url text,
  monday_created_at timestamptz,
  monday_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  raw_data jsonb                       -- full Monday item snapshot for debugging
);

create index if not exists candidates_region_idx on public.candidates(region);
create index if not exists candidates_stage_idx on public.candidates(current_stage);
create index if not exists candidates_manager_idx on public.candidates(assigned_manager);
create index if not exists candidates_last_synced_idx on public.candidates(last_synced_at);

-- Every stage change, for computing velocities + history
create table if not exists public.stage_transitions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  detected_at timestamptz not null default now()
);

create index if not exists stage_transitions_candidate_idx on public.stage_transitions(candidate_id);
create index if not exists stage_transitions_detected_idx on public.stage_transitions(detected_at desc);

-- Daily snapshots for trend analysis
create table if not exists public.pipeline_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  region text not null,
  stage text not null,
  candidate_count int not null,
  created_at timestamptz not null default now(),
  unique (snapshot_date, region, stage)
);

create index if not exists pipeline_snapshots_date_idx on public.pipeline_snapshots(snapshot_date desc);

-- Sync runs (operational visibility)
create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'failed')),
  candidates_synced int,
  transitions_recorded int,
  error_message text,
  triggered_by text                    -- 'cron' | 'manual' | 'api'
);

create index if not exists sync_runs_started_idx on public.sync_runs(started_at desc);

-- Reminders mirror (for cross-device sync later; currently localStorage in browser)
-- Not used yet; placeholder for when we add auth.

-- Row-Level Security: lock everything down by default; we'll access via service role.
alter table public.candidates enable row level security;
alter table public.stage_transitions enable row level security;
alter table public.pipeline_snapshots enable row level security;
alter table public.sync_runs enable row level security;

-- No policies yet → service_role key bypasses RLS, anon/authenticated get nothing.
-- Add policies when we add user-facing auth.
