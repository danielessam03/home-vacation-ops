
    // =========================================================================================
    // PROJECTS — developer compounds / resorts. Same pipeline as units: entry -> ready -> upload -> verified live.
    // Code: P-LOC-SERIAL-S (own serial, separate from units). Staff paste it into the WordPress "Project ID" field.
    // =========================================================================================
    const PROJECT_LABEL = {
      name: 'Project name', developer: 'Developer', location: 'Location', project_types: 'Unit types in the project', unit_sizes: 'Unit sizes (m²)',
      bedrooms: 'Bedrooms', starting_price: 'Starting price', currency: 'Currency', down_payment: 'Down payment', installments: 'Installments',
      delivery_date: 'Delivery date', finishing: 'Finishing', facilities: 'Facilities', selling_points: 'Selling points / description', is_exclusive: 'Exclusive',
      media_uploaded: 'Photos & brochure ready (approved by manager)', media_has_logo: 'Photos have the logo', media_edited: 'Photos edited',
      source_name: 'Developer contact person', source_contact: 'Contact phone / email', date_received: 'Date received (SLA start)', assigned_to: 'Uploader (puts it online)',
    };
    const PROJECT_GROUPS = [
      ['Project', ['name', 'developer', 'location', 'project_types', 'date_received']],
      ['Units & delivery', ['unit_sizes', 'bedrooms', 'delivery_date', 'finishing']],
      ['Price & payment plan', ['starting_price', 'currency', 'down_payment', 'installments', 'is_exclusive']],
      ['Marketing', ['facilities', 'selling_points']],
      ['Media', ['media_uploaded', 'media_has_logo', 'media_edited']],
      ['Developer contact', ['source_name', 'source_contact', 'assigned_to']],
    ];
    const PROJECT_BOOLS = ['is_exclusive', 'media_uploaded', 'media_has_logo', 'media_edited'];
    const PROJECT_WIDE = ['name', 'project_types', 'facilities', 'selling_points', 'unit_sizes', 'date_received'];

    function projectCompleteness(row, required) {
      const req = (required || []).filter((f) => f in PROJECT_LABEL);
      const missing = req.filter((f) => {
        const v = row[f];
        if (v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) return true;
        if (f === 'starting_price' && !(Number(v) > 0)) return true;
        if (f === 'media_uploaded' && v !== true) return true;
        return false;
      });
      return { pct: req.length ? Math.floor((100 * (req.length - missing.length)) / req.length) : 100, missing };
    }

    const ProjectForm = ({ project, onClose, onSaved }) => {
      const { me, cfg, data, save, toast } = useApp();
      const isEdit = !!project;
      const [f, setF] = useState(() => ({ project_types: [], facilities: [], date_received: new Date().toISOString(), ...(project || {}), starting_price: project && project.starting_price != null ? String(project.starting_price) : '' }));
      const [busy, setBusy] = useState(false);
      const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
      const normalized = { ...f, starting_price: f.starting_price === '' ? null : Number(f.starting_price) };
      const comp = projectCompleteness(normalized, cfg.project_required_fields);
      const hard = ['name', 'location', 'date_received'].filter((k) => !normalized[k] || (typeof normalized[k] === 'string' && !normalized[k].trim()));
      const bad = (k) => comp.missing.includes(k) || hard.includes(k);
      const dup = !isEdit && f.name && data.projects.find((p) => p.name.trim().toLowerCase() === f.name.trim().toLowerCase());

      const control = (k) => {
        if (k === 'location') return <Select bad={bad(k)} value={f[k]} onChange={(v) => set(k, v)} options={Object.keys(cfg.location_codes || {}).sort()} disabled={isEdit} />;
        if (k === 'currency') return <Select bad={bad(k)} value={f[k]} onChange={(v) => set(k, v)} options={cfg.currencies || ['EUR', 'USD', 'EGP']} />;
        if (k === 'finishing') return <Select bad={bad(k)} value={f[k]} onChange={(v) => set(k, v)} options={cfg.finishing_types || []} />;
        if (k === 'assigned_to') return <Select value={f[k]} onChange={(v) => set(k, v)} options={data.profiles.filter((p) => p.is_active).map((p) => [p.id, p.full_name || p.email])} placeholder="Default uploader" />;
        if (k === 'date_received') return <input type="datetime-local" className={inputCls(bad(k))} value={toLocalInput(f[k])} disabled={isEdit && me.role !== 'admin'} onChange={(e) => set(k, fromLocalInput(e.target.value))} />;
        if (k === 'project_types') return <FacilitiesInput bad={bad(k)} value={f.project_types || []} onChange={(v) => set(k, v)} options={cfg.project_types} />;
        if (k === 'facilities') return <FacilitiesInput bad={bad(k)} value={f.facilities || []} onChange={(v) => set(k, v)} options={cfg.facilities} />;
        if (k === 'selling_points') return <textarea rows={4} className={inputCls(bad(k))} value={f[k] || ''} onChange={(e) => set(k, e.target.value)} />;
        if (k === 'media_uploaded' && !isMgr(me)) return <div className={`rounded-lg border px-3 py-2 text-sm ${f[k] === true ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>{f[k] === true ? 'Yes — approved by the manager' : 'Waiting for the manager to review the media'}</div>;
        if (PROJECT_BOOLS.includes(k)) return <TriState bad={bad(k)} value={f[k]} onChange={(v) => set(k, v)} />;
        if (k === 'starting_price') return <input type="number" inputMode="decimal" min="0" className={inputCls(bad(k))} value={f[k]} onChange={(e) => set(k, e.target.value)} />;
        const ph = { unit_sizes: '57 – 180 m² (Studios, 1BR, 2BR)', bedrooms: 'Studio, 1–3 BR', down_payment: '10%', installments: '7 years, quarterly', delivery_date: 'December 2027 / 3 years from contract / Available' }[k];
        return <input className={inputCls(bad(k))} placeholder={ph || ''} value={f[k] || ''} onChange={(e) => set(k, e.target.value)} />;
      };

      const submit = async () => {
        if (hard.length) { toast(`Needed to save: ${hard.map((k) => PROJECT_LABEL[k]).join(', ')}`, 'error'); return; }
        setBusy(true);
        const payload = {};
        PROJECT_GROUPS.flatMap((g) => g[1]).forEach((k) => { payload[k] = normalized[k] === '' ? null : normalized[k]; });
        if (!isMgr(me)) delete payload.media_uploaded;
        if (isEdit) { delete payload.location; if (me.role !== 'admin') delete payload.date_received; }
        else { payload.entered_by = me.id; payload.assigned_to = payload.assigned_to || cfg.default_uploader || me.id; }
        const row = await save('projects', payload, isEdit ? project.id : null);
        setBusy(false);
        if (!row) return;
        toast(isEdit ? 'Project saved' : `Created ${row.reference_code}`);
        onSaved(row);
      };

      return (
        <Modal wide title={isEdit ? `Edit ${project.reference_code}` : 'New project'} onClose={onClose} footer={<>
          <span className="mr-auto self-center text-xs text-slate-500">{comp.missing.length ? 'You can save a draft now — it stays red until complete.' : 'All required fields filled.'}</span>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={submit} disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save' : 'Save & generate Project ID'}</Btn></>}>
          <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-3 border-b border-slate-200 bg-white px-4 py-3">
            <div className="mb-1.5 flex items-center justify-between text-sm"><span className="font-semibold text-slate-800">Completeness {comp.pct}%</span>{comp.missing.length > 0 && <Badge className="bg-rose-600 text-white">{comp.missing.length} missing</Badge>}</div>
            <Meter value={comp.pct} />
          </div>
          {dup && <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">Possible duplicate: {dup.reference_code} has the same name.</div>}
          {isEdit && <p className="mb-3 text-xs text-slate-500">The location is part of the Project ID and cannot change after creation.</p>}
          {PROJECT_GROUPS.map(([g, keys]) => (
            <fieldset key={g} className="mb-5">
              <legend className="mb-2 text-sm font-semibold text-brand-800">{g}</legend>
              {g === 'Media' && <p className="mb-2 text-xs text-slate-500">Photos, renders and brochures stay on the company intranet. The manager reviews them there and marks them ready.</p>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {keys.map((k) => <Field key={k} label={PROJECT_LABEL[k]} bad={bad(k)} className={['project_types', 'facilities', 'selling_points'].includes(k) ? 'col-span-2 sm:col-span-3' : PROJECT_WIDE.includes(k) ? 'col-span-2' : ''}>{control(k)}</Field>)}
              </div>
            </fieldset>
          ))}
        </Modal>
      );
    };

    const ProjectsPage = () => {
      const { data, cfg, now, go, nameOf } = useApp();
      const [q, setQ] = useState(''); const [status, setStatus] = useState(null); const [form, setForm] = useState(false);
      const rows = useMemo(() => {
        const s = q.trim().toLowerCase();
        return data.projects.map((p) => ({ p, s: slaOf(p, cfg.project_sla_hours, now) })).filter(({ p }) => {
          if (!status && p.status === 'archived') return false;
          if (status && p.status !== status) return false;
          return !s || `${p.reference_code} ${p.name} ${p.developer || ''} ${p.location}`.toLowerCase().includes(s);
        }).sort((a, b) => new Date(b.p.date_received) - new Date(a.p.date_received));
      }, [data.projects, q, status, cfg.project_sla_hours, now]);
      const exportCsv = () => downloadCSV(`hv-projects-${ymd(new Date())}.csv`,
        ['project_id', 'name', 'developer', 'location', 'status', 'starting_price', 'currency', 'delivery_date', 'completeness_pct', 'date_received', 'date_published_verified', 'entered_by', 'uploaded_by', 'website_url'],
        rows.map(({ p }) => [p.reference_code, p.name, p.developer, p.location, p.status, p.starting_price, p.currency, p.delivery_date, p.completeness_pct, p.date_received, p.date_published_verified, nameOf(p.entered_by), nameOf(p.published_claimed_by), p.website_url]));
      return (
        <div>
          <PageHeader title="Projects" sub={`${rows.length} shown · Project ID = P-location-serial-S`}>
            <Btn kind="ghost" onClick={exportCsv}>Export CSV</Btn>
            <Btn onClick={() => setForm(true)}><Icon name="plus" className="h-4 w-4" />New project</Btn>
          </PageHeader>
          <div className="no-print mb-3 flex gap-2">
            <input className={inputCls()} placeholder="Search Project ID, name, developer or location…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="w-48 shrink-0"><Select value={status} onChange={setStatus} placeholder="All statuses" options={Object.entries(LISTING_STATUS).map(([k, v]) => [k, v[0]])} /></div>
          </div>
          {!rows.length ? <Empty>No projects yet. Add the first one with “New project”.</Empty> : (
            <div className="grid gap-2 lg:grid-cols-2">
              {rows.map(({ p, s }) => (
                <Card key={p.id} className={`cursor-pointer border-l-4 p-3 hover:border-brand-500 ${SLA_STYLE[s.verified ? 'none' : s.state].bar}`} onClick={() => go('project', p.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="font-mono text-sm font-bold text-slate-900">{p.reference_code}</div><div className="truncate text-sm font-medium text-slate-800">{p.name}</div><div className="truncate text-xs text-slate-500">{p.developer || 'Developer —'} · {p.location}</div></div>
                    <SlaChip listing={p} slaCfg={cfg.project_sla_hours} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={p.status} />
                    {p.completeness_pct < 100 && <Badge className="bg-rose-600 text-white">{p.completeness_pct}% · {(p.missing_fields || []).length} missing</Badge>}
                    {s.claimedNotFound && <Badge className="bg-rose-600 text-white">Claimed, not found</Badge>}
                    <span className="ml-auto text-xs text-slate-500">{p.starting_price ? `from ${money(p.starting_price, p.currency)}` : ''}</span>
                  </div>
                  <div className="mt-1.5 text-xs text-slate-600">Entered by <b className="text-slate-900">{nameOf(p.entered_by)}</b> · {fmtDate(p.date_received)}</div>
                </Card>
              ))}
            </div>
          )}
          {form && <ProjectForm onClose={() => setForm(false)} onSaved={(row) => { setForm(false); go('project', row.id); }} />}
        </div>
      );
    };

    const ProjectDetail = ({ id }) => {
      const { me, data, cfg, now, go, save, nameOf, toast } = useApp();
      const p = data.projects.find((x) => x.id === id);
      const [edit, setEdit] = useState(false); const [reason, setReason] = useState(null); const [audit, setAudit] = useState(null); const [copied, setCopied] = useState(false);
      const mgr = isMgr(me);
      useEffect(() => {
        if (!mgr || !p) return;
        sbc.from(tbl('audit_log')).select('*').eq('record_id', id).order('changed_at', { ascending: false }).limit(200).then(({ data: rows }) => setAudit(rows || []));
      }, [id, p && p.updated_at]);
      if (!p) return <Empty>Project not found.</Empty>;
      const s = slaOf(p, cfg.project_sla_hours, now);
      const canEdit = mgr || p.entered_by === me.id || p.assigned_to === me.id;
      const setStatus = (status, extra = {}) => save('projects', { status, ...extra }, p.id).then((row) => { if (row) toast(`Status: ${LISTING_STATUS[status][0]}`); return row; });
      const copy = async () => { try { await navigator.clipboard.writeText(p.reference_code); } catch (e) { const t = document.createElement('textarea'); t.value = p.reference_code; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); } setCopied(true); setTimeout(() => setCopied(false), 1500); };
      return (
        <div>
          <button className="no-print mb-3 inline-flex items-center gap-1 text-sm text-brand-700" onClick={() => go('projects')}><Icon name="back" className="h-4 w-4" />All projects</button>
          <Card className={`mb-4 border-l-4 p-4 ${SLA_STYLE[s.verified ? 'none' : s.state].bar}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><span className="font-mono text-2xl font-black tracking-wide text-slate-900">{p.reference_code}</span><Btn kind="soft" className="!px-2.5 !py-1.5" onClick={copy}><Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />{copied ? 'Copied' : 'Copy'}</Btn></div>
                <p className="mt-0.5 text-xs text-slate-500">Paste this exact code into the WordPress <b>Project ID</b> field. If it is left empty the website invents a PRJ-… number and the project can never be verified.</p>
                <h2 className="mt-2 text-base font-semibold text-slate-800">{p.name}</h2>
                <div className="text-sm text-slate-700">{p.developer || 'Developer —'} · {p.location}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500"><span>Entered by <b className="text-slate-800">{nameOf(p.entered_by)}</b> · {fmtDateTime(p.created_at)}</span>{p.published_claimed_by && <span>Uploaded to website by <b className="text-slate-800">{nameOf(p.published_claimed_by)}</b> · {fmtDateTime(p.date_published_claimed)}</span>}{p.media_approved_by && <span>Media approved by <b className="text-slate-800">{nameOf(p.media_approved_by)}</b></span>}</div>
              </div>
              <div className="flex flex-col items-end gap-1.5"><StatusBadge status={p.status} /><SlaChip listing={p} slaCfg={cfg.project_sla_hours} /></div>
            </div>
            {s.claimedNotFound && <div className="mt-3 rounded-lg bg-rose-600 p-2.5 text-sm font-medium text-white">Claimed published {fmtDateTime(p.date_published_claimed)} but the verifier cannot find this Project ID on the website.</div>}
            {p.status === 'on_hold' && <div className="mt-3 rounded-lg bg-amber-100 p-2.5 text-sm text-amber-900">On hold (SLA clock paused): {p.hold_reason}</div>}
            {p.status === 'rejected' && <div className="mt-3 rounded-lg bg-rose-100 p-2.5 text-sm text-rose-900">Rejected: {p.rejection_reason}</div>}
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs"><span className="font-medium text-slate-700">Completeness {p.completeness_pct}%</span>{p.completeness_pct < 100 && <span className="font-medium text-rose-700">{(p.missing_fields || []).length} missing</span>}</div>
              <Meter value={p.completeness_pct} />
              {p.completeness_pct < 100 && <div className="mt-2 flex flex-wrap gap-1">{(p.missing_fields || []).map((m) => <Badge key={m} className="bg-rose-100 text-rose-800">{PROJECT_LABEL[m] || m}</Badge>)}</div>}
            </div>
            {canEdit && (
              <div className="no-print mt-4 flex flex-wrap gap-2">
                {p.status !== 'archived' && <Btn kind="ghost" onClick={() => setEdit(true)}>Edit fields</Btn>}
                {p.status === 'draft' && <Btn disabled={p.completeness_pct < 100} onClick={() => setStatus('ready_to_publish')}>Ready to publish</Btn>}
                {p.status === 'ready_to_publish' && <Btn onClick={() => setStatus('published_claimed')}>I uploaded it — mark as published</Btn>}
                {p.status === 'ready_to_publish' && <Btn kind="ghost" onClick={() => setStatus('draft')}>Back to draft</Btn>}
                {['draft', 'ready_to_publish', 'published_claimed'].includes(p.status) && <Btn kind="ghost" onClick={() => setReason('hold')}>Put on hold</Btn>}
                {p.status === 'on_hold' && <Btn onClick={() => setStatus(p.status_before_hold || 'draft')}>Resume (restart clock)</Btn>}
                {mgr && !['rejected', 'archived', 'verified_live'].includes(p.status) && <Btn kind="danger" onClick={() => setReason('reject')}>Reject</Btn>}
                {mgr && p.status === 'rejected' && <Btn kind="ghost" onClick={() => setStatus('draft')}>Reopen as draft</Btn>}
                {mgr && p.status !== 'archived' && <Btn kind="ghost" onClick={() => { if (confirm('Archive this project? It is hidden, never deleted.')) setStatus('archived'); }}>Archive</Btn>}
              </div>
            )}
          </Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              {PROJECT_GROUPS.map(([g, keys]) => (
                <Card key={g} className="p-4">
                  <h3 className="mb-2 text-sm font-semibold text-brand-800">{g}</h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                    {keys.map((k) => {
                      const v = p[k]; const miss = (p.missing_fields || []).includes(k);
                      const text = k === 'assigned_to' ? nameOf(v) : k === 'date_received' ? fmtDateTime(v) : k === 'starting_price' ? money(v, p.currency) : PROJECT_BOOLS.includes(k) ? (v == null ? null : v ? 'Yes' : 'No') : Array.isArray(v) ? v.join(', ') : v;
                      return <div key={k} className={['project_types', 'facilities', 'selling_points'].includes(k) ? 'col-span-2 sm:col-span-3' : ''}><dt className="text-xs text-slate-500">{PROJECT_LABEL[k]}</dt><dd className={miss ? 'font-medium text-rose-700' : 'whitespace-pre-wrap break-words text-slate-900'}>{miss ? 'Missing' : text == null || text === '' ? '—' : String(text)}</dd></div>;
                    })}
                  </dl>
                </Card>
              ))}
            </div>
            <div className="space-y-4">
              <Card className="p-4">
                <h3 className="mb-3 text-sm font-semibold text-brand-800">SLA timeline</h3>
                <ol className="space-y-2 border-l-2 border-slate-200 pl-3 text-sm">
                  {[['Info received — clock starts', p.date_received], ['Entered complete — ready to publish', p.date_ready], ['Marked as published by staff', p.date_published_claimed], ['Verified live on website — clock stops', p.date_published_verified]].map(([label, at]) => <li key={label}><div className={at ? 'text-slate-900' : 'text-slate-400'}>{label}</div><div className="text-xs text-slate-500">{at ? fmtDateTime(at) : 'pending'}</div></li>)}
                </ol>
                <div className="mt-3 text-sm">{s.verified ? <>Hours to publish: <b className="num">{r1(s.hours)}</b> — {s.onTime ? <span className="text-emerald-700">within {s.breach}h</span> : <span className="text-rose-700">late</span>}</> : <>Elapsed: <b className="num">{fmtHours(s.hours)}</b> of {s.breach}h</>}</div>
                {p.website_url && <a className="mt-2 inline-flex items-center gap-1 text-sm text-brand-700 underline" href={p.website_url} target="_blank" rel="noreferrer"><Icon name="link" className="h-4 w-4" />View on website</a>}
              </Card>
              {mgr && (
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold text-brand-800">Audit trail</h3>
                  {!audit ? <p className="text-sm text-slate-500">Loading…</p> : !audit.length ? <p className="text-sm text-slate-500">No changes recorded.</p> : (
                    <ul className="max-h-80 space-y-2 overflow-y-auto text-xs">{audit.map((a) => (
                      <li key={a.id} className="border-b border-slate-100 pb-1.5"><div className="text-slate-500">{fmtDateTime(a.changed_at)} · {a.changed_by ? nameOf(a.changed_by) : 'System / verifier'}</div>
                        {a.action === 'insert' ? <div className="text-slate-800">Created</div> : <div className="break-words text-slate-800"><b>{PROJECT_LABEL[a.field_name] || a.field_name}</b>: <span className="text-rose-700 line-through">{a.old_value || '∅'}</span> → <span className="text-emerald-700">{a.new_value || '∅'}</span></div>}</li>))}</ul>
                  )}
                </Card>
              )}
            </div>
          </div>
          {edit && <ProjectForm project={p} onClose={() => setEdit(false)} onSaved={() => setEdit(false)} />}
          {reason === 'hold' && <ReasonModal title="Put on hold" label="Reason (mandatory) — the SLA clock pauses while on hold" confirmLabel="Put on hold" onClose={() => setReason(null)} onConfirm={async (r) => { if (await setStatus('on_hold', { hold_reason: r })) setReason(null); }} />}
          {reason === 'reject' && <ReasonModal kind="danger" title="Reject project" label="Reason (mandatory)" confirmLabel="Reject" onClose={() => setReason(null)} onConfirm={async (r) => { if (await setStatus('rejected', { rejection_reason: r })) setReason(null); }} />}
        </div>
      );
    };
