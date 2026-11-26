-- Normalize existing account panel names from the EA configuration.
-- Trend_By_Capik uses the same buy/sell magic and no pending trailing distance.
BEGIN;

UPDATE public.mt5_accounts
SET ea_panel = CASE
  WHEN ea_config IS NOT NULL
    AND ea_config->>'MagicBeli' = ea_config->>'MagicJual'
    AND ea_config->>'JarakTrailingPending' = '0'
    THEN 'trend-by-capik'
  ELSE 'grid-by-capik'
END
WHERE ea_config IS NOT NULL;

COMMIT;
