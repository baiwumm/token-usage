-- Public page model v2.1 (operator calls, 2026-11-14): the /u/<page_token>
-- page is ONE account-level page per user, reached through a dedicated page
-- token — never through badge tokens (those key the SVG embeds only).
-- page_token       tu_page_ + 32 base64url, unique, nullable until the app
--                  lazily generates it for rows created before this migration
--                  (multiple NULLs are legal under a unique index). Rotation
--                  happens through the settings PUT reset flag.
-- Replay-safe: ADD COLUMN IF NOT EXISTS.

alter table public.token_public_badge_settings
  add column if not exists page_token text
    check (page_token is null or page_token ~ '^tu_page_[A-Za-z0-9_-]{32}$');

create unique index if not exists token_public_badge_settings_page_token_key
  on public.token_public_badge_settings (page_token)
  where page_token is not null;
