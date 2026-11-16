# A10 host contracts

## Choose the variant and paths

Do not overlay this with the root Sales kit: the route names overlap but aliases, database models and APIs differ. Here `@/*` resolves to host `src/*`. Copy this variant's `src/.` into host `src/`; `reference/src/` contains **mergeable utilities**, not a replacement authentication system or complete runnable host. Existing A10 hosts already implement the seams below. New hosts must implement them before typechecking.

Runtime: Next.js 16 App Router, React 19, TypeScript, Node, Zod 4, `@supabase/supabase-js` 2, `server-only`, `lucide-react`, `radix-ui`. Use the host's supported pinned versions; tested source uses Next 16.4.2, React 19.3.0, TypeScript 5.9.3, Supabase JS 2.118.0 and Vitest 5.0.5. Tailwind 4 supplies loading/error utility classes. No root dependency installation is needed for this source kit.

## Explicit host-owned modules

These are the complete external application imports remaining after the included reference utilities are merged:

| Import under `@/` | Required contract |
|---|---|
| `env` | Server-only `env` object: `A10_BUG_CHAT_WEBHOOK_URL?: string`, `A10_PUBLIC_URL?: string`; validate URLs in the host environment schema. Never use NEXT_PUBLIC for service credentials/webhooks. |
| `server/auth/get-viewer` | `Viewer = {employeeId: EmployeeId; clickUpId: PersonId|null; role?:string|null}`; `Session = {viewer:Viewer;csrf:string|null;source:'anga_two'|'dev'}`. Export types, `getSession():Promise<Session|null>`, `getViewer():Promise<Viewer|null>`, `publicOrigin():string|null`. Resolve verified cookies/server sessions and recheck current employee eligibility; do not trust browser IDs. Dev sessions must be disabled in production. |
| `server/access/load-access` | `loadAccess(viewer):Promise<Access>` and `LoadAccess` function type; bug service reads only `Access.isAdmin`. Load current trusted server grants, fail closed. Menu loading additionally needs `isLead`. For ported tests also export `createLoadAccess({queries,lockedUnits})`; adapt to the host's access-test factory. |
| `server/db/client` | `getDb():A10Db`, a server-only service client using schema `A10-task-management`. Preserve `.storage`; queries cast to their local typed BugDatabase. Tests use `createA10Client({url,serviceRoleKey,fetch?})` via the host fake. |
| `server/writes/wiring` | `writesEnabled():boolean`, the host kill switch. Only mutations use it; list search remains readable while writes are paused. |
| `features/topbar/page-topbar` | `PageTopbar({title:string,children?:ReactNode})`; map to existing page header. The task app's notification bell/timer are intentionally not bundled. |
| `features/shell/client/error-screen.client` | `useErrorScreen(error:unknown,screen:string,retry:()=>void):()=>void`; host retry/telemetry adapter. Do not send report content or raw credentials to telemetry. |
| `components/ui/button` | `Button` accepts normal button props and `variant='outline'`; preserve keyboard/focus styling. |
| `components/ui/skeleton` | `Skeleton` accepts div props/className; loading placeholder. |
| `domain/model` (tests only) | Branded string types `EmployeeId`, `PersonId`, consistent with Viewer. |
| `server/db/fake-db` (tests only) | `createFakeDb(responses,{orderAndLimit?})` returns `{db,requests,writes}`; use real supabase-js with an in-process fetch. Apply actual eq/in/ilike/not/or filters, ordering, cursor bounds and mutable arrays; missing tables return PGRST205, missing functions PGRST202. See VERIFICATION.md. |
| `server/db/access-queries` (tests only) | `createAccessQueries(fake.db)` feeds the host `createLoadAccess` factory. The synthetic fixtures provide `a10_admins`, `a10_leads`, `people`, `unit_access`, `workspaces`, `workspace_access`, `accounts`; no production data is needed. |

`reference/src/server/auth/request-gate.ts` and `errors.ts` are real A10 gate/error implementations. Merge the `sameSecret` timing-safe comparator into the host helper; **do not replace its cookie machinery** with the narrow reference file. Its gate validates Origin, fetch-site and body content type; writes also compare `x-a10-csrf` with the session. Preserve authenticated checks before service calls. The client reads the CSRF token once from host `GET /api/session`, returning `{csrf:string|null}` with no-store; never expose session cookies or service keys there.

`reference/src/domain/person-name.ts` includes only the name formatting and initials used by bugs. Likewise `reference/src/server/media/images.ts` contains only `sniffImage`; merge these exports into existing modules rather than replacing unrelated exports. Other reference files are reusable select/search, current-directory name loading, paged reads and visible polling.

## Employee directory and developer grants

