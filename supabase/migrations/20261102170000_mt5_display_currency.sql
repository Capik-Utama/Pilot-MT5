alter table public.mt5_accounts
  add column if not exists display_currency text not null default 'USD'
    check (display_currency in ('USD', 'CENT', 'IDR')),
  add column if not exists display_rate numeric(20, 8) not null default 17000
    check (display_rate > 0);

alter table public.mt5_accounts
  add column if not exists is_cent_account boolean not null default false;
