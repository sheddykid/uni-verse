drop policy if exists "Students can read flashcards for accessible courses" on public.flashcard_question_bank;
drop policy if exists "Students can save flashcards for accessible courses" on public.flashcard_question_bank;
drop policy if exists "Students can update flashcard usage for accessible courses" on public.flashcard_question_bank;

create policy "Verified students and admins can read accessible flashcards"
on public.flashcard_question_bank
for select
to authenticated
using (
  exists (
    select 1
    from public.courses c
    join public.course_departments cd on cd.course_id = c.id
    join public.profiles p on p.id = auth.uid()
    where c.id = flashcard_question_bank.course_id
      and c.is_active = true
      and (
        p.role = 'admin'
        or (p.is_verified = true and p.department_id = cd.department_id)
      )
  )
);

create policy "Verified students and admins can save accessible flashcards"
on public.flashcard_question_bank
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.courses c
    join public.course_departments cd on cd.course_id = c.id
    join public.profiles p on p.id = auth.uid()
    where c.id = flashcard_question_bank.course_id
      and c.is_active = true
      and (
        p.role = 'admin'
        or (p.is_verified = true and p.department_id = cd.department_id)
      )
  )
);

create policy "Verified students and admins can update accessible flashcards"
on public.flashcard_question_bank
for update
to authenticated
using (
  exists (
    select 1
    from public.courses c
    join public.course_departments cd on cd.course_id = c.id
    join public.profiles p on p.id = auth.uid()
    where c.id = flashcard_question_bank.course_id
      and c.is_active = true
      and (
        p.role = 'admin'
        or (p.is_verified = true and p.department_id = cd.department_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.courses c
    join public.course_departments cd on cd.course_id = c.id
    join public.profiles p on p.id = auth.uid()
    where c.id = flashcard_question_bank.course_id
      and c.is_active = true
      and (
        p.role = 'admin'
        or (p.is_verified = true and p.department_id = cd.department_id)
      )
  )
);