# Working rules for coding agents in ciao-rental-car

CIAO Rental Car is a self-drive rental site in Sapporo (pnpm monorepo, Node 24 target, TypeScript):
- `artifacts/api-server` — Express 5 API, Drizzle ORM on PostgreSQL, esbuild bundle, tests in `test/` (node --test).
- `artifacts/ciao-rental` — React + Vite + Tailwind customer site and admin.
- `lib/db` — Drizzle schema and versioned SQL migrations (`lib/db/migrations`, see its README).
- `lib/api-spec` — OpenAPI spec; Orval generates `lib/api-client-react` and `lib/api-zod`.
- Product specs: Notion "CIAO Rental Car — Review, PRD v2 & Design Pack" (requirement IDs such as `CHK-03`, review findings `R-02`).

## How work flows
1. Mark writes or approves a GitHub issue with acceptance criteria (one story per issue, IDs such as `R0-02` / `CHK-03`).
2. A coding agent (Codex) implements it on a branch `codex/<id>-<slug>` in its own worktree and isolated database, then a quality gate runs: typecheck, web build, API build, API and migration tests (no new failures vs `main`).
3. A draft PR is opened; Claude Code reviews it and comments. Blocker/major findings go back to the coding agent (up to 3 rounds).
4. When the gate passes and the review approves, the PR is marked ready. **Only Mark merges**, after testing on isolated staging. Nothing is deployed by agents.
5. Jason owns Replit/Cloudflare deployment and environment configuration.

## Rules
1. **Scope** — implement only the issue's acceptance criteria with the smallest sound change. No drive-by refactors or renames.
2. **Never touch production or external services** — no requests to `*.replit.app`, `ciao-rental.pages.dev`, live Stripe, or real email. Do not run `git push`, `gh`, deploy or publish commands. When running inside the `ciao-task` pipeline, do not commit; the pipeline commits for you.
3. **Database** — use only the `DATABASE_URL` you are given (an isolated local database). Never edit an existing migration; add a new numbered `.up.sql` / `.down.sql` pair and keep the Drizzle schema in sync.
4. **Japan time** — every customer- or staff-facing date/time is shown in Asia/Tokyo and labelled JST. Use `formatTokyo` / `tokyoParts` from `artifacts/ciao-rental/src/lib/rental-marketplace.ts` (or a shared helper built on them). Never format business times with `new Date(x).toLocaleString()` or date-fns `format(new Date(x))`.
5. **Three languages** — every customer-visible string exists in English, Japanese and Traditional Chinese (`zh-TW`). Follow the existing language-keyed copy patterns (for example `rentalCopy` in `src/lib/rental-localization.ts`). Never show raw codes such as `pending_payment` or `drivers_license`.
6. **Honest copy** — no insurance, cancellation, payment, airport or availability promises unless they come from approved settings/policy data. When in doubt, use neutral wording and flag it for Mark in your summary.
7. **Money** — JPY integers; the server is the price authority; prices shown tax-included.
8. **Security and privacy** — no secrets in code; licence and passport images only through the private upload flow, never as URLs; validate inputs with zod; keep admin checks on admin routes.
9. **API contract** — when an endpoint changes, update `lib/api-spec/openapi.yaml`, run `npx -y pnpm@10 --filter @workspace/api-spec run codegen`, then make sure `lib/api-zod/src/index.ts` only exports `./generated/api` (see `replit.md`).
10. **Tests** — add or update behaviour tests for logic you change (`artifacts/api-server/test/*.test.mjs`). Avoid tests that assert on source text with regex.
11. **Verify before you finish** — run `npx -y pnpm@10 run typecheck` and the relevant `node --test` files (with `DATABASE_URL` set). Fix what you broke.
12. **Dependencies** — do not edit `pnpm-workspace.yaml` or `pnpm-lock.yaml` unless the issue asks for it. If you add a dependency, add it with pnpm and say so.
13. **Files** — keep each file's existing line endings; new files use LF. Do not add build output, logs, archives or local config.
14. **Final message** — summarise: files changed; how each acceptance criterion is met; checks you ran and their results; anything left for a human (configuration, data changes in admin, copy needing Mark's approval).
