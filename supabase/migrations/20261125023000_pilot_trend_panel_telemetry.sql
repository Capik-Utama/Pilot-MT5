-- Trend By Capik panel telemetry. Existing account rows keep their current values.
BEGIN;

ALTER TABLE public.mt5_accounts
  ADD COLUMN IF NOT EXISTS ea_panel varchar(32) NOT NULL DEFAULT 'grid-by-capik',
  ADD COLUMN IF NOT EXISTS minimum_balance_set double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS basket_tp_set double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_orders integer NOT NULL DEFAULT 0;

ALTER TABLE public.mt5_accounts
  DROP CONSTRAINT IF EXISTS mt5_accounts_pending_orders_ck;

ALTER TABLE public.mt5_accounts
  ADD CONSTRAINT mt5_accounts_pending_orders_ck CHECK (pending_orders >= 0);

COMMIT;
