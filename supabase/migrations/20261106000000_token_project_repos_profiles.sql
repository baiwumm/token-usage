-- Project repo links and profiles (contract v3, 2026-11-06;
-- docs/cli-contract.md §2.4 / §3 item 16, docs/ui-spec.md projects section).
--
-- Two tables with separate writers:
--
-- token_project_repos — written ONLY by ingest (`projects` array). One row per
--   (user, device, project_key): each device keeps its own detection, and a
--   null repo_url clears only that device's value. The CLI uploads changes
--   relative to what it last confirmed, which is only sound while a device owns
--   its row; a row shared across devices could be overwritten without the
--   original reporter ever resending. Readers take the newest non-null value
--   among non-revoked devices.
--
-- token_project_profiles — written ONLY by the dashboard
--   (/api/app/project-profiles): optional display name, manual repo link (any
--   https URL), repo_hidden (suppresses the detected link), and the logo as a
--   typed https URL and/or an uploaded object in the public "avatars" bucket
--   under <user_id>/projects/. Ingest never touches this table.
--
-- The CHECK constraints are backstops, deliberately no stricter than the route
-- validation: a CHECK must never reject a row the route accepted (for ingest
-- that would turn into a 500 and stall a collector's upload queue). The exact
-- canonical owner/repo form is enforced in the ingest route.
--
-- RLS posture matches the other token_* tables: enabled with ZERO policies,
-- service_role only. Idempotent so the file can be replayed.
--
-- Rollback (uploaded logo objects under avatars/<user_id>/projects/ are not
-- removed by this; delete them from Storage separately if needed):
--   drop table if exists public.token_project_profiles;
--   drop table if exists public.token_project_repos;

-- ---------------------------------------------------------------------------
-- token_project_repos — per-device repo detection reported by the CLI.
-- ---------------------------------------------------------------------------

create table if not exists public.token_project_repos (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.token_devices(id) on delete cascade,
  project_key text not null check (char_length(project_key) between 1 and 120),
  -- Privacy whitelist backstop: only github.com / gitee.com may be stored.
  repo_url text check (
    repo_url is null
    or (char_length(repo_url) <= 200 and repo_url ~ '^https://(github\.com|gitee\.com)/')
  ),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, device_id, project_key)
);

alter table public.token_project_repos enable row level security;

revoke all on public.token_project_repos from public, anon, authenticated;
grant all on public.token_project_repos to service_role;

comment on table public.token_project_repos is
  'contract v3 (2026-11-06): per-device GitHub/Gitee repo detection from ingest `projects`. Last-wins per (user_id, device_id, project_key); a null repo_url clears only that device. Readers take the newest non-null value among non-revoked devices. Never written by the dashboard.';

-- ---------------------------------------------------------------------------
-- token_project_profiles — manual project profile edited in the dashboard.
-- ---------------------------------------------------------------------------

create table if not exists public.token_project_profiles (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_key text not null check (char_length(project_key) between 1 and 120),
  display_name text check (
    display_name is null or char_length(display_name) between 1 and 60
  ),
  repo_url text check (
    repo_url is null
    or (char_length(repo_url) <= 500
        and repo_url ~ '^https://'
        and repo_url !~ '[[:space:][:cntrl:]]')
  ),
  repo_hidden boolean not null default false,
  logo_url text check (
    logo_url is null
    or (char_length(logo_url) <= 500
        and logo_url ~ '^https://'
        and logo_url !~ '[[:space:][:cntrl:]]')
  ),
  -- Storage path inside the public "avatars" bucket; always under the owner's
  -- own prefix.
  logo_object text check (
    logo_object is null
    or (char_length(logo_object) <= 300
        and logo_object like (user_id::text || '/projects/%'))
  ),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, project_key)
);

alter table public.token_project_profiles enable row level security;

revoke all on public.token_project_profiles from public, anon, authenticated;
grant all on public.token_project_profiles to service_role;

comment on table public.token_project_profiles is
  'Manual project profile from the dashboard (2026-11-06): optional display name, manual https repo link, repo_hidden, logo URL and uploaded logo object (avatars bucket, <user_id>/projects/). Display order: name = display_name then project_key; repo = manual, else detected unless hidden; logo = logo_url, then logo_object, then initials. Never written by ingest.';
