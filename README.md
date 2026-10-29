# Bug Report Kit · v2

A portable in-app bug reporting feature: source code for an AI agent to copy into a host project. This version ports the Sales R19.1 implementation and its Almond interaction design. The host supplies its colours through CSS tokens.

**Install instruction:** “Install this feature into my project. Read README.md, INTEGRATION.md, DECISIONS.md and TOKENS.md first. Preserve the shipped behaviour and adapt the documented host seams.”

This is a feature kit, not a running application or npm package. There is deliberately no root `package.json`. Do not run a standalone build here. Work in the target app or a disposable host with the dependencies and adapters below.

## Feature tour

- **Report from every signed-in page.** A round bug FAB opens the dialog. Its one-time coachmark explains capture → click → paste and links to `/guide#report-a-bug`. It is a named region, does not steal focus, and closes only through an explicit action. The shared floating action layer avoids phone tabs, keyboards, fixed action bars and toasts; modal dialogs hide it.
- **Summary first.** Enter Summary (required, 200 characters maximum); `+ Add details` expands the optional 4,000-character description. The R19.1 report dialog requires a screenshot as well as Summary; the lower-level server command still accepts metadata-only reports for compatibility. Drafts stay in mounted component memory after a failed or uncertain submission; closing a dirty draft asks before discarding it.
- **Bring your own screenshot.** Paste anywhere in the report dialog, including Summary, drop a file, or pick PNG, JPEG, WebP or GIF (rasterised to a still frame). The app never captures the screen automatically. Annotate inline with rectangle, ellipse, arrow or freehand pen, three colours, undo, start over, native scrolling and zoom. Send flattens the report annotations. Comment images are prepared and attached directly; they do not open an annotation editor.
- **Optional PDF.** One PDF, up to **4 MiB (4,194,304 bytes)**, may accompany a report or comment. PDF upload happens separately from report creation. If it fails, the saved report remains and the UI offers a retry without creating another report. Removal leaves an audit placeholder.
- **Safe context.** The report captures an allowlisted path/query, viewport, browser, OS and device. The server supplies reporter identity and build SHA. Search text, hashes, credentials and storage dumps are excluded.
- **Triage workspace.** `/bugs` has status pills, priority and assignee filters, debounced search, list selection retained in the URL, detail, status history and a discussion thread. Reply with text, image or PDF. Assign only to active triagers. Cancellation requires a reason; terminal reports can be reopened.
- **Reporter view.** `/bugs/mine` (“My bug reports”) shows only the reporter’s own reports, with unread dots. Opening a rendered detail clears only the activity actually shown. Replies arriving later remain unread. Navigation badges share one visibility-aware 45-second poller and refresh after successful actions.
- **Help.** The guide has three HTML/CSS illustrated steps, capture shortcuts and follow-up instructions. No real customer screenshot is bundled.
- **Optional Google Chat cards.** Report/comment events enqueue notifications inside the saving transaction; the delivery worker is scheduled after commit. Without configured recipient credentials no Chat delivery is attempted; host delivery can use Chat, another channel, or no delivery.

The exact product rules and review dispositions live in [DECISIONS.md](DECISIONS.md). Operator guidance is in [docs/runbooks/bug-reports.md](docs/runbooks/bug-reports.md). Some guide illustrations retain the source’s historical copy; see the copy inventory in [INTEGRATION.md](INTEGRATION.md) before localising.

## Stack and layout

The source assumes **Next.js 16 App Router, React 19, TypeScript, Drizzle ORM + PostgreSQL, and server actions**. Attachment bytes live in PostgreSQL `bytea`; there is no object storage or signed upload flow. RLS is enabled and SQL triggers prohibit hard deletion. The trusted server database role must have the intended access; no browser database access is needed.

```
README.md / INTEGRATION.md / DECISIONS.md / TOKENS.md / CHANGELOG.md
db/schema.ts                    bug tables and enums
 db/migrations/0001_*.sql        reports, images, comments, history
 db/migrations/0002_*.sql        Chat routing grants
 db/migrations/0003_*.sql        PDF attachments
src/app/(app)/bugs/             triage and reporter pages + tests
src/app/(app)/guide/            bug guide only
src/app/actions/bugs.ts         authenticated server actions
src/app/api/bugs/               list and authorised binary routes + tests
src/src/components/bugs/        UI, annotation, coachmark + tests
src/src/domain/bugs.ts          status transitions + tests
src/src/lib/bugs/               browser/pure helpers + tests
src/src/server/bugs/            persistence, access, limits, notifications + tests
reference/                     minimal host adapters, mirroring host paths
 tests/                        extra DB, privacy, shell, e2e and fixtures
 tokens/bug-tokens.css          Sales defaults; map to host colours
 examples/                     shell mount, badges, guide and test wiring
```

