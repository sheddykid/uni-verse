-- Replace manual ID-card approval with Supabase email confirmation as the
-- student account activation gate. Preserve authentication, ownership, active
-- course, and department-level access checks.

-- Flashcard question bank
drop policy if exists "Verified students and admins can read accessible flashcards" on public.flashcard_question_bank;
drop policy if exists "Verified students and admins can save accessible flashcards" on public.flashcard_question_bank;
drop policy if exists "Verified students and admins can update accessible flashcards" on public.flashcard_question_bank;

create policy "Confirmed students and admins can read accessible flashcards"
on public.flashcard_question_bank for select to authenticated
using (exists (
  select 1 from public.courses c
  join public.course_departments cd on cd.course_id = c.id
  join public.profiles p on p.id = auth.uid()
  where c.id = flashcard_question_bank.course_id and c.is_active = true
    and (p.role = 'admin' or p.department_id = cd.department_id)
));

create policy "Confirmed students and admins can save accessible flashcards"
on public.flashcard_question_bank for insert to authenticated
with check (created_by = auth.uid() and exists (
  select 1 from public.courses c
  join public.course_departments cd on cd.course_id = c.id
  join public.profiles p on p.id = auth.uid()
  where c.id = flashcard_question_bank.course_id and c.is_active = true
    and (p.role = 'admin' or p.department_id = cd.department_id)
));

create policy "Confirmed students and admins can update accessible flashcards"
on public.flashcard_question_bank for update to authenticated
using (exists (
  select 1 from public.courses c
  join public.course_departments cd on cd.course_id = c.id
  join public.profiles p on p.id = auth.uid()
  where c.id = flashcard_question_bank.course_id and c.is_active = true
    and (p.role = 'admin' or p.department_id = cd.department_id)
))
with check (exists (
  select 1 from public.courses c
  join public.course_departments cd on cd.course_id = c.id
  join public.profiles p on p.id = auth.uid()
  where c.id = flashcard_question_bank.course_id and c.is_active = true
    and (p.role = 'admin' or p.department_id = cd.department_id)
));

-- Course video metadata and video-link visibility
drop policy if exists "Users read permitted course video links" on public.course_video_links;
create policy "Users read permitted course video links"
on public.course_video_links for select to authenticated
using (
  (select private.is_admin())
  or (is_active = true and exists (
    select 1 from public.courses c
    join public.course_departments cd on cd.course_id = c.id
    join public.profiles p on p.id = (select auth.uid())
    where c.id = course_video_links.course_id and c.is_active = true
      and p.department_id = cd.department_id
  ))
);

drop policy if exists "Users read permitted course videos" on public.course_videos;
create policy "Users read permitted course videos"
on public.course_videos for select to authenticated
using (
  (select private.is_admin())
  or (is_active = true and exists (
    select 1 from public.courses c
    join public.course_departments cd on cd.course_id = c.id
    join public.profiles p on p.id = (select auth.uid())
    where c.id = course_videos.course_id and c.is_active = true
      and p.department_id = cd.department_id
  ))
);

-- Note-summary history: retain per-user ownership and department/course checks.
drop policy if exists "Students read their own note summary history" on public.note_summary_history;
create policy "Students read their own note summary history"
on public.note_summary_history for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Students create their own note summary history" on public.note_summary_history;
create policy "Students create their own note summary history"
on public.note_summary_history for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    join public.course_resources r on r.id = note_summary_history.resource_id
    join public.courses c on c.id = r.course_id
    join public.course_departments cd on cd.course_id = c.id
    where p.id = (select auth.uid())
      and r.course_id = note_summary_history.course_id
      and r.resource_type = 'note' and r.is_active = true and c.is_active = true
      and (p.role = 'admin' or p.department_id = cd.department_id)
  )
);

drop policy if exists "Students complete their own note summary history" on public.note_summary_history;
create policy "Students complete their own note summary history"
on public.note_summary_history for update to authenticated
using (user_id = (select auth.uid()) and status = 'generating')
with check (user_id = (select auth.uid()) and status in ('generating', 'ready'));

drop policy if exists "Students cancel their own pending note summary history" on public.note_summary_history;
create policy "Students cancel their own pending note summary history"
on public.note_summary_history for delete to authenticated
using (user_id = (select auth.uid()) and status = 'generating');

-- Private video and generated-summary storage stays scoped to a student's
-- department or their own folder respectively.
drop policy if exists "Students read permitted course video files" on storage.objects;
create policy "Students read permitted course video files"
on storage.objects for select to authenticated
using (
  bucket_id = 'course-videos'
  and (
    (select private.is_admin())
    or exists (
      select 1 from public.course_videos v
      join public.courses c on c.id = v.course_id
      join public.course_departments cd on cd.course_id = c.id
      join public.profiles p on p.id = (select auth.uid())
      where v.video_path = objects.name and v.is_active = true and c.is_active = true
        and p.department_id = cd.department_id
    )
  )
);

drop policy if exists "Students read their own summary PDFs" on storage.objects;
create policy "Students read their own summary PDFs"
on storage.objects for select to authenticated
using (
  bucket_id = 'summary-pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Disable new ID-card submissions. Existing request records and stored files
-- are not deleted by this migration.
drop policy if exists "Students submit own verification requests" on public.verification_requests;
drop policy if exists "Students upload own verification images" on storage.objects;
