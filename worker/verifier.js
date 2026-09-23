// HV OPS — Cloudflare Worker
//   cron "0 * * * *"   hourly  : website verifier + SLA / overdue alerts (+ WhatsApp when enabled)
//   cron "0 22 * * *"  nightly : recurring-task generation (00:00 / 01:00 Cairo)
//   HTTP                       : POST /run, POST /run-recurring, GET /health   (logins are managed in HR, not here)
//
// Secrets (wrangler secret put ...): SUPABASE_URL, SUPABASE_SERVICE_KEY
// Vars (wrangler.toml): WP_BASE_URL, WP_CPT, MAX_PAGE_FETCHES, WHATSAPP_ENABLED
// WhatsApp secrets (only when enabled): WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
//
// How a listing gets verified (checked against the live site on 2026-09-19):
//   - the listings CPT is "unit" and IS exposed over REST (/wp-json/wp/v2/unit), which gives url + publish date
//   - the File Ref is NOT in the REST payload, so each new/changed page is fetched once and the ref is read
//     from the "File Ref:" block of the HTML. Method logged as "rest+html".
//   - if REST ever stops working the Rank Math sitemap (unit-sitemapN.xml) is used instead: "sitemap+html".

const UA = 'HV-Ops-Verifier/1.0 (+https://home-vacation.com)';
const REF_RE = /File\s*Ref\s*:?\s*([A-Z0-9]+(?:-[A-Z0-9]+)+)/i;
const PROJECT_RE = /Project\s*ID\s*:?\s*([A-Z0-9]+(?:-[A-Z0-9]+)+)/i;      // projects: "Project ID: P-MG-929-S"
const CPT_GUESSES = ['unit', 'units', 'properties', 'property', 'listings', 'listing'];

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === '0 22 * * *') ctx.waitUntil(generateRecurringTasks(env));
    else if (event.cron === '*/5 * * * *') ctx.waitUntil(drainNotifications(env));
    else ctx.waitUntil(runVerifier(env));
  },

  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    try {
      if (path === '/health' || path === '') return json({ ok: true, service: 'hv-ops-verifier' });
      // The link inside every WhatsApp message: /go/<notification id> -> the task in the right system (tap is recorded)
      if (path.startsWith('/go/') && request.method === 'GET') {
        const id = path.slice(4);
        if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Not found' }, 404);
        const rows = await sb(env, `hv_notifications?id=eq.${id}&select=url,opened_at`);
        if (!rows[0]) return json({ error: 'Not found' }, 404);
        if (!rows[0].opened_at) await sb(env, `hv_notifications?id=eq.${id}`, { method: 'PATCH', body: { opened_at: new Date().toISOString() } }).catch(() => {});
        return new Response(null, { status: 302, headers: { location: rows[0].url, 'cache-control': 'no-store' } });
      }
      if (request.method !== 'POST') return json({ error: 'Not found' }, 404);

      const caller = await authCaller(request, env);
      if (!caller) return json({ error: 'Not signed in' }, 401);

      if (path === '/run') {
        if (!['admin', 'manager'].includes(caller.role)) return json({ error: 'Managers only' }, 403);
        return json(await runVerifier(env));
      }
      if (path === '/send-notifications') {
        if (!['admin', 'manager'].includes(caller.role)) return json({ error: 'Managers only' }, 403);
        return json(await drainNotifications(env));
      }
      if (path === '/run-recurring') {
        if (!['admin', 'manager'].includes(caller.role)) return json({ error: 'Managers only' }, 403);
        return json(await generateRecurringTasks(env));
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 400);
    }
  },
};

