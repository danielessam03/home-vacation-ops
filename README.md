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

## Live (set up 2026-09-19)

| What | Where |
|---|---|
| App | https://home-vacation-ops.pages.dev (Cloudflare Pages project , direct upload) |
| Worker | https://hv-ops-verifier.homevacation1950.workers.dev (crons: hourly + 22:00 UTC) |
| Supabase | project  (home-vacation-ops, Frankfurt). Public sign-up is OFF. Legacy anon/service_role keys are DISABLED — the app uses the publishable key, the worker uses the secret key . |
| Secrets on this PC |  — deliberately OUTSIDE the repo folder |

### Release a new version
1. Edit , bump  in .
2.  — builds index.html and uploads ONLY that file to Pages. Then  + .
3. Check the version in the login footer.

**Never run  or  from the repo root.** Wrangler then publishes the whole folder
(including git-ignored files) as public assets. This happened once during setup; the keys that were exposed were revoked the same minute.

Worker changes: 
╭─────────────────────────────────╮
│ Did you mean "wrangler deploy"? │
╰─────────────────────────────────╯

wrangler

COMMANDS
  wrangler docs [search..]        📚 Open Wrangler's command documentation in your browser
  wrangler complete [shell]       ⌨️ Generate and handle shell completions

  wrangler email                  Manage Cloudflare Email services [open beta]

ACCOUNT
  wrangler auth                   🔐 Manage authentication
  wrangler login                  🔓 Login to Cloudflare
  wrangler logout                 🚪 Logout from Cloudflare
  wrangler whoami                 🕵️ Retrieve your user information

COMPUTE & AI
  wrangler agent-memory           🧠 Manage Agent Memory namespaces [private beta]
  wrangler ai                     🤖 Manage AI models
  wrangler ai-search              🔍 Manage AI Search instances [open beta]
  wrangler browser                🌐 Manage Browser Run sessions [open beta]
  wrangler containers             📦 Manage Containers
  wrangler delete [name]          🗑️ Delete a Worker from Cloudflare
  wrangler deploy [path]          🆙 Deploy a Worker to Cloudflare
  wrangler deployments            🚢 List and view the current and past deployments for your Worker
  wrangler dev [script]           👂 Start a local server for developing your Worker
  wrangler dispatch-namespace     🏗️ Manage dispatch namespaces
  wrangler flagship               🚩 Manage Flagship apps and feature flags [open beta]
  wrangler init [name]            📥 Initialize a basic Worker
  wrangler pages                  ⚡️ Configure Cloudflare Pages
  wrangler preview [script]       👀 Create a Preview deployment of the current Worker [open beta]
  wrangler queues                 📬 Manage Workers Queues
  wrangler rollback [version-id]  🔙 Rollback a deployment for a Worker
  wrangler secret                 🤫 Generate a secret that can be referenced in a Worker
  wrangler setup                  🪄 Setup a project to work on Cloudflare
  wrangler tail [worker]          🦚 Start a log tailing session for a Worker
  wrangler triggers               🎯 Updates the triggers of your current deployment [experimental]
  wrangler types [path]           📝 Generate types from your Worker configuration
  wrangler versions               🫧 List, view, upload and deploy Versions of your Worker to Cloudflare
  wrangler vpc                    🌐 Manage VPC [open beta]
  wrangler workflows              🔁 Manage Workflows

STORAGE & DATABASES
  wrangler artifacts              🧱 Manage Artifacts namespaces and repos [private beta]
  wrangler d1                     🗄️ Manage Workers D1 databases
  wrangler hyperdrive             🚀 Manage Hyperdrive databases
  wrangler kv                     🗂️ Manage Workers KV Namespaces
  wrangler pipelines              🚰 Manage Cloudflare Pipelines [open beta]
  wrangler r2                     📦 Manage R2 buckets & objects
  wrangler secrets-store          🔐 Manage the Secrets Store [open beta]
  wrangler vectorize              🧮 Manage Vectorize indexes

NETWORKING & SECURITY
  wrangler cert                   🪪 Manage client mTLS certificates and CA certificate chains used for secured connections [open beta]
  wrangler mtls-certificate       🪪 Manage certificates used for mTLS connections
  wrangler tunnel                 🚇 Manage Cloudflare Tunnels [experimental]
  wrangler turnstile              🛡️ Manage Turnstile widgets [alpha]

GLOBAL FLAGS
  -c, --config          Path to Wrangler configuration file  [string]
      --cwd             Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
  -e, --env             Environment to use for operations, and for selecting .env and .dev.vars files  [string]
      --env-file        Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
  -h, --help            Show help  [boolean]
      --install-skills  Install Cloudflare skills for detected AI coding agents before running the command  [boolean] [default: false]
      --profile         Use a specific auth profile  [string]
  -v, --version         Show version number  [boolean]

Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose (that folder has its own wrangler.toml and no assets).
SQL changes: new numbered file in , run , then run the file in the Supabase SQL editor.

### First admin user (one time)
Supabase → Authentication → Users → **Add user** (your email + a password, tick Auto-confirm). Then in the SQL editor:
\After that, create everyone else from the app: Settings → Users → New user.

