-- Allow the authenticated owner to receive only their own Realtime row changes.
grant select on public.mt5_accounts, public.mt5_commands to authenticated;

drop policy if exists mt5_accounts_owner_select on public.mt5_accounts;
create policy mt5_accounts_owner_select
  on public.mt5_accounts for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists mt5_commands_owner_select on public.mt5_commands;
create policy mt5_commands_owner_select
  on public.mt5_commands for select to authenticated
  using ((select auth.uid()) = owner_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication pub
    join pg_publication_rel rel on rel.prpubid = pub.oid
    where pub.pubname = 'supabase_realtime'
      and rel.prrelid = 'public.mt5_accounts'::regclass
  ) then
    alter publication supabase_realtime add table public.mt5_accounts;
  end if;
  if not exists (
    select 1
    from pg_publication pub
    join pg_publication_rel rel on rel.prpubid = pub.oid
    where pub.pubname = 'supabase_realtime'
      and rel.prrelid = 'public.mt5_commands'::regclass
  ) then
    alter publication supabase_realtime add table public.mt5_commands;
  end if;
end $$;