// =====================================================================================
// Supabase helpers (service role — bypasses RLS; this key never leaves the worker)
// =====================================================================================
async function sb(env, path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function sbAll(env, path) {
  const out = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const rows = await sb(env, `${path}${path.includes('?') ? '&' : '?'}limit=1000&offset=${offset}`);
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

// same rule as public.ops_role_of() in the database
const opsRole = (u) => u.ops_role || (u.role === 'ceo' ? 'admin' : 'data_entry');

async function authCaller(request, env) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  const rows = await sb(env, `app_users?id=eq.${user.id}&is_active=eq.true&access_ops=eq.true&select=id,role,ops_role`);
  return rows[0] ? { id: rows[0].id, role: opsRole(rows[0]) } : null;
}

// =====================================================================================
// Website verifier
// =====================================================================================
// home-vacation.com is on SiteGround, whose bot protection answers datacenter IPs (including Cloudflare Workers) with a captcha page
// (HTTP 202 + /.well-known/sgcaptcha/). We never try to get around that: the run is logged as blocked and the crawl is done by
// worker/run-local.mjs from the office PC instead. Matching, alerts and recurring tasks still run here every hour.
class WpBlocked extends Error {}
async function wpFetch(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, cf: { cacheTtl: 0 } });
  if (res.status === 202 || res.status === 403 || res.status === 429) {
    const body = await res.clone().text();
    if (res.status !== 202 || /sgcaptcha|captcha/i.test(body)) throw new WpBlocked('Website bot protection blocked this request (HTTP ' + res.status + '). Crawl from the office PC: node worker/run-local.mjs');
  }
  return res;
}

const toIso = (s) => {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
  return isNaN(d) ? null : d.toISOString();
};

function refFromText(text, re = REF_RE) {
  if (!text) return null;
  const plain = String(text).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  const m = plain.match(re);
  return m ? m[1].toUpperCase() : null;
}

// 1. REST: returns [{url, published, modified, ref|null}] or null when the CPT is not exposed
async function listViaRest(env, known) {
  const base = env.WP_BASE_URL.replace(/\/+$/, '');
  const typesRes = await wpFetch(`${base}/wp-json/wp/v2/types`);
  if (!typesRes.ok) return null;
  const types = await typesRes.json();
  const wanted = [env.WP_CPT, ...CPT_GUESSES].filter(Boolean);
  const slug = wanted.find((s) => types[s]);
  if (!slug) return null;
  const restBase = `${types[slug].rest_namespace || 'wp/v2'}/${types[slug].rest_base || slug}`;

  const out = [];
  for (let page = 1; page <= 30; page++) {
    const res = await wpFetch(`${base}/wp-json/${restBase}?per_page=100&page=${page}&orderby=modified&order=desc`
      + `&_fields=id,link,date_gmt,modified_gmt,acf,meta`);
    if (!res.ok) { if (page === 1) return null; break; }
    const items = await res.json();
    if (!Array.isArray(items) || !items.length) break;
    let allKnown = true;
    for (const it of items) {
      const row = {
        url: it.link,
        published: toIso(it.date_gmt),
        modified: toIso(it.modified_gmt),
        // future-proof: if AGS ever exposes the ref in REST (acf/meta/content) no page fetch is needed
        ref: refFromText(JSON.stringify(it.acf || '')) || refFromText(JSON.stringify(it.meta || '')) || refFromText(it.content && it.content.rendered),
      };
      out.push(row);
      const k = known.get(row.url);
      if (!k || (row.modified && (!k.wp_modified_at || new Date(row.modified) > new Date(k.wp_modified_at)))) allKnown = false;
    }
    // sorted by modified desc: once a whole page is unchanged, everything after it is too
    if (allKnown) break;
    const totalPages = Number(res.headers.get('x-wp-totalpages') || 0);
    if (totalPages && page >= totalPages) break;
  }
  return out;
}

