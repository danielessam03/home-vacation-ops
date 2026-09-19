    const { useState, useEffect, useMemo, useRef, useCallback, useContext, createContext } = React;

    // =========================================================================================
    // CONFIG — bump APP_VERSION on EVERY deploy. It shows in the login footer.
    // =========================================================================================
    const APP_VERSION = 'v1.1.0';
    // The UNIFIED Home Vacation project — the same database and the same logins as HR, Maintenance and the CRM.
    const SUPABASE_URL = 'https://plwyzkqlbzcikmuurjqg.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_jdkL0GvmNoJGHnzadNAqgA_vuiFLthv';   // publishable key — safe here, RLS protects the data
    const tbl = (t) => 'ops_' + t;          // every HV Ops table is prefixed ops_ inside the shared database
    const HV_APPS = [
      ['HR & Payroll', 'https://home-vacation-hr.pages.dev'], ['Maintenance', 'https://hv-maintenance-system.pages.dev'],
      ['Property management (CRM)', 'https://property-management-crm.pages.dev'],
    ];

    const hasBuiltInConfig = /^https:\/\//.test(SUPABASE_URL);
    let sbc = null;
    const initSupabase = () => {
      let url = hasBuiltInConfig ? SUPABASE_URL : null, key = hasBuiltInConfig ? SUPABASE_ANON_KEY : null;
      try { url = url || localStorage.getItem('hvops_sb_url'); key = key || localStorage.getItem('hvops_sb_key'); } catch (e) {}
      if (url && key) sbc = supabase.createClient(url, key);
      return !!sbc;
    };

    // =========================================================================================
    // HELPERS
    // =========================================================================================
    const pad = (n) => String(n).padStart(2, '0');
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    const toLocalInput = (d) => { if (!d) return ''; const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`; };
    const fromLocalInput = (s) => s ? new Date(s).toISOString() : null;
    const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
    const monthStart = (d = new Date()) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-01`; };
    const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); return monthStart(new Date(y, m - 1 + n, 1)); };
    const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };
    const monthRange = (ym) => { const [y, m] = ym.split('-').map(Number); return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) }; };
    const inRange = (d, r) => { if (!d) return false; const t = new Date(d).getTime(); return t >= r.from.getTime() && t < r.to.getTime(); };
    const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const pct = (a, b) => b ? Math.round((1000 * a) / b) / 10 : null;
    const r1 = (n) => n == null || isNaN(n) ? null : Math.round(n * 10) / 10;
    const show = (v, unit = '') => v == null || v === '' ? '—' : `${typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : v}${unit}`;
    const money = (v, cur) => v == null || v === '' ? '—' : `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur || ''}`.trim();   // never converted
    const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const fmtHours = (h) => { if (h == null) return '—'; const m = Math.round(Math.abs(h) * 60); return m >= 2880 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
    const friendlyError = (e) => {
      const m = (e && e.message) || String(e);
      if (e && e.code === 'PGRST116') return 'You do not have permission to change this record.';
      if (/row-level security/i.test(m)) return 'You do not have permission for this action.';
      if (/duplicate key/i.test(m)) return 'This already exists (duplicate).';
      return m;
    };

    const ROLE_LABEL = { admin: 'Admin', manager: 'Marketing manager', data_entry: 'Data entry', marketing: 'Marketing' };
    const isMgr = (me) => me && (me.role === 'admin' || me.role === 'manager');
    const LISTING_STATUS = {
      draft: ['Draft', 'bg-slate-100 text-slate-700'], ready_to_publish: ['Ready to publish', 'bg-sky-100 text-sky-800'],
      published_claimed: ['Published (claimed)', 'bg-indigo-100 text-indigo-800'], verified_live: ['Verified live', 'bg-emerald-100 text-emerald-800'],
      on_hold: ['On hold', 'bg-amber-100 text-amber-800'], rejected: ['Rejected', 'bg-rose-100 text-rose-800'], archived: ['Archived', 'bg-slate-200 text-slate-500'],
    };
    const SOURCE_TYPES = ['sales_agent', 'owner', 'developer', 'whatsapp', 'walk_in', 'other'];
    const CHANNEL_STATUSES = ['not_started', 'in_progress', 'published', 'rejected'];
    const TASK_COLS = [['todo', 'To do'], ['doing', 'Doing'], ['review', 'Review'], ['done', 'Done']];
    const PRIORITY = { low: 'bg-slate-100 text-slate-600', normal: 'bg-sky-100 text-sky-700', high: 'bg-amber-100 text-amber-800', urgent: 'bg-rose-100 text-rose-700' };
    const DELIV_STATUS = { planned: 'bg-slate-100 text-slate-700', submitted: 'bg-sky-100 text-sky-800', approved: 'bg-emerald-100 text-emerald-800', revision_requested: 'bg-amber-100 text-amber-800', late: 'bg-rose-100 text-rose-700', missed: 'bg-rose-200 text-rose-900' };
    const SLA_STYLE = {
      green: { chip: 'bg-emerald-100 text-emerald-800 border-emerald-200', bar: 'border-l-emerald-500', dot: 'bg-emerald-500', label: 'On track' },
      yellow: { chip: 'bg-amber-100 text-amber-900 border-amber-200', bar: 'border-l-amber-500', dot: 'bg-amber-500', label: 'At risk' },
      red: { chip: 'bg-rose-100 text-rose-800 border-rose-200', bar: 'border-l-rose-600', dot: 'bg-rose-600', label: 'Breached' },
      none: { chip: 'bg-slate-100 text-slate-500 border-slate-200', bar: 'border-l-slate-300', dot: 'bg-slate-300', label: '—' },
    };

    // The 22 required fields + the rest of the form. type: text | num | bool | select | multi | area
    const FIELD_LABEL = {
      title: 'Title', location: 'Location', property_type: 'Property type', deal_type: 'Sale / Rent', area_sqm: 'Area (sqm)',
      building_levels: 'Building levels', floor: 'Floor', bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', balconies: 'Balconies',
      furnished: 'Furnished', media_images_count: 'Images (count)', media_videos_count: 'Videos (count)', media_drive_link: 'Media drive link',
      is_exclusive: 'Exclusive', view_type: 'View', price: 'Price', currency: 'Currency', facilities: 'Facilities', selling_points: 'Selling points',
      buyer_persona_nationality: 'Buyer persona — nationality', buyer_persona_age_range: 'Buyer persona — age range', buyer_persona_gender: 'Buyer persona — gender',
      cover_photo_belongs: 'Cover photo belongs to this unit', date_received: 'Date received (SLA start)', source_type: 'Source type',
      source_name: 'Source name (who gave it)', source_contact: 'Source contact', assigned_to: 'Assigned to',
    };
    const POSITIVE_FIELDS = ['media_images_count', 'media_videos_count', 'area_sqm', 'price'];

    // Mirrors fn_calc_completeness() so the meter is live while typing. The database value is the one that counts.
    function calcCompleteness(row, required) {
      const req = (required || []).filter((f) => f in FIELD_LABEL);
      const missing = req.filter((f) => {
        const v = row[f];
        if (v == null) return true;
        if (typeof v === 'string' && v.trim() === '') return true;
        if (Array.isArray(v) && v.length === 0) return true;
        if (POSITIVE_FIELDS.includes(f) && !(Number(v) > 0)) return true;
        return false;
      });
      return { pct: req.length ? Math.floor((100 * (req.length - missing.length)) / req.length) : 100, missing };
    }

    // Mirrors vw_listing_sla. Clock: date_received -> verified on the website, minus on_hold time.
    function slaOf(l, slaCfg, now = Date.now()) {
      const warn = Number((slaCfg && slaCfg.warn) || 48), breach = Number((slaCfg && slaCfg.breach) || 72), grace = Number((slaCfg && slaCfg.claim_grace) || 24);
      const verified = !!l.date_published_verified;
      const end = verified ? new Date(l.date_published_verified).getTime() : now;
      let paused = (l.paused_seconds || 0) * 1000;
      const onHold = l.status === 'on_hold' && !verified;
      if (onHold && l.hold_started_at) paused += now - new Date(l.hold_started_at).getTime();
      const hours = Math.max(0, (end - new Date(l.date_received).getTime() - paused) / 36e5);
      const state = ['rejected', 'archived'].includes(l.status) ? 'none' : hours < warn ? 'green' : hours <= breach ? 'yellow' : 'red';
      const claimedNotFound = l.status === 'published_claimed' && !verified && l.date_published_claimed
        && now - new Date(l.date_published_claimed).getTime() > grace * 36e5;
      return { hours, state, verified, onHold, remaining: breach - hours, onTime: verified && hours <= breach, claimedNotFound, breach, warn };
    }

    // ---------- CSV
    function parseCSV(text) {
      const rows = []; let row = [], cur = '', q = false;
      text = text.replace(/^﻿/, '');
      const sep = (text.split('\n')[0] || '').includes(',') ? ',' : ';';     // Excel in some locales exports ';'
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
        else if (c === '"') q = true;
        else if (c === sep) { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (c !== '\r') cur += c;
      }
      if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
      return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
    }
    function downloadCSV(filename, headers, rows) {
      const esc = (v) => { const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    }

    // =========================================================================================
    // UI ATOMS
    // =========================================================================================
    const ICONS = {
      home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10', list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
      tasks: 'M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10', bell: 'M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zm4 11a2 2 0 0 0 4 0',
      agency: 'M4 20V6l8-3v17M12 9l8 2v9M2 20h20M8 9h.01M8 13h.01M8 17h.01M16 14h.01M16 17h.01', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
      report: 'M7 3h8l4 4v14H7zM14 3v5h5M10 13h6M10 17h6', cog: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm8 3l2-1.5-2-3.5-2.4.8a7 7 0 0 0-1.6-.9L15.5 4h-4l-.5 2.4a7 7 0 0 0-1.6.9L7 6.5 5 10l2 1.5a7 7 0 0 0 0 1L5 14l2 3.5 2.4-.8c.5.4 1 .7 1.6.9l.5 2.4h4l.5-2.4c.6-.2 1.1-.5 1.6-.9l2.4.8 2-3.5-2-1.5a7 7 0 0 0 0-1z',
      more: 'M5 12h.01M12 12h.01M19 12h.01', plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', copy: 'M9 9h10v11H9zM5 15V4h10', logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
      check: 'M5 12l5 5 9-10', back: 'M15 5l-7 7 7 7', upload: 'M12 16V4M7 9l5-5 5 5M4 20h16', print: 'M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    };
    const Icon = ({ name, className = 'w-5 h-5' }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name] || ''} /></svg>
    );
    const Badge = ({ className = 'bg-slate-100 text-slate-700', children }) => <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}>{children}</span>;
    const Btn = ({ kind = 'primary', className = '', ...p }) => {
      const k = { primary: 'bg-brand-700 text-white hover:bg-brand-800', ghost: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50', danger: 'bg-rose-600 text-white hover:bg-rose-700', ok: 'bg-emerald-600 text-white hover:bg-emerald-700', soft: 'bg-brand-50 text-brand-800 hover:bg-brand-100' }[kind];
      return <button type="button" {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${k} ${className}`} />;
    };
    const Card = ({ className = '', children, ...p }) => <div {...p} className={`print-card bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>{children}</div>;
    const inputCls = (bad) => `w-full rounded-lg border px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 ${bad ? 'border-rose-500 ring-1 ring-rose-300' : 'border-slate-300'}`;
    const Field = ({ label, bad, hint, children, className = '' }) => (
      <label className={`block ${className}`}>
        <span className={`mb-1 flex items-center gap-1.5 text-xs font-medium ${bad ? 'text-rose-700' : 'text-slate-600'}`}>{label}{bad && <span className="rounded bg-rose-600 px-1 text-[10px] text-white">required</span>}</span>
        {children}
        {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      </label>
    );
    const Select = ({ value, onChange, options, placeholder = 'Select…', bad, disabled }) => (
      <select className={inputCls(bad)} value={value == null ? '' : value} disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>)}
      </select>
    );
    const TriState = ({ value, onChange, bad }) => (
      <div className={`flex rounded-lg border overflow-hidden ${bad ? 'border-rose-500 ring-1 ring-rose-300' : 'border-slate-300'}`}>
        {[[true, 'Yes'], [false, 'No']].map(([v, l]) => (
          <button type="button" key={l} onClick={() => onChange(value === v ? null : v)} className={`flex-1 py-2 text-sm ${value === v ? 'bg-brand-700 text-white' : 'bg-white text-slate-700'}`}>{l}</button>
        ))}
      </div>
    );
    const Modal = ({ title, onClose, children, wide, footer }) => (
      <div className="no-print fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
          {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">{footer}</div>}
        </div>
      </div>
    );
    const PageHeader = ({ title, sub, children }) => (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-xl font-bold text-slate-900">{title}</h1>{sub && <p className="text-sm text-slate-500">{sub}</p>}</div>
        <div className="no-print flex flex-wrap items-center gap-2">{children}</div>
      </div>
    );
    const Empty = ({ children }) => <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
    const Meter = ({ value, className = '' }) => (
      <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
        <div className={`h-full rounded-full ${value >= 100 ? 'bg-emerald-500' : value >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    );
    const Tile = ({ label, value, target, better = 'high', tone, onClick }) => {
      let ok = null;
      if (target != null && value != null && typeof value === 'number') ok = better === 'low' ? value <= target : value >= target;
      return (
        <Card className={`p-3 ${onClick ? 'cursor-pointer hover:border-brand-500' : ''} ${tone === 'red' ? 'border-rose-300 bg-rose-50' : ''}`} onClick={onClick}>
          <div className="text-xs text-slate-500">{label}</div>
          <div className={`num mt-1 text-2xl font-bold ${tone === 'red' ? 'text-rose-700' : 'text-slate-900'}`}>{typeof value === 'number' ? show(value) : value == null ? '—' : value}</div>
          {target != null && <div className={`mt-0.5 text-xs ${ok == null ? 'text-slate-500' : ok ? 'text-emerald-700' : 'text-rose-700'}`}>Target {show(Number(target))}{ok == null ? '' : ok ? ' ✓' : ' ✗'}</div>}
        </Card>
      );
    };
    const Tabs = ({ tabs, value, onChange }) => (
      <div className="no-print scroll-x mb-4 flex gap-1 border-b border-slate-200">
        {tabs.map(([k, l, n]) => (
          <button key={k} onClick={() => onChange(k)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${value === k ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {l}{n ? <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 text-[10px] text-white">{n}</span> : null}
          </button>
        ))}
      </div>
    );
    const MonthPicker = ({ value, onChange }) => (
      <div className="no-print inline-flex items-center rounded-lg border border-slate-300 bg-white">
        <button className="px-2.5 py-2 text-slate-600" onClick={() => onChange(addMonths(value, -1))} aria-label="Previous month">‹</button>
        <span className="min-w-[8.5rem] text-center text-sm font-medium">{monthLabel(value)}</span>
        <button className="px-2.5 py-2 text-slate-600" onClick={() => onChange(addMonths(value, 1))} aria-label="Next month">›</button>
      </div>
    );
    const SlaChip = ({ listing }) => {
      const { cfg, now } = useApp();
      const s = slaOf(listing, cfg.sla_hours, now);
      if (s.state === 'none') return null;
      const st = SLA_STYLE[s.state];
      const text = s.verified ? `Live in ${fmtHours(s.hours)}` : s.onHold ? `Paused · ${fmtHours(s.hours)}` : s.remaining >= 0 ? `${fmtHours(s.remaining)} left` : `${fmtHours(-s.remaining)} over`;
      return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${st.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{text}</span>;
    };
    const StatusBadge = ({ status }) => { const s = LISTING_STATUS[status] || [status, '']; return <Badge className={s[1]}>{s[0]}</Badge>; };
    // Single-series bar chart. Values are labelled directly so no axis is needed.
    const Bars = ({ rows, unit = '' }) => {
      const max = Math.max(1, ...rows.map((r) => r.value || 0));
      return (
        <div className="flex h-36 items-end gap-2">
          {rows.map((r) => (
            <div key={r.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="num text-[11px] font-medium text-slate-700">{r.value == null ? '—' : show(r.value, unit)}</span>
              <div className="w-full max-w-[44px] rounded-t bg-brand-500" style={{ height: `${Math.max(2, (100 * (r.value || 0)) / max)}px` }} />
              <span className="w-full truncate text-center text-[11px] text-slate-500">{r.label}</span>
            </div>
          ))}
        </div>
      );
    };

    const AppCtx = createContext(null);
    const useApp = () => useContext(AppCtx);