`people` must provide `id`, nullable `clickup_id`, `name`, nullable `full_name`, `nickname`, `email`, and `fetched_at`. `employee-names.ts` reads ordered pages; current employee labels win over stored report/comment/history labels. Only roster identity keys grant developer authority. Keep `BUG_FIXERS` configured on a reviewed server-owned branch; it is an empty array in the public kit. Persist actor keys with the `anga_two:` namespace, or change every parser, SQL constraint, query and test together.

**Assignment does not grant access by itself.** The configured roster grants triage; setting a report's assignee column is not an authorization mechanism. An admin outside the roster may triage but cannot be selected as an assignee. A Lead outside the roster sees the menu but remains an ordinary reporter.

## Database and Storage

Review the supplied SQL; create/use the intended custom schema and expose it to the server's PostgREST client. Its three tables and two SECURITY INVOKER RPCs grant access only to service_role, revoke public/anon/authenticated and enable RLS. The private `a10-bug-reports` bucket has no public client policy. Server code authorizes before any report/image response; no service key reaches a client module. The original SQL is additive but assumes schema/roles/Storage already exist. Do not apply twice blindly to an existing A10 installation; use its migration inventory. There is no new inbox table or migration for assigned-to-me: it uses `assignee_key`.

All screenshot/comment uploads are multipart requests through the authenticated API; storage paths are server-generated. Keep platform body limits above a 4 MiB image plus 64 KiB metadata/framing allowance. No signed direct upload or Sales PDF/action parser config applies here.

References: [custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas), [Storage uploads](https://supabase.com/docs/reference/javascript/storage-from-upload). The extraction retains current source semantics rather than generating a new database access system.

## Routes

All endpoints authenticate. Dynamic IDs are validated UUIDs; unknown/invisible reports return 404. Expected failures use `{error,code,retryable}`; missing schema reports 503 BUGS_NOT_SET_UP.

| Method / path | Operation |
|---|---|
| POST `/api/bugs` | Create multipart report (201 `{id}`), CSRF/write gate. |
| POST `/api/bugs/search` | Read filtered page; same-origin JSON, **no CSRF/write gate**. `mine`, `assigned_to_me`, status, priority, q, cursor, limit. |
| GET `/api/bugs/counts` | New + own unread counts. |
| GET `/api/bugs/assignees` | `{people}` from configured developers; triage only. |
| GET `/api/bugs/[bugId]` | Authorized detail with `can_triage`. |
| POST `/api/bugs/[bugId]/update` | Status/priority/assignee/note; triage + CSRF/write gate. |
| POST `/api/bugs/[bugId]/read` | Reporter-only read acknowledgment + CSRF/write gate. |
| POST `/api/bugs/[bugId]/comments` | Text/image multipart comment; reporter or triager + CSRF/write gate. |
| GET `/api/bugs/[bugId]/screenshot` | Authorized private screenshot. |
| GET `/api/bugs/[bugId]/comments/[commentId]/image` | Authorized private comment image bound to parent report. |

The optional catch-all page accepts only `/bugs` or one UUID `/bugs/<id>`. Next typegen must run before tsc for its `PageProps` type. Unknown paths call notFound. Its service is called directly, never through its own API.

## Shell, navigation and CSS

Use `examples/shell.client.tsx`. Server-load `isAdmin`, `isLead` and viewer employee ID, then call the shared navigation helper in both desktop and mobile menu placement. Keep one active badge instance to avoid duplicate pollers. Exact A10 desktop visibility is admin OR Lead OR configured developer. Ordinary reporters keep the FAB and may open `/bugs` directly. Never widen triage in order to show a menu.

Feature tabs and triage controls are already implemented in `BugsPage`/`BugDetailView`: do not replace them with stub menus. `SearchSelect` and its options/CSS are bundled so assignee/priority menus retain search, keyboard navigation and disabled behavior.

`BugBadge` originally uses the host `.sb-count`; supply its small pill styling when the host lacks it. Poll begins after four seconds, then every two minutes while visible; `a10:bug-counts` refreshes after changes. The first-use tip only stores `a10.bug-tip-seen.v1`; report/image drafts stay in component memory.

Feature CSS expects a bounded main content column: the page and list/detail panes flex within the shell, with `min-height:0`, internal scroll and mobile clearance. Check 390/768/1024/1440/1920 widths and keyboard/modal behavior. Preserve the supplied stylesheet; map colours through `tokens/a10-bug-tokens.css`, using host font variables or its system fallbacks. Desktop/mobile navigation should keep the host's existing accessible link/focus classes. The tested Next 16.4.2 error boundary passes `retry`, matching the source export. Check the installed Next API if adapting another version (see SOURCE.md).
