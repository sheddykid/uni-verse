create table if not exists public.student_timetable_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 160),
  event_type text not null default 'lecture' check (event_type in ('lecture','test','exam','study')),
  location text not null default '' check (length(location) <= 160),
  notes text not null default '' check (length(notes) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reminder_minutes smallint not null default 15 check (reminder_minutes in (0,5,10,15,30,60)),
  created_at timestamptz not null default now(),
  constraint student_timetable_events_valid_time check (ends_at > starts_at)
);
create index if not exists student_timetable_events_user_start_idx on public.student_timetable_events (user_id, starts_at);
alter table public.student_timetable_events enable row level security;
drop policy if exists "Students manage their own timetable events" on public.student_timetable_events;
create policy "Students manage their own timetable events" on public.student_timetable_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on table public.student_timetable_events to authenticated;