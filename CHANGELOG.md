# Changelog

## 2.0.0 — R19 / R19.1 port (2026-10-29)

Replaces the original implementation with the R19.1 feature: server actions, Drizzle/Postgres bytea stores, private binary routes, required paste/drop/pick screenshot, annotation with rectangles/arrows/pen and undo, optional PDF, triage workspace and reporter views, read watermarks and shared badges, coachmark, illustrated guide, and optional webhook cards. The old Prisma/REST/object-storage implementation is removed.

`src/` is a copy root: its `app/` and nested `src/` folders copy to the host application root. Unit/DB tests stay colocated. Supplemental DB, privacy and navigation tests are under `tests/src/` and use host aliases. Playwright cases and the isolated R19 fixture are under `tests/`.

The three migrations are renamed from the source sequence to `0001_bug_reports.sql`, `0002_bug_chat.sql`, and `0003_bug_pdf.sql`. Their SQL is byte-for-byte unchanged; no host-only SQL references were removed. Migration 0002 deliberately retains the pre-existing chat kind/subject CHECK values so applying it is additive. It needs the reference chat table or an adapted host equivalent. The users foreign keys and shared guard functions remain explicit prerequisites.

The source Drizzle metadata snapshots/journal contain the entire host schema and are not shipped. Portable migration tests assert the same bug-store SQL invariants and the Chat enum widening directly; they omit whole-host table counts, old journal offsets and unrelated snapshot equality. A fixture containing only the two preceding Chat CHECK definitions preserves the retained-row regression without copying host schema history.

Public substitutions remove source application branding, a source repository commit URL, a browser storage namespace, personal/example names and addresses, synthetic webhook endpoints, and a company-specific external-referrer role identifier. The reference role now uses `external_referrer`; bug permissions and production feature code are unchanged. The generic browser storage key intentionally starts fresh in each installed host. The commit URL is an example placeholder that installers must map to their repository. Business-specific guide instructions remain as shipped and are enumerated in `INTEGRATION.md`.

Bug-only guide timeline/copy tests are extracted from the host guide page/content suites. Guide-page authentication remains the host mount responsibility; unrelated role-guide assertions are omitted.

The portable R19 fixture changes only bug permission cells. Full source Playwright scenarios are preserved, including host bulk/save-bar and role-settings checks; installers must map the host login/scenario fixture seam and provide their corresponding shell pages. The supplemental navigation test uses the four-entry reference shell, omits unrelated host destinations and expects only the two bug badges in More.

### Exact source deviations

All copied runtime/source and acceptance-test deviations are listed below. Paths identify kit files; source paths are relative to the source application. Source line ranges identify removals/replacements without repeating private source literals. Each added/replacement line is shown exactly as shipped. Files absent from this list are byte-identical to their source. New reference adapters, examples, documentation, token extraction and the reduced Chat CHECK fixture have no one-to-one feature-source file and are described above and in `INTEGRATION.md`.

#### `db/schema.ts`

Source: `src/server/db/schema/bugs.ts`.

Replaces source line(s) 4–5; kit line(s) 4–5:

```ts
import { inList, nullOrInList } from "@/src/server/db/schema/sql-helpers";
import { users } from "@/src/server/db/schema/users";
```


#### `src/app/(app)/guide/bug-guide-content.test.tsx`

Source: `app/(app)/guide/content.test.tsx`.

Replaces source line(s) 1–149; kit line(s) 1–1:

```tsx
import { REPORT_A_BUG_GUIDE } from "./content";
```


#### `src/app/(app)/guide/bug-guide.test.tsx`

Source: `app/(app)/guide/page.test.tsx`.

Replaces source line(s) 1–4; kit line(s) 1–2:

```tsx
import { render, screen, within } from "@testing-library/react";
import { BugGuide } from "./bug-guide";
```

Replaces source line(s) 6–15; kit line(s) 4–5:

```tsx
it("adds Almond's three-step bug timeline and HTML mocks at the coachmark anchor", () => {
  render(<BugGuide />);
```

Removes source line(s) 31–36.

#### `src/app/(app)/guide/bug-guide.tsx`

Source: `app/(app)/guide/bug-guide.tsx`.

Replaces source line(s) 29; kit line(s) 29–29:

```tsx
    <p className="bug-guide__kicker">App · Guide</p>
```


#### `src/app/actions/bugs.test.ts`

Source: `app/actions/bugs.test.ts`.

Replaces source line(s) 159; kit line(s) 159–159:

```ts
  await db.insert(chatWebhooks).values({ userId: triager.id, status: 'active', encryptedUrl: sealSecret('https://chat.example.test/v1/spaces/synthetic/messages?key=fake-key&token=fake-token', 'chat-webhook', triager.id, serverEnv.AUTH_SECRET), googleSpaceName: 'spaces/synthetic', verifiedAt: new Date() });
```


#### `src/src/components/bugs/bug-coachmark.test.tsx`

Source: `src/components/bugs/bug-coachmark.test.tsx`.

Replaces source line(s) 6; kit line(s) 6–6:

```tsx
const STORAGE_KEY = "bug-report-kit.coachmarkSeen";
```


#### `src/src/components/bugs/bug-coachmark.tsx`

Source: `src/components/bugs/bug-coachmark.tsx`.

Replaces source line(s) 8; kit line(s) 8–8:

```tsx
const STORAGE_KEY = "bug-report-kit.coachmarkSeen";
```


#### `src/src/components/bugs/bug-comment-thread.test.tsx`

Source: `src/components/bugs/bug-comment-thread.test.tsx`.

Replaces source line(s) 269–271; kit line(s) 269–271:

```tsx
  ]} commentsBefore={null} staff={[{ id: userId, displayName: "Alex Example", nickname: null }, { id: "other", displayName: "Sam Example", nickname: null }]} />);
  expect(screen.getByRole("img", { name: "Alex Example" })).toHaveTextContent("AE");
  expect(screen.getByRole("img", { name: "Sam Example" })).toHaveTextContent("SE");
```

