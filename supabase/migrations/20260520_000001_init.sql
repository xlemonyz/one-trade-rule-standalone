create extension if not exists pgcrypto;

create table if not exists public.one_trade_rule_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_one_trade_rule_states_updated_at
  on public.one_trade_rule_states(updated_at desc);

create table if not exists public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker_name text not null default '',
  account_number text not null default '',
  api_key text not null default '',
  api_key_masked text not null default '',
  endpoint_url text not null default '',
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_broker_connections_user_id
  on public.broker_connections(user_id);

create unique index if not exists uq_broker_connections_api_key
  on public.broker_connections(api_key)
  where length(api_key) > 0;

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'manual',
  data jsonb not null default '{}'::jsonb,
  broker_ticket text,
  broker_account_number text,
  broker_source text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_trades_mt5_ticket
  on public.trades(user_id, broker_account_number, broker_ticket)
  where broker_ticket is not null and broker_account_number is not null;

create index if not exists idx_trades_user_id_created_at
  on public.trades(user_id, created_at desc);

create index if not exists idx_trades_user_id_imported_at
  on public.trades(user_id, imported_at desc);

alter table public.one_trade_rule_states enable row level security;
alter table public.broker_connections enable row level security;
alter table public.trades enable row level security;

drop policy if exists one_trade_rule_states_select_own on public.one_trade_rule_states;
create policy one_trade_rule_states_select_own
on public.one_trade_rule_states
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists one_trade_rule_states_insert_own on public.one_trade_rule_states;
create policy one_trade_rule_states_insert_own
on public.one_trade_rule_states
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists one_trade_rule_states_update_own on public.one_trade_rule_states;
create policy one_trade_rule_states_update_own
on public.one_trade_rule_states
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists one_trade_rule_states_delete_own on public.one_trade_rule_states;
create policy one_trade_rule_states_delete_own
on public.one_trade_rule_states
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists broker_connections_select_own on public.broker_connections;
create policy broker_connections_select_own
on public.broker_connections
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists broker_connections_insert_own on public.broker_connections;
create policy broker_connections_insert_own
on public.broker_connections
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists broker_connections_update_own on public.broker_connections;
create policy broker_connections_update_own
on public.broker_connections
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists broker_connections_delete_own on public.broker_connections;
create policy broker_connections_delete_own
on public.broker_connections
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists trades_select_own on public.trades;
create policy trades_select_own
on public.trades
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists trades_insert_own on public.trades;
create policy trades_insert_own
on public.trades
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists trades_update_own on public.trades;
create policy trades_update_own
on public.trades
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists trades_delete_own on public.trades;
create policy trades_delete_own
on public.trades
for delete
to authenticated
using (auth.uid() = user_id);

