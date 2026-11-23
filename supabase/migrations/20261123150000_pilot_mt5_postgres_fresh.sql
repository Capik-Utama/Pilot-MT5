-- Fresh application schema for Pilot-MT5 on Supabase VPS.
-- This migration creates only Pilot-owned objects in public and one NOLOGIN
-- group role. It does not modify auth/storage/realtime objects or seed records.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pilot_api') THEN
    CREATE ROLE pilot_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE pilot_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  email varchar(320) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_signed_in timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq
  ON public.users (lower(email));

CREATE TABLE IF NOT EXISTS public.mt5_accounts (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  label varchar(80) NOT NULL,
  token_hash varchar(64) NOT NULL,
  token_hint varchar(8) NOT NULL,
  broker_account_name varchar(120),
  mt5_login double precision,
  server_name varchar(120),
  currency varchar(8) NOT NULL DEFAULT 'USD',
  is_cent_account boolean NOT NULL DEFAULT false,
  display_currency varchar(8) NOT NULL DEFAULT 'USD'
    CHECK (display_currency IN ('USD', 'CENT', 'IDR')),
  display_rate double precision NOT NULL DEFAULT 18000,
  telemetry_received boolean NOT NULL DEFAULT false,
  balance double precision NOT NULL DEFAULT 0,
  equity double precision NOT NULL DEFAULT 0,
  max_dd_buy double precision NOT NULL DEFAULT 0,
  max_dd_sell double precision NOT NULL DEFAULT 0,
  basket_sl_set double precision NOT NULL DEFAULT 0,
  basket_sl_type varchar(16) NOT NULL DEFAULT 'money'
    CHECK (basket_sl_type IN ('money', 'percent')),
  daily_target_set double precision NOT NULL DEFAULT 0,
  max_float_buy double precision NOT NULL DEFAULT 0,
  max_float_sell double precision NOT NULL DEFAULT 0,
  running_float double precision NOT NULL DEFAULT 0,
  open_positions integer NOT NULL DEFAULT 0,
  CONSTRAINT mt5_accounts_open_positions_ck CHECK (open_positions >= 0),
  ea_status varchar(80) NOT NULL DEFAULT 'MENUNGGU EA',
  running boolean NOT NULL DEFAULT false,
  ea_mode varchar(16) NOT NULL DEFAULT 'manual'
    CHECK (ea_mode IN ('auto', 'manual')),
  profit double precision NOT NULL DEFAULT 0,
  floating_profit double precision NOT NULL DEFAULT 0,
  latency_ms integer,
  CONSTRAINT mt5_accounts_latency_ms_ck CHECK (latency_ms IS NULL OR latency_ms >= 0),
  last_seen_at timestamptz,
  poll_interval_ms integer NOT NULL DEFAULT 1000
    CHECK (poll_interval_ms IN (500, 1000, 2000)),
  telemetry_interval_ms integer NOT NULL DEFAULT 500
    CHECK (telemetry_interval_ms IN (500, 1000, 2000)),
  intervals_configured boolean NOT NULL DEFAULT false,
  ea_config jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mt5_accounts_token_hash_uq UNIQUE (token_hash),
  CONSTRAINT mt5_accounts_id_owner_uq UNIQUE (id, owner_id)
);
CREATE INDEX IF NOT EXISTS mt5_accounts_owner_created_idx
  ON public.mt5_accounts (owner_id, created_at);

CREATE TABLE IF NOT EXISTS public.mt5_commands (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  account_id uuid NOT NULL,
  requested_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action varchar(24) NOT NULL,
  payload jsonb,
  status varchar(24) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'delivered', 'accepted', 'succeeded', 'failed', 'expired')),
  result_message varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  CONSTRAINT mt5_commands_account_owner_fk
    FOREIGN KEY (account_id, owner_id)
    REFERENCES public.mt5_accounts (id, owner_id) ON DELETE CASCADE,
  CONSTRAINT mt5_commands_id_scope_uq UNIQUE (id, owner_id, account_id)
);
CREATE INDEX IF NOT EXISTS mt5_commands_owner_created_idx
  ON public.mt5_commands (owner_id, created_at);
CREATE INDEX IF NOT EXISTS mt5_commands_account_status_idx
  ON public.mt5_commands (account_id, status, created_at);

CREATE TABLE IF NOT EXISTS public.mt5_command_events (
  id uuid PRIMARY KEY,
  command_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  account_id uuid NOT NULL,
  requested_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status varchar(24) NOT NULL,
  message varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mt5_command_events_command_scope_fk
    FOREIGN KEY (command_id, owner_id, account_id)
    REFERENCES public.mt5_commands (id, owner_id, account_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS mt5_command_events_owner_created_idx
  ON public.mt5_command_events (owner_id, created_at);
CREATE INDEX IF NOT EXISTS mt5_command_events_command_created_idx
  ON public.mt5_command_events (command_id, created_at);

CREATE TABLE IF NOT EXISTS public.pilot_user_access (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email varchar(320) NOT NULL,
  access_role varchar(16) NOT NULL
    CHECK (access_role IN ('owner', 'read_only', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pilot_user_access_user_uq UNIQUE (user_id),
  CONSTRAINT pilot_user_access_owner_user_uq UNIQUE (owner_id, user_id),
  CONSTRAINT pilot_user_access_owner_identity_ck
    CHECK (access_role <> 'owner' OR owner_id = user_id)
);
CREATE INDEX IF NOT EXISTS pilot_user_access_email_idx
  ON public.pilot_user_access (lower(email));

CREATE TABLE IF NOT EXISTS public.pilot_user_account_access (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pilot_user_account_access_account_owner_fk
    FOREIGN KEY (account_id, owner_id)
    REFERENCES public.mt5_accounts (id, owner_id) ON DELETE CASCADE,
  CONSTRAINT pilot_user_account_access_uq UNIQUE (owner_id, user_id, account_id)
);
CREATE INDEX IF NOT EXISTS pilot_user_account_access_account_idx
  ON public.pilot_user_account_access (account_id);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mt5_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mt5_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mt5_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mt5_commands FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mt5_command_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mt5_command_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_user_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_user_access FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_user_account_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_user_account_access FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  app_table text;
BEGIN
  FOREACH app_table IN ARRAY ARRAY[
    'users',
    'mt5_accounts',
    'mt5_commands',
    'mt5_command_events',
    'pilot_user_access',
    'pilot_user_account_access'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = app_table
        AND policyname = 'pilot_api_full_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY pilot_api_full_access ON public.%I FOR ALL TO pilot_api USING (true) WITH CHECK (true)',
        app_table
      );
    END IF;
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA public TO pilot_api;
REVOKE ALL ON TABLE
  public.users,
  public.mt5_accounts,
  public.mt5_commands,
  public.mt5_command_events,
  public.pilot_user_access,
  public.pilot_user_account_access
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.users,
  public.mt5_accounts,
  public.mt5_commands,
  public.mt5_command_events,
  public.pilot_user_access,
  public.pilot_user_account_access
TO pilot_api;

COMMIT;
