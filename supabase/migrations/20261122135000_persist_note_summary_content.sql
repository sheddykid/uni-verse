alter table public.note_summary_history add column if not exists summary_data jsonb;

alter table public.note_summary_history
  add constraint note_summary_history_ready_content_check
  check (status <> 'ready' or summary_data is not null);
