# A10 Bug Report Kit

A separate extraction of A10's current bug-report feature, including developer assignment and the developer inbox. The root [Sales R19.1 kit](../../README.md) remains independent. **Install one variant only**: both own `/bugs` and `/api/bugs`.

## What ships

- Floating report button on authenticated pages; paste, drop or select a screenshot, annotate with rectangle/ellipse/arrow/freehand and three colours, undo, zoom and submit. The FAB steps aside on `/t/<id>`; it is not automatic screen capture.
- Split list/detail workspace at `/bugs` and `/bugs/<id>`, status groups, priority filter, search, cursor pagination, screenshot zoom/pan, technical context, status history and comments with an optional image.
- **Assign a developer**, reassign or clear an assignee; update status and nullable priority. Only the configured developer roster is assignable. Admins are not automatically assignable.
- **Assigned to me / All reports / Reported by me** tabs for triagers. Developers start in Assigned to me, other admins in All reports; ordinary reporters start with their own reports and see no triage tabs. The assignee filter derives from the authenticated session, never a client-supplied employee ID.
- Admins and configured developers can triage every report. A developer does not need global administrator access. Ordinary reporters can read/reply to their own reports only, including private screenshots/comment images.
- Desktop Bug reports menu for admins, Leads and configured developers. The included shared menu adapter also supports the host's mobile More/drawer. A Lead's menu visibility alone grants no triage permission. Everyone can open their own report through the submission link or `/bugs`.
- New-report and unread-reply badge, visibility-aware polling, read acknowledgment, optional new-report Google Chat webhook and explicit not-set-up/retry states.

## Layout and installation

This is **source code**, not a standalone application or npm package. `@/*` maps to the host's **src/** (different from Sales). Read [INTEGRATION.md](INTEGRATION.md), [DECISIONS.md](DECISIONS.md) and [SOURCE.md](SOURCE.md) before copying.

```text
variants/a10/
  src/          copy into host src/ (feature, routes, domain, service and queries)
  db/           feature schema, RPC functions and private Storage bucket
  reference/    reusable host utilities; merge only what the host lacks
  examples/     authenticated shell/menu/FAB wiring
  tokens/       optional A10 CSS defaults
  tests/        synthetic developer fixture for the ported tests
```

1. Survey the host's verified session, CSRF, server access loader, employee directory, Supabase schema, shell and theme. Implement the explicit host contracts in INTEGRATION.md; do not copy the root Sales adapters.
2. Copy `src/.` into host `src/`. Merge the relevant `reference/src/` utilities; retain the host's session/auth implementations and UI primitives. Copy `tests/bug-fixers.fixture.ts` into host `tests/` for tests only.
3. Configure **`src/domain/bug-fixers.ts`** with stable employee IDs and fallback display names. It ships empty. Membership grants triage authority and determines assignment eligibility; review this list like an access grant. Do not use the synthetic fixture in production. Names alone never establish identity.
4. Review `db/20261022100000_a10_bug_reports.sql` through the host migration workflow. It expects the `A10-task-management` schema and Supabase Storage; existing A10 installs must first check which objects are already applied. No production migration is part of copying this kit.
5. Mount one `BugFeedback` within the authenticated shell; merge `BugNavigation` into desktop navigation and mobile More/drawer. Use trusted server access props; preserve all other host menus. The mobile destination is an explicit improvement over the extracted source, which has no direct mobile Bug reports tab.
6. Import optional tokens before feature CSS, map missing host UI tokens, and preserve the shell scroll geometry described in INTEGRATION.md. Tailwind 4 utilities support the loading/error states.
7. In an isolated host, run the tests and typecheck described in [VERIFICATION.md](VERIFICATION.md). Use synthetic accounts and a disposable database for manual feature trials.

**No credentials or employee identities are bundled.** The current source snapshot and every extraction deviation are documented in SOURCE.md. This variant does not add Sales-only PDFs, action idempotency, DB quotas, optimistic versions or effective permission matrices. See DECISIONS.md for inherited limits before adapting it to a different host.
