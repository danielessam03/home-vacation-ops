
    // =========================================================================================
    // "BASIC REQUIRED INFO" SHEETS — the company's one-property-per-file Excel format.
    // Import: one or many sheets (or a whole folder) -> new draft listings; anything missing stays red on the listing.
    // Export: any listing back into exactly the same sheet layout (one file, or one workbook with a sheet per listing).
    // Folder / file names like "Maged Makram Rabella AH-A-1025-R" give the owner and the existing File Ref.
    // =========================================================================================
    // this address first (vendor/, shipped by hv-shared/kit), the public CDN as fallback
    const EXCELJS_LOCAL = 'vendor/exceljs-4.4.0.min.js';
    const EXCELJS_SRC = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    let excelJsPromise = null;
    const loadExcelJS = () => excelJsPromise || (excelJsPromise = new Promise((resolve, reject) => {
      if (window.ExcelJS) { resolve(window.ExcelJS); return; }
      const fail = () => { excelJsPromise = null; reject(new Error('Could not load the Excel reader — check the internet connection.')); };
      if (window.HVCore) { HVCore.loadScript(EXCELJS_LOCAL, EXCELJS_SRC).then(() => resolve(window.ExcelJS), fail); return; }
      const s = document.createElement('script'); s.src = EXCELJS_SRC; s.async = true;
      s.onload = () => resolve(window.ExcelJS); s.onerror = fail;
      document.head.appendChild(s);
    }));

    // Rows of the company sheet, in order, with the exact labels used in the office files.
    const BASIC_ROWS = [
      ['Location', 'location'], ['Property Type', 'property_type'], ['For Sale / For Rent', 'deal_type'], ['Area (sqm)', 'area_sqm'],
      ['Building levels', 'building_levels'], ['Floor', 'floor'], ['Bedrooms', 'bedrooms'], ['Bathrooms', 'bathrooms'], ['Balconies', 'balconies'],
      ['Furnished ?', 'furnished'], ['Media (Images / Videos)', 'media_uploaded'], ['Exclusive ?', 'is_exclusive'], ['View', 'view_type'],
      ['price', 'price'], ['Currency', 'currency'], ['Facilities / Amenities', 'facilities'], ['Selling Points ', 'selling_points'],
      ['Buyer Persona (Nationality, Age, Gender)', 'buyer_persona'], ['Date of receving ', 'date_received'], ['Date of publishing ', 'date_published'],
      ['Cover photo (belong/not belong) to the unit ', 'cover_photo_belongs'],
    ];
    // label (letters only, lower case) -> field; the first rule whose prefix matches wins
    const BASIC_LABEL_RULES = [
      ['location', 'location'], ['propertytype', 'property_type'], ['type', 'property_type'], ['forsale', 'deal_type'], ['saleor', 'deal_type'], ['forrent', 'deal_type'],
      ['area', 'area_sqm'], ['buildinglevel', 'building_levels'], ['floor', 'floor'], ['bedroom', 'bedrooms'], ['bathroom', 'bathrooms'], ['balcon', 'balconies'],
      ['furnish', 'furnished'], ['media', 'media_uploaded'], ['exclusive', 'is_exclusive'], ['view', 'view_type'], ['price', 'price'], ['currency', 'currency'],
      ['facilit', 'facilities'], ['amenit', 'facilities'], ['sellingpoint', 'selling_points'], ['buyerpersona', 'buyer_persona'], ['dateofrec', 'date_received'],
      ['datereceiv', 'date_received'], ['dateofpubl', 'date_published'], ['coverphoto', 'cover_photo_belongs'], ['referencecode', 'reference_code'], ['fileref', 'reference_code'],
      ['ownerphone', 'owner_phone'], ['ownername', 'owner_name'], ['owner', 'owner_name'], ['title', 'title'],
    ];
    const lettersOnly = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
    const basicFieldOf = (label) => { const n = lettersOnly(label); if (!n) return null; const r = BASIC_LABEL_RULES.find(([p]) => n.startsWith(p)); return r ? r[1] : null; };
    const cellText = (v) => {
      if (v == null) return '';
      if (v instanceof Date) return v;
      if (typeof v === 'object') { if (v.richText) return v.richText.map((x) => x.text).join(''); if ('result' in v) return cellText(v.result); if (v.text) return cellText(v.text); return ''; }
      return typeof v === 'string' ? v.trim() : v;
    };
    const firstNumber = (v) => { if (typeof v === 'number') return v; const m = String(v || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
    const yesNo = (v) => { const s = String(v || '').trim().toLowerCase(); if (!s) return null; if (/^(not|no|n$|false|0$|لا|غير)/.test(s)) return false; if (/^(yes|y$|true|1$|done|belong|نعم|تم|ok)/.test(s)) return true; return null; };
    const normPlace = (s) => lettersOnly(s).replace(/^(al|el)/, '');
    const matchKey = (options, raw) => {
      if (!raw) return null; const n = normPlace(raw); if (!n) return null;
      const keys = Object.keys(options || {});
      return keys.find((k) => normPlace(k) === n) || keys.find((k) => normPlace(k) === n.replace(/s$/, '')) || (keys.filter((k) => normPlace(k).startsWith(n) || n.startsWith(normPlace(k))).length === 1 ? keys.find((k) => normPlace(k).startsWith(n) || n.startsWith(normPlace(k))) : null);
    };
    const matchList = (list, raw) => { if (!raw) return null; const n = lettersOnly(raw); return (list || []).find((x) => lettersOnly(x) === n) || null; };
    const currencyOf = (...texts) => { const s = texts.map((t) => String(t || '').toLowerCase()).join(' '); if (/eur|€|euro|يورو/.test(s)) return 'EUR'; if (/usd|\$|dollar|دولار/.test(s)) return 'USD'; if (/egp|egy|l\.?e|pound|جنيه|ج\.م/.test(s)) return 'EGP'; return null; };
    const parseDateCell = (v) => {
      if (v instanceof Date && !isNaN(v)) return v.toISOString();
      const s = String(v || '').trim(); if (!s) return null;
      const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);           // 09/06/2026 = 9 June (day first, as used in Egypt)
      if (m) { const y = Number(m[3].length === 2 ? '20' + m[3] : m[3]); const d = new Date(y, Number(m[2]) - 1, Number(m[1]), 12); return isNaN(d) ? null : d.toISOString(); }
      const d = new Date(s); return isNaN(d) ? null : d.toISOString();
    };
    const CODE_RE = /([A-Z]{1,4}(?:-[A-Z]{1,3})?-\d{1,6}(?:-\d{1,3})?-[SR])(?![A-Za-z0-9])/;
    // "…/FOR RENT/Maged Makram Rabella AH-A-1025-R/Basic Required Info - .xlsx"  ->  owner "Maged Makram Rabella", code "AH-A-1025-R"
    function ownerAndCodeFromPath(path) {
      const parts = String(path || '').split(/[\\/]/).filter(Boolean);
      const file = (parts.pop() || '').replace(/\.xlsx?$/i, '').replace(/basic\s*required\s*info\s*-?/i, '').trim();
      const candidates = [file, parts[parts.length - 1] || ''];
      for (const c of candidates) { const m = c.match(CODE_RE); if (m) return { reference_code: m[1], owner_name: c.replace(m[0], '').replace(/[-–_|\s]+$/, '').replace(/^[-–_|\s]+/, '').trim() || null }; }
      return { reference_code: null, owner_name: null };
    }

    // Reads one company sheet into listing fields + notes about anything the system could not understand.
    function readBasicSheet(ws, path, cfg, canApprovePhotos) {
      const raw = {};
      ws.eachRow((row) => {
        const cells = []; row.eachCell({ includeEmpty: false }, (c) => cells.push({ col: c.col, v: cellText(c.value) }));
        if (!cells.length) return;
        const labelCell = cells[0]; const field = typeof labelCell.v === 'string' ? basicFieldOf(labelCell.v) : null;
        if (!field || raw[field] !== undefined) return;
        const valueCell = cells.find((c) => c.col > labelCell.col && c.v !== '');
        raw[field] = valueCell ? valueCell.v : '';
      });
      const o = {}; const notes = [];
      const fromPath = ownerAndCodeFromPath(path);
      o.reference_code = (raw.reference_code ? String(raw.reference_code).toUpperCase().replace(/\s/g, '') : null) || fromPath.reference_code;
      o.owner_name = (raw.owner_name ? String(raw.owner_name) : null) || fromPath.owner_name;
      if (raw.owner_phone) o.owner_phone = String(raw.owner_phone);
      if (raw.title) o.title = String(raw.title);
      o.location = matchKey(cfg.location_codes, raw.location); if (raw.location && !o.location) notes.push(`Location “${raw.location}” is not in the location list — pick it below`);
      o.property_type = matchKey(cfg.unit_type_codes, raw.property_type); if (raw.property_type && !o.property_type) notes.push(`Property type “${raw.property_type}” is not in the list — pick it below`);
      const deal = String(raw.deal_type || '').toLowerCase();
      o.deal_type = /rent|ايجار|إيجار/.test(deal) ? 'rent' : /sale|sell|بيع/.test(deal) ? 'sale' : o.reference_code && /-R$/.test(o.reference_code) ? 'rent' : o.reference_code && /-S$/.test(o.reference_code) ? 'sale' : null;
      ['area_sqm', 'building_levels', 'bedrooms', 'bathrooms', 'balconies'].forEach((k) => { const n = firstNumber(raw[k]); if (n != null) o[k] = n; else if (raw[k] !== undefined && raw[k] !== '') notes.push(`${k.replace(/_/g, ' ')} “${raw[k]}” is not a number`); });
      if (raw.floor !== undefined && raw.floor !== '') { const f = /ground|أرضي|ارضي|^g$/i.test(String(raw.floor)) ? 0 : firstNumber(raw.floor); if (f != null) o.floor = f; else notes.push(`Floor “${raw.floor}” not understood`); }
      o.furnished = yesNo(raw.furnished); if (raw.furnished && o.furnished == null) notes.push(`Furnished “${raw.furnished}” not understood (Yes / No)`);
      o.is_exclusive = yesNo(raw.is_exclusive);
      o.cover_photo_belongs = yesNo(raw.cover_photo_belongs);
      const mediaDone = yesNo(raw.media_uploaded);
      if (mediaDone) { o.photography_done = true; if (canApprovePhotos) o.media_uploaded = true; else notes.push('Media says “Done” — a manager still has to mark the photos as ready'); }
      o.view_type = matchList(cfg.view_types, raw.view_type) || (raw.view_type ? String(raw.view_type) : null);
      o.price = firstNumber(raw.price);
      o.currency = currencyOf(raw.currency) || currencyOf(raw.price);
      if (raw.price && typeof raw.price === 'string' && raw.price.replace(/[\d,.\s]/g, '').length > 3) o.price_note = raw.price;     // "26000 L.E / Per Month including maintenance"
      o.facilities = raw.facilities ? String(raw.facilities).split(/[,;\n•|]+/).map((x) => x.trim()).filter(Boolean) : [];
      o.selling_points = raw.selling_points ? String(raw.selling_points) : null;
      if (raw.buyer_persona) {
        String(raw.buyer_persona).split(/[,;\n|]+/).map((x) => x.trim()).filter(Boolean).forEach((p) => {
          if (/\d/.test(p) && !o.buyer_persona_age_range) o.buyer_persona_age_range = p;
          else if (/male|female|couple|famil|any|men|women|single|ذكر|أنثى|عائل/i.test(p) && !o.buyer_persona_gender) o.buyer_persona_gender = p;
          else if (!o.buyer_persona_nationality) o.buyer_persona_nationality = p;
        });
      }
      o.date_received = parseDateCell(raw.date_received) || new Date().toISOString();
      if (!raw.date_received) notes.push('No “Date of receving” — today is used, which starts the 72h clock now');
      if (o.reference_code && o.deal_type) { const want = o.deal_type === 'rent' ? 'R' : 'S'; if (!o.reference_code.endsWith('-' + want)) { o.reference_code = o.reference_code.replace(/-[SR]$/, '-' + want); notes.push(`The sheet says ${o.deal_type}, so the code becomes ${o.reference_code} (same serial, ${want} ending)`); } }
      Object.keys(o).forEach((k) => (o[k] == null || o[k] === '') && delete o[k]);
      return { values: o, notes, path };
    }

    async function readBasicFiles(files, cfg, canApprovePhotos) {
      const ExcelJS = await loadExcelJS(); const out = [];
      for (const f of files) {
        const path = f.webkitRelativePath || f.name;
        try {
          const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await f.arrayBuffer());
          wb.worksheets.forEach((ws, i) => { const r = readBasicSheet(ws, wb.worksheets.length > 1 ? `${ws.name}.xlsx` : path, cfg, canApprovePhotos); if (Object.keys(r.values).length > 2) out.push({ ...r, path: wb.worksheets.length > 1 ? `${path} › ${ws.name}` : path }); });
        } catch (e) { out.push({ values: {}, notes: [`Could not read this file: ${e.message}`], path, broken: true }); }
      }
      return out;
    }

    const BasicInfoImport = ({ onClose }) => {
      const { me, cfg, data, save, reloadTable, toast, go } = useApp();
      const [rows, setRows] = useState(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState(null);
      const mgr = isMgr(me);
      const pick = async (fileList) => {
        const files = [...fileList].filter((f) => /\.xlsx$/i.test(f.name) && !/^~\$/.test(f.name) && (fileList.length === 1 || /basic/i.test(f.name) || !f.webkitRelativePath));
        if (!files.length) { toast('No “Basic Required Info” .xlsx files found', 'error'); return; }
        setBusy(true);
        try { setRows((await readBasicFiles(files, cfg, mgr)).map((r, i) => ({ ...r, key: i, include: !r.broken }))); } catch (e) { toast(e.message, 'error'); }
        setBusy(false);
      };
      const upd = (i, k, v) => setRows((rs) => rs.map((r, j) => j === i ? { ...r, values: { ...r.values, [k]: v || undefined } } : r));
      const existing = new Set(data.listings.map((l) => l.reference_code));
      const dupInBatch = (r) => r.values.reference_code && rows.filter((x) => x.include && x.values.reference_code === r.values.reference_code).length > 1;
      const problems = (r) => [!r.values.location && 'location', !r.values.property_type && 'property type', !r.values.deal_type && 'sale / rent', r.values.reference_code && existing.has(r.values.reference_code) && `${r.values.reference_code} already exists in HV Ops`, dupInBatch(r) && `${r.values.reference_code} appears twice in this import`].filter(Boolean);
      const create = async () => {
        setBusy(true); const created = []; const failed = [];
        for (const r of rows.filter((x) => x.include)) {
          const v = r.values;
          if (problems(r).length) { failed.push(`${r.path}: ${problems(r).join(', ')}`); continue; }
          const payload = { ...v, source_type: 'owner', source_name: v.owner_name || 'Basic Required Info sheet', entered_by: me.id, assigned_to: cfg.default_uploader || me.id };
          if (!mgr) delete payload.media_uploaded;
          const row = await save('listings', payload);
          if (row) created.push(row); else failed.push(`${r.path}: not saved`);
        }
        await reloadTable('listing_channels');
        setBusy(false); setDone({ created, failed });
        if (created.length === 1 && !failed.length) { onClose(); go('listing', created[0].id); }
      };
      const miss = (v) => calcCompleteness(v, cfg.required_fields).missing;
      return (
        <Modal wide title="Import “Basic Required Info” sheets" onClose={onClose} footer={rows && !done ? <><Btn kind="ghost" onClick={() => setRows(null)}>Back</Btn><Btn disabled={busy || !rows.some((r) => r.include && !problems(r).length)} onClick={create}>{busy ? 'Creating…' : `Create ${rows.filter((r) => r.include && !problems(r).length).length} listing(s)`}</Btn></> : <Btn kind="ghost" onClick={onClose}>Close</Btn>}>
          {!rows && (
            <div className="space-y-4 text-sm text-slate-700">
              <p>Pick the office <b>Basic Required Info</b> Excel file(s). Each file becomes a new <b>draft</b> listing; anything empty or unreadable stays <span className="font-semibold text-rose-700">red</span> on the listing until someone fills it in.</p>
              <p className="text-xs text-slate-500">Tip: pick the whole property <b>folder</b> (e.g. “Maged Makram Rabella AH-A-1025-R”) — the owner’s name and the existing File Ref are taken from the folder name. Picking a parent folder (e.g. “FOR RENT”) imports every property inside it.</p>
              <div className="flex flex-wrap gap-3">
                <label className="cursor-pointer rounded-lg bg-brand-700 px-4 py-2 font-medium text-white">Choose file(s)<input type="file" accept=".xlsx" multiple className="hidden" onChange={(e) => e.target.files.length && pick(e.target.files)} /></label>
                <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700">Choose a folder<input type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={(e) => e.target.files.length && pick(e.target.files)} /></label>
              </div>
              {busy && <p className="text-slate-500">Reading…</p>}
            </div>
          )}
          {rows && !done && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">{rows.length} sheet(s) read. Nothing is saved until you press Create. Fix the red boxes, untick anything you don’t want.</p>
              {rows.map((r, i) => { const v = r.values; const pr = problems(r); const m = miss(v); return (
                <Card key={r.key} className={`p-3 ${pr.length ? 'border-rose-300' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex min-w-0 items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={r.include} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, include: e.target.checked } : x))} /><span className="truncate text-xs text-slate-500" title={r.path}>{r.path}</span></label>
                    <Badge className={m.length ? 'bg-rose-600 text-white' : 'bg-emerald-100 text-emerald-800'}>{m.length ? `${m.length} missing` : 'complete'}</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field label="Owner"><input className={inputCls()} value={v.owner_name || ''} onChange={(e) => upd(i, 'owner_name', e.target.value)} /></Field>
                    <Field label="File Ref (leave empty = new code)" bad={!!(v.reference_code && existing.has(v.reference_code))}><input className={`${inputCls(v.reference_code && existing.has(v.reference_code))} font-mono uppercase`} value={v.reference_code || ''} onChange={(e) => upd(i, 'reference_code', e.target.value.toUpperCase().replace(/\s/g, ''))} /></Field>
                    <Field label="Location" bad={!v.location}><Select bad={!v.location} value={v.location} onChange={(x) => upd(i, 'location', x)} options={Object.keys(cfg.location_codes || {}).sort()} /></Field>
                    <Field label="Type / deal" bad={!v.property_type || !v.deal_type}><div className="flex gap-1"><Select bad={!v.property_type} value={v.property_type} onChange={(x) => upd(i, 'property_type', x)} options={Object.keys(cfg.unit_type_codes || {}).sort()} /><Select bad={!v.deal_type} value={v.deal_type} onChange={(x) => upd(i, 'deal_type', x)} options={[['sale', 'Sale'], ['rent', 'Rent']]} placeholder="S/R" /></div></Field>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">{[v.area_sqm && `${v.area_sqm} sqm`, v.bedrooms != null && `${v.bedrooms} bed`, v.bathrooms != null && `${v.bathrooms} bath`, v.view_type, v.price && money(v.price, v.currency), v.date_received && `received ${fmtDate(v.date_received)}`].filter(Boolean).join(' · ')}</div>
                  {m.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{m.map((k) => <Badge key={k} className="bg-rose-100 text-rose-800">{FIELD_LABEL[k] || k}</Badge>)}</div>}
                  {r.notes.length > 0 && <ul className="mt-1.5 list-disc pl-4 text-xs text-amber-800">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                  {pr.length > 0 && <div className="mt-1.5 text-xs font-medium text-rose-700">Cannot create yet: {pr.join(', ')}</div>}
                </Card>
              ); })}
            </div>
          )}
          {done && (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-emerald-700">{done.created.length} listing(s) created as drafts.</p>
              {done.created.map((l) => <button key={l.id} className="block font-mono text-brand-700 underline" onClick={() => { onClose(); go('listing', l.id); }}>{l.reference_code}{l.completeness_pct < 100 ? ` — ${l.completeness_pct}% (fill the red fields)` : ''}</button>)}
              {done.failed.length > 0 && <div className="text-rose-700">{done.failed.map((x) => <div key={x}>{x}</div>)}</div>}
            </div>
          )}
        </Modal>
      );
    };

    // ---------- export: same layout as the office sheet. Empty required rows are shaded red so they stand out.
    function basicValueOf(key, l) {
      switch (key) {
        case 'deal_type': return l.deal_type === 'rent' ? 'Rent' : l.deal_type === 'sale' ? 'Sale' : '';
        case 'area_sqm': return l.area_sqm != null ? Number(l.area_sqm) : '';
        case 'furnished': case 'is_exclusive': return l[key] == null ? '' : l[key] ? 'Yes' : 'No';
        case 'media_uploaded': return l.media_uploaded ? 'Done' : '';
        case 'cover_photo_belongs': return l.cover_photo_belongs == null ? '' : l.cover_photo_belongs ? 'Belong' : 'Not belong';
        case 'price': return l.price_note ? l.price_note : l.price != null ? Number(l.price) : '';      // the office sheets write the price as text
        case 'facilities': return (l.facilities || []).join(', ');
        case 'buyer_persona': return [l.buyer_persona_nationality, l.buyer_persona_age_range, l.buyer_persona_gender].filter(Boolean).join(', ');
        case 'date_received': return l.date_received ? new Date(l.date_received) : '';
        case 'date_published': { const d = l.date_published_verified || l.date_published_claimed; return d ? new Date(d) : ''; }
        default: return l[key] == null ? '' : l[key];
      }
    }
    function addBasicSheet(wb, l, required, sheetName) {
      const ws = wb.addWorksheet(sheetName);
      ws.columns = [{ width: 38.43 }, { width: 40.29 }];
      const head = ws.getCell('A1'); head.value = 'Properties'; head.font = { bold: true }; head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      const reqMap = { media_uploaded: 'media_uploaded', buyer_persona: 'buyer_persona_nationality' };
      BASIC_ROWS.forEach(([label, key], i) => {
        const r = i + 2; ws.getCell(`A${r}`).value = label;
        const c = ws.getCell(`B${r}`); const v = basicValueOf(key, l); c.value = v === '' ? null : v;
        if (v instanceof Date) c.numFmt = 'dd/mm/yyyy';
        if (key === 'price' && typeof v === 'number') c.numFmt = '#,##0';
        if (v === '' && required.includes(reqMap[key] || key)) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E2' } };
      });
      return ws;
    }
    async function buildBasicBuffer(listings, cfg) {
      const ExcelJS = await loadExcelJS(); const wb = new ExcelJS.Workbook(); wb.creator = 'HV Ops';
      const used = new Set();
      listings.forEach((l) => { let name = (l.reference_code || 'Listing').replace(/[\\/?*[\]:]/g, '').slice(0, 31); let n = 2; while (used.has(name)) name = `${name.slice(0, 28)}-${n++}`; used.add(name); addBasicSheet(wb, l, cfg.required_fields || [], listings.length === 1 ? 'Sheet1' : name); });
      return wb.xlsx.writeBuffer();
    }
    async function exportBasicInfo(listings, cfg, toast) {
      if (!listings.length) { toast('Nothing to export', 'error'); return; }
      try {
        const buf = await buildBasicBuffer(listings, cfg);
        const one = listings[0];
        const fileName = listings.length === 1 ? `Basic Required Info - ${[one.owner_name, one.reference_code].filter(Boolean).join(' ')}.xlsx`.replace(/[\\/:*?"<>|]/g, '') : `Basic Required Info - ${listings.length} listings ${ymd(new Date())}.xlsx`;
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
      } catch (e) { toast(e.message || String(e), 'error'); }
    }
    window.__hvBasicInfo = { readBasicFiles, buildBasicBuffer, ownerAndCodeFromPath };     // used by the automated test page only
