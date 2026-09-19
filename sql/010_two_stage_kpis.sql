-- HV OPS — 010_two_stage_kpis.sql   (Daniel, 2026-09-19)
-- The real workflow has two stages, done by different people:
--   ENTRY  : Sally / Daniel / Mayada / Essam add the data + photos        clock: received  -> ready to publish
--   UPLOAD : Lucy takes every ready listing and puts it online            clock: ready     -> verified live on the website
-- KPIs follow the stage: entry KPIs go to whoever entered, upload KPIs go to whoever uploaded. CEOs are never scored.
-- Additive, safe to re-run. Re-run 003_views.sql afterwards.

alter table ops_listings add column if not exists date_ready timestamptz;      -- first time the listing reached "ready to publish"

create or replace function ops_fn_listing_stamps() returns trigger
language plpgsql as $$
begin
  if new.status = 'ready_to_publish' and new.date_ready is null then new.date_ready := now(); end if;
  return new;
end $$;
drop trigger if exists trg_d_stamps on ops_listings;
create trigger trg_d_stamps before insert or update on ops_listings for each row execute function ops_fn_listing_stamps();

-- new listings are handed to the uploader automatically (Settings > SLA & workflow). Lucy by default.
insert into ops_settings (key, value)
select 'default_uploader', to_jsonb(a.id::text) from public.app_users a where lower(a.username) = 'lucy' limit 1
on conflict (key) do nothing;

-- KPI definitions shown inside HV Ops ("part" decides whose card they appear on)
insert into ops_settings (key, value) values ('user_kpi_defs', '[]'::jsonb) on conflict (key) do nothing;
update ops_settings set updated_at = now(), value = '[
  {"key":"listings_entered","label":"Listings entered","unit":"count","team":"data_entry","part":"entry","better":"high"},
  {"key":"avg_completeness","label":"Avg completeness","unit":"%","team":"data_entry","part":"entry","better":"high"},
  {"key":"avg_hours_to_ready","label":"Avg hours: received → ready","unit":"h","team":"data_entry","part":"entry","better":"low"},
  {"key":"incomplete_open","label":"Still incomplete","unit":"count","team":"data_entry","part":"entry","better":"low"},
  {"key":"rejected_count","label":"Corrections / rejected","unit":"count","team":"data_entry","part":"entry","better":"low"},
  {"key":"listings_uploaded","label":"Listings uploaded","unit":"count","team":"data_entry","part":"upload","better":"high"},
  {"key":"verified","label":"Verified live","unit":"count","team":"data_entry","part":"upload","better":"high"},
  {"key":"avg_hours_ready_to_live","label":"Avg hours: ready → live","unit":"h","team":"data_entry","part":"upload","better":"low"},
  {"key":"on_time_pct","label":"Within 72h SLA","unit":"%","team":"data_entry","part":"upload","better":"high"},
  {"key":"waiting_upload","label":"Ready, waiting for upload","unit":"count","team":"data_entry","part":"upload","better":"low"},
  {"key":"portal_coverage_pct","label":"Portal coverage","unit":"%","team":"data_entry","part":"upload","better":"high"},
  {"key":"claimed_not_found","label":"Claimed not found","unit":"count","team":"data_entry","part":"upload","better":"low"},
  {"key":"tasks_on_time_pct","label":"Tasks on time","unit":"%","team":"marketing","better":"high"},
  {"key":"tasks_completed","label":"Tasks completed","unit":"count","team":"marketing","better":"high"},
  {"key":"deliverables_logged","label":"Deliverables logged","unit":"count","team":"marketing","better":"high"},
  {"key":"shoots_completed","label":"Shoots completed","unit":"count","team":"marketing","better":"high"},
  {"key":"media_complete","label":"Listings with media complete","unit":"count","team":"marketing","better":"high"}
]'::jsonb
where key = 'user_kpi_defs';

-- ---------------------------------------------------------------- HR KPI bridge, per stage
insert into public.kpi_metrics (code, name_en, name_ar, points_per_unit, value_points_per_million, has_value, sort, category) values
  ('ops_listing_ready', 'Listing entered complete (ready to publish)', 'وحدة مُدخلة كاملة وجاهزة للنشر', 3, 0, false, 19, 'operations')
on conflict (code) do nothing;
update public.kpi_metrics set name_en = 'Listing uploaded & verified live', name_ar = 'وحدة مرفوعة ومؤكدة على الموقع'
 where code = 'ops_listing_live' and name_en = 'Listing verified live on website';

-- CEOs are never scored
create or replace function public.ops_kpi_credit(p_user uuid, p_code text, p_date date, p_ref text, p_ext text, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare emp uuid; metric uuid;
begin
  if p_user is null or exists (select 1 from app_users where id = p_user and role = 'ceo') then return; end if;
  emp := public.ops_employee_of(p_user);
  select id into metric from kpi_metrics where code = p_code and is_active;
  if emp is null or metric is null then return; end if;
  insert into kpi_entries (employee_id, metric_id, entry_date, quantity, reference, status, source, external_id, approved_at, notes)
  values (emp, metric, coalesce(p_date, current_date), 1, p_ref, 'approved', 'ops', p_ext, now(), p_notes)
  on conflict (external_id) do update set status = 'approved', employee_id = excluded.employee_id, entry_date = excluded.entry_date;
exception when others then
  null;      -- a KPI hiccup must never block the listing / task itself
end $$;

create or replace function public.ops_kpi_from_listing() returns trigger
language plpgsql security definer set search_path = public as $$
declare breach numeric; hrs numeric; uploader uuid;
begin
  -- stage 1: entered complete -> the person who entered it
  if new.date_ready is not null and old.date_ready is null then
    perform public.ops_kpi_credit(new.entered_by, 'ops_listing_ready', new.date_ready::date, new.reference_code,
                                  'ops:ready:' || new.id, 'HV Ops: entered complete');
  end if;
  -- stage 2: verified live -> the person who uploaded it
  if new.date_published_verified is not null and old.date_published_verified is null then
    uploader := coalesce(new.published_claimed_by, new.assigned_to, new.entered_by);
    perform public.ops_kpi_credit(uploader, 'ops_listing_live', new.date_published_verified::date, new.reference_code,
                                  'ops:live:' || new.id, 'HV Ops: verified live ' || coalesce(new.website_url, ''));
    select coalesce((value ->> 'breach')::numeric, 72) into breach from ops_settings where key = 'sla_hours';
    hrs := greatest(0, extract(epoch from (new.date_published_verified - new.date_received)) - new.paused_seconds) / 3600.0;
    if hrs <= coalesce(breach, 72) then
      perform public.ops_kpi_credit(uploader, 'ops_listing_on_time', new.date_published_verified::date, new.reference_code,
                                    'ops:ontime:' || new.id, 'HV Ops: published in ' || round(hrs, 1) || 'h');
    end if;
  elsif new.status = 'rejected' and old.status is distinct from new.status then
    update kpi_entries set status = 'rejected', notes = coalesce(notes, '') || ' | listing rejected'
     where external_id in ('ops:ready:' || new.id, 'ops:live:' || new.id, 'ops:ontime:' || new.id);
  end if;
  return new;
end $$;
