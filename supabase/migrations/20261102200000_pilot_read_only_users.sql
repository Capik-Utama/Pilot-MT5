-- Keep the existing EA owner as the sole administrator and grant invited users read-only access.
create table if not exists public.pilot_user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  access_role text not null check (access_role in ('owner', 'read_only')),
  created_at timestamptz not null default now(),
  constraint pilot_user_access_role_owner_check check (
    (access_role = 'owner' and user_id = owner_id) or
    (access_role = 'read_only' and user_id <> owner_id)
  )
);

create index if not exists pilot_user_access_owner_created_idx
  on public.pilot_user_access(owner_id, created_at);

alter table public.pilot_user_access enable row level security;
revoke all on public.pilot_user_access from anon, authenticated;
grant all on public.pilot_user_access to service_role;

-- Promote the account owner already associated with the live MT5 account(s).
insert into public.pilot_user_access(user_id, owner_id, email, access_role)
select u.id, u.id, coalesce(u.email, ''), 'owner'
from auth.users u
where exists (select 1 from public.mt5_accounts a where a.owner_id = u.id)
on conflict (user_id) do update set
  owner_id = excluded.owner_id,
  email = excluded.email,
  access_role = 'owner';

-- Realtime's authenticated SELECT policies must include the account owner's read-only users.
create or replace function public.pilot_dashboard_owner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select access.owner_id
  from public.pilot_user_access as access
  where access.user_id = (select auth.uid())
    and access.access_role in ('owner', 'read_only')
  limit 1
$$;
revoke all on function public.pilot_dashboard_owner_id() from public, anon;
grant execute on function public.pilot_dashboard_owner_id() to authenticated, service_role;

drop policy if exists mt5_accounts_owner_select on public.mt5_accounts;
create policy mt5_accounts_owner_select
  on public.mt5_accounts for select to authenticated
  using (owner_id = (select public.pilot_dashboard_owner_id()));

drop policy if exists mt5_commands_owner_select on public.mt5_commands;
create policy mt5_commands_owner_select
  on public.mt5_commands for select to authenticated
  using (owner_id = (select public.pilot_dashboard_owner_id()));

-- Public Supabase Auth sign-up can only insert users provisioned by this app's owner API.
-- The public sign-up endpoint cannot set raw_app_meta_data/app_metadata.
create or replace function public.pilot_restrict_auth_user_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'pilot_provisioned_by', '') = 'owner' then
    return new;
  end if;
  raise exception 'Self-registration is disabled. Ask the MT5 Pilot owner to create an account.'
    using errcode = '42501';
end;
$$;
revoke all on function public.pilot_restrict_auth_user_creation() from public, anon, authenticated;
drop trigger if exists pilot_restrict_auth_user_creation on auth.users;
create trigger pilot_restrict_auth_user_creation
  before insert on auth.users
  for each row execute function public.pilot_restrict_auth_user_creation();
