-- HV OPS — 009_owner_photos_uploader.sql   (Daniel's feedback, 2026-09-19)
--  1. Owner name (+ phone) on every listing, shown in the listings list and searchable.
--  2. "Photos ready" means: the manager reviewed the photos and they are good. Only a manager/admin can set it; who and when is recorded.
--     The photos themselves stay on the company intranet — HV Ops stores no images.
--  3. Who uploaded the listing to the website (pressed "mark as published") is recorded next to who entered it.
--  4. Codes for the four website locations that had none.
-- Additive, safe to re-run. Re-run 003_views.sql afterwards (new columns on ops_listings).

alter table ops_listings add column if not exists owner_name  text;
alter table ops_listings add column if not exists owner_phone text;
alter table ops_listings add column if not exists media_approved_by uuid references public.app_users(id);
alter table ops_listings add column if not exists media_approved_at timestamptz;
alter table ops_listings add column if not exists published_claimed_by uuid references public.app_users(id);

update ops_settings set updated_at = now(),
  value = '{"Ain Sokhna":"AS","Airport Road":"AP","Marina":"MR","Qeadat":"QD"}'::jsonb || value     -- existing entries win
where key = 'location_codes';

create or replace function ops_fn_listing_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r ops_user_role := public.ops_my_role(); is_user boolean := auth.uid() is not null;
begin
  new.updated_at := now();
  if new.currency is not null then new.currency := upper(new.currency); end if;

  -- photos ready = manager's approval
  if new.media_uploaded is distinct from (case when tg_op = 'INSERT' then null else old.media_uploaded end) then
    if is_user and (r is null or r not in ('admin','manager')) then
      raise exception 'Only the manager can mark the photos as ready (or not ready).';
    end if;
    if new.media_uploaded then
      new.media_approved_by := coalesce(auth.uid(), new.media_approved_by); new.media_approved_at := now();
    else
      new.media_approved_by := null; new.media_approved_at := null;
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.entered_by is null then new.entered_by := auth.uid(); end if;
    if is_user and new.status = 'verified_live' then
      raise exception 'Only the website verifier can mark a listing verified_live.';
    end if;
    if new.status = 'ready_to_publish' and new.completeness_pct < 100 then new.status := 'draft'; end if;
    if new.status = 'published_claimed' and new.date_published_claimed is null then
      new.date_published_claimed := now(); new.published_claimed_by := coalesce(new.published_claimed_by, auth.uid());
    end if;
    return new;
  end if;

  if new.reference_code is distinct from old.reference_code then
    raise exception 'The reference code cannot be changed after creation.';
  end if;
  if is_user then
    if new.date_received is distinct from old.date_received and r is distinct from 'admin' then
      raise exception 'date_received cannot be changed after creation.';
    end if;
    if new.entered_by is distinct from old.entered_by and r not in ('admin','manager') then
      raise exception 'entered_by cannot be changed.';
    end if;
    if new.date_published_verified is distinct from old.date_published_verified
       or (new.status = 'verified_live' and old.status <> 'verified_live' and old.status_before_hold is distinct from 'verified_live') then
      raise exception 'Only the website verifier can mark a listing verified_live.';
    end if;
    if new.status in ('rejected','archived') and new.status <> old.status and r not in ('admin','manager') then
      raise exception 'Only a manager can reject or archive a listing.';
    end if;
  end if;

  if new.status <> old.status then
    if new.status = 'ready_to_publish' and new.completeness_pct < 100 then
      raise exception 'Listing is % %% complete. Fill the missing fields before moving to Ready to publish.', new.completeness_pct;
    end if;
    if new.status = 'published_claimed' then
      if new.completeness_pct < 100 then raise exception 'Listing must be 100 %% complete before it is marked published.'; end if;
      if new.date_published_claimed is null then new.date_published_claimed := now(); end if;
      new.published_claimed_by := coalesce(auth.uid(), new.published_claimed_by);      -- who uploaded it to the website
    end if;
    if new.status = 'rejected' and coalesce(btrim(new.rejection_reason), '') = '' then
      raise exception 'A rejection reason is required.';
    end if;
    -- SLA pause accounting
    if new.status = 'on_hold' then
      if coalesce(btrim(new.hold_reason), '') = '' then raise exception 'A hold reason is required.'; end if;
      new.hold_started_at := now();
      new.status_before_hold := old.status;
    elsif old.status = 'on_hold' then
      if old.hold_started_at is not null then
        new.paused_seconds := old.paused_seconds + extract(epoch from (now() - old.hold_started_at))::bigint;
      end if;
      new.hold_started_at := null;
      new.status_before_hold := null;
    end if;
  end if;
  return new;
end $$;
