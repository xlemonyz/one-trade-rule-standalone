create table if not exists public.challenge_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id text not null,
  trading_day_key text not null,
  source text not null default 'mt5',
  data jsonb not null default '{}'::jsonb,
  broker_ticket text,
  broker_account_number text,
  broker_source text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_challenge_trades_mt5_ticket
  on public.challenge_trades(user_id, broker_account_number, broker_ticket)
  where broker_ticket is not null and broker_account_number is not null;

create index if not exists idx_challenge_trades_user_imported_at
  on public.challenge_trades(user_id, imported_at desc);

create index if not exists idx_challenge_trades_user_challenge_day
  on public.challenge_trades(user_id, challenge_id, trading_day_key);

alter table public.challenge_trades enable row level security;

drop policy if exists challenge_trades_select_own on public.challenge_trades;
create policy challenge_trades_select_own
on public.challenge_trades
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists challenge_trades_insert_own on public.challenge_trades;
create policy challenge_trades_insert_own
on public.challenge_trades
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists challenge_trades_update_own on public.challenge_trades;
create policy challenge_trades_update_own
on public.challenge_trades
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists challenge_trades_delete_own on public.challenge_trades;
create policy challenge_trades_delete_own
on public.challenge_trades
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists trades_select_own on public.trades;
drop policy if exists trades_insert_own on public.trades;
drop policy if exists trades_update_own on public.trades;
drop policy if exists trades_delete_own on public.trades;
drop table if exists public.trades;
