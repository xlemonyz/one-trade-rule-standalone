create table if not exists public.pathok_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  kind text not null check (kind in ('TEXT', 'YOUTUBE')),
  title text not null default '',
  content text not null default '',
  youtube_url text,
  youtube_video_id text,
  thumbnail_url text,
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  scroll_index integer not null default 0 check (scroll_index >= 0),
  scroll_offset integer not null default 0 check (scroll_offset >= 0),
  deleted_at_ms bigint,
  primary key (user_id, id)
);

create index if not exists idx_pathok_documents_user_updated
  on public.pathok_documents(user_id, updated_at_ms desc);

alter table public.pathok_documents enable row level security;

create policy "Users can read their Pathok documents"
  on public.pathok_documents for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their Pathok documents"
  on public.pathok_documents for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their Pathok documents"
  on public.pathok_documents for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their Pathok documents"
  on public.pathok_documents for delete
  to authenticated
  using ((select auth.uid()) = user_id);
