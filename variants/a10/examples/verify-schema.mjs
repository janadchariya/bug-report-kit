import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema "A10-task-management"; create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
await db.exec(await readFile('db/20261022100000_a10_bug_reports.sql','utf8'));
const report = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
await db.query(`insert into "A10-task-management".bug_reports
(id,reporter_key,summary,screenshot_path,screenshot_mime,screenshot_width,screenshot_height,page_url,viewport_width,viewport_height,user_agent)
values ($1,'anga_two:reporter','Synthetic report',$2,'image/png',1,1,'https://example.test/bugs',1,1,'test')`,[report,`bug-reports/${report}/screenshot.png`]);
await db.query(`select * from "A10-task-management".update_bug_report($1,'anga_two:dev','Developer','in_progress',true,'high',true,'anga_two:dev','Developer','Started')`,[report]);
await db.query(`select * from "A10-task-management".add_bug_report_comment('bbbbbbbb-bbbb-4bbb-8bbb-000000000001',$1,'anga_two:dev','Developer','Checking',null,null)`,[report]);
const {rows}=await db.query(`select status,priority,assignee_key,last_reply_at is not null as replied,
(select count(*)::int from "A10-task-management".bug_report_status_changes) as history
from "A10-task-management".bug_reports where id=$1`,[report]);
if(JSON.stringify(rows[0])!==JSON.stringify({status:'in_progress',priority:'high',assignee_key:'anga_two:dev',replied:true,history:1})) throw new Error(JSON.stringify(rows));
const grants=await db.query(`select relname,relrowsecurity from pg_class where relnamespace='"A10-task-management"'::regnamespace and relkind='r'`);
if(grants.rows.length!==3||grants.rows.some(r=>!r.relrowsecurity))throw new Error('Missing RLS');
const {rows: exposure} = await db.query(`select
has_table_privilege('anon','"A10-task-management".bug_reports','select') as anon_read,
has_table_privilege('authenticated','"A10-task-management".bug_reports','update') as browser_write,
has_function_privilege('anon','"A10-task-management".update_bug_report(uuid,text,text,text,boolean,text,boolean,text,text,text)','execute') as anon_rpc,
(select public from storage.buckets where id='a10-bug-reports') as public_bucket`);
if(Object.values(exposure[0]).some(value=>value!==false)) throw new Error('Public exposure: '+JSON.stringify(exposure));
await db.query(`select * from "A10-task-management".update_bug_report($1,'anga_two:dev','Developer','in_progress',false,null,true,null,null,null)`,[report]);
const {rows: cleared}=await db.query(`select assignee_key,(select count(*)::int from "A10-task-management".bug_report_status_changes) as history from "A10-task-management".bug_reports where id=$1`,[report]);
if(cleared[0].assignee_key!==null||cleared[0].history!==1)throw new Error('Unassignment/history failure');
console.log('PASS: migration, assignment/status RPC, history, comment/unread update and RLS (disposable PGlite).');
await db.close();
