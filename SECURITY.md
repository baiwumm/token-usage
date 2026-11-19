# Security Policy

Token Usage is self-hosted: every deployment runs against the operator's own Supabase, and the collector is designed to send metadata only. Security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue, discussion or pull request** for a security problem.

Use GitHub private vulnerability reporting:

https://github.com/baiwumm/token-usage/security/advisories/new

Include the affected component (CLI / web / desktop / deployment docs), the version or commit, reproduction steps, and the impact you expect. Use fake credentials in any proof of concept.

This is a volunteer-maintained project, so responses are best-effort. You will get an acknowledgement when the report is reviewed; please allow time for a fix before any public disclosure.

## Scope

In scope:

- Authentication, session handling and the route handlers under `apps/web/src/app/api/`
- The zero-policy guarantee on `token_*` tables (no `anon` / `authenticated` access)
- Device tokens and pairing codes
- Anything in the collector that could leak prompts, message bodies, absolute paths or usage data beyond the documented metadata
- The desktop updater and release artifacts

Out of scope:

- Vulnerabilities that require an already compromised operator machine or Supabase project
- Self-hosted misconfiguration that the deployment guide already warns about
- Findings only reproducible on a fork with modified policies or keys

## Supported versions

Only the latest released CLI (`tokenusage-cli`), the latest desktop release and the `main` branch receive security fixes.

## Secrets

Never paste real service-role keys, device tokens, pairing codes or Supabase credentials into an issue, discussion or advisory proof of concept.
