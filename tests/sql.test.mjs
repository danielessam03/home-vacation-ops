// Runs sql/001..005 in PGlite (real Postgres, WASM) with a stub of Supabase's auth schema, then exercises triggers + RLS.
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const dir = new URL('../sql/', import.meta.url);
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const expectErr = async (name, sql, re) => { try { await db.exec(sql); ok(name, false, '(no error raised)'); } catch (e) { ok(name, re.test(e.message), e.message.slice(0, 90)); } };
const asUser = (id) => db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role authenticated;`);
const asService = () => db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated;
  grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  -- minimal stand-ins for the HR tables HV Ops plugs into
  create table public.app_users (id uuid primary key references auth.users(id), email text, full_name_en text, full_name_ar text, role text not null default 'staff',
    phone text, is_active boolean not null default true, username text, created_at timestamptz default now());
  alter table public.app_users enable row level security;
  create policy self_only on public.app_users for select to authenticated using (id = auth.uid());
  create table public.employees (id uuid primary key default gen_random_uuid(), user_id uuid, status text default 'active');
  create table public.kpi_metrics (id uuid primary key default gen_random_uuid(), code text unique not null, name_en text, name_ar text, points_per_unit numeric default 1,
    value_points_per_million numeric default 0, has_value boolean default false, is_active boolean default true, sort int default 0,
    category text not null default 'sales', constraint kpi_metrics_category_check check (category in ('sales','general')));
  create table public.kpi_entries (id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), metric_id uuid not null references public.kpi_metrics(id),
    entry_date date default current_date, quantity numeric default 1, value_egp numeric, reference text, notes text, status text default 'pending', approved_at timestamptz,
    source text not null default 'app', external_id text unique, constraint kpi_entries_source_check check (source in ('app','crm')));
  -- HR already owns objects with these names: HV Ops must leave them alone
  create table public.tasks (id int primary key, hr_marker text); create table public.profiles (id uuid primary key, hr_marker text);
  create function public.my_role() returns text language sql as $f$ select 'hr-owned'::text $f$;
`);
for (const f of ['001_init.sql', '002_seed_settings.sql', '003_views.sql', '004_rls.sql', '005_triggers.sql', '006_site_codes.sql', '007_hr_kpis.sql', '008_media_flags_codes.sql', '009_owner_photos_uploader.sql', '010_two_stage_kpis.sql', '011_projects.sql', '003_views.sql']) {
  try { await db.exec(fs.readFileSync(new URL(f, dir), 'utf8')); ok('run ' + f, true); } catch (e) { ok('run ' + f, false, e.message); process.exit(1); }
}
for (const f of ['001_init.sql', '002_seed_settings.sql', '003_views.sql', '004_rls.sql', '005_triggers.sql', '006_site_codes.sql', '007_hr_kpis.sql', '008_media_flags_codes.sql', '009_owner_photos_uploader.sql', '010_two_stage_kpis.sql', '011_projects.sql', '003_views.sql']) {
  try { await db.exec(fs.readFileSync(new URL(f, dir), 'utf8')); ok('re-run ' + f, true); } catch (e) { ok('re-run ' + f, false, e.message); }
}

// users live in HR's app_users; HV Ops access + role are two columns on it
await db.exec(`insert into auth.users (id,email) values
  ('00000000-0000-0000-0000-00000000000a','admin@x.com'),('00000000-0000-0000-0000-00000000000b','mgr@x.com'),
  ('00000000-0000-0000-0000-00000000000c','de1@x.com'),('00000000-0000-0000-0000-00000000000d','de2@x.com'),('00000000-0000-0000-0000-00000000000e','mk@x.com'),
  ('00000000-0000-0000-0000-00000000000f','hronly@x.com');
  insert into app_users (id,email,full_name_en,role,access_ops,ops_role) values
  ('00000000-0000-0000-0000-00000000000a','admin@x.com','Daniel','ceo',true,null),('00000000-0000-0000-0000-00000000000b','mgr@x.com','Mona','manager',true,'manager'),
  ('00000000-0000-0000-0000-00000000000c','de1@x.com','de1','staff',true,'data_entry'),('00000000-0000-0000-0000-00000000000d','de2@x.com','de2','staff',true,'data_entry'),
  ('00000000-0000-0000-0000-00000000000e','mk@x.com','mk','staff',true,'marketing'),('00000000-0000-0000-0000-00000000000f','hronly@x.com','HR only','hr',false,null);
  insert into employees (user_id) select id from app_users;`);
