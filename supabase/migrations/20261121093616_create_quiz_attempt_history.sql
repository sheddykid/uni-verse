create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  resource_id uuid references public.course_resources(id) on delete set null,
  course_code text not null,
  course_title text not null,
  source_title text not null,
  mode text not null check (mode in ('mcq','theory')),
  score integer not null check (score >= 0),
  total integer not null check (total > 0 and score <= total),
  percentage integer not null check (percentage between 0 and 100),
  review jsonb not null default '[]'::jsonb check (jsonb_typeof(review) = 'array'),
  completed_at timestamptz not null default now()
);

create index if not exists quiz_attempts_user_completed_idx
  on public.quiz_attempts (user_id, completed_at desc);

alter table public.quiz_attempts enable row level security;

create policy "Students can view their own quiz history"
  on public.quiz_attempts for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.quiz_attempts from anon, authenticated;
grant select on table public.quiz_attempts to authenticated;
grant all on table public.quiz_attempts to service_role;
