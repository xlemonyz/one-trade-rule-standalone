create table if not exists public.pathok_auth_handoffs (
  code_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_challenge text not null,
  encrypted_session text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_pathok_auth_handoffs_expires_at
  on public.pathok_auth_handoffs(expires_at);

alter table public.pathok_auth_handoffs enable row level security;

-- Only the pathok-auth Edge Function service client may access handoff rows.
revoke all on public.pathok_auth_handoffs from anon, authenticated;
