create table if not exists public.youtube_transcript_cache (
  video_id text not null,
  language text not null,
  source text not null check (source in ('manual', 'auto')),
  transcript text not null,
  fetched_at timestamptz not null default now(),
  primary key (video_id, language)
);

alter table public.youtube_transcript_cache enable row level security;
revoke all on public.youtube_transcript_cache from anon, authenticated;

alter table public.pathok_documents
  add column if not exists transcript_error text;

update public.pathok_documents
set transcript_status = 'NOT_GENERATED',
    transcript_job_id = null,
    transcript_error = null
where transcript_status in ('REQUESTED', 'PROCESSING');
