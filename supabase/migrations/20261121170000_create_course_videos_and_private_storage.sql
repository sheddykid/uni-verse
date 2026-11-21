create table if not exists public.course_videos (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0 and length(title) <= 160),
  description text,
  topic text check (topic is null or length(topic) <= 120),
  video_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('video/mp4','video/webm','video/quicktime')),
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_videos_course_active_created_idx
  on public.course_videos (course_id, is_active, created_at desc);

alter table public.course_videos enable row level security;
grant select, insert, update, delete on public.course_videos to authenticated;

create policy "Admins read all course videos"
on public.course_videos for select to authenticated
using ((select private.is_admin()));

create policy "Students read videos for their department"
on public.course_videos for select to authenticated
using (
  is_active = true
  and exists (
    select 1 from public.courses c
    join public.course_departments cd on cd.course_id = c.id
    join public.profiles p on p.department_id = cd.department_id
    where c.id = course_videos.course_id
      and c.is_active = true
      and p.id = (select auth.uid())
  )
);

create policy "Admins insert course videos"
on public.course_videos for insert to authenticated
with check ((select private.is_admin()));

create policy "Admins update course videos"
on public.course_videos for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Admins delete course videos"
on public.course_videos for delete to authenticated
using ((select private.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-videos', 'course-videos', false, 52428800,
        array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins read course video files"
on storage.objects for select to authenticated
using (bucket_id = 'course-videos' and (select private.is_admin()));

create policy "Students read permitted course video files"
on storage.objects for select to authenticated
using (
  bucket_id = 'course-videos'
  and exists (
    select 1
    from public.course_videos v
    join public.courses c on c.id = v.course_id
    join public.course_departments cd on cd.course_id = c.id
    join public.profiles p on p.department_id = cd.department_id
    where v.video_path = objects.name
      and v.is_active = true
      and c.is_active = true
      and p.id = (select auth.uid())
  )
);

create policy "Admins upload course video files"
on storage.objects for insert to authenticated
with check (bucket_id = 'course-videos' and (select private.is_admin()));

create policy "Admins update course video files"
on storage.objects for update to authenticated
using (bucket_id = 'course-videos' and (select private.is_admin()))
with check (bucket_id = 'course-videos' and (select private.is_admin()));

create policy "Admins delete course video files"
on storage.objects for delete to authenticated
using (bucket_id = 'course-videos' and (select private.is_admin()));
