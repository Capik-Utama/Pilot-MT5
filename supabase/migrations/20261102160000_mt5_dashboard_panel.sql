-- Remote dashboard mirror: panel telemetry and chart-panel command actions.
alter table public.mt5_accounts
  add column if not exists basket_sl_set numeric(24, 8) not null default 0,
  add column if not exists basket_sl_type text not null default 'money' check (basket_sl_type in ('money', 'percent')),
  add column if not exists daily_target_set numeric(24, 8) not null default 0,
  add column if not exists max_float_buy numeric(24, 8) not null default 0,
  add column if not exists max_float_sell numeric(24, 8) not null default 0,
  add column if not exists running_float numeric(24, 8) not null default 0,
  add column if not exists open_positions integer not null default 0,
  add column if not exists ea_status text not null default 'ACTIVE';

alter table public.mt5_commands drop constraint if exists mt5_commands_action_check;
alter table public.mt5_commands add constraint mt5_commands_action_check
  check (action in ('auto', 'manual', 'buy', 'sell', 'close_buy', 'close_sell', 'close_all', 'reset'));
