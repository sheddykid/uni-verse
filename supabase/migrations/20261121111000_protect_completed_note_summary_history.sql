drop policy if exists "Students update their own note summary history" on public.note_summary_history;
create policy "Students complete their own note summary history"
  on public.note_summary_history for update to authenticated
  using (user_id = (select auth.uid()) and status = 'generating')
  with check (user_id = (select auth.uid()) and status in ('generating','ready'));
drop policy if exists "Students delete their own note summary history" on public.note_summary_history;
create policy "Students cancel their own pending note summary history"
  on public.note_summary_history for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'generating');
alter table public.note_summary_history
  drop constraint if exists note_summary_history_status_pdf_check;
alter table public.note_summary_history
  add constraint note_summary_history_status_pdf_check
  check ((status = 'generating' and pdf_path is null) or (status = 'ready' and pdf_path is not null));
create or replace function private.prevent_note_summary_history_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.resource_id is distinct from old.resource_id
     or new.course_id is distinct from old.course_id then
    raise exception 'Summary history ownership and source cannot be changed';
  end if;
  if old.status = 'ready' then
    raise exception 'Completed summary history is immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_note_summary_history_identity_change() from public, anon, authenticated;
drop trigger if exists note_summary_history_identity_guard on public.note_summary_history;
create trigger note_summary_history_identity_guard
before update on public.note_summary_history
for each row execute function private.prevent_note_summary_history_identity_change();
