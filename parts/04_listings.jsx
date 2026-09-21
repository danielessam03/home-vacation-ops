
    // =========================================================================================
    // LISTINGS
    // =========================================================================================
    const ReasonModal = ({ title, label, confirmLabel, kind = 'primary', onClose, onConfirm }) => {
      const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
      return (
        <Modal title={title} onClose={onClose} footer={<>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind={kind} disabled={!reason.trim() || busy} onClick={async () => { setBusy(true); await onConfirm(reason.trim()); setBusy(false); }}>{confirmLabel}</Btn></>}>
          <Field label={label} bad={!reason.trim()}><textarea rows={3} className={inputCls(!reason.trim())} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
        </Modal>
      );
    };

    const FORM_GROUPS = [
      ['Basics', ['title', 'location', 'property_type', 'deal_type', 'date_received']],
      ['Specs', ['area_sqm', 'building_levels', 'floor', 'bedrooms', 'bathrooms', 'balconies', 'furnished', 'view_type']],
      ['Media', ['media_uploaded', 'media_has_logo', 'media_edited', 'cover_photo_belongs']],
      ['Commercial', ['price', 'currency', 'is_exclusive']],
      ['Marketing', ['facilities', 'selling_points', 'buyer_persona_nationality', 'buyer_persona_age_range', 'buyer_persona_gender']],
      ['Owner & source', ['owner_name', 'owner_phone', 'source_type', 'source_name', 'source_contact', 'assigned_to']],
    ];
    const NUM_FIELDS = ['area_sqm', 'building_levels', 'floor', 'bedrooms', 'bathrooms', 'balconies', 'media_images_count', 'media_videos_count', 'price'];
    const BOOL_FIELDS = ['furnished', 'is_exclusive', 'cover_photo_belongs', 'media_uploaded', 'media_has_logo', 'media_edited'];
    const ALWAYS_REQUIRED = ['location', 'property_type', 'deal_type', 'date_received', 'source_type', 'source_name'];   // NOT NULL in the database

    const FacilitiesInput = ({ value, onChange, options, bad }) => {
      const [extra, setExtra] = useState('');
      const all = [...new Set([...(options || []), ...(value || [])])];
      const toggle = (o) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
      const add = () => { const v = extra.trim(); if (v && !value.includes(v)) onChange([...value, v]); setExtra(''); };
      return (
        <div className={`rounded-lg border p-2 ${bad ? 'border-rose-500 ring-1 ring-rose-300' : 'border-slate-300'}`}>
          <div className="flex flex-wrap gap-1.5">
            {all.map((o) => <button type="button" key={o} onClick={() => toggle(o)} className={`rounded-full border px-2.5 py-1 text-xs ${value.includes(o) ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{o}</button>)}
          </div>
          <div className="mt-2 flex gap-2">
            <input className={inputCls()} placeholder="Add another facility…" value={extra} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
            <Btn kind="ghost" onClick={add}>Add</Btn>
          </div>
        </div>
      );
    };

    const ListingForm = ({ listing, prefill, onClose, onSaved }) => {      // prefill: a listing born from a photography request
      const { me, cfg, data, save, reloadWhere, toast } = useApp();
      const isEdit = !!listing;
      const [f, setF] = useState(() => {
        const base = { facilities: [], currency: null, date_received: new Date().toISOString(), source_type: null, media_images_count: '', media_videos_count: '' };
        const src = listing ? { ...listing } : { ...base, ...(prefill || {}) };
        NUM_FIELDS.forEach((k) => { src[k] = src[k] == null || (!listing && src[k] === 0) ? '' : String(src[k]); });
        if (listing && listing.media_images_count === 0) src.media_images_count = '0';
        if (listing && listing.media_videos_count === 0) src.media_videos_count = '0';
        src.facilities = src.facilities || [];
        return src;
      });
      const [busy, setBusy] = useState(false);
      const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
      const normalized = useMemo(() => { const o = { ...f }; NUM_FIELDS.forEach((k) => { o[k] = f[k] === '' || f[k] == null ? null : Number(f[k]); }); return o; }, [f]);
      const comp = calcCompleteness(normalized, cfg.required_fields);
      const hardMissing = ALWAYS_REQUIRED.filter((k) => !normalized[k] || (typeof normalized[k] === 'string' && !normalized[k].trim()));
      const bad = (k) => comp.missing.includes(k) || hardMissing.includes(k);
      const staff = data.profiles.filter((p) => p.is_active);
      const dup = !isEdit && f.title && data.listings.find((l) => l.title && l.title.trim().toLowerCase() === f.title.trim().toLowerCase());

      const control = (k) => {
        if (k === 'location') return <Select bad={bad(k)} value={f[k]} onChange={(v) => set(k, v)} options={Object.keys(cfg.location_codes || {}).sort()} disabled={isEdit} />;
        if (k === 'property_type') return <Select bad={bad(k)} value={f[k]} onChange={(v) => set(k, v)} options={Object.keys(cfg.unit_type_codes || {}).sort()} disabled={isEdit} />;
        if (k === 'deal_type') return <Select bad={bad(k)} value={f[k]} onChange={(v) => set(k, v)} options={[['sale', 'Sale'], ['rent', 'Rent']]} disabled={isEdit} />;
        if (k === 'currency') return <Select bad={bad(k)} value={f[k]} onChange={(v) => set(k, v)} options={cfg.currencies || ['EUR', 'USD', 'EGP']} />;
        if (k === 'view_type') return <Select bad={bad(k)} value={f[k]} onChange={(v) => set(k, v)} options={cfg.view_types || []} />;
        if (k === 'buyer_persona_age_range') return <Select bad={bad(k)} value={f[k]} onChange={(v) => set(k, v)} options={cfg.age_ranges || []} />;
        if (k === 'buyer_persona_gender') return <Select bad={bad(k)} value={f[k]} onChange={(v) => set(k, v)} options={['Any', 'Male', 'Female', 'Couples', 'Families']} />;
        if (k === 'source_type') return <Select bad={bad(k)} value={f[k]} onChange={(v) => set(k, v)} options={SOURCE_TYPES.map((s) => [s, titleCase(s)])} />;
        if (k === 'assigned_to') return <Select value={f[k]} onChange={(v) => set(k, v)} options={staff.map((p) => [p.id, p.full_name || p.email])} placeholder="Default uploader" />;
        if (k === 'date_received') return <input type="datetime-local" className={inputCls(bad(k))} value={toLocalInput(f[k])} disabled={isEdit && me.role !== 'admin'} onChange={(e) => set(k, fromLocalInput(e.target.value))} />;
        if (k === 'facilities') return <FacilitiesInput bad={bad(k)} value={f.facilities} onChange={(v) => set(k, v)} options={cfg.facilities} />;
        if (k === 'selling_points') return <textarea rows={3} className={inputCls(bad(k))} value={f[k] || ''} onChange={(e) => set(k, e.target.value)} />;
        if (k === 'media_uploaded' && !isMgr(me)) return <div className={`rounded-lg border px-3 py-2 text-sm ${f[k] === true ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>{f[k] === true ? 'Yes — approved by the manager' : f[k] === false ? 'Not ready — the manager asked for changes' : 'Waiting for the manager to review the photos'}</div>;
        if (BOOL_FIELDS.includes(k)) return <TriState bad={bad(k)} value={f[k]} onChange={(v) => set(k, v)} />;
        if (NUM_FIELDS.includes(k)) return <input type="number" inputMode="decimal" min="0" className={inputCls(bad(k))} value={f[k]} onChange={(e) => set(k, e.target.value)} />;
        return <input className={inputCls(bad(k))} value={f[k] || ''} onChange={(e) => set(k, e.target.value)} />;
      };

      const submit = async () => {
        if (hardMissing.length) { toast(`Needed to save: ${hardMissing.map((k) => FIELD_LABEL[k]).join(', ')}`, 'error'); return; }
        setBusy(true);
        const payload = {};
        FORM_GROUPS.flatMap((g) => g[1]).forEach((k) => { payload[k] = normalized[k] === '' ? null : normalized[k]; });
        if (!isMgr(me)) delete payload.media_uploaded;
        if (!isEdit && prefill && prefill.photo_request_id) { payload.photo_request_id = prefill.photo_request_id; if (prefill.photos_approved) payload.media_uploaded = true; }   // the manager's approval travels with it
        if (isEdit) { ['location', 'property_type', 'deal_type'].forEach((k) => delete payload[k]); if (me.role !== 'admin') delete payload.date_received; }
        else { payload.entered_by = me.id; payload.assigned_to = payload.assigned_to || cfg.default_uploader || me.id; }
        const row = await save('listings', payload, isEdit ? listing.id : null);
        setBusy(false);
        if (!row) return;
        if (!isEdit) await reloadWhere('listing_channels', 'listing_id', row.id);   // created by the database trigger
        toast(isEdit ? 'Listing saved' : `Created ${row.reference_code}`);
        onSaved(row);
      };

      return (
        <Modal wide title={isEdit ? `Edit ${listing.reference_code}` : prefill ? 'New listing — from the photography list' : 'New listing'} onClose={onClose} footer={<>
          <span className="mr-auto self-center text-xs text-slate-500">{comp.missing.length ? 'You can save a draft now — it stays red until complete.' : 'All required fields filled.'}</span>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={submit} disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save' : 'Save & generate code'}</Btn></>}>
          <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-3 border-b border-slate-200 bg-white px-4 py-3">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-800">Completeness {comp.pct}%</span>
              {comp.missing.length > 0 && <Badge className="bg-rose-600 text-white">{comp.missing.length} missing</Badge>}
            </div>
            <Meter value={comp.pct} />
          </div>
          {dup && <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">Possible duplicate: {dup.reference_code} has the same title.</div>}
          {isEdit && <p className="mb-3 text-xs text-slate-500">Location, type and sale/rent are part of the reference code and cannot change after creation.</p>}
          {FORM_GROUPS.map(([g, keys]) => (
            <fieldset key={g} className="mb-5">
              <legend className="mb-2 text-sm font-semibold text-brand-800">{g}</legend>
              {g === 'Media' && <p className="mb-2 text-xs text-slate-500">Photos and videos stay on the company intranet — nothing is uploaded here. The manager reviews them there and marks them ready.</p>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {keys.map((k) => <Field key={k} label={FIELD_LABEL[k]} bad={bad(k)} className={['facilities', 'selling_points'].includes(k) ? 'col-span-2 sm:col-span-3' : ['title', 'source_name', 'owner_name', 'date_received'].includes(k) ? 'col-span-2' : ''}>{control(k)}</Field>)}
              </div>
            </fieldset>
          ))}
        </Modal>
      );
    };

    const ListingsPage = () => {
      const { me, data, cfg, now, go, nameOf } = useApp();
      const [q, setQ] = useState(''); const [flt, setFlt] = useState({ status: null, sla: null, location: null, source: null, by: null, comp: null, from: '', to: '' });
      const [showFilters, setShowFilters] = useState(false); const [form, setForm] = useState(false); const [imp, setImp] = useState(false);
      const [view, setView] = useState('work');      // work | published | closed
      const setFilter = (k, v) => setFlt((p) => ({ ...p, [k]: v }));
      const rows = useMemo(() => {
        const s = q.trim().toLowerCase();
        return data.listings.map((l) => ({ l, s: slaOf(l, cfg.sla_hours, now) })).filter(({ l, s: sl }) => {
          if (bucketOf(l.status) !== view) return false;
          if (flt.status && l.status !== flt.status) return false;
          if (flt.sla && (sl.state !== flt.sla || sl.verified)) return false;
          if (flt.location && l.location !== flt.location) return false;
          if (flt.source && l.source_type !== flt.source) return false;
          if (flt.by && l.entered_by !== flt.by) return false;
          if (flt.comp === 'incomplete' && l.completeness_pct >= 100) return false;
          if (flt.comp === 'complete' && l.completeness_pct < 100) return false;
          if (flt.from && new Date(l.date_received) < new Date(flt.from)) return false;
          if (flt.to && new Date(l.date_received) >= addDays(new Date(flt.to), 1)) return false;
          if (s && !(`${l.reference_code} ${l.title || ''} ${l.source_name || ''} ${l.owner_name || ''} ${l.owner_phone || ''}`.toLowerCase().includes(s))) return false;
          return true;
        }).sort((a, b) => view === 'published' ? new Date(publishedAt(b.l) || 0) - new Date(publishedAt(a.l) || 0) : new Date(b.l.date_received) - new Date(a.l.date_received));
      }, [data.listings, q, flt, view, cfg.sla_hours, now]);
      const activeFilters = Object.values(flt).filter(Boolean).length;
      const exportCsv = () => downloadCSV(`hv-listings-${ymd(new Date())}.csv`,
        ['reference_code', 'title', 'owner_name', 'owner_phone', 'status', 'location', 'property_type', 'deal_type', 'price', 'currency', 'completeness_pct', 'missing_fields', 'date_received', 'date_published_claimed', 'date_published_verified', 'hours', 'sla_state', 'source_type', 'source_name', 'entered_by', 'website_url'],
        rows.map(({ l, s }) => [l.reference_code, l.title, l.owner_name, l.owner_phone, l.status, l.location, l.property_type, l.deal_type, l.price, l.currency, l.completeness_pct, l.missing_fields, l.date_received, l.date_published_claimed, l.date_published_verified, r1(s.hours), s.state, l.source_type, l.source_name, nameOf(l.entered_by), l.website_url]));

      return (
        <div>
          <PageHeader title="Listings" sub={`${rows.length} shown`}>
            <Btn kind="ghost" onClick={exportCsv}>Export CSV</Btn>
            <Btn kind="ghost" onClick={() => setImp(true)}><Icon name="upload" className="h-4 w-4" />Import CSV</Btn>
            <Btn onClick={() => setForm(true)}><Icon name="plus" className="h-4 w-4" />New listing</Btn>
          </PageHeader>
          <Tabs value={view} onChange={(v) => { setView(v); setFilter('status', null); }} tabs={bucketTabs(data.listings)} />
          <div className="no-print mb-3 flex gap-2">
            <input className={inputCls()} placeholder="Search ref code, owner, title or source…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Btn kind={activeFilters ? 'soft' : 'ghost'} onClick={() => setShowFilters(!showFilters)}>Filters{activeFilters ? ` (${activeFilters})` : ''}</Btn>
          </div>
          {showFilters && (
            <Card className="no-print mb-3 grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
              <Field label="Status"><Select value={flt.status} onChange={(v) => setFilter('status', v)} options={BUCKETS[view].map((k) => [k, LISTING_STATUS[k][0]])} placeholder="All in this tab" /></Field>
              <Field label="SLA state (open)"><Select value={flt.sla} onChange={(v) => setFilter('sla', v)} options={[['green', 'On track'], ['yellow', 'At risk'], ['red', 'Breached']]} placeholder="All" /></Field>
              <Field label="Location"><Select value={flt.location} onChange={(v) => setFilter('location', v)} options={Object.keys(cfg.location_codes || {}).sort()} placeholder="All" /></Field>
              <Field label="Source"><Select value={flt.source} onChange={(v) => setFilter('source', v)} options={SOURCE_TYPES.map((s) => [s, titleCase(s)])} placeholder="All" /></Field>
              <Field label="Entered by"><Select value={flt.by} onChange={(v) => setFilter('by', v)} options={data.profiles.map((p) => [p.id, p.full_name || p.email])} placeholder="Anyone" /></Field>
              <Field label="Completeness"><Select value={flt.comp} onChange={(v) => setFilter('comp', v)} options={[['incomplete', 'Incomplete'], ['complete', '100%']]} placeholder="All" /></Field>
              <Field label="Received from"><input type="date" className={inputCls()} value={flt.from} onChange={(e) => setFilter('from', e.target.value)} /></Field>
              <Field label="Received to"><input type="date" className={inputCls()} value={flt.to} onChange={(e) => setFilter('to', e.target.value)} /></Field>
            </Card>
          )}
          {!rows.length ? <Empty>{view === 'published' ? 'Nothing published yet. A listing moves here as soon as it is marked as published.' : view === 'closed' ? 'No rejected or archived listings.' : 'Nothing in progress. Create a listing with “New listing”.'}</Empty> : (
            <>
              {/* phone: cards */}
              <div className="space-y-2 md:hidden">
                {rows.map(({ l, s }) => (
                  <Card key={l.id} className={`cursor-pointer border-l-4 p-3 ${SLA_STYLE[s.verified ? 'none' : s.state].bar}`} onClick={() => go('listing', l.id)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="font-mono text-sm font-bold text-slate-900">{l.reference_code}</div><div className="truncate text-sm text-slate-600">{l.title || `${l.property_type} · ${l.location}`}</div></div>
                      <SlaChip listing={l} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={l.status} />
                      {l.completeness_pct < 100 && <Badge className="bg-rose-600 text-white">{l.completeness_pct}% · {(l.missing_fields || []).length} missing</Badge>}
                      {s.claimedNotFound && <Badge className="bg-rose-600 text-white">Claimed, not found</Badge>}
                      <span className="ml-auto text-xs text-slate-500">{view === 'published' ? `Published ${fmtDate(publishedAt(l))}` : fmtDate(l.date_received)}</span>
                    </div>
                    {view === 'published' && <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-600"><span>Uploaded by <b className="text-slate-900">{nameOf(l.published_claimed_by || l.assigned_to)}</b></span>{s.verified ? <span className={s.onTime ? 'text-emerald-700' : 'text-rose-700'}>live in {fmtHours(s.hours)}{s.onTime ? '' : ' — late'}</span> : <span className="text-amber-700">waiting for website check</span>}{l.website_url && <a className="text-brand-700 underline" href={l.website_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Open on website ↗</a>}</div>}
                    <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-slate-600"><span>Owner: <b className="text-slate-900">{l.owner_name || '—'}</b></span><span>Entered by <b className="text-slate-900">{nameOf(l.entered_by)}</b></span></div>
                  </Card>
                ))}
              </div>
              {/* desktop: table */}
              <Card className="scroll-x hidden md:block">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr>{['Ref code', 'Title', 'Owner', 'Status', 'SLA', 'Complete', 'Price', 'Source', view === 'published' ? 'Uploaded by' : 'Entered by', view === 'published' ? 'Published' : 'Received'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.map(({ l, s }) => (
                      <tr key={l.id} onClick={() => go('listing', l.id)} className={`cursor-pointer border-l-4 border-t border-t-slate-100 hover:bg-slate-50 ${SLA_STYLE[s.verified ? 'none' : s.state].bar}`}>
                        <td className="px-3 py-2 font-mono font-semibold">{l.reference_code}</td>
                        <td className="max-w-[16rem] truncate px-3 py-2">{l.title || `${l.property_type} · ${l.location}`}</td>
                        <td className="px-3 py-2"><div className="max-w-[10rem] truncate font-medium">{l.owner_name || '—'}</div>{l.owner_phone && <div className="text-xs text-slate-500">{l.owner_phone}</div>}</td>
                        <td className="px-3 py-2"><StatusBadge status={l.status} />{s.claimedNotFound && <Badge className="ml-1 bg-rose-600 text-white">Not found</Badge>}</td>
                        <td className="px-3 py-2"><SlaChip listing={l} /></td>
                        <td className="px-3 py-2">{l.completeness_pct < 100 ? <Badge className="bg-rose-600 text-white">{l.completeness_pct}%</Badge> : <Badge className="bg-emerald-100 text-emerald-800">100%</Badge>}</td>
                        <td className="num whitespace-nowrap px-3 py-2">{money(l.price, l.currency)}</td>
                        <td className="px-3 py-2"><div className="max-w-[10rem] truncate">{l.source_name}</div><div className="text-xs text-slate-500">{titleCase(l.source_type)}</div></td>
                        <td className="px-3 py-2">{view === 'published' ? nameOf(l.published_claimed_by || l.assigned_to) : nameOf(l.entered_by)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{view === 'published' ? <>{fmtDateTime(publishedAt(l))}{l.website_url && <a className="ml-2 text-brand-700 underline" href={l.website_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>site ↗</a>}</> : fmtDateTime(l.date_received)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
          {form && <ListingForm onClose={() => setForm(false)} onSaved={(row) => { setForm(false); go('listing', row.id); }} />}
          {imp && <CsvImport onClose={() => setImp(false)} />}
        </div>
      );
    };

    const ListingDetail = ({ id }) => {
      const { me, data, cfg, now, go, save, nameOf, toast } = useApp();
      const l = data.listings.find((x) => x.id === id);
      const [edit, setEdit] = useState(false); const [reason, setReason] = useState(null); const [audit, setAudit] = useState(null); const [copied, setCopied] = useState(false); const [ai, setAi] = useState(false);
      const channels = data.listing_channels.filter((c) => c.listing_id === id);
      const mgr = isMgr(me);
      useEffect(() => {
        if (!mgr || !l) return;
        const ids = [id, ...channels.map((c) => c.id)];
        sbc.from(tbl('audit_log')).select('*').in('record_id', ids).order('changed_at', { ascending: false }).limit(300).then(({ data: rows }) => setAudit(rows || []));
      }, [id, l && l.updated_at, channels.length]);
      if (!l) return <Empty>Listing not found.</Empty>;
      const s = slaOf(l, cfg.sla_hours, now);
      const canEdit = mgr || l.entered_by === me.id || l.assigned_to === me.id;
      const setStatus = (status, extra = {}) => save('listings', { status, ...extra }, l.id).then((row) => { if (row) toast(`Status: ${LISTING_STATUS[status][0]}`); return row; });
      const copy = async () => { try { await navigator.clipboard.writeText(l.reference_code); } catch (e) { const t = document.createElement('textarea'); t.value = l.reference_code; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); } setCopied(true); setTimeout(() => setCopied(false), 1500); };
      const missingChannels = Object.keys(cfg.portal_labels || {}).filter((c) => !channels.some((x) => x.channel === c));
      const timeline = [
        ['Info received — clock starts', l.date_received], ['Record created in HV Ops', l.created_at],
        l.paused_seconds > 0 || s.onHold ? [`On hold total ${fmtHours(((l.paused_seconds || 0) + (s.onHold && l.hold_started_at ? (now - new Date(l.hold_started_at)) / 1000 : 0)) / 3600)} (excluded)`, l.hold_started_at] : null,
        ['Marked as published by staff', l.date_published_claimed], ['Verified live on website — clock stops', l.date_published_verified],
      ].filter(Boolean);

      return (
        <div>
          <button className="no-print mb-3 inline-flex items-center gap-1 text-sm text-brand-700" onClick={() => go('listings')}><Icon name="back" className="h-4 w-4" />All listings</button>
          <Card className={`mb-4 border-l-4 p-4 ${SLA_STYLE[s.verified ? 'none' : s.state].bar}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-2xl font-black tracking-wide text-slate-900">{l.reference_code}</span>
                  <Btn kind="soft" className="!px-2.5 !py-1.5" onClick={copy}><Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />{copied ? 'Copied' : 'Copy'}</Btn>
                  <Btn kind="soft" className="!px-2.5 !py-1.5" onClick={() => setAi(true)}><Icon name="spark" className="h-4 w-4" />Export for AI</Btn>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">Paste this exact code into the WordPress “File Ref” field. It is how the website is matched.</p>
                <h2 className="mt-2 text-base font-semibold text-slate-800">{l.title || `${l.property_type} in ${l.location}`}</h2>
                <div className="mt-1 text-sm text-slate-700">Owner: <b>{l.owner_name || '—'}</b>{l.owner_phone ? <> · <a className="text-brand-700 underline" href={`tel:${l.owner_phone}`}>{l.owner_phone}</a></> : null}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500"><span>Entered by <b className="text-slate-800">{nameOf(l.entered_by)}</b> · {fmtDateTime(l.created_at)}</span>{l.published_claimed_by && <span>Uploaded to website by <b className="text-slate-800">{nameOf(l.published_claimed_by)}</b> · {fmtDateTime(l.date_published_claimed)}</span>}{l.media_approved_by && <span>Photos approved by <b className="text-slate-800">{nameOf(l.media_approved_by)}</b> · {fmtDateTime(l.media_approved_at)}</span>}</div>
              </div>
              <div className="flex flex-col items-end gap-1.5"><StatusBadge status={l.status} /><SlaChip listing={l} /></div>
            </div>
            {s.claimedNotFound && <div className="mt-3 rounded-lg bg-rose-600 p-2.5 text-sm font-medium text-white">Claimed published {fmtDateTime(l.date_published_claimed)} but the verifier cannot find this File Ref on the website.</div>}
            {l.status === 'on_hold' && <div className="mt-3 rounded-lg bg-amber-100 p-2.5 text-sm text-amber-900">On hold (SLA clock paused): {l.hold_reason}</div>}
            {l.status === 'rejected' && <div className="mt-3 rounded-lg bg-rose-100 p-2.5 text-sm text-rose-900">Rejected: {l.rejection_reason}</div>}
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs"><span className="font-medium text-slate-700">Completeness {l.completeness_pct}%</span>{l.completeness_pct < 100 && <span className="font-medium text-rose-700">{(l.missing_fields || []).length} missing</span>}</div>
              <Meter value={l.completeness_pct} />
              {l.completeness_pct < 100 && <div className="mt-2 flex flex-wrap gap-1">{(l.missing_fields || []).map((m) => <Badge key={m} className="bg-rose-100 text-rose-800">{FIELD_LABEL[m] || m}</Badge>)}</div>}
            </div>
            {canEdit && (
              <div className="no-print mt-4 flex flex-wrap gap-2">
                {!['archived'].includes(l.status) && <Btn kind="ghost" onClick={() => setEdit(true)}>Edit fields</Btn>}
                {l.status === 'draft' && <Btn disabled={l.completeness_pct < 100} title={l.completeness_pct < 100 ? 'Complete all required fields first' : ''} onClick={() => setStatus('ready_to_publish')}>Ready to publish</Btn>}
                {l.status === 'ready_to_publish' && <Btn onClick={() => setStatus('published_claimed')}>I uploaded it — mark as published</Btn>}
                {l.status === 'ready_to_publish' && <Btn kind="ghost" onClick={() => setStatus('draft')}>Back to draft</Btn>}
                {['draft', 'ready_to_publish', 'published_claimed'].includes(l.status) && <Btn kind="ghost" onClick={() => setReason('hold')}>Put on hold</Btn>}
                {l.status === 'on_hold' && <Btn onClick={() => setStatus(l.status_before_hold || 'draft')}>Resume (restart clock)</Btn>}
                {mgr && !['rejected', 'archived', 'verified_live'].includes(l.status) && <Btn kind="danger" onClick={() => setReason('reject')}>Reject</Btn>}
                {mgr && l.status === 'rejected' && <Btn kind="ghost" onClick={() => setStatus('draft')}>Reopen as draft</Btn>}
                {mgr && l.status !== 'archived' && <Btn kind="ghost" onClick={() => { if (confirm('Archive this listing? It is hidden, never deleted.')) setStatus('archived'); }}>Archive</Btn>}
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              {FORM_GROUPS.map(([g, keys]) => (
                <Card key={g} className="p-4">
                  <h3 className="mb-2 text-sm font-semibold text-brand-800">{g}</h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                    {keys.map((k) => {
                      const v = l[k]; const miss = (l.missing_fields || []).includes(k);
                      const text = k === 'assigned_to' ? nameOf(v) : k === 'date_received' ? fmtDateTime(v) : k === 'price' ? money(v, l.currency) : BOOL_FIELDS.includes(k) ? (v == null ? null : v ? 'Yes' : 'No') : Array.isArray(v) ? v.join(', ') : ['source_type', 'deal_type'].includes(k) ? titleCase(v) : v;
                      return (
                        <div key={k} className={['facilities', 'selling_points'].includes(k) ? 'col-span-2 sm:col-span-3' : ''}>
                          <dt className="text-xs text-slate-500">{FIELD_LABEL[k]}</dt>
                          <dd className={miss ? 'font-medium text-rose-700' : 'break-words text-slate-900'}>
                            {miss ? 'Missing' : k === 'media_drive_link' && v ? <a className="text-brand-700 underline" href={v} target="_blank" rel="noreferrer">Open folder</a> : text == null || text === '' ? '—' : String(text)}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </Card>
              ))}
            </div>
            <div className="space-y-4">
              <Card className="p-4">
                <h3 className="mb-3 text-sm font-semibold text-brand-800">Publishing channels</h3>
                <div className="space-y-3">
                  {channels.map((c) => <ChannelRow key={c.id} c={c} canEdit={canEdit} />)}
                  {canEdit && missingChannels.length > 0 && (
                    <Select value={null} placeholder="+ Add channel…" options={missingChannels.map((c) => [c, cfg.portal_labels[c]])} onChange={(v) => v && save('listing_channels', { listing_id: l.id, channel: v })} />
                  )}
                </div>
                {l.website_url && <a className="mt-3 inline-flex items-center gap-1 text-sm text-brand-700 underline" href={l.website_url} target="_blank" rel="noreferrer"><Icon name="link" className="h-4 w-4" />View on website</a>}
              </Card>
              <Card className="p-4">
                <h3 className="mb-3 text-sm font-semibold text-brand-800">SLA timeline</h3>
                <ol className="space-y-2 border-l-2 border-slate-200 pl-3 text-sm">
                  {timeline.map(([label, at]) => <li key={label}><div className={at ? 'text-slate-900' : 'text-slate-400'}>{label}</div><div className="text-xs text-slate-500">{at ? fmtDateTime(at) : 'pending'}</div></li>)}
                </ol>
                <div className="mt-3 text-sm">{s.verified ? <>Hours to publish: <b className="num">{r1(s.hours)}</b> — {s.onTime ? <span className="text-emerald-700">within {s.breach}h</span> : <span className="text-rose-700">late</span>}</> : <>Elapsed: <b className="num">{fmtHours(s.hours)}</b> of {s.breach}h</>}</div>
                <div className="mt-1 text-xs text-slate-500">Entered by {nameOf(l.entered_by)}</div>
              </Card>
              {mgr && (
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold text-brand-800">Audit trail</h3>
                  {!audit ? <p className="text-sm text-slate-500">Loading…</p> : !audit.length ? <p className="text-sm text-slate-500">No changes recorded.</p> : (
                    <ul className="max-h-80 space-y-2 overflow-y-auto text-xs">
                      {audit.map((a) => (
                        <li key={a.id} className="border-b border-slate-100 pb-1.5">
                          <div className="text-slate-500">{fmtDateTime(a.changed_at)} · {a.changed_by ? nameOf(a.changed_by) : 'System / verifier'} · {a.table_name === 'listing_channels' ? 'channel' : 'listing'}</div>
                          {a.action === 'insert' ? <div className="text-slate-800">Created</div> : <div className="break-words text-slate-800"><b>{FIELD_LABEL[a.field_name] || a.field_name}</b>: <span className="text-rose-700 line-through">{a.old_value || '∅'}</span> → <span className="text-emerald-700">{a.new_value || '∅'}</span></div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
            </div>
          </div>
          {edit && <ListingForm listing={l} onClose={() => setEdit(false)} onSaved={() => setEdit(false)} />}
          {ai && <AiExportModal kind="listing" record={l} onClose={() => setAi(false)} />}
          {reason === 'hold' && <ReasonModal title="Put on hold" label="Reason (mandatory) — the SLA clock pauses while on hold" confirmLabel="Put on hold" onClose={() => setReason(null)} onConfirm={async (r) => { if (await setStatus('on_hold', { hold_reason: r })) setReason(null); }} />}
          {reason === 'reject' && <ReasonModal kind="danger" title="Reject listing" label="Reason (mandatory)" confirmLabel="Reject" onClose={() => setReason(null)} onConfirm={async (r) => { if (await setStatus('rejected', { rejection_reason: r })) setReason(null); }} />}
        </div>
      );
    };

    const ChannelRow = ({ c, canEdit }) => {
      const { cfg, save } = useApp();
      const [url, setUrl] = useState(c.url || '');
      useEffect(() => setUrl(c.url || ''), [c.url]);
      const verifierOwned = c.channel === 'website';
      return (
        <div className="rounded-lg border border-slate-200 p-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-800">{(cfg.portal_labels || {})[c.channel] || titleCase(c.channel)}</span>
            {c.status === 'published' && <span className="text-xs text-emerald-700">✓ {fmtDate(c.published_at)}</span>}
          </div>
          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-2"><Select value={c.status} disabled={!canEdit} placeholder="Status" options={CHANNEL_STATUSES.map((s) => [s, titleCase(s)])} onChange={(v) => v && save('listing_channels', { status: v }, c.id)} /></div>
            <input className={`${inputCls()} col-span-3`} placeholder="Listing URL" disabled={!canEdit} value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => { if ((url || '') !== (c.url || '')) save('listing_channels', { url: url || null }, c.id); }} />
          </div>
          {verifierOwned && <p className="mt-1 text-[11px] text-slate-500">The verifier sets this to Published automatically when it finds the File Ref on the site.</p>}
        </div>
      );
    };

    // ---------- Bulk CSV import (backlog): map -> dry-run preview -> commit
    const IMPORT_FIELDS = ['reference_code', 'title', 'owner_name', 'owner_phone', 'location', 'property_type', 'deal_type', 'area_sqm', 'building_levels', 'floor', 'bedrooms', 'bathrooms', 'balconies', 'furnished',
      'media_uploaded', 'media_has_logo', 'media_edited', 'is_exclusive', 'view_type', 'price', 'currency', 'facilities', 'selling_points', 'buyer_persona_nationality',
      'buyer_persona_age_range', 'buyer_persona_gender', 'cover_photo_belongs', 'date_received', 'source_type', 'source_name', 'source_contact'];
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const CsvImport = ({ onClose }) => {
      const { me, cfg, data, setData, reloadTable, toast } = useApp();
      const [raw, setRaw] = useState(null); const [map, setMap] = useState({}); const [step, setStep] = useState('upload'); const [result, setResult] = useState(null); const [busy, setBusy] = useState(false);
      const onFile = async (file) => {
        const rows = parseCSV(await file.text());
        if (rows.length < 2) { toast('The file has no data rows', 'error'); return; }
        const headers = rows[0].map((h) => h.trim()); const m = {};
        IMPORT_FIELDS.forEach((f) => { const i = headers.findIndex((h) => norm(h) === norm(f) || norm(h) === norm(FIELD_LABEL[f]) || (f === 'reference_code' && ['fileref', 'ref', 'refcode'].includes(norm(h)))); if (i >= 0) m[f] = i; });
        setRaw({ headers, rows: rows.slice(1) }); setMap(m); setStep('map');
      };
      const matchKey = (obj, v) => Object.keys(obj || {}).find((k) => norm(k) === norm(v)) || null;
      const parsed = useMemo(() => {
        if (!raw) return [];
        const existing = new Set(data.listings.map((l) => l.reference_code)); const seen = new Set();
        return raw.rows.map((r, idx) => {
          const get = (f) => map[f] == null ? '' : String(r[map[f]] == null ? '' : r[map[f]]).trim();
          const o = {}; const errors = []; const warnings = [];
          IMPORT_FIELDS.forEach((f) => {
            const v = get(f); if (v === '') return;
            if (NUM_FIELDS.includes(f)) { const n = Number(v.replace(/[, ]/g, '')); if (isNaN(n)) warnings.push(`${f} "${v}" is not a number — skipped`); else o[f] = n; }
            else if (BOOL_FIELDS.includes(f)) o[f] = /^(y|yes|true|1)$/i.test(v) ? true : /^(n|no|false|0)$/i.test(v) ? false : null;
            else if (f === 'facilities') o[f] = v.split(/[;|]/).map((x) => x.trim()).filter(Boolean);
            else if (f === 'date_received') { const d = new Date(v); if (isNaN(d)) warnings.push(`date "${v}" not understood — using now`); else o[f] = d.toISOString(); }
            else o[f] = v;
          });
          if (o.reference_code) o.reference_code = o.reference_code.toUpperCase().replace(/\s/g, '');
          o.location = matchKey(cfg.location_codes, o.location) || o.location; o.property_type = matchKey(cfg.unit_type_codes, o.property_type) || o.property_type;
          o.deal_type = /rent/i.test(o.deal_type || '') ? 'rent' : /sale|sell|buy/i.test(o.deal_type || '') ? 'sale' : o.reference_code && /-R$/.test(o.reference_code) ? 'rent' : o.reference_code && /-S$/.test(o.reference_code) ? 'sale' : null;
          o.source_type = SOURCE_TYPES.find((s) => norm(s) === norm(o.source_type)) || 'other';
          o.source_name = o.source_name || 'Backlog import';
          if (o.currency) o.currency = o.currency.toUpperCase();
          if (!o.location) errors.push('location missing'); else if (!o.reference_code && !(cfg.location_codes || {})[o.location]) errors.push(`no location code for "${o.location}"`);
          if (!o.property_type) errors.push('property type missing'); else if (!o.reference_code && !(cfg.unit_type_codes || {})[o.property_type]) errors.push(`no unit type code for "${o.property_type}"`);
          if (!o.deal_type) errors.push('sale/rent missing');
          if (o.reference_code && (existing.has(o.reference_code) || seen.has(o.reference_code))) errors.push(`${o.reference_code} already exists`);
          if (o.reference_code) seen.add(o.reference_code); else warnings.push('no File Ref — a new code will be generated (paste it into WordPress)');
          return { line: idx + 2, o, errors, warnings, comp: calcCompleteness(o, cfg.required_fields).pct };
        });
      }, [raw, map, cfg, data.listings]);
      const good = parsed.filter((p) => !p.errors.length);

      const commit = async () => {
        setBusy(true); const created = []; const failed = [];
        for (let i = 0; i < good.length; i += 25) {
          const chunk = good.slice(i, i + 25); const payload = chunk.map((p) => ({ ...p.o, entered_by: me.id, assigned_to: me.id }));
          const { data: rows, error } = await sbc.from(tbl('listings')).insert(payload).select();
          if (!error) { created.push(...rows); continue; }
          for (const p of chunk) {        // one bad row must not sink the batch
            const { data: row, error: e2 } = await sbc.from(tbl('listings')).insert({ ...p.o, entered_by: me.id, assigned_to: me.id }).select().single();
            if (e2) failed.push({ line: p.line, error: friendlyError(e2) }); else created.push(row);
          }
        }
        setData((d) => ({ ...d, listings: [...created, ...d.listings] }));
        await reloadTable('listing_channels');
        setBusy(false); setResult({ created: created.length, failed }); setStep('done');
      };
      const template = () => downloadCSV('hv-ops-import-template.csv', IMPORT_FIELDS, [['HD-A-1012-S', 'Sea view apartment in Hadaba', 'Owner name', '+20…', 'Hadaba', 'Apartment', 'sale', 85, 5, 3, 2, 1, 1, 'yes', 'yes', 'yes', 'no', 'no', 'Sea view', 95000, 'EUR', 'Swimming pool; Elevator', 'Walk to the beach', 'German', '45-54', 'Couples', 'yes', '2026-09-01 10:00', 'owner', 'Owner name', '+20…']]);

      return (
        <Modal wide title="Import listings from CSV" onClose={onClose} footer={
          step === 'map' ? <><Btn kind="ghost" onClick={() => setStep('upload')}>Back</Btn><Btn onClick={() => setStep('preview')}>Dry-run preview</Btn></> :
          step === 'preview' ? <><Btn kind="ghost" onClick={() => setStep('map')}>Back</Btn><Btn disabled={!good.length || busy} onClick={commit}>{busy ? 'Importing…' : `Import ${good.length} listing${good.length === 1 ? '' : 's'}`}</Btn></> :
          <Btn kind="ghost" onClick={onClose}>Close</Btn>}>
          {step === 'upload' && (
            <div className="space-y-3 text-sm text-slate-700">
              <p>Use this for the existing backlog. Rows that already have a website <b>File Ref</b> keep it (the verifier will then confirm them as live). Rows without one get a new code that must be pasted into WordPress.</p>
              <input type="file" accept=".csv,text/csv" className="block w-full text-sm" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
              <Btn kind="ghost" onClick={template}>Download template CSV</Btn>
            </div>
          )}
          {step === 'map' && raw && (
            <div>
              <p className="mb-3 text-sm text-slate-600">{raw.rows.length} rows found. Match each HV Ops field to a column in your file.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {IMPORT_FIELDS.map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <span className="w-44 shrink-0 text-xs text-slate-700">{f === 'reference_code' ? 'File Ref / reference code' : FIELD_LABEL[f] || f}</span>
                    <Select value={map[f] == null ? null : String(map[f])} placeholder="— not in file —" options={raw.headers.map((h, i) => [String(i), h || `Column ${i + 1}`])} onChange={(v) => setMap((m) => { const n = { ...m }; if (v == null) delete n[f]; else n[f] = Number(v); return n; })} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {step === 'preview' && (
            <div>
              <div className="mb-3 flex flex-wrap gap-2 text-sm"><Badge className="bg-emerald-100 text-emerald-800">{good.length} ready</Badge><Badge className="bg-rose-100 text-rose-800">{parsed.length - good.length} will be skipped</Badge><span className="text-slate-500">Nothing is saved until you press Import.</span></div>
              <div className="scroll-x max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left text-slate-500"><tr>{['Line', 'Ref', 'Location', 'Type', 'Deal', 'Price', 'Complete', 'Result'].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr></thead>
                  <tbody>{parsed.map((p) => (
                    <tr key={p.line} className={`border-t border-slate-100 ${p.errors.length ? 'bg-rose-50' : ''}`}>
                      <td className="px-2 py-1.5">{p.line}</td><td className="px-2 py-1.5 font-mono">{p.o.reference_code || <i className="text-slate-400">new</i>}</td><td className="px-2 py-1.5">{p.o.location}</td><td className="px-2 py-1.5">{p.o.property_type}</td><td className="px-2 py-1.5">{p.o.deal_type}</td>
                      <td className="px-2 py-1.5">{money(p.o.price, p.o.currency)}</td><td className="px-2 py-1.5">{p.comp}%</td>
                      <td className="px-2 py-1.5">{p.errors.length ? <span className="text-rose-700">Skip: {p.errors.join('; ')}</span> : <span className="text-emerald-700">OK{p.warnings.length ? <span className="text-amber-700"> · {p.warnings.join('; ')}</span> : ''}</span>}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            </div>
          )}
          {step === 'done' && result && (
            <div className="space-y-2 text-sm"><p className="font-medium text-emerald-700">{result.created} listings imported.</p>
              {result.failed.length > 0 && <div className="text-rose-700">{result.failed.map((x) => <div key={x.line}>Line {x.line}: {x.error}</div>)}</div>}</div>
          )}
        </Modal>
      );
    };
