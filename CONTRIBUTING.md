# Contributing to Token Usage

Thanks for taking the time to contribute. This repository is maintained by a single maintainer, so short, focused changes are much easier to review and land.

## Before you start

- Read [AGENTS.md](./AGENTS.md). It is the source of truth for repository layout, coding conventions, routes, UI rules, dependency budget and commit format.
- For anything larger than a small fix, open an [Ideas discussion](https://github.com/baiwumm/token-usage/discussions/categories/ideas) first so the approach can be agreed on.
- Reproducible bugs go to the issue form; setup, deployment and usage questions go to [Discussions Q&A](https://github.com/baiwumm/token-usage/discussions/categories/q-a).

## Development

Requirements: Node 24 and pnpm; the desktop app additionally needs a Rust toolchain.

```bash
pnpm install
pnpm dev          # dashboard
pnpm dev:landing  # landing page + docs
pnpm dev:desktop  # desktop shell
pnpm verify       # lint + typecheck + tests + build
```

`pnpm verify` is the same gate CI runs and is required before every commit.

Changing the CLI contract layer (`apps/web/src/app/api/functions/token-usage-*`)? Update [docs/cli-contract.md](./docs/cli-contract.md) and the golden tests first, then the implementation.

## Pull requests

- Keep the diff focused: one logical change per PR.
- Use conventional commit messages (`feat` / `fix` / `docs` / `test` / `chore` / `refactor`).
- If an AI assistant helped, add the required trailer block described in [AGENTS.md](./AGENTS.md). Commits without it will not credit the tool.
- Make sure `pnpm verify` passes locally before pushing.

## Dependencies

New runtime dependencies need maintainer approval and an update to the budget in [docs/rewrite-plan.md](./docs/rewrite-plan.md) §4. Prefer the platform or an existing dependency over adding a new package.

## Secrets

Never commit service-role keys, device tokens, pairing codes or real Supabase credentials. Tests, fixtures and documentation must use fake values. Push protection is enabled on this repository, so a commit containing a detected secret is rejected.

## Community

By participating in this project you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md). Report unacceptable behavior to me@baiwumm.com.

## Security

Do not open public issues or pull requests for vulnerabilities. Use [private reporting](https://github.com/baiwumm/token-usage/security/advisories/new) and see [SECURITY.md](./SECURITY.md).
