# HV Ops

Internal operations system for Home & Vacation (Hurghada): listing pipeline with a 72-hour SLA verified against the live
website, tasks, agency scorecards, KPIs and reports.

- **App**: one file, `index.html` (React 18.3.1 + Babel Standalone 7.25.6 `data-presets="react"` + Tailwind + supabase-js, all from CDN).
- **Backend**: its own Supabase project (never `oawvsmcvqkyyhapetlqi` — that is the maintenance/HR/CRM database).
- **Worker**: `worker/verifier.js` on Cloudflare Workers — hourly website verifier + alerts, nightly recurring tasks, admin "create user" endpoint.
- **Hosting**: Cloudflare Pages (`.pages.dev`). Never Netlify.

Current version: **v1.0.0** (login footer + sidebar — bump `APP_VERSION` on every deploy).

## Live (set up 2026-09-19)

| What | Where |
|---|---|
| App | https://home-vacation-ops.pages.dev — Cloudflare Pages project `home-vacation-ops`, direct upload |
| Worker | https://hv-ops-verifier.homevacation1950.workers.dev — crons: hourly, and 22:00 UTC |
| Supabase | project `bwmcdspfgiaodeiplppc` (home-vacation-ops, Frankfurt). Public sign-up is OFF. Legacy anon/service_role keys are DISABLED: the app uses the publishable key, the worker uses the secret key named `hv_ops_worker`. |
| Secrets on this PC | `C:\Users\Essam\.hv-ops-secrets\` — deliberately OUTSIDE the repo folder |

## Repo layout

```
index.html              the whole app (the only file that is deployed)
parts/                  the same app split into readable pieces; build.sh joins them into index.html
build.sh                regenerates index.html from parts/
deploy.sh               build + upload ONLY index.html to Cloudflare Pages
worker/verifier.js      Cloudflare Worker          worker/wrangler.toml
worker/run-local.mjs    same verifier run from this PC (no 50-request limit) — used for the first backfill
sql/001_init.sql        enums + tables
sql/002_seed_settings.sql   codes, SLA hours, required fields, agencies, metric lists
sql/003_views.sql       vw_listing_sla, vw_user_kpis, vw_agency_scorecard
sql/004_rls.sql         row level security, no DELETE for anyone
sql/005_triggers.sql    reference code, completeness, guards, audit log, default channels
sql/006_site_codes.sql  reference-code prefixes aligned with the website
tests/sql.test.mjs      runs all SQL in PGlite and checks triggers / RLS / views (47 checks)
```

**All SQL is additive** — no DROP TABLE / DROP COLUMN / TRUNCATE. Every schema change is a new numbered file. All files are safe to re-run.

## Release a new version

1. Edit files in `parts/`, bump `APP_VERSION` in `parts/02_core.jsx`.
2. Run `sh deploy.sh` — it builds `index.html` and uploads only that file. Then commit and push.
3. Check the version number in the login footer.

**Never run `wrangler deploy` or `wrangler pages project create` from the repo root.** Wrangler then publishes the whole folder,
including git-ignored files, as public assets. This happened once during setup (about five minutes); the exposed keys were revoked
immediately and the database was confirmed untouched. That is why secrets now live outside the repo folder.

- Worker change: `cd worker`, then `npx wrangler deploy` (that folder has its own `wrangler.toml` and no assets). Secrets: always pass `--name hv-ops-verifier`.
- SQL change: new numbered file in `sql/`, run `node tests/sql.test.mjs`, then run the file in the Supabase SQL editor.

## First admin user (one time)

Supabase → Authentication → Users → **Add user** (your email + a password, tick Auto-confirm). A profile row appears automatically, inactive.
Then in the SQL editor:

```sql
update profiles set role = 'admin', is_active = true, full_name = 'Daniel Essam' where email = 'YOUR_EMAIL';
```

After that, create everyone else inside the app: Settings → Users → New user.

## How verification works (checked against the live site, 19 Sep 2026)

- The listings post type is **`unit`**, REST-enabled at `/wp-json/wp/v2/unit` (493 units). REST gives URL, publish date, modified date.
- The **File Ref is not in the REST payload**, so each new or modified page is fetched once and the ref is read from the "File Ref:" block
  of the HTML. Logged as method `rest+html`. If AGS ever exposes the field in REST, the worker uses it with no page fetch.
- Fallback when REST fails: Rank Math sitemaps `unit-sitemap1..N.xml`, same page parse (`sitemap+html`).
- Every page looked at is remembered in `wp_crawl_log`; a page is re-read only when WordPress says it was modified.
- Free Workers plan = 50 outbound requests per run, hence `MAX_PAGE_FETCHES = 25`. The first backfill of all 493 pages was done from this PC
  with `node worker/run-local.mjs`. Hourly runs now only read what changed.
- A listing becomes `verified_live` when its reference code is in `wp_listing_index`. `date_published_verified` = the earlier of the WordPress
  publish date and the first sighting. Only the worker can set it — enforced in the database, not just the UI.
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
create an approved template `hv_ops_alert` with two body variables (title, details); set secrets `WHATSAPP_TOKEN` and
`WHATSAPP_PHONE_NUMBER_ID` (with `--name hv-ops-verifier`); set `WHATSAPP_ENABLED = "true"` in `worker/wrangler.toml`; redeploy the worker.
Critical alerts then go to the assignee and to every manager with a phone number in their profile.

## Open items

1. **Reference codes follow the website** (sql/006, derived from all 493 live listings): IN, MG, KW, SB, MK, AH, G, Studio = S, and so on.
   Exceptions: Sheraton = SHR (the site uses SH for both Sheraton and Sahl Hasheesh), New El Kawther = NKW, El Wozra = WZR and
   Makadina = MKN (no examples on the site). Site locations with no code yet: Ain Sokhna, Airport Road, Marina, Qeadat — add in Settings → Location codes.
2. Every one of the 493 website listings has a File Ref, but 159 use older formats (for example `A-520-00-S`, `MK-A-717-0-R`). They import
   and verify fine as they are. New serials start at 1049 automatically (highest on the site is 1048).
3. GitHub: the repo exists only on this PC. Create an empty repo `danielessam03/home-vacation-ops`, then `git remote add origin …` and `git push -u origin main`.
4. The facilities list is a starter set (the site's facility taxonomy is too messy to import). Edit in Settings → Lists.
5. Agency monthly fees and contract quantities: Settings → Agencies, then the Agencies page per month.