let r = await db.query(`select my_role() hr_fn, (select count(*) from information_schema.columns where table_name='tasks' and column_name='hr_marker')::int t`);
ok("HR's own my_role() and tasks table are untouched", r.rows[0].hr_fn === 'hr-owned' && r.rows[0].t === 1);
const A = '00000000-0000-0000-0000-00000000000a', M = '00000000-0000-0000-0000-00000000000b', D1 = '00000000-0000-0000-0000-00000000000c', D2 = '00000000-0000-0000-0000-00000000000d', MK = '00000000-0000-0000-0000-00000000000e';

// website already uses serial 2500 -> new serials must start above it
await db.exec(`insert into ops_wp_listing_index (reference_code,url,wp_published_at) values ('SB-A-2500-S','https://x/1', now() - interval '5 hours')`);

await asUser(D1);
r = await db.query(`insert into ops_listings (location,property_type,deal_type,source_type,source_name,entered_by,bedrooms) values ('Hadaba','Apartment','sale','owner','Mr X','${D1}',2) returning *`);
const L = r.rows[0];
ok('ref code generated LOC-TYPE-SERIAL-S above site max', L.reference_code === 'HD-A-2501-S', L.reference_code);
ok('completeness computed', L.completeness_pct === Math.floor(100 * 4 / 18) && L.missing_fields.includes('price') && !L.missing_fields.includes('bedrooms'), `${L.completeness_pct}% missing=${L.missing_fields.length}`);
r = await db.query(`select channel from ops_listing_channels where listing_id='${L.id}' order by 1`);
ok('3 default channels created', r.rows.length === 3, r.rows.map((x) => x.channel).join(','));
await expectErr('cannot go ready_to_publish while incomplete', `update ops_listings set status='ready_to_publish' where id='${L.id}'`, /complete/i);
await expectErr('staff cannot set verified_live', `update ops_listings set status='verified_live' where id='${L.id}'`, /verifier/i);
await expectErr('staff cannot change date_received', `update ops_listings set date_received=now() - interval '1 day' where id='${L.id}'`, /date_received/);
await expectErr('reference code immutable', `update ops_listings set reference_code='HD-A-1-S' where id='${L.id}'`, /reference code/i);
await expectErr('hold needs a reason', `update ops_listings set status='on_hold' where id='${L.id}'`, /hold reason/i);
await expectErr('staff cannot reject', `update ops_listings set status='rejected', rejection_reason='x' where id='${L.id}'`, /manager/i);
await expectErr('unknown location => clear error', `insert into ops_listings (location,property_type,deal_type,source_type,source_name,entered_by) values ('Atlantis','Apartment','sale','owner','x','${D1}')`, /No location code/);
await expectErr('cannot insert as someone else (RLS)', `insert into ops_listings (location,property_type,deal_type,source_type,source_name,entered_by) values ('Hadaba','Villa','rent','owner','x','${D2}')`, /row-level security/);
await expectErr('DELETE revoked', `delete from ops_listings where id='${L.id}'`, /permission denied/);

// fill everything -> 100% -> ready -> claimed
await db.exec(`update ops_listings set title='T', area_sqm=80, building_levels=4, floor=2, bathrooms=1, balconies=1, furnished=false, owner_name='Mr Owner',
  is_exclusive=false, view_type='Sea view', price=90000, currency='eur', facilities='{Elevator}', selling_points='sp', cover_photo_belongs=true where id='${L.id}'`);
r = await db.query(`select completeness_pct, missing_fields from ops_listings where id='${L.id}'`);
ok('photos not approved yet keeps the listing incomplete; buyer persona is optional', r.rows[0].completeness_pct < 100 && r.rows[0].missing_fields.join() === 'media_uploaded', JSON.stringify(r.rows[0]));
await expectErr('staff cannot mark their own photos as ready', `update ops_listings set media_uploaded=true where id='${L.id}'`, /Only the manager/);
await asUser(M); await db.exec(`update ops_listings set media_uploaded=true, media_has_logo=true, media_edited=false where id='${L.id}'`);
r = await db.query(`select media_approved_by from ops_listings where id='${L.id}'`); ok('manager approves photos; approver recorded', r.rows[0].media_approved_by === M);
await asUser(D1);
r = await db.query(`select completeness_pct, currency from ops_listings where id='${L.id}'`);
ok('100% after filling (false booleans count as filled), currency uppercased', r.rows[0].completeness_pct === 100 && r.rows[0].currency === 'EUR', JSON.stringify(r.rows[0]));
await db.exec(`update ops_listings set status='ready_to_publish' where id='${L.id}'`);
await db.exec(`update ops_listings set status='on_hold', hold_reason='owner away' where id='${L.id}'`);
await asService(); await db.exec(`update ops_listings set hold_started_at = now() - interval '10 hours', date_received = now() - interval '30 hours' where id='${L.id}'`);
r = await db.query(`select round(hours_elapsed) h, sla_state from ops_vw_listing_sla where id='${L.id}'`);
ok('view: on_hold time excluded (30h - 10h = 20h)', Number(r.rows[0].h) === 20 && r.rows[0].sla_state === 'green', JSON.stringify(r.rows[0]));
await asUser(D1); await db.exec(`update ops_listings set status='ready_to_publish' where id='${L.id}'`);
r = await db.query(`select paused_seconds, hold_started_at from ops_listings where id='${L.id}'`);
ok('resume accumulates paused_seconds (~36000)', Math.abs(Number(r.rows[0].paused_seconds) - 36000) < 5 && r.rows[0].hold_started_at === null, String(r.rows[0].paused_seconds));
await db.exec(`update ops_listings set status='published_claimed' where id='${L.id}'`);
r = await db.query(`select date_published_claimed is not null c, published_claimed_by u from ops_listings where id='${L.id}'`); ok('claim stamps date_published_claimed + who uploaded it', r.rows[0].c && r.rows[0].u === D1);

