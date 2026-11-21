drop policy if exists "Students create their own note summary history" on public.note_summary_history;
create policy "Students create their own note summary history"
  on public.note_summary_history for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      join public.course_resources r on r.id = note_summary_history.resource_id
      join public.courses c on c.id = r.course_id
      join public.course_departments cd on cd.course_id = c.id
      where p.id = (select auth.uid())
        and r.course_id = note_summary_history.course_id
        and r.resource_type = 'note'
        and r.is_active = true
        and c.is_active = true
        and (p.role = 'admin' or p.department_id = cd.department_id)
    )
  );
