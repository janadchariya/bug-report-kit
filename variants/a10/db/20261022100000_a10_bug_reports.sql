-- Portable A10 schema. Review and apply through the host migration workflow.
-- Requires the A10-task-management schema and Supabase Storage.
-- A10 in-app bug reports (22 Oct 2026; ported from github.com/janadchariya/bug-report-kit). backend/bug-reports.mjs owns
-- all three tables, both functions and the storage bucket. Additive only. RLS on, service_role only, functions SECURITY
-- INVOKER with an empty search_path.
--
-- 1. bug_reports: one row per report from the floating bug button. People are A10 actors (anga_two:<employee uuid>)
--    with their name at the time, since A10 has no users table. The screenshot lives in the private Storage bucket
--    a10-bug-reports under bug-reports/<bug id>/screenshot.<ext> (a path the server builds; no user input in it) and is
--    only served through GET /api/bugs/<id>/screenshot (reporter or A10 admin). last_reply_at is the newest comment by
--    someone other than the reporter: the reporter's unread badge is last_reply_at > reporter_last_read_at.
-- 2. bug_report_comments: the thread between the reporter and the A10 admins, with an optional image in the same bucket.
-- 3. bug_report_status_changes: one row per status change (who, from, to, note).
-- update_bug_report applies an admin's status / priority / assignee change and its history row in one transaction;
-- add_bug_report_comment adds a comment and moves last_reply_at when the author is not the reporter.
set local lock_timeout = '5s';

create table if not exists "A10-task-management".bug_reports (
 id uuid primary key,
 reporter_key text not null check (reporter_key ~ '^[a-z_]{1,20}:[A-Za-z0-9_.-]{1,100}$'),
 reporter_name text check (char_length(reporter_name) <= 200),
 summary text not null check (char_length(btrim(summary)) between 1 and 200),
 description text check (char_length(description) <= 4000),
 screenshot_path text not null check (screenshot_path ~ '^bug-reports/[0-9a-f-]{36}/screenshot\.(png|jpg|webp)$'),
 screenshot_mime text not null check (screenshot_mime in ('image/png', 'image/jpeg', 'image/webp')),
 screenshot_width integer not null check (screenshot_width between 1 and 10000),
 screenshot_height integer not null check (screenshot_height between 1 and 10000),
 page_url text not null check (char_length(page_url) <= 2000),
 viewport_width integer not null check (viewport_width between 1 and 10000),
 viewport_height integer not null check (viewport_height between 1 and 10000),
 user_agent text not null check (char_length(user_agent) <= 1000),
 os_name text check (char_length(os_name) <= 100),
 os_version text check (char_length(os_version) <= 100),
 browser_name text check (char_length(browser_name) <= 100),
 browser_version text check (char_length(browser_version) <= 100),
 device_type text check (device_type in ('desktop', 'tablet', 'mobile')),
 app_build_sha text check (char_length(app_build_sha) <= 100),
 status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'cancelled')),
 priority text check (priority in ('low', 'medium', 'high', 'critical')),
 assignee_key text check (assignee_key ~ '^[a-z_]{1,20}:[A-Za-z0-9_.-]{1,100}$'),
 assignee_name text check (char_length(assignee_name) <= 200),
 last_reply_at timestamptz,
 reporter_last_read_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists a10_bug_reports_status on "A10-task-management".bug_reports (status, created_at desc, id desc);
create index if not exists a10_bug_reports_reporter on "A10-task-management".bug_reports (reporter_key, created_at desc, id desc);
create index if not exists a10_bug_reports_created on "A10-task-management".bug_reports (created_at desc, id desc);
alter table "A10-task-management".bug_reports enable row level security;
revoke all on "A10-task-management".bug_reports from public, anon, authenticated;
grant select, insert, update on "A10-task-management".bug_reports to service_role;
comment on table "A10-task-management".bug_reports is 'A10 in-app bug reports from the floating bug button (backend/bug-reports.mjs): summary, screenshot path in Storage bucket a10-bug-reports, browser context, triage status/priority/assignee.';

create table if not exists "A10-task-management".bug_report_comments (
 id uuid primary key default gen_random_uuid(),
 bug_id uuid not null references "A10-task-management".bug_reports(id) on delete cascade,
 author_key text not null check (author_key ~ '^[a-z_]{1,20}:[A-Za-z0-9_.-]{1,100}$'),
 author_name text check (char_length(author_name) <= 200),
 body text not null check (char_length(body) <= 4000),
 image_path text check (image_path ~ '^bug-reports/[0-9a-f-]{36}/comments/[0-9a-f-]{36}\.(png|jpg|webp)$'),
 image_mime text check (image_mime in ('image/png', 'image/jpeg', 'image/webp')),
 created_at timestamptz not null default now(),
 check (char_length(btrim(body)) > 0 or image_path is not null),
 check ((image_path is null) = (image_mime is null))
);
create index if not exists a10_bug_report_comments_bug on "A10-task-management".bug_report_comments (bug_id, created_at);
alter table "A10-task-management".bug_report_comments enable row level security;
revoke all on "A10-task-management".bug_report_comments from public, anon, authenticated;
grant select, insert on "A10-task-management".bug_report_comments to service_role;
comment on table "A10-task-management".bug_report_comments is 'A10 bug report thread between the reporter and A10 admins, optional image in Storage bucket a10-bug-reports (backend/bug-reports.mjs).';

