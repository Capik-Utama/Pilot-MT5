-- Add a staff role with explicit per-account access. Existing read-only users retain owner-wide read access.
alter table public.pilot_user_access
  drop constraint if exists pilot_user_access_access_role_check;
alter table public.pilot_user_access
  add constraint pilot_user_access_access_role_check
  check (access_role in ('owner', 'read_only', 'staff'));
alter table public.pilot_user_access
  drop constraint if exists pilot_user_access_role_owner_check;
alter table public.pilot_user_access
  add constraint pilot_user_access_role_owner_check
  check (
    (access_role = 'owner' and user_id = owner_id) or
    (access_role in ('read_only', 'staff') and user_id <> owner_id)
  );

alter table public.mt5_commands
  add column if not exists requested_by_user_id uuid references auth.users(id) on delete set null;
alter table public.mt5_command_events
  add column if not exists requested_by_user_id uuid references auth.users(id) on delete set null;

create table if not exists public.pilot_user_account_access (
  user_id uuid not null references public.pilot_user_access(user_id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.mt5_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, account_id)
);
create index if not exists pilot_user_account_access_owner_account_idx
  on public.pilot_user_account_access(owner_id, account_id);

alter table public.pilot_user_account_access enable row level security;
revoke all on public.pilot_user_account_access from anon, authenticated;
grant all on public.pilot_user_account_access to service_role;

create or replace function public.pilot_dashboard_can_access_account(target_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.mt5_accounts as account
    where account.id = target_account_id
      and (
        account.owner_id = (select auth.uid())
        or exists (
          select 1 from public.pilot_user_access as access
          where access.user_id = (select auth.uid())
            and access.owner_id = account.owner_id
            and access.access_role = 'read_only'
        )
        or exists (
          select 1 from public.pilot_user_account_access as assignment
          where assignment.user_id = (select auth.uid())
            and assignment.owner_id = account.owner_id
            and assignment.account_id = account.id
        )
      )
  )
$$;
revoke all on function public.pilot_dashboard_can_access_account(uuid) from public, anon;
grant execute on function public.pilot_dashboard_can_access_account(uuid) to authenticated, service_role;

drop policy if exists mt5_accounts_owner_select on public.mt5_accounts;
create policy mt5_accounts_owner_select
  on public.mt5_accounts for select to authenticated
  using ((select public.pilot_dashboard_can_access_account(id)));

drop policy if exists mt5_commands_owner_select on public.mt5_commands;
create policy mt5_commands_owner_select
  on public.mt5_commands for select to authenticated
  using ((select public.pilot_dashboard_can_access_account(account_id)));