// other data_entry user: can read, cannot update
await asUser(D2);
r = await db.query(`select count(*)::int n from ops_listings`); ok('other staff can READ all listings', r.rows[0].n === 1);
r = await db.query(`update ops_listings set title='hacked' where id='${L.id}' returning id`); ok('other staff cannot UPDATE (RLS filters row)', r.rows.length === 0);
r = await db.query(`select count(*)::int n from ops_audit_log`); ok('staff cannot read audit_log', r.rows[0].n === 0);
await expectErr('staff cannot change settings', `insert into ops_settings(key,value) values ('x','1')`, /row-level security/);

// verifier (service role) verifies it
await asService();
await db.exec(`update ops_listings set status='verified_live', date_published_verified = now() - interval '1 hour' where id='${L.id}'`);
r = await db.query(`select hours_to_publish, is_on_time, sla_state, claimed_not_found from ops_vw_listing_sla where id='${L.id}'`);
ok('service role can verify; view gives hours_to_publish + on time', r.rows[0].is_on_time === true && Number(r.rows[0].hours_to_publish) > 18 && Number(r.rows[0].hours_to_publish) < 20, JSON.stringify(r.rows[0]));

// claimed_not_found
await db.exec(`insert into ops_listings (location,property_type,deal_type,source_type,source_name,entered_by,status,date_received,date_published_claimed)
  values ('El Gouna','Villa','rent','owner','x','${D1}','published_claimed', now() - interval '100 hours', now() - interval '30 hours')`);
r = await db.query(`select reference_code, sla_state, claimed_not_found from ops_vw_listing_sla where status='published_claimed'`);
ok('claimed_not_found + red after 72h, serial is exactly last + 1 (G-V-2502-R)', r.rows[0].claimed_not_found === true && r.rows[0].sla_state === 'red' && r.rows[0].reference_code === 'G-V-2502-R', JSON.stringify(r.rows[0]));

// tasks: approval is manager-only, send-back needs a reason
await asUser(D1);
r = await db.query(`insert into ops_tasks (title,assigned_to,created_by,due_at) values ('Do it','${D1}','${D1}', now() + interval '1 day') returning id`); const T = r.rows[0].id;
await db.exec(`update ops_tasks set status='doing' where id='${T}'; update ops_tasks set status='review' where id='${T}';`);
await expectErr('staff cannot approve own task', `update ops_tasks set status='done' where id='${T}'`, /manager/i);
await asUser(M);
await expectErr('send back needs reason', `update ops_tasks set status='doing' where id='${T}'`, /reason/i);
await db.exec(`update ops_tasks set status='done' where id='${T}'`);
r = await db.query(`select approved_by, completed_at is not null c, started_at is not null s from ops_tasks where id='${T}'`);
ok('manager approves: approved_by + timestamps set', r.rows[0].approved_by === M && r.rows[0].c && r.rows[0].s);

// agencies: marketing logs, only manager approves
await asUser(MK);
r = await db.query(`insert into ops_agency_deliverables (agency_id,period_month,item_type,planned_qty,delivered_qty,due_date,status) select id, date_trunc('month',now())::date,'post',10,5,current_date + 5,'submitted' from ops_agencies where name='izmi' returning id, logged_by, delivered_at`);
ok('marketing can log deliverable (logged_by + delivered_at auto)', r.rows[0].logged_by === MK && r.rows[0].delivered_at !== null);
await expectErr('marketing cannot approve deliverable', `update ops_agency_deliverables set status='approved' where id='${r.rows[0].id}'`, /manager/i);
await asUser(D1);
await expectErr('data_entry cannot log deliverables', `insert into ops_agency_deliverables (agency_id,period_month,item_type) select id, current_date,'post' from ops_agencies limit 1`, /row-level security/);

