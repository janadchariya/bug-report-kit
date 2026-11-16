# A10 variant verification

Verified 16 November 2026 in an **isolated host** extracted at A10 main `c371101784dc0223c285ba2d3298344231576637`, with this variant overlaid and existing host dependencies reused. No `.env` files, production credentials, real employee fixtures or production database were used. The kit has no standalone package/build.

## Results

- **57 tests passed in 9 suites**: domain rules, shared desktop/mobile navigation visibility, server/query/Storage service behavior, API guards, browser client, image helpers, user-agent parser, search-select options and visibility polling.
- **Typecheck passed**: `next typegen && tsc --noEmit`, including all copied feature modules, the shell example and the narrow reference helpers. Host auth/access/database/UI implementations satisfied the documented seams.
- **ESLint passed** for the extracted feature layers, query module, new navigation/configuration and shell example, with `--max-warnings=0`.
- **Disposable PGlite SQL verification passed**: migration statements, assignment/status RPC, status history, comment/unread update, clearing assignment without extra history, table RLS, denied browser grants/RPC and a private bucket record. Supabase Storage itself was an in-memory HTTP fake for service tests; bucket DDL prerequisites were stubbed in PGlite.
- Original source baseline: **50 tests passed in 7 suites** before extraction. The added navigation tests first failed for the absent adapter and passed after implementation. Full source comparison confirmed all feature files are unchanged except the deviations in SOURCE.md.
- Import inventory checked: every remaining application import is listed in INTEGRATION.md. Root Sales feature code/schema/tests remain unchanged. Root and variant AGENTS.md/CLAUDE.md pairs match.

## Reproduce in an A10-compatible disposable host

Copy/merge the variant as described in README.md, use host dependencies, copy the synthetic fixture to host `tests/bug-fixers.fixture.ts`, and use the host Vitest config (or adapt `examples/vitest.config.mts` at host root).

```sh
npx vitest run src/domain/bug-reports.test.ts src/domain/bug-navigation.test.ts src/server/bugs/bug-reports.test.ts src/app/api/bugs/route.test.ts src/features/bug-reports src/components/a10/search-select-options.test.ts src/lib/visible-poll.test.ts
npm run typecheck
npx eslint src/domain/bug-reports.ts src/domain/bug-fixers.ts src/domain/bug-navigation.ts src/domain/bug-navigation.test.ts src/server/bugs src/server/db/bug-queries.ts src/features/bug-reports src/app/api/bugs 'src/app/(app)/bugs' --max-warnings=0
```

For SQL, copy `examples/verify-schema.mjs` into host `scripts/verify-bug-schema.mjs`, the supplied migration into host `db/`, and ensure the disposable host has `@electric-sql/pglite` as a dev dependency. From host root run:

```sh
node scripts/verify-bug-schema.mjs
```

The verifier creates a fresh in-memory database; it does not connect to a hosted database. Existing A10 installs must retain their own migration inventory.

## Boundaries

This verifies extraction and host integration types/unit behavior. It does **not** establish a new-host install without adapting its seams, a full Sales regression run, browser visual acceptance, real webhook delivery, a hosted Supabase schema/bucket operation, deployment or production verification. No merge or deployment was requested/performed. Before releasing in another host, test the FAB/annotation, all three tabs, assignment/reassignment, reporter isolation, desktop/mobile menus, badge/reply flow, keyboard focus, private images, and widths 390/768/1024/1440/1920 with synthetic accounts.
