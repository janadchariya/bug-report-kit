# Bug Report Feature Kit

A complete, portable in-app bug-reporting feature extracted from a production
Next.js (App Router) + Prisma + TypeScript expense system. This folder is
designed to be handed to an AI coding agent (Claude, Cursor, Codex, etc.)
together with the instruction: **"Install this feature into my project,
following this README."**

The code is NOT an npm package. It is real application source, organized by
layer, meant to be copied into the target project and adapted at a small,
well-documented set of integration points (see `INTEGRATION.md`).

## What the feature does

1. **Floating report button** (`BugFeedbackWidget`) rendered on every
   authenticated page. Clicking opens a modal.
2. **Screenshot attach + annotation**: user pastes (Ctrl/Cmd+V), drops, or
   picks an image (PNG/JPEG/WebP/GIF, ≤15 MB). A canvas-based annotation
   editor lets them draw rectangles/arrows in 3 colors. No screen-capture
   library is used — the user supplies the image.
3. **Submit**: client requests a signed upload URL, PUTs the annotated PNG
   directly to object storage (bypasses serverless body limits), then POSTs
   metadata to `POST /api/bugs`. Client context (page URL, viewport, OS,
   browser, device type, build SHA) is collected automatically.
4. **Notify**: a Google Chat card is sent to a webhook (optional, env-gated)
   linking to the admin triage page.
5. **Admin triage board** (`/admin/bugs`): split view list + detail, status
   workflow NEW → IN_PROGRESS → DONE/CANCELLED with status-change history,
   priority (LOW/MEDIUM/HIGH/CRITICAL), assignee, screenshot viewer with
   zoom/pan, threaded comments with optional image attachments.
6. **Reporter view** (`/my-bugs`): each user sees their own reports, can
   reply in the comment thread, and gets an unread-reply badge in the nav.
   Opening a bug fires `POST /api/bugs/[id]/reporter-read` to clear it.
7. **Rate limiting**: in-memory per-user limiter on bug creation (good
   enough for single-instance serverless; swap for Redis at scale).

## Folder map

```
bug-report-kit/
├── README.md            ← you are here (install guide below)
├── INTEGRATION.md       ← the 8 seams: interfaces the code expects
├── prisma/
│   └── bug-report.prisma   3 models + 2 enums to merge into schema.prisma
├── src/                 ← the feature itself (copy + adapt)
│   ├── lib/bugs/           server logic: create/list/get/update, comments,
│   │                       storage paths, chat notify, rate limit, mappers,
│   │                       user-agent parsing, sidebar badge counts
│   ├── app/api/bugs/       9 route handlers (REST-ish JSON API)
│   ├── app/pages/          help/bug (report form page), my-bugs (+[id]),
│   │                       admin/bugs (+[id])  — Next.js App Router pages
│   └── components/
│       ├── bug-feedback/   floating widget, annotation modal/canvas/toolbar,
│       │                   coachmark, client upload + context helpers
│       ├── admin/bugs/     triage board: split view, detail panel, comment
│       │                   thread, badges, status history, screenshot viewer
│       └── bugs/           reporter-read-effect (clears unread badge)
├── reference/           ← REAL implementations of every external dependency,
│   │                       copied from the source project. Use as-is, or as
│   │                       the spec for adapting to the target's equivalents.
│   ├── auth/current-user.ts        session → User (see INTEGRATION.md §1)
│   ├── db/prisma.ts                Prisma singleton
│   ├── api/response.ts             ok()/fail() JSON helpers
│   ├── storage/object-storage.ts   storage abstraction (local + Supabase)
│   ├── storage/supabase-storage.ts Supabase Storage adapter (signed uploads)
│   ├── notifications/              Google Chat webhook card sender + prefs
│   ├── hooks/use-drag-to-pan.ts    zoom/pan hook for screenshot viewer
│   ├── icons/icons.tsx             the 3 inline SVG icons the kit uses
│   └── types/store-types.ts        source project's shared types (User, UserRole)
├── tests/               ← 8 vitest suites (hit a real dev DB; see below)
└── examples/
    ├── layout-mount.tsx     how the widget mounts in the root layout
    └── sidebar-badge.tsx    nav entries + unread badge wiring
```

## Install guide (for the AI agent)

Work through these steps in order. After each step, typecheck before moving on.

### 0. Survey the target project first

Identify the target's equivalents of each seam in `INTEGRATION.md`:
auth/session, Prisma client location, object storage, notification channel,
API response conventions, path alias (`@/`), UI conventions. If the target is
not Next.js App Router, the `src/app/` layer must be rewritten for the
target's router — `src/lib/bugs/` and the React components still transfer.

### 1. Database schema

Merge `prisma/bug-report.prisma` into the target's `schema.prisma`.
- The models reference `User` and `Company`. Add the back-relations to those
  models: on `User` → `bugReports BugReport[] @relation("BugReports")`,
  `assignedBugs BugReport[] @relation("AssignedBugs")`,
  `bugComments BugReportComment[] @relation("BugComments")`,
  `bugStatusChanges BugReportStatusChange[] @relation("BugStatusChanges")`;
  on `Company` → `bugReports BugReport[]`.
