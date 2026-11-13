-- Dedicated public page switch (operator call, 2026-11-14): the /u/<page_token>
-- page no longer follows the badge master switch. page_enabled gates the page
-- itself (off = the URL answers 404); the badge `enabled` flag keeps gating the
-- SVG embeds only. Default true preserves live behavior.
-- Replay-safe: ADD COLUMN IF NOT EXISTS.

alter table public.token_public_badge_settings
  add column if not exists page_enabled boolean not null default true;
