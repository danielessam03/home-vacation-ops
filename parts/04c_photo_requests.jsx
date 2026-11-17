
    // =========================================================================================
    // NEEDS PHOTOGRAPHY — a property is registered for a shoot BEFORE any listing exists.
    // requested -> scheduled -> shot -> ready (manager approved) -> converted (listing created, approval travels with it)
    // Photos stay on the company intranet; HV Ops only tracks the state.
    // =========================================================================================
    const PHOTO_STATUS = {
      requested: ['Needs scheduling', 'bg-rose-100 text-rose-800'], scheduled: ['Shoot scheduled', 'bg-sky-100 text-sky-800'],
      shot: ['Shot — waiting for manager', 'bg-amber-100 text-amber-900'], ready: ['Photos approved — create the listing', 'bg-emerald-100 text-emerald-800'],
      converted: ['Done — photos on the listing', 'bg-slate-100 text-slate-600'], cancelled: ['Cancelled', 'bg-slate-200 text-slate-500'],
    };
    const PHOTO_GROUPS = [['requested', 'Needs scheduling'], ['scheduled', 'Scheduled shoots'], ['shot', 'Shot — waiting for the manager to review'], ['ready', 'Photos approved — ready to become a listing'], ['converted', 'Done — photos are on a listing'], ['cancelled', 'Cancelled']];
    const photoNo = (r) => 'PH-' + String(r.request_no || 0).padStart(4, '0');
    // Missions (v1.31): what has to happen next with a request, by calendar day —
    // overdue (shoot day passed, "Photos taken" not pressed: red) · today (highlighted) · no date yet · upcoming · to review · ready to list
    const dayNum = (t) => { const x = new Date(t); return x.getFullYear() * 10000 + (x.getMonth() + 1) * 100 + x.getDate(); };
    const shootToday = (r, now) => r.status === 'scheduled' && !!r.scheduled_at && dayNum(r.scheduled_at) === dayNum(now);
    const shootOverdue = (r, now) => r.status === 'scheduled' && !!r.scheduled_at && dayNum(r.scheduled_at) < dayNum(now);
    const shootTime = (r) => new Date(r.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const daysLate = (r, now) => Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(r.scheduled_at).setHours(0, 0, 0, 0)) / 864e5);
    const photoMission = (r, now) => r.status === 'cancelled' ? 'cancelled' : r.status === 'converted' ? 'done' : r.status === 'ready' ? (r.listing_id ? 'done' : 'create') : r.status === 'shot' ? 'review'
      : r.status === 'scheduled' && r.scheduled_at ? (shootOverdue(r, now) ? 'overdue' : shootToday(r, now) ? 'today' : 'upcoming') : 'nodate';
    // key, label, what it means, tile colours (when it holds something), chip colours
    const PHOTO_MISSIONS = [
      ['overdue', 'Overdue', 'the shoot day has passed and “Photos taken” was not pressed', 'border-rose-700 bg-rose-600 text-white', 'bg-rose-600 text-white'],
      ['today', 'Today', 'shoots planned for today', 'border-amber-400 bg-amber-100 text-amber-900 ring-2 ring-amber-300', 'bg-amber-400 text-amber-950'],
      ['nodate', 'No date yet', 'waiting for a photographer and a shoot date', 'border-slate-300 bg-slate-100 text-slate-800', 'bg-slate-200 text-slate-800'],
      ['upcoming', 'Upcoming', 'scheduled for a later day', 'border-sky-300 bg-sky-50 text-sky-900', 'bg-sky-100 text-sky-900'],
      ['review', 'To review', 'shot — waiting for the manager', 'border-violet-300 bg-violet-50 text-violet-900', 'bg-violet-100 text-violet-900'],
      ['create', 'Ready to list', 'photos approved — create the listing', 'border-emerald-300 bg-emerald-50 text-emerald-900', 'bg-emerald-100 text-emerald-900'],
      ['done', 'Done', 'photos are on a listing', '', ''], ['cancelled', 'Cancelled', '', '', ''],
    ];
    const photoRank = (r, now) => PHOTO_MISSIONS.findIndex((m) => m[0] === photoMission(r, now));
    // the one-glance badge used on the Home page lists
    const photoBadge = (r, now) => { const m = photoMission(r, now);
      return m === 'overdue' ? [`Overdue · ${fmtDate(r.scheduled_at)}`, 'bg-rose-600 text-white'] : m === 'today' ? [`Today ${shootTime(r)}`, 'bg-amber-400 text-amber-950']
        : r.status === 'scheduled' && r.scheduled_at ? [fmtDateTime(r.scheduled_at), PHOTO_STATUS[r.status][1]] : [PHOTO_STATUS[r.status][0], PHOTO_STATUS[r.status][1]]; };
    const waitingDays = (r, now) => Math.max(0, Math.floor((now - new Date(r.created_at).getTime()) / 864e5));

    const PhotoRequestForm = ({ request, onClose }) => {
      const { me, data, cfg, save, toast } = useApp();
      const [f, setF] = useState(request || { owner_name: '', owner_phone: '', location: null, property_type: null, deal_type: null, address_notes: '', source_type: null, source_name: '', notes: '', assigned_to: null, scheduled_at: null });
      const [busy, setBusy] = useState(false);
      const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
      const bad = { owner_name: !f.owner_name.trim(), location: !f.location };
      const submit = async () => {
        if (bad.owner_name || bad.location) { toast('Owner name and location are needed', 'error'); return; }
        setBusy(true);
        const payload = { owner_name: f.owner_name.trim(), owner_phone: f.owner_phone || null, location: f.location, property_type: f.property_type, deal_type: f.deal_type, address_notes: f.address_notes || null,
          source_type: f.source_type, source_name: f.source_name || null, notes: f.notes || null, assigned_to: f.assigned_to, scheduled_at: f.scheduled_at };
        if (!request) payload.requested_by = me.id;
        if (request && request.status === 'requested' && f.scheduled_at) payload.status = 'scheduled';
        const row = await save('photo_requests', payload, request ? request.id : null);
        setBusy(false);
        if (row) { toast(request ? 'Saved' : `${photoNo(row)} added to the photography list`); onClose(); }
      };
      return (
        <Modal wide title={request ? `Edit ${photoNo(request)}` : 'Property that needs photography'} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
          <p className="mb-3 text-sm text-slate-500">Use this when a property has to be photographed <b>before</b> it can be entered as a listing. It gets its real code (AH-A-1049-S) later, when the listing is created from here.</p>
          <div data-tour="photo-form" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Owner name" bad={bad.owner_name} className="col-span-2"><input className={inputCls(bad.owner_name)} value={f.owner_name} onChange={(e) => set('owner_name', e.target.value)} autoFocus /></Field>
            <Field label="Owner phone"><input className={inputCls()} value={f.owner_phone || ''} onChange={(e) => set('owner_phone', e.target.value)} /></Field>
            <Field label="Location" bad={bad.location}><Select bad={bad.location} value={f.location} onChange={(v) => set('location', v)} options={Object.keys(cfg.location_codes || {}).sort()} /></Field>
            <Field label="Property type"><Select value={f.property_type} onChange={(v) => set('property_type', v)} options={Object.keys(cfg.unit_type_codes || {}).sort()} /></Field>
            <Field label="Sale / Rent"><Select value={f.deal_type} onChange={(v) => set('deal_type', v)} options={[['sale', 'Sale'], ['rent', 'Rent']]} /></Field>
            <Field label="Where exactly — building, unit, keys, access" className="col-span-2 sm:col-span-3"><textarea rows={2} className={inputCls()} value={f.address_notes || ''} onChange={(e) => set('address_notes', e.target.value)} /></Field>
            <Field label="Photographer"><Select value={f.assigned_to} onChange={(v) => set('assigned_to', v)} placeholder="Not assigned yet" options={data.profiles.filter((p) => p.is_active).map((p) => [p.id, p.full_name || p.email])} /></Field>
            <Field label="Shoot date & time"><input type="datetime-local" className={inputCls()} value={toLocalInput(f.scheduled_at)} onChange={(e) => set('scheduled_at', fromLocalInput(e.target.value))} /></Field>
            <Field label="Source type"><Select value={f.source_type} onChange={(v) => set('source_type', v)} options={SOURCE_TYPES.map((s) => [s, titleCase(s)])} /></Field>
            <Field label="Source name (who gave it)" className="col-span-2"><input className={inputCls()} value={f.source_name || ''} onChange={(e) => set('source_name', e.target.value)} /></Field>
            <Field label="Notes" className="col-span-2 sm:col-span-3"><textarea rows={2} className={inputCls()} value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
          </div>
        </Modal>
      );
    };

    const PhotoShotModal = ({ request, onClose }) => {
      const { save, toast } = useApp();
      const [f, setF] = useState({ photos_count: request.photos_count == null ? '' : String(request.photos_count), videos_count: request.videos_count == null ? '' : String(request.videos_count), has_logo: request.has_logo, edited: request.edited, intranet_folder: request.intranet_folder || '' });
      const submit = async () => {
        if (!f.intranet_folder.trim()) { toast('Write the intranet folder name so the manager can find the photos', 'error'); return; }
        const row = await save('photo_requests', { status: 'shot', photos_count: f.photos_count === '' ? null : Number(f.photos_count), videos_count: f.videos_count === '' ? null : Number(f.videos_count), has_logo: f.has_logo, edited: f.edited, intranet_folder: f.intranet_folder.trim() }, request.id);
        if (row) { toast('Sent to the manager for review'); onClose(); }
      };
      return (
        <Modal title={`${photoNo(request)} — photos taken`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={submit}>Send to manager</Btn></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Intranet folder name" className="col-span-2" bad={!f.intranet_folder.trim()} hint="The photos stay on the intranet — nothing is uploaded here."><input className={inputCls(!f.intranet_folder.trim())} value={f.intranet_folder} onChange={(e) => setF({ ...f, intranet_folder: e.target.value })} placeholder="e.g. 2026-09 / Hadaba / Mr Hassan apartment" /></Field>
            <Field label="Photos (count)"><input type="number" min="0" className={inputCls()} value={f.photos_count} onChange={(e) => setF({ ...f, photos_count: e.target.value })} /></Field>
            <Field label="Videos (count)"><input type="number" min="0" className={inputCls()} value={f.videos_count} onChange={(e) => setF({ ...f, videos_count: e.target.value })} /></Field>
            <Field label="Logo added"><TriState value={f.has_logo} onChange={(v) => setF({ ...f, has_logo: v })} /></Field>
            <Field label="Edited"><TriState value={f.edited} onChange={(v) => setF({ ...f, edited: v })} /></Field>
          </div>
        </Modal>
      );
    };

    const PhotoRequestCard = ({ r, onEdit, onShot, onReason, onConvert }) => {
      const { me, data, now, save, nameOf, go, toast, reloadTable } = useApp();
      const linked = r.listing_id ? (data.listings.find((x) => x.id === r.listing_id) || data.offline.find((x) => x.id === r.listing_id)) : null;      // request born from a listing that had no photos
      const mgr = isMgr(me); const mine = r.requested_by === me.id || r.assigned_to === me.id; const can = mgr || mine;
      const st = PHOTO_STATUS[r.status]; const late = shootOverdue(r, now); const today = shootToday(r, now); const days = waitingDays(r, now);
      const open = !['converted', 'cancelled'].includes(r.status);
      return (
        <Card className={`border-l-4 p-3 ${late ? 'border-rose-300 border-l-rose-600 !bg-rose-50' : today ? 'border-amber-300 border-l-amber-500 !bg-amber-50 ring-2 ring-amber-300' : r.status === 'requested' && days >= 2 ? 'border-l-rose-600' : r.status === 'ready' ? 'border-l-emerald-500' : r.status === 'shot' ? 'border-l-violet-500' : 'border-l-slate-300'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono text-xs font-bold text-slate-500">{photoNo(r)}{linked ? <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-brand-800">{linked.reference_code}</span> : null}</div>
              <div className="truncate font-semibold text-slate-900">{r.owner_name}{r.owner_phone ? <a className="ml-2 text-xs font-normal text-brand-700 underline" href={`tel:${r.owner_phone}`}>{r.owner_phone}</a> : null}</div>
              <div className="truncate text-sm text-slate-600">{[r.property_type, r.location, r.deal_type ? titleCase(r.deal_type) : null].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {late && <Badge className="bg-rose-600 text-white">Overdue · {daysLate(r, now)} day{daysLate(r, now) === 1 ? '' : 's'} late</Badge>}
              {today && <Badge className="bg-amber-400 text-amber-950">Today {shootTime(r)}</Badge>}
              <Badge className={st[1]}>{st[0]}</Badge>
            </div>
          </div>
          {r.address_notes && <div className="mt-1.5 whitespace-pre-wrap text-xs text-slate-600">{r.address_notes}</div>}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <span>Photographer: <b className="text-slate-800">{r.assigned_to ? nameOf(r.assigned_to) : 'not assigned'}</b></span>
            {r.scheduled_at && <span className={late ? 'font-semibold text-rose-700' : ''}>Shoot: {fmtDateTime(r.scheduled_at)}{late ? ' — overdue' : ''}</span>}
            {r.intranet_folder && <span>Folder: <b className="text-slate-800">{r.intranet_folder}</b></span>}
            {r.photos_count != null && <span>{r.photos_count} photos{r.videos_count ? ` · ${r.videos_count} videos` : ''}{r.has_logo ? ' · logo ✓' : ''}{r.edited ? ' · edited ✓' : ''}</span>}
            {open && <span>{days === 0 ? 'added today' : `waiting ${days} day${days === 1 ? '' : 's'}`} · by {nameOf(r.requested_by)}</span>}
            {r.approved_by && <span>Approved by {nameOf(r.approved_by)}</span>}
          </div>
          {r.revision_note && r.status !== 'ready' && <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">Manager asked: {r.revision_note}</div>}
          {r.status === 'cancelled' && <div className="mt-2 text-xs text-slate-500">Reason: {r.cancel_reason}</div>}
          <div data-tour="photo-actions" className="no-print mt-3 flex flex-wrap gap-2">
            {can && open && <Btn kind="ghost" className="!py-1.5" onClick={() => onEdit(r)}>{r.status === 'requested' ? 'Assign / schedule' : 'Edit'}</Btn>}
            {can && ['requested', 'scheduled'].includes(r.status) && <Btn className="!py-1.5" onClick={() => onShot(r)}>Photos taken</Btn>}
            {mgr && r.status === 'shot' && <><Btn kind="ok" className="!py-1.5" onClick={async () => { if (await save('photo_requests', { status: 'ready' }, r.id)) { toast(r.listing_id ? 'Photos approved — the listing now has its photos' : 'Photos approved'); if (r.listing_id) reloadTable('listings'); } }}>Approve photos</Btn><Btn kind="danger" className="!py-1.5" onClick={() => onReason(r, 'reshoot')}>Needs re-shoot</Btn></>}
            {!mgr && r.status === 'shot' && <span className="self-center text-xs text-slate-500">Waiting for the manager</span>}
            {!r.listing_id && ((can && r.status === 'shot') || r.status === 'ready') && <Btn kind={r.status === 'ready' ? 'primary' : 'ghost'} className="!py-1.5" onClick={() => onConvert(r)}>Create the listing</Btn>}
            {r.listing_id && <Btn kind="soft" className="!py-1.5" onClick={() => go('listing', r.listing_id)}>Open listing</Btn>}
            {can && open && <Btn kind="ghost" className="!py-1.5" onClick={() => onReason(r, 'cancel')}>Cancel</Btn>}
          </div>
        </Card>
      );
    };

    const PhotoRequestsPage = () => {
      const { me, data, now, save, go, toast, reloadTable } = useApp();
      const mgr = isMgr(me);
      const [q, setQ] = useState(''); const [form, setForm] = useState(null); const [shot, setShot] = useState(null); const [reason, setReason] = useState(null); const [convert, setConvert] = useState(null); const [showDone, setShowDone] = useState(false);
      const [scope, setScope] = useState(null); const [bucket, setBucket] = useState(null);       // scope: mine | all (null = mine when I have something) · bucket: one mission tile
      useTourAction({ 'open-photo-request': () => { if (form) return false; setForm({}); }, close: () => setForm(null) });
      const isOpenM = (r) => !['done', 'cancelled'].includes(photoMission(r, now));
      const isMine = (r) => r.assigned_to === me.id || r.requested_by === me.id || (mgr && r.status === 'shot');       // a manager's mission: photos waiting for review
      const mineOpen = data.photo_requests.filter((r) => isMine(r) && isOpenM(r)).length; const allOpen = data.photo_requests.filter(isOpenM).length;
      const sc = scope || (mineOpen ? 'mine' : 'all');
      const s = q.trim().toLowerCase();
      const rows = data.photo_requests.filter((r) => (sc === 'all' || isMine(r)) && (!s || `${photoNo(r)} ${r.owner_name} ${r.owner_phone || ''} ${r.location} ${r.address_notes || ''}`.toLowerCase().includes(s)));
      const by = (k) => rows.filter((r) => photoMission(r, now) === k);
      const nO = by('overdue').length, nT = by('today').length, openCount = rows.filter(isOpenM).length;
      const sub = `${sc === 'mine' ? 'Your missions' : 'Everyone'}: ${nO ? `${nO} overdue · ` : ''}${nT ? `${nT} shoot${nT === 1 ? '' : 's'} today` : 'no shoot today'} · ${openCount} open`;
      return (
        <div>
          <PageHeader title="Needs photography" sub={sub}>
            <Btn kind="ghost" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide finished' : 'Show finished'}</Btn>
            <Btn data-tour="add-photo" onClick={() => setForm({})}><Icon name="plus" className="h-4 w-4" />Add property</Btn>
          </PageHeader>
          <div className="no-print mb-3 inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white text-sm">
            {[['mine', `My missions · ${mineOpen}`], ['all', `Everyone · ${allOpen}`]].map(([k, l]) => <button key={k} onClick={() => setScope(k)} className={`px-3 py-1.5 font-medium ${sc === k ? 'bg-brand-700 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>{l}</button>)}
          </div>
          <div data-tour="photo-missions" className="no-print mb-2 grid grid-cols-3 gap-2 lg:grid-cols-6">
            {PHOTO_MISSIONS.slice(0, 6).map(([k, label, hint, tile]) => { const n = by(k).length; return (
              <button key={k} title={hint} onClick={() => setBucket(bucket === k ? null : k)} className={`rounded-xl border p-2.5 text-left ${n ? tile : 'border-slate-200 bg-white text-slate-400'} ${bucket === k ? 'outline outline-2 outline-offset-2 outline-brand-700' : ''}`}>
                <div className="num text-2xl font-bold leading-none">{n}</div><div className="mt-1 text-xs font-medium">{label}</div>
              </button>); })}
          </div>
          <div className="no-print mb-3 text-xs text-slate-500">{bucket ? <button className="text-brand-700 underline" onClick={() => setBucket(null)}>Showing only “{PHOTO_MISSIONS.find((m) => m[0] === bucket)[1]}” — show everything</button> : 'Tap a tile to see only those.'}</div>
          <input className={`${inputCls()} no-print mb-4`} placeholder="Search owner, phone, location…" value={q} onChange={(e) => setQ(e.target.value)} />
          {!rows.length && <Empty>{sc === 'mine' && allOpen ? 'Nothing on your own photography list — “Everyone” shows the whole list.' : 'Nothing on the photography list. Add a property that has to be photographed before it can be listed.'}</Empty>}
          {PHOTO_MISSIONS.filter(([k]) => (bucket ? k === bucket : showDone || !['done', 'cancelled'].includes(k))).map(([k, label, hint, tile, chip]) => {
            const g = by(k).sort((a, b) => ['overdue', 'today', 'upcoming'].includes(k) ? new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0) : new Date(a.created_at) - new Date(b.created_at));
            if (!g.length) return null;
            return (
              <div key={k} className="mb-6">
                <h3 className={`mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold ${k === 'overdue' ? 'text-rose-700' : k === 'today' ? 'text-amber-800' : 'text-brand-800'}`}>
                  {chip ? <span className={`rounded-full px-2.5 py-0.5 text-xs ${chip}`}>{label}</span> : label}
                  <span className="num rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{g.length}</span>{hint && <span className="text-xs font-normal text-slate-500">{hint}</span>}
                </h3>
                <div className="grid gap-2 lg:grid-cols-2">{g.map((r) => <PhotoRequestCard key={r.id} r={r} onEdit={setForm} onShot={setShot} onReason={(req, kind) => setReason({ req, kind })} onConvert={setConvert} />)}</div>
              </div>
            );
          })}
          {form && <PhotoRequestForm request={form.id ? form : null} onClose={() => setForm(null)} />}
          {shot && <PhotoShotModal request={shot} onClose={() => setShot(null)} />}
          {reason && reason.kind === 'cancel' && <ReasonModal kind="danger" title={`Cancel ${photoNo(reason.req)}`} label="Reason (mandatory)" confirmLabel="Cancel request" onClose={() => setReason(null)} onConfirm={async (txt) => { if (await save('photo_requests', { status: 'cancelled', cancel_reason: txt }, reason.req.id)) setReason(null); }} />}
          {reason && reason.kind === 'reshoot' && <ReasonModal kind="danger" title={`${photoNo(reason.req)} — needs re-shoot`} label="What has to be re-shot or fixed? (mandatory)" confirmLabel="Send back" onClose={() => setReason(null)} onConfirm={async (txt) => { if (await save('photo_requests', { status: 'scheduled', revision_note: txt, scheduled_at: reason.req.scheduled_at || new Date().toISOString() }, reason.req.id)) { toast('Sent back to the photographer'); setReason(null); } }} />}
          {convert && <ListingForm prefill={{ photo_request_id: convert.id, photos_approved: convert.status === 'ready', owner_name: convert.owner_name, owner_phone: convert.owner_phone, location: convert.location, property_type: convert.property_type, deal_type: convert.deal_type,
            source_type: convert.source_type, source_name: convert.source_name || convert.owner_name, photography_done: true, media_has_logo: convert.has_logo, media_edited: convert.edited, media_uploaded: convert.status === 'ready' ? true : null }}
            onClose={() => setConvert(null)} onSaved={async (row) => { setConvert(null); await reloadTable('photo_requests'); go('listing', row.id); }} />}
        </div>
      );
    };
