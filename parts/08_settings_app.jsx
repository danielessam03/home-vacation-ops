
    // =========================================================================================
    // ALERTS
    // =========================================================================================
    const ALERT_STYLE = { critical: 'border-l-rose-600 bg-rose-50', warning: 'border-l-amber-500 bg-amber-50', info: 'border-l-sky-500 bg-white' };
    const AlertsPage = () => {
      const { data, setData, go, toast } = useApp();
      const [onlyUnread, setOnlyUnread] = useState(true);
      const rows = data.alerts.filter((a) => !onlyUnread || !a.is_read);
      const mark = async (ids) => {
        if (!ids.length) return;
        const { data: saved, error } = await sbc.from(tbl('alerts')).update({ is_read: true }).in('id', ids).select();
        if (error) { toast(friendlyError(error), 'error'); return; }
        const m = new Map(saved.map((s) => [s.id, s]));
        setData((d) => ({ ...d, alerts: d.alerts.map((a) => m.get(a.id) || a) }));
      };
      const openAlert = (a) => { mark([a.id]); if (a.entity_type === 'listing') go('listing', a.entity_id); else if (a.entity_type === 'project') go('project', a.entity_id); else if (a.entity_type === 'task') go('tasks'); else if (a.entity_type === 'agency_deliverable') go('agencies'); };
      return (
        <div>
          <PageHeader title="Alerts" sub="Raised hourly by the verifier worker">
            <Btn kind="ghost" onClick={() => setOnlyUnread(!onlyUnread)}>{onlyUnread ? 'Show all' : 'Unread only'}</Btn>
            <Btn kind="ghost" onClick={() => mark(data.alerts.filter((a) => !a.is_read).map((a) => a.id))}>Mark all read</Btn>
          </PageHeader>
          {!rows.length ? <Empty>No {onlyUnread ? 'unread ' : ''}alerts.</Empty> : (
            <div className="space-y-2">{rows.map((a) => (
              <Card key={a.id} className={`cursor-pointer border-l-4 p-3 ${ALERT_STYLE[a.level]} ${a.is_read ? 'opacity-60' : ''}`} onClick={() => openAlert(a)}>
                <div className="flex items-start justify-between gap-2"><div className="text-sm font-semibold text-slate-900">{a.title}</div><span className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(a.created_at)}</span></div>
                {a.body && <div className="mt-0.5 break-words text-sm text-slate-600">{a.body}</div>}
              </Card>))}</div>
          )}
        </div>
      );
    };

    // =========================================================================================
    // SETTINGS (admin)
    // =========================================================================================
    const KVEditor = ({ settingKey, nameLabel, codeLabel, hint }) => {
      const { cfg, saveSetting } = useApp();
      const [rows, setRows] = useState(() => Object.entries(cfg[settingKey] || {}).sort((a, b) => a[0].localeCompare(b[0])));
      const [busy, setBusy] = useState(false);
      const codes = rows.map((r) => r[1].trim().toUpperCase()); const dupCode = codes.find((c, i) => c && codes.indexOf(c) !== i);
      const submit = async () => { setBusy(true); await saveSetting(settingKey, Object.fromEntries(rows.filter((r) => r[0].trim() && r[1].trim()).map((r) => [r[0].trim(), r[1].trim().toUpperCase().replace(/[^A-Z0-9]/g, '')]))); setBusy(false); };
      return (
        <Card className="p-4">
          <p className="mb-3 text-sm text-slate-500">{hint}</p>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input className={inputCls()} placeholder={nameLabel} value={r[0]} onChange={(e) => setRows(rows.map((x, j) => j === i ? [e.target.value, x[1]] : x))} />
                <input className={`${inputCls(dupCode && r[1].trim().toUpperCase() === dupCode)} !w-28 font-mono uppercase`} placeholder={codeLabel} value={r[1]} onChange={(e) => setRows(rows.map((x, j) => j === i ? [x[0], e.target.value] : x))} />
                <button className="px-2 text-slate-400 hover:text-rose-600" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove"><Icon name="x" className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          {dupCode && <p className="mt-2 text-sm text-rose-700">Code {dupCode} is used twice.</p>}
          <div className="mt-3 flex gap-2"><Btn kind="ghost" onClick={() => setRows([...rows, ['', '']])}><Icon name="plus" className="h-4 w-4" />Add row</Btn><Btn onClick={submit} disabled={busy || !!dupCode}>Save</Btn></div>
        </Card>
      );
    };

    const ListEditor = ({ settingKey, title, hint }) => {
      const { cfg, saveSetting } = useApp();
      const [items, setItems] = useState(cfg[settingKey] || []); const [v, setV] = useState('');
      const add = () => { const x = v.trim(); if (x && !items.includes(x)) setItems([...items, x]); setV(''); };
      return (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-brand-800">{title}</h3>{hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
          <div className="my-2 flex flex-wrap gap-1.5">{items.map((it) => <span key={it} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs">{it}<button onClick={() => setItems(items.filter((x) => x !== it))} className="text-slate-400 hover:text-rose-600">×</button></span>)}</div>
          <div className="flex gap-2"><input className={inputCls()} value={v} placeholder="Add…" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /><Btn kind="ghost" onClick={add}>Add</Btn><Btn onClick={() => saveSetting(settingKey, items)}>Save</Btn></div>
        </Card>
      );
    };

    const UsersTab = () => {
      const { data, reloadTable } = useApp();
      return (
        <div className="space-y-3">
          <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
            <p className="text-sm text-slate-600">One login for every Home Vacation system. Create people, reset passwords and switch HV Ops on or off in <b>HR → Users</b> (tick “HV Ops” and pick the role).</p>
            <div className="flex gap-2"><Btn kind="ghost" onClick={() => reloadTable('profiles')}>Refresh</Btn><a className="inline-flex items-center rounded-lg bg-brand-700 px-3.5 py-2 text-sm font-medium text-white" href="https://home-vacation-hr.pages.dev" target="_blank" rel="noreferrer">Open HR ↗</a></div>
          </Card>
          {data.profiles.map((p) => (
            <Card key={p.id} className={`flex flex-wrap items-center justify-between gap-2 p-3 ${p.is_active ? '' : 'opacity-60'}`}>
              <div className="min-w-0"><div className="font-medium text-slate-900">{p.full_name || '—'}</div><div className="truncate text-xs text-slate-500">{p.username ? `${p.username} · ` : ''}{p.email}{p.phone ? ` · ${p.phone}` : ''}</div></div>
              <div className="flex items-center gap-1.5"><Badge className="bg-brand-50 text-brand-800">{ROLE_LABEL[p.role] || p.role}</Badge>{!p.is_active && <Badge className="bg-amber-100 text-amber-800">No access</Badge>}{!p.employee_id && <Badge className="bg-rose-100 text-rose-800" >No HR employee linked — KPIs not credited</Badge>}</div>
            </Card>
          ))}
        </div>
      );
    };

    const AgencyContractForm = ({ agency }) => {
      const { save, cfg } = useApp();
      const [f, setF] = useState(agency); const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
      const submit = () => save('agencies', { display_name: f.display_name, contact_person: f.contact_person || null, contact_email: f.contact_email || null, contact_phone: f.contact_phone || null, contract_start: f.contract_start || null,
        contract_end: f.contract_end || null, monthly_fee: f.monthly_fee === '' || f.monthly_fee == null ? null : Number(f.monthly_fee), currency: f.currency || null, scope_notes: f.scope_notes || null, is_active: f.is_active }, agency.id);
      return (
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Display name"><input className={inputCls()} value={f.display_name || ''} onChange={(e) => set('display_name', e.target.value)} /></Field>
            <Field label="Contact person"><input className={inputCls()} value={f.contact_person || ''} onChange={(e) => set('contact_person', e.target.value)} /></Field>
            <Field label="Contact email"><input className={inputCls()} value={f.contact_email || ''} onChange={(e) => set('contact_email', e.target.value)} /></Field>
            <Field label="Contact phone"><input className={inputCls()} value={f.contact_phone || ''} onChange={(e) => set('contact_phone', e.target.value)} /></Field>
            <Field label="Contract start"><input type="date" className={inputCls()} value={f.contract_start || ''} onChange={(e) => set('contract_start', e.target.value)} /></Field>
            <Field label="Contract end"><input type="date" className={inputCls()} value={f.contract_end || ''} onChange={(e) => set('contract_end', e.target.value)} /></Field>
            <Field label="Monthly fee"><input type="number" step="any" className={inputCls()} value={f.monthly_fee == null ? '' : f.monthly_fee} onChange={(e) => set('monthly_fee', e.target.value)} /></Field>
            <Field label="Currency (not converted)"><Select value={f.currency} onChange={(v) => set('currency', v)} options={[...(cfg.currencies || []), 'GBP']} /></Field>
            <Field label="Scope" className="col-span-2 sm:col-span-3"><textarea rows={2} className={inputCls()} value={f.scope_notes || ''} onChange={(e) => set('scope_notes', e.target.value)} /></Field>
          </div>
          <div className="mt-3"><Btn onClick={submit}>Save {agency.display_name}</Btn></div>
        </Card>
      );
    };

    const MetricDefsEditor = () => {
      const { cfg, data, saveSetting } = useApp();
      const [defs, setDefs] = useState(cfg.metric_defs || {});
      const upd = (a, i, k, v) => setDefs({ ...defs, [a]: defs[a].map((d, j) => j === i ? { ...d, [k]: v } : d) });
      return (
        <div className="space-y-4">{data.agencies.map((a) => (
          <Card key={a.id} className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-brand-800">{a.display_name} — monthly metrics</h3>
            <div className="space-y-2">{(defs[a.name] || []).map((d, i) => (
              <div key={i} className="flex gap-2">
                <input className={`${inputCls()} font-mono`} placeholder="key" value={d.key} onChange={(e) => upd(a.name, i, 'key', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} />
                <input className={inputCls()} placeholder="Label" value={d.label} onChange={(e) => upd(a.name, i, 'label', e.target.value)} />
                <div className="w-32 shrink-0"><Select value={d.unit} onChange={(v) => upd(a.name, i, 'unit', v || 'count')} options={['count', '%', 'currency']} /></div>
                <button className="px-1 text-slate-400 hover:text-rose-600" onClick={() => setDefs({ ...defs, [a.name]: defs[a.name].filter((_, j) => j !== i) })}><Icon name="x" className="h-4 w-4" /></button>
              </div>))}</div>
            <div className="mt-3 flex gap-2"><Btn kind="ghost" onClick={() => setDefs({ ...defs, [a.name]: [...(defs[a.name] || []), { key: '', label: '', unit: 'count' }] })}>Add metric</Btn><Btn onClick={() => saveSetting('metric_defs', defs)}>Save</Btn></div>
          </Card>))}
        </div>
      );
    };

    const VerifierTab = () => {
      const { cfg, data, saveSetting, workerCall, reloadTable, toast } = useApp();
      const [url, setUrl] = useState(cfg.worker_url || ''); const [busy, setBusy] = useState(false);
      const runNow = async () => { setBusy(true); const r = await workerCall('/run'); setBusy(false); if (r) { toast(`Verifier: ${r.refs_found} refs read, ${r.listings_verified} listings verified`); reloadTable('verifier_runs'); reloadTable('listings'); reloadTable('alerts'); } };
      return (
        <div className="space-y-4">
          <Card className="p-4">
            <Field label="Worker URL" hint="Shown by “wrangler deploy”, e.g. https://hv-ops-verifier.<account>.workers.dev — enables the “Run verifier now” and “Generate today’s recurring tasks” buttons.">
              <div className="flex gap-2"><input className={inputCls()} value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://…workers.dev" /><Btn onClick={() => saveSetting('worker_url', url.replace(/\/+$/, ''))}>Save</Btn></div>
            </Field>
            {cfg.worker_url && <div className="mt-3"><Btn kind="soft" onClick={runNow} disabled={busy}>{busy ? 'Running…' : 'Run verifier now'}</Btn></div>}
          </Card>
          <Card className="scroll-x p-4">
            <h3 className="mb-2 text-sm font-semibold text-brand-800">Last runs</h3>
            {!data.verifier_runs.length ? <p className="text-sm text-slate-400">The verifier has not run yet.</p> : (
              <table className="w-full text-sm"><thead className="text-left text-xs text-slate-500"><tr>{['Started', 'Method', 'Pages listed', 'Fetched', 'Refs read', 'Verified', 'Alerts', 'Backlog left', 'Error'].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}</tr></thead>
                <tbody>{data.verifier_runs.map((r) => <tr key={r.id} className="border-t border-slate-100"><td className="whitespace-nowrap px-2 py-1.5">{fmtDateTime(r.started_at)}</td><td className="px-2 py-1.5">{r.method}</td><td className="num px-2 py-1.5">{r.pages_listed}</td><td className="num px-2 py-1.5">{r.pages_fetched}</td><td className="num px-2 py-1.5">{r.refs_found}</td><td className="num px-2 py-1.5">{r.listings_verified}</td><td className="num px-2 py-1.5">{r.alerts_created}</td><td className="num px-2 py-1.5">{r.pending_pages}</td><td className="max-w-[16rem] truncate px-2 py-1.5 text-rose-700" title={r.error || ''}>{r.error || ''}</td></tr>)}</tbody></table>
            )}
          </Card>
        </div>
      );
    };

    const SettingsPage = () => {
      const { cfg, data, saveSetting } = useApp();
      const [tab, setTab] = useState('users');
      const [preq, setPreq] = useState(cfg.project_required_fields || []); const [psla, setPsla] = useState(cfg.project_sla_hours || {});
      const [sla, setSla] = useState(cfg.sla_hours || {}); const [req, setReq] = useState(cfg.required_fields || []); const [chans, setChans] = useState(cfg.default_channels || []); const [labels, setLabels] = useState(cfg.portal_labels || {});
      const candidates = Object.keys(FIELD_LABEL).filter((k) => !['date_received', 'source_type', 'source_name', 'assigned_to'].includes(k));
      return (
        <div>
          <PageHeader title="Settings" sub="Admin only" />
          <Tabs value={tab} onChange={setTab} tabs={[['users', 'Users'], ['loc', 'Location codes'], ['types', 'Unit type codes'], ['req', 'Required fields'], ['sla', 'SLA & workflow'], ['portals', 'Portals'], ['lists', 'Lists'], ['metrics', 'KPI metrics'], ['agencies', 'Agencies'], ['verifier', 'Verifier']]} />
          {tab === 'users' && <UsersTab />}
          {tab === 'loc' && <KVEditor settingKey="location_codes" nameLabel="Location (as on the website)" codeLabel="Code" hint="First part of the reference code (HD-A-1012-S). Changing a code only affects NEW listings — existing codes never change." />}
          {tab === 'types' && <KVEditor settingKey="unit_type_codes" nameLabel="Unit type" codeLabel="Code" hint="Second part of the reference code." />}
          {tab === 'req' && (
            <Card className="p-4">
              <p className="mb-3 text-sm text-slate-500">Ticked fields count toward 100% completeness ({req.length} selected). A listing cannot move to Ready to publish until all are filled. Existing listings are re-scored the next time they are saved.</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">{candidates.map((k) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={req.includes(k)} onChange={() => setReq(req.includes(k) ? req.filter((x) => x !== k) : [...req, k])} />{FIELD_LABEL[k]}</label>)}</div>
              <div className="mt-3"><Btn onClick={() => saveSetting('required_fields', req)}>Save</Btn></div>
              <h3 className="mt-6 border-t border-slate-200 pt-4 text-sm font-semibold text-brand-800">Projects — required fields ({preq.length} selected)</h3>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">{Object.keys(PROJECT_LABEL).filter((k) => !['date_received', 'assigned_to'].includes(k)).map((k) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={preq.includes(k)} onChange={() => setPreq(preq.includes(k) ? preq.filter((x) => x !== k) : [...preq, k])} />{PROJECT_LABEL[k]}</label>)}</div>
              <div className="mt-3"><Btn onClick={() => saveSetting('project_required_fields', preq)}>Save project fields</Btn></div>
            </Card>
          )}
          {tab === 'sla' && (
            <Card className="p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[['warn', 'At risk after (h)'], ['breach', 'Breached after (h)'], ['incomplete_alert', 'Incomplete alert after (h)'], ['claim_grace', 'Claimed-not-found after (h)']].map(([k, l]) => <Field key={k} label={l}><input type="number" min="1" className={inputCls()} value={sla[k] == null ? '' : sla[k]} onChange={(e) => setSla({ ...sla, [k]: e.target.value })} /></Field>)}
              </div>
              <div className="mt-3"><Btn onClick={() => saveSetting('sla_hours', Object.fromEntries(Object.entries(sla).map(([k, v]) => [k, Number(v)])))}>Save</Btn></div>
              <h3 className="mt-6 border-t border-slate-200 pt-4 text-sm font-semibold text-brand-800">Projects — SLA (hours from received to live on the website)</h3>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['warn', 'At risk after (h)'], ['breach', 'Breached after (h)'], ['incomplete_alert', 'Incomplete alert after (h)'], ['claim_grace', 'Claimed-not-found after (h)']].map(([k, l]) => <Field key={k} label={l}><input type="number" min="1" className={inputCls()} value={psla[k] == null ? '' : psla[k]} onChange={(e) => setPsla({ ...psla, [k]: e.target.value })} /></Field>)}</div>
              <div className="mt-3"><Btn onClick={() => saveSetting('project_sla_hours', Object.fromEntries(Object.entries(psla).map(([k, v]) => [k, Number(v)])))}>Save project SLA</Btn></div>
              <div className="mt-5 max-w-sm border-t border-slate-200 pt-4"><Field label="Default uploader — every new listing is handed to this person to put online"><Select value={cfg.default_uploader || null} placeholder="Nobody (stays with the person who entered it)" options={data.profiles.filter((p) => p.is_active).map((p) => [p.id, p.full_name || p.email])} onChange={(v) => saveSetting('default_uploader', v)} /></Field></div>
            </Card>
          )}
          {tab === 'portals' && (
            <Card className="p-4">
              <p className="mb-3 text-sm text-slate-500">Tick the channels every new listing should get automatically. Rename a portal with its label. (A brand-new portal needs one small SQL migration to add it to the channel list.)</p>
              <div className="space-y-2">{Object.keys(labels).map((c) => (
                <div key={c} className="flex items-center gap-3"><input type="checkbox" className="h-4 w-4" checked={chans.includes(c)} onChange={() => setChans(chans.includes(c) ? chans.filter((x) => x !== c) : [...chans, c])} /><span className="w-36 font-mono text-xs text-slate-500">{c}</span><input className={inputCls()} value={labels[c]} onChange={(e) => setLabels({ ...labels, [c]: e.target.value })} /></div>))}</div>
              <div className="mt-3"><Btn onClick={async () => { await saveSetting('default_channels', chans); await saveSetting('portal_labels', labels); }}>Save</Btn></div>
            </Card>
          )}
          {tab === 'lists' && <div className="space-y-4"><ListEditor settingKey="facilities" title="Facilities / amenities" hint="Staff can still type a one-off facility on a listing." /><ListEditor settingKey="view_types" title="View types" /><ListEditor settingKey="project_types" title="Project — unit types" /><ListEditor settingKey="finishing_types" title="Project — finishing options" /><ListEditor settingKey="age_ranges" title="Buyer persona age ranges" /><ListEditor settingKey="currencies" title="Currencies" hint="Amounts are never converted." /><ListEditor settingKey="task_types" title="Task types" hint="photo_shoot and video_shoot count as “shoots completed”." /><ListEditor settingKey="deliverable_item_types" title="Agency deliverable types" /><AiPromptEditor /></div>}
          {tab === 'metrics' && <MetricDefsEditor />}
          {tab === 'agencies' && <div className="space-y-4">{data.agencies.map((a) => <AgencyContractForm key={a.id} agency={a} />)}</div>}
          {tab === 'verifier' && <VerifierTab />}
        </div>
      );
    };

    // =========================================================================================
    // LOGIN / CONNECT
    // =========================================================================================
    const Shell = ({ children }) => (
      <div className="flex min-h-screen flex-col items-center justify-center bg-brand-800 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-5 text-center"><img src={LOGO_LOCKUP} alt="Home Vacation — Investment for Real Estate" className="mx-auto mb-3 h-16 w-auto max-w-full object-contain" /><h1 className="text-lg font-bold text-slate-900">HV Ops</h1><p className="text-xs text-slate-500">Marketing &amp; data entry operations</p></div>
          {children}
        </div>
        <p className="mt-4 text-xs text-brand-200">HV Ops {APP_VERSION}</p>
      </div>
    );

    const ConnectScreen = ({ onDone }) => {
      const [url, setUrl] = useState(''); const [key, setKey] = useState('');
      const go = () => { try { localStorage.setItem('hvops_sb_url', url.trim()); localStorage.setItem('hvops_sb_key', key.trim()); } catch (e) {} if (initSupabase()) onDone(); };
      return (
        <Shell>
          <p className="mb-3 text-sm text-slate-600">Connect this app to the HV Ops Supabase project (Project Settings → API).</p>
          <div className="space-y-3">
            <Field label="Project URL"><input className={inputCls()} placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
            <Field label="anon / publishable key"><textarea rows={3} className={`${inputCls()} !text-xs`} value={key} onChange={(e) => setKey(e.target.value)} /></Field>
            <Btn className="w-full" disabled={!/^https:\/\/.+/.test(url.trim()) || key.trim().length < 20} onClick={go}>Connect</Btn>
          </div>
        </Shell>
      );
    };

    const Login = ({ onReconfigure, notice }) => {
      const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState(notice || ''); const [busy, setBusy] = useState(false);
      const submit = async (e) => {
        e.preventDefault(); setBusy(true); setErr('');
        let loginEmail = email.trim();
        if (!loginEmail.includes('@')) {          // username -> email, same resolver the other systems use
          const { data: resolved } = await sbc.rpc('hv_login_email', { p_username: loginEmail });
          if (!resolved) { setBusy(false); setErr('Unknown username.'); return; }
          loginEmail = resolved;
        }
        const { error } = await sbc.auth.signInWithPassword({ email: loginEmail, password });
        setBusy(false); if (error) setErr(error.message);
      };
      return (
        <Shell>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Username or email"><input type="text" autoCapitalize="none" autoComplete="username" className={inputCls()} value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Password"><input type="password" autoComplete="current-password" className={inputCls()} value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {err && <p className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{err}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand-700 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-400">Same username and password as HR, Maintenance and the CRM.</p>
          {!hasBuiltInConfig && <button className="mt-1 w-full text-center text-xs text-slate-400 underline" onClick={onReconfigure}>Reconfigure connection</button>}
        </Shell>
      );
    };

    // =========================================================================================
    // APP
    // =========================================================================================
    const TABLES = {
      profiles: { order: 'full_name' }, listings: { order: 'date_received', desc: true }, listing_channels: { order: 'updated_at', desc: true }, tasks: { order: 'created_at', desc: true },
      recurring_templates: { order: 'created_at' }, agencies: { order: 'display_name' }, agency_deliverables: { order: 'due_date' }, agency_metrics: { order: 'period_month', desc: true },
      kpi_targets: { order: 'period_month', desc: true }, alerts: { order: 'created_at', desc: true, max: 300 }, settings: { order: 'key' }, report_snapshots: { order: 'created_at', desc: true, max: 100 },
      verifier_runs: { order: 'started_at', desc: true, max: 25 }, projects: { order: 'date_received', desc: true }, photo_requests: { order: 'created_at', desc: true },
    };
    const EMPTY = Object.fromEntries(Object.keys(TABLES).map((t) => [t, []]));

    async function fetchAll(table) {
      const { order, desc, max = 50000 } = TABLES[table]; const out = [];
      for (let from = 0; from < max; from += 1000) {
        const { data, error } = await sbc.from(tbl(table)).select('*').order(order, { ascending: !desc }).range(from, Math.min(from + 999, max - 1));
        if (error) throw error;
        out.push(...data); if (data.length < 1000) break;
      }
      return out;
    }

    const NAV = [
      ['dashboard', 'Home', 'home', () => true], ['listings', 'Listings', 'list', () => true], ['tasks', 'Tasks', 'tasks', () => true], ['alerts', 'Alerts', 'bell', () => true],
      ['projects', 'Projects', 'project', () => true], ['photo', 'Needs photography', 'camera', () => true],
      ['agencies', 'Agencies', 'agency', (me) => me.role !== 'data_entry'], ['kpis', 'KPIs', 'chart', () => true], ['reports', 'Reports', 'report', (me) => isMgr(me)], ['settings', 'Settings', 'cog', (me) => me.role === 'admin'],
    ];

    const App = () => {
      const [connected, setConnected] = useState(() => initSupabase());
      const [session, setSession] = useState(undefined); const [me, setMe] = useState(null); const [notice, setNotice] = useState('');
      const [data, setData] = useState(EMPTY); const [loading, setLoading] = useState(false); const [loadError, setLoadError] = useState('');
      const [route, setRoute] = useState({ page: 'dashboard', id: null }); const [toasts, setToasts] = useState([]); const [now, setNow] = useState(Date.now()); const [more, setMore] = useState(false);
      const sessionRef = useRef(null); sessionRef.current = session;
      // only the Home Vacation systems ticked for this account in HR are offered in the switcher
      const [systems, setSystems] = useState(null);
      useEffect(() => {
        const id = session && session.user.id; if (!id) { setSystems(null); return; }
        try { const c = JSON.parse(localStorage.getItem('hv_my_systems_' + id) || 'null'); if (c) setSystems(c); } catch (e) {}
        sbc.rpc('hv_my_systems').then(({ data: d, error }) => { if (error || !d) return; setSystems(d); try { localStorage.setItem('hv_my_systems_' + id, JSON.stringify(d)); } catch (e) {} });
      }, [session && session.user.id]);

      const toast = useCallback((text, kind = 'ok') => { const id = Math.random(); setToasts((t) => [...t, { id, text, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 2500); }, []);
      const go = useCallback((page, id = null) => { setRoute({ page, id }); setMore(false); window.scrollTo(0, 0); }, []);

      useEffect(() => {
        if (!connected) return;
        sbc.auth.getSession().then(({ data: d }) => setSession(d.session || null));
        const { data: sub } = sbc.auth.onAuthStateChange((_e, s) => setSession(s || null));   // data reloads only when the user id changes
        return () => sub.subscription.unsubscribe();
      }, [connected]);

      const reloadTable = useCallback(async (table) => { try { const rows = await fetchAll(table); setData((d) => ({ ...d, [table]: rows })); } catch (e) { /* keep what we have */ } }, []);
      const reloadWhere = useCallback(async (table, col, val) => {
        const { data: rows } = await sbc.from(tbl(table)).select('*').eq(col, val);
        if (rows) setData((d) => ({ ...d, [table]: [...d[table].filter((r) => r[col] !== val), ...rows] }));
      }, []);

      const uid = session && session.user.id;
      useEffect(() => {
        if (!uid) { setMe(null); setData(EMPTY); return; }
        (async () => {
          setLoading(true); setLoadError('');
          const { data: prof, error } = await sbc.from(tbl('profiles')).select('*').eq('id', uid).maybeSingle();
          if (error || !prof || !prof.is_active) {
            setNotice(error ? friendlyError(error) : 'Your login works, but HV Ops is not switched on for you. Ask HR to tick “HV Ops” on your login (HR → Users).');
            await sbc.auth.signOut(); setLoading(false); return;
          }
          try {
            const names = Object.keys(TABLES); const results = await Promise.all(names.map(fetchAll));
            setData(Object.fromEntries(names.map((n, i) => [n, results[i]]))); setMe(prof); setNotice('');
          } catch (e) { setLoadError(`${friendlyError(e)} — were the HV Ops SQL files run on the unified project?`); }
          setLoading(false);
        })();
      }, [uid]);

      // the verifier changes data server-side: refresh the moving tables every 3 min and when the tab regains focus
      useEffect(() => {
        if (!me) return;
        const refresh = () => ['listings', 'listing_channels', 'projects', 'photo_requests', 'tasks', 'alerts'].forEach(reloadTable);
        const t1 = setInterval(() => setNow(Date.now()), 60000); const t2 = setInterval(refresh, 180000);
        const onVis = () => { if (!document.hidden) { setNow(Date.now()); refresh(); } };
        document.addEventListener('visibilitychange', onVis);
        return () => { clearInterval(t1); clearInterval(t2); document.removeEventListener('visibilitychange', onVis); };
      }, [me && me.id]);

      const cfg = useMemo(() => Object.fromEntries(data.settings.map((s) => [s.key, s.value])), [data.settings]);
      const nameOf = useCallback((id) => { const p = data.profiles.find((x) => x.id === id); return p ? p.full_name || p.email : '—'; }, [data.profiles]);

      // Every write returns the saved row (.select().single()) and local state is updated immediately.
      const save = useCallback(async (table, values, id) => {
        const q = id ? sbc.from(tbl(table)).update(values).eq('id', id) : sbc.from(tbl(table)).insert(values);
        const { data: row, error } = await q.select().single();
        if (error) { toast(friendlyError(error), 'error'); return null; }
        setData((d) => ({ ...d, [table]: d[table].some((r) => r.id === row.id) ? d[table].map((r) => (r.id === row.id ? row : r)) : [row, ...d[table]] }));
        return row;
      }, [toast]);
      const saveSetting = useCallback(async (key, value) => {
        const { data: row, error } = await sbc.from(tbl('settings')).upsert({ key, value, updated_by: sessionRef.current.user.id, updated_at: new Date().toISOString() }).select().single();
        if (error) { toast(friendlyError(error), 'error'); return null; }
        setData((d) => ({ ...d, settings: [...d.settings.filter((s) => s.key !== key), row] })); toast('Saved'); return row;
      }, [toast]);
      const workerCall = useCallback(async (path, body) => {
        if (!cfg.worker_url) { toast('Set the worker URL in Settings → Verifier first', 'error'); return null; }
        try {
          const { data: s } = await sbc.auth.getSession();
          const res = await fetch(cfg.worker_url + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session.access_token}` }, body: JSON.stringify(body || {}) });
          const out = await res.json(); if (!res.ok || out.error) throw new Error(out.error || `Worker error ${res.status}`);
          return out;
        } catch (e) { toast(String(e.message || e), 'error'); return null; }
      }, [cfg.worker_url, toast]);

      if (!connected) return <ConnectScreen onDone={() => setConnected(true)} />;
      if (session === undefined) return <div id="boot">Loading HV Ops…</div>;
      if (!session) return <Login notice={notice} onReconfigure={() => { try { localStorage.removeItem('hvops_sb_url'); localStorage.removeItem('hvops_sb_key'); } catch (e) {} sbc = null; setConnected(false); }} />;
      if (loadError) return <Shell><p className="text-sm text-rose-700">{loadError}</p><Btn className="mt-3 w-full" kind="ghost" onClick={() => sbc.auth.signOut()}>Sign out</Btn></Shell>;
      if (loading || !me) return <div id="boot">Loading your workspace…</div>;

      const nav = NAV.filter((n) => n[3](me));
      const unread = data.alerts.filter((a) => !a.is_read); const critical = unread.filter((a) => a.level === 'critical');
      const page = nav.some((n) => n[0] === route.page) || route.page === 'listing' || route.page === 'project' ? route.page : 'dashboard';
      const ctx = { me, data, setData, cfg, now, toast, go, save, saveSetting, reloadTable, reloadWhere, workerCall, nameOf };
      const navBtn = (n, mobile) => {
        const active = page === n[0] || (n[0] === 'listings' && page === 'listing') || (n[0] === 'projects' && page === 'project'); const count = n[0] === 'alerts' ? unread.length : n[0] === 'photo' ? data.photo_requests.filter((r) => isMgr(me) ? ['requested', 'shot'].includes(r.status) : (r.assigned_to === me.id && ['requested', 'scheduled'].includes(r.status))).length : 0;
        return mobile ? (
          <button key={n[0]} onClick={() => go(n[0])} className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? 'text-brand-700' : 'text-slate-500'}`}><Icon name={n[2]} />{n[1]}{count > 0 && <span className="absolute right-1/4 top-1 rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{count}</span>}</button>
        ) : (
          <button key={n[0]} onClick={() => go(n[0])} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10'}`}><Icon name={n[2]} /><span className="flex-1 text-left">{n[1]}</span>{count > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white">{count}</span>}</button>
        );
      };

      return (
        <AppCtx.Provider value={ctx}>
          <div className="min-h-screen md:flex">
            {/* desktop sidebar */}
            <aside className="no-print fixed inset-y-0 hidden w-56 flex-col bg-brand-800 p-3 md:flex">
              <div className="mb-4 flex items-center gap-2 px-2 pt-1"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-1"><img src={LOGO_MARK} alt="Home Vacation" className="h-full w-full object-contain" /></div><div><div className="text-sm font-bold text-white">HV Ops</div><div className="text-[11px] text-brand-200">{APP_VERSION}</div></div></div>
              <nav className="flex-1 space-y-1">{nav.map((n) => navBtn(n, false))}</nav>
              <div className={`mb-3 border-t border-white/10 pt-3 ${systems && HV_APPS.some((a) => systems[a[2]]) ? '' : 'hidden'}`}><div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-brand-200">Systems</div>{HV_APPS.filter((a) => systems && systems[a[2]]).map(([label, url]) => <a key={url} href={url} target="_blank" rel="noreferrer" className="block rounded-lg px-2 py-1 text-xs text-brand-100 hover:bg-white/10">↗ {label}</a>)}</div>
              <div className="border-t border-white/10 pt-3"><div className="truncate px-2 text-sm font-medium text-white">{me.full_name || me.email}</div><div className="px-2 text-xs text-brand-200">{ROLE_LABEL[me.role]}</div>
                <button onClick={() => sbc.auth.signOut()} className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-brand-100 hover:bg-white/10"><Icon name="logout" className="h-4 w-4" />Sign out</button></div>
            </aside>

            <main className="w-full px-3 pb-24 pt-3 md:ml-56 md:px-6 md:pb-8 md:pt-5">
              <div className="mx-auto max-w-6xl">
                <div className="no-print mb-3 flex items-center gap-2 md:hidden"><img src={LOGO_MARK} alt="Home Vacation" className="h-8 w-8 object-contain" /><span className="text-sm font-bold text-brand-800">HV Ops</span><span className="ml-auto text-[11px] text-slate-400">{APP_VERSION}</span></div>
                {critical.length > 0 && page !== 'alerts' && (
                  <button onClick={() => go('alerts')} className="no-print mb-3 flex w-full items-center justify-between gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-left text-sm font-semibold text-white shadow">
                    <span className="truncate">{critical.length} critical alert{critical.length === 1 ? '' : 's'} — {critical[0].title}</span><span className="whitespace-nowrap underline">View</span>
                  </button>
                )}
                {page === 'dashboard' && <Dashboard />}
                {page === 'listings' && <ListingsPage />}
                {page === 'listing' && <ListingDetail key={route.id} id={route.id} />}
                {page === 'projects' && <ProjectsPage />}
                {page === 'photo' && <PhotoRequestsPage />}
                {page === 'project' && <ProjectDetail key={route.id} id={route.id} />}
                {page === 'tasks' && <TasksPage />}
                {page === 'agencies' && <AgenciesPage />}
                {page === 'kpis' && <KpisPage />}
                {page === 'reports' && <ReportsPage />}
                {page === 'alerts' && <AlertsPage />}
                {page === 'settings' && <SettingsPage />}
              </div>
            </main>

            {/* phone bottom tabs */}
            <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white md:hidden">
              {nav.slice(0, 4).map((n) => navBtn(n, true))}
              <button onClick={() => setMore(true)} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${nav.slice(4).some((n) => n[0] === page) ? 'text-brand-700' : 'text-slate-500'}`}><Icon name="more" />More</button>
            </nav>
            {more && (
              <div className="no-print fixed inset-0 z-40 flex items-end bg-slate-900/50 md:hidden" onClick={() => setMore(false)}>
                <div className="safe-bottom w-full rounded-t-2xl bg-white p-3" onClick={(e) => e.stopPropagation()}>
                  <div className="mb-2 px-2"><div className="font-semibold text-slate-900">{me.full_name || me.email}</div><div className="text-xs text-slate-500">{ROLE_LABEL[me.role]} · HV Ops {APP_VERSION}</div></div>
                  {nav.slice(4).map((n) => <button key={n[0]} onClick={() => go(n[0])} className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50"><Icon name={n[2]} />{n[1]}</button>)}
                  <div className="my-1 border-t border-slate-100 pt-1">{HV_APPS.filter((a) => systems && systems[a[2]]).map(([label, url]) => <a key={url} href={url} target="_blank" rel="noreferrer" className="block rounded-lg px-2 py-2.5 text-sm text-slate-600 hover:bg-slate-50">↗ {label}</a>)}</div>
                  <button onClick={() => sbc.auth.signOut()} className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-sm font-medium text-rose-700 hover:bg-rose-50"><Icon name="logout" />Sign out</button>
                </div>
              </div>
            )}
          </div>
          <div className="no-print pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3">
            {toasts.map((t) => <div key={t.id} className={`pointer-events-auto max-w-md rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg ${t.kind === 'error' ? 'bg-rose-600' : 'bg-slate-900'}`}>{t.text}</div>)}
          </div>
        </AppCtx.Provider>
      );
    };

    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body>
</html>
