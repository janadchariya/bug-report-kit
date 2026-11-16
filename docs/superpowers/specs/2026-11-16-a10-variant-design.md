# A10 bug report variant

Approved direction: add `variants/a10/`; preserve the Sales R19.1 kit. The user selected this option on 16 November 2026.

## Intent and scope
Extract the complete bug feature from the fetched A10 main snapshot, including assignment, developer inbox, triage, reporter threads, annotations, badges, routes and SQL. Include shell integration examples and an explicit host seam inventory. Preserve existing A10 behavior; this is an extraction, not a redesign.

## Approach
A separate variant avoids mixing the Sales Drizzle/actions implementation with A10 Supabase/REST routes. Replacing the root kit was considered and the user chose to keep Sales. Copy feature code verbatim except documented portability/privacy substitutions. Replace the production developer roster with an empty installer configuration and synthetic test fixtures. Include narrow reusable host utilities; document the host authentication/access/database contracts instead of distributing the entire task application.

## Acceptance
Developer defaults to Assigned to me; admin defaults to All reports; reporter remains owner scoped. Assignment accepts only configured developers. All three triage tabs, desktop menu wiring and a usable mobile destination are documented. No employee identities, credentials or private infrastructure are published. Run source tests in an isolated host, typecheck the packaged code, verify imports and SQL locally, and push a task branch. Do not merge, deploy or apply production SQL.
