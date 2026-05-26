-- Per-day schedule cells from the chatter schedule board. Each shift row
-- has Monday/Tuesday/.../Sunday columns whose .text is something like
-- "3am-11am EST" or "OFF". Stored as a jsonb { Monday: "...", Tuesday: "..." }
-- so we can show a chatter's actual week on the POD modal.

alter table public.page_assignments
  add column if not exists schedule_by_day jsonb;