The outer `src/` is a kit container. Copy **its contents** into the host root: `src/app` → host `app`, `src/src` → host `src`. Original `@/src/...` and `@/app/...` aliases then retain their Sales meaning. Copy `db/` to host `db/`; the reference schema adapter re-exports it.

Tests stay **colocated as in Sales** wherever their production layer is copied. Tests for external shell/privacy/database seams live under `tests/` mirroring their Sales paths; e2e and fixtures keep `tests/e2e` and `tests/fixtures`. This preserves acceptance criteria without importing the rest of the original CRM. Host-specific test adaptations are enumerated in [CHANGELOG.md](CHANGELOG.md).

Dependencies used by the port: `next`, `react`, `react-dom`, `drizzle-orm`, `postgres`, `server-only`, `zod` and `lucide-react`. Use compatible host versions; the source uses Drizzle 0.45 and Zod 4. Test tooling: TypeScript, Vitest, jsdom, Testing Library, Vite’s React plugin and Playwright. Migration tooling is the host’s responsibility.

If the host uses another ORM or auth stack, replace the adapters and persistence queries together while preserving transaction boundaries, advisory locks, idempotency and ownership checks. Another router needs equivalent server actions/routes and client calls. Another UI library must preserve Dialog focus/keyboard behaviour and floating-layer geometry. Colour mapping alone must not alter the feature’s layout or interactions.

## Limits and security

- The serverless platform’s **4.5 MB request body ceiling** leaves room for multipart framing around a **4 MiB PDF**. Next’s server action parser must also allow the upload (`bodySizeLimit: "5mb"` in the example); raising that parser setting does not raise the platform ceiling. Images and PDFs use separate requests.
- Images accept a source up to **15 MiB**, are resized in the browser to a longest side of **1920 px**, and encoded as WebP with a PNG fallback at **2 MiB maximum**. The server checks actual raster type, dimensions and byte count again. GIF input becomes a still raster; SVG/HEIC are rejected and animation is never uploaded.
- Limits are **5 reports** and **30 comments per user per rolling 10 minutes**, enforced in the database. Images and PDFs share **50 MiB per user per rolling 24 hours**, protected by a per-user advisory lock across processes. Removed attachments still count; idempotent retries do not consume another allocation.
- Every detail and binary read checks a current reporter-or-triager capability before reading attachment bytes. Reporters cannot read another user’s report by guessing an ID. UI visibility is not an authorisation boundary.
- PDF downloads are `Content-Disposition: attachment`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, with CSP `sandbox`. Image reads are authenticated private raster responses with no-store/nosniff. Do not put either behind a public CDN or image optimiser.
- PDF screening is **best effort**. It checks `%PDF-`, length and prohibited PDF names `/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`, `/XFA`, `/RichMedia`, including `#xx`-escaped names and name delimiters. It skips opaque stream bytes and **does not decompress or scan `/ObjStm`**. It is not malware detection or a complete PDF parser.
- Removal nulls live bytes and retains metadata, actor, reason and time. It does not erase backups. Screenshot pixels, free text and PDFs require manual privacy review; a contact scrub counter does not establish that those surfaces contain no personal data.

## Install in order

Use a dedicated host branch and a disposable test database. Never point destructive test fixtures at production.