// 2. Sitemap fallback
async function listViaSitemap(env) {
  const base = env.WP_BASE_URL.replace(/\/+$/, '');
  const idx = await wpFetch(`${base}/sitemap_index.xml`);
  if (!idx.ok) throw new Error(`sitemap_index.xml -> ${idx.status}`);
  const locs = [...(await idx.text()).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const maps = locs.filter((u) => /(unit|propert|listing)[^/]*sitemap/i.test(u));
  const out = [];
  for (const m of maps.slice(0, 10)) {
    const res = await wpFetch(m);
    if (!res.ok) continue;
    const xml = await res.text();
    for (const u of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = (u[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/) || [])[1];
      const lastmod = (u[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/) || [])[1];
      if (!loc || /\/properties\/?$/.test(loc)) continue;      // skip the archive page itself
      out.push({ url: loc, published: null, modified: toIso(lastmod), ref: null });
    }
  }
  return out;
}

function publishedFromHtml(html) {
  const m = html.match(/property=["']article:published_time["'][^>]*content=["']([^"']+)/i)
    || html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
  return m ? toIso(m[1]) : null;
}

export async function runVerifier(env) {
  const run = { started_at: new Date().toISOString(), method: null, pages_listed: 0, pages_fetched: 0,
    refs_found: 0, listings_verified: 0, alerts_created: 0, pending_pages: 0, error: null };
  const errors = [];
  try {
    const knownRows = await sbAll(env, 'ops_wp_crawl_log?select=url,wp_modified_at,reference_code');
    const known = new Map(knownRows.map((r) => [r.url, r]));

    let pages = null;
    let blocked = false;
    try { pages = await listViaRest(env, known); } catch (e) { blocked = e instanceof WpBlocked; errors.push(blocked ? e.message : `rest: ${e.message}`); }
    if (pages && pages.length) run.method = 'rest+html';
    else if (blocked) { pages = []; run.method = 'blocked'; }
    else {
      try { pages = await listViaSitemap(env); run.method = 'sitemap+html'; } catch (e) { pages = []; run.method = 'failed'; errors.push(`sitemap: ${e.message}`); }
    }
    run.pages_listed = pages.length;

    // pages never seen, or modified since we last read them — newest first
    const todo = pages.filter((p) => {
      const k = known.get(p.url);
      return !k || (p.modified && (!k.wp_modified_at || new Date(p.modified) > new Date(k.wp_modified_at)));
    }).sort((a, b) => new Date(b.modified || 0) - new Date(a.modified || 0));

    const max = Number(env.MAX_PAGE_FETCHES || 25);
    const batch = todo.slice(0, max);
    run.pending_pages = Math.max(0, todo.length - batch.length);

    const crawlRows = [];
    const indexRows = [];
    for (let i = 0; i < batch.length; i += 5) {
      await Promise.all(batch.slice(i, i + 5).map(async (p) => {
        let ref = p.ref, status = null, published = p.published;
        if (!ref) {
          try {
            const res = await wpFetch(`${p.url}${p.url.includes('?') ? '&' : '?'}hvv=${Date.now()}`);
            status = res.status;
            run.pages_fetched++;
            if (res.ok) {
              const html = await res.text();
              ref = refFromText(html);
              if (!published) published = publishedFromHtml(html);
            }
          } catch (e) { errors.push(`${p.url}: ${e.message}`); return; }   // not logged => retried next run
        }
        if (status && status >= 500) return;                                  // site hiccup => retry next run
        crawlRows.push({ url: p.url, wp_published_at: published, wp_modified_at: p.modified, reference_code: ref,
          http_status: status, last_fetched_at: new Date().toISOString() });
        if (ref) indexRows.push({ reference_code: ref, url: p.url, wp_published_at: published, method: run.method,
          raw: { modified: p.modified } });
      }));
    }
    run.refs_found = indexRows.length;

    if (indexRows.length) {
      // de-duplicate within the batch, then keep the FIRST sighting forever (ignore-duplicates)
      const uniq = [...new Map(indexRows.map((r) => [r.reference_code, r])).values()];
      await sb(env, 'ops_wp_listing_index?on_conflict=reference_code', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: uniq });
    }
    if (crawlRows.length) {
      await sb(env, 'ops_wp_crawl_log?on_conflict=url', { method: 'POST', prefer: 'resolution=merge-duplicates', body: crawlRows });
    }

    if (!blocked) { try { await crawlProjects(env, known, run, errors); } catch (e) { errors.push(`projects: ${e.message}`); } }

    run.listings_verified = await matchListings(env);
    run.listings_verified += await matchListings(env, { table: 'ops_projects', index: 'ops_wp_project_index', channel: false, label: 'project' });
    run.alerts_created = await raiseAlerts(env);
  } catch (e) {
    errors.push(String(e.message || e));
  }
  run.error = errors.length ? errors.join(' | ').slice(0, 1500) : null;
  run.finished_at = new Date().toISOString();
  try { await sb(env, 'ops_verifier_runs', { method: 'POST', body: run }); } catch (e) { /* logging must never throw */ }
  return run;
}

// Projects: one REST page lists them all (54 today); only new / modified project pages are fetched.
async function crawlProjects(env, known, run, errors) {
  const base = env.WP_BASE_URL.replace(/\/+$/, '');
  const res = await wpFetch(`${base}/wp-json/wp/v2/${env.WP_PROJECT_CPT || 'project'}?per_page=100&orderby=modified&order=desc&_fields=id,link,date_gmt,modified_gmt`);
  if (!res.ok) return;
  const items = await res.json();
  if (!Array.isArray(items)) return;
  run.pages_listed += items.length;
  const todo = items.map((it) => ({ url: it.link, published: toIso(it.date_gmt), modified: toIso(it.modified_gmt) })).filter((p) => {
    const k = known.get(p.url);
    return !k || (p.modified && (!k.wp_modified_at || new Date(p.modified) > new Date(k.wp_modified_at)));
  }).slice(0, Number(env.MAX_PROJECT_FETCHES || 15));
  const crawlRows = [], indexRows = [];
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(todo.slice(i, i + 5).map(async (p) => {
      try {
        const r = await wpFetch(`${p.url}?hvv=${Date.now()}`);
        run.pages_fetched++;
        if (r.status >= 500) return;
        const ref = r.ok ? refFromText(await r.text(), PROJECT_RE) : null;
        crawlRows.push({ url: p.url, wp_published_at: p.published, wp_modified_at: p.modified, reference_code: ref, http_status: r.status, last_fetched_at: new Date().toISOString() });
        if (ref) indexRows.push({ reference_code: ref, url: p.url, wp_published_at: p.published, method: 'rest+html', raw: { modified: p.modified } });
      } catch (e) { if (e instanceof WpBlocked) throw e; errors.push(`${p.url}: ${e.message}`); }
    }));
  }
  run.refs_found += indexRows.length;
  if (indexRows.length) {
    const uniq = [...new Map(indexRows.map((r) => [r.reference_code, r])).values()];
    await sb(env, 'ops_wp_project_index?on_conflict=reference_code', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: uniq });
  }
  if (crawlRows.length) await sb(env, 'ops_wp_crawl_log?on_conflict=url', { method: 'POST', prefer: 'resolution=merge-duplicates', body: crawlRows });
}

// A listing (or project) is verified_live when its reference code appears in the matching website index.
async function matchListings(env, { table = 'ops_listings', index = 'ops_wp_listing_index', channel = true, label = 'listing' } = {}) {
  const open = await sbAll(env, `${table}?select=id,reference_code,entered_by,assigned_to&date_published_verified=is.null&status=not.in.(rejected,archived)`);
  if (!open.length) return 0;
  let verified = 0;
  const alerts = [];
  for (let i = 0; i < open.length; i += 80) {
    const chunk = open.slice(i, i + 80);
    const refs = chunk.map((l) => `"${l.reference_code.replace(/[^A-Z0-9-]/gi, '')}"`).join(',');
    const found = await sb(env, `${index}?select=reference_code,url,wp_published_at,first_seen_at&reference_code=in.(${refs})`);
    const byRef = new Map(found.map((f) => [f.reference_code, f]));
    for (const l of chunk) {
      const hit = byRef.get(l.reference_code);
      if (!hit) continue;
      // earliest of WordPress publish date and first sighting — never later than first_seen
      const times = [hit.wp_published_at, hit.first_seen_at].filter(Boolean).map((t) => new Date(t).getTime());
      const verifiedAt = new Date(Math.min(...times)).toISOString();
      await sb(env, `${table}?id=eq.${l.id}`, { method: 'PATCH',
        body: { status: 'verified_live', date_published_verified: verifiedAt, website_url: hit.url } });
      if (channel) await sb(env, 'ops_listing_channels?on_conflict=listing_id,channel', { method: 'POST', prefer: 'resolution=merge-duplicates',
        body: { listing_id: l.id, channel: 'website', status: 'published', url: hit.url, published_at: verifiedAt } });
      alerts.push({ level: 'info', title: `${l.reference_code} verified live`, body: hit.url, entity_type: label,
        entity_id: l.id, target_user: l.assigned_to || l.entered_by, dedupe_key: `verified:${l.id}` });
      verified++;
    }
  }
  if (alerts.length) await sb(env, 'ops_alerts?on_conflict=dedupe_key', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: alerts });
  return verified;
}

