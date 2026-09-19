-- HV OPS — 004_rls.sql
-- Row Level Security. Re-runnable: policies are dropped and recreated (policies only — never tables or data).
-- Supabase may show a "destructive operation" warning because of DROP POLICY. It is safe.

-- Role of the signed-in user. NULL when not signed in, no profile, or deactivated => every policy fails.
create or replace function public.my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() is not null
$$;

create or replace function public.is_mgr() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() in ('admin','manager')
$$;

create or replace function public.owns_listing(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from listings where id = lid and (entered_by = auth.uid() or assigned_to = auth.uid()))
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','settings','listings','listing_channels','wp_listing_index','wp_crawl_log',
    'verifier_runs','recurring_templates','tasks','agencies','agency_deliverables','agency_metrics',
    'kpi_targets','alerts','audit_log','report_snapshots']
  loop
    execute format('alter table %I enable row level security', t);
    -- Nobody deletes. Soft delete only (status = archived / is_active = false).
    execute format('revoke delete, truncate on %I from anon, authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- profiles
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (public.is_staff() or id = auth.uid());
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert to authenticated with check (public.my_role() = 'admin');
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------------------------------------------------------------- settings
drop policy if exists settings_select on settings;
create policy settings_select on settings for select to authenticated using (public.is_staff());
drop policy if exists settings_insert on settings;
create policy settings_insert on settings for insert to authenticated with check (public.my_role() = 'admin');
drop policy if exists settings_update on settings;
create policy settings_update on settings for update to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------------------------------------------------------------- listings
-- Everyone reads all listings (duplicate avoidance). Staff edit only their own; column-level rules live in fn_listing_guard.
drop policy if exists listings_select on listings;
create policy listings_select on listings for select to authenticated using (public.is_staff());
drop policy if exists listings_insert on listings;
create policy listings_insert on listings for insert to authenticated
  with check (public.is_mgr() or (public.is_staff() and entered_by = auth.uid()));
drop policy if exists listings_update on listings;
create policy listings_update on listings for update to authenticated
  using (public.is_mgr() or (public.is_staff() and (entered_by = auth.uid() or assigned_to = auth.uid())))
  with check (public.is_mgr() or (public.is_staff() and (entered_by = auth.uid() or assigned_to = auth.uid())));

drop policy if exists channels_select on listing_channels;
create policy channels_select on listing_channels for select to authenticated using (public.is_staff());
drop policy if exists channels_insert on listing_channels;
create policy channels_insert on listing_channels for insert to authenticated
  with check (public.is_mgr() or (public.is_staff() and public.owns_listing(listing_id)));
drop policy if exists channels_update on listing_channels;
create policy channels_update on listing_channels for update to authenticated
  using (public.is_mgr() or (public.is_staff() and public.owns_listing(listing_id)))
  with check (public.is_mgr() or (public.is_staff() and public.owns_listing(listing_id)));

-- ---------------------------------------------------------------- verifier tables (read-only for the app; worker uses service role)
drop policy if exists wpindex_select on wp_listing_index;
create policy wpindex_select on wp_listing_index for select to authenticated using (public.is_staff());
drop policy if exists wpcrawl_select on wp_crawl_log;
create policy wpcrawl_select on wp_crawl_log for select to authenticated using (public.is_mgr());
drop policy if exists runs_select on verifier_runs;
create policy runs_select on verifier_runs for select to authenticated using (public.is_mgr());

-- ---------------------------------------------------------------- tasks
drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select to authenticated using (public.is_staff());
drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert to authenticated
  with check (public.is_mgr() or (public.is_staff() and created_by = auth.uid()));
drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update to authenticated
  using (public.is_mgr() or (public.is_staff() and (assigned_to = auth.uid() or created_by = auth.uid())))
  with check (public.is_mgr() or (public.is_staff() and (assigned_to = auth.uid() or created_by = auth.uid())));

drop policy if exists templates_select on recurring_templates;
create policy templates_select on recurring_templates for select to authenticated using (public.is_staff());
drop policy if exists templates_insert on recurring_templates;
create policy templates_insert on recurring_templates for insert to authenticated with check (public.is_mgr());
drop policy if exists templates_update on recurring_templates;
create policy templates_update on recurring_templates for update to authenticated using (public.is_mgr()) with check (public.is_mgr());

-- ---------------------------------------------------------------- agencies
drop policy if exists agencies_select on agencies;
create policy agencies_select on agencies for select to authenticated using (public.is_staff());
drop policy if exists agencies_insert on agencies;
create policy agencies_insert on agencies for insert to authenticated with check (public.my_role() = 'admin');
drop policy if exists agencies_update on agencies;
create policy agencies_update on agencies for update to authenticated using (public.is_mgr()) with check (public.is_mgr());

drop policy if exists deliv_select on agency_deliverables;
create policy deliv_select on agency_deliverables for select to authenticated using (public.is_staff());
drop policy if exists deliv_insert on agency_deliverables;
create policy deliv_insert on agency_deliverables for insert to authenticated with check (public.my_role() in ('admin','manager','marketing'));
drop policy if exists deliv_update on agency_deliverables;
create policy deliv_update on agency_deliverables for update to authenticated
  using (public.my_role() in ('admin','manager','marketing')) with check (public.my_role() in ('admin','manager','marketing'));

drop policy if exists metrics_select on agency_metrics;
create policy metrics_select on agency_metrics for select to authenticated using (public.is_staff());
drop policy if exists metrics_insert on agency_metrics;
create policy metrics_insert on agency_metrics for insert to authenticated with check (public.my_role() in ('admin','manager','marketing'));
drop policy if exists metrics_update on agency_metrics;
create policy metrics_update on agency_metrics for update to authenticated
  using (public.my_role() in ('admin','manager','marketing')) with check (public.my_role() in ('admin','manager','marketing'));

-- ---------------------------------------------------------------- targets
drop policy if exists targets_select on kpi_targets;
create policy targets_select on kpi_targets for select to authenticated using (public.is_staff());
drop policy if exists targets_insert on kpi_targets;
create policy targets_insert on kpi_targets for insert to authenticated with check (public.is_mgr());
drop policy if exists targets_update on kpi_targets;
create policy targets_update on kpi_targets for update to authenticated using (public.is_mgr()) with check (public.is_mgr());

-- ---------------------------------------------------------------- alerts (written by the worker; users read theirs and mark them read)
drop policy if exists alerts_select on alerts;
create policy alerts_select on alerts for select to authenticated
  using (public.my_role() = 'admin' or target_user = auth.uid() or target_role = public.my_role());
drop policy if exists alerts_update on alerts;
create policy alerts_update on alerts for update to authenticated
  using (public.my_role() = 'admin' or target_user = auth.uid() or target_role = public.my_role())
  with check (public.my_role() = 'admin' or target_user = auth.uid() or target_role = public.my_role());

-- ---------------------------------------------------------------- audit log: insert-only (by trigger), readable by admin + manager
drop policy if exists audit_select on audit_log;
create policy audit_select on audit_log for select to authenticated using (public.is_mgr());
revoke insert, update on audit_log from authenticated;

-- ---------------------------------------------------------------- report snapshots
drop policy if exists snapshots_select on report_snapshots;
create policy snapshots_select on report_snapshots for select to authenticated using (public.is_mgr());
drop policy if exists snapshots_insert on report_snapshots;
create policy snapshots_insert on report_snapshots for insert to authenticated with check (public.is_mgr());
revoke update on report_snapshots from authenticated;

grant select on vw_listing_sla, vw_user_kpis, vw_agency_scorecard to authenticated;
