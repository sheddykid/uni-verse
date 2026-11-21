create table if not exists public.note_summary_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id uuid not null references public.course_resources(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  course_code text not null,
  course_title text not null,
  source_title text not null,
  pdf_path text,
  status text not null default 'generating' check (status in ('generating','ready')),
  created_at timestamptz not null default now(),
  unique (user_id, resource_id),
  unique (pdf_path)
);
create index if not exists note_summary_history_user_created_idx
  on public.note_summary_history(user_id, created_at desc);
alter table public.note_summary_history enable row level security;
create policy "Students read their own note summary history"
  on public.note_summary_history for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Students create their own note summary history"
  on public.note_summary_history for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Students update their own note summary history"
  on public.note_summary_history for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Students delete their own note summary history"
  on public.note_summary_history for delete to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.note_summary_history from anon;
grant select, insert, update, delete on table public.note_summary_history to authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('summary-pdfs', 'summary-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];
create policy "Students upload their own summary PDFs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'summary-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Students read their own summary PDFs"
  on storage.objects for select to authenticated
  using (bucket_id = 'summary-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Students delete their own summary PDFs"
  on storage.objects for delete to authenticated
  using (bucket_id = 'summary-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
