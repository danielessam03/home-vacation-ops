# HV Ops

Internal operations system for Home & Vacation (Hurghada): listing pipeline with a 72-hour SLA verified against the live
website, tasks, agency scorecards, KPIs and reports. It is the 4th Home Vacation system, next to HR, Maintenance and the CRM.

- **App**: one file, `index.html` (React 18.3.1 + Babel Standalone 7.25.6 `data-presets="react"` + Tailwind + supabase-js, all from CDN).
- **Backend**: the UNIFIED Home Vacation Supabase project `plwyzkqlbzcikmuurjqg` — the same database and the same logins as HR,
  Maintenance and the CRM. Every HV Ops object is prefixed `ops_` so nothing collides with the other systems.
- **Worker**: `worker/verifier.js` on Cloudflare Workers — hourly matching + alerts, nightly recurring tasks.
- **Hosting**: Cloudflare Pages (`.pages.dev`). Never Netlify.

Current version: **v1.13.0** (login footer + sidebar — bump `APP_VERSION` on every deploy).

## Live

| What | Where |
|---|---|
| App | https://home-vacation-ops.pages.dev — Cloudflare Pages project `home-vacation-ops`, direct upload |
| Worker | https://hv-ops-verifier.homevacation1950.workers.dev — crons: hourly, and 22:00 UTC |
| Database | unified project `plwyzkqlbzcikmuurjqg`. The app uses the same publishable key as HR; the worker uses its own secret key `hv_ops_worker`. |
| Secrets on this PC | `C:\Users\Essam\.hv-ops-secrets\` — deliberately OUTSIDE the repo folder |
| Retired | project `bwmcdspfgiaodeiplppc` (the first, standalone setup of 19 Sep 2026). Empty and unused — pause or delete it in the Supabase dashboard. |

## One login for all systems (managed in HR)

- People sign in with the same **username (or email) and password** as HR / Maintenance / CRM. HV Ops has no user table of its own.
- In **HR → Users → a person → Login & system access**: tick **HV Ops** and pick the role (Admin, Marketing manager, Data entry, Marketing).
  That is the `access_ops` + `ops_role` pair on HR's `app_users`. A CEO with no role picked is an HV Ops admin.
- Password resets, new logins, disabling a login, terminating an employee: all done in HR and they apply here instantly.
- HV Ops → Settings → Users is a read-only list with a link to HR.

## KPIs flow into HR

Automatic, pre-approved entries in HR's KPI module (category **Marketing & data entry (HV Ops)**, source `ops`), credited to the HR
employee linked to the login. Change the points in HR → KPIs → Metrics.

| Event in HV Ops | HR metric | Default points |
|---|---|---|
| Listing verified live on the website | `ops_listing_live` | 3 |
| …and it was inside the 72h SLA | `ops_listing_on_time` | +2 |
| Task approved by the manager, on time | `ops_task_on_time` | 2 |
| Task approved by the manager, late | `ops_task_late` | 1 |

A rejected listing or a reopened task turns its HR entry to "rejected"; each event has a unique id so nothing is counted twice.
A login with no HR employee linked earns nothing (HV Ops → Settings → Users flags it in red).

## Repo layout

```
index.html              the whole app (the only file that is deployed)
parts/                  the same app split into readable pieces; build.sh joins them into index.html
build.sh                regenerates index.html from parts/
deploy.sh               build + upload ONLY index.html to Cloudflare Pages
verify-from-pc.cmd      hourly website crawl from the office PC (see "How verification works")
worker/verifier.js      Cloudflare Worker          worker/wrangler.toml
worker/run-local.mjs    the same verifier run from this PC
sql/001_init.sql        app_users.access_ops/ops_role, enums, ops_* tables, ops_my_role(), ops_profiles view
sql/002_seed_settings.sql   codes, SLA hours, required fields, agencies, metric lists
sql/003_views.sql       ops_vw_listing_sla, ops_vw_user_kpis, ops_vw_agency_scorecard
sql/004_rls.sql         row level security, no DELETE for anyone
sql/005_triggers.sql    reference code, completeness, guards, audit log, default channels
sql/006_site_codes.sql  reference-code prefixes aligned with the website
sql/007_hr_kpis.sql     KPI bridge into HR (kpi_metrics / kpi_entries)
tests/sql.test.mjs      runs all SQL in PGlite next to stand-ins for HR's tables (54 checks, incl. "HR objects untouched")
```

**All SQL is additive** — no DROP TABLE / DROP COLUMN / TRUNCATE. Every schema change is a new numbered file. All files are safe to re-run.
The changes to HR-owned tables are also recorded in the HR repo as `migrations/migration_042.sql`.

## Release a new version

1. Edit files in `parts/`, bump `APP_VERSION` in `parts/02_core.jsx`.
2. Run `sh deploy.sh` — it builds `index.html` and uploads only that file. Then commit and push.
3. Check the version number in the login footer.

**Never run `wrangler deploy` or `wrangler pages project create` from the repo root.** Wrangler then publishes the whole folder,
including git-ignored files, as public assets. This happened once during the first setup (about five minutes, on the now-retired
standalone project); the exposed keys were revoked immediately and that database was confirmed untouched. Secrets live outside the repo since.

- Worker change: `cd worker`, then `npx wrangler deploy` (that folder has its own `wrangler.toml` and no assets). Secrets: always pass `--name hv-ops-verifier`.
- SQL change: new numbered file in `sql/` (objects prefixed `ops_`), run `node tests/sql.test.mjs`, then run the file on the unified project.

## How verification works (checked against the live site, 19 Sep 2026)

- The listings post type is **`unit`**, REST-enabled at `/wp-json/wp/v2/unit` (493 units). REST gives URL, publish date, modified date.
- The **File Ref is not in the REST payload**, so each new or modified page is fetched once and the ref is read from the "File Ref:" block
  of the HTML. Logged as method `rest+html`. If AGS ever exposes the field in REST, the worker uses it with no page fetch.
- Fallback when REST fails: Rank Math sitemaps `unit-sitemap1..N.xml`, same page parse (`sitemap+html`).
- Every page looked at is remembered in `wp_crawl_log`; a page is re-read only when WordPress says it was modified.
- **The website (SiteGround) answers Cloudflare's servers with a captcha page**, so the Worker cannot crawl it and logs those runs as `blocked`.
  We do not work around bot protection. The crawl runs from the office PC instead (`verify-from-pc.cmd`, hourly via Task Scheduler —
  the register command is inside the file). The Worker still does matching, alerts and recurring tasks every hour.
  Alternative: ask SiteGround/AGS to allowlist the verifier.
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