// recurring upsert target used by the worker
await asService();
r = await db.query(`insert into ops_recurring_templates (title,frequency,assigned_to) values ('Daily check','daily','${D1}') returning id`);
const q = `insert into ops_tasks (title,recurring_template_id,recurring_for_date) values ('Daily check','${r.rows[0].id}','2026-09-20') on conflict (recurring_template_id,recurring_for_date) do nothing`;
await db.exec(q); await db.exec(q);
r = await db.query(`select count(*)::int n from ops_tasks where recurring_for_date='2026-09-20'`); ok('recurring task generation is idempotent', r.rows[0].n === 1);
r = await db.query(`insert into ops_alerts (title,dedupe_key) values ('a','k1') on conflict (dedupe_key) do nothing returning id`); await db.exec(`insert into ops_alerts (title,dedupe_key) values ('a','k1') on conflict (dedupe_key) do nothing`);
r = await db.query(`select count(*)::int n from ops_alerts`); ok('alert dedupe', r.rows[0].n === 1);

// audit + KPI views
await asUser(A);
r = await db.query(`select count(*)::int n, count(*) filter (where field_name='status')::int s, count(*) filter (where changed_by is null and field_name='status')::int v from ops_audit_log where table_name='ops_listings'`);
ok('audit log has per-field rows incl. verifier (null user)', r.rows[0].n > 10 && r.rows[0].s >= 5 && r.rows[0].v >= 1, JSON.stringify(r.rows[0]));
r = await db.query(`select full_name, listings_entered, avg_completeness, on_time_pct, claimed_not_found_count, portal_coverage_pct, tasks_completed from ops_vw_user_kpis order by listings_entered desc`);
ok('vw_user_kpis returns rows', r.rows.length >= 1 && Number(r.rows[0].listings_entered) === 2, JSON.stringify(r.rows[0]));
r = await db.query(`select * from ops_vw_agency_scorecard`); ok('vw_agency_scorecard', Number(r.rows[0].delivery_rate_pct) === 50, JSON.stringify(r.rows[0]));
await asService(); await db.exec(`update app_users set access_ops=false where id='${D2}'`); await asUser(D2);
r = await db.query(`select count(*)::int n from ops_listings`); ok('HV Ops access switched off in HR => sees nothing', r.rows[0].n === 0);
await asUser('00000000-0000-0000-0000-00000000000f');
r = await db.query(`select (select count(*) from ops_listings)::int l, (select count(*) from ops_profiles)::int p`); ok('HR-only user has no HV Ops access at all', r.rows[0].l === 0 && r.rows[0].p === 0);
await asUser(D1);
r = await db.query(`select (select count(*) from ops_profiles)::int p, (select count(*) from app_users)::int a, (select role from ops_profiles where email='admin@x.com') ceo_role`);
ok('ops staff see colleagues via ops_profiles but still only their own app_users row; CEO defaults to admin', r.rows[0].p === 5 && r.rows[0].a === 1 && r.rows[0].ceo_role === 'admin', JSON.stringify(r.rows[0]));

