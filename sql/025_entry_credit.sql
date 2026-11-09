-- HV OPS — 025_entry_credit.sql   (Daniel, 2026-11-09)
-- "The entry person gets the credit": the ENTRY KPI (ops_listing_ready → entered_by) no longer waits for the
-- manager's photo approval. It is credited the first time every entry field is filled — i.e. missing_fields holds
-- nothing except the fields listed in ops_settings.entry_credit_ignore (default: media_uploaded, the manager-only
-- "Photos ready" approval). date_ready (status ready_to_publish) still drives the SLA clock and the uploader's work.
-- Backfills date_entry_complete for existing listings (credits the ones never credited, on their own dates).
-- Additive, safe to re-run.

alter table ops_listings add column if not exists date_entry_complete timestamptz;   -- first time every entry field was filled

insert into ops_settings (key, value) values ('entry_credit_ignore', '["media_uploaded"]'::jsonb) on conflict (key) do nothing;

create or replace function ops_fn_listing_stamps() returns trigger
language plpgsql as $$
declare ign text[];
begin
  if new.status = 'ready_to_publish' and new.date_ready is null then new.date_ready := now(); end if;
  if new.date_entry_complete is null and new.status <> 'rejected' then
    select array(select jsonb_array_elements_text(value)) into ign from ops_settings where key = 'entry_credit_ignore';
    if ign is null then ign := array['media_uploaded']; end if;
    if not exists (select 1 from unnest(coalesce(new.missing_fields, '{}'::text[])) f where f <> all(ign)) then
      new.date_entry_complete := coalesce(new.date_ready, now());
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_d_stamps on ops_listings;
create trigger trg_d_stamps before insert or update on ops_listings for each row execute function ops_fn_listing_stamps();

create or replace function public.ops_kpi_from_listing() returns trigger
language plpgsql security definer set search_path = public as $$
declare breach numeric; hrs numeric; uploader uuid;
begin
  -- stage 1: every entry field filled -> the person who entered it (the manager's photo approval is not required)
  if new.date_entry_complete is not null and (tg_op = 'INSERT' or old.date_entry_complete is null) then
    perform public.ops_kpi_credit(new.entered_by, 'ops_listing_ready', new.date_entry_complete::date, new.reference_code,
                                  'ops:ready:' || new.id, 'HV Ops: entry complete');
  end if;
  if tg_op = 'UPDATE' then
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
  end if;
  return new;
end $$;
drop trigger if exists trg_z_kpi on ops_listings;
create trigger trg_z_kpi after insert or update on ops_listings for each row execute function public.ops_kpi_from_listing();

-- HR metric name: the credit is for the entry, not for "ready to publish"
update kpi_metrics set name_en = 'Listing entered complete', name_ar = 'وحدة مُدخلة كاملة' where code = 'ops_listing_ready';

-- Backfill: existing listings whose entry is complete get the stamp (the trigger credits the ones never credited;
-- already-credited rows keep their row through on-conflict). Date = when the listing was last touched.
update ops_listings l
   set date_entry_complete = coalesce(l.date_ready, l.updated_at, l.created_at)
 where l.date_entry_complete is null and l.status <> 'rejected'
   and not exists (select 1 from unnest(coalesce(l.missing_fields, '{}'::text[])) f where f <> 'media_uploaded');

notify pgrst, 'reload schema';
