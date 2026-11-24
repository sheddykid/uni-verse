alter table public.student_timetable_events add column if not exists reminder_sent_at timestamptz;
create table if not exists public.student_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique,
 p256dh text not null,
 auth text not null,
 created_at timestamptz not null default now()
);
create index if not exists student_push_subscriptions_user_id_idx on public.student_push_subscriptions(user_id);
alter table public.student_push_subscriptions enable row level security;
drop policy if exists "Users manage their own push subscriptions" on public.student_push_subscriptions;
create policy "Users manage their own push subscriptions" on public.student_push_subscriptions for all to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.student_push_subscriptions to authenticated;
grant all on public.student_push_subscriptions to service_role;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
