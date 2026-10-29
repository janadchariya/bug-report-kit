import { readFileSync } from "node:fs";

const migration = readFileSync("db/migrations/0001_bug_reports.sql", "utf8");
const stores = ["bug_reports", "bug_report_comments", "bug_report_status_changes", "bug_report_images"];

it("adds precisely four bug stores without mutating host tables", () => {
  expect([...migration.matchAll(/CREATE TABLE "([^"]+)"/g)].map(match => match[1]).sort()).toEqual([...stores].sort());
  expect(migration).not.toMatch(/\b(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT)\s+(?:TABLE|FROM|INTO|"?(?:chat|calendar|events|role_permission))/i);
});

it("hardens each new store and pins the narrow image guard", () => {
  for (const store of stores) {
    expect(migration).toContain(`ALTER TABLE "${store}" ENABLE ROW LEVEL SECURITY`);
    expect(migration).toContain(`CREATE TRIGGER ${store}_forbid_delete BEFORE DELETE ON public.${store} FOR EACH ROW EXECUTE FUNCTION public.forbid_delete()`);
    expect(migration).toContain(`CREATE TRIGGER ${store}_forbid_truncate BEFORE TRUNCATE ON public.${store} FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_truncate()`);
  }
  expect(migration).not.toMatch(/CREATE\s+POLICY|ON DELETE cascade|forbid_mutation/);
  expect(migration).toContain("CREATE FUNCTION public.bug_image_update_guard()");
  expect(migration).toContain("LANGUAGE plpgsql SET search_path = ''");
  expect(migration).toContain("OLD.content IS NULL");
  expect(migration).toContain("NEW.content IS DISTINCT FROM OLD.content");
  expect(migration).toContain('FOREIGN KEY ("comment_id","bug_report_id") REFERENCES "public"."bug_report_comments"("id","bug_report_id") ON DELETE restrict');
});

it("retains each comment result watermark for idempotent retries", () => {
  expect(migration).toContain('"reporter_activity_seq" integer DEFAULT 0 NOT NULL');
  expect(migration).toContain('"bug_report_comments_activity_nonnegative" CHECK ("bug_report_comments"."reporter_activity_seq" >= 0)');
});