create table if not exists "A10-task-management".bug_report_status_changes (
 id uuid primary key default gen_random_uuid(),
 bug_id uuid not null references "A10-task-management".bug_reports(id) on delete cascade,
 changed_by_key text not null check (changed_by_key ~ '^[a-z_]{1,20}:[A-Za-z0-9_.-]{1,100}$'),
 changed_by_name text check (char_length(changed_by_name) <= 200),
 from_status text check (from_status in ('new', 'in_progress', 'done', 'cancelled')),
 to_status text not null check (to_status in ('new', 'in_progress', 'done', 'cancelled')),
 note text check (char_length(note) <= 2000),
 created_at timestamptz not null default now()
);
create index if not exists a10_bug_report_status_changes_bug on "A10-task-management".bug_report_status_changes (bug_id, created_at);
alter table "A10-task-management".bug_report_status_changes enable row level security;
revoke all on "A10-task-management".bug_report_status_changes from public, anon, authenticated;
grant select, insert on "A10-task-management".bug_report_status_changes to service_role;
comment on table "A10-task-management".bug_report_status_changes is 'A10 bug report status history: who changed it, from, to, note (backend/bug-reports.mjs update_bug_report).';

-- Admin triage change. A null p_status keeps the status; p_set_priority / p_set_assignee say whether the (possibly null)
-- priority / assignee is part of the change. Returns the updated row; no row when the bug does not exist.
create or replace function "A10-task-management".update_bug_report(
 p_id uuid, p_actor_key text, p_actor_name text,
 p_status text default null,
 p_set_priority boolean default false, p_priority text default null,
 p_set_assignee boolean default false, p_assignee_key text default null, p_assignee_name text default null,
 p_note text default null
) returns setof "A10-task-management".bug_reports
language plpgsql security invoker set search_path = '' as $$
declare
 v_from text;
begin
 select status into v_from from "A10-task-management".bug_reports where id = p_id for update;
 if not found then return; end if;
 update "A10-task-management".bug_reports set
  status = coalesce(p_status, status),
  priority = case when p_set_priority then p_priority else priority end,
  assignee_key = case when p_set_assignee then p_assignee_key else assignee_key end,
  assignee_name = case when p_set_assignee then p_assignee_name else assignee_name end,
  updated_at = now()
 where id = p_id;
 if p_status is not null and p_status <> v_from then
  insert into "A10-task-management".bug_report_status_changes (bug_id, changed_by_key, changed_by_name, from_status, to_status, note)
  values (p_id, p_actor_key, p_actor_name, v_from, p_status, nullif(btrim(coalesce(p_note, '')), ''));
 end if;
 return query select * from "A10-task-management".bug_reports where id = p_id;
end $$;
revoke all on function "A10-task-management".update_bug_report(uuid, text, text, text, boolean, text, boolean, text, text, text) from public, anon, authenticated;
grant execute on function "A10-task-management".update_bug_report(uuid, text, text, text, boolean, text, boolean, text, text, text) to service_role;

-- New comment. A comment by anyone other than the reporter moves last_reply_at (the reporter's unread badge).
create or replace function "A10-task-management".add_bug_report_comment(
 p_id uuid, p_bug_id uuid, p_author_key text, p_author_name text, p_body text, p_image_path text default null, p_image_mime text default null
) returns setof "A10-task-management".bug_report_comments
language plpgsql security invoker set search_path = '' as $$
begin
 insert into "A10-task-management".bug_report_comments (id, bug_id, author_key, author_name, body, image_path, image_mime)
 values (p_id, p_bug_id, p_author_key, p_author_name, btrim(p_body), p_image_path, p_image_mime);
 update "A10-task-management".bug_reports set
  last_reply_at = case when reporter_key <> p_author_key then now() else last_reply_at end,
  updated_at = now()
 where id = p_bug_id;
 return query select * from "A10-task-management".bug_report_comments where id = p_id;
end $$;
revoke all on function "A10-task-management".add_bug_report_comment(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function "A10-task-management".add_bug_report_comment(uuid, uuid, text, text, text, text, text) to service_role;

-- Private bucket for screenshots and comment images. Only the service role reads or writes it (no storage policies);
-- browsers get the bytes through A10's own routes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('a10-bug-reports', 'a10-bug-reports', false, 15728640, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

notify pgrst, 'reload schema';
