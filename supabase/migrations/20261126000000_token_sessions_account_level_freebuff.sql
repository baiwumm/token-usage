-- token_sessions: add `freebuff` to the account-level source ban.
--
-- Freebuff joins cursor / trae-cn as an account-level source (its usage rows
-- are account-wide day totals fetched from the web console API, not
-- device-local session logs), so Sessions — device-level only — must never
-- store its rows. Extends the 20261025000000 CHECK; the original constraint
-- was created inline without an explicit name, so it is located by definition
-- (any check on this table referencing 'trae-cn') and dropped before the
-- named replacement is added. Re-running converges: the replacement is
-- excluded from the drop scan by name and guarded by an existence check.

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.token_sessions'::regclass
      and contype = 'c'
      and conname <> 'token_sessions_account_level_source_check'
      and pg_get_constraintdef(oid) like $pat$%'trae-cn'%$pat$
  loop
    execute format('alter table public.token_sessions drop constraint %I', r.conname);
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.token_sessions'::regclass
      and conname = 'token_sessions_account_level_source_check'
  ) then
    execute 'alter table public.token_sessions add constraint token_sessions_account_level_source_check check (lower(source) not in (''cursor'', ''trae-cn'', ''freebuff''))';
  end if;
end $$;
