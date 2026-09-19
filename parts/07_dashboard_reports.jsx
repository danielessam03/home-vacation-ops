
    // =========================================================================================
    // DASHBOARD (role-aware)
    // =========================================================================================
    const ListingLine = ({ l, note }) => {
      const { go } = useApp();
      return (
        <button onClick={() => go('listing', l.id)} className="flex w-full items-center justify-between gap-2 border-t border-slate-100 py-2 text-left first:border-t-0 hover:bg-slate-50">
          <div className="min-w-0"><div className="font-mono text-sm font-semibold text-slate-900">{l.reference_code}</div><div className="truncate text-xs text-slate-500">{note || l.title || `${l.property_type} · ${l.location}`}</div></div>
          <SlaChip listing={l} />
        </button>
      );
    };
    const Section = ({ title, count, tone, children, action }) => (
      <Card className={`p-4 ${tone === 'red' && count ? 'border-rose-300' : ''}`}>
        <div className="mb-2 flex items-center justify-between"><h3 className={`text-sm font-semibold ${tone === 'red' && count ? 'text-rose-700' : 'text-brand-800'}`}>{title}{count != null && <span className={`num ml-2 rounded-full px-2 py-0.5 text-xs ${tone === 'red' && count ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{count}</span>}</h3>{action}</div>
        {children}
      </Card>
    );
    const limitList = (arr, render, empty) => !arr.length ? <p className="text-sm text-slate-400">{empty}</p> : <>{arr.slice(0, 6).map(render)}{arr.length > 6 && <p className="pt-1 text-xs text-slate-400">+ {arr.length - 6} more</p>}</>;

    const Dashboard = () => {
      const { me, data, cfg, now, go, nameOf } = useApp();
      const mgr = isMgr(me); const month = monthStart(); const sla = cfg.sla_hours;
      const open = data.listings.filter((l) => !['archived', 'rejected', 'verified_live'].includes(l.status));
      const mineL = open.filter((l) => l.entered_by === me.id || l.assigned_to === me.id);
      const withSla = (arr) => arr.map((l) => ({ l, s: slaOf(l, sla, now) })).sort((a, b) => a.s.remaining - b.s.remaining);
      const myTasks = data.tasks.filter((t) => t.assigned_to === me.id && !['done', 'cancelled'].includes(t.status));
      const dueToday = myTasks.filter((t) => t.due_at && new Date(t.due_at) < addDays(startOfDay(), 1));
      const myKpi = useMemo(() => userKpis(me, monthRange(month), data, sla, now), [data, now]);
      const taskLine = (t) => <button key={t.id} onClick={() => go('tasks')} className="flex w-full items-center justify-between gap-2 border-t border-slate-100 py-2 text-left text-sm first:border-t-0"><span className="truncate">{t.title}</span><span className={`whitespace-nowrap text-xs ${isOverdue(t, now) ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>{t.due_at ? fmtDateTime(t.due_at) : ''}</span></button>;
      const kpiTiles = (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpiDefsFor(cfg, me.role).slice(0, 8).map((d) => <Tile key={d.key} label={`${d.label}${unitOf(d) ? ` (${unitOf(d)})` : ''}`} value={myKpi[d.key]} target={targetOf(data, me.id, month, d.key)} better={d.better} />)}
        </div>
      );

      if (!mgr) {
        const incomplete = mineL.filter((l) => l.completeness_pct < 100);
        const weekEnd = ymd(addDays(new Date(), 7));
        const delivs = data.agency_deliverables.filter((d) => d.due_date && d.due_date <= weekEnd && d.delivered_qty < d.planned_qty && !['approved', 'missed'].includes(d.status));
        const needMedia = open.filter((l) => !(l.media_images_count > 0));
        return (
          <div>
            <PageHeader title={`Hello, ${(me.full_name || '').split(' ')[0] || 'there'}`} sub={`${monthLabel(month)} · month to date`} />
            <div className="space-y-4">
              {kpiTiles}
              <div className="grid gap-4 lg:grid-cols-2">
                {me.role === 'data_entry' && <Section title="My SLA clocks" count={mineL.length}>{limitList(withSla(mineL), ({ l }) => <ListingLine key={l.id} l={l} />, 'Nothing in progress.')}</Section>}
                {me.role === 'data_entry' && <Section title="My incomplete listings" count={incomplete.length} tone="red">{limitList(incomplete, (l) => <ListingLine key={l.id} l={l} note={`Missing: ${(l.missing_fields || []).map((m) => FIELD_LABEL[m] || m).join(', ')}`} />, 'All complete.')}</Section>}
                <Section title="My tasks due today / overdue" count={dueToday.length} tone="red">{limitList(dueToday, taskLine, 'Nothing due today.')}</Section>
                {me.role === 'marketing' && <Section title="My open tasks" count={myTasks.length}>{limitList(myTasks, taskLine, 'No open tasks.')}</Section>}
                {me.role === 'marketing' && <Section title="Agency deliverables due this week" count={delivs.length} action={<button className="text-xs text-brand-700" onClick={() => go('agencies')}>Open</button>}>{limitList(delivs, (d) => <div key={d.id} className="flex justify-between border-t border-slate-100 py-2 text-sm first:border-t-0"><span>{(data.agencies.find((a) => a.id === d.agency_id) || {}).display_name} · {titleCase(d.item_type)} ({d.delivered_qty}/{d.planned_qty})</span><span className={`text-xs ${d.due_date < ymd(new Date()) ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>{fmtDate(d.due_date)}</span></div>, 'Nothing due this week.')}</Section>}
                {me.role === 'marketing' && <Section title="Listings waiting on media" count={needMedia.length}>{limitList(withSla(needMedia), ({ l }) => <ListingLine key={l.id} l={l} note={`${l.property_type} · ${l.location} · no images yet`} />, 'No listing is waiting on media.')}</Section>}
              </div>
            </div>
          </div>
        );
      }

      // ---- manager / admin: red items first
      const all = withSla(open);
      const breached = all.filter((x) => x.s.state === 'red' && !x.s.onHold);
      const cnf = all.filter((x) => x.s.claimedNotFound);
      const atRisk = all.filter((x) => x.s.state === 'yellow' && !x.s.onHold);
      const stale = open.filter((l) => l.completeness_pct < 100 && now - new Date(l.created_at).getTime() > Number((sla && sla.incomplete_alert) || 24) * 36e5);
      const review = data.tasks.filter((t) => t.status === 'review'); const submitted = data.agency_deliverables.filter((d) => d.status === 'submitted');
      const overdue = data.tasks.filter((t) => isOverdue(t, now));
      const team = data.profiles.filter((p) => p.is_active && ['data_entry', 'marketing'].includes(p.role)).map((p) => userKpis(p, monthRange(month), data, sla, now));
      const months6 = [-5, -4, -3, -2, -1, 0].map((n) => addMonths(month, n));
      const trend = months6.map((m) => ({ m, ...listingStats(data.listings.filter((l) => inRange(l.date_received, monthRange(m))), data.listing_channels, sla, now) }));
      const short = (m) => monthLabel(m).slice(0, 3);
      return (
        <div>
          <PageHeader title="Operations dashboard" sub="Red items first" />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Tile label="SLA breached" value={breached.length} tone={breached.length ? 'red' : null} />
              <Tile label="Claimed, not found" value={cnf.length} tone={cnf.length ? 'red' : null} />
              <Tile label={`Incomplete > ${(sla && sla.incomplete_alert) || 24}h`} value={stale.length} tone={stale.length ? 'red' : null} />
              <Tile label="Waiting approval" value={review.length + submitted.length} onClick={() => go('tasks')} />
              <Tile label="Tasks overdue" value={overdue.length} tone={overdue.length ? 'red' : null} onClick={() => go('tasks')} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Section title="Breached SLAs (> 72h, not live)" count={breached.length} tone="red">{limitList(breached, ({ l }) => <ListingLine key={l.id} l={l} note={`${nameOf(l.assigned_to || l.entered_by)} · ${LISTING_STATUS[l.status][0]}`} />, 'No breaches.')}</Section>
              <Section title="Claimed published — NOT found on website" count={cnf.length} tone="red">{limitList(cnf, ({ l }) => <ListingLine key={l.id} l={l} note={`${nameOf(l.entered_by)} claimed ${fmtDateTime(l.date_published_claimed)}`} />, 'Every claim has been verified.')}</Section>
              <Section title="Incomplete for more than 24h" count={stale.length} tone="red">{limitList(stale, (l) => <ListingLine key={l.id} l={l} note={`${nameOf(l.entered_by)} · ${l.completeness_pct}% · missing ${(l.missing_fields || []).length}`} />, 'None.')}</Section>
              <Section title="At risk (48–72h)" count={atRisk.length}>{limitList(atRisk, ({ l }) => <ListingLine key={l.id} l={l} note={nameOf(l.assigned_to || l.entered_by)} />, 'None.')}</Section>
              <Section title="Waiting for your approval" count={review.length + submitted.length}>{limitList([...review.map((t) => ({ k: t.id, text: `Task · ${t.title}`, by: nameOf(t.assigned_to), to: 'tasks' })), ...submitted.map((d) => ({ k: d.id, text: `Deliverable · ${titleCase(d.item_type)}`, by: (data.agencies.find((a) => a.id === d.agency_id) || {}).display_name, to: 'agencies' }))], (x) => <button key={x.k} onClick={() => go(x.to)} className="flex w-full justify-between border-t border-slate-100 py-2 text-left text-sm first:border-t-0"><span className="truncate">{x.text}</span><span className="text-xs text-slate-500">{x.by}</span></button>, 'Nothing to approve.')}</Section>
              <Section title="Overdue tasks" count={overdue.length} tone="red">{limitList(overdue, (t) => <button key={t.id} onClick={() => go('tasks')} className="flex w-full justify-between border-t border-slate-100 py-2 text-left text-sm first:border-t-0"><span className="truncate">{t.title}</span><span className="whitespace-nowrap text-xs text-rose-700">{nameOf(t.assigned_to)} · {fmtDate(t.due_at)}</span></button>, 'None.')}</Section>
            </div>
            <Card className="scroll-x p-4">
              <h3 className="mb-3 text-sm font-semibold text-brand-800">Team KPIs — {monthLabel(month)}</h3>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500"><tr>{['Name', 'Role', 'Listings', 'Avg complete', 'Avg hours', 'Within SLA', 'Not found', 'Tasks done', 'Tasks late'].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}</tr></thead>
                <tbody>{team.map((k) => <tr key={k.user_id} className="border-t border-slate-100"><td className="whitespace-nowrap px-2 py-2 font-medium">{k.name}</td><td className="px-2 py-2 text-slate-500">{ROLE_LABEL[k.role]}</td><td className="num px-2 py-2">{k.listings_entered}</td><td className="num px-2 py-2">{show(k.avg_completeness, '%')}</td><td className="num px-2 py-2">{show(k.avg_hours_to_publish, 'h')}</td><td className="num px-2 py-2">{show(k.on_time_pct, '%')}</td><td className={`num px-2 py-2 ${k.claimed_not_found ? 'font-semibold text-rose-700' : ''}`}>{k.claimed_not_found}</td><td className="num px-2 py-2">{k.tasks_completed}</td><td className={`num px-2 py-2 ${k.tasks_late ? 'text-rose-700' : ''}`}>{k.tasks_late}</td></tr>)}</tbody>
              </table>
            </Card>
            {me.role === 'admin' && (
              <>
                <div className="grid gap-4 lg:grid-cols-2">
                  {data.agencies.filter((a) => a.is_active).map((a) => { const sc = agencyScorecard(a, month, data); return (
                    <Card key={a.id} className="cursor-pointer p-4 hover:border-brand-500" onClick={() => go('agencies')}>
                      <h3 className="text-sm font-semibold text-brand-800">{a.display_name} — {monthLabel(month)}</h3>
                      <div className="mt-2 grid grid-cols-4 gap-2 text-center text-sm">{[['Delivery', show(sc.delivery_rate, '%')], ['On time', show(sc.on_time_pct, '%')], ['Revisions', show(sc.revision_rate, '%')], ['Cost/lead', sc.cpl == null ? '—' : money(sc.cpl, sc.currency)]].map(([k, v]) => <div key={k}><div className="num text-lg font-bold text-slate-900">{v}</div><div className="text-xs text-slate-500">{k}</div></div>)}</div>
                    </Card>); })}
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card className="p-4"><h3 className="mb-2 text-sm font-semibold text-brand-800">Listings received per month</h3><Bars rows={trend.map((t) => ({ label: short(t.m), value: t.entered }))} /></Card>
                  <Card className="p-4"><h3 className="mb-2 text-sm font-semibold text-brand-800">Published within 72h (%)</h3><Bars unit="%" rows={trend.map((t) => ({ label: short(t.m), value: t.on_time_pct }))} /></Card>
                  <Card className="p-4"><h3 className="mb-2 text-sm font-semibold text-brand-800">Avg hours to publish</h3><Bars rows={trend.map((t) => ({ label: short(t.m), value: t.avg_hours }))} /></Card>
                </div>
              </>
            )}
          </div>
        </div>
      );
    };

    // =========================================================================================
    // REPORTS — built live from the data; "Freeze" stores a snapshot so a closed month never changes
    // =========================================================================================
    const LISTING_COLS = [['entered', 'Entered'], ['verified', 'Verified live'], ['avg_hours', 'Avg hours'], ['on_time_pct', 'Within SLA %'], ['avg_completeness', 'Avg complete %'], ['breached', 'Breached'], ['rejected', 'Rejected'], ['portal_coverage_pct', 'Portal coverage %']];
    const BREAKDOWNS = {
      person: ['By person', LISTING_COLS], source: ['By source type', LISTING_COLS], source_name: ['By source (who gave it)', LISTING_COLS], location: ['By location', LISTING_COLS],
      channel: ['By channel', [['total', 'Listings'], ['published', 'Published'], ['in_progress', 'In progress'], ['rejected', 'Rejected'], ['coverage_pct', 'Coverage %']]],
      agency: ['By agency', [['planned', 'Planned'], ['delivered', 'Delivered'], ['delivery_rate', 'Delivery %'], ['on_time_pct', 'On time %'], ['revision_rate', 'Revision %'], ['leads', 'Leads'], ['cpl', 'Cost / lead']]],
    };
    const KPI_COLS = [['name', 'Name'], ['listings_entered', 'Listings'], ['avg_completeness', 'Avg complete %'], ['avg_hours_to_publish', 'Avg hours'], ['on_time_pct', 'Within SLA %'], ['rejected_count', 'Rejected'], ['portal_coverage_pct', 'Portal cov. %'], ['claimed_not_found', 'Not found'], ['tasks_completed', 'Tasks done'], ['tasks_due', 'Tasks due'], ['tasks_on_time_pct', 'Tasks on time %']];

    const DataTable = ({ cols, rows, first = 'label', firstLabel = '' }) => !rows.length ? <p className="text-sm text-slate-400">No data in this period.</p> : (
      <div className="scroll-x"><table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500"><tr>{first && <th className="px-2 py-1.5 font-medium">{firstLabel}</th>}{cols.map(([k, l]) => <th key={k} className={`px-2 py-1.5 font-medium ${k === 'name' ? '' : 'text-right'}`}>{l}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-slate-100">{first && <td className="px-2 py-1.5 font-medium">{r[first]}</td>}{cols.map(([k]) => <td key={k} className={`num px-2 py-1.5 ${k === 'name' ? 'font-medium' : 'text-right'}`}>{show(r[k])}</td>)}</tr>)}</tbody>
      </table></div>
    );

    const ReportView = ({ report, by }) => {
      const s = report.summary; const total = report.sla.green + report.sla.yellow + report.sla.red;
      const [bTitle, bCols] = BREAKDOWNS[by];
      return (
        <div className="space-y-4">
          <div className="hidden print:block"><h1 className="text-xl font-bold">Home &amp; Vacation — HV Ops {report.label} report</h1><p className="text-sm">{report.from} → {report.to} · generated {fmtDateTime(report.generated_at)}</p></div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Tile label="Listings entered" value={s.entered} /><Tile label="Verified live" value={s.verified} /><Tile label="Open breaches" value={s.breaches_open} tone={s.breaches_open ? 'red' : null} />
            <Tile label="Open incomplete" value={s.incomplete_open} /><Tile label="Claimed, not found" value={s.claimed_not_found} tone={s.claimed_not_found ? 'red' : null} /><Tile label="Tasks done / due" value={`${s.tasks_completed} / ${s.tasks_due}`} />
          </div>
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-brand-800">SLA distribution — listings received in period</h3>
            {total === 0 ? <p className="text-sm text-slate-400">No listings received in this period.</p> : (
              <><div className="flex h-5 overflow-hidden rounded-full">{['green', 'yellow', 'red'].map((k) => report.sla[k] > 0 && <div key={k} className={SLA_STYLE[k].dot} style={{ width: `${(100 * report.sla[k]) / total}%`, marginRight: 2 }} />)}</div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">{['green', 'yellow', 'red'].map((k) => <span key={k} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${SLA_STYLE[k].dot}`} />{SLA_STYLE[k].label} ({k === 'green' ? '<48h' : k === 'yellow' ? '48–72h' : '>72h'}): <b className="num">{report.sla[k]}</b> · {pct(report.sla[k], total)}%</span>)}</div></>
            )}
          </Card>
          <Card className="p-4"><h3 className="mb-2 text-sm font-semibold text-brand-800">KPI table — per person</h3><DataTable cols={KPI_COLS} rows={report.kpis} first={null} /></Card>
          <Card className="p-4"><h3 className="mb-2 text-sm font-semibold text-brand-800">{bTitle}</h3><DataTable cols={bCols} rows={report.breakdowns[by] || []} /></Card>
          {by !== 'agency' && report.breakdowns.agency.length > 0 && <Card className="p-4"><h3 className="mb-2 text-sm font-semibold text-brand-800">Agency scorecards</h3><DataTable cols={BREAKDOWNS.agency[1]} rows={report.breakdowns.agency} /></Card>}
        </div>
      );
    };

    const ReportsPage = () => {
      const { me, data, cfg, now, save, toast } = useApp();
      const [preset, setPreset] = useState('daily'); const [by, setBy] = useState('person'); const [snap, setSnap] = useState(null);
      const [custom, setCustom] = useState({ from: ymd(addDays(new Date(), -30)), to: ymd(new Date()) }); const [month, setMonth] = useState(monthStart());
      const today = startOfDay();
      const range = preset === 'daily' ? { from: addDays(today, -1), to: today } : preset === 'weekly' ? { from: addDays(today, -7), to: today } : preset === 'monthly' ? monthRange(month)
        : { from: startOfDay(new Date(custom.from || new Date())), to: addDays(startOfDay(new Date(custom.to || new Date())), 1) };
      const label = preset === 'daily' ? `Daily (${fmtDate(range.from)})` : preset === 'weekly' ? 'Weekly (last 7 days)' : preset === 'monthly' ? `Monthly (${monthLabel(month)})` : 'Custom';
      const live = useMemo(() => buildReport(range, label, data, cfg, now), [preset, month, custom.from, custom.to, data, now]);
      const report = snap ? snap.payload : live;
      const exportCsv = () => {
        const [bTitle, bCols] = BREAKDOWNS[by]; const lines = [];
        lines.push([`HV Ops ${report.label} report`, report.from, report.to]); lines.push([]);
        lines.push(['Summary']); Object.entries(report.summary).forEach(([k, v]) => lines.push([titleCase(k), v])); lines.push([]);
        lines.push(['KPI table']); lines.push(KPI_COLS.map((c) => c[1])); report.kpis.forEach((r) => lines.push(KPI_COLS.map(([k]) => r[k]))); lines.push([]);
        lines.push([bTitle]); lines.push(['', ...bCols.map((c) => c[1])]); (report.breakdowns[by] || []).forEach((r) => lines.push([r.label, ...bCols.map(([k]) => r[k])]));
        downloadCSV(`hv-ops-report-${report.from}_${report.to}.csv`, lines[0], lines.slice(1));
      };
      const freeze = async () => {
        const row = await save('report_snapshots', { report_type: preset, period_start: live.from, period_end: live.to, title: live.label, payload: live, created_by: me.id });
        if (row) toast('Snapshot frozen');
      };
      return (
        <div>
          <PageHeader title="Reports" sub={snap ? `Frozen snapshot · ${snap.title} · saved ${fmtDateTime(snap.created_at)}` : `${report.from} → ${report.to}`}>
            <Btn kind="ghost" onClick={exportCsv}>CSV</Btn><Btn kind="ghost" onClick={() => window.print()}><Icon name="print" className="h-4 w-4" />Print / PDF</Btn>
            {!snap && isMgr(me) && <Btn onClick={freeze}>Freeze snapshot</Btn>}{snap && <Btn onClick={() => setSnap(null)}>Back to live</Btn>}
          </PageHeader>
          {!snap && <Tabs value={preset} onChange={setPreset} tabs={[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['custom', 'Custom range']]} />}
          <div className="no-print mb-4 flex flex-wrap items-end gap-3">
            {!snap && preset === 'monthly' && <MonthPicker value={month} onChange={setMonth} />}
            {!snap && preset === 'custom' && <><Field label="From"><input type="date" className={inputCls()} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></Field><Field label="To"><input type="date" className={inputCls()} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></Field></>}
            <Field label="Breakdown"><Select value={by} onChange={(v) => setBy(v || 'person')} options={Object.entries(BREAKDOWNS).map(([k, v]) => [k, v[0]])} /></Field>
            {isMgr(me) && data.report_snapshots.length > 0 && <Field label="Frozen snapshots"><Select value={snap ? snap.id : null} placeholder="Live data" onChange={(v) => setSnap(data.report_snapshots.find((x) => x.id === v) || null)} options={data.report_snapshots.map((x) => [x.id, `${x.title} · ${x.period_start}`])} /></Field>}
          </div>
          <ReportView report={report} by={by} />
        </div>
      );
    };
