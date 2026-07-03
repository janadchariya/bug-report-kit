# Integration seams

Every import in `src/` that points outside the kit, what the kit actually
needs from it, and how to satisfy it in a target project. Each seam has a
working reference implementation in `reference/` (copied verbatim from the
source project) — copy it, or adapt the target's existing equivalent to
match the interface described here.

Import counts are for prioritization: fix the big ones first, typecheck,
then sweep the rest.

## 1. `@/lib/auth/current-user` — auth/session (13 imports, the biggest seam)

Used by every API route and page. The kit calls:

```ts
getCurrentUser(): Promise<User>   // throws if not authenticated
```

and reads exactly three fields off the result: `user.id`, `user.role`,
`user.companyId`. Pages additionally show `user.name`.

- `role` is compared against the string `"ADMIN"` for triage permissions.
  Map to the target's role model (single boolean `isAdmin` works too —
  replace the comparisons).
- `companyId` exists for multi-tenant scoping; see README §1 for removing it.
- Reference impl (`reference/auth/current-user.ts`) is NextAuth v5 +
  an admin-impersonation cookie — the impersonation part is NOT needed;
  any function returning the session user satisfies the seam.

## 2. `@/lib/db/prisma` — Prisma client singleton (12 imports)

Standard `export const prisma = new PrismaClient()` singleton
(`reference/db/prisma.ts`). Point imports at the target's existing one.

`src/lib/bugs/mappers.ts` also imports **generated Prisma types**
(`@/lib/generated/prisma/client` and `.../enums` — the source project sets
a custom Prisma `output` path). If the target uses the default
`@prisma/client` output, change those two imports to `@prisma/client`.

## 3. `@/lib/api/response` — JSON response helpers (9 imports)

Three tiny functions (`reference/api/response.ts`):

```ts
jsonOk(data)                          // → { ok: true, data }
jsonError(code, message, status)      // → { ok: false, error: {...} } with status
handleApiError(err)                   // catch-all → 403/404/409/500 by message prefix
```

The **client code depends on this envelope shape**: `components/bug-feedback/lib/upload.ts`
and the admin/my-bugs pages read `body.ok`, `body.data`, `body.error.code`.
Easiest path: copy the reference file as-is. If the target has its own
envelope, adapt BOTH the routes and the client fetch helpers together.

## 4. `@/lib/storage/object-storage` — screenshot/image storage (1 direct import, load-bearing)

`src/lib/bugs/storage.ts` calls `getObjectStorage()` and uses:

```ts
putObject({ prefix, fileName, buffer, mimeType })  // comment images (multipart path)
readObject(key)                                    // serve/proxy binaries
deleteObject(key)
createSignedUploadUrl?({ prefix, fileName, mimeType })  // browser-direct PUT
```

Reference implementation includes a local-filesystem adapter and a Supabase
Storage adapter (`STORAGE_PROVIDER` env selects). Signed uploads
(`createSignedUploadUrl`) are only implemented by the Supabase adapter; the
screenshot upload flow requires it (README §6 has the fallback options).
S3/R2/GCS: implement the same 4-method interface — nothing else changes.

Storage layout the kit writes:

```
bug-reports/{companyId}/{bugId}/screenshot.png
bug-reports/{companyId}/{bugId}/comments/{timestamp}-{filename}
```

Filenames are server-controlled (deterministic `screenshot.png`) — keep it
that way; it avoids user-input-in-path bugs (Thai filenames broke Supabase
keys in the source project's history).

## 5. `@/lib/notifications/*` — chat notify (4 imports, fully optional)

Three modules, all only reached from `src/lib/bugs/notify-chat.ts` and the
comment route:

- `chat.ts` → `sendChatCard(webhookUrl, card)` — posts a Google Chat card.
- `defer.ts` → `deferNotify(task)` — runs the task via Next's `after()` so
  it survives response flush on serverless (falls back to detached run).
  **Keep this pattern** if you keep notifications: fire-and-forget promises
  get dropped/delayed on Vercel-style runtimes.
- `notif-prefs.ts` → `shouldSendChat(prefs, "bugComment")` — per-user
  opt-out check. If the target has no notification-prefs system, replace
  the call with `true`.

To disable notifications entirely: stub `notifyBugCreated` and
`notifyBugComment` in `notify-chat.ts` to no-ops. To use Slack/Discord/
email: rewrite only `notify-chat.ts` (it receives the full bug/comment
objects and builds the message).

## 6. `@/lib/store/types` — shared types (2 imports)

Only two types cross this seam: `UserRole` (a string-literal union; map to
target's) and `NotifPrefs` (only if keeping notification prefs, see §5).
Full source-project file included at `reference/types/store-types.ts` for
context — do NOT copy it wholesale; extract just what's needed.

## 7. `@/components/icons` — 3 SVG icons (3 imports)

`IconBug`, `IconCheck`, `IconCamera` — inline-SVG React components, no
icon library. All three are in `reference/icons/icons.tsx`. Or substitute
lucide-react equivalents (`Bug`, `Check`, `Camera`) — props are compatible
enough (`size`, spread SVG props).

## 8. `@/lib/hooks/use-drag-to-pan` — screenshot viewer pan (1 import)

Self-contained 57-line React hook (`reference/hooks/use-drag-to-pan.ts`)
used by `bug-screenshot-viewer.tsx` for drag-to-pan when zoomed. Copy as-is.

---

## Framework/runtime assumptions (not import seams, but portability limits)

- **Next.js App Router**: route handlers use `NextRequest`/`NextResponse`
  and `{ params }: { params: Promise<{ id: string }> }` (Next 15 async
  params). Pages are React Server Components. `defer.ts` uses
  `next/server`'s `after()`. Porting to another framework keeps
  `src/lib/bugs/` (framework-free except defer) and all React components;
  routes/pages need rewriting.
- **Tailwind CSS v4** with custom theme tokens: `cream`, `ink`, `mist`,
  `line`, `clay` appear in class names (`bg-cream`, `text-ink`,
  `border-line`, ...). Grep and map to the target's palette, or define
  aliases in the target's Tailwind theme.
- **Thai UI copy** throughout components/pages. Translate as needed.
- **Rate limiter is in-memory** (`src/lib/bugs/rate-limit.ts`) — per
  warm serverless instance, which was the accepted tradeoff. Multi-instance
  deployments that need a hard guarantee should back it with Redis.
- **Tests** (`tests/`) are vitest integration tests against a real dev
  database — they create rows prefixed `[test-...]` and delete them in
  cleanup. They import from relative paths matching the source project's
  layout (`../../lib/...`); adjust after copying.
