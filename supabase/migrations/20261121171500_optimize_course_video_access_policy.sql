drop policy if exists "Admins read all course videos" on public.course_videos;
drop policy if exists "Students read videos for their department" on public.course_videos;

create policy "Users read permitted course videos"
on public.course_videos for select to authenticated
using (
  (select private.is_admin())
  or (
    is_active = true
    and exists (
      select 1 from public.courses c
      join public.course_departments cd on cd.course_id = c.id
      join public.profiles p on p.department_id = cd.department_id
      where c.id = course_videos.course_id
        and c.is_active = true
        and p.id = (select auth.uid())
    )
  )
);

create index if not exists course_videos_uploaded_by_idx
  on public.course_videos (uploaded_by);
