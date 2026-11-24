-- Keep the EA and frontend default telemetry interval aligned at 1000 ms.
-- Existing account values are intentionally preserved.
BEGIN;

ALTER TABLE public.mt5_accounts
  ALTER COLUMN telemetry_interval_ms SET DEFAULT 1000;

COMMIT;