### Rebuilding from zero (new Supabase project)
Run  →  in order, turn off sign-ups, put URL + publishable key in , ,

╭─────────────────────────────────╮
│ Did you mean "wrangler deploy"? │
╰─────────────────────────────────╯

wrangler

COMMANDS
  wrangler docs [search..]        📚 Open Wrangler's command documentation in your browser
  wrangler complete [shell]       ⌨️ Generate and handle shell completions

  wrangler email                  Manage Cloudflare Email services [open beta]

ACCOUNT
  wrangler auth                   🔐 Manage authentication
  wrangler login                  🔓 Login to Cloudflare
  wrangler logout                 🚪 Logout from Cloudflare
  wrangler whoami                 🕵️ Retrieve your user information

COMPUTE & AI
  wrangler agent-memory           🧠 Manage Agent Memory namespaces [private beta]
  wrangler ai                     🤖 Manage AI models
  wrangler ai-search              🔍 Manage AI Search instances [open beta]
  wrangler browser                🌐 Manage Browser Run sessions [open beta]
  wrangler containers             📦 Manage Containers
  wrangler delete [name]          🗑️ Delete a Worker from Cloudflare
  wrangler deploy [path]          🆙 Deploy a Worker to Cloudflare
  wrangler deployments            🚢 List and view the current and past deployments for your Worker
  wrangler dev [script]           👂 Start a local server for developing your Worker
  wrangler dispatch-namespace     🏗️ Manage dispatch namespaces
  wrangler flagship               🚩 Manage Flagship apps and feature flags [open beta]
  wrangler init [name]            📥 Initialize a basic Worker
  wrangler pages                  ⚡️ Configure Cloudflare Pages
  wrangler preview [script]       👀 Create a Preview deployment of the current Worker [open beta]
  wrangler queues                 📬 Manage Workers Queues
  wrangler rollback [version-id]  🔙 Rollback a deployment for a Worker
  wrangler secret                 🤫 Generate a secret that can be referenced in a Worker
  wrangler setup                  🪄 Setup a project to work on Cloudflare
  wrangler tail [worker]          🦚 Start a log tailing session for a Worker
  wrangler triggers               🎯 Updates the triggers of your current deployment [experimental]
  wrangler types [path]           📝 Generate types from your Worker configuration
  wrangler versions               🫧 List, view, upload and deploy Versions of your Worker to Cloudflare
  wrangler vpc                    🌐 Manage VPC [open beta]
  wrangler workflows              🔁 Manage Workflows

STORAGE & DATABASES
  wrangler artifacts              🧱 Manage Artifacts namespaces and repos [private beta]
  wrangler d1                     🗄️ Manage Workers D1 databases
  wrangler hyperdrive             🚀 Manage Hyperdrive databases
  wrangler kv                     🗂️ Manage Workers KV Namespaces
  wrangler pipelines              🚰 Manage Cloudflare Pipelines [open beta]
  wrangler r2                     📦 Manage R2 buckets & objects
  wrangler secrets-store          🔐 Manage the Secrets Store [open beta]
  wrangler vectorize              🧮 Manage Vectorize indexes

NETWORKING & SECURITY
  wrangler cert                   🪪 Manage client mTLS certificates and CA certificate chains used for secured connections [open beta]
  wrangler mtls-certificate       🪪 Manage certificates used for mTLS connections
  wrangler tunnel                 🚇 Manage Cloudflare Tunnels [experimental]
  wrangler turnstile              🛡️ Manage Turnstile widgets [alpha]

GLOBAL FLAGS
  -c, --config          Path to Wrangler configuration file  [string]
      --cwd             Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
  -e, --env             Environment to use for operations, and for selecting .env and .dev.vars files  [string]
      --env-file        Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
  -h, --help            Show help  [boolean]
      --install-skills  Install Cloudflare skills for detected AI coding agents before running the command  [boolean] [default: false]
      --profile         Use a specific auth profile  [string]
  -v, --version         Show version number  [boolean]

Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose, then  ⛅️ wrangler 4.135.0
──────────────────── and , and save the worker URL in Settings → Verifier.

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

1. **Reference codes now follow the website** (sql/006, derived from all 493 live listings): IN, MG, KW, SB, MK, AH, G, Studio = S … Exceptions:
   Sheraton = SHR (the site uses SH for both Sheraton and Sahl Hasheesh), New El Kawther = NKW, El Wozra = WZR and Makadina = MKN (no examples on the site).
   The site also has locations with no code yet: Ain Sokhna, Airport Road, Marina, Qeadat — add them in Settings → Location codes when needed.
2. Every one of the 493 website listings has a File Ref, but 159 use older formats (e.g. , ). They import and verify fine as-is.
   New serials start at 1049 automatically (highest on the site is 1048).
3. GitHub: the repo exists only on this PC. Create an empty repo  and push ( is not installed here).
4. The facilities list is a starter set (the site's facility taxonomy is too messy to import). Edit in Settings → Lists.
5. Agency monthly contract quantities + fees: Settings → Agencies, then the Agencies page per month.
