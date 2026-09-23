
    // =========================================================================================
    // TASKS — kanban on desktop, list on phone. Staff move To do -> Doing -> Review; a manager approves.
    // =========================================================================================
    const isOverdue = (t, now) => t.due_at && !['done', 'cancelled'].includes(t.status) && new Date(t.due_at).getTime() < now;

    const TaskForm = ({ task, preset, onClose }) => {
      const { me, data, cfg, save, toast } = useApp();
      const [f, setF] = useState(task || { title: '', description: '', task_type: null, assigned_to: me.id, priority: 'normal', due_at: null, listing_id: null, agency: null, ...(preset || {}) });
      const [busy, setBusy] = useState(false);
      const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
      const submit = async () => {
        if (!f.title.trim()) { toast('Title is required', 'error'); return; }
        setBusy(true);
        const payload = { title: f.title.trim(), description: f.description || null, task_type: f.task_type, assigned_to: f.assigned_to, priority: f.priority || 'normal', due_at: f.due_at, listing_id: f.listing_id, agency: f.agency };
        if (!task) payload.created_by = me.id;
        const row = await save('tasks', payload, task ? task.id : null);
        setBusy(false); if (row) { toast('Task saved'); onClose(); }
      };
      return (
        <Modal title={task ? 'Edit task' : 'New task'} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={submit} disabled={busy}>Save</Btn></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title" className="col-span-2" bad={!f.title.trim()}><input className={inputCls(!f.title.trim())} value={f.title} onChange={(e) => set('title', e.target.value)} autoFocus /></Field>
            <Field label="Description" className="col-span-2"><textarea rows={3} className={inputCls()} value={f.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
            <Field label="Assignee"><Select value={f.assigned_to} onChange={(v) => set('assigned_to', v)} options={data.profiles.filter((p) => p.is_active).map((p) => [p.id, p.full_name || p.email])} /></Field>
            <Field label="Type"><Select value={f.task_type} onChange={(v) => set('task_type', v)} options={(cfg.task_types || []).map((t) => [t, titleCase(t)])} /></Field>
            <Field label="Due"><input type="datetime-local" className={inputCls()} value={toLocalInput(f.due_at)} onChange={(e) => set('due_at', fromLocalInput(e.target.value))} /></Field>
            <Field label="Priority"><Select value={f.priority} onChange={(v) => set('priority', v || 'normal')} options={Object.keys(PRIORITY).map((p) => [p, titleCase(p)])} /></Field>
            <Field label="Linked listing (optional)"><Select value={f.listing_id} onChange={(v) => set('listing_id', v)} placeholder="None" options={data.listings.filter((l) => l.status !== 'archived').slice(0, 500).map((l) => [l.id, `${l.reference_code}${l.title ? ' · ' + l.title.slice(0, 30) : ''}`])} /></Field>
            <Field label="Agency (optional)"><Select value={f.agency} onChange={(v) => set('agency', v)} placeholder="None" options={data.agencies.map((a) => [a.name, a.display_name])} /></Field>
          </div>
        </Modal>
      );
    };

    const TaskCard = ({ t, onOpen, draggable }) => {
      const { now, nameOf, data } = useApp();
      const over = isOverdue(t, now); const l = t.listing_id && data.listings.find((x) => x.id === t.listing_id);
      return (
        <div draggable={draggable} onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)} onClick={() => onOpen(t)}
          className={`cursor-pointer rounded-lg border bg-white p-2.5 shadow-sm hover:border-brand-500 ${over ? 'border-rose-400' : 'border-slate-200'}`}>
          <div className="text-sm font-medium text-slate-900">{t.title}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Badge className={PRIORITY[t.priority]}>{titleCase(t.priority)}</Badge>
            {t.task_type && <Badge>{titleCase(t.task_type)}</Badge>}
            {l && <Badge className="bg-brand-50 font-mono text-brand-800">{l.reference_code}</Badge>}
            {t.agency && <Badge className="bg-violet-100 text-violet-800">{titleCase(t.agency)}</Badge>}
            {t.recurring_template_id && <Badge>↻</Badge>}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs"><span className="text-slate-500">{nameOf(t.assigned_to)}</span><span className={over ? 'font-semibold text-rose-700' : 'text-slate-500'}>{t.due_at ? `${over ? 'Overdue · ' : ''}${fmtDateTime(t.due_at)}` : 'No due date'}</span></div>
          {t.rejection_reason && t.status !== 'done' && <div className="mt-1.5 rounded bg-amber-50 p-1.5 text-xs text-amber-900">Sent back: {t.rejection_reason}</div>}
        </div>
      );
    };

    const TaskDetail = ({ t, onClose }) => {
      const { me, save, nameOf, go, data, toast } = useApp();
      const [edit, setEdit] = useState(false); const [back, setBack] = useState(false);
      const mgr = isMgr(me); const mine = t.assigned_to === me.id || t.created_by === me.id;
      const move = async (status, extra = {}) => { const row = await save('tasks', { status, ...extra }, t.id); if (row) { toast(`Moved to ${titleCase(status)}`); onClose(); } };
      const l = t.listing_id && data.listings.find((x) => x.id === t.listing_id);
      if (edit) return <TaskForm task={t} onClose={onClose} />;
      if (back) return <ReasonModal title="Send back" label="What needs to change? (mandatory)" confirmLabel="Send back to Doing" kind="danger" onClose={() => setBack(false)} onConfirm={(r) => move('doing', { rejection_reason: r })} />;
      return (
        <Modal title={t.title} onClose={onClose} footer={<>
          {(mgr || mine) && t.status !== 'done' && <Btn kind="ghost" onClick={() => setEdit(true)}>Edit</Btn>}
          {(mgr || mine) && t.status === 'todo' && <Btn onClick={() => move('doing')}>Start</Btn>}
          {(mgr || mine) && t.status === 'doing' && <Btn onClick={() => move('review')}>Submit for review</Btn>}
          {(mgr || mine) && t.status === 'doing' && <Btn kind="ghost" onClick={() => move('todo')}>Back to To do</Btn>}
          {mgr && t.status === 'review' && <><Btn kind="danger" onClick={() => setBack(true)}>Send back</Btn><Btn kind="ok" onClick={() => move('done')}>Approve</Btn></>}
          {mgr && !['done', 'cancelled'].includes(t.status) && <Btn kind="ghost" onClick={() => { if (confirm('Cancel this task?')) move('cancelled'); }}>Cancel task</Btn>}
          {!mgr && t.status === 'review' && <span className="self-center text-sm text-slate-500">Waiting for manager approval</span>}</>}>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-1.5"><Badge className="bg-brand-50 text-brand-800">{titleCase(t.status)}</Badge><Badge className={PRIORITY[t.priority]}>{titleCase(t.priority)}</Badge>{t.task_type && <Badge>{titleCase(t.task_type)}</Badge>}</div>
            {t.description && <p className="whitespace-pre-wrap text-slate-700">{t.description}</p>}
            {t.rejection_reason && <div className="rounded bg-amber-50 p-2 text-amber-900">Last sent back: {t.rejection_reason}</div>}
            <dl className="grid grid-cols-2 gap-2">
              {[['Assignee', nameOf(t.assigned_to)], ['Created by', nameOf(t.created_by)], ['Due', fmtDateTime(t.due_at)], ['Started', fmtDateTime(t.started_at)], ['Submitted', fmtDateTime(t.completed_at)], ['Approved', t.approved_at ? `${fmtDateTime(t.approved_at)} · ${nameOf(t.approved_by)}` : '—']].map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd>{v}</dd></div>)}
            </dl>
            {l && <button className="text-brand-700 underline" onClick={() => { onClose(); go('listing', l.id); }}>Open listing {l.reference_code}</button>}
          </div>
        </Modal>
      );
    };

    const TemplatesModal = ({ onClose }) => {
      const { me, data, cfg, save, toast, workerCall } = useApp();
      const blank = { title: '', description: '', task_type: null, assigned_to: null, priority: 'normal', frequency: 'daily', weekday: 0, day_of_month: 1, due_time: '17:00', is_active: true };
      const [f, setF] = useState(null);
      const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const submit = async () => {
        if (!f.title.trim() || !f.assigned_to) { toast('Title and assignee are required', 'error'); return; }
        const payload = { title: f.title.trim(), description: f.description || null, task_type: f.task_type, assigned_to: f.assigned_to, priority: f.priority, frequency: f.frequency,
          weekday: f.frequency === 'weekly' ? Number(f.weekday) : null, day_of_month: f.frequency === 'monthly' ? Number(f.day_of_month) : null, due_time: f.due_time, is_active: f.is_active };
        if (!f.id) payload.created_by = me.id;
        if (await save('recurring_templates', payload, f.id)) setF(null);
      };
      return (
        <Modal wide title="Recurring task templates" onClose={onClose} footer={f ? <><Btn kind="ghost" onClick={() => setF(null)}>Back</Btn><Btn onClick={submit}>Save template</Btn></> :
          <><Btn kind="ghost" onClick={async () => { const r = await workerCall('/run-recurring'); if (r) toast(`${r.tasks_created} task(s) created for ${r.date}`); }}>Generate today’s now</Btn><Btn onClick={() => setF(blank)}>New template</Btn></>}>
          {!f ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">Every night just after midnight (Cairo) the worker creates that day’s tasks from the active templates.</p>
              {!data.recurring_templates.length && <Empty>No templates yet.</Empty>}
              {data.recurring_templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5">
                  <button className="min-w-0 text-left" onClick={() => setF({ ...t, due_time: (t.due_time || '17:00').slice(0, 5) })}>
                    <div className={`truncate text-sm font-medium ${t.is_active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{t.title}</div>
                    <div className="text-xs text-slate-500">{titleCase(t.frequency)}{t.frequency === 'weekly' ? ` · ${days[t.weekday]}` : t.frequency === 'monthly' ? ` · day ${t.day_of_month}` : ''} · due {(t.due_time || '').slice(0, 5)} · {(data.profiles.find((p) => p.id === t.assigned_to) || {}).full_name || '—'}</div>
                  </button>
                  <Btn kind="ghost" className="!py-1" onClick={() => save('recurring_templates', { is_active: !t.is_active }, t.id)}>{t.is_active ? 'Pause' : 'Resume'}</Btn>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Title" className="col-span-2" bad={!f.title.trim()}><input className={inputCls(!f.title.trim())} value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
              <Field label="Description" className="col-span-2"><textarea rows={2} className={inputCls()} value={f.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
              <Field label="Assignee" bad={!f.assigned_to}><Select bad={!f.assigned_to} value={f.assigned_to} onChange={(v) => set('assigned_to', v)} options={data.profiles.filter((p) => p.is_active).map((p) => [p.id, p.full_name || p.email])} /></Field>
              <Field label="Type"><Select value={f.task_type} onChange={(v) => set('task_type', v)} options={(cfg.task_types || []).map((t) => [t, titleCase(t)])} /></Field>
              <Field label="Repeats"><Select value={f.frequency} onChange={(v) => set('frequency', v || 'daily')} options={[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']]} /></Field>
              {f.frequency === 'weekly' && <Field label="Weekday"><Select value={String(f.weekday == null ? 0 : f.weekday)} onChange={(v) => set('weekday', Number(v || 0))} options={days.map((d, i) => [String(i), d])} /></Field>}
              {f.frequency === 'monthly' && <Field label="Day of month"><input type="number" min="1" max="31" className={inputCls()} value={f.day_of_month || 1} onChange={(e) => set('day_of_month', e.target.value)} /></Field>}
              <Field label="Due time (Cairo)"><input type="time" className={inputCls()} value={f.due_time} onChange={(e) => set('due_time', e.target.value)} /></Field>
              <Field label="Priority"><Select value={f.priority} onChange={(v) => set('priority', v || 'normal')} options={Object.keys(PRIORITY).map((p) => [p, titleCase(p)])} /></Field>
            </div>
          )}
        </Modal>
      );
    };

    const TasksPage = ({ openId }) => {          // openId: a task to open straight away (link from a WhatsApp message)
      const { me, data, now, save, toast } = useApp();
      const mgr = isMgr(me);
      const [who, setWho] = useState(mgr ? null : me.id); const [form, setForm] = useState(false); const [open, setOpen] = useState(openId || null); const [tpl, setTpl] = useState(false); const [col, setCol] = useState('todo');
      const tasks = data.tasks.filter((t) => t.status !== 'cancelled' && (!who || t.assigned_to === who));
      const recentDone = (t) => t.status !== 'done' || now - new Date(t.approved_at || t.updated_at).getTime() < 14 * 864e5;
      const byCol = (k) => tasks.filter((t) => t.status === k && recentDone(t)).sort((a, b) => (new Date(a.due_at || '2999') - new Date(b.due_at || '2999')));
      const openTask = open && data.tasks.find((t) => t.id === open);
      const drop = async (e, status) => {
        e.preventDefault(); const t = data.tasks.find((x) => x.id === e.dataTransfer.getData('text/plain'));
        if (!t || t.status === status) return;
        if (!mgr && (status === 'done' || t.status === 'done')) { toast('Only a manager can approve tasks', 'error'); return; }
        if (t.status === 'review' && ['todo', 'doing'].includes(status)) { setOpen(t.id); toast('Open the task and use “Send back” — a reason is required', 'error'); return; }
        await save('tasks', { status }, t.id);
      };
      return (
        <div>
          <PageHeader title="Tasks" sub={`${tasks.filter((t) => isOverdue(t, now)).length} overdue · ${tasks.filter((t) => t.status === 'review').length} waiting approval`}>
            <div className="w-44"><Select value={who} onChange={setWho} placeholder="Everyone" options={data.profiles.filter((p) => p.is_active).map((p) => [p.id, p.id === me.id ? 'My tasks' : p.full_name || p.email])} /></div>
            {mgr && <Btn kind="ghost" onClick={() => setTpl(true)}>↻ Recurring</Btn>}
            <Btn onClick={() => setForm(true)}><Icon name="plus" className="h-4 w-4" />New task</Btn>
          </PageHeader>
          {/* phone: one column at a time */}
          <div className="md:hidden">
            <Tabs value={col} onChange={setCol} tabs={TASK_COLS.map(([k, l]) => [k, `${l} (${byCol(k).length})`])} />
            <div className="space-y-2">{byCol(col).length ? byCol(col).map((t) => <TaskCard key={t.id} t={t} onOpen={(x) => setOpen(x.id)} />) : <Empty>Nothing here.</Empty>}</div>
          </div>
          {/* desktop: kanban with drag and drop */}
          <div className="hidden grid-cols-4 gap-3 md:grid">
            {TASK_COLS.map(([k, label]) => (
              <div key={k} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, k)} className="min-h-[60vh] rounded-xl bg-slate-100 p-2">
                <div className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-slate-700"><span>{label}</span><span className="num text-slate-400">{byCol(k).length}</span></div>
                <div className="space-y-2">{byCol(k).map((t) => <TaskCard key={t.id} t={t} draggable onOpen={(x) => setOpen(x.id)} />)}</div>
              </div>
            ))}
          </div>
          {form && <TaskForm onClose={() => setForm(false)} />}
          {openTask && <TaskDetail t={openTask} onClose={() => setOpen(null)} />}
          {tpl && <TemplatesModal onClose={() => setTpl(false)} />}
        </div>
      );
    };
