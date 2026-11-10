
    // =========================================================================================
    // CONTENT CALENDAR (sql/027) — the material each agency posts, and when. Staff add zip files / links;
    // the agency drags each item onto the day it will post it and pastes the post link once it is up.
    // Also here: the agency portal (all an agency login sees) and the "request an account" form.
    // =========================================================================================
    const CONTENT_BUCKET = 'ops-agency-content';
    const CONTENT_MAX_MB = 50;
    const CONTENT_STATE = {
      pool: ['Not planned', 'border-slate-300 bg-slate-100 text-slate-700'],
      scheduled: ['Planned', 'border-sky-300 bg-sky-100 text-sky-900'],
      late: ['Late', 'border-rose-700 bg-rose-600 text-white'],
      posted: ['Posted', 'border-emerald-700 bg-emerald-600 text-white'],
    };
    const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
    const addD = (d, n) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + n); return x; };
    const mondayOf = (d) => addD(d, -((new Date(d).getDay() + 6) % 7));
    const contentState = (i, today) => i.posted_url ? 'posted' : ((i.scheduled_date && i.scheduled_date < today) || (i.post_by && i.post_by < today)) ? 'late' : i.scheduled_date ? 'scheduled' : 'pool';
    const fmtBytes = (n) => n == null ? '' : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`;
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayLabel = (k) => { const [y, m, d] = k.split('-').map(Number); return `${d} ${MONTHS_S[m - 1]} ${y}`; };
    const uuid4 = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : ((r & 3) | 8)).toString(16); }));
    // a one-hour download link for a zip in the private bucket (the agency only gets links to its own folder)
    const openSigned = async (item, toast) => {
      const { data, error } = await sbc.storage.from(CONTENT_BUCKET).createSignedUrl(item.file_path, 3600, { download: item.file_name || true });
      if (error || !data) { toast(friendlyError(error || new Error('No download link')), 'error'); return; }
      const a = document.createElement('a'); a.href = data.signedUrl; a.target = '_blank'; a.rel = 'noreferrer'; document.body.appendChild(a); a.click(); a.remove();
    };

    const ContentChip = ({ item, state, onClick, draggable, onDragStart, onDragEnd, picked }) => (
      <button type="button" draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick} title={item.title}
        className={`flex w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-xs font-medium ${CONTENT_STATE[state][1]} ${picked ? 'ring-2 ring-brand-500 ring-offset-1' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}>
        <Icon name={item.kind === 'file' ? 'file' : 'link'} className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{item.title}</span>
      </button>
    );

    // staff: add zip files / links, plan, report, delete · asAgency: plan the day + paste the post link
    const ContentCalendar = ({ agency, items, staff, asAgency }) => {
      const { save, toast, now } = useApp();
      const today = dayKey(now);
      const [week, setWeek] = useState(() => mondayOf(now)); const [picked, setPicked] = useState(null); const [open, setOpen] = useState(null); const [add, setAdd] = useState(false); const [over, setOver] = useState(null);
      const dragId = useRef(null);
      const canPlan = staff || asAgency;
      const days = [0, 1, 2, 3, 4, 5, 6].map((n) => dayKey(addD(week, n)));
      const pool = items.filter((i) => !i.scheduled_date).sort((a, b) => (a.post_by || '9').localeCompare(b.post_by || '9') || a.created_at.localeCompare(b.created_at));
      const weekItems = items.filter((i) => days.includes(i.scheduled_date));
      const n = (s) => weekItems.filter((i) => contentState(i, today) === s).length;
      const lateAll = items.filter((i) => contentState(i, today) === 'late').length;
      const place = async (id, k) => { setPicked(null); if (await save('content_items', { scheduled_date: k }, id)) toast(`Planned for ${dayLabel(k)}`); };
      const startDrag = (i) => (e) => { dragId.current = i.id; try { e.dataTransfer.setData('text/plain', i.id); e.dataTransfer.effectAllowed = 'move'; } catch (x) {} };
      const drop = (e, k) => { e.preventDefault(); setOver(null); const id = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || dragId.current; dragId.current = null; if (id) place(id, k); };
      const current = open && items.find((i) => i.id === open);
      return (
        <Card data-tour="agency-calendar" className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-sm font-semibold text-brand-800">Content calendar{agency && !asAgency ? ` — ${agency.display_name}` : ''}</h3>
              <p className="text-xs text-slate-500">{asAgency ? 'Drag each item onto the day you will post it. Once it is up, open it and paste the post link.' : 'Add the material; the agency plans the day and reports the post link.'}</p></div>
            <div className="no-print flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
                <button className="px-2.5 py-2 text-slate-600" onClick={() => setWeek(addD(week, -7))} aria-label="Previous week">‹</button>
                <button className="min-w-[10rem] px-1 text-center text-sm font-medium" title="This week" onClick={() => setWeek(mondayOf(now))}>{dayLabel(days[0]).replace(/ \d{4}$/, '')} – {dayLabel(days[6])}</button>
                <button className="px-2.5 py-2 text-slate-600" onClick={() => setWeek(addD(week, 7))} aria-label="Next week">›</button>
              </div>
              {staff && <Btn className="!py-1.5" onClick={() => setAdd(true)}><Icon name="plus" className="h-4 w-4" />Add content</Btn>}
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5 text-xs">{Object.entries(CONTENT_STATE).map(([k, [l, c]]) => <span key={k} className={`rounded-full border px-2 py-0.5 ${c}`}>{l} · {k === 'pool' ? pool.length : k === 'late' ? lateAll : `${n(k)} this week`}</span>)}</div>

          {pool.length > 0 && (
            <div className="mb-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2.5">
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-600"><span>To plan — {canPlan ? 'drag onto a day, or tap “Plan” and then the day' : 'waiting for the agency to pick a day'}</span>{picked && <button className="underline" onClick={() => setPicked(null)}>Cancel</button>}</div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{pool.map((i) => (
                <div key={i.id} className="flex items-center gap-1">
                  <ContentChip item={i} state={contentState(i, today)} picked={picked === i.id} draggable={canPlan} onClick={() => setOpen(i.id)} onDragStart={startDrag(i)} onDragEnd={() => { dragId.current = null; }} />
                  {canPlan && <button className={`shrink-0 rounded-lg border px-2 py-1.5 text-xs ${picked === i.id ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`} onClick={() => setPicked(picked === i.id ? null : i.id)}>Plan</button>}
                </div>))}</div>
            </div>
          )}
          {!items.length && <Empty>{staff ? 'Nothing here yet — “Add content” puts zip files or links on the list for the agency.' : 'Nothing to post yet — Home & Vacation will add the material here.'}</Empty>}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">{days.map((k, idx) => {
            const its = items.filter((i) => i.scheduled_date === k); const isToday = k === today;
            return (
              <div key={k} onDragOver={(e) => { if (canPlan) { e.preventDefault(); if (over !== k) setOver(k); } }} onDragLeave={() => setOver((o) => (o === k ? null : o))} onDrop={(e) => canPlan && drop(e, k)}
                className={`min-h-[6.5rem] rounded-xl border p-2 ${isToday ? 'border-brand-500 bg-brand-50/40' : k < today ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'} ${over === k ? 'ring-2 ring-brand-400' : ''}`}>
                <div className="mb-1.5 flex items-center justify-between gap-1 text-xs"><span className={`font-semibold ${isToday ? 'text-brand-800' : 'text-slate-700'}`}>{DAYS[idx]} {Number(k.slice(8))}{isToday ? ' · today' : ''}</span>
                  {picked && canPlan && <button className="rounded bg-brand-700 px-1.5 py-0.5 text-[10px] font-medium text-white" onClick={() => place(picked, k)}>Place here</button>}</div>
                <div className="space-y-1">{its.map((i) => <ContentChip key={i.id} item={i} state={contentState(i, today)} draggable={canPlan && !i.posted_url} onClick={() => setOpen(i.id)} onDragStart={startDrag(i)} onDragEnd={() => { dragId.current = null; }} />)}</div>
              </div>);
          })}</div>
          {current && <ContentItemModal item={current} agency={agency} staff={staff} asAgency={asAgency} onClose={() => setOpen(null)} />}
          {add && <AddContentModal agency={agency} onClose={() => setAdd(false)} />}
        </Card>
      );
    };

    const ContentItemModal = ({ item, agency, staff, asAgency, onClose }) => {
      const { me, data, save, toast, now, setData, nameOf } = useApp();
      const today = dayKey(now); const state = contentState(item, today);
      const [url, setUrl] = useState(item.posted_url || ''); const [day, setDay] = useState(item.scheduled_date || ''); const [busy, setBusy] = useState(false);
      const who = (id) => { if (!id) return '—'; if (id === me.id) return 'you'; const au = (data.agency_users || []).find((u) => u.id === id); return au ? (au.full_name || au.email) : asAgency ? 'Home & Vacation' : nameOf(id); };
      const badUrl = url.trim() && !/^https?:\/\/\S+$/i.test(url.trim());
      const canPlan = staff || asAgency;
      const setPosted = async (v) => { setBusy(true); const ok = await save('content_items', { posted_url: v }, item.id); setBusy(false); if (ok) toast(v ? 'Marked as posted ✓' : 'Post link removed'); };
      const del = async () => {
        if (!window.confirm(`Delete “${item.title}”?`)) return;
        setBusy(true);
        const { error } = await sbc.from(tbl('content_items')).delete().eq('id', item.id);
        if (error) { setBusy(false); toast(friendlyError(error), 'error'); return; }
        if (item.file_path) await sbc.storage.from(CONTENT_BUCKET).remove([item.file_path]).catch(() => {});
        setData((d) => ({ ...d, content_items: d.content_items.filter((c) => c.id !== item.id) })); setBusy(false); onClose();
      };
      return (
        <Modal title={item.title} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Close</Btn>{staff && <Btn kind="danger" disabled={busy} onClick={del}>Delete</Btn>}</>}>
          <div className="mb-3 flex flex-wrap items-center gap-2"><Badge className={CONTENT_STATE[state][1]}>{CONTENT_STATE[state][0]}</Badge>{item.post_by && <span className="text-xs text-slate-600">Post by {fmtDate(item.post_by)}</span>}{agency && !asAgency && <span className="text-xs text-slate-500">{agency.display_name}</span>}</div>
          {item.notes && <p className="mb-3 whitespace-pre-wrap text-sm text-slate-700">{item.notes}</p>}
          <div className="mb-3 space-y-1.5 text-sm">
            {item.kind === 'file'
              ? <div className="flex flex-wrap items-center gap-2"><Icon name="file" className="h-4 w-4 text-slate-500" /><span className="truncate">{item.file_name}{item.file_size ? ` · ${fmtBytes(item.file_size)}` : ''}</span><Btn kind="ghost" className="!px-2.5 !py-1 text-xs" onClick={() => openSigned(item, toast)}><Icon name="download" className="h-3.5 w-3.5" />Download</Btn></div>
              : <div className="flex items-center gap-2"><Icon name="link" className="h-4 w-4 shrink-0 text-slate-500" />{item.link_url ? <a className="truncate text-brand-700 underline" href={item.link_url} target="_blank" rel="noreferrer">{item.link_url}</a> : <span className="text-slate-500">No link</span>}</div>}
            <div className="text-xs text-slate-500">Added {fmtDateTime(item.created_at)}{!asAgency ? ` by ${who(item.added_by)}` : ''}{item.scheduled_date ? ` · planned for ${fmtDate(item.scheduled_date)} by ${who(item.scheduled_by)}` : ''}{item.posted_at ? ` · posted ${fmtDateTime(item.posted_at)} by ${who(item.posted_by)}` : ''}</div>
          </div>
          {item.posted_url ? (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Posted: <a className="underline" href={item.posted_url} target="_blank" rel="noreferrer">{item.posted_url}</a>
              {canPlan && <button className="ml-2 text-xs underline" disabled={busy} onClick={() => setPosted(null)}>Not posted after all</button>}</div>
          ) : canPlan ? (
            <div className="space-y-3">
              <Field label="Planned day"><div className="flex gap-2"><input type="date" className={inputCls()} value={day} onChange={(e) => setDay(e.target.value)} /><Btn kind="ghost" disabled={busy || (day || null) === (item.scheduled_date || null)} onClick={async () => { setBusy(true); if (await save('content_items', { scheduled_date: day || null }, item.id)) toast(day ? `Planned for ${dayLabel(day)}` : 'Taken off the calendar'); setBusy(false); }}>Save day</Btn></div></Field>
              <Field label="Post link — paste it once the post is up" bad={!!badUrl}><div className="flex gap-2"><input className={inputCls(!!badUrl)} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/p/…" /><Btn kind="ok" disabled={busy || !url.trim() || !!badUrl} onClick={() => setPosted(url.trim())}>Posted ✓</Btn></div></Field>
            </div>
          ) : <p className="text-xs text-slate-500">{item.scheduled_date ? 'Waiting for the post link from the agency.' : 'Waiting for the agency to plan a day.'}</p>}
        </Modal>
      );
    };

    // staff: zip files (one item per file, uploaded to the private bucket) or a link — optionally a listing / project page
    const AddContentModal = ({ agency, onClose }) => {
      const { me, data, save, toast } = useApp();
      const [tab, setTab] = useState('files'); const [files, setFiles] = useState([]); const [postBy, setPostBy] = useState(''); const [notes, setNotes] = useState('');
      const [title, setTitle] = useState(''); const [link, setLink] = useState(''); const [pick, setPick] = useState(null); const [busy, setBusy] = useState(''); const [dragOver, setDragOver] = useState(false);
      const addFiles = (list) => setFiles((f) => [...f, ...Array.from(list || []).filter((x) => !f.some((y) => y.name === x.name && y.size === x.size))]);
      const tooBig = files.filter((f) => f.size > CONTENT_MAX_MB * 1048576);
      const props = [...data.listings.map((l) => ({ id: 'l:' + l.id, label: `${l.reference_code} — ${l.title || l.location}`, url: l.website_url || l.claimed_url || '', listing_id: l.id })),
        ...(data.projects || []).map((p) => ({ id: 'p:' + p.id, label: `${p.reference_code} — ${p.name}`, url: p.website_url || p.claimed_url || '', project_id: p.id }))];
      const choose = (id) => { setPick(id); const p = props.find((x) => x.id === id); if (p) { setTitle(p.label); setLink(p.url); } };
      const badLink = link.trim() && !/^https?:\/\/\S+$/i.test(link.trim());
      const submit = async () => {
        const common = { agency_id: agency.id, post_by: postBy || null, notes: notes.trim() || null, added_by: me.id };
        if (tab === 'link') {
          if (!title.trim()) { toast('Give it a title', 'error'); return; }
          if (badLink) { toast('The link must start with http:// or https://', 'error'); return; }
          const p = props.find((x) => x.id === pick) || {};
          setBusy('Saving…');
          const row = await save('content_items', { ...common, kind: 'link', title: title.trim(), link_url: link.trim() || null, listing_id: p.listing_id || null, project_id: p.project_id || null });
          setBusy(''); if (row) { toast('Added'); onClose(); } return;
        }
        if (!files.length) { toast('Choose the zip files first', 'error'); return; }
        if (tooBig.length) { toast(`Over ${CONTENT_MAX_MB} MB, cannot be uploaded: ${tooBig.map((f) => f.name).join(', ')}`, 'error'); return; }
        let done = 0;
        for (const f of files) {
          setBusy(`Uploading ${done + 1} of ${files.length} — ${f.name}`);
          const id = uuid4(); const path = `${agency.id}/${id}/${f.name.replace(/[^\w.\-()\[\] ]+/g, '_').slice(-100)}`;
          const { error } = await sbc.storage.from(CONTENT_BUCKET).upload(path, f, { upsert: false, contentType: f.type || 'application/octet-stream' });
          if (error) { toast(`${f.name}: ${friendlyError(error)}`, 'error'); continue; }
          const row = await save('content_items', { ...common, id, kind: 'file', title: f.name.replace(/\.[^.]+$/, ''), file_path: path, file_name: f.name, file_size: f.size });
          if (!row) { await sbc.storage.from(CONTENT_BUCKET).remove([path]).catch(() => {}); continue; }
          done++;
        }
        setBusy(''); if (done) { toast(`${done} file${done === 1 ? '' : 's'} added`); onClose(); }
      };
      return (
        <Modal title={`Add content — ${agency.display_name}`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose} disabled={!!busy}>Cancel</Btn><Btn onClick={submit} disabled={!!busy}>{busy || (tab === 'files' ? `Upload${files.length ? ` ${files.length}` : ''}` : 'Add link')}</Btn></>}>
          <Tabs value={tab} onChange={setTab} tabs={[['files', 'Zip files'], ['link', 'Link']]} />
          {tab === 'files' ? (
            <div className="space-y-3">
              <label onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center text-sm ${dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50 text-slate-600'}`}>
                <Icon name="upload" className="mb-1 h-6 w-6 text-slate-400" />Drop the zip files here, or tap to choose<span className="mt-1 text-xs text-slate-500">One calendar item per file · up to {CONTENT_MAX_MB} MB each</span>
                <input type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              </label>
              {files.length > 0 && <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">{files.map((f) => <li key={f.name + f.size} className={`flex items-center justify-between gap-2 px-3 py-1.5 ${f.size > CONTENT_MAX_MB * 1048576 ? 'text-rose-700' : ''}`}><span className="truncate">{f.name}</span><span className="flex items-center gap-2 whitespace-nowrap text-xs text-slate-500">{fmtBytes(f.size)}<button className="text-slate-400 hover:text-rose-600" onClick={() => setFiles((x) => x.filter((y) => y !== f))} aria-label="Remove"><Icon name="x" className="h-4 w-4" /></button></span></li>)}</ul>}
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Property (optional — fills the title and link)"><Select value={pick} onChange={choose} options={props.map((p) => [p.id, p.label])} placeholder="Pick a listing or project…" /></Field>
              <Field label="Title" bad={!title.trim()}><input className={inputCls(!title.trim())} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sea-view apartment HD-A-2510-S" /></Field>
              <Field label="Link" bad={!!badLink}><input className={inputCls(!!badLink)} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://home-vacation.com/…" /></Field>
            </div>
          )}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Post by (optional deadline)"><input type="date" className={inputCls()} value={postBy} onChange={(e) => setPostBy(e.target.value)} /></Field>
            <Field label="Notes for the agency"><input className={inputCls()} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Caption ideas, what to highlight…" /></Field>
          </div>
        </Modal>
      );
    };

    // Settings → Agencies (full) and a banner on the Agencies page (compact: only while requests are waiting)
    const AgencyAccountsCard = ({ compact }) => {
      const { me, data, save, toast } = useApp();
      const users = data.agency_users || []; const pending = users.filter((u) => u.status === 'pending'); const rest = users.filter((u) => u.status === 'active' || u.status === 'disabled');
      const [pickA, setPickA] = useState({});
      const agName = (id) => { const a = data.agencies.find((x) => x.id === id); return a ? a.display_name : '—'; };
      const chosen = (u) => (pickA[u.id] === undefined ? u.agency_id : pickA[u.id]);
      const decide = async (u, status, agency_id) => {
        if (status === 'active' && !agency_id) { toast('Pick the agency first', 'error'); return; }
        if (await save('agency_users', { status, agency_id: agency_id || u.agency_id, decided_by: me.id, decided_at: new Date().toISOString() }, u.id)) toast(status === 'active' ? `${u.full_name || u.email} can sign in now` : 'Saved');
      };
      if (compact && !pending.length) return null;
      return (
        <Card data-tour="agency-accounts" className="p-4">
          <h3 className="mb-1 text-sm font-semibold text-brand-800">Agency accounts{pending.length ? ` — ${pending.length} waiting` : ''}</h3>
          <p className="mb-3 text-xs text-slate-500">Agencies request an account from the sign-in screen (“Marketing agency? Request an account”). An approved account signs in there and sees only its own content calendar.</p>
          {pending.length > 0 && <div className="mb-3 space-y-2">{pending.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm">
              <div className="min-w-0 flex-1"><div className="font-medium">{u.full_name || u.email}</div><div className="truncate text-xs text-slate-600">{u.email} · requested {fmtDateTime(u.created_at)}</div></div>
              <div className="w-52"><Select value={chosen(u)} onChange={(v) => setPickA((p) => ({ ...p, [u.id]: v }))} options={data.agencies.filter((a) => a.is_active).map((a) => [a.id, a.display_name])} placeholder="Which agency?" /></div>
              <Btn kind="ok" className="!py-1.5" onClick={() => decide(u, 'active', chosen(u))}>Approve</Btn>
              <Btn kind="danger" className="!py-1.5" onClick={() => decide(u, 'rejected')}>Reject</Btn>
            </div>))}</div>}
          {!compact && (rest.length ? <div className="scroll-x"><table className="w-full text-sm"><thead className="text-left text-xs text-slate-500"><tr>{['Name', 'E-mail', 'Agency', 'Status', ''].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}</tr></thead>
            <tbody>{rest.map((u) => <tr key={u.id} className="border-t border-slate-100"><td className="px-2 py-2">{u.full_name || '—'}</td><td className="px-2 py-2 text-xs">{u.email}</td><td className="px-2 py-2">{agName(u.agency_id)}</td><td className="px-2 py-2"><Badge className={u.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}>{titleCase(u.status)}</Badge></td>
              <td className="px-2 py-2 text-right"><Btn kind="ghost" className="!px-2 !py-1 text-xs" onClick={() => decide(u, u.status === 'active' ? 'disabled' : 'active', u.agency_id)}>{u.status === 'active' ? 'Disable' : 'Enable'}</Btn></td></tr>)}</tbody></table></div>
            : !pending.length && <Empty>No agency accounts yet.</Empty>)}
        </Card>
      );
    };

    // the sign-in screen's "Marketing agency? Request an account"
    const AgencyApply = ({ onBack }) => {
      const [agencies, setAgencies] = useState([]); const [f, setF] = useState({ agency_id: null, full_name: '', email: '', password: '', confirm: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
      const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
      useEffect(() => { sbc.rpc('ops_agency_list').then(({ data }) => setAgencies(data || [])); }, []);
      const submit = async (e) => {
        e.preventDefault(); setErr('');
        if (!f.agency_id) { setErr('Pick your agency.'); return; }
        if (f.password.length < 8) { setErr('Use a password of at least 8 characters.'); return; }
        if (f.password !== f.confirm) { setErr('The two passwords differ.'); return; }
        setBusy(true);
        const { data, error } = await sbc.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { hv_kind: 'agency', agency_id: f.agency_id, full_name: f.full_name.trim() } } });
        setBusy(false);
        if (error) { setErr(error.message); return; }
        if (!data || !data.session) setSent(true);     // otherwise the session is live and the app shows the "waiting for approval" screen
      };
      return (
        <Shell>
          {sent ? <div className="text-sm text-slate-700"><p className="font-medium">Request sent.</p><p className="mt-1">Home & Vacation will approve your account; after that, sign in here with your e-mail and password.</p><Btn className="mt-4 w-full" kind="ghost" onClick={onBack}>Back to sign in</Btn></div> : (
            <form onSubmit={submit} className="space-y-3">
              <p className="text-sm text-slate-600">For the marketing agencies working with Home & Vacation. The account opens once Home & Vacation approves it.</p>
              <Field label="Agency" bad={!f.agency_id}><Select value={f.agency_id} onChange={(v) => set('agency_id', v)} options={agencies.map((a) => [a.id, a.display_name])} placeholder="Pick your agency…" /></Field>
              <Field label="Your name"><input className={inputCls()} autoComplete="name" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} required /></Field>
              <Field label="E-mail"><input type="email" autoComplete="email" className={inputCls()} value={f.email} onChange={(e) => set('email', e.target.value)} required /></Field>
              <Field label="Password (8+ characters)"><input type="password" autoComplete="new-password" className={inputCls()} value={f.password} onChange={(e) => set('password', e.target.value)} required /></Field>
              <Field label="Repeat the password"><input type="password" autoComplete="new-password" className={inputCls()} value={f.confirm} onChange={(e) => set('confirm', e.target.value)} required /></Field>
              {err && <p className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{err}</p>}
              <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand-700 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50">{busy ? 'Sending…' : 'Request an account'}</button>
              <button type="button" className="w-full text-center text-xs text-slate-500 underline" onClick={onBack}>Back to sign in</button>
            </form>)}
        </Shell>
      );
    };

    // an agency login that is not (yet) approved
    const AgencyWaiting = ({ user }) => (
      <Shell>
        <div className="text-sm text-slate-700">
          {user.status === 'pending' ? <><p className="font-medium">Thanks{user.full_name ? `, ${user.full_name}` : ''} — your request is in.</p><p className="mt-1">Home & Vacation will approve your agency account; after that, sign in again and your content calendar opens.</p></>
            : <p>This agency account is {user.status}. Ask your Home & Vacation contact if that is unexpected.</p>}
          <Btn className="mt-4 w-full" kind="ghost" onClick={() => sbc.auth.signOut()}>Sign out</Btn>
        </div>
      </Shell>
    );

    // all an approved agency login sees: its own calendar (its agency row + its items, by RLS)
    const AgencyPortal = ({ user }) => {
      const [data, setData] = useState({ agencies: [], content_items: [], agency_users: [user], profiles: [], listings: [], projects: [] });
      const [toasts, setToasts] = useState([]); const [now, setNow] = useState(Date.now()); const [ready, setReady] = useState(false);
      const toast = useCallback((text, kind = 'ok') => { const id = Math.random(); setToasts((t) => [...t, { id, text, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000); }, []);
      const load = useCallback(async () => {
        const [a, c] = await Promise.all([sbc.from(tbl('agencies')).select('*').eq('id', user.agency_id), sbc.from(tbl('content_items')).select('*').eq('agency_id', user.agency_id).order('created_at', { ascending: false })]);
        setData((d) => ({ ...d, agencies: a.data || d.agencies, content_items: c.data || d.content_items })); setReady(true); setNow(Date.now());
      }, [user.agency_id]);
      useEffect(() => { load(); const t = setInterval(load, 180000); const onVis = () => { if (!document.hidden) load(); }; document.addEventListener('visibilitychange', onVis); return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); }; }, [load]);
      const save = useCallback(async (table, values, id) => {
        const q = id ? sbc.from(tbl(table)).update(values).eq('id', id) : sbc.from(tbl(table)).insert(values);
        const { data: row, error } = await q.select().single();
        if (error) { toast(friendlyError(error), 'error'); return null; }
        setData((d) => ({ ...d, [table]: d[table].some((r) => r.id === row.id) ? d[table].map((r) => (r.id === row.id ? row : r)) : [row, ...d[table]] }));
        return row;
      }, [toast]);
      const agency = data.agencies[0];
      const me = { id: user.id, full_name: user.full_name, email: user.email, role: 'agency' };
      const ctx = { me, data, setData, cfg: {}, now, toast, go: () => {}, save, saveSetting: async () => null, reloadTable: load, reloadWhere: load, workerCall: async () => null, nameOf: () => 'Home & Vacation' };
      return (
        <AppCtx.Provider value={ctx}>
          <div className="min-h-screen bg-slate-50">
            <header className="bg-brand-800 text-white">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2.5 md:px-6">
                <div className="flex min-w-0 items-center gap-2"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white p-1"><img src={LOGO_MARK} alt="Home Vacation" className="h-full w-full object-contain" /></div>
                  <div className="min-w-0"><div className="truncate text-sm font-bold">{agency ? agency.display_name : 'Agency portal'}</div><div className="truncate text-xs text-brand-200">Home & Vacation · content calendar</div></div></div>
                <div className="flex items-center gap-2 text-xs"><span className="hidden truncate sm:inline">{user.full_name || user.email}</span><button onClick={() => sbc.auth.signOut()} className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 font-medium hover:bg-white/20"><Icon name="logout" className="h-4 w-4" />Sign out</button></div>
              </div>
            </header>
            <main className="mx-auto max-w-6xl px-3 py-4 md:px-6">
              {!ready ? <div className="p-6 text-center text-sm text-slate-500">Loading…</div> : <ContentCalendar agency={agency} items={data.content_items} asAgency />}
              <p className="mt-4 text-center text-xs text-slate-400">HV Ops {APP_VERSION}</p>
            </main>
          </div>
          <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3">{toasts.map((t) => <div key={t.id} className={`pointer-events-auto max-w-md rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg ${t.kind === 'error' ? 'bg-rose-600' : 'bg-slate-900'}`}>{t.text}</div>)}</div>
        </AppCtx.Provider>
      );
    };
