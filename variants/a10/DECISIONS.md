# A10 behavior and integration decisions

A10's behavior is independent of the root Sales R19.1 rules.

| Concern | A10 behavior preserved here |
|---|---|
| Authority | Trusted host admin access OR membership in configured BUG_FIXERS; Leads only receive menu visibility, not triage. |
| Assignment | Only roster employee IDs, stored as `anga_two:<employeeId>`; current directory names override fallback labels. Historical assignees remain visible when unavailable. |
| Inbox | Developers default assigned; admins default all; reporters default reported. Filters combine with status, priority, search and cursor. Reassignment moves reports between developer inboxes. |
| Reporter isolation | Non-triagers always get an owner predicate, even when requesting assigned-to-me. Details, threads and binary reads independently authorize the report. |
| Workflow | New / In progress / Done / Cancelled. Status edits add history and an optional note; unchanged status adds none. No Sales transition graph or required cancellation reason. |
| Writes | REST JSON/multipart with same-origin validation, session CSRF and host writes switch. List search is a same-origin read POST and requires no CSRF or writes switch. |
| Images | Required screenshot per report; comments need text or an image. Server accepts byte-sniffed PNG/JPEG/WebP up to 4 MiB. Browser prepares larger local inputs; no PDF or signed public URLs. Sniffing checks signatures, not complete raster decoding. |
| Storage | Private Supabase bucket; routes authorize before downloading. Binary route retains `private, max-age=300`, nosniff and sandbox CSP. JSON uses no-store. |
| Unread | Timestamp-based reporter acknowledgment; only open New/In progress reports contribute to badge counts. Counts cap at 1,000 candidate rows; threads/history at 500. This is not Sales's snapshot counter protocol. |
| Rate limiting | One report per user per 10 seconds, in memory per server process; not a distributed DB quota. |
| Notifications | Optional new-report webhook includes reporter, summary, page URL and up to 500 description characters. Configure only an approved destination. This differs from Sales's opaque cards/outbox. |
| Context | Browser supplies full page URL, UA and build SHA. Do not mistake these for trusted identity. A host with sensitive URL/query values should adapt context collection before enabling it. |
| Persistence | Storage upload and SQL insert are separate; failed inserts may leave an orphan object. Retries do not have Sales's idempotency keys. RPC status/history and comment activity updates are transactional. |
| Privacy | No deletion/removal/PDF scrub UI is added; keep host retention and privacy procedures. No production roster or credentials ship in the public extraction. |

Port-specific decisions: empty configurable developer roster; synthetic test identities; reusable source utilities trimmed to the feature; a shared menu helper plus mobile wiring example; existing Sales kit retained. The adapter hides a menu only for presentation; every server method keeps its own authorization. Never treat a visible menu, `isAdmin` client prop, assigned filter or assignee key as a permission grant.
