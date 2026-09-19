# HV Ops

Internal operations system for Home & Vacation (Hurghada): listing pipeline with a 72-hour SLA verified against the live
website, tasks, agency scorecards, KPIs and reports.

- **App**: one file, `index.html` (React 18.3.1 + Babel Standalone 7.25.6 `data-presets="react"` + Tailwind + supabase-js, all from CDN). No build step on the server.
- **Backend**: a NEW Supabase project (never `oawvsmcvqkyyhapetlqi` — that is the maintenance/HR/CRM database).
- **Worker**: `worker/verifier.js` on Cloudflare Workers — hourly website verifier + alerts, nightly recurring tasks, and the admin "create user" endpoint.
- **Hosting**: Cloudflare Pages (`.pages.dev`). Never Netlify.

Current version: **v1.0.0** (shown in the login footer and the sidebar — bump `APP_VERSION` on every deploy).

## Repo layout

```
index.html              the whole app (this is the only file Cloudflare Pages needs)
parts/                  the same app split into readable pieces; build.sh joins them into index.html
build.sh                sh build.sh  ->  regenerates index.html from parts/
worker/verifier.js      Cloudflare Worker
worker/wrangler.toml
sql/001_init.sql        enums + tables
sql/002_seed_settings.sql   location/unit codes, SLA hours, required fields, agencies, metric lists
sql/003_views.sql       vw_listing_sla, vw_user_kpis, vw_agency_scorecard
sql/004_rls.sql         row level security, no DELETE for anyone
sql/005_triggers.sql    reference code, completeness, guards, audit log, default channels
```

Edit the files in `parts/`, run `sh build.sh`, commit both. **All SQL is additive** — no DROP TABLE / DROP COLUMN / TRUNCATE.
Every future schema change is a new numbered file (`006_…sql`). Files 001–005 are safe to re-run.

## Deploy

1. **Supabase** — create a new project, region EU (Frankfurt). In Authentication → Sign In / Providers turn **off** "Allow new users to sign up".
2. **SQL** — run `sql/001` → `005` in order in the SQL editor. (004 drops and recreates *policies* only; the "destructive" warning is safe.)
3. **Admin user** — Authentication → Users → Add user (auto-confirm). A profile row is created automatically but inactive. Then run:
   ```sql
   update profiles set role = 'admin', is_active = true, full_name = 'Daniel Essam' where email = 'YOUR_EMAIL';
   ```
4. **Keys** — put the project URL + anon key into `parts/02_core.jsx` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`), run `sh build.sh`.
   (If left as placeholders the app shows a "Connect" screen and keeps the values in the browser instead.)
5. **Pages** — push to GitHub `danielessam03/home-vacation-ops`, connect Cloudflare Pages: production branch `main`, build command empty, output dir `/`.
6. **Worker** —
   ```bash
   cd worker
   npx wrangler deploy
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_KEY
   ```
   The **service role key lives only here**, never in `index.html`. Then paste the worker URL into the app: Settings → Verifier → Worker URL.
   That switches on: New user form, password reset, "Run verifier now", "Generate today's recurring tasks".
7. Confirm the version in the login footer matches the commit.

## How verification works (checked against the live site, 19 Sep 2026)

- The listings post type is **`unit`** and it is REST-enabled: `/wp-json/wp/v2/unit` (493 units). REST gives URL, publish date and modified date.
- The **File Ref is not in the REST payload** (no ACF/meta exposed), so each new or modified page is fetched once and the ref is read from the
  "File Ref:" block in the HTML. Logged as method `rest+html`. If AGS ever exposes the field in REST, the worker picks it up with no page fetch.
- Fallback when REST fails: Rank Math sitemaps `unit-sitemap1..N.xml` → same page parse (`sitemap+html`).
- Every page looked at is remembered in `wp_crawl_log`, so a page is only re-read when WordPress says it was modified.
- Free Workers plan = 50 outbound requests per run, so `MAX_PAGE_FETCHES = 25`. The first backfill of the ~500 existing pages takes roughly a day of
  hourly runs (or press "Run verifier now" a few times). After that each run only reads what changed.
- A listing becomes `verified_live` when its reference code is in `wp_listing_index`. `date_published_verified` = the earlier of the WordPress
  publish date and the first sighting. Only the worker (service role) can set it — staff cannot, and that is enforced in the database.
- `claimed_not_found`: staff pressed "mark as published" more than 24h ago and the verifier still cannot find the code.

## Roles

| Role | Can |
|---|---|
| admin | everything, Settings, users |
| manager | reads everything; writes listings, tasks, deliverables, metrics, targets; approves; reports |
| data_entry | reads all listings, edits only own/assigned; cannot approve, reject, verify, or change `date_received` |
| marketing | same as data_entry + agency deliverables and metrics |

Nobody can DELETE (revoked at database level). Archive / deactivate instead. Every change lands in `audit_log`.

## WhatsApp (Phase 7 — built, disabled)

`sendWhatsApp(env, phone, template, vars)` in the worker targets the Meta WhatsApp Cloud API. To switch on after the number is approved:
create an approved template `hv_ops_alert` with two body variables (title, details), set secrets `WHATSAPP_TOKEN` and
`WHATSAPP_PHONE_NUMBER_ID`, set `WHATSAPP_ENABLED = "true"` in `wrangler.toml`, redeploy. Critical alerts are then sent to the assignee and
to every manager with a phone number in their profile.

## Open items

1. **Reference code prefixes on the site do not match the seeded table.** Live examples: `IN-A-788-S` (seed says `INT`), `MG-A-823-R` (`MGW`),
   `KW-S-1048-R` (`KWT`, and Studio is `S` not `ST`), `SB-A-1038-S` (`SMB`), `VR-V-1047-R`. Decide whether new codes follow the site's existing
   convention, then fix the two tables in Settings → Location codes / Unit type codes. Codes only affect NEW listings.
   New serials automatically start above the highest serial found on the website.
2. Backlog: import with the CSV importer. Rows that carry the site's File Ref keep it and get verified automatically; rows without one get a new
   code that has to be pasted into WordPress.
3. The facilities list is a starter set (the site's own facility taxonomy is too messy to import). Edit in Settings → Lists.
4. Agency monthly contract quantities: enter per month on the Agencies page ("Copy plan from last month" afterwards).
