import { readFileSync } from 'node:fs';

it('adds a private sibling PDF store with bounded metadata and one-way tombstones', () => {
  const source = readFileSync('db/migrations/0003_bug_pdf.sql','utf8');
  expect(source).toContain('CREATE TABLE "bug_report_files"');
  expect(source).toContain('ALTER TABLE "bug_report_files" ENABLE ROW LEVEL SECURITY');
  expect(source).toContain('4194304');
  expect(source).toContain('report_pdf'); expect(source).toContain('comment_pdf');
  expect(source).toContain('bug_report_files_forbid_delete'); expect(source).toContain('bug_report_files_forbid_truncate');
  expect(source).toContain('OLD.content IS NULL'); expect(source).toContain('NEW.content IS DISTINCT FROM OLD.content');
  expect(source).not.toMatch(/CREATE\s+POLICY|ON DELETE cascade|DROP\s+TABLE/i);
  expect(source).toContain('ALTER TABLE "bug_report_comments" ADD COLUMN "pending_pdf" boolean DEFAULT false NOT NULL');
  expect([...source.matchAll(/CREATE TABLE "([^"]+)"/g)].map(match => match[1])).toEqual(['bug_report_files']);
});
