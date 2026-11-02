create extension if not exists pgcrypto with schema extensions;

create table public.mt5_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  broker_account_name text,
  mt5_login bigint,
  server_name text,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3,8}$'),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_hint text not null check (char_length(token_hint) = 8),
  is_demo boolean not null default false,
  telemetry_received boolean not null default false,
  balance numeric(24, 8) not null default 0,
  equity numeric(24, 8) not null default 0,
  max_dd_buy numeric(24, 8) not null default 0,
  max_dd_sell numeric(24, 8) not null default 0,
  running boolean not null default false,
  ea_mode text not null default 'manual' check (ea_mode in ('auto', 'manual')),
  profit numeric(24, 8) not null default 0,
  floating_profit numeric(24, 8) not null default 0,
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 60000),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mt5_accounts_owner_created_idx on public.mt5_accounts(owner_id, created_at);
create index mt5_accounts_last_seen_idx on public.mt5_accounts(last_seen_at);

create table public.mt5_commands (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mt5_accounts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('auto', 'manual', 'close_buy', 'close_sell', 'close_all')),
  status text not null default 'queued' check (status in ('queued', 'delivered', 'accepted', 'succeeded', 'failed', 'expired')),
  result_message text check (result_message is null or char_length(result_message) <= 500),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null
);

create index mt5_commands_account_created_idx on public.mt5_commands(account_id, created_at desc);
create index mt5_commands_account_status_idx on public.mt5_commands(account_id, status, expires_at);

create table public.mt5_command_events (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null references public.mt5_commands(id) on delete cascade,
  account_id uuid not null references public.mt5_accounts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('queued', 'delivered', 'accepted', 'succeeded', 'failed', 'expired')),
  message text check (message is null or char_length(message) <= 500),
  created_at timestamptz not null default now()
);

create index mt5_command_events_command_created_idx on public.mt5_command_events(command_id, created_at);

alter table public.mt5_accounts enable row level security;
alter table public.mt5_commands enable row level security;
alter table public.mt5_command_events enable row level security;

revoke all on public.mt5_accounts, public.mt5_commands, public.mt5_command_events from anon, authenticated;
grant all on public.mt5_accounts, public.mt5_commands, public.mt5_command_events to service_role;
