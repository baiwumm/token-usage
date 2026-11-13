-- Public badge reset (docs/badge.md §3, operator call 2026-11-13).
--
-- The single-token table is replaced by token_public_badge_settings (account
-- level config) + token_public_badges (one row per badge). The operator
-- confirmed there is almost no live usage, so nothing is migrated and every
-- previously issued token stops working — the new model stores the token in
-- plaintext and hands it back on every settings read.
--
-- This file is deliberately NOT replay-safe: dropping the old table a second
-- time cannot restore its rows. The replacement tables land in the next file
-- (20261113000001_token_public_badge_rows.sql), which is idempotent.

drop table if exists public.token_public_badges;
