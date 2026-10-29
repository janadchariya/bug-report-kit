# Integration seams

Copy `reference/.` into the host root, then copy `src/.` over it. The outer
`src/` in this kit is a packaging directory: its `app/` and `src/` children
become the host's `app/` and `src/`. Copy `db/schema.ts`, `db/migrations/`,
`tokens/` and `tests/` into the matching host directories. Keep the `@/*` alias
pointing to the host root. Merge existing files; do not overwrite the host's
session, users, navigation or design system without surveying them first.

`reference/` is a complete small host implementation, rather than a second
bug feature. Its exports close every external import in the feature and its
ported tests. It includes real Postgres persistence, hashed expiring sessions,
capability loading, UI primitives, nav polling, audit writes, privacy hooks and
an optional durable webhook delivery queue. No user or credential is seeded.
A host with these systems already should implement the contracts below using
its own systems. The feature itself preserves the Sales implementation; the
public substitutions and test adaptations are enumerated in `CHANGELOG.md`.

## Runtime and installation contract

The reference assumes Node.js, Next.js 16 App Router, React 19, TypeScript,
`drizzle-orm`, `postgres`, `zod` 4, `lucide-react` and `server-only`.
Use the host's supported exact versions. Tests additionally use Vitest, jsdom,
Testing Library, Playwright and `tsx`; Drizzle Kit is useful for integrating
schema changes. There is deliberately no package manifest in the kit.

Add this option to the host's existing `next.config.ts`:

```ts
experimental: { serverActions: { bodySizeLimit: '5mb' } }
```

Keep the platform request ceiling in mind: a PDF is limited to **4 MiB**, leaving
multipart overhead below a 4.5 MB serverless body ceiling. The framework limit
is 5 MB so Next does not reject valid multipart requests earlier; it cannot
raise the deployment platform limit. The image and PDF are
saved in separate requests. Preserve Next's same-origin server-action checks;
any reverse proxy must preserve the expected origin/host relationship. All
binary handlers use the Node runtime and private authenticated routes.

Import `tokens/bug-tokens.css` and `src/components/ui/primitives.css` once from
the root layout. The latter includes the source reset, body typography, focus
ring, shared `.page` headings and `.app-main` scroll clearance; merge those
base selectors with the host’s existing reset rather than dropping them. Feature CSS imports itself. Map colours through the variables
in `TOKENS.md`; preserve layout, type sizes, spacing, focus and touch targets.
The reference UI components implement the class names the feature expects.
Replacing a component with an unstyled wrapper changes the shipped UX.

## Database, transactions and storage

`@/src/server/db/client` exports `db`, `Db`, `Tx`, `DbOrTx` and `closeDb()`.
`db` is `PostgresJsDatabase<typeof schema>`; `Tx` is its transaction callback
argument; `DbOrTx = Db | Tx`. The feature uses Drizzle selects, inserts,
updates, row locks, transactions and raw SQL; it is not a generic repository
interface. `createSqlClient(url: string, max?: number)` returns a `postgres`
client with prepared statements disabled. Use a compatible session connection
or pool; transaction-scoped advisory locks must remain on one transaction.
`pgErrorCode(error: unknown): string | null` exposes SQLSTATE only.

The canonical bug schema is `db/schema.ts`. The reference alias
`src/server/db/schema/bugs.ts` re-exports it. Its imports of `users` and
`sql-helpers` are deliberate seams. `inList(column, values)` and
`nullOrInList(column, values)` return Drizzle SQL expressions. A schema barrel
must export the bug tables and each reference/host table used by your tests.

For a new, **empty** reference database, copy the reference files first and run
`npx tsx scripts/migrate-bugs.ts`. It applies `db/0000_host_dependencies.sql`
then the three feature migrations in one transaction, with an advisory lock
and a migration journal. The bootstrap is generated from the included host
schemas and adds `public.forbid_delete()` and `public.forbid_truncate()`.
The migration runner is for this empty reference schema: existing hosts must
merge these prerequisites through their established migration system.