1. **Survey the host.** Locate authentication/session resolution, effective permission grants, PostgreSQL/ORM, errors/action envelopes, UI primitives, nav polling, floating geometry, time formatting, event/outbox processing and privacy inventory. Compare every module in [INTEGRATION.md](INTEGRATION.md). Preserve the host’s existing conventions at those seams. **Check:** record a mapping for every seam and run the host’s existing typecheck/unit baseline.
2. **Install schema prerequisites.** Map the reference `users`, role grants, events/jobs and optional Chat schema onto host tables. Then merge `db/schema.ts` and apply `0001_bug_reports.sql`, `0002_bug_chat.sql`, `0003_bug_pdf.sql` through the host migration runner in that order. Reference bootstrap SQL is only for a new disposable host, never a replacement for existing tables. **Check:** typecheck schema; run the copied migration invariant tests, then DB tests against a disposable database. Confirm RLS, foreign keys, uniqueness and forbid-delete triggers.
3. **Wire adapters.** Copy only the reference adapters the host needs, preserving their relative paths, or implement their documented interfaces. Bind the auth session to the host’s verified session and effective grants. Map `bugs.report` to reporters and `bugs.triage` to trusted triagers. Add the privacy registry entries. Notifications can remain disabled. **Check:** typecheck adapters and run access, context, permissions and nav-count tests. An unauthenticated actor must fail closed.
4. **Copy the feature.** Overlay `src/` contents into the host root. Keep import aliases pointing to that root. Preserve `db/` location or update its reference re-export. Add the server-action parser setting and Node runtime support. **Check:** host typecheck, pure/domain tests, route/action tests and all bug server tests with a real disposable database; verify same-key retries and shared image/PDF quota races.
5. **Map tokens and UI.** Import `tokens/bug-tokens.css` after the host’s base tokens; override documented colour aliases for the host palette. Bring over UI and shell CSS required by the reference primitives. Do not flatten the widget/annotation/workspace layout into a new design. **Check:** component tests for annotation, dialogs, form, filters, workspace, thread, PDF and coachmark, plus a host typecheck.
6. **Mount once.** Follow [examples/layout-mount.tsx](examples/layout-mount.tsx). Mount one `NavBadges`, the widget (which owns the coachmark and `FloatingActionLayer`) and one `Toaster`. Merge the badge endpoint into an existing host poller instead of adding another. Add permission-scoped navigation and `/guide#report-a-bug` via the other examples. **Check:** shell/geometry tests, guide anchor, mobile More placement and host typecheck.
7. **Verify notifications and privacy.** Optionally connect durable Google Chat delivery and job scheduling; test failures, deduplication and plain safe links. Keep secrets in the host’s secret manager. **Check:** notification tests, privacy tests and manual attachment removal; no hidden dependence on CRM/lead access.
8. **Accept the result.** Adapt synthetic e2e actors to the host’s login fixture and run the copied Playwright scenario against the host. **Check:** host typecheck → portable unit/component tests → DB/server tests → e2e. Finish the visual and behaviour checklist below. A pass in this source kit is not a deployment or production verification.

Use the host’s commands (commonly `npm run typecheck`, `vitest run`, and `playwright test tests/e2e/bugs.spec.ts`); [examples/vitest.config.ts](examples/vitest.config.ts) shows the unit/server split and alias. Do not run integration tests until a disposable database has been provisioned and migrated. If Node 22 exposes an experimental storage global that conflicts with jsdom, run Vitest with `NODE_OPTIONS=--no-experimental-webstorage`. Preserve the synthetic fixture data; never copy source production users.

## Acceptance checklist

Compare the installed UI against the copied component layouts, illustrated guide and the approved host screenshots at desktop, tablet and phone widths. There are no private production screenshots in this public kit.

- [ ] First visit shows the three-step coachmark beside the round FAB; scrolling/focus are unaffected. Got it, Learn more and opening the form persist dismissal. Escape/outside clicks do not silently consume it.
- [ ] FAB clears phone tabs, stacked bars, toasts, keyboard and final page controls; all modals hide it and closing restores it.
- [ ] Summary plus screenshot enables Send, while Summary alone stays disabled; details expand; paste from a focused Summary works. Paste/drop/picker show the same preview and error states. Screenshot capture shortcuts match the OS.
- [ ] Rect/ellipse/arrow/freehand, colours, undo, start over, zoom and scrolling match the source; Send flattens the report while failures preserve its editable draft. Comment image attachments use direct preparation and preview. No upload occurs before submission.
- [ ] PDF boundary is exactly 4 MiB; report/comment and PDF failure/retry are independent. Filenames are safe, downloads are attachments, and all binary routes reject an unrelated reporter before fetching bytes.
- [ ] Workspace status pills, priority, assignee and debounced search retain filters and selection in the URL; keyboard Back/Forward and phone list/detail match desktop semantics.
- [ ] New → In progress/Cancelled; In progress → Done/Cancelled; Done/Cancelled → In progress. Cancellation requires a reason; no-op status creates no history. Only active triagers can be assigned.
- [ ] Text/image/PDF discussion, older-history loading and attachment removal placeholders match. A PDF can never silently disappear from a reply without an error/retry state.
- [ ] Reporter sees only their reports; new triager replies/status activity adds unread dots including terminal reports. Read marks the rendered snapshot only; badges update through a single poller.
- [ ] Guide has three illustrated steps and its anchor works from coachmark and navigation. Host-specific urgent-payment/MD copy has been reviewed.
- [ ] Anonymous access fails; revoked permissions take effect on server requests; database limits, advisory-lock quota, duplicate requests and forbid-delete triggers pass server tests.
- [ ] Optional Chat cards contain safe metadata/links, deduplicate and do not prevent in-app use when disabled.

## History

v1.0.0 was the original Almond extraction at commit `3e39878` (the retired ORM/REST/object-storage design). v2.0.0 replaces it with the Sales R19.1 source and documents all port deviations in [CHANGELOG.md](CHANGELOG.md). Only one feature implementation is shipped.
