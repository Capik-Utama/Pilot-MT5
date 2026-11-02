-- Remote EA configuration edited from the dashboard.
alter table public.mt5_accounts
  add column if not exists ea_config jsonb not null default '{}'::jsonb;

alter table public.mt5_commands
  add column if not exists payload jsonb;

alter table public.mt5_commands drop constraint if exists mt5_commands_action_check;
alter table public.mt5_commands add constraint mt5_commands_action_check
  check (action in ('auto', 'manual', 'buy', 'sell', 'close_buy', 'close_sell', 'close_all', 'reset', 'config'));