// =====================================================================================
// Alerts: SLA 48h / 72h, incomplete > 24h, claimed_not_found, task overdue, deliverable past due
// =====================================================================================
async function raiseAlerts(env) {
  const alerts = [];
  const settings = await sb(env, 'ops_settings?key=eq.sla_hours&select=value');
  const cfg = { warn: 48, breach: 72, incomplete_alert: 24, ...(settings[0] ? settings[0].value : {}) };
  const now = Date.now();

  const rows = await sbAll(env, 'ops_vw_listing_sla?select=id,reference_code,title,status,entered_by,assigned_to,created_at,'
    + 'completeness_pct,missing_fields,hours_elapsed,sla_state,claimed_not_found'
    + '&date_published_verified=is.null&status=not.in.(rejected,archived,on_hold)');
  for (const l of rows) {
    const who = l.status === 'draft' ? l.entered_by : (l.assigned_to || l.entered_by);
    const h = Math.round(l.hours_elapsed);
    const base = { entity_type: 'listing', entity_id: l.id };
    if (l.sla_state === 'yellow') {
      alerts.push({ ...base, level: 'warning', title: `${l.reference_code} at risk — ${h}h of ${cfg.breach}h used`,
        body: 'Not yet verified live on the website.', target_user: who, dedupe_key: `sla48:${l.id}` });
    }
    if (l.sla_state === 'red') {
      const a = { ...base, level: 'critical', title: `SLA breached — ${l.reference_code} (${h}h)`,
        body: `Received more than ${cfg.breach}h ago and still not verified live on the website.` };
      alerts.push({ ...a, target_user: who, dedupe_key: `sla72:${l.id}:u` });
      alerts.push({ ...a, target_role: 'manager', dedupe_key: `sla72:${l.id}:m` });
    }
    if (l.completeness_pct < 100 && now - new Date(l.created_at).getTime() > cfg.incomplete_alert * 36e5) {
      const a = { ...base, level: 'warning', title: `${l.reference_code} still incomplete (${l.completeness_pct}%)`,
        body: `Missing: ${(l.missing_fields || []).join(', ')}` };
      alerts.push({ ...a, target_user: who, dedupe_key: `inc24:${l.id}:u` });
      alerts.push({ ...a, target_role: 'manager', dedupe_key: `inc24:${l.id}:m` });
    }
    if (l.claimed_not_found) {
      const a = { ...base, level: 'critical', title: `Claimed but NOT found on website — ${l.reference_code}`,
        body: 'Marked as published but the verifier cannot find this File Ref on home-vacation.com.' };
      alerts.push({ ...a, target_role: 'manager', dedupe_key: `cnf:${l.id}:m` });
      alerts.push({ ...a, level: 'warning', target_user: who, dedupe_key: `cnf:${l.id}:u` });
    }
  }

  const pset = await sb(env, 'ops_settings?key=eq.project_sla_hours&select=value');
  const pcfg = { warn: 120, breach: 168, incomplete_alert: 48, claim_grace: 24, ...(pset[0] ? pset[0].value : {}) };
  const projects = await sbAll(env, 'ops_projects?select=id,reference_code,name,status,entered_by,assigned_to,created_at,date_received,paused_seconds,'
    + 'completeness_pct,missing_fields,date_published_claimed&date_published_verified=is.null&status=not.in.(rejected,archived,on_hold)');
  for (const p of projects) {
    const who = p.status === 'draft' ? p.entered_by : (p.assigned_to || p.entered_by);
    const h = Math.max(0, (now - new Date(p.date_received).getTime()) / 36e5 - (p.paused_seconds || 0) / 3600);
    const base = { entity_type: 'project', entity_id: p.id }; const tag = `${p.reference_code} (${p.name})`;
    if (h >= pcfg.warn && h <= pcfg.breach) alerts.push({ ...base, level: 'warning', title: `Project at risk — ${tag}: ${Math.round(h)}h of ${pcfg.breach}h used`, target_user: who, dedupe_key: `psla1:${p.id}` });
    if (h > pcfg.breach) {
      const a = { ...base, level: 'critical', title: `Project SLA breached — ${tag} (${Math.round(h)}h)`, body: 'Still not verified live on the website.' };
      alerts.push({ ...a, target_user: who, dedupe_key: `psla2:${p.id}:u` }, { ...a, target_role: 'manager', dedupe_key: `psla2:${p.id}:m` });
    }
    if (p.completeness_pct < 100 && now - new Date(p.created_at).getTime() > pcfg.incomplete_alert * 36e5)
      alerts.push({ ...base, level: 'warning', title: `Project still incomplete — ${tag} (${p.completeness_pct}%)`, body: `Missing: ${(p.missing_fields || []).join(', ')}`, target_user: p.entered_by, dedupe_key: `pinc:${p.id}` });
    if (p.status === 'published_claimed' && p.date_published_claimed && now - new Date(p.date_published_claimed).getTime() > pcfg.claim_grace * 36e5) {
      const a = { ...base, level: 'critical', title: `Project claimed but NOT found on website — ${tag}`, body: 'The verifier cannot find this Project ID on home-vacation.com.' };
      alerts.push({ ...a, target_role: 'manager', dedupe_key: `pcnf:${p.id}:m` }, { ...a, level: 'warning', target_user: who, dedupe_key: `pcnf:${p.id}:u` });
    }
  }

  const nowIso = new Date().toISOString();
  const tasks = await sbAll(env, `ops_tasks?select=id,title,assigned_to,due_at&status=in.(todo,doing)&due_at=lt.${nowIso}`);
  for (const t of tasks) {
    const a = { level: 'warning', title: `Task overdue — ${t.title}`, body: `Was due ${t.due_at}`, entity_type: 'task', entity_id: t.id };
    if (t.assigned_to) alerts.push({ ...a, target_user: t.assigned_to, dedupe_key: `taskdue:${t.id}:u` });
    alerts.push({ ...a, target_role: 'manager', dedupe_key: `taskdue:${t.id}:m` });
  }

  const today = nowIso.slice(0, 10);
  const late = await sbAll(env, `ops_agency_deliverables?select=id,item_type,planned_qty,delivered_qty,due_date,agency_id,ops_agencies(display_name)`
    + `&status=in.(planned,revision_requested)&due_date=lt.${today}`);
  for (const d of late) {
    if (d.delivered_qty >= d.planned_qty) continue;
    await sb(env, `ops_agency_deliverables?id=eq.${d.id}`, { method: 'PATCH', body: { status: 'late' } });
    const a = { level: 'warning', entity_type: 'agency_deliverable', entity_id: d.id,
      title: `${d.ops_agencies ? d.ops_agencies.display_name : 'Agency'}: ${d.item_type} past due`,
      body: `${d.delivered_qty}/${d.planned_qty} delivered, was due ${d.due_date}` };
    alerts.push({ ...a, target_role: 'manager', dedupe_key: `deliv:${d.id}:m` });
    alerts.push({ ...a, target_role: 'marketing', dedupe_key: `deliv:${d.id}:mk` });
  }

  if (!alerts.length) return 0;
  let created = [];
  for (let i = 0; i < alerts.length; i += 200) {
    const rowsIn = await sb(env, 'ops_alerts?on_conflict=dedupe_key', { method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=representation', body: alerts.slice(i, i + 200) });
    created = created.concat(rowsIn || []);
  }
  await pushWhatsApp(env, created.filter((a) => a.level === 'critical'));
  return created.length;
}

// =====================================================================================
// WhatsApp (Meta Cloud API) — built, shipped DISABLED. Set WHATSAPP_ENABLED="true" once the number is approved.
// Needs an approved template named "hv_ops_alert" with two body variables: {{1}} title, {{2}} details.
// =====================================================================================
export async function sendWhatsApp(env, phone, template, vars) {
  if (env.WHATSAPP_ENABLED !== 'true') return { skipped: true };
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) throw new Error('WhatsApp secrets missing');
  const res = await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: String(phone).replace(/[^\d]/g, ''),
      type: 'template',
      template: { name: template, language: { code: 'en' },
        components: [{ type: 'body', parameters: vars.map((v) => ({ type: 'text', text: String(v).slice(0, 900) })) }] },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { sent: true };
}

// =====================================================================================
// Task messages (all systems): hv_notifications outbox -> WhatsApp template "hv_task_assigned"
//   body {{1}} = first name, {{2}} = system, {{3}} = task title;  URL button suffix {{1}} = notification id (-> /go/<id>)
// =====================================================================================
const SYSTEM_LABEL = { hr: 'HR', maint: 'Maintenance', crm: 'CRM', ops: 'HV Ops' };
export async function drainNotifications(env) {
  const out = { enabled: env.WHATSAPP_ENABLED === 'true', sent: 0, failed: 0, pending: 0 };
  const rows = await sb(env, 'hv_notifications?status=eq.pending&attempts=lt.5&order=created_at.asc&limit=25&select=id,recipient,phone,system,title,body,url');
  out.pending = rows.length;
  if (!out.enabled || !rows.length) return out;
  const people = await sb(env, 'app_users?select=id,full_name_en,full_name_ar,username&is_active=eq.true');
  const nameOf = (id) => { const p = people.find((x) => x.id === id); return p ? (p.full_name_en || p.full_name_ar || p.username || '').split(' ')[0] : ''; };
  for (const n of rows) {
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: String(n.phone).replace(/[^\d]/g, ''), type: 'template',
          template: { name: env.WHATSAPP_TASK_TEMPLATE || 'hv_task_assigned', language: { code: env.WHATSAPP_TEMPLATE_LANG || 'ar' },
            components: [
              { type: 'body', parameters: [nameOf(n.recipient) || 'there', SYSTEM_LABEL[n.system] || n.system, n.title].map((t) => ({ type: 'text', text: String(t).replace(/\s+/g, ' ').slice(0, 300) })) },
              { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: n.id }] },
            ] },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error && data.error.message) || `WhatsApp ${res.status}`);
      await sb(env, `hv_notifications?id=eq.${n.id}`, { method: 'PATCH', body: { status: 'sent', sent_at: new Date().toISOString(), provider_id: data.messages && data.messages[0] && data.messages[0].id, error: null, attempts: 1 } });
      out.sent++;
    } catch (e) {
      out.failed++;
      const cur = await sb(env, `hv_notifications?id=eq.${n.id}&select=attempts`);
      const attempts = ((cur[0] && cur[0].attempts) || 0) + 1;
      await sb(env, `hv_notifications?id=eq.${n.id}`, { method: 'PATCH', body: { attempts, error: String(e.message || e).slice(0, 300), status: attempts >= 5 ? 'failed' : 'pending' } });
    }
  }
  return out;
}

