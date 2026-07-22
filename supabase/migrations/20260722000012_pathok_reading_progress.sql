alter table public.pathok_documents
  add column if not exists reading_progress_percent smallint
    check (reading_progress_percent between 0 and 100),
  add column if not exists transcript_progress_percent smallint
    check (transcript_progress_percent between 0 and 100);