// ---- projects: own serial, P-LOC-###-S, website auto-ids (PRJ-…) ignored
await asService();
await db.exec(`insert into ops_wp_project_index (reference_code,url) values ('P-MG-929-S','https://x/p1'),('PRJ-013330','https://x/p2'),('P-314-01-S','https://x/p3')`);
await asUser(D1);
r = await db.query(`insert into ops_projects (name,location,entered_by,assigned_to,developer) values ('Red Hills','Sahl Hasheesh','${D1}','${D1}','Enza') returning *`);
const PJ = r.rows[0];
ok('project code = P-LOC-(last project serial + 1)-S, independent of unit serials', PJ.reference_code === 'P-SH-930-S', PJ.reference_code);
ok('project completeness uses its own required list', PJ.completeness_pct === Math.floor(100 * 3 / 13) && PJ.missing_fields.includes('starting_price'), PJ.completeness_pct + '%');
await expectErr('project cannot go ready while incomplete', `update ops_projects set status='ready_to_publish' where id='${PJ.id}'`, /complete/i);
await db.exec(`update ops_projects set project_types='{Apartment}', unit_sizes='57-180', starting_price=5000000, currency='egp', down_payment='10%', delivery_date='2028', finishing='Fully Finished', facilities='{Pool}', selling_points='x' where id='${PJ.id}'`);
await expectErr('staff cannot approve project media', `update ops_projects set media_uploaded=true where id='${PJ.id}'`, /Only the manager/);
await asUser(M); await db.exec(`update ops_projects set media_uploaded=true where id='${PJ.id}'`); await asUser(D1);
await db.exec(`update ops_projects set status='ready_to_publish' where id='${PJ.id}'`); await db.exec(`update ops_projects set status='published_claimed' where id='${PJ.id}'`);
await asService(); await db.exec(`update ops_projects set status='verified_live', date_published_verified=now() where id='${PJ.id}'`);
r = await db.query(`select m.code from kpi_entries k join kpi_metrics m on m.id=k.metric_id where k.external_id like 'ops:p%' order by 1`);
ok('project KPIs reach HR: ready + live + on time', r.rows.map((x) => x.code).join() === 'ops_project_live,ops_project_on_time,ops_project_ready', r.rows.map((x) => x.code).join());
await db.exec(`delete from kpi_entries where external_id like 'ops:p%'`);
r = await db.query(`insert into ops_projects (name,location,entered_by) values ('Second','Magawish','${D1}') returning reference_code`); ok('next project serial', r.rows[0].reference_code === 'P-MG-931-S', r.rows[0].reference_code);

// KPI bridge into HR
await asUser(A);
r = await db.query(`insert into ops_listings (location,property_type,deal_type,source_type,source_name,entered_by,assigned_to,title,area_sqm,building_levels,floor,bedrooms,bathrooms,balconies,furnished,
  is_exclusive,view_type,price,currency,facilities,selling_points,cover_photo_belongs,media_uploaded) values ('Hadaba','Villa','sale','owner','x','${A}','${D2}','CEO listing',80,1,1,1,1,1,true,false,'Sea view',1,'EUR','{Pool}','sp',true,true) returning id, completeness_pct`);
const CL = r.rows[0].id;
await db.exec(`update ops_listings set status='ready_to_publish' where id='${CL}'`);
await asService(); await db.exec(`update app_users set access_ops=true where id='${D2}'`); await asUser(D2);
await db.exec(`update ops_listings set status='published_claimed' where id='${CL}'`);
await asService(); await db.exec(`update ops_listings set status='verified_live', date_published_verified=now() where id='${CL}'`);
r = await db.query(`select m.code, (select user_id from employees e where e.id=k.employee_id) u from kpi_entries k join kpi_metrics m on m.id=k.metric_id where k.external_id like '%' || '${CL}' order by 1`);
ok('CEO who entered is NOT scored; the uploader gets live + on-time', r.rows.map((x) => x.code).join() === 'ops_listing_live,ops_listing_on_time' && r.rows.every((x) => x.u === D2), JSON.stringify(r.rows));
await asUser(A);
r = await db.query(`select listings_entered, listings_uploaded from ops_vw_user_kpis where user_id='${D2}'`); ok('view: uploader counted under listings_uploaded', Number(r.rows[0].listings_uploaded) === 1);
await asService();
await db.exec(`update app_users set access_ops=false where id='${D2}'`);
r = await db.query(`select external_id from kpi_entries where external_id like '%' || '${CL}'`); const ceoIds = r.rows.map((x) => "'" + x.external_id + "'").join(',');
await db.exec(`delete from kpi_entries where external_id in (${ceoIds})`);
await asService();
r = await db.query(`select m.code, e.status, e.source, e.external_id from kpi_entries e join kpi_metrics m on m.id=e.metric_id order by m.code`);
const codes = r.rows.map((x) => x.code + ':' + x.status).join(',');
ok('HR kpi_entries: entered-ready + live + on time + task on time, all source=ops', codes === 'ops_listing_live:approved,ops_listing_on_time:approved,ops_listing_ready:approved,ops_task_on_time:approved' && r.rows.every((x) => x.source === 'ops'), codes);
await db.exec(`update ops_tasks set status='doing', rejection_reason='redo' where title='Do it'`);
r = await db.query(`select status from kpi_entries where external_id like 'ops:task:%'`); ok('reopened task => HR entry rejected', r.rows[0].status === 'rejected');
await db.exec(`update ops_tasks set status='done' where title='Do it'`);
r = await db.query(`select count(*)::int n, min(status) s from kpi_entries where external_id like 'ops:task:%'`); ok('re-approved task => same entry approved again (no duplicate)', r.rows[0].n === 1 && r.rows[0].s === 'approved');

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
