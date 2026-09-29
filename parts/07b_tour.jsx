
    // =========================================================================================
    // GUIDE TOUR — the content for the shared tour engine (https://hv-shared.pages.dev/hv-tour.js).
    // The engine draws the "Tour" button, the spotlight and the guide; it is started once in App (08_settings_app.jsx).
    // Anchors: data-tour="<target>" on the elements below, data-tour-nav="<page>" on every menu item
    // (a new menu page with no written step still gets an automatic step).
    // =========================================================================================

    // Lets a page open / close one of its own forms (or switch a tab) while the tour explains it.
    // Only what the tour opened is closed again, and the tour never saves anything (its overlay blocks every click).
    const useTourAction = (handlers) => {
      const h = useRef(handlers); h.current = handlers;
      useEffect(() => {
        let opened = false;
        const on = (e) => {
          const a = e.detail && e.detail.action; if (!a) return;
          if (a === 'close') { if (opened && h.current.close) h.current.close(); opened = false; return; }
          if (!h.current[a] || h.current[a]() === false) return;
          opened = true;
          setTimeout(() => { try { const el = document.activeElement; if (el && el !== document.body) el.blur(); } catch (x) {} }, 120);   // no phone keyboard over the tour card
        };
        window.addEventListener('hv-tour', on);
        return () => window.removeEventListener('hv-tour', on);
      }, []);
    };

    /* HV-TOUR-STEPS-START — keep in sync with the screens: every change to a screen updates its step here */
    const HV_TOUR_CHAPTERS = [
      ['start', 'Getting started', 'البداية'],
      ['listings', 'Listings', 'الوحدات (Listings)'],
      ['entry', 'New listing & reference codes', 'إدخال وحدة جديدة وكود المرجع'],
      ['lifecycle', 'Listing lifecycle & the 72h SLA', 'مراحل الوحدة ومهلة الـ 72 ساعة'],
      ['projects', 'Projects', 'المشروعات (Projects)'],
      ['photo', 'Needs photography', 'طلبات التصوير'],
      ['tasks', 'Tasks & alerts', 'المهام والتنبيهات'],
      ['perf', 'Agencies, KPIs & reports', 'الوكالات والمؤشرات والتقارير'],
      ['settings', 'Settings (admin)', 'الإعدادات (للأدمن)'],
      ['roles', 'Roles, permissions & systems', 'الأدوار والصلاحيات والأنظمة'],
    ];
    const HV_TOUR_STEPS = [
      // ---------------------------------------------------------------- Getting started
      { c: 'start', page: 'dashboard', target: 'menu',
        en: ['Welcome to HV Ops', 'HV Ops follows every property from the moment its information reaches us until it is live on home-vacation.com — plus projects, photo shoots, tasks and agency work. The menu shows only the pages your role can use (on a phone: the bottom bar and “More”).'],
        ar: ['أهلاً بك في HV Ops', 'يتابع HV Ops كل عقار من لحظة وصول بياناته إلينا حتى يظهر على موقع home-vacation.com، بالإضافة إلى المشروعات وجلسات التصوير والمهام وعمل الوكالات. القائمة تعرض فقط الصفحات المسموحة لدورك (على الموبايل: الشريط السفلي وزر «More»).'] },
      { c: 'start', page: 'dashboard', target: 'dash-top',
        en: ['Home — your numbers first', 'Staff see their own month-to-date KPIs against target (green ✓ = met). Managers see red counters instead: SLA breached, claimed but not found, incomplete, waiting for approval and overdue tasks — tap a counter to jump to it.'],
        ar: ['الرئيسية — أرقامك أولاً', 'الموظف يرى مؤشرات أدائه منذ بداية الشهر مقارنة بالهدف (✓ أخضر = تحقق الهدف). المدير يرى بدلاً منها عدادات حمراء: تجاوز المهلة، منشور ولم يُعثر عليه، غير مكتمل، بانتظار الموافقة، ومهام متأخرة — اضغط العداد للانتقال إليه.'] },
      { c: 'start', page: 'dashboard', target: 'dash-lists',
        en: ['Red items first', 'Below are the lists that need you today: your SLA clocks, incomplete listings, items waiting for you to upload, your shoots and tasks due today. Managers get breaches, claims not found on the website, at-risk listings, approvals and a Team KPI table. Click any line to open it.'],
        ar: ['الأحمر أولاً', 'تحتها القوائم التي تحتاجك اليوم: عدّادات المهلة الخاصة بك، الوحدات غير المكتملة، ما ينتظر أن ترفعه، جلسات التصوير، والمهام المستحقة اليوم. المدير يرى تجاوزات المهلة، وما قيل إنه نُشر ولم يُعثر عليه في الموقع، والوحدات المعرّضة للتأخير، والموافقات، وجدول مؤشرات الفريق. اضغط أي سطر لفتحه.'] },

      // ---------------------------------------------------------------- Listings
      { c: 'listings', page: 'listings', target: 'listing-tabs',
        en: ['Three tabs, one pipeline', '“In progress” holds drafts, ready-to-publish and on-hold listings — only what still needs work. A listing moves to “Published” the moment someone marks it published, and to “Rejected / archived” when a manager closes it.'],
        ar: ['ثلاث تبويبات لمسار واحد', 'تبويب «In progress» فيه المسودات والجاهز للنشر والمعلّق — أي ما زال يحتاج عملاً فقط. تنتقل الوحدة إلى «Published» لحظة أن يعلّمها أحد كمنشورة، وإلى «Rejected / archived» عندما يغلقها المدير.'] },
      { c: 'listings', page: 'listings', target: 'listing-search',
        en: ['Search and filters', 'Search by reference code, owner name or phone, title or source. “Filters” narrows the list by status, SLA state, location, source, who entered it, completeness and the date received.'],
        ar: ['البحث والفلاتر', 'ابحث بكود المرجع أو اسم المالك أو رقمه أو العنوان أو المصدر. زر «Filters» يصفّي حسب الحالة، حالة المهلة، المنطقة، المصدر، من أدخلها، نسبة الاكتمال، وتاريخ الاستلام.'] },
      { c: 'listings', page: 'listings', target: 'listing-list',
        en: ['Reading the list', 'The coloured left edge is the SLA state. Each row shows the code, owner, status, SLA chip, completeness % and who entered it; on the Published tab you see who uploaded it and how fast it went live. Click a row to open the listing.'],
        ar: ['قراءة القائمة', 'اللون على الحافة اليسرى هو حالة المهلة. كل صف يعرض الكود والمالك والحالة وشارة المهلة ونسبة الاكتمال ومن أدخلها؛ وفي تبويب Published ترى من رفعها وكم استغرقت حتى ظهرت على الموقع. اضغط الصف لفتح الوحدة.'] },
      { c: 'listings', page: 'listings', target: 'sla-chip',
        en: ['The 72-hour SLA chip', 'The clock starts at “Date received” and stops only when the verifier finds the listing live on home-vacation.com. Green = under 48h, amber = at risk (48–72h), red = breached (over 72h). Time on hold is not counted — the chip then says “Paused”.'],
        ar: ['شارة مهلة الـ 72 ساعة', 'يبدأ العدّاد من «Date received» ولا يتوقف إلا عندما يجد المُتحقِّق الآلي الوحدة منشورة فعلاً على home-vacation.com. الأخضر = أقل من 48 ساعة، الأصفر = معرّضة للتأخير (48–72)، الأحمر = تجاوزت 72 ساعة. وقت التعليق (On hold) لا يُحتسب وتظهر الشارة «Paused».'] },
      { c: 'listings', page: 'listings', target: 'listing-io',
        en: ['Import and export', '“Import Basic Info” reads the office “Basic Required Info” Excel sheets — single files or whole folders; the owner and an existing File Ref come from the folder name. “Import CSV” is for the old backlog, with a dry-run preview. Nothing is saved until you confirm. “Export CSV” and “Export Basic Info” download what is on screen.'],
        ar: ['الاستيراد والتصدير', 'زر «Import Basic Info» يقرأ ملفات Excel الخاصة بالمكتب «Basic Required Info» — ملف واحد أو مجلد كامل؛ ويُؤخذ اسم المالك والـ File Ref الموجود من اسم المجلد. زر «Import CSV» للأرشيف القديم مع معاينة تجريبية. لا يُحفظ شيء قبل أن تؤكد. و«Export CSV» و«Export Basic Info» ينزّلان ما يظهر على الشاشة.'] },

      // ---------------------------------------------------------------- New listing & reference codes
      { c: 'entry', page: 'listings', target: 'new-listing',
        en: ['Enter it the day it arrives', 'Press “New listing” as soon as the information reaches you — the 72h clock runs from the date received, not from when you type it. You can save a draft with only the basics and complete it later.'],
        ar: ['أدخلها في نفس يوم وصولها', 'اضغط «New listing» بمجرد وصول البيانات — مهلة الـ 72 ساعة تُحسب من تاريخ الاستلام وليس من وقت الإدخال. يمكنك حفظ مسودة بالأساسيات فقط وإكمالها لاحقاً.'] },
      { c: 'entry', page: 'listings', action: 'open-new-listing', target: 'form-completeness',
        en: ['Completeness meter', 'It updates while you type. Red fields are required — the admin chooses them in Settings → Required fields. A draft can be saved at any %, but “Ready to publish” unlocks only at 100%.'],
        ar: ['مؤشر الاكتمال', 'يتحدّث أثناء الكتابة. الحقول الحمراء مطلوبة، ويحددها الأدمن من Settings → Required fields. يمكن حفظ المسودة بأي نسبة، لكن زر «Ready to publish» لا يعمل إلا عند 100%.'] },
      { c: 'entry', page: 'listings', action: 'open-new-listing', target: 'form-basics',
        en: ['The basics build the reference code', 'Location + property type + sale/rent make the code LOC-TYPE-SERIAL-S/R, e.g. HD-A-1012-S: location code, unit-type code, one company-wide running number (the last one used on the website or in HV Ops + 1), S = sale, R = rent. These three lock after saving. “Date received” is the SLA start; only an admin can change it later.'],
        ar: ['الأساسيات تصنع كود المرجع', 'المنطقة + نوع الوحدة + بيع/إيجار تكوّن الكود LOC-TYPE-SERIAL-S/R مثل HD-A-1012-S: كود المنطقة، كود نوع الوحدة، رقم مسلسل واحد للشركة كلها (آخر رقم مستخدم على الموقع أو في HV Ops + 1)، S = بيع و R = إيجار. هذه الثلاثة تُقفل بعد الحفظ. «Date received» هو بداية المهلة ولا يعدّله لاحقاً إلا الأدمن.'] },
      { c: 'entry', page: 'listings', action: 'open-new-listing', target: 'form-media',
        en: ['Media flags — the manager approves', 'Photos stay on the company intranet; nothing is uploaded here. Only a manager can set “Photos ready” to Yes after reviewing them — everyone else sees “Waiting for the manager”. A listing cannot reach 100% until it is Yes. Also answer: logo added, edited, and whether the cover photo belongs to this unit.'],
        ar: ['علامات الصور — الموافقة للمدير', 'الصور تبقى على شبكة الشركة الداخلية ولا يُرفع شيء هنا. المدير فقط يستطيع وضع «Photos ready» = Yes بعد مراجعتها — والباقون يرون «بانتظار المدير». لا تصل الوحدة إلى 100% قبل أن تصبح Yes. أجب أيضاً: هل عليها اللوجو، هل عُدّلت، وهل صورة الغلاف تخص هذه الوحدة.'] },
      { c: 'entry', page: 'listings', action: 'open-new-listing', target: 'form-commercial',
        en: ['Specs, price and marketing', 'Fill area, floors, rooms, view and furnishing, then price, currency and “Price details” (per month, incl. maintenance…). Amounts are never converted between currencies. Facilities and selling points feed the website text.'],
        ar: ['المواصفات والسعر والتسويق', 'املأ المساحة والأدوار والغرف والإطلالة والفرش، ثم السعر والعملة و«Price details» (شهرياً، شامل الصيانة…). المبالغ لا تُحوَّل أبداً بين العملات. المرافق ونقاط البيع تُستخدم في نص الموقع.'] },
      { c: 'entry', page: 'listings', action: 'open-new-listing', target: 'form-owner',
        en: ['Owner, source and uploader', 'Owner name and phone are searchable later. Source type and source name (who gave it) are needed to save. “Uploader” is the person who puts it online — by default the uploader set in Settings. “Entered by” is you, automatically: e.g. Sally enters, Lucy uploads, and each is credited for her own stage.'],
        ar: ['المالك والمصدر ومن يرفع', 'اسم المالك ورقمه يمكن البحث بهما لاحقاً. نوع المصدر واسم المصدر (من أعطانا الوحدة) مطلوبان للحفظ. «Uploader» هو من سيرفعها على الموقع — افتراضياً الشخص المحدد في الإعدادات. «Entered by» هو أنت تلقائياً: مثلاً سالي تُدخل ولوسي ترفع، وكلٌّ منهما تُحتسب لها مرحلتها.'] },
      { c: 'entry', page: 'listings', action: 'open-new-listing', target: 'form-save',
        en: ['Save & generate code', 'Saving creates the reference code at once, adds the default publishing channels and opens the listing. A warning appears if another listing has the same title. (The tour never saves — it only shows the form.)'],
        ar: ['الحفظ وإنشاء الكود', 'الحفظ يُنشئ كود المرجع فوراً ويضيف قنوات النشر الافتراضية ويفتح الوحدة. يظهر تنبيه إذا وُجدت وحدة أخرى بنفس العنوان. (الجولة لا تحفظ أي شيء — تعرض النموذج فقط.)'] },

      // ---------------------------------------------------------------- Listing lifecycle & SLA (opens the most recent listing, read only)
      { c: 'lifecycle', page: 'listings', action: 'open-first-listing', target: 'ref-code',
        en: ['The code is the File Ref on the website', 'Press “Copy” and paste the code exactly into the WordPress “File Ref” field. That is how the website is matched: a missing or mistyped File Ref can never be verified, so the SLA keeps running.'],
        ar: ['الكود = File Ref على الموقع', 'اضغط «Copy» والصق الكود كما هو في حقل «File Ref» في ووردبريس. بهذا تتم مطابقة الموقع: أي File Ref ناقص أو خاطئ لن يُتحقق منه أبداً وتظل المهلة تعدّ.'] },
      { c: 'lifecycle', page: 'listings', action: 'open-first-listing', target: 'listing-actions',
        en: ['Draft → Ready → Published → Verified', 'When every required field is filled press “Ready to publish”. The uploader puts it on the website, then presses “I uploaded it — mark as published”. “Verified live” is set by the verifier only — nobody sets it by hand. “Back to draft” returns it for corrections.'],
        ar: ['مسودة ← جاهزة ← منشورة ← مؤكَّدة', 'عند اكتمال الحقول المطلوبة اضغط «Ready to publish». من يرفعها يضعها على الموقع ثم يضغط «I uploaded it — mark as published». حالة «Verified live» يضعها المُتحقِّق الآلي وحده — لا أحد يضعها يدوياً. «Back to draft» يعيدها للتصحيح.'] },
      { c: 'lifecycle', page: 'listings', action: 'open-first-listing', target: 'listing-actions',
        en: ['On hold, reject, archive', '“Put on hold” needs a reason and pauses the SLA clock; “Resume” restarts it. Managers can “Reject” (reason required; its KPI credit is cancelled), “Reopen as draft” and “Archive” — archived listings are hidden, never deleted.'],
        ar: ['تعليق ورفض وأرشفة', '«Put on hold» يحتاج سبباً ويوقف عدّاد المهلة، و«Resume» يعيد تشغيله. المدير يستطيع «Reject» (بسبب إلزامي وتُلغى نقاط المؤشرات الخاصة بها)، و«Reopen as draft»، و«Archive» — الأرشفة تُخفي الوحدة ولا تحذفها أبداً.'] },
      { c: 'lifecycle', page: 'listings', action: 'open-first-listing', target: 'sla-timeline',
        en: ['Verified live — the clock stops', 'Every hour the verifier reads home-vacation.com and looks for each File Ref. When it finds yours it marks the listing verified live, saves the page link and stops the clock. Claimed published but still not found after 24h → a red “Claimed, not found” alert.'],
        ar: ['التأكيد على الموقع — يتوقف العدّاد', 'كل ساعة يقرأ المُتحقِّق موقع home-vacation.com ويبحث عن كل File Ref. عندما يجد كودك يعلّم الوحدة «Verified live» ويحفظ رابط الصفحة ويوقف العدّاد. إذا قيل إنها نُشرت ولم يُعثر عليها بعد 24 ساعة ← تنبيه أحمر «Claimed, not found».'] },
      { c: 'lifecycle', page: 'listings', action: 'open-first-listing', target: 'listing-channels',
        en: ['Publishing channels', 'Each portal has its own status (not started, in progress, published, rejected) and link. The website channel is filled in by the verifier; add other portals with “+ Add channel…”. Portal coverage counts in the KPIs.'],
        ar: ['قنوات النشر', 'لكل منصة حالتها (not started / in progress / published / rejected) ورابطها. قناة الموقع يملؤها المُتحقِّق تلقائياً؛ أضف منصات أخرى من «+ Add channel…». نسبة التغطية على المنصات تدخل في المؤشرات.'] },
      { c: 'lifecycle', page: 'listings', action: 'open-first-listing', target: 'ai-export',
        en: ['Export for AI', 'Builds a ready brief to paste into ChatGPT, Claude or any AI tool so it writes the website description, in the language you pick. The owner’s name and phone, the source and staff names are never included. “Basic Info .xlsx” exports this listing in the office sheet layout.'],
        ar: ['التصدير للذكاء الاصطناعي', 'يجهّز نصاً كاملاً تلصقه في ChatGPT أو Claude أو أي أداة ليكتب وصف الموقع باللغة التي تختارها. اسم المالك ورقمه والمصدر وأسماء الموظفين لا تُضمَّن أبداً. زر «Basic Info .xlsx» يصدّر الوحدة بشكل ملف المكتب.'] },

      // ---------------------------------------------------------------- Projects
      { c: 'projects', page: 'projects', target: 'new-project',
        en: ['Projects — compounds and resorts', 'Developer projects follow the same pipeline as units: entry → ready → uploaded → verified live, with their own, longer SLA. Each gets a Project ID P-LOC-SERIAL-S with its own running number. Hold, reject and archive work exactly as for listings.'],
        ar: ['المشروعات — الكمباوندات والمنتجعات', 'مشروعات المطوّرين تمر بنفس مسار الوحدات: إدخال ← جاهز ← مرفوع ← مؤكَّد على الموقع، ولها مهلة خاصة أطول. كل مشروع يأخذ Project ID بالشكل P-LOC-SERIAL-S برقم مسلسل خاص بالمشروعات. التعليق والرفض والأرشفة تعمل تماماً مثل الوحدات.'] },
      { c: 'projects', page: 'projects', action: 'open-new-project', target: 'pform-top',
        en: ['The project form', 'Name, developer, location, unit types and sizes, starting price, down payment, installments, delivery date and finishing. Its required fields are set separately in Settings. As with listings, only a manager marks the photos & brochure ready.'],
        ar: ['نموذج المشروع', 'الاسم والمطوّر والمنطقة وأنواع الوحدات ومساحاتها وسعر البداية والمقدم والأقساط وموعد الاستلام والتشطيب. الحقول المطلوبة للمشروعات تُحدَّد منفصلة في الإعدادات. ومثل الوحدات، المدير فقط يعلّم الصور والبروشور كجاهزة.'] },
      { c: 'projects', page: 'projects', action: 'open-first-project', target: 'project-code',
        en: ['Paste the Project ID', 'Copy the Project ID into the WordPress “Project ID” field. If it is left empty the website invents a PRJ-… number and the project can never be verified. Entering a project complete and getting it live on time both count in the KPIs.'],
        ar: ['الصق الـ Project ID', 'انسخ الـ Project ID في حقل «Project ID» في ووردبريس. إذا تُرك فارغاً يخترع الموقع رقم PRJ-… ولن يتم التحقق من المشروع أبداً. إدخال المشروع كاملاً ونشره في الوقت يُحتسبان في المؤشرات.'] },

      // ---------------------------------------------------------------- Needs photography
      { c: 'photo', page: 'photo', target: 'add-photo',
        en: ['Needs photography', 'Register a property here when it must be photographed before it can be listed — owner name and location are enough. It gets a PH-0001 number now and its real code later. Stages: needs scheduling → scheduled → shot → approved → listing created. Red = unscheduled for 2+ days or shoot overdue.'],
        ar: ['طلبات التصوير', 'سجّل العقار هنا عندما يحتاج تصويراً قبل أن يُدخل كوحدة — يكفي اسم المالك والمنطقة. يأخذ رقماً مثل PH-0001 الآن وكوده الحقيقي لاحقاً. المراحل: يحتاج موعداً ← موعد محدد ← تم التصوير ← تمت الموافقة ← أُنشئت الوحدة. الأحمر = بلا موعد لأكثر من يومين أو تأخر التصوير.'] },
      { c: 'photo', page: 'photo', action: 'open-photo-request', target: 'photo-form',
        en: ['Assign and schedule', 'Write where exactly (building, unit, keys, access), pick the photographer, the shoot date & time and who gave the property. Once a date is saved the request moves to “Shoot scheduled”.'],
        ar: ['التكليف وتحديد الموعد', 'اكتب المكان بالضبط (المبنى، الوحدة، المفاتيح، طريقة الدخول)، واختر المصوّر وموعد التصوير ومن أعطانا العقار. بمجرد حفظ الموعد ينتقل الطلب إلى «Shoot scheduled».'] },
      { c: 'photo', page: 'photo', target: 'photo-actions',
        en: ['Photos taken → the manager reviews', 'After the shoot press “Photos taken” and write the intranet folder name (required), the counts, logo and edited. The manager then presses “Approve photos” or “Needs re-shoot” with a note that goes back to the photographer.'],
        ar: ['تم التصوير ← مراجعة المدير', 'بعد التصوير اضغط «Photos taken» واكتب اسم المجلد على الشبكة الداخلية (إلزامي) وعدد الصور والفيديو واللوجو والتعديل. ثم يضغط المدير «Approve photos» أو «Needs re-shoot» مع ملاحظة تعود للمصوّر.'] },
      { c: 'photo', page: 'photo', target: 'photo-actions',
        en: ['Create the listing', 'Once approved, anyone can press “Create the listing”: the form opens pre-filled with owner, location, type and source, and “Photos ready = Yes” travels with it. Every approved shoot is credited to the photographer.'],
        ar: ['إنشاء الوحدة', 'بعد الموافقة يستطيع أي شخص الضغط على «Create the listing»: يُفتح النموذج مملوءاً بالمالك والمنطقة والنوع والمصدر، وتنتقل معه «Photos ready = Yes». كل تصوير تمت الموافقة عليه يُحتسب للمصوّر.'] },

      // ---------------------------------------------------------------- Tasks & alerts
      { c: 'tasks', page: 'tasks', target: 'task-board',
        en: ['The task board', 'Four columns: To do, Doing, Review, Done (on a phone, one tab per column). Overdue cards turn red; done tasks stay visible for 14 days. The name filter at the top shows “My tasks”, everyone or one person.'],
        ar: ['لوحة المهام', 'أربعة أعمدة: To do و Doing و Review و Done (على الموبايل تبويب لكل عمود). البطاقات المتأخرة تصبح حمراء، والمهام المنتهية تبقى ظاهرة 14 يوماً. فلتر الاسم بالأعلى يعرض «My tasks» أو الجميع أو شخصاً معيّناً.'] },
      { c: 'tasks', page: 'tasks', action: 'open-new-task', target: 'task-form',
        en: ['New task', 'Give a title, assignee, type, due date and priority; link a listing or an agency if it is about one. The assignee receives the task by e-mail (and WhatsApp when switched on) with a link that opens it.'],
        ar: ['مهمة جديدة', 'اكتب العنوان والمسؤول والنوع وموعد التسليم والأولوية، واربطها بوحدة أو وكالة إن كانت تخصها. يستلم المسؤول المهمة بالإيميل (وواتساب عند تفعيله) مع رابط يفتحها مباشرة.'] },
      { c: 'tasks', page: 'tasks', target: 'task-board',
        en: ['Start → Review → Approve', 'Open a card: “Start”, then “Submit for review”. Only a manager can “Approve” it or “Send back” with a reason. On a computer you can also drag cards between columns. Done on time or late is counted in the KPIs and in HR.'],
        ar: ['ابدأ ← مراجعة ← موافقة', 'افتح البطاقة: «Start» ثم «Submit for review». المدير فقط يستطيع «Approve» أو «Send back» مع سبب. على الكمبيوتر يمكن سحب البطاقات بين الأعمدة. الإنجاز في الوقت أو التأخير يُحتسب في المؤشرات وفي نظام HR.'] },
      { c: 'tasks', page: 'tasks', target: 'recurring',
        en: ['Recurring tasks (managers)', '“↻ Recurring” holds daily, weekly and monthly templates. Every night just after midnight (Cairo) that day’s tasks are created from the active templates. Pause or resume a template any time.'],
        ar: ['المهام المتكررة (للمدير)', 'زر «↻ Recurring» فيه قوالب يومية وأسبوعية وشهرية. كل ليلة بعد منتصف الليل بتوقيت القاهرة تُنشأ مهام اليوم من القوالب المفعّلة. يمكن إيقاف أي قالب أو إعادة تشغيله في أي وقت.'] },
      { c: 'tasks', page: 'alerts', target: 'alerts-list',
        en: ['Alerts', 'The verifier raises alerts every hour: at risk, SLA breached, still incomplete after 24h, claimed but not found on the website, tasks due, and “verified live” news. Click an alert to open its record — it is marked read; “Mark all read” clears the rest. Critical alerts also show as a red bar on top of every page.'],
        ar: ['التنبيهات', 'يُصدر المُتحقِّق التنبيهات كل ساعة: معرّض للتأخير، تجاوز المهلة، غير مكتمل بعد 24 ساعة، قيل إنه نُشر ولم يوجد على الموقع، مهام مستحقة، وأخبار «Verified live». اضغط التنبيه لفتح سجله فيُعلَّم كمقروء، و«Mark all read» يعلّم الباقي. التنبيهات الحرجة تظهر أيضاً كشريط أحمر أعلى كل صفحة.'] },

      // ---------------------------------------------------------------- Agencies, KPIs & reports
      { c: 'perf', page: 'agencies', target: 'agency-tabs',
        en: ['Agency scorecards', 'One tab per agency — London Marketing Studios (social media & paid ads) and IZMI (SEO). Agencies have no login: our staff log their work. Pick the month at the top; “Print” gives the contract-renewal document. Visible to admins, managers and marketing.'],
        ar: ['تقييم الوكالات', 'تبويب لكل وكالة — London Marketing Studios (السوشيال ميديا والإعلانات الممولة) و IZMI (السيو). الوكالات ليس لها دخول: موظفونا يسجّلون عملها. اختر الشهر بالأعلى، وزر «Print» يطبع مستند تجديد العقد. تظهر للأدمن والمديرين والتسويق.'] },
      { c: 'perf', page: 'agencies', target: 'agency-deliverables',
        en: ['Deliverables', 'Plan each month’s items (posts, reels, ads, articles, backlinks…) with planned vs delivered quantity, due date and a proof link; “Copy plan from last month” saves typing. Managers “Approve” submitted items or ask to “Revise” (counted as a revision).'],
        ar: ['المخرجات', 'خطّط بنود كل شهر (بوستات، ريلز، إعلانات، مقالات، باك لينكس…) بالكمية المخططة مقابل المسلّمة وتاريخ الاستحقاق ورابط الإثبات؛ و«Copy plan from last month» يوفر الكتابة. المدير يضغط «Approve» على البنود المسلّمة أو «Revise» (تُحسب كمراجعة).'] },
      { c: 'perf', page: 'agencies', target: 'agency-tiles',
        en: ['The score', 'Delivery rate, on-time delivery, revision rate and cost per lead (ad spend ÷ leads, or the monthly fee ÷ leads for SEO). Monthly numbers such as reach and leads are typed in “Performance numbers”; amounts are never converted. The trend table compares the last 4 months.'],
        ar: ['النتيجة', 'نسبة التسليم، التسليم في الموعد، نسبة المراجعات، وتكلفة العميل المحتمل (الإنفاق الإعلاني ÷ العملاء، أو الرسوم الشهرية ÷ العملاء للسيو). الأرقام الشهرية مثل الوصول والعملاء تُكتب في «Performance numbers» ولا تُحوَّل العملات. جدول الاتجاه يقارن آخر 4 أشهر.'] },
      { c: 'perf', page: 'kpis', target: 'kpi-card',
        en: ['How KPIs are scored', 'Stage 1 (entry) counts for whoever entered the listing: listings entered, completeness, hours received → ready, still incomplete, rejected. Stage 2 (upload) counts for the uploader: uploaded, verified live, hours ready → live, within 72h, portal coverage, claimed not found. Marketing: tasks, deliverables, shoots, media complete. Staff see only their own card.'],
        ar: ['كيف تُحسب المؤشرات', 'المرحلة 1 (الإدخال) لمن أدخل الوحدة: عدد الوحدات، نسبة الاكتمال، الساعات من الاستلام حتى الجاهزية، غير المكتمل، المرفوض. المرحلة 2 (الرفع) لمن رفعها: المرفوع، المؤكَّد على الموقع، الساعات من الجاهزية حتى النشر، داخل 72 ساعة، تغطية المنصات، ما لم يُعثر عليه. التسويق: المهام والمخرجات والتصوير واكتمال الصور. كل موظف يرى بطاقته فقط.'] },
      { c: 'perf', page: 'kpis', target: 'kpi-board',
        en: ['Leaderboards and targets (managers)', 'Managers see a ranking per stage and for marketing, and set monthly targets per person with “Set targets”: green = met, red = missed. Only data entry, marketing and working managers are scored — admins / CEOs enter listings too but are never scored.'],
        ar: ['الترتيب والأهداف (للمدير)', 'المدير يرى ترتيباً لكل مرحلة وللتسويق، ويحدد أهدافاً شهرية لكل شخص من «Set targets»: الأخضر = تحقق، الأحمر = لم يتحقق. يُقيَّم فقط موظفو الإدخال والتسويق والمديرون العاملون — الأدمن / المديرون التنفيذيون يُدخلون وحدات أيضاً لكن لا يُقيَّمون أبداً.'] },
      { c: 'perf', page: 'kpis', target: 'kpi-note',
        en: ['Fed into HR automatically', 'A listing entered complete, verified live and published within the SLA, projects, tasks done on time or late and approved shoots are sent to the HR KPI module for the linked employee. Rejecting a listing cancels its credit. Nobody without an HR employee link is credited.'],
        ar: ['تنتقل إلى HR تلقائياً', 'الوحدة المُدخلة كاملة، والمؤكَّدة على الموقع، والمنشورة داخل المهلة، والمشروعات، والمهام في وقتها أو المتأخرة، والتصوير المعتمد — كلها تُرسل إلى وحدة المؤشرات في نظام HR للموظف المرتبط. رفض الوحدة يلغي نقاطها. من ليس له ربط بموظف في HR لا يُحتسب له شيء.'] },
      { c: 'perf', page: 'reports', target: 'report-presets',
        en: ['Reports (managers)', 'Daily (yesterday), weekly (last 7 days), monthly or a custom range, built live from the data: summary tiles, SLA distribution, the KPI table per person, and a breakdown by person, source, location, channel or agency.'],
        ar: ['التقارير (للمدير)', 'يومي (أمس)، أسبوعي (آخر 7 أيام)، شهري أو فترة مخصصة، تُبنى مباشرة من البيانات: ملخص، توزيع المهلة، جدول المؤشرات لكل شخص، وتفصيل حسب الشخص أو المصدر أو المنطقة أو القناة أو الوكالة.'] },
      { c: 'perf', page: 'reports', target: 'report-export',
        en: ['Export, print, freeze', '“CSV” downloads the report, “Print / PDF” prints it with the logo, and “Freeze snapshot” stores it so a closed month never changes — reopen it later from “Frozen snapshots”.'],
        ar: ['تصدير وطباعة وتجميد', '«CSV» ينزّل التقرير، و«Print / PDF» يطبعه باللوجو، و«Freeze snapshot» يحفظه حتى لا يتغير الشهر المُغلق أبداً — وتفتحه لاحقاً من «Frozen snapshots».'] },

      // ---------------------------------------------------------------- Settings (admin only)
      { c: 'settings', page: 'settings', action: 'settings-tab-loc', target: 'settings-body',
        en: ['Location and unit-type codes', 'These codes build every reference code (its first and second part). Changing a code only affects new listings — existing codes never change. A code used twice is blocked.'],
        ar: ['أكواد المناطق وأنواع الوحدات', 'هذه الأكواد تكوّن كل كود مرجع (الجزء الأول والثاني). تغيير الكود يؤثر على الوحدات الجديدة فقط — الأكواد الحالية لا تتغير أبداً. لا يُسمح بتكرار نفس الكود.'] },
      { c: 'settings', page: 'settings', action: 'settings-tab-req', target: 'settings-body',
        en: ['Required fields', 'Tick the fields that count toward 100% — separately for listings and for projects. A listing cannot become ready to publish until all are filled; existing listings are re-scored the next time they are saved.'],
        ar: ['الحقول المطلوبة', 'علّم الحقول التي تُحتسب في الـ 100% — منفصلة للوحدات وللمشروعات. لا تصبح الوحدة جاهزة للنشر قبل ملئها كلها؛ والوحدات الحالية يُعاد حسابها عند حفظها التالي.'] },
      { c: 'settings', page: 'settings', action: 'settings-tab-sla', target: 'settings-body',
        en: ['SLA & workflow', 'Set the hours for “at risk”, “breached”, the incomplete alert and “claimed, not found” — for listings and, separately, for projects — and the default uploader who receives every new listing to put online.'],
        ar: ['المهلة وسير العمل', 'حدد ساعات «معرّض للتأخير» و«تجاوز المهلة» وتنبيه عدم الاكتمال و«قيل إنه نُشر ولم يوجد» — للوحدات وللمشروعات كلٌّ على حدة — والشخص الافتراضي الذي تُسلَّم له كل وحدة جديدة ليرفعها.'] },
      { c: 'settings', page: 'settings', action: 'settings-tab-lists', target: 'settings-tabs',
        en: ['Portals, lists, KPI metrics, agencies', '“Portals” picks the channels every new listing gets. “Lists” holds facilities, views, currencies, task and deliverable types and the AI export instructions. “KPI metrics” defines each agency’s monthly numbers, and “Agencies” holds the contracts (fee, dates, contact, scope).'],
        ar: ['المنصات والقوائم ومؤشرات الوكالات والعقود', '«Portals» يحدد القنوات التي تأخذها كل وحدة جديدة. «Lists» فيها المرافق والإطلالات والعملات وأنواع المهام والمخرجات وتعليمات التصدير للذكاء الاصطناعي. «KPI metrics» تحدد أرقام كل وكالة الشهرية، و«Agencies» فيها العقود (الرسوم، التواريخ، جهة الاتصال، النطاق).'] },
      { c: 'settings', page: 'settings', action: 'settings-tab-verifier', target: 'settings-body',
        en: ['Verifier & messages', 'The worker URL enables “Run verifier now”. Below: every task message sent by e-mail or WhatsApp from HV Ops and Maintenance (sent every 5 minutes; “skipped” = no real e-mail / phone in HR) and the log of the last verifier runs.'],
        ar: ['المُتحقِّق والرسائل', 'رابط الـ worker يفعّل زر «Run verifier now». بالأسفل: كل رسائل المهام المرسلة بالإيميل أو واتساب من HV Ops والصيانة (تُرسل كل 5 دقائق؛ «skipped» = لا يوجد إيميل / رقم حقيقي في HR)، وسجل آخر مرات تشغيل المُتحقِّق.'] },

      // ---------------------------------------------------------------- Roles, permissions & systems
      { c: 'roles', page: 'dashboard', action: 'open-more', target: 'user-card',
        en: ['Four roles', 'Admin: everything, including Settings. Marketing manager: approvals, reports and targets. Data entry: listings, projects, photography, tasks and own KPIs (no Agencies). Marketing: agencies, tasks, shoots and own KPIs. Logins, roles and HV Ops access are managed in HR → Users (Settings → Users only lists them).'],
        ar: ['أربعة أدوار', 'Admin: كل شيء بما فيها الإعدادات. Marketing manager: الموافقات والتقارير والأهداف. Data entry: الوحدات والمشروعات والتصوير والمهام ومؤشراته فقط (بدون الوكالات). Marketing: الوكالات والمهام والتصوير ومؤشراته. الدخول والأدوار وتفعيل HV Ops تُدار من HR → Users (وصفحة Settings → Users تعرضهم فقط).'] },
      { c: 'roles', page: 'dashboard', action: 'open-more', target: 'user-card',
        en: ['What only managers do', 'Approving photos, tasks and agency deliverables, rejecting and archiving, the audit trail on every listing and project, KPI targets, reports and frozen snapshots. A listing can be edited by a manager, by whoever entered it, or by its uploader.'],
        ar: ['ما يفعله المدير فقط', 'اعتماد الصور والمهام ومخرجات الوكالات، الرفض والأرشفة، سجل التعديلات في كل وحدة ومشروع، أهداف المؤشرات، التقارير واللقطات المجمّدة. يعدّل الوحدة المدير أو من أدخلها أو من سيرفعها.'] },
      { c: 'roles', page: 'dashboard', action: 'open-more', target: 'systems',
        en: ['Systems switcher', 'One username and password for every Home Vacation system. The “Systems” links (on a phone: inside “More”) open the other systems ticked for you in HR — HR & Payroll, Maintenance, the CRM, HV Finance. “Sign out” is just below.'],
        ar: ['التنقل بين الأنظمة', 'اسم مستخدم وكلمة مرور واحدة لكل أنظمة Home Vacation. روابط «Systems» (على الموبايل داخل «More») تفتح الأنظمة المفعّلة لك في HR — الموارد البشرية والرواتب، الصيانة، الـ CRM، والمالية HV Finance. زر «Sign out» تحتها مباشرة.'] },
      { c: 'roles', page: 'dashboard', target: null,
        en: ['Help any time', 'The “Tour” button explains the page you are on, replays the full tour or opens this guide with every chapter. A new page added to the menu joins the tour automatically.'],
        ar: ['المساعدة في أي وقت', 'زر «Tour» يشرح الصفحة التي أنت عليها، أو يعيد الجولة كاملة، أو يفتح هذا الدليل بكل فصوله. أي صفحة جديدة تُضاف للقائمة تدخل الجولة تلقائياً.'] },
    ];
    /* HV-TOUR-STEPS-END */
