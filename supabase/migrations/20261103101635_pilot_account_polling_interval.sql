alter table public.mt5_accounts
  add column if not exists poll_interval_ms integer not null default 1000;

alter table public.mt5_accounts
  add constraint mt5_accounts_poll_interval_ms_check
  check (poll_interval_ms in (500, 1000, 2000));

comment on column public.mt5_accounts.poll_interval_ms is
  'Per-account EA command polling interval in milliseconds; allowed values are 500, 1000, and 2000.';