Replaces source line(s) 325, 415, 429 and 475; kit line(s) 325, 415, 429 and 475 (each line reads the kit token file instead of the source host's `app/tokens.css`):

```tsx
  const tokens = new Map([...readFileSync("tokens/bug-tokens.css", "utf8").matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]));
```


#### `src/src/components/bugs/bug-detail.tsx`

Source: `src/components/bugs/bug-detail.tsx`.

Replaces source line(s) 104; kit line(s) 104–104:

```tsx
      <dt>Build SHA</dt><dd>{detail.appBuildSha ? <a href={`https://github.com/example/host-app/commit/${encodeURIComponent(detail.appBuildSha)}`} target="_blank" rel="noreferrer">{detail.appBuildSha.slice(0, 7)}</a> : "—"}</dd>
```


#### `src/src/components/bugs/bug-pages.test.tsx`

Source: `src/components/bugs/bug-pages.test.tsx`.

Replaces source line(s) 297; kit line(s) 297–297:

```tsx
  expect(within(technical).getByRole("link", { name: "1234567", hidden: true })).toHaveAttribute("href", "https://github.com/example/host-app/commit/1234567890abcdef1234567890abcdef12345678");
```


#### `src/src/components/bugs/bug-report-widget.test.tsx`

Source: `src/components/bugs/bug-report-widget.test.tsx`.

Replaces source line(s) 25; kit line(s) 25–25:

```tsx
  localStorage.setItem("bug-report-kit.coachmarkSeen", "1");
```

Replaces source line(s) 79; kit line(s) 79–79:

```tsx
  expect(screen.getByLabelText("Summary")).toHaveValue(""); expect(stored.mock.calls.every(([key]) => key === "bug-report-kit.coachmarkSeen")).toBe(true); stored.mockRestore();
```


#### `src/src/components/bugs/bug-widget-layout.test.tsx`

Source: `src/components/bugs/bug-widget-layout.test.tsx`.

Replaces source line(s) 3; kit line(s) 3 (reads the kit token file instead of the source host's `app/tokens.css`):

```tsx
const tokens = readFileSync("tokens/bug-tokens.css", "utf8");
```


#### `src/src/lib/bugs/chat-migration.test.ts`

Source: `src/lib/bugs/chat-migration.test.ts`.

Replaces source line(s) 4–11; kit line(s) 4–5:

```ts
it('widens only the two Chat CHECKs and keeps SQL aligned with the host model', () => {
  const migration = readFileSync('db/migrations/0002_bug_chat.sql', 'utf8');
```

Replaces source line(s) 15–16; kit line(s) 9–10:

```ts
    const statement = migration.split('--> statement-breakpoint').find(part => part.includes(`ADD CONSTRAINT "${name}"`))!;
    expect([...statement.matchAll(/'([^']+)'/g)].map(match => match[1])).toEqual([...values]);
```

Removes source line(s) 18–19.
Removes source line(s) 21–22.
Removes source line(s) 26–32.

#### `src/src/lib/bugs/chat-notice.test.ts`

Source: `src/lib/bugs/chat-notice.test.ts`.

Replaces source line(s) 26; kit line(s) 26–26:

```ts
      { summary: 'Customer SyntheticCustomer 0800000000 customer@example.test' },
```


#### `src/src/lib/bugs/migration.test.ts`

Source: `src/lib/bugs/migration.test.ts`.

Replaces source line(s) 3–5; kit line(s) 3–3:

```ts
const migration = readFileSync("db/migrations/0001_bug_reports.sql", "utf8");
```

Replaces source line(s) 8–14; kit line(s) 6–7:

```ts
it("adds precisely four bug stores without mutating host tables", () => {
  expect([...migration.matchAll(/CREATE TABLE "([^"]+)"/g)].map(match => match[1]).sort()).toEqual([...stores].sort());
```

Replaces source line(s) 33–34; kit line(s) 26–26:

```ts
  expect(migration).toContain('"reporter_activity_seq" integer DEFAULT 0 NOT NULL');
```


#### `src/src/lib/bugs/pdf-migration.test.ts`

Source: `src/lib/bugs/pdf-migration.test.ts`.

Replaces source line(s) 4; kit line(s) 4–4:

```ts
  const source = readFileSync('db/migrations/0003_bug_pdf.sql','utf8');
```

Replaces source line(s) 12–25; kit line(s) 12–13:

```ts
  expect(source).toContain('ALTER TABLE "bug_report_comments" ADD COLUMN "pending_pdf" boolean DEFAULT false NOT NULL');
  expect([...source.matchAll(/CREATE TABLE "([^"]+)"/g)].map(match => match[1])).toEqual(['bug_report_files']);
```


#### `src/src/server/bugs/access.test.ts`

Source: `src/server/bugs/access.test.ts`.

Replaces source line(s) 19; kit line(s) 19–19:

```ts
  const reporter = await buildTestActor((await createUser({ roles: ["external_referrer"] })).id);
```

Replaces source line(s) 48; kit line(s) 48–48:

```ts
    await setRolePermissions({ external_referrer: { "bugs.report": false }, md: { "bugs.triage": false } });
```

Replaces source line(s) 64; kit line(s) 64–64:

```ts
    expect(JSON.stringify(eligible)).not.toContain("@example");
```

Replaces source line(s) 91; kit line(s) 91–91:

```ts
      await tx.insert(rolePermissionVersions).values({ version: 1, grants: { external_referrer: { "bugs.report": false } },
```


#### `src/src/server/bugs/nav-counts.test.ts`

Source: `src/server/bugs/nav-counts.test.ts`.

Replaces source line(s) 23; kit line(s) 23–23:

```ts
  const owner = await buildTestActor((await createUser({ roles: ["external_referrer"] })).id);
```


#### `src/src/server/bugs/notifications.test.ts`

Source: `src/server/bugs/notifications.test.ts`.

Replaces source line(s) 36; kit line(s) 36–36:

```ts
async function webhook(userId: string, status: 'active' | 'broken' | 'disabled' = 'active', url = 'https://chat.example.test/v1/spaces/synthetic/messages?key=fake-key&token=fake-token') {
```

Replaces source line(s) 40; kit line(s) 40–40:

```ts
const report = (reporter: Awaited<ReturnType<typeof actor>>, requestId = randomUUID()) => db.transaction(tx => createBug(tx, { actor: reporter, input: { requestId, summary: 'Customer SyntheticCustomer <b>0800000000 customer@example.test</b>', description: 'private description' }, context, now, correlationId }));
```

Replaces source line(s) 58; kit line(s) 58–58:

```ts
  expect(JSON.stringify(rows)).not.toMatch(/SyntheticCustomer|0800000000|customer@example|private description|<b>/);
```

Replaces source line(s) 84; kit line(s) 84–84:

```ts
  const reporterWebhookUrl = 'https://chat.example.test/v1/spaces/synthetic/messages?key=reporter-key&token=reporter-token';
```

Replaces source line(s) 102; kit line(s) 102–102:

```ts
  expect(body).not.toMatch(/SyntheticCustomer|0800000000|customer@example|private|<b>|"action":/);
```

Replaces source line(s) 174; kit line(s) 174–174:

```ts
  expect(body).not.toMatch(/SyntheticCustomer|0800000000|customer@example|private|<b>|"action":/);
```

Replaces source line(s) 209–210; kit line(s) 209–210:

```ts
  const previous = JSON.parse(readFileSync('tests/fixtures/pre-bug-chat-checks.json', 'utf8'));
  const sqlText = readFileSync('db/migrations/0002_bug_chat.sql', 'utf8');
```


#### `src/src/server/bugs/queries.test.ts`

Source: `src/server/bugs/queries.test.ts`.

Replaces source line(s) 23; kit line(s) 23–23:

```ts
  const reporter = await buildTestActor((await createUser({ roles: ["external_referrer"], displayName: "Synthetic Reporter" })).id);
```

Replaces source line(s) 183; kit line(s) 183–183:

```ts
    await setRolePermissions({ external_referrer: { "bugs.report": false }, md: { "bugs.triage": false } });
```


#### `tests/e2e/bugs.spec.ts`

Source: `tests/e2e/bugs.spec.ts`.

Replaces source line(s) 236; kit line(s) 236–236:

```ts
    expect(await page.evaluate(() => localStorage.getItem("bug-report-kit.coachmarkSeen"))).toBe("1");
```

Replaces source line(s) 552; kit line(s) 552–552:

```ts
    await enter(page, "admin@example.test", "/settings/roles");
```


#### `tests/fixtures/r19-bugs.ts`

Source: `tests/fixtures/r19-bugs.ts`.

Removes source line(s) 20–22.
Removes source line(s) 25.
Replaces source line(s) 36; kit line(s) 32–32:

```ts
  if (!/^\/[a-z0-9_]*(?:test|e2e)[a-z0-9_]*$/.test(new URL(target).pathname)) throw new Error("r19_test_database_required");
```

Replaces source line(s) 41; kit line(s) 37–37:

```ts
      db.select({ id: users.id, status: users.status }).from(users).where(and(inArray(users.id, state.userIds), like(users.email, `r19.${state.token}.%@example.test`))),
```

Replaces source line(s) 89; kit line(s) 85–85:

```ts
      const [user] = await tx.insert(users).values({ email: `r19.${token}.${key}@example.test`,
```


#### `tests/src/components/shell/bug-navigation.test.tsx`

Source: `src/components/shell/bug-navigation.test.tsx`.

Replaces source line(s) 2–4; kit line(s) 2–4:

```tsx
import { filterNavItems, NAV_ITEMS } from "@/src/components/shell/nav-items";
import { Sidebar } from "@/src/components/shell/sidebar";
import { TabBar } from "@/src/components/shell/tab-bar";
```

Replaces source line(s) 6; kit line(s) 6–6:

```tsx
import { NavBadges } from "@/src/components/shell/nav-badges";
```

Replaces source line(s) 18; kit line(s) 18–18:

```tsx
it("places both bug destinations in More for an admin", () => {
```

Replaces source line(s) 22; kit line(s) 22–22:

```tsx
  expect(within(phone).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/today", "/guide"]);
```

Replaces source line(s) 39; kit line(s) 39–39:

```tsx
  const items = NAV_ITEMS.filter(i => ["/today", "/bugs", "/bugs/mine", "/guide"].includes(i.href));
```

Replaces source line(s) 54; kit line(s) 54–54:

```tsx
  expect(within(phone).getAllByRole("link").map(i => i.textContent)).toEqual(["Today", "Guide"]);
```

Replaces source line(s) 65; kit line(s) 65–65:

```tsx
  const items = NAV_ITEMS.filter(i => ["/today", "/bugs", "/bugs/mine", "/guide"].includes(i.href));
```

Replaces source line(s) 68–69; kit line(s) 68–69:

```tsx
  await waitFor(() => expect(more).toHaveAccessibleDescription("7 notifications"));
  expect(more).toHaveTextContent("More7");
```


#### `tests/src/server/db/bugs.test.ts`

Source: `src/server/db/bugs.test.ts`.

Replaces source line(s) 6–8; kit line(s) 6–8:

```ts
import { db } from "@/src/server/db/client";
import { pgErrorCode } from "@/src/server/db/errors";
import { bugReports, bugReportComments, bugReportFiles, bugReportStatusChanges, bugReportImages, calendarFeeds, calendarEvents, chatMessages, chatWebhooks } from "@/src/server/db/schema";
```

Replaces source line(s) 107; kit line(s) 107–107:

```ts
  const migration = readFileSync("db/migrations/0001_bug_reports.sql", "utf8");
```


#### `tests/src/server/privacy/bugs.test.ts`

Source: `src/server/privacy/bugs.test.ts`.

Replaces source line(s) 7; kit line(s) 7–7:

```ts
import { scrubContactCopies } from '@/src/server/privacy/scrub';
```


## 1.0.0 — original Almond extraction

Original portable Prisma/REST/object-storage implementation, preserved in Git history at commit `3e39878`. Version 2 replaces it; the repository contains one implementation.