The three feature SQL files retain their source SQL, including existing Chat
kind/subject constants and the `sales_crm.test_truncate` test setting. No
host-only SQL references were removed. Therefore, before `0001`, supply the
`users` table and both public guard functions; before `0002`, supply
`chat_messages` and its two named CHECK constraints. The bootstrap supplies
these. `0003` adds the PDF table and pending-PDF comment state. Do not generate
only a Drizzle schema push: that omits the feature's trigger functions.

Reference host schema exports are:

| Module under `src/server/db/schema/` | Exports / role |
|---|---|
| `users` | `users`, `authSessions`, `UserRow`, `NewUserRow`, `AuthSessionRow`. Users have UUID `id`, `email`, `displayName`, nullable `nickname`, string-array `roles`, `status`, `loginMethod` and timestamps. Sessions contain a SHA-256 token hash, expiry, absolute expiry and revocation. |
| `role-permissions` | `rolePermissionVersions`, `RolePermissionVersionRow`: monotonically versioned JSON grants, reason, optional creator and timestamp. |
| `events` | `events`, `fieldChanges`, `EventRow`, `FieldChangeRow`: bug audit events contain IDs/statuses, rather than report or comment text. |
| `jobs` | `outboxJobs`, `cronHeartbeats`, their row types: durable queue, attempts, leases, availability and terminal state. |
| `chat` | `chatSpaces`, `chatWebhooks`, `chatMessages`, `chatActionTokens` and row types: recipient bindings, encrypted credentials with revisions, dedupe keys, delivery state. Action tokens exist for compatibility regression tests; bug cards never mint them. |
| `crm` | Minimal synthetic `accounts`, `contacts`, `leads`, `AccountRow`, `ContactRow`, `LeadRow`. These support privacy/e2e fixture context, not bug runtime. Map to the host or omit those fixtures if it has no customer records. |
| `calendar`, `calendar-feeds` | `calendarEvents`, `calendarFeeds` and row types, used only to prove the Chat CHECK migration preserves pre-existing rows. They are not needed by bug runtime. |

UUID staff IDs must be stable, not emails. Keep the users foreign keys and
`restrict` deletion behavior. All bug tables enable RLS and have no public
client read policy; use a server-only owner/service connection and never
expose it to the browser. If the host uses a non-bypass RLS connection, add
its explicit server policy while retaining application authorization.
Attachments are `bytea` in Postgres. There is no object-storage bucket,
signed upload URL, Prisma client or browser-accessible file URL to configure.

Transactions are security boundaries. Keep actor reloading, report row locks,
rate-limit and shared image/PDF advisory locks inside the same transaction.
Do not split `createBug`/comment/PDF audit and queue writes across connections.
Limits are five reports and 30 comments per ten minutes; all image/PDF uploads
share 50 MiB per user per 24 hours. Removal clears bytes but retains quota and
audit metadata. Never replace the shared quota with a client check.

## Authentication and effective permissions

```ts
interface Actor {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly nickname: string | null;
  readonly roles: ReadonlySet<Role>;
  readonly permissions: ReadonlySet<Permission>;
  readonly loginMethod: 'workspace' | 'personal_google';
  readonly sessionId: string | null;
}
loadActorByUserId(db: DbOrTx, userId: string): Promise<Actor | null>
loadActorFromSessionToken(token: string, now: Date): Promise<Actor | null>
requireActor(): Promise<Actor>
requireActorOrRedirect(permission?: Permission | readonly Permission[]): Promise<Actor>
assertCan(actor: Pick<Actor, 'permissions'>, permission: Permission): void
can(actor, permission): boolean
canAny(actor, permissionOrList): boolean
```

The session adapter reads `SESSION_COOKIE_NAME = 'bug-kit.session-token'` and
looks up its SHA-256 hash. It rejects expired, revoked and inactive sessions.
The host's verified sign-in flow may call
`createDatabaseSession(userId, now): Promise<{ sessionToken: string }>` and set
that cookie with HttpOnly, SameSite=Lax, Path=/ and Secure on HTTPS. The kit
does not supply sign-in or an HTTP session-minting endpoint. Map this seam to
an existing auth library by resolving its verified identity to a local UUID.
Never accept an actor, role, email or user ID from form fields as identity.