- **If the target has no Company/multi-tenant concept**: delete `companyId`
  + the `Company` relation from `BugReport`, drop the `companyId` argument
  everywhere it flows (create-bug, storage prefix, list filters). It exists
  only for tenant scoping and the storage path.
- Run the target's migration workflow (`prisma migrate dev` or `db push`).

### 2. Server logic — `src/lib/bugs/` → target `lib/bugs/`

Copy the folder. Fix imports per INTEGRATION.md: `@/lib/db/prisma`,
`@/lib/storage/object-storage`, `@/lib/notifications/*`, `@/lib/store/types`
(only `UserRole` and `NotifPrefs` types are used). `mappers.ts` imports
generated Prisma enum types — adjust to the target's Prisma client output
path. `notify-chat.ts` is optional; if the target has no Google Chat, stub
the two exported functions to no-ops (or wire Slack/Discord/email instead)
— nothing else depends on delivery.

### 3. API routes — `src/app/api/bugs/` → target `app/api/bugs/`

Copy as-is. These depend on `getCurrentUser()` (throws when unauthenticated)
and the `ok()/fail()` response helpers. Authorization rules encoded in the
routes — preserve them:
- create/list-own/read-own/comment: any authenticated user
- list-all, status/priority/assignee updates, comment on any bug: ADMIN
  (adapt the role check to the target's role model)
- reporters may only see and comment on their own bugs
- screenshot/image binary routes proxy from object storage with the same
  owner-or-admin check — never serve storage URLs directly to the client.

### 4. Components + pages

Copy `src/components/*` into the target's components tree and
`src/app/pages/*` into the target's route structure (the kit's `pages/`
subfolder names are suggestions — `help/bug` is a standalone report form
page and is optional if the floating widget is enough). Adapt:
- `@/components/icons` → 3 SVG icons in `reference/icons/icons.tsx`
- `@/lib/hooks/use-drag-to-pan` → `reference/hooks/use-drag-to-pan.ts`
- Styling: the source uses Tailwind CSS v4 utility classes with custom
  design tokens (e.g. `bg-cream`, `text-ink`, `border-line`, `text-mist`).
  Map these to the target's palette — grep for them and substitute.
  Thai UI strings appear throughout; translate if the target isn't Thai.

### 5. Mount the widget + nav

- Mount `<BugFeedbackWidget />` for authenticated users in the root layout
  (`examples/layout-mount.tsx`).
- Add nav links `/my-bugs` (all users) and `/admin/bugs` (admin) with badge
  counts (`examples/sidebar-badge.tsx`, counts in `src/lib/bugs/badge-counts.ts`).

### 6. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `STORAGE_PROVIDER` | yes (`local` \| `supabase`) | picks storage adapter |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | if supabase | Supabase Storage (signed uploads need Supabase or another adapter implementing `createSignedUploadUrl`) |
| `LOCAL_STORAGE_DIR` | no | local adapter root dir (default `.data`) |
| `GOOGLE_CHAT_BUG_WEBHOOK_URL` | no | new-bug/new-comment chat cards; feature silently skips if unset |
| `NEXTAUTH_URL` | recommended | absolute links in chat cards |
| `NEXT_PUBLIC_BUILD_SHA`, `NEXT_PUBLIC_GH_REPO_URL` | no | build SHA stamped on reports + commit link in admin UI |

Note: the local filesystem adapter does NOT implement signed uploads. The
upload-url routes 501 without it — either use the Supabase adapter, add
`createSignedUploadUrl` to the target's storage, or rewrite the client
upload (`components/bug-feedback/lib/upload.ts`) to multipart-POST the file
through the API route instead.

### 7. Verify

- Copy `tests/` into the target's test tree. They are integration tests that
  hit a real database via Prisma (the source project points `DATABASE_URL`
  at a dev database) and clean up after themselves with `[test-...]`-prefixed
  rows. Adapt imports, then run them — they are the acceptance criteria.
- Manual smoke: log in → click floating bug button → paste a screenshot →
  annotate → submit → see it in `/my-bugs` → as admin, triage in
  `/admin/bugs`, change status, comment → reporter sees unread badge →
  opening the bug clears it.

## npm dependencies

Beyond the framework itself (Next.js ≥14 App Router, React 18+, Prisma),
the feature needs only:
- `zod` (v4 syntax) — API input validation
- `@supabase/supabase-js` — only if using the Supabase storage adapter

Everything else (annotation canvas, UA parsing, rate limiter, upload) is
dependency-free hand-rolled code included in this kit.

## Origin

Extracted 2026-07-03 from a production Thai-language internal expense
system (Next.js 15 App Router, Prisma + Supabase Postgres, NextAuth v5,
Tailwind v4, deployed on Vercel). Role model there: EMPLOYEE / APPROVER /
ACCOUNTING / HR / ADMIN — only ADMIN gates transfer to this feature.
