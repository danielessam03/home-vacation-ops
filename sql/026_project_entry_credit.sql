-- HV OPS — 026_project_entry_credit.sql   (2026-11-10)
-- Fix: 025 made the stamp trigger (ops_fn_listing_stamps — shared by ops_projects as trg_d_stamps) read
-- date_entry_complete, a column only ops_listings had. Every project save since then failed with
--   record "new" has no field "date_entry_complete"
-- Projects get the column and Daniel's rule from 025 as well: the ENTRY KPI (ops_project_ready → entered_by) is credited
-- the first time every entry field is filled (fields in ops_settings.entry_credit_ignore — the manager's photo approval —
-- excluded), not at ready_to_publish. date_ready still drives the SLA clock. Backfills existing projects.
-- Additive, safe to re-run.

alter table ops_projects add column if not exists date_entry_complete timestamptz;   -- first time every entry field was filled

create or replace function public.ops_kpi_from_project() returns trigger
language plpgsql security definer set search_path = public as $$
declare breach numeric; hrs numeric; uploader uuid;
begin
  -- stage 1: every entry field filled -> the person who entered it (the manager's photo approval is not required)
  if new.date_entry_complete is not null and (tg_op = 'INSERT' or old.date_entry_complete is null) then
    perform public.ops_kpi_credit(new.entered_by, 'ops_project_ready', new.date_entry_complete::date, new.reference_code || ' · ' || new.name,
                                  'ops:pready:' || new.id, 'HV Ops: project entry complete');
  end if;
  if tg_op = 'UPDATE' then
    -- stage 2: verified live -> the person who uploaded it
    if new.date_published_verified is not null and old.date_published_verified is null then
      uploader := coalesce(new.published_claimed_by, new.assigned_to, new.entered_by);
      perform public.ops_kpi_credit(uploader, 'ops_project_live', new.date_published_verified::date, new.reference_code || ' · ' || new.name,
                                    'ops:plive:' || new.id, 'HV Ops: project verified live ' || coalesce(new.website_url, ''));
      select coalesce((value ->> 'breach')::numeric, 168) into breach from ops_settings where key = 'project_sla_hours';
      hrs := greatest(0, extract(epoch from (new.date_published_verified - new.date_received)) - new.paused_seconds) / 3600.0;
      if hrs <= coalesce(breach, 168) then
        perform public.ops_kpi_credit(uploader, 'ops_project_on_time', new.date_published_verified::date, new.reference_code,
                                      'ops:pontime:' || new.id, 'HV Ops: project published in ' || round(hrs, 1) || 'h');
      end if;
    elsif new.status = 'rejected' and old.status is distinct from new.status then
      update kpi_entries set status = 'rejected', notes = coalesce(notes, '') || ' | project rejected'
       where external_id in ('ops:pready:' || new.id, 'ops:plive:' || new.id, 'ops:pontime:' || new.id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_z_kpi on ops_projects;
create trigger trg_z_kpi after insert or update on ops_projects for each row execute function public.ops_kpi_from_project();

-- HR metric name: the credit is for the entry, not for "ready to publish"
update kpi_metrics set name_en = 'Project entered complete', name_ar = 'مشروع مُدخل كامل' where code = 'ops_project_ready';

-- Backfill: projects whose entry is complete get the stamp (already-credited rows keep their KPI row through on-conflict).
update ops_projects p
   set date_entry_complete = coalesce(p.date_ready, p.updated_at, p.created_at)
 where p.date_entry_complete is null and p.status <> 'rejected'
   and not exists (select 1 from unnest(coalesce(p.missing_fields, '{}'::text[])) f where f <> 'media_uploaded');

notify pgrst, 'reload schema';
