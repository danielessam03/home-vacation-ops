
    // =========================================================================================
    // AGENCIES — no agency logins; our staff log their deliverables and numbers
    // =========================================================================================
    const DeliverableForm = ({ agency, month, item, onClose }) => {
      const { me, cfg, save, toast } = useApp();
      const mgr = isMgr(me);
      const [f, setF] = useState(item || { item_type: null, planned_qty: 1, delivered_qty: 0, due_date: '', status: 'planned', revisions_count: 0, proof_url: '', notes: '' });
      const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
      const statuses = Object.keys(DELIV_STATUS).filter((s) => mgr || s !== 'approved' || f.status === 'approved');
      const submit = async () => {
        if (!f.item_type) { toast('Choose an item type', 'error'); return; }
        const payload = { item_type: f.item_type, planned_qty: Number(f.planned_qty) || 0, delivered_qty: Number(f.delivered_qty) || 0, due_date: f.due_date || null, status: f.status,
          revisions_count: Number(f.revisions_count) || 0, proof_url: f.proof_url || null, notes: f.notes || null };
        if (!item) Object.assign(payload, { agency_id: agency.id, period_month: month, logged_by: me.id });
        if (await save('agency_deliverables', payload, item ? item.id : null)) onClose();
      };
      return (
        <Modal title={`${item ? 'Update' : 'Add'} deliverable — ${agency.display_name}`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={submit}>Save</Btn></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Item type" bad={!f.item_type}><Select bad={!f.item_type} value={f.item_type} onChange={(v) => set('item_type', v)} options={(cfg.deliverable_item_types || []).map((t) => [t, titleCase(t)])} /></Field>
            <Field label="Due date"><input type="date" className={inputCls()} value={f.due_date || ''} onChange={(e) => set('due_date', e.target.value)} /></Field>
            <Field label="Planned qty"><input type="number" min="0" className={inputCls()} value={f.planned_qty} onChange={(e) => set('planned_qty', e.target.value)} /></Field>
            <Field label="Delivered qty"><input type="number" min="0" className={inputCls()} value={f.delivered_qty} onChange={(e) => set('delivered_qty', e.target.value)} /></Field>
            <Field label="Status"><Select value={f.status} onChange={(v) => set('status', v || 'planned')} options={statuses.map((s) => [s, titleCase(s)])} /></Field>
            <Field label="Revisions"><input type="number" min="0" className={inputCls()} value={f.revisions_count} onChange={(e) => set('revisions_count', e.target.value)} /></Field>
            <Field label="Proof link" className="col-span-2"><input className={inputCls()} value={f.proof_url || ''} onChange={(e) => set('proof_url', e.target.value)} placeholder="https://…" /></Field>
            <Field label="Notes" className="col-span-2"><textarea rows={2} className={inputCls()} value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
          </div>
        </Modal>
      );
    };

    const MetricsPanel = ({ agency, month, canWrite }) => {
      const { me, data, cfg, setData, toast } = useApp();
      const defs = (cfg.metric_defs || {})[agency.name] || [];
      const existing = data.agency_metrics.filter((m) => m.agency_id === agency.id && m.period_month === month);
      const [vals, setVals] = useState({}); const [busy, setBusy] = useState(false);
      useEffect(() => setVals(Object.fromEntries(existing.map((m) => [m.metric_key, m.metric_value == null ? '' : String(m.metric_value)]))), [agency.id, month, existing.length]);
      const saveAll = async () => {
        setBusy(true);
        const rows = defs.filter((d) => vals[d.key] !== undefined && vals[d.key] !== '').map((d) => ({ agency_id: agency.id, period_month: month, metric_key: d.key, metric_value: Number(vals[d.key]), unit: d.unit, entered_by: me.id, source: 'manual' }));
        const { data: saved, error } = await sbc.from(tbl('agency_metrics')).upsert(rows, { onConflict: 'agency_id,period_month,metric_key' }).select();
        setBusy(false);
        if (error) { toast(friendlyError(error), 'error'); return; }
        setData((d) => ({ ...d, agency_metrics: [...d.agency_metrics.filter((m) => !saved.some((s) => s.id === m.id)), ...saved] }));
        toast('Metrics saved');
      };
      return (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-brand-800">Performance numbers — {monthLabel(month)}</h3>{canWrite && <Btn className="no-print !py-1.5" onClick={saveAll} disabled={busy}>Save numbers</Btn>}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {defs.map((d) => <Field key={d.key} label={`${d.label}${d.unit === '%' ? ' (%)' : d.unit === 'currency' ? ` (${agency.currency || 'as billed'})` : ''}`}>
              <input type="number" step="any" disabled={!canWrite} className={inputCls()} value={vals[d.key] == null ? '' : vals[d.key]} onChange={(e) => setVals((p) => ({ ...p, [d.key]: e.target.value }))} /></Field>)}
          </div>
          <p className="mt-2 text-xs text-slate-500">Entered by hand for now. Amounts stay in the currency they were billed in — nothing is converted.</p>
        </Card>
      );
    };

    const AgenciesPage = () => {
      const { me, data, save } = useApp();
      const agencies = data.agencies.filter((a) => a.is_active);
      const [aid, setAid] = useState(agencies[0] && agencies[0].id); const [month, setMonth] = useState(monthStart()); const [form, setForm] = useState(null);
      const agency = agencies.find((a) => a.id === aid) || agencies[0];
      if (!agency) return <Empty>No agencies yet. Run sql/002_seed_settings.sql.</Empty>;
      const canWrite = ['admin', 'manager', 'marketing'].includes(me.role); const mgr = isMgr(me);
      const items = data.agency_deliverables.filter((d) => d.agency_id === agency.id && d.period_month === month).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
      const trend = [0, -1, -2, -3].map((n) => agencyScorecard(agency, addMonths(month, n), data));
      const sc = trend[0]; const delta = (k) => sc[k] != null && trend[1][k] != null ? r1(sc[k] - trend[1][k]) : null;
      const copyLast = async () => {
        const prev = data.agency_deliverables.filter((d) => d.agency_id === agency.id && d.period_month === addMonths(month, -1));
        for (const p of prev) {
          const due = p.due_date ? ymd(new Date(new Date(p.due_date).getFullYear(), new Date(p.due_date).getMonth() + 1, new Date(p.due_date).getDate())) : null;
          await save('agency_deliverables', { agency_id: agency.id, period_month: month, item_type: p.item_type, planned_qty: p.planned_qty, due_date: due, logged_by: me.id });
        }
      };
      return (
        <div>
          <PageHeader title="Agencies" sub="Contract scorecards — the renewal document"><MonthPicker value={month} onChange={setMonth} /><Btn kind="ghost" onClick={() => window.print()}><Icon name="print" className="h-4 w-4" />Print</Btn></PageHeader>
          <Tabs value={agency.id} onChange={setAid} tabs={agencies.map((a) => [a.id, a.display_name])} />
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h2 className="text-lg font-bold text-slate-900">{agency.display_name}</h2><p className="text-sm text-slate-600">{agency.scope_notes || '—'}</p></div>
                <div className="text-right text-sm"><div className="num text-lg font-semibold">{agency.monthly_fee != null ? `${money(agency.monthly_fee, agency.currency)} / month` : 'Fee not set'}</div><div className="text-slate-500">{agency.contract_start ? `${fmtDate(agency.contract_start)} → ${fmtDate(agency.contract_end)}` : 'Contract period not set'}</div></div>
              </div>
              <div className="mt-2 text-sm text-slate-600">Contact: {agency.contact_person || '—'}{agency.contact_email ? ` · ${agency.contact_email}` : ''}{agency.contact_phone ? ` · ${agency.contact_phone}` : ''}</div>
              {me.role === 'admin' && <p className="no-print mt-1 text-xs text-slate-400">Edit the contract in Settings → Agencies.</p>}
            </Card>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label={`Delivery rate${delta('delivery_rate') != null ? ` (${delta('delivery_rate') >= 0 ? '+' : ''}${delta('delivery_rate')} vs prev)` : ''}`} value={sc.delivery_rate == null ? null : `${sc.delivery_rate}%`} />
              <Tile label="On-time delivery" value={sc.on_time_pct == null ? null : `${sc.on_time_pct}%`} />
              <Tile label="Revision rate" value={sc.revision_rate == null ? null : `${sc.revision_rate}%`} />
              <Tile label={`Cost per lead (${sc.cpl_basis})`} value={sc.cpl == null ? null : money(sc.cpl, sc.currency)} />
            </div>

            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-brand-800">Deliverables — {monthLabel(month)} · {sc.delivered}/{sc.planned} delivered</h3>
                {canWrite && <div className="no-print flex gap-2">{!items.length && <Btn kind="ghost" className="!py-1.5" onClick={copyLast}>Copy plan from last month</Btn>}<Btn className="!py-1.5" onClick={() => setForm({})}><Icon name="plus" className="h-4 w-4" />Add</Btn></div>}
              </div>
              {!items.length ? <Empty>No deliverables planned for this month yet.</Empty> : (
                <div className="scroll-x"><table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500"><tr>{['Item', 'Planned', 'Delivered', 'Due', 'Status', 'Revisions', 'Proof', ''].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{items.map((d) => (
                    <tr key={d.id} className="border-t border-slate-100">
                      <td className="px-2 py-2 font-medium">{titleCase(d.item_type)}{d.notes && <div className="text-xs font-normal text-slate-500">{d.notes}</div>}</td>
                      <td className="num px-2 py-2">{d.planned_qty}</td>
                      <td className="num px-2 py-2"><span className={d.delivered_qty < d.planned_qty ? 'text-rose-700' : 'text-emerald-700'}>{d.delivered_qty}</span></td>
                      <td className="whitespace-nowrap px-2 py-2">{fmtDate(d.due_date)}</td>
                      <td className="px-2 py-2"><Badge className={DELIV_STATUS[d.status]}>{titleCase(d.status)}</Badge></td>
                      <td className="num px-2 py-2">{d.revisions_count}</td>
                      <td className="px-2 py-2">{d.proof_url ? <a className="text-brand-700 underline" href={d.proof_url} target="_blank" rel="noreferrer">Open</a> : '—'}</td>
                      <td className="no-print whitespace-nowrap px-2 py-2 text-right">
                        {mgr && d.status === 'submitted' && <><Btn kind="ok" className="mr-1 !px-2 !py-1" onClick={() => save('agency_deliverables', { status: 'approved' }, d.id)}>Approve</Btn><Btn kind="danger" className="mr-1 !px-2 !py-1" onClick={() => save('agency_deliverables', { status: 'revision_requested', revisions_count: d.revisions_count + 1 }, d.id)}>Revise</Btn></>}
                        {canWrite && <Btn kind="ghost" className="!px-2 !py-1" onClick={() => setForm(d)}>Update</Btn>}
                      </td>
                    </tr>))}</tbody>
                </table></div>
              )}
            </Card>

            <MetricsPanel agency={agency} month={month} canWrite={canWrite} />

            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-brand-800">Monthly scorecard — trend</h3>
              <div className="scroll-x"><table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500"><tr>{['Month', 'Planned', 'Delivered', 'Delivery rate', 'On time', 'Revision rate', 'Leads', 'Cost / lead'].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}</tr></thead>
                <tbody>{trend.map((t, i) => (
                  <tr key={t.month} className={`border-t border-slate-100 ${i === 0 ? 'font-semibold' : ''}`}>
                    <td className="px-2 py-2">{monthLabel(t.month)}</td><td className="num px-2 py-2">{t.planned}</td><td className="num px-2 py-2">{t.delivered}</td>
                    <td className="num px-2 py-2">{show(t.delivery_rate, '%')}</td><td className="num px-2 py-2">{show(t.on_time_pct, '%')}</td><td className="num px-2 py-2">{show(t.revision_rate, '%')}</td>
                    <td className="num px-2 py-2">{show(t.leads)}</td><td className="num px-2 py-2">{t.cpl == null ? '—' : money(t.cpl, t.currency)}</td>
                  </tr>))}</tbody>
              </table></div>
            </Card>
          </div>
          {form && <DeliverableForm agency={agency} month={month} item={form.id ? form : null} onClose={() => setForm(null)} />}
        </div>
      );
    };

    // =========================================================================================
    // KPIs — per-person cards, leaderboard, monthly targets
    // =========================================================================================
    // a data-entry person only sees the stage(s) they actually work in: entry (Sally) and/or upload (Lucy)
    const kpiDefsForUser = (cfg, role, k) => {
      const active = { entry: k.listings_entered > 0 || k.projects_entered > 0, upload: k.listings_uploaded > 0 || k.waiting_upload > 0 || k.projects_uploaded > 0 };
      const any = active.entry || active.upload;
      return kpiDefsFor(cfg, role).filter((d) => !d.part || !any || active[d.part]);
    };
    const kpiDefsFor = (cfg, role) => (cfg.user_kpi_defs || []).filter((d) => role === 'manager' || role === 'admin' ? true : d.team === role);
    const targetOf = (data, userId, month, key) => { const t = data.kpi_targets.find((x) => x.subject_type === 'user' && x.subject_id === userId && x.period_month === month && x.metric_key === key); return t ? Number(t.target_value) : null; };
    const unitOf = (d) => d.unit === '%' ? '%' : d.unit === 'h' ? 'h' : '';

    const TargetsModal = ({ user, month, onClose }) => {
      const { me, data, cfg, setData, toast } = useApp();
      const defs = kpiDefsFor(cfg, user.role);
      const [vals, setVals] = useState(() => Object.fromEntries(defs.map((d) => { const t = targetOf(data, user.id, month, d.key); return [d.key, t == null ? '' : String(t)]; })));
      const submit = async () => {
        const rows = defs.filter((d) => vals[d.key] !== '').map((d) => ({ subject_type: 'user', subject_id: user.id, period_month: month, metric_key: d.key, target_value: Number(vals[d.key]), created_by: me.id }));
        if (!rows.length) { onClose(); return; }
        const { data: saved, error } = await sbc.from(tbl('kpi_targets')).upsert(rows, { onConflict: 'subject_type,subject_id,period_month,metric_key' }).select();
        if (error) { toast(friendlyError(error), 'error'); return; }
        setData((d) => ({ ...d, kpi_targets: [...d.kpi_targets.filter((t) => !saved.some((s) => s.id === t.id)), ...saved] }));
        toast('Targets saved'); onClose();
      };
      return (
        <Modal title={`Targets — ${user.full_name || user.email} — ${monthLabel(month)}`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={submit}>Save targets</Btn></>}>
          <div className="grid grid-cols-2 gap-3">{defs.map((d) => <Field key={d.key} label={`${d.label} ${d.better === 'low' ? '(max)' : '(min)'}`}><input type="number" step="any" className={inputCls()} value={vals[d.key]} onChange={(e) => setVals((p) => ({ ...p, [d.key]: e.target.value }))} /></Field>)}</div>
        </Modal>
      );
    };

    const KpisPage = () => {
      const { me, data, cfg, now } = useApp();
      const mgr = isMgr(me);
      const [month, setMonth] = useState(monthStart()); const [target, setTarget] = useState(null);
      const range = monthRange(month);
      const people = data.profiles.filter((p) => p.is_active && ['data_entry', 'marketing'].includes(p.role) && (mgr || p.id === me.id));
      const rows = useMemo(() => people.map((p) => ({ p, k: userKpis(p, range, data, cfg.sla_hours, now) })), [month, data, now]);
      const board = (title, keep, sortKey, cols) => {
        const rs = rows.filter(keep).sort((a, b) => (b.k[sortKey] || 0) - (a.k[sortKey] || 0));
        if (!rs.length) return null;
        return (
          <Card className="scroll-x p-4">
            <h3 className="mb-3 text-sm font-semibold text-brand-800">{title}</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500"><tr><th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">Name</th>{cols.map((c) => <th key={c.key} className="px-2 py-1.5 text-right font-medium">{c.label}</th>)}</tr></thead>
              <tbody>{rs.map((r, i) => (
                <tr key={r.p.id} className="border-t border-slate-100"><td className="px-2 py-2 text-slate-400">{i + 1}</td><td className="whitespace-nowrap px-2 py-2 font-medium">{r.k.name}</td>
                  {cols.map((c) => { const t = targetOf(data, r.p.id, month, c.key), v = r.k[c.key]; const ok = t == null || v == null ? null : c.better === 'low' ? v <= t : v >= t;
                    return <td key={c.key} className={`num px-2 py-2 text-right ${ok == null ? '' : ok ? 'text-emerald-700' : 'text-rose-700'}`}>{show(v, unitOf(c))}{t != null && <span className="text-xs text-slate-400"> / {show(t)}</span>}</td>; })}
                </tr>))}</tbody>
            </table>
          </Card>
        );
      };
      const defs = cfg.user_kpi_defs || [];
      return (
        <div>
          <PageHeader title="KPIs" sub="Value / target. Green = target met."><MonthPicker value={month} onChange={setMonth} /></PageHeader>
          <div className="space-y-4">
            {mgr && <p className="text-xs text-slate-500">CEOs / admins enter listings too but are not scored. The same numbers feed the HR KPI module automatically.</p>}
            {mgr && board('Stage 1 — data & photos entered', (r) => r.k.listings_entered > 0 || r.k.projects_entered > 0, 'listings_entered', defs.filter((d) => d.part === 'entry'))}
            {mgr && board('Stage 2 — uploaded online', (r) => r.k.listings_uploaded > 0 || r.k.waiting_upload > 0 || r.k.projects_uploaded > 0, 'listings_uploaded', defs.filter((d) => d.part === 'upload'))}
            {mgr && board('Marketing', (r) => r.p.role === 'marketing', 'tasks_completed', defs.filter((d) => d.team === 'marketing'))}
            {rows.map(({ p, k }) => (
              <Card key={p.id} className="p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div><h3 className="font-semibold text-slate-900">{k.name}</h3><p className="text-xs text-slate-500">{ROLE_LABEL[p.role]} · {monthLabel(month)}</p></div>
                  {mgr && <Btn kind="ghost" className="no-print !py-1.5" onClick={() => setTarget(p)}>Set targets</Btn>}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {kpiDefsForUser(cfg, p.role, k).map((d) => <Tile key={d.key} label={`${d.label}${unitOf(d) ? ` (${unitOf(d)})` : ''}`} value={k[d.key]} target={targetOf(data, p.id, month, d.key)} better={d.better} />)}
                </div>
              </Card>
            ))}
            {!rows.length && <Empty>No data entry or marketing users yet.</Empty>}
          </div>
          {target && <TargetsModal user={target} month={month} onClose={() => setTarget(null)} />}
        </div>
      );
    };
