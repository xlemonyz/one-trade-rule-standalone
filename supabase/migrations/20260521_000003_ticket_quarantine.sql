create table if not exists public.one_trade_rule_ticket_quarantine (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker_account_number text not null,
  broker_ticket text not null,
  reason text not null,
  first_seen_at timestamptz not null default now(),
  close_time text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_one_trade_rule_ticket_quarantine_user_account_ticket
  on public.one_trade_rule_ticket_quarantine(user_id, broker_account_number, broker_ticket);

create index if not exists idx_one_trade_rule_ticket_quarantine_user_created
  on public.one_trade_rule_ticket_quarantine(user_id, created_at desc);

alter table public.one_trade_rule_ticket_quarantine enable row level security;

drop policy if exists one_trade_rule_ticket_quarantine_select_own on public.one_trade_rule_ticket_quarantine;
create policy one_trade_rule_ticket_quarantine_select_own
on public.one_trade_rule_ticket_quarantine
for select
to authenticated
using (auth.uid() = user_id);
