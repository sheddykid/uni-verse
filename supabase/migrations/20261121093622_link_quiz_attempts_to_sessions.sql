alter table public.quiz_attempts
  add column if not exists quiz_session_id uuid unique references public.quiz_sessions(id) on delete set null;
