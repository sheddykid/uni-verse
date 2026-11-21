alter table public.course_videos
  drop constraint if exists course_videos_file_size_check;

alter table public.course_videos
  add constraint course_videos_file_size_check
  check (file_size > 0 and file_size <= 5368709120);
