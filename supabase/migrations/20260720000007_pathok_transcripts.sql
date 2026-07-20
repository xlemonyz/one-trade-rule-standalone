alter table public.pathok_documents
  add column if not exists original_transcript text,
  add column if not exists transcript_language text,
  add column if not exists transcript_status text not null default 'NOT_GENERATED',
  add column if not exists transcript_job_id text,
  add column if not exists transcript_scroll_index integer not null default 0,
  add column if not exists transcript_scroll_offset integer not null default 0;

alter table public.pathok_documents
  drop constraint if exists pathok_documents_transcript_status_check;

alter table public.pathok_documents
  add constraint pathok_documents_transcript_status_check
  check (transcript_status in ('NOT_GENERATED', 'REQUESTED', 'PROCESSING', 'READY', 'FAILED'));
