alter table public.youtube_transcript_cache
  add column if not exists readable_transcript text;

alter table public.pathok_documents
  add column if not exists readable_transcript text;
