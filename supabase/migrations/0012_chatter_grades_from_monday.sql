-- Chatter grading subitems synced from Monday. Each row mirrors one grading
-- subitem on a chatter's region board. Multiple rows per chatter over time
-- (one per grading event).

drop table if exists public.chatter_grades cascade;

create table public.chatter_grades (
  id uuid primary key default gen_random_uuid(),
  monday_item_id text not null unique,                        -- the subitem's Monday id
  monday_parent_item_id text not null,                        -- the chatter's main-row Monday id
  candidate_id uuid references public.candidates(id) on delete set null,
  region text not null check (region in ('PH','EU','SA','UK')),
  subitem_name text,
  grader text,

  -- The 9 rating columns (1-5, nullable for partial grading)
  ppv_captions smallint check (ppv_captions is null or ppv_captions between 0 and 5),
  sexting_message_quality smallint check (sexting_message_quality is null or sexting_message_quality between 0 and 5),
  hooks_opening_lines smallint check (hooks_opening_lines is null or hooks_opening_lines between 0 and 5),
  reply_time smallint check (reply_time is null or reply_time between 0 and 5),
  golden_ratio smallint check (golden_ratio is null or golden_ratio between 0 and 5),
  persona_match smallint check (persona_match is null or persona_match between 0 and 5),
  whale_handling smallint check (whale_handling is null or whale_handling between 0 and 5),
  english_skills smallint check (english_skills is null or english_skills between 0 and 5),
  reliability smallint check (reliability is null or reliability between 0 and 5),

  sales_generated_dollars numeric,                             -- per-event $ amount

  monday_created_at timestamptz,
  monday_updated_at timestamptz,
  last_synced_at timestamptz not null default now()
);

create index if not exists chatter_grades_parent_idx on public.chatter_grades(monday_parent_item_id);
create index if not exists chatter_grades_candidate_idx on public.chatter_grades(candidate_id);
create index if not exists chatter_grades_updated_idx on public.chatter_grades(monday_updated_at desc nulls last);

alter table public.chatter_grades enable row level security;
