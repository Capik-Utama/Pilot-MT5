-- Repair/compatibility migration for installations that already ran the historical
-- Pilot-MT5 migrations before the fresh-schema baseline was introduced.
-- Additive only: existing account/access rows are preserved; no table is dropped.
-- Safe to rerun, and a no-op for installations that already have the target columns.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.mt5_accounts') IS NULL THEN
    RAISE EXCEPTION 'Pilot-MT5 schema prerequisite missing: public.mt5_accounts; apply the baseline migrations first';
  END IF;
  IF to_regclass('public.pilot_user_access') IS NULL THEN
    RAISE EXCEPTION 'Pilot-MT5 schema prerequisite missing: public.pilot_user_access; apply the access migrations first';
  END IF;
END
$$;

-- These interval columns are part of the current application contract. Older
-- installations may have only poll_interval_ms or may have nullable columns.
ALTER TABLE public.mt5_accounts
  ADD COLUMN IF NOT EXISTS poll_interval_ms integer,
  ADD COLUMN IF NOT EXISTS telemetry_interval_ms integer,
  ADD COLUMN IF NOT EXISTS intervals_configured boolean;

UPDATE public.mt5_accounts
SET poll_interval_ms = 1000
WHERE poll_interval_ms IS NULL;

UPDATE public.mt5_accounts
SET telemetry_interval_ms = 500
WHERE telemetry_interval_ms IS NULL;

UPDATE public.mt5_accounts
SET intervals_configured = false
WHERE intervals_configured IS NULL;

ALTER TABLE public.mt5_accounts
  ALTER COLUMN poll_interval_ms SET DEFAULT 1000,
  ALTER COLUMN poll_interval_ms SET NOT NULL,
  ALTER COLUMN telemetry_interval_ms SET DEFAULT 500,
  ALTER COLUMN telemetry_interval_ms SET NOT NULL,
  ALTER COLUMN intervals_configured SET DEFAULT false,
  ALTER COLUMN intervals_configured SET NOT NULL;

-- Match the current application contract. VALIDATE below deliberately fails
-- rather than silently rewriting any pre-existing out-of-range interval value.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.mt5_accounts'::regclass
      AND conname = 'mt5_accounts_intervals_ck'
  ) THEN
    ALTER TABLE public.mt5_accounts
      ADD CONSTRAINT mt5_accounts_intervals_ck
      CHECK (
        telemetry_interval_ms IN (500, 1000, 2000)
        AND poll_interval_ms IN (500, 1000, 2000)
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.mt5_accounts
  VALIDATE CONSTRAINT mt5_accounts_intervals_ck;

-- The earlier access table keyed rows by user_id and had no id. Add the id
-- expected by the current backend while retaining the legacy user_id key.
ALTER TABLE public.pilot_user_access
  ADD COLUMN IF NOT EXISTS id uuid;

UPDATE public.pilot_user_access
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.pilot_user_access
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL;

-- Fresh installs already have a primary-key index on id. Legacy installs get a
-- unique index without dropping/replacing their existing primary key or FKs.
DO $$
DECLARE
  id_attnum smallint;
BEGIN
  SELECT attnum
    INTO id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.pilot_user_access'::regclass
    AND attname = 'id'
    AND NOT attisdropped;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.pilot_user_access'::regclass
      AND i.indisunique
      AND i.indisvalid
      AND i.indnkeyatts = 1
      AND i.indkey[0] = id_attnum
  ) THEN
    CREATE UNIQUE INDEX pilot_user_access_id_uq
      ON public.pilot_user_access (id);
  END IF;
END
$$;

COMMENT ON COLUMN public.mt5_accounts.telemetry_interval_ms IS
  'EA telemetry interval in milliseconds; allowed values are 500, 1000, and 2000.';
COMMENT ON COLUMN public.mt5_accounts.intervals_configured IS
  'Whether the EA has acknowledged the configured polling and telemetry intervals.';
COMMENT ON COLUMN public.pilot_user_access.id IS
  'Stable unique access-row identifier required by the Pilot-MT5 application.';

-- Fail the migration clearly if the columns/types expected by the application
-- are still absent after repair.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mt5_accounts'
      AND column_name = 'telemetry_interval_ms' AND data_type = 'integer'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mt5_accounts'
      AND column_name = 'intervals_configured' AND data_type = 'boolean'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pilot_user_access'
      AND column_name = 'id' AND data_type = 'uuid' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Pilot-MT5 schema compatibility migration did not establish required columns';
  END IF;
END
$$;

COMMIT;
