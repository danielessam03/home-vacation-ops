// In-memory stand-in for supabase-js, for clicking through the app without a database (tests/harness/mkharness.js).
// Only what the app calls: auth session, from().select/insert/update/upsert + eq/in/order/range/limit/single/maybeSingle, rpc().
(function () {
  const ROLE = '__ROLE__'; const SETTINGS = __SETTINGS__;
  const H = 36e5, now = Date.now(), iso = (h) => new Date(now - h * H).toISOString();
  const U = { admin: '00000000-0000-0000-0000-00000000000a', manager: '00000000-0000-0000-0000-00000000000b', data_entry: '00000000-0000-0000-0000-00000000000c', marketing: '00000000-0000-0000-0000-00000000000d', agency: '00000000-0000-0000-0000-0000000000b2' };
  const AG1 = '00000000-0000-0000-0000-0000000000a1', AG2 = '00000000-0000-0000-0000-0000000000a2';
  const me = U[ROLE] || U.admin;
  let seq = 1; const uid = () => 'mock-' + (seq++).toString().padStart(4, '0') + '-0000-0000-0000-000000000000';
  const db = {
    ops_profiles: [
      { id: U.admin, full_name: 'Daniel Essam', email: 'daniel@hv.local', role: 'admin', is_active: true },
      { id: U.manager, full_name: 'Lucy Marketing', email: 'lucy@hv.local', role: 'manager', is_active: true },
      { id: U.data_entry, full_name: 'Sally Entry', email: 'sally@hv.local', role: 'data_entry', is_active: true },
      { id: U.marketing, full_name: 'Mina Marketing', email: 'mina@hv.local', role: 'marketing', is_active: true },
    ],
    ops_settings: SETTINGS.map((s) => ({ ...s, updated_at: iso(100) })),
    ops_listings: [
      { id: uid(), reference_code: 'HD-A-2001-S', title: 'Sea view flat', location: 'Hadaba', property_type: 'Apartment', deal_type: 'sale', status: 'draft', date_received: iso(10), created_at: iso(10), updated_at: iso(1),
        entered_by: U.data_entry, assigned_to: U.manager, completeness_pct: 60, missing_fields: ['price', 'currency'], facilities: [], is_offline: false, photography_done: true, code_history: [] },
      { id: uid(), reference_code: 'MG-V-2002-R', title: 'Villa ready', location: 'Magawish', property_type: 'Villa', deal_type: 'rent', status: 'ready_to_publish', date_received: iso(30), date_ready: iso(2), created_at: iso(30), updated_at: iso(2),
        entered_by: U.data_entry, assigned_to: U.manager, completeness_pct: 100, missing_fields: [], facilities: ['Pool'], is_offline: false, photography_done: true, code_history: [] },
    ],
    ops_agencies: [
      { id: AG1, name: 'izmi', display_name: 'IZMI', is_active: true, currency: 'EGP', scope_notes: 'SEO' },
      { id: AG2, name: 'london_marketing_studios', display_name: 'London Marketing Studios', is_active: true, currency: 'GBP', scope_notes: 'Social media & paid ads' },
    ],
    ops_agency_users: [
      { id: '00000000-0000-0000-0000-0000000000b1', agency_id: AG1, email: 'ahmed@izmi.test', full_name: 'Ahmed', status: 'pending', created_at: iso(3) },
      { id: U.agency, agency_id: AG1, email: 'sara@izmi.test', full_name: 'Sara', status: 'active', created_at: iso(50) },
    ],
    ops_content_items: [
      { id: uid(), agency_id: AG1, kind: 'file', title: 'HD-A-2001-S photos', file_name: 'HD-A-2001-S.zip', file_path: AG1 + '/x/HD-A-2001-S.zip', file_size: 12345678, post_by: null, scheduled_date: null, posted_url: null, notes: 'Highlight the sea view', created_at: iso(5), updated_at: iso(5), added_by: U.marketing },
      { id: uid(), agency_id: AG1, kind: 'link', title: 'MG-V-2002-R — Villa ready', link_url: 'https://home-vacation.com/x', scheduled_date: new Date(now - 24 * H).toISOString().slice(0, 10), posted_url: null, created_at: iso(40), updated_at: iso(30), added_by: U.marketing, scheduled_by: U.agency },
      { id: uid(), agency_id: AG1, kind: 'link', title: 'Reel — Sahl Hasheesh', link_url: 'https://home-vacation.com/y', scheduled_date: new Date(now).toISOString().slice(0, 10), posted_url: 'https://instagram.com/p/1', posted_at: iso(1), posted_by: U.agency, created_at: iso(60), updated_at: iso(1), added_by: U.marketing, scheduled_by: U.agency },
      { id: uid(), agency_id: AG2, kind: 'file', title: 'Brochure Q4', file_name: 'q4.zip', file_path: AG2 + '/y/q4.zip', file_size: 500000, scheduled_date: new Date(now + 48 * H).toISOString().slice(0, 10), posted_url: null, created_at: iso(2), updated_at: iso(2), added_by: U.manager },
    ],
    ops_tasks: [
      { id: uid(), title: 'Call the owner of HD-A-2001-S', description: 'Ask about the price', task_type: null, assigned_to: U.data_entry, assigned_to_multi: [U.marketing], created_by: U.admin, status: 'todo', priority: 'normal',
        due_at: iso(-30), created_at: iso(5), updated_at: iso(5), due_history: [] },
      { id: uid(), title: 'Prepare the monthly report', assigned_to: me, assigned_to_multi: [], created_by: U.manager, status: 'doing', priority: 'high', due_at: iso(-80), started_at: iso(2), created_at: iso(20), updated_at: iso(2), due_history: [] },
    ],
  };
  const table = (t) => (db[t] = db[t] || []);
  class Q {
    constructor(t) { this.t = t; this.f = []; this.op = 'select'; this.one = null; this.ord = null; this.rng = null; }
    select() { return this; } eq(k, v) { this.f.push((r) => r[k] === v); return this; } in(k, vs) { this.f.push((r) => vs.includes(r[k])); return this; }
    is(k, v) { this.f.push((r) => r[k] == v); return this; } neq(k, v) { this.f.push((r) => r[k] !== v); return this; }
    order(k, o) { this.ord = [k, !o || o.ascending !== false]; return this; } range(a, b) { this.rng = [a, b]; return this; } limit(n) { this.rng = [0, n - 1]; return this; }
    single() { this.one = 'single'; return this; } maybeSingle() { this.one = 'maybe'; return this; }
    insert(v) { this.op = 'insert'; this.v = v; return this; } update(v) { this.op = 'update'; this.v = v; return this; } upsert(v) { this.op = 'upsert'; this.v = v; return this; } delete() { this.op = 'delete'; return this; }
    run() {
      const rows = table(this.t); let out;
      if (this.op === 'insert' || this.op === 'upsert') {
        const list = Array.isArray(this.v) ? this.v : [this.v];
        out = list.map((v) => { const r = { id: uid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...v }; if (this.t === 'ops_listings' && !r.reference_code) r.reference_code = (r.is_offline ? 'OFF-' : '') + 'HD-A-' + (2100 + seq) + (r.deal_type === 'rent' ? '-R' : '-S'); if (this.t === 'ops_listings') { r.completeness_pct = r.completeness_pct || 50; r.missing_fields = r.missing_fields || ['price']; } if (this.t === 'ops_tasks') { r.status = r.status || 'todo'; r.due_history = r.due_history || []; } rows.unshift(r); return r; });
      } else if (this.op === 'update') {
        out = rows.filter((r) => this.f.every((fn) => fn(r))).map((r) => {
          if (this.t === 'ops_tasks' && 'due_at' in this.v && r.due_at && this.v.due_at !== r.due_at) {       // mirror the database rule (sql/022)
            if (!this.v.due_change_reason || !this.v.due_change_reason.trim()) throw { message: 'Say why the due date is being moved.' };
            this.v.due_history = [...(r.due_history || []), { from: r.due_at, to: this.v.due_at, at: new Date().toISOString(), by: me, reason: this.v.due_change_reason }];
            this.v.due_change_reason = null;
          }
          Object.assign(r, this.v, { updated_at: new Date().toISOString() }); return r;
        });
      } else if (this.op === 'delete') { out = []; }
      else {
        out = rows.filter((r) => this.f.every((fn) => fn(r)));
        if (this.ord) { const [k, asc] = this.ord; out = [...out].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1)); }
        if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
      }
      if (this.one === 'single') { if (out.length !== 1) throw { message: 'single(): ' + out.length + ' rows' }; return out[0]; }
      if (this.one === 'maybe') return out[0] || null;
      return out;
    }
    then(res, rej) { let r; try { r = { data: this.run(), error: null }; } catch (e) { r = { data: null, error: e }; } return Promise.resolve(r).then(res, rej); }
  }
  const prof = db.ops_profiles.find((p) => p.id === me); const sess = { user: { id: me, email: prof ? prof.email : 'sara@izmi.test' } };
  window.supabase = { createClient() { return {
    rpc: (fn, args) => {
      if (fn === 'hv_my_systems') return Promise.resolve({ data: { hr: true, maint: true, crm: false, ops: true }, error: null });
      if (fn === 'ops_agency_list') return Promise.resolve({ data: db.ops_agencies.map((a) => ({ id: a.id, display_name: a.display_name })), error: null });
      if (fn === 'hv_alert_counts') return Promise.resolve({ data: {}, error: null });
      if (fn === 'ops_recode_listing') { const l = db.ops_listings.find((x) => x.id === args.p_id); Object.assign(l, { location: args.p_location, property_type: args.p_property_type, deal_type: args.p_deal_type, reference_code: 'MG-V-2001-' + (args.p_deal_type === 'rent' ? 'R' : 'S'), code_history: [{ from: 'HD-A-2001-S', to: 'MG-V-2001-R', at: new Date().toISOString(), by: me, reason: args.p_reason }] }); return Promise.resolve({ data: l, error: null }); }
      return Promise.resolve({ data: null, error: null });
    },
    from: (t) => new Q(t),
    storage: { from: () => ({ upload: async () => ({ data: {}, error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'about:blank' }, error: null }), remove: async () => ({ data: [], error: null }) }) },
    auth: { getSession: () => Promise.resolve({ data: { session: sess } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: () => Promise.resolve({}), signInWithPassword: () => Promise.resolve({ error: null }) },
  }; } };
  window.__mockDb = db;
})();
