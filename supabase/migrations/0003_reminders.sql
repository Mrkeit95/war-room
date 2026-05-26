-- Move reminders from browser localStorage to Supabase so they persist across
-- Vercel deploys + work cross-device. Single-operator app, no user_id needed yet.

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  due_date date,
  recurrence text
);

create index if not exists reminders_done_idx on public.reminders(done);
create index if not exists reminders_due_idx on public.reminders(due_date);
create index if not exists reminders_created_idx on public.reminders(created_at desc);

alter table public.reminders enable row level security;
-- No policies → only the service role (server) can read/write. Browser hits go through /api/reminders.