`requireActorOrRedirect` sends an absent session to `/signin`; a missing page
capability becomes a 404. API handlers use `requireActor` and the shared error
classes. Recheck active status and grants from the database in
`loadActorByUserId`; returning a cached session's old roles defeats revocation
checks before reading image/PDF bytes.

The feature checks **`bugs.report`** (create and view one's own reports) and
**`bugs.triage`** (workspace, any report/thread, assignment, status/priority,
sensitive attachment removal). They are independent capabilities: triage does
not imply permission to create reports or use the Mine view. Reporter reads
require both ownership and `bugs.report`. A delegated triager is as eligible
as an administrative role. Do not replace these checks with `isAdmin` or with
a lead/CRM permission.

The reference `USER_ROLES` exports `md`, `system_admin`, `finance`, `bd`, `am`,
`intake_admin`, `external_referrer`, `seller_assist`; `Role` is their union.
These are sample role identifiers retained to exercise source semantics.
Every role defaults to `bugs.report`; `md` and `system_admin` also default to
`bugs.triage`. `PERMISSIONS` also types `lead.work_own`, `lead.submit` and
`lead.claim_from_pool` for negative authorization fixtures; those have no
default grants in this reference. Do not create those roles in a host that
already has a role model: map host roles to the two bug permissions instead.

`RolePermissionMatrix = Readonly<Record<Role, ReadonlySet<Permission>>>`.
`DEFAULT_ROLE_PERMISSIONS`, `resolveMatrix(stored: unknown)`,
`permissionsFor(roles, matrix)` and `toGrants(matrix)` implement current grants.
`loadCurrentRolePermissions(db)` returns `{version, matrix}`;
`loadRolePermissionMatrix(db)` returns the matrix. `latestGrantsSql` projects
the latest snapshot during actor loading. Adapt both actor and staff-list
loading together when replacing this with a host permissions service.
Unknown roles must grant nothing; inactive users must return `null`.

## Actions, errors, audit and logs

Both guard and logging modules export:

```ts
withAction<TInput, TOutput>({
  schema: z.ZodType<TInput>,
  permission: Permission | null,
  handler: (input: TInput, actor: Actor, correlationId: string) => Promise<TOutput>
}): (raw: unknown) => Promise<ActionResult<TOutput>>
```

The logging version additionally accepts `actionName: string`. `permission:
null` still authenticates; the command then checks report ownership/capability.
Keep the client result envelope: success is `{ok:true,data}`; failure is
`{ok:false,code,correlationId,reasonCode,currentVersion?}` with codes
`unauthenticated`, `forbidden`, `invalid_input`, `rule`, `stale_state`,
`internal_error`. Do not throw uncaught expected validation errors into Next's
production action error masking.

`AuthenticationError(reasonCode)`, `AuthorizationError(reasonCode)`,
`DomainRuleError(code)`, `StaleStateError(currentVersion)` and
`ValidationError(issues: readonly {path:string;code:string}[])` preserve the
source contracts. Map host failures to these classes, not raw DB messages.
`safeErrorClass(error: unknown): string` never reads the error message.
`logger.debug/info/warn/error(fields: {event:string;correlationId?:string;
[key:string]:unknown}): void` redact unsafe fields and values. Keep report
text, form bodies, query strings, bytes, credential URLs and raw exceptions
out of logs.

`actorRef(actor, via?: 'web'|'google_chat'): ActorRef` and
`appendEvent(dbOrTx, {type,subjectType,subjectId,actor,payload?,reason?,
correlationId,occurredAt}): Promise<string>` write inside the mutation
transaction. The eight `EventType` values are `bug.reported`, `bug.commented`,
`bug.status_changed`, `bug.priority_changed`, `bug.assignee_changed`,
`bug.image_removed`, `bug.pdf_attached`, `bug.pdf_removed`;
`SubjectType` is `bug_report`. If mapping to an existing audit system,
preserve these identities and the transaction, and retain payload privacy
validation. Screenshots, PDF filenames and source free text are not audit
payload fields.

## Shared UI, shell and formatting

| Module | Required interface |
|---|---|
| `ui/button` | `Button: forwardRef<HTMLButtonElement, ButtonProps>`; normal button attributes, `variant?: 'primary'|'secondary'|'ghost'|'critical'|'ai'`, `size?: 'sm'|'md'`; defaults `type='button'`. |
| `ui/dialog` | `Dialog({children,open,onOpenChange,title,description?,className?,dismissible?,returnFocusRef?})`. Body portal, focus trap, initial focus, focus return, Escape, dismissibility and `data-refresh-hold` are behavioral requirements. `returnFocusRef` targets `HTMLElement|null`. |
| `ui/toaster` | `showToast({text:string,href?:string}): void`; mount `Toaster()` once. The reference event name is public/generic. |
| `ui/avatar` | `Avatar({name:string,size?:'sm'|'md'|'lg'})`; initials and accessible name. |
| `shell/floating-action-layer` | `FloatingActionLayer({children})`; observes modal visibility, keyboard viewport, `[data-shell-bottom-obstruction]` and `[data-shell-action-footprint]`, and sets shell clearance variables. The widget uses this itself; do not wrap it in a second layer. |
| `shell/nav-badges` | `NavBadges({enabled:boolean,children})`, `useRefreshNavCounts(): ()=>void`, `useNavBadges(): {counts,pollResult}`, `NavBadge({badgeKey?})`, `NavBadgeDot({badgeKeys,className?})`, `navBadgeCount(counts,badgeKey?)`. Keys include `bugNew`, `bugUnread`; existing `today`/`pool` slots remain zero in the reference API. |
| `shell/auto-refresh` | `AutoRefresh({intervalMs?:number})`. Test seam: a host auto-refresh must honor dirty fields, `[data-refresh-hold]`, managed draft markers, offline/hidden state and transient badge polling failures. |
| `shell/nav-items` | `NAV_ITEMS`, `NavItem`, `filterNavItems(items, allowed)`, `isNavItemActive(pathname,href)`. Keep `/bugs/mine` excluded from `/bugs` active matching. |
| `shell/sidebar`, `shell/tab-bar` | `Sidebar({items,displayName,roleLabels,signOutAction})`, `TabBar({items})`; minimal shell adapters place Mine in the user menu and both bug routes in mobile More. Merge into existing shell destinations. |
| `lib/locale-time` | `formatBangkokDate(at:Date): string`, `formatBangkokDateTime(at:Date): string`. Shipped Thai locale, Gregorian year, Asia/Bangkok time zone; substitute the host locale deliberately. |
| `lib/normalize` | `normalizeText(value:string): string`; NFKC, trim, collapse whitespace. `normalizeCompanyName(raw)` is a synthetic CRM fixture helper. |

Supporting `badge`, `bottom-sheet`, `icon-button`, `tooltip`,
`tooltip-focus`, `overlay-bounds` and `lib/overlay-position` close the dialog
and shell imports. They are included so modal keyboard behavior works without
an external component library. The exported primitive names and CSS class
contracts should remain aligned when mapping a design system.

The reference `/api/nav-counts` authenticates, calls `bugNavCounts` and
returns exactly `{awaitingClaim:0,overdue:0,poolAwaiting:0,bugNew,bugUnread}`
with `private, no-store`. Merge bug counts into an existing endpoint if one
already exists; the copied poller validates all five nonnegative integers.
Keep one shared poller, refresh after mutations and on read acknowledgment,
and preserve unread dots for terminal reports. Mount the FAB only for
`bugs.report`, using `canReportBugs` on `BugReportWidget`.

`app/(app)/guide/content.ts` exports only `REPORT_A_BUG_GUIDE`, whose title,
summary, three `{title,description,caption}` steps and two
`{title,description}` callouts are consumed by the unchanged relative
`./content` import. Mount `BugGuide` in the host's guide page; preserve the
`#report-a-bug` anchor for coachmark/help links.

## Optional Google Chat delivery

With **no active personal webhook bindings**, the reference queues no Chat
messages and the bug workflow works fully. An active encrypted binding enables
live delivery automatically; there is no copied webhook URL or default
credential. `BUG_CHAT_PAUSED=true` pauses enqueue and delivery. `AUTH_SECRET`
(32+ characters, supplied by the host secret manager) seals configured URLs.
`APP_URL` is the trusted absolute application origin for card links;
`NEXT_PUBLIC_APP_URL` is an optional fallback. Neither comes from captured
browser context. Set the origin explicitly outside local development.

The minimal contracts are:

```ts
type BugChatMessageKind = 'bug_reported'|'bug_replied'|'bug_status_changed';
type ChatDestination =
  | {transport:'chat_api';spaceName:string}
  | {transport:'webhook';spaceName:string;webhookId:string;
     webhookRevision:number;webhookIdempotency:'message_id'|'none'};
resolveChatDestination(db, userId, {webhookOnly?:boolean, provider?}?):
  Promise<ChatDestination|null>;
enqueueChatMessage(tx, {kind,recipientUserId,subjectType:'bug_report',subjectId,
  occurrence,payload,destination?,now,correlationId}):
  Promise<{chatMessageId:string|null;created:boolean}>;
scheduleImmediateDrain(correlationId:string): void;
drainJobs(limit?:number): Promise<void>;
```

`CHAT_MESSAGE_KINDS`, `CHAT_MESSAGE_SUBJECT_TYPES`, `NOTIFICATION_BY_KIND`,
`BUG_CHAT_MESSAGE_KINDS`, `isBugChatKind` and `chatDedupeKey` preserve the
source CHECK/dedupe semantics. The nonbug constants retained here allow the
unchanged `0002` migration and its retained-row regression test to coexist;
they do not implement other application features. `ChatProvider` exposes a
`mode`, and `getChatProvider()` returns a dormant synthetic provider; bug
notifications always request `webhookOnly:true` and never activate the legacy
Chat API fallback.

The queue adapter validates the strict bug projection and stores only IDs,
server-derived fallback title, status and audience. No summary, description,
comment, image, PDF or captured URL appears on a card. Dedupe is by kind,
subject, occurrence and recipient. New reports go to other active effective
triagers; real triager replies and status changes go to the reporter. Own
activity, metadata-only edits and missing/broken/disabled bindings send none.
Delivery rechecks user activity, capability, parent/event/audience and current
credential revision before sending. Bug cards contain ordinary links and
never issue action tokens or schedule PATCH repair jobs.

`WebhookTransport = {mode,send({url,body,messageId}):Promise<WebhookOutcome>}`
is injectable. `handleChatMessageSend(job,now,provider?,{transport?})` handles
this outbox job; `handleChatMessageUpdate(job,now)` records unsupported repair
rather than sending. `ClaimedJob` contains job ID/type/aggregate, payload,
dedupe key, attempt count and lease identity/expiry. `enqueueJob(tx,input)`
deduplicates durable scheduling. `scheduleImmediateDrain` uses Next's
`after()`; add a **protected scheduled host worker** calling `drainJobs` so a
missed wake-up or retry still delivers. Never expose an unauthenticated drain
route. Replace both queue and worker with the host's durable jobs system if
it has one.

`sealSecret(value,purpose,userId,secret)` and
`openSecret(envelope,purpose,userId,secret)` use authenticated encryption bound
to purpose and owner. Reference envelopes use a new kit-specific derivation;
do not copy encrypted production bindings into this kit. Configure fresh
bindings through a trusted host administration flow. The reference retains
the source cohort predicate (active workspace users with sales/staff role
identifiers); map `needsChatSpacePredicate()` to the host's actual messaging
eligibility if those roles differ. It must never broaden bug read permission.

To disable Chat explicitly, replace **only reference seam exports** with
`resolveChatDestination = async () => null`,
`enqueueChatMessage = async () => ({chatMessageId:null,created:false})`, and
`scheduleImmediateDrain = () => {}`. Keep exported types/constants so feature
and projection tests compile. Skip only optional delivery integration tests;
run all authorization, binary, quota and UI tests. Another notification stack
can implement these contracts and use its own durable queue; preserve the
private projection and revocation behavior.

The one intentional public-service hostname, `chat.googleapis.com`, is the
Google Chat API allowlist in `reference/src/server/google-chat/webhook-client.ts`.
It is a standard endpoint validation constant, not a stored webhook. Synthetic
transport tests use `chat.example.test` and cannot perform live delivery.

## Privacy integration

`reference/src/server/privacy/scrub.ts` exports `CONTACT_PRIVACY_STORES`,
`PRIVACY_MARKER`, `ContactPrivacySubject`, `ScrubCounts` and
`scrubContactCopies(tx, subject): Promise<ScrubCounts>`. Register every bug
store in the host's erasure registry: summary, details, path/query and user
agent; comment body; status-change reason; image removal reason; PDF filename
and removal reason. Keep user IDs, statuses, dates and evidence metadata as
retained facts.

The reference scans the bug stores in bounded batches for strong supplied
channel identifiers, applies `[redacted]` within DB text bounds, and resets
matched location fields to `/` or an empty query. Its scope is bug copies;
it does not replace a host's CRM identity graph or whole-application erasure
workflow. Merge these entries into the host scrubber and use its existing
name/identifier normalization. `personalTextVariants` are counted as dropped
in this minimal adapter because names cannot safely be attributed to arbitrary
bug reports without that graph.

Images and PDFs are classified **manual**. Their bytes, filenames and removal
reasons are never silently rewritten by text erasure. Matching metadata adds
a manual follow-up; staff must inspect evidence through the authorized UI
and remove sensitive attachments with a reason. OCR and PDF redaction are not
provided. Keep this distinction in the host's erasure runbook.

## Tests and harness seams

Tests beside `src/src/**` and `src/app/**` stay beside their production layer
when copying `src/.` into the host. Supplementary DB/privacy/shell tests are
under `tests/src/**`, and browser tests under `tests/e2e/**`. They test the
reference interfaces; rebind fixtures to the host without changing expected
security or UX behavior. The port's migration tests use synthetic previous
CHECK fixtures rather than copying the host's entire migration snapshot
history.

Reference helpers provide `buildTestActor(userId):Promise<Actor>`,
`createUser`, `createAccount`, `createContact`, `createLead`,
`setRolePermissions(overrides,{at?,reason?}?)`, `asActor(user,fn)` and
`nextHeadersMock`. `renderApp(ui)` wraps Testing Library; `src/test/setup.ts`
installs jest-dom/cleanup and matchMedia; `server-only.ts` is the test alias.
Use jsdom only for UI suites; use Node for DB/server suites. Keep
`NODE_OPTIONS=--no-experimental-webstorage` on Node versions that expose a
conflicting unfinished `localStorage` global.

`truncateAll()` calls `assertLocalDatabaseUrl` before touching the database:
only loopback hosts, an environment of local/test, and a database name
containing test/e2e are accepted. It truncates only the known kit/reference
tables inside a transaction after setting the SQL guard's test flag. Do not
point these fixtures at staging or production, and do not remove the guard
to make tests pass. `pgErrorCode` supports DB constraint assertions.

The Playwright harness exports `test`, `expect`, `Page`, `Locator`,
`createHydratedContext` and `createHydratedPage`, preserving the hydration
barrier. `signInAs(page,email,issuedAt?)` invokes a **local test-only CLI** that
looks up an existing `@example.test` user and creates its hashed database
session. `seedScenario('r19-bugs',options?)` invokes the copied synthetic
`runR19Bugs` fixture through another local CLI; it supports create, inspect
and cleanup. Set `PLAYWRIGHT_BASE_URL` and `DATABASE_URL` in the runner/CI.
No auth bypass endpoint ships or is necessary. The copied existing-settings
browser case also expects a synthetic `admin@example.test` user with host
settings permission; the isolated bug scenario creates only reporter, stranger
and triager. Seed that administrator through the host test setup, or map that
case to the host’s existing synthetic administrator.

The browser suite also checks source-host onboarding, existing lead pages,
navigation and save-bar obstructions. A different host must supply equivalent
fixtures, map those selectors and mount the source-independent bug screens;
those existing application screens are not features of this kit. Its tests
must retain paste/drop/pick, annotation pixels/undo, PDF/thread, selection URL,
unread, permission and obstruction acceptance assertions. Do not claim the
entire host browser suite passes merely because feature unit tests pass.

## Copy you will want to change

These are shipped defaults, not private customer data. Change them during
host installation deliberately; record host-specific feature edits in that
host's review.

| Location | Exact default / adaptation |
|---|---|
| `reference/app/(app)/guide/content.ts` | Title **`Urgent payment issues`**; description **`เรื่องด่วนเกี่ยวกับค่าคอมมิชชันหรือการจ่ายเงิน ให้ติดต่อ MD โดยตรง ไม่ต้องรอ bug report`**. This original urgent commission/payment escalation remains intact. Replace MD and the escalation route with the host's actual support policy. |
| Same guide, first step caption | **`ปุ่มกลมสีม่วงมุมขวาล่าง มีทุกหน้า — กดเพื่อเปิดฟอร์มแจ้งปัญหา`**. It says the button is purple; update if host tokens choose another colour. |
| `src/app/(app)/guide/bug-guide.tsx` | Generic public kicker **`App · Guide`**, plus **`Every page`**, **`Report a bug`**, **`My bug reports`**, **`Everyone`**, **`Steps`**. Replace app label if desired; illustrations are synthetic HTML/CSS. |
| `src/src/lib/bugs/context.ts` | Source route allowlist includes `/leads`, `/accounts`, `/md`, `/sales`, `/today`, `/settings` and role guide paths. Replace this allowlist and allowed query keys with actual host routes. Never replace it with unfiltered URL/query capture. |
| `src/src/components/bugs/bug-detail.tsx` | **`https://github.com/example/host-app/commit/`** is the public placeholder for a build commit link. Supply the host repository URL or remove linking if builds are private. |
| UI/domain labels throughout feature | English **`Bugs`**, **`My bug reports`**, **`Summary`**, **`+ Add details`**, **`Send`**, statuses **`New`**, **`In progress`**, **`Done`**, **`Cancelled`**, priorities/assignee labels, and Thai hints/error/help text are intentional copied UX. Translate as a complete flow if the host locale differs. |
| `reference/src/lib/locale-time.ts` | Thai month/date formatting and Asia/Bangkok are a locale default, not a required host time zone. |
| Reference auth/shell/Chat | `/signin`, `/today`, role identifiers (`md`, `bd`, `am`, etc.), **`Open report`**, **`User menu`**, **`Sign out`** and test base `http://127.0.0.1:3000` are mapping points. Existing host sign-in/navigation should own these. |

The help text's three-step descriptions, support invitation and annotation/PDF
limits otherwise stay as shipped. No real people, customers, user emails,
project IDs, deployment IDs, environment values or webhook credentials are
included.

## Direct import inventory

Counts below are **import statements**, not imported symbols: production and
schema imports are in Runtime; colocated plus supplementary/fixture imports
are in Tests. Repeated imports from one file count separately. Dynamic test
mocks and transitive reference-to-reference imports are excluded. The
`./content` guide seam has one runtime import in addition to this alias table.
All alias modules have a matching path under `reference/`.

| Import module | Runtime | Tests |
|---|---:|---:|
| `@/src/components/shell/auto-refresh` | 0 | 3 |
| `@/src/components/shell/floating-action-layer` | 1 | 0 |
| `@/src/components/shell/nav-badges` | 5 | 1 |
| `@/src/components/shell/nav-items` | 0 | 1 |
| `@/src/components/shell/sidebar` | 0 | 1 |
| `@/src/components/shell/tab-bar` | 0 | 1 |
| `@/src/components/ui/avatar` | 1 | 0 |
| `@/src/components/ui/button` | 9 | 0 |
| `@/src/components/ui/dialog` | 3 | 0 |
| `@/src/components/ui/toaster` | 1 | 1 |
| `@/src/lib/locale-time` | 4 | 0 |
| `@/src/lib/normalize` | 0 | 1 |
| `@/src/lib/permissions` | 1 | 2 |
| `@/src/lib/roles` | 2 | 0 |
| `@/src/server/auth/actor` | 9 | 7 |
| `@/src/server/auth/guard` | 7 | 2 |
| `@/src/server/auth/permissions` | 2 | 0 |
| `@/src/server/auth/role-permissions` | 1 | 1 |
| `@/src/server/crypto/sealed-secret` | 0 | 2 |
| `@/src/server/db/client` | 14 | 15 |
| `@/src/server/db/connection` | 0 | 3 |
| `@/src/server/db/errors` | 0 | 1 |
| `@/src/server/db/schema` | 0 | 4 |
| `@/src/server/db/schema/calendar` | 0 | 1 |
| `@/src/server/db/schema/calendar-feeds` | 0 | 1 |
| `@/src/server/db/schema/chat` | 0 | 3 |
| `@/src/server/db/schema/crm` | 0 | 1 |
| `@/src/server/db/schema/events` | 0 | 2 |
| `@/src/server/db/schema/jobs` | 0 | 2 |
| `@/src/server/db/schema/role-permissions` | 0 | 2 |
| `@/src/server/db/schema/sql-helpers` | 1 | 0 |
| `@/src/server/db/schema/users` | 3 | 6 |
| `@/src/server/env` | 0 | 2 |
| `@/src/server/errors` | 14 | 7 |
| `@/src/server/events/append` | 2 | 1 |
| `@/src/server/events/types` | 1 | 0 |
| `@/src/server/google-chat/action-tokens` | 0 | 1 |
| `@/src/server/google-chat/deliver-job` | 0 | 2 |
| `@/src/server/google-chat/enqueue` | 1 | 0 |
| `@/src/server/google-chat/model` | 1 | 3 |
| `@/src/server/google-chat/provider` | 0 | 2 |
| `@/src/server/google-chat/recipients` | 1 | 1 |
| `@/src/server/google-chat/webhook-client` | 0 | 2 |
| `@/src/server/jobs/drain` | 1 | 1 |
| `@/src/server/jobs/outbox` | 0 | 2 |
| `@/src/server/logging/action` | 1 | 0 |
| `@/src/server/logging/logger` | 4 | 1 |
| `@/src/server/logging/redact` | 3 | 0 |
| `@/src/server/privacy/scrub` | 0 | 1 |
| `@/src/test/render` | 0 | 1 |
| `@/tests/fixtures/actor` | 0 | 9 |
| `@/tests/fixtures/as-actor` | 0 | 1 |
| `@/tests/fixtures/factories` | 0 | 13 |
| `@/tests/fixtures/role-permissions` | 0 | 8 |
| `@/tests/setup/truncate` | 0 | 13 |

The source browser tests also import relative harness modules `./fixtures`,
`../fixtures/auth`, `../fixtures/scenarios`; these are provided under
`reference/tests/`. Supporting referenced modules (`sessions`, cookie constant,
SQL helpers, UI overlay helpers, settings resolve, notify placeholder, hydration
barrier, migration/reset scripts) live beside their consumers in `reference/`.
The `settings/resolve` and `notify/notify` test mocks preserve optional service
seams without introducing unrelated business services.
