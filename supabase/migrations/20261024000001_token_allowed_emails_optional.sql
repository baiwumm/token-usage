-- OPTIONAL: self-serve signup allowlist (docs/rewrite-plan.md §3, token_allowed_emails).
--
-- Public signup stays CLOSED in the base deployment (operator creates accounts
-- with the service-role key). Apply this file only if self-serve signup is
-- wanted: with a non-empty allowlist, only whitelisted emails may register.
-- An empty table disables the guard entirely.
--
-- Idempotent; safe to replay. Remove the guard with:
--   drop trigger if exists on_auth_user_created_allowlist on auth.users;
--   drop function if exists public.token_allowed_emails_guard();

create extension if not exists citext;

create table if not exists public.token_allowed_emails (
  email citext not null unique,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.token_allowed_emails enable row level security;

revoke all on public.token_allowed_emails from public, anon, authenticated;

grant all on public.token_allowed_emails to service_role;

-- Gate auth.users inserts: allow when the whitelist is empty (feature off),
-- otherwise only whitelisted emails (case-insensitive citext match).
create or replace function public.token_allowed_emails_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.token_allowed_emails limit 1) then
    return new;
  end if;
  if new.email is null
    or not exists (select 1 from public.token_allowed_emails where email = new.email)
  then
    raise exception 'Signup is limited to allowlisted emails';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_allowlist on auth.users;

create trigger on_auth_user_created_allowlist
  before insert on auth.users
  for each row execute function public.token_allowed_emails_guard();

comment on table public.token_allowed_emails is
  'OPTIONAL self-serve signup allowlist. Empty table = guard disabled; public signup is otherwise closed.';
