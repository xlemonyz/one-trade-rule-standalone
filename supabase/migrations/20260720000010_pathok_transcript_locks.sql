create table if not exists public.pathok_transcript_locks (
  video_id text not null,
  language text not null,
  owner_id uuid not null,
  locked_at timestamptz not null default now(),
  primary key (video_id, language)
);

alter table public.pathok_transcript_locks enable row level security;
revoke all on public.pathok_transcript_locks from anon, authenticated;
