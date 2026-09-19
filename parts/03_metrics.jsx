
    // =========================================================================================
    // KPI + REPORT MATH (pure functions over the loaded data; same rules as vw_listing_sla / vw_user_kpis)
    // =========================================================================================
    const SHOOT_TYPES = ['photo_shoot', 'video_shoot', 'shoot'];

    function listingStats(listings, channels, slaCfg, now) {
      const live = listings.filter((l) => l.status !== 'archived');
      const s = live.map((l) => slaOf(l, slaCfg, now));
      const verified = s.filter((x) => x.verified);
      const ids = new Set(live.filter((l) => l.status !== 'rejected').map((l) => l.id));
      const ch = channels.filter((c) => ids.has(c.listing_id));
      return {
        entered: live.length,
        verified: verified.length,
        avg_hours: r1(avg(verified.map((x) => x.hours))),
        on_time_pct: pct(verified.filter((x) => x.onTime).length, verified.length),
        avg_completeness: r1(avg(live.map((l) => l.completeness_pct))),
        breached: s.filter((x, i) => x.state === 'red' && live[i].status !== 'rejected').length,
        rejected: live.filter((l) => l.status === 'rejected').length,
        claimed_not_found: s.filter((x) => x.claimedNotFound).length,
        portal_coverage_pct: pct(ch.filter((c) => c.status === 'published').length, ch.length),
      };
    }

    function userKpis(user, range, data, slaCfg, now) {
      const ls = data.listings.filter((l) => l.entered_by === user.id && inRange(l.date_received, range));
      const st = listingStats(ls, data.listing_channels, slaCfg, now);
      const ts = data.tasks.filter((t) => t.assigned_to === user.id && t.status !== 'cancelled' && inRange(t.due_at || t.created_at, range));
      const done = ts.filter((t) => t.status === 'done');
      const onTime = done.filter((t) => !t.due_at || (t.completed_at && new Date(t.completed_at) <= new Date(t.due_at)));
      const lateOpen = ts.filter((t) => t.status !== 'done' && t.due_at && new Date(t.due_at).getTime() < now);
      const shootDone = done.filter((t) => SHOOT_TYPES.includes(t.task_type));
      const mediaListingIds = new Set(done.filter((t) => t.listing_id).map((t) => t.listing_id));
      return {
        user_id: user.id, name: user.full_name || user.email, role: user.role,
        listings_entered: st.entered, avg_completeness: st.avg_completeness, avg_hours_to_publish: st.avg_hours,
        on_time_pct: st.on_time_pct, rejected_count: st.rejected, portal_coverage_pct: st.portal_coverage_pct,
        claimed_not_found: st.claimed_not_found, verified: st.verified, breached: st.breached,
        tasks_completed: done.length, tasks_due: ts.length, tasks_late: lateOpen.length + (done.length - onTime.length),
        tasks_on_time_pct: pct(onTime.length, done.length + lateOpen.length),
        deliverables_logged: data.agency_deliverables.filter((d) => d.logged_by === user.id && inRange(d.created_at, range)).length,
        shoots_completed: shootDone.length,
        media_complete: data.listings.filter((l) => mediaListingIds.has(l.id) && l.media_uploaded === true && l.media_edited === true).length,
      };
    }

    function agencyScorecard(agency, ym, data) {
      const ds = data.agency_deliverables.filter((d) => d.agency_id === agency.id && d.period_month === ym);
      const ms = Object.fromEntries(data.agency_metrics.filter((m) => m.agency_id === agency.id && m.period_month === ym).map((m) => [m.metric_key, Number(m.metric_value)]));
      const planned = ds.reduce((a, d) => a + (d.planned_qty || 0), 0), delivered = ds.reduce((a, d) => a + (d.delivered_qty || 0), 0);
      const deliveredItems = ds.filter((d) => d.delivered_at);
      const onTime = deliveredItems.filter((d) => d.due_date && ymd(d.delivered_at) <= d.due_date);
      const revisions = ds.reduce((a, d) => a + (d.revisions_count || 0), 0);
      const leads = ms.leads != null ? ms.leads : ms.organic_leads;
      const spend = ms.ad_spend != null ? ms.ad_spend : null;
      // cost per lead = ad spend / leads. For an agency with no ad spend (SEO) the monthly fee is the cost.
      const cost = spend != null ? spend : agency.monthly_fee != null ? Number(agency.monthly_fee) : null;
      return {
        label: `${agency.display_name} — ${monthLabel(ym)}`, agency: agency.display_name, month: ym, items: ds.length, planned, delivered,
        delivery_rate: pct(delivered, planned), on_time_pct: pct(onTime.length, deliveredItems.length), revisions,
        revision_rate: pct(revisions, delivered), leads: leads == null ? null : leads, spend,
        cpl: cost != null && leads ? r1(cost / leads) : null, cpl_basis: spend != null ? 'ad spend' : 'monthly fee', currency: agency.currency || '',
      };
    }

    function buildReport(range, label, data, cfg, now) {
      const sla = cfg.sla_hours;
      const received = data.listings.filter((l) => l.status !== 'archived' && inRange(l.date_received, range));
      const verifiedInRange = data.listings.filter((l) => inRange(l.date_published_verified, range));
      const open = data.listings.filter((l) => !['archived', 'rejected', 'verified_live'].includes(l.status));
      const openSla = open.map((l) => slaOf(l, sla, now));
      const tasksDue = data.tasks.filter((t) => t.status !== 'cancelled' && inRange(t.due_at, range));
      const group = (keyFn, labelFn) => {
        const m = new Map();
        received.forEach((l) => { const k = keyFn(l) || '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(l); });
        return [...m.entries()].map(([k, ls]) => ({ label: labelFn ? labelFn(k) : k, ...listingStats(ls, data.listing_channels, sla, now) })).sort((a, b) => b.entered - a.entered);
      };
      const nameOf = (id) => { const p = data.profiles.find((x) => x.id === id); return p ? p.full_name || p.email : '—'; };
      const recIds = new Set(received.filter((l) => l.status !== 'rejected').map((l) => l.id));
      const chRows = data.listing_channels.filter((c) => recIds.has(c.listing_id));
      const channels = [...new Set(chRows.map((c) => c.channel))].map((c) => {
        const rows = chRows.filter((x) => x.channel === c);
        return { label: (cfg.portal_labels || {})[c] || titleCase(c), total: rows.length, published: rows.filter((x) => x.status === 'published').length,
          in_progress: rows.filter((x) => x.status === 'in_progress').length, rejected: rows.filter((x) => x.status === 'rejected').length,
          coverage_pct: pct(rows.filter((x) => x.status === 'published').length, rows.length) };
      });
      const months = [], lastMonth = monthStart(addDays(range.to, -1));
      for (let m = monthStart(range.from); m <= lastMonth && months.length < 24; m = addMonths(m, 1)) months.push(m);
      const recSla = received.map((l) => slaOf(l, sla, now));
      return {
        label, from: ymd(range.from), to: ymd(addDays(range.to, -1)), generated_at: new Date(now).toISOString(),
        summary: {
          entered: received.length, verified: verifiedInRange.length,
          breaches_open: openSla.filter((s) => s.state === 'red').length,
          incomplete_open: open.filter((l) => l.completeness_pct < 100).length,
          claimed_not_found: openSla.filter((s) => s.claimedNotFound).length,
          tasks_completed: tasksDue.filter((t) => t.status === 'done').length, tasks_due: tasksDue.length,
        },
        sla: { green: recSla.filter((s) => s.state === 'green').length, yellow: recSla.filter((s) => s.state === 'yellow').length, red: recSla.filter((s) => s.state === 'red').length },
        kpis: data.profiles.filter((p) => p.is_active && p.role !== 'admin').map((p) => userKpis(p, range, data, sla, now)),
        breakdowns: {
          person: group((l) => l.entered_by, nameOf), source: group((l) => l.source_type, titleCase),
          source_name: group((l) => `${titleCase(l.source_type)} · ${l.source_name}`), location: group((l) => l.location),
          channel: channels, agency: data.agencies.flatMap((a) => months.map((m) => agencyScorecard(a, m, data))).filter((r) => r.items > 0 || r.leads != null),
        },
      };
    }
