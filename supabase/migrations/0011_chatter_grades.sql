-- Weekly performance grading. Multiple managers can grade the same chatter
-- in the same week (e.g. their section manager + their AE). The composite
-- score for the chatter that week is the average across all graders.

create table if not exists public.chatter_grades (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  week_starting date not null,                  -- Monday of the week being graded
  grader_name text not null,                    -- the manager who entered the grade
  grader_role text,                             -- snapshot of grader's role at the time

  -- 10 categories, 1 = bad, 5 = elite. NULL = grader hasn't filled this field yet
  communication smallint check (communication between 1 and 5),
  english_skills smallint check (english_skills between 1 and 5),
  sales_pitch smallint check (sales_pitch between 1 and 5),
  reliability smallint check (reliability between 1 and 5),
  coachability smallint check (coachability between 1 and 5),
  multitasking smallint check (multitasking between 1 and 5),
  persona_match smallint check (persona_match between 1 and 5),
  internet_setup smallint check (internet_setup between 1 and 5),
  empathy smallint check (empathy between 1 and 5),
  compliance smallint check (compliance between 1 and 5),

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (candidate_id, week_starting, grader_name)
);

create index if not exists chatter_grades_candidate_idx on public.chatter_grades(candidate_id);
create index if not exists chatter_grades_week_idx on public.chatter_grades(week_starting desc);
create index if not exists chatter_grades_grader_idx on public.chatter_grades(grader_name);

alter table public.chatter_grades enable row level security;
