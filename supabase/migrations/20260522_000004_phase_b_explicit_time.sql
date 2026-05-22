-- Phase B strict explicit time support (non-destructive)

-- 1) challenge_trades: add explicit MT5 time/server columns
alter table public.challenge_trades
  add column if not exists broker_server text,
  add column if not exists open_time_utc timestamptz,
  add column if not exists close_time_utc timestamptz,
  add column if not exists open_epoch_ms bigint,
  add column if not exists close_epoch_ms bigint;

-- 2) quarantine table: add broker_server for scoped block keys
alter table public.one_trade_rule_ticket_quarantine
  add column if not exists broker_server text;

-- 3) backfill legacy rows with explicit server sentinel
update public.challenge_trades
set broker_server = '__legacy__'
where coalesce(trim(broker_server), '') = '';

update public.one_trade_rule_ticket_quarantine
set broker_server = '__legacy__'
where coalesce(trim(broker_server), '') = '';

-- 4) upgrade uniqueness keys (account + server + ticket)
drop index if exists public.uq_challenge_trades_mt5_ticket;
create unique index if not exists uq_challenge_trades_user_account_server_ticket
  on public.challenge_trades(user_id, broker_account_number, broker_server, broker_ticket)
  where broker_ticket is not null
    and broker_account_number is not null
    and broker_server is not null;

drop index if exists public.uq_one_trade_rule_ticket_quarantine_user_account_ticket;
create unique index if not exists uq_one_trade_rule_ticket_quarantine_user_account_server_ticket
  on public.one_trade_rule_ticket_quarantine(user_id, broker_account_number, broker_server, broker_ticket);

