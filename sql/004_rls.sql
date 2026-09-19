-- HV OPS — 004_rls.sql
-- Row Level Security. Re-runnable: policies are dropped and recreated (policies only — never tables or data).
-- Supabase may show a "destructive operation" warning because of DROP POLICY. It is safe.

-- ops_my_role() / ops_is_staff() / ops_is_mgr() are created in 001.
create or replace function public.ops_owns_listing(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ops_listings where id = lid and (entered_by = auth.uid() or assigned_to = auth.uid()))
$$;

do $$
declare t text;
begin
  foreach t in array array['ops_settings','ops_listings','ops_listing_channels','ops_wp_listing_index','ops_wp_crawl_log',
    'ops_verifier_runs','ops_recurring_templates','ops_tasks','ops_agencies','ops_agency_deliverables','ops_agency_metrics',
    'ops_kpi_targets','ops_alerts','ops_audit_log','ops_report_snapshots']
  loop
    execute format('alter table %I enable row level security', t);
    -- Nobody deletes. Soft delete only (status = archived / is_active = false).
    execute format('revoke delete, truncate on %I from anon, authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- ops_settings
drop policy if exists settings_select on ops_settings;
create policy settings_select on ops_settings for select to authenticated using (public.ops_is_staff());
drop policy if exists settings_insert on ops_settings;
create policy settings_insert on ops_settings for insert to authenticated with check (public.ops_my_role() = 'admin');
drop policy if exists settings_update on ops_settings;
create policy settings_update on ops_settings for update to authenticated using (public.ops_my_role() = 'admin') with check (public.ops_my_role() = 'admin');

-- ---------------------------------------------------------------- ops_listings
-- Everyone reads all ops_listings (duplicate avoidance). Staff edit only their own; column-level rules live in ops_fn_listing_guard.
drop policy if exists listings_select on ops_listings;
create policy listings_select on ops_listings for select to authenticated using (public.ops_is_staff());
drop policy if exists listings_insert on ops_listings;
create policy listings_insert on ops_listings for insert to authenticated
  with check (public.ops_is_mgr() or (public.ops_is_staff() and entered_by = auth.uid()));
drop policy if exists listings_update on ops_listings;
create policy listings_update on ops_listings for update to authenticated
  using (public.ops_is_mgr() or (public.ops_is_staff() and (entered_by = auth.uid() or assigned_to = auth.uid())))
  with check (public.ops_is_mgr() or (public.ops_is_staff() and (entered_by = auth.uid() or assigned_to = auth.uid())));

drop policy if exists channels_select on ops_listing_channels;
create policy channels_select on ops_listing_channels for select to authenticated using (public.ops_is_staff());
drop policy if exists channels_insert on ops_listing_channels;
create policy channels_insert on ops_listing_channels for insert to authenticated
  with check (public.ops_is_mgr() or (public.ops_is_staff() and public.ops_owns_listing(listing_id)));
drop policy if exists channels_update on ops_listing_channels;
create policy channels_update on ops_listing_channels for update to authenticated
  using (public.ops_is_mgr() or (public.ops_is_staff() and public.ops_owns_listing(listing_id)))
  with check (public.ops_is_mgr() or (public.ops_is_staff() and public.ops_owns_listing(listing_id)));

-- ---------------------------------------------------------------- verifier tables (read-only for the app; worker uses service role)
drop policy if exists wpindex_select on ops_wp_listing_index;
create policy wpindex_select on ops_wp_listing_index for select to authenticated using (public.ops_is_staff());
drop policy if exists wpcrawl_select on ops_wp_crawl_log;
create policy wpcrawl_select on ops_wp_crawl_log for select to authenticated using (public.ops_is_mgr());
drop policy if exists runs_select on ops_verifier_runs;
create policy runs_select on ops_verifier_runs for select to authenticated using (public.ops_is_mgr());

-- ---------------------------------------------------------------- ops_tasks
drop policy if exists tasks_select on ops_tasks;
create policy tasks_select on ops_tasks for select to authenticated using (public.ops_is_staff());
drop policy if exists tasks_insert on ops_tasks;
create policy tasks_insert on ops_tasks for insert to authenticated
  with check (public.ops_is_mgr() or (public.ops_is_staff() and created_by = auth.uid()));
drop policy if exists tasks_update on ops_tasks;
create policy tasks_update on ops_tasks for update to authenticated
  using (public.ops_is_mgr() or (public.ops_is_staff() and (assigned_to = auth.uid() or created_by = auth.uid())))
  with check (public.ops_is_mgr() or (public.ops_is_staff() and (assigned_to = auth.uid() or created_by = auth.uid())));

drop policy if exists templates_select on ops_recurring_templates;
create policy templates_select on ops_recurring_templates for select to authenticated using (public.ops_is_staff());
drop policy if exists templates_insert on ops_recurring_templates;
create policy templates_insert on ops_recurring_templates for insert to authenticated with check (public.ops_is_mgr());
drop policy if exists templates_update on ops_recurring_templates;
create policy templates_update on ops_recurring_templates for update to authenticated using (public.ops_is_mgr()) with check (public.ops_is_mgr());

-- ---------------------------------------------------------------- ops_agencies
drop policy if exists agencies_select on ops_agencies;
create policy agencies_select on ops_agencies for select to authenticated using (public.ops_is_staff());
drop policy if exists agencies_insert on ops_agencies;
create policy agencies_insert on ops_agencies for insert to authenticated with check (public.ops_my_role() = 'admin');
drop policy if exists agencies_update on ops_agencies;
create policy agencies_update on ops_agencies for update to authenticated using (public.ops_is_mgr()) with check (public.ops_is_mgr());

drop policy if exists deliv_select on ops_agency_deliverables;
create policy deliv_select on ops_agency_deliverables for select to authenticated using (public.ops_is_staff());
drop policy if exists deliv_insert on ops_agency_deliverables;
create policy deliv_insert on ops_agency_deliverables for insert to authenticated with check (public.ops_my_role() in ('admin','manager','marketing'));
drop policy if exists deliv_update on ops_agency_deliverables;
create policy deliv_update on ops_agency_deliverables for update to authenticated
  using (public.ops_my_role() in ('admin','manager','marketing')) with check (public.ops_my_role() in ('admin','manager','marketing'));

drop policy if exists metrics_select on ops_agency_metrics;
create policy metrics_select on ops_agency_metrics for select to authenticated using (public.ops_is_staff());
drop policy if exists metrics_insert on ops_agency_metrics;
create policy metrics_insert on ops_agency_metrics for insert to authenticated with check (public.ops_my_role() in ('admin','manager','marketing'));
drop policy if exists metrics_update on ops_agency_metrics;
create policy metrics_update on ops_agency_metrics for update to authenticated
  using (public.ops_my_role() in ('admin','manager','marketing')) with check (public.ops_my_role() in ('admin','manager','marketing'));

-- ---------------------------------------------------------------- targets
drop policy if exists targets_select on ops_kpi_targets;
create policy targets_select on ops_kpi_targets for select to authenticated using (public.ops_is_staff());
drop policy if exists targets_insert on ops_kpi_targets;
create policy targets_insert on ops_kpi_targets for insert to authenticated with check (public.ops_is_mgr());
drop policy if exists targets_update on ops_kpi_targets;
create policy targets_update on ops_kpi_targets for update to authenticated using (public.ops_is_mgr()) with check (public.ops_is_mgr());

-- ---------------------------------------------------------------- ops_alerts (written by the worker; users read theirs and mark them read)
drop policy if exists alerts_select on ops_alerts;
create policy alerts_select on ops_alerts for select to authenticated
  using (public.ops_my_role() = 'admin' or target_user = auth.uid() or target_role = public.ops_my_role());
drop policy if exists alerts_update on ops_alerts;
create policy alerts_update on ops_alerts for update to authenticated
  using (public.ops_my_role() = 'admin' or target_user = auth.uid() or target_role = public.ops_my_role())
  with check (public.ops_my_role() = 'admin' or target_user = auth.uid() or target_role = public.ops_my_role());

-- ---------------------------------------------------------------- audit log: insert-only (by trigger), readable by admin + manager
drop policy if exists audit_select on ops_audit_log;
create policy audit_select on ops_audit_log for select to authenticated using (public.ops_is_mgr());
revoke insert, update on ops_audit_log from authenticated;

-- ---------------------------------------------------------------- report snapshots
drop policy if exists snapshots_select on ops_report_snapshots;
create policy snapshots_select on ops_report_snapshots for select to authenticated using (public.ops_is_mgr());
drop policy if exists snapshots_insert on ops_report_snapshots;
create policy snapshots_insert on ops_report_snapshots for insert to authenticated with check (public.ops_is_mgr());
revoke update on ops_report_snapshots from authenticated;

grant select on ops_vw_listing_sla, ops_vw_user_kpis, ops_vw_agency_scorecard to authenticated;
