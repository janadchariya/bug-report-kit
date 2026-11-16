# Source and extraction deviations

Source snapshot: A10 main `c371101784dc0223c285ba2d3298344231576637`, fetched 16 November 2026. The feature includes the assigned developer inbox and current employee-name hydration present at that snapshot. This is source parity, not a claim that the portable variant was deployed.

## Copied feature surface

All files under source `src/features/bug-reports/`, `src/server/bugs/`, `src/app/api/bugs/`, `src/app/(app)/bugs/`, plus `src/domain/bug-reports.ts`, its tests, and `src/server/db/bug-queries.ts`. The pending-directory SQL is repackaged under variant `db/`; no SQL statements are changed. The private source checkout itself and its full task app are not distributed.

## Intentional changes

1. Replace five production employee identities with an **empty** installer-owned `src/domain/bug-fixers.ts` roster; import/re-export the roster in bug-reports domain. Tests mock that module using five synthetic developers. Administrator fixture names are synthetic and preserve name-formatting expectations.
2. Add `bug-navigation.ts` and two tests to share A10 desktop visibility with mobile menu wiring. `examples/shell.client.tsx` uses it; no task/quotation/settings menu is copied or removed.
3. Include reusable search select, polling, directory and paged-read helpers. Narrow person-name and image helpers to the exports bugs use; session-cookie reference supplies only its gate comparator. Remaining real host seams are inventoried in INTEGRATION.md rather than replaced with permissive stubs.
4. Extract theme defaults, with explicit system font fallbacks. Do not overwrite existing host colours or unrelated shared exports.
5. Remove private project identifiers and stale deployment instructions from the SQL header; correct the query module's stale migration-path comment. Statements, RLS, grants, bucket and RPCs are retained.
6. Package source tests beside their feature layers. Fixture mocks are the only behavior-test substitutions except synthetic names. Keep original owner isolation, filtering, assignment, storage and CSRF expectations.

## Next version contract

The bundled Next 16.4.2 documentation uses `retry` for error boundaries. Retain the source error export and the feature's `retry` prop; do not rewrite it to an older `reset` contract from memory. A different host Next version must check its installed API before adapting.

## Inherited limitations

See DECISIONS.md: in-memory rate limits, timestamp acknowledgments, capped counts/threads, partial image signature validation, browser-provided diagnostic URL/build SHA, content-bearing optional Chat messages, separate upload/insert, no PDF/idempotency/optimistic versioning. These are recorded rather than silently claiming Sales guarantees for A10.
