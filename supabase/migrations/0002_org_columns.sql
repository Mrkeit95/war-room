-- Add columns for standby SLA tracking + page/board assignment
-- - page_assignment: which Monday page the chatter is on (from Monday "Page Assignment" text column)
-- - board_assignment: which operational BOARD they belong to (Monday "BOARD" status column)
-- - current_stage_entered_at: when they entered their current canonical stage, used for accurate days-in-stage

alter table public.candidates add column if not exists page_assignment text;
alter table public.candidates add column if not exists board_assignment text;
alter table public.candidates add column if not exists current_stage_entered_at timestamptz;

create index if not exists candidates_board_idx on public.candidates(board_assignment);
create index if not exists candidates_stage_entered_idx on public.candidates(current_stage_entered_at desc);
