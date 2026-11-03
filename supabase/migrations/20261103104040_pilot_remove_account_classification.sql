-- Remove the obsolete account-classification field from existing installations.
alter table public.mt5_accounts drop column if exists is_demo;