async function pushWhatsApp(env, criticalAlerts) {
  if (env.WHATSAPP_ENABLED !== 'true' || !criticalAlerts.length) return;
  const people = (await sb(env, 'app_users?select=id,role,ops_role,phone&is_active=eq.true&access_ops=eq.true&phone=not.is.null')).map((u) => ({ id: u.id, phone: u.phone, role: opsRole(u) }));
  let budget = 10;                                   // keep well inside the per-run subrequest limit
  for (const a of criticalAlerts) {
    const targets = people.filter((p) => (a.target_user && p.id === a.target_user) || (a.target_role && p.role === a.target_role));
    let ok = false;
    for (const p of targets) {
      if (budget-- <= 0) return;
      try { await sendWhatsApp(env, p.phone, 'hv_ops_alert', [a.title, a.body || '-']); ok = true; } catch (e) { /* try next run */ }
    }
    if (ok) await sb(env, `ops_alerts?id=eq.${a.id}`, { method: 'PATCH', body: { whatsapp_sent: true } });
  }
}

// =====================================================================================
// Nightly recurring tasks — runs just after midnight Cairo and creates that day's tasks
// =====================================================================================
function cairoParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' })
    .formatToParts(date).map((x) => [x.type, x.value]));
  return p;
}

function cairoToUtc(dateStr, timeStr) {             // "2026-09-20" + "17:00:00" Cairo wall time -> UTC Date (DST-safe)
  const guess = new Date(`${dateStr}T${timeStr.length === 5 ? timeStr + ':00' : timeStr}Z`);
  const p = cairoParts(guess);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

export async function generateRecurringTasks(env) {
  const p = cairoParts(new Date());
  const dateStr = `${p.year}-${p.month}-${p.day}`;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  const dom = +p.day;
  const lastDom = new Date(Date.UTC(+p.year, +p.month, 0)).getUTCDate();

  const templates = await sb(env, 'ops_recurring_templates?is_active=eq.true&select=*');
  const due = templates.filter((t) =>
    t.frequency === 'daily'
    || (t.frequency === 'weekly' && t.weekday === weekday)
    || (t.frequency === 'monthly' && Math.min(t.day_of_month || 1, lastDom) === dom));

  const rows = due.map((t) => ({
    title: t.title, description: t.description, task_type: t.task_type, assigned_to: t.assigned_to, created_by: t.created_by,
    priority: t.priority || 'normal', status: 'todo', due_at: cairoToUtc(dateStr, t.due_time || '17:00:00').toISOString(),
    recurring_template_id: t.id, recurring_for_date: dateStr,
  }));
  let created = [];
  if (rows.length) {
    // the unique index (recurring_template_id, recurring_for_date) makes a second run the same day a no-op
    created = await sb(env, 'ops_tasks?on_conflict=recurring_template_id,recurring_for_date', { method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=representation', body: rows }) || [];
  }
  return { date: dateStr, templates_due: due.length, tasks_created: created.length };
}
