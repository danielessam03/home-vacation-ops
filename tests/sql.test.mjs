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
`);
for (const f of ['001_init.sql', '002_seed_settings.sql', '003_views.sql', '004_rls.sql', '005_triggers.sql']) {
  try { await db.exec(fs.readFileSync(new URL(f, dir), 'utf8')); ok('run ' + f, true); } catch (e) { ok('run ' + f, false, e.message); process.exit(1); }
}
for (const f of ['001_init.sql', '002_seed_settings.sql', '003_views.sql', '004_rls.sql', '005_triggers.sql']) {
  try { await db.exec(fs.readFileSync(new URL(f, dir), 'utf8')); ok('re-run ' + f, true); } catch (e) { ok('re-run ' + f, false, e.message); }
}

// users: trigger creates INACTIVE data_entry profiles even if metadata claims admin
await db.exec(`insert into auth.users (id,email,raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a','admin@x.com','{"role":"admin"}'),('00000000-0000-0000-0000-00000000000b','mgr@x.com','{}'),
  ('00000000-0000-0000-0000-00000000000c','de1@x.com','{}'),('00000000-0000-0000-0000-00000000000d','de2@x.com','{}'),('00000000-0000-0000-0000-00000000000e','mk@x.com','{}');`);
let r = await db.query(`select role, is_active from profiles where email='admin@x.com'`);
ok('new user => inactive data_entry (metadata role ignored)', r.rows[0].role === 'data_entry' && r.rows[0].is_active === false);
await db.exec(`update profiles set is_active=true; update profiles set role='admin' where email='admin@x.com'; update profiles set role='manager' where email='mgr@x.com'; update profiles set role='marketing' where email='mk@x.com';`);
const A = '00000000-0000-0000-0000-00000000000a', M = '00000000-0000-0000-0000-00000000000b', D1 = '00000000-0000-0000-0000-00000000000c', D2 = '00000000-0000-0000-0000-00000000000d', MK = '00000000-0000-0000-0000-00000000000e';

// website already uses serial 2500 -> new serials must start above it
await db.exec(`insert into wp_listing_index (reference_code,url,wp_published_at) values ('SB-A-2500-S','https://x/1', now() - interval '5 hours')`);

await asUser(D1);
r = await db.query(`insert into listings (location,property_type,deal_type,source_type,source_name,entered_by,bedrooms) values ('Hadaba','Apartment','sale','owner','Mr X','${D1}',2) returning *`);
const L = r.rows[0];
ok('ref code generated LOC-TYPE-SERIAL-S above site max', L.reference_code === 'HD-A-2501-S', L.reference_code);
ok('completeness computed', L.completeness_pct === Math.floor(100 * 4 / 22) && L.missing_fields.includes('price') && !L.missing_fields.includes('bedrooms'), `${L.completeness_pct}% missing=${L.missing_fields.length}`);
r = await db.query(`select channel from listing_channels where listing_id='${L.id}' order by 1`);
ok('3 default channels created', r.rows.length === 3, r.rows.map((x) => x.channel).join(','));
await expectErr('cannot go ready_to_publish while incomplete', `update listings set status='ready_to_publish' where id='${L.id}'`, /complete/i);
await expectErr('staff cannot set verified_live', `update listings set status='verified_live' where id='${L.id}'`, /verifier/i);
await expectErr('staff cannot change date_received', `update listings set date_received=now() - interval '1 day' where id='${L.id}'`, /date_received/);
await expectErr('reference code immutable', `update listings set reference_code='HD-A-1-S' where id='${L.id}'`, /reference code/i);
await expectErr('hold needs a reason', `update listings set status='on_hold' where id='${L.id}'`, /hold reason/i);
await expectErr('staff cannot reject', `update listings set status='rejected', rejection_reason='x' where id='${L.id}'`, /manager/i);
await expectErr('unknown location => clear error', `insert into listings (location,property_type,deal_type,source_type,source_name,entered_by) values ('Atlantis','Apartment','sale','owner','x','${D1}')`, /No location code/);
await expectErr('cannot insert as someone else (RLS)', `insert into listings (location,property_type,deal_type,source_type,source_name,entered_by) values ('Hadaba','Villa','rent','owner','x','${D2}')`, /row-level security/);
await expectErr('DELETE revoked', `delete from listings where id='${L.id}'`, /permission denied/);

// fill everything -> 100% -> ready -> claimed
await db.exec(`update listings set title='T', area_sqm=80, building_levels=4, floor=2, bathrooms=1, balconies=1, furnished=false, media_images_count=10, media_videos_count=1,
  is_exclusive=false, view_type='Sea view', price=90000, currency='eur', facilities='{Elevator}', selling_points='sp', buyer_persona_nationality='DE',
  buyer_persona_age_range='45-54', buyer_persona_gender='Any', cover_photo_belongs=true where id='${L.id}'`);
r = await db.query(`select completeness_pct, currency from listings where id='${L.id}'`);
ok('100% after filling (false booleans count as filled), currency uppercased', r.rows[0].completeness_pct === 100 && r.rows[0].currency === 'EUR', JSON.stringify(r.rows[0]));
await db.exec(`update listings set status='ready_to_publish' where id='${L.id}'`);
await db.exec(`update listings set status='on_hold', hold_reason='owner away' where id='${L.id}'`);
await asService(); await db.exec(`update listings set hold_started_at = now() - interval '10 hours', date_received = now() - interval '30 hours' where id='${L.id}'`);
r = await db.query(`select round(hours_elapsed) h, sla_state from vw_listing_sla where id='${L.id}'`);
ok('view: on_hold time excluded (30h - 10h = 20h)', Number(r.rows[0].h) === 20 && r.rows[0].sla_state === 'green', JSON.stringify(r.rows[0]));
await asUser(D1); await db.exec(`update listings set status='ready_to_publish' where id='${L.id}'`);
r = await db.query(`select paused_seconds, hold_started_at from listings where id='${L.id}'`);
ok('resume accumulates paused_seconds (~36000)', Math.abs(Number(r.rows[0].paused_seconds) - 36000) < 5 && r.rows[0].hold_started_at === null, String(r.rows[0].paused_seconds));
await db.exec(`update listings set status='published_claimed' where id='${L.id}'`);
r = await db.query(`select date_published_claimed is not null c from listings where id='${L.id}'`); ok('claim stamps date_published_claimed', r.rows[0].c);

// other data_entry user: can read, cannot update
await asUser(D2);
r = await db.query(`select count(*)::int n from listings`); ok('other staff can READ all listings', r.rows[0].n === 1);
r = await db.query(`update listings set title='hacked' where id='${L.id}' returning id`); ok('other staff cannot UPDATE (RLS filters row)', r.rows.length === 0);
r = await db.query(`select count(*)::int n from audit_log`); ok('staff cannot read audit_log', r.rows[0].n === 0);
await expectErr('staff cannot change settings', `insert into settings(key,value) values ('x','1')`, /row-level security/);

// verifier (service role) verifies it
await asService();
await db.exec(`update listings set status='verified_live', date_published_verified = now() - interval '1 hour' where id='${L.id}'`);
r = await db.query(`select hours_to_publish, is_on_time, sla_state, claimed_not_found from vw_listing_sla where id='${L.id}'`);
ok('service role can verify; view gives hours_to_publish + on time', r.rows[0].is_on_time === true && Number(r.rows[0].hours_to_publish) > 18 && Number(r.rows[0].hours_to_publish) < 20, JSON.stringify(r.rows[0]));

// claimed_not_found
await db.exec(`insert into listings (location,property_type,deal_type,source_type,source_name,entered_by,status,date_received,date_published_claimed)
  values ('El Gouna','Villa','rent','owner','x','${D1}','published_claimed', now() - interval '100 hours', now() - interval '30 hours')`);
r = await db.query(`select reference_code, sla_state, claimed_not_found from vw_listing_sla where status='published_claimed'`);
ok('claimed_not_found + red after 72h, code EG-V-xxxx-R', r.rows[0].claimed_not_found === true && r.rows[0].sla_state === 'red' && /^EG-V-\d+-R$/.test(r.rows[0].reference_code), JSON.stringify(r.rows[0]));

// tasks: approval is manager-only, send-back needs a reason
await asUser(D1);
r = await db.query(`insert into tasks (title,assigned_to,created_by,due_at) values ('Do it','${D1}','${D1}', now() + interval '1 day') returning id`); const T = r.rows[0].id;
await db.exec(`update tasks set status='doing' where id='${T}'; update tasks set status='review' where id='${T}';`);
await expectErr('staff cannot approve own task', `update tasks set status='done' where id='${T}'`, /manager/i);
await asUser(M);
await expectErr('send back needs reason', `update tasks set status='doing' where id='${T}'`, /reason/i);
await db.exec(`update tasks set status='done' where id='${T}'`);
r = await db.query(`select approved_by, completed_at is not null c, started_at is not null s from tasks where id='${T}'`);
ok('manager approves: approved_by + timestamps set', r.rows[0].approved_by === M && r.rows[0].c && r.rows[0].s);

// agencies: marketing logs, only manager approves
await asUser(MK);
r = await db.query(`insert into agency_deliverables (agency_id,period_month,item_type,planned_qty,delivered_qty,due_date,status) select id, date_trunc('month',now())::date,'post',10,5,current_date + 5,'submitted' from agencies where name='izmi' returning id, logged_by, delivered_at`);
ok('marketing can log deliverable (logged_by + delivered_at auto)', r.rows[0].logged_by === MK && r.rows[0].delivered_at !== null);
await expectErr('marketing cannot approve deliverable', `update agency_deliverables set status='approved' where id='${r.rows[0].id}'`, /manager/i);
await asUser(D1);
await expectErr('data_entry cannot log deliverables', `insert into agency_deliverables (agency_id,period_month,item_type) select id, current_date,'post' from agencies limit 1`, /row-level security/);

// recurring upsert target used by the worker
await asService();
r = await db.query(`insert into recurring_templates (title,frequency,assigned_to) values ('Daily check','daily','${D1}') returning id`);
const q = `insert into tasks (title,recurring_template_id,recurring_for_date) values ('Daily check','${r.rows[0].id}','2026-09-20') on conflict (recurring_template_id,recurring_for_date) do nothing`;
await db.exec(q); await db.exec(q);
r = await db.query(`select count(*)::int n from tasks where recurring_for_date='2026-09-20'`); ok('recurring task generation is idempotent', r.rows[0].n === 1);
r = await db.query(`insert into alerts (title,dedupe_key) values ('a','k1') on conflict (dedupe_key) do nothing returning id`); await db.exec(`insert into alerts (title,dedupe_key) values ('a','k1') on conflict (dedupe_key) do nothing`);
r = await db.query(`select count(*)::int n from alerts`); ok('alert dedupe', r.rows[0].n === 1);

// audit + KPI views
await asUser(A);
r = await db.query(`select count(*)::int n, count(*) filter (where field_name='status')::int s, count(*) filter (where changed_by is null and field_name='status')::int v from audit_log where table_name='listings'`);
ok('audit log has per-field rows incl. verifier (null user)', r.rows[0].n > 10 && r.rows[0].s >= 5 && r.rows[0].v >= 1, JSON.stringify(r.rows[0]));
r = await db.query(`select full_name, listings_entered, avg_completeness, on_time_pct, claimed_not_found_count, portal_coverage_pct, tasks_completed from vw_user_kpis order by listings_entered desc`);
ok('vw_user_kpis returns rows', r.rows.length >= 1 && Number(r.rows[0].listings_entered) === 2, JSON.stringify(r.rows[0]));
r = await db.query(`select * from vw_agency_scorecard`); ok('vw_agency_scorecard', Number(r.rows[0].delivery_rate_pct) === 50, JSON.stringify(r.rows[0]));
await asUser(D1); await db.exec(`update profiles set is_active=true where id='${D1}'`).catch(() => {});
await asService(); await db.exec(`update profiles set is_active=false where id='${D2}'`); await asUser(D2);
r = await db.query(`select count(*)::int n from listings`); ok('deactivated user sees nothing', r.rows[0].n === 0);

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
