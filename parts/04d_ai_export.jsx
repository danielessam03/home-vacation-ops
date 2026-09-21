
    // =========================================================================================
    // EXPORT FOR AI — one button on every listing / project that produces a clean brief to paste into an AI tool
    // (ChatGPT, Claude, Gemini…) so it writes the website description. Only marketing facts are exported:
    // the owner's name and phone, the source and staff names are NEVER included.
    // =========================================================================================
    const AI_DEFAULT_INSTRUCTIONS = `You are the copywriter for Home Vacation, a real-estate company in Hurghada on Egypt's Red Sea coast (home-vacation.com).
Write the website text for the property below.
Rules:
- Use ONLY the facts listed. If something says "not provided", leave it out — never invent sizes, prices, distances, views or facilities.
- Keep the price and currency exactly as written. Do not convert currencies.
- Warm, clear, trustworthy tone for international buyers and holiday-home investors. No exaggeration, no ALL CAPS, no emojis.
- Mention the reference code once at the end.`;
    const AI_OUTPUT_LISTING = `1. SEO title (max 60 characters)
2. Meta description (max 155 characters)
3. Main description: 150–220 words, 2–3 short paragraphs
4. Key features: 5–7 bullet points
5. A one-line call to action`;
    const AI_OUTPUT_PROJECT = `1. SEO title (max 60 characters)
2. Meta description (max 155 characters)
3. Project overview: 200–300 words, 3 short paragraphs (the project, the units, the location & lifestyle)
4. Payment plan summary in 2–3 lines, exactly as given
5. Key features: 6–8 bullet points
6. A one-line call to action`;
    const AI_LANGS = ['English', 'Arabic', 'German', 'Russian', 'French', 'Italian', 'Polish', 'Czech'];

    const aiVal = (v, unit = '') => v == null || v === '' || (Array.isArray(v) && !v.length) ? 'not provided' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : `${v}${unit}`;
    const aiFloor = (n) => n == null ? 'not provided' : Number(n) === 0 ? 'Ground floor' : `Floor ${n}`;

    function listingFacts(l) {
      return [
        ['Reference code', l.reference_code], ['Listing type', l.deal_type === 'rent' ? 'For rent' : 'For sale'], ['Property type', l.property_type],
        ['Location', `${l.location}, Hurghada / Red Sea, Egypt`], ['Working title', l.title],
        ['Area', l.area_sqm == null ? null : `${l.area_sqm} sqm`], ['Bedrooms', l.bedrooms == null ? null : (Number(l.bedrooms) === 0 ? 'Studio / no separate bedroom' : l.bedrooms)], ['Bathrooms', l.bathrooms],
        ['Balconies', l.balconies], ['Floor', l.floor == null ? null : aiFloor(l.floor)], ['Building levels', l.building_levels], ['Furnished', l.furnished], ['View', l.view_type],
        ['Price', l.price == null ? null : `${Number(l.price).toLocaleString('en-US')} ${l.currency || ''}`.trim()], ['Exclusive to Home Vacation', l.is_exclusive ? true : undefined],      // only worth saying when it IS exclusive
        ['Facilities', l.facilities], ['Selling points (from our team)', l.selling_points],
        ['Target buyer — nationality', l.buyer_persona_nationality], ['Target buyer — age range', l.buyer_persona_age_range], ['Target buyer — profile', l.buyer_persona_gender],
      ];
    }
    function projectFacts(p) {
      return [
        ['Project ID', p.reference_code], ['Project name', p.name], ['Developer', p.developer], ['Location', `${p.location}, Hurghada / Red Sea, Egypt`],
        ['Unit types available', p.project_types], ['Unit sizes', p.unit_sizes], ['Bedrooms', p.bedrooms],
        ['Starting price', p.starting_price == null ? null : `${Number(p.starting_price).toLocaleString('en-US')} ${p.currency || ''}`.trim()],
        ['Down payment', p.down_payment], ['Installments', p.installments], ['Delivery date', p.delivery_date], ['Finishing', p.finishing],
        ['Exclusive to Home Vacation', p.is_exclusive ? true : undefined], ['Facilities', p.facilities], ['Selling points (from our team)', p.selling_points],
      ];
    }
    function buildAiBrief({ kind, record, instructions, language, format }) {
      const facts = (kind === 'project' ? projectFacts(record) : listingFacts(record)).filter(([, v]) => v !== undefined);
      const out = kind === 'project' ? AI_OUTPUT_PROJECT : AI_OUTPUT_LISTING;
      const head = `# TASK\n${(instructions || AI_DEFAULT_INSTRUCTIONS).trim()}\n- Write in: ${language}.\n`;
      const body = format === 'json'
        ? '# FACTS (JSON — null means "not provided")\n```json\n' + JSON.stringify(Object.fromEntries(facts.map(([k, v]) => [k, v == null || v === '' || (Array.isArray(v) && !v.length) ? null : v])), null, 2) + '\n```\n'
        : `# ${kind === 'project' ? 'PROJECT' : 'PROPERTY'} FACTS\n` + facts.map(([k, v]) => `- ${k}: ${aiVal(v)}`).join('\n') + '\n';
      return `${head}\n${body}\n# WHAT TO DELIVER\n${out}\n`;
    }

    const AiExportModal = ({ kind, record, onClose }) => {
      const { cfg, toast } = useApp();
      const [language, setLanguage] = useState(() => { try { return localStorage.getItem('hvops_ai_lang') || 'English'; } catch (e) { return 'English'; } });
      const [format, setFormat] = useState('text'); const [copied, setCopied] = useState(false);
      const brief = useMemo(() => buildAiBrief({ kind, record, instructions: cfg.ai_brief_instructions, language, format }), [kind, record, cfg.ai_brief_instructions, language, format]);
      const missing = (kind === 'project' ? projectFacts(record) : listingFacts(record)).filter(([, v]) => v !== undefined && (v == null || v === '' || (Array.isArray(v) && !v.length))).map(([k]) => k);
      const copy = async () => {
        try { await navigator.clipboard.writeText(brief); } catch (e) { const t = document.createElement('textarea'); t.value = brief; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
        setCopied(true); toast('Copied — paste it into your AI tool'); setTimeout(() => setCopied(false), 2000);
      };
      const download = () => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([brief], { type: 'text/plain;charset=utf-8' }));
        a.download = `${record.reference_code}-ai-brief.txt`; document.body.appendChild(a); a.click(); a.remove();
      };
      return (
        <Modal wide title={`Export for AI — ${record.reference_code}`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Close</Btn><Btn kind="ghost" onClick={download}>Download .txt</Btn><Btn onClick={copy}><Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />{copied ? 'Copied' : 'Copy everything'}</Btn></>}>
          <p className="mb-3 text-sm text-slate-600">Copy this and paste it into ChatGPT, Claude or any AI tool — it contains the instructions and every fact, ready to turn into the website description. <b>The owner's name and phone, the source and staff names are never included.</b></p>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <Field label="Write the description in"><Select value={language} onChange={(v) => { const x = v || 'English'; setLanguage(x); try { localStorage.setItem('hvops_ai_lang', x); } catch (e) {} }} options={AI_LANGS} /></Field>
            <Field label="Facts format"><Select value={format} onChange={(v) => setFormat(v || 'text')} options={[['text', 'Plain list (best for chat tools)'], ['json', 'JSON (for automations)']]} /></Field>
          </div>
          {missing.length > 0 && <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">Not filled in yet, so the AI is told to leave them out: {missing.join(', ')}.</div>}
          <textarea readOnly rows={16} className={`${inputCls()} !text-xs font-mono leading-relaxed`} value={brief} onFocus={(e) => e.target.select()} />
        </Modal>
      );
    };

    // Settings > Lists: the instruction block that opens every AI brief
    const AiPromptEditor = () => {
      const { cfg, saveSetting } = useApp();
      const [txt, setTxt] = useState(cfg.ai_brief_instructions || AI_DEFAULT_INSTRUCTIONS);
      return (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-brand-800">AI export — instructions sent with every listing / project</h3>
          <p className="mb-2 text-xs text-slate-500">This text opens every “Export for AI” brief. Put your house style here once (tone, words to avoid, how to sign off).</p>
          <textarea rows={9} className={`${inputCls()} !text-sm`} value={txt} onChange={(e) => setTxt(e.target.value)} />
          <div className="mt-2 flex gap-2"><Btn onClick={() => saveSetting('ai_brief_instructions', txt)}>Save</Btn><Btn kind="ghost" onClick={() => setTxt(AI_DEFAULT_INSTRUCTIONS)}>Reset to default</Btn></div>
        </Card>
      );
    };
