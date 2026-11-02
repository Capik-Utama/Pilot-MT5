-- New cards start in AUTO, while existing account modes remain unchanged.
create or replace function public.pilot_default_new_account_auto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.ea_mode := 'auto';
  return new;
end;
$$;

revoke all on function public.pilot_default_new_account_auto() from public, anon, authenticated;

drop trigger if exists pilot_accounts_default_auto_before_insert on public.mt5_accounts;
create trigger pilot_accounts_default_auto_before_insert
  before insert on public.mt5_accounts
  for each row execute function public.pilot_default_new_account_auto();

create or replace function public.pilot_enqueue_new_account_auto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_command_id uuid;
begin
  insert into public.mt5_commands (
    account_id, owner_id, requested_by_user_id, action, status, expires_at
  ) values (
    new.id, new.owner_id, new.owner_id, 'auto', 'queued', now() + interval '30 days'
  ) returning id into new_command_id;

  insert into public.mt5_command_events (
    command_id, account_id, owner_id, requested_by_user_id, status, message
  ) values (
    new_command_id, new.id, new.owner_id, new.owner_id, 'queued',
    'AUTO awal untuk kartu EA baru; menunggu EA tersambung.'
  );

  return new;
end;
$$;

revoke all on function public.pilot_enqueue_new_account_auto() from public, anon, authenticated;

drop trigger if exists pilot_accounts_enqueue_auto_after_insert on public.mt5_accounts;
create trigger pilot_accounts_enqueue_auto_after_insert
  after insert on public.mt5_accounts
  for each row execute function public.pilot_enqueue_new_account_auto();
