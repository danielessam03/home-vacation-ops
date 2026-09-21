-- HV OPS — 012_photo_requests.sql   (Daniel, 2026-09-21)
-- "Needs photography": a property is registered for a photo shoot BEFORE any listing exists.
--   requested -> scheduled -> shot (photos taken, on the intranet) -> ready (manager approved the photos) -> converted (listing created)
-- No reference code yet — the code is born when the listing is created from the request, and the manager's photo approval travels with it.
-- Photos never live in HV Ops; they stay on the company intranet.
-- Additive, safe to re-run. Re-run 003_views.sql afterwards (new column on ops_listings).

create table if not exists ops_photo_requests (
  id uuid primary key default gen_random_uuid(),
  request_no bigint generated always as identity,        -- PH-0007, just a handle until the listing (and its real code) exists
  owner_name text not null,
  owner_phone text,
  location text not null,
  property_type text,
  deal_type ops_deal_type,
  address_notes text,                                    -- building / unit number / how to get in / who has the keys
  source_type ops_listing_source,
  source_name text,
  notes text,
  status text not null default 'requested' check (status in ('requested','scheduled','shot','ready','converted','cancelled')),
  scheduled_at timestamptz,
  shot_at timestamptz,
  photos_count int,
  videos_count int,
  has_logo boolean,
  edited boolean,
  intranet_folder text,                                  -- folder NAME on the intranet (plain text, not a link)
  requested_by uuid not null references public.app_users(id),
  assigned_to uuid references public.app_users(id),      -- photographer
  approved_by uuid references public.app_users(id),
  approved_at timestamptz,
  revision_note text,                                    -- manager: what to re-shoot / fix
  cancel_reason text,
  listing_id uuid references ops_listings(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ops_idx_photo_requests_status on ops_photo_requests(status);
create index if not exists ops_idx_photo_requests_assigned on ops_photo_requests(assigned_to);

alter table ops_listings add column if not exists photo_request_id uuid;
do $$ begin
  alter table ops_listings add constraint ops_listings_photo_request_fk foreign key (photo_request_id) references ops_photo_requests(id);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- rules
create or replace function ops_fn_photo_request_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r ops_user_role := public.ops_my_role(); is_user boolean := auth.uid() is not null;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.requested_by is null then new.requested_by := auth.uid(); end if;
    if is_user and (new.status in ('ready','converted') or new.approved_at is not null) then
      raise exception 'A new photo request cannot start as approved.';
    end if;
    if new.scheduled_at is not null and new.status = 'requested' then new.status := 'scheduled'; end if;
    return new;
  end if;

  if new.status <> old.status then
    if new.status = 'scheduled' and new.scheduled_at is null then raise exception 'Pick the date and time of the shoot.'; end if;
    if new.status = 'shot' and new.shot_at is null then new.shot_at := now(); end if;
    if new.status = 'ready' then
      if is_user and (r is null or r not in ('admin','manager')) then raise exception 'Only the manager can approve the photos.'; end if;
      new.approved_by := coalesce(auth.uid(), new.approved_by); new.approved_at := now(); new.revision_note := null;
    end if;
    if old.status = 'shot' and new.status in ('scheduled','requested') then                  -- manager sends it back
      if coalesce(btrim(new.revision_note), '') = '' then raise exception 'Say what has to be re-shot or fixed.'; end if;
      new.shot_at := null;
    end if;
    if new.status = 'cancelled' and coalesce(btrim(new.cancel_reason), '') = '' then raise exception 'A reason is required to cancel.'; end if;
    if new.status = 'converted' and new.listing_id is null then raise exception 'Create the listing from the request — it links itself.'; end if;
    if old.status in ('ready','converted') and new.status not in ('ready','converted','cancelled') and is_user and (r is null or r not in ('admin','manager')) then
      raise exception 'Only the manager can reopen approved photos.';
    end if;
    if new.status not in ('ready','converted') then new.approved_by := null; new.approved_at := null; end if;
  elsif is_user and (r is null or r not in ('admin','manager'))
        and (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at) then
    raise exception 'Only the manager can approve the photos.';
  end if;
  return new;
end $$;

drop trigger if exists trg_c_guard on ops_photo_requests;
create trigger trg_c_guard before insert or update on ops_photo_requests for each row execute function ops_fn_photo_request_guard();
drop trigger if exists trg_audit on ops_photo_requests;
create trigger trg_audit after insert or update on ops_photo_requests for each row execute function ops_fn_audit();

-- listing created from a request => the request closes itself and points at the listing
create or replace function ops_fn_listing_from_photo_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.photo_request_id is not null then
    update ops_photo_requests set status = 'converted', listing_id = new.id where id = new.photo_request_id and listing_id is null;
  end if;
  return new;
end $$;
drop trigger if exists trg_photo_request_link on ops_listings;
create trigger trg_photo_request_link after insert on ops_listings for each row execute function ops_fn_listing_from_photo_request();

-- ---------------------------------------------------------------- listing guard: identical to 009 except the photo-approval block
create or replace function ops_fn_listing_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r ops_user_role := public.ops_my_role(); is_user boolean := auth.uid() is not null; pre_by uuid; pre_at timestamptz;
begin
  new.updated_at := now();
  if new.currency is not null then new.currency := upper(new.currency); end if;

  -- photos ready = manager's approval
  if new.media_uploaded is distinct from (case when tg_op = 'INSERT' then null else old.media_uploaded end) then
    -- a listing created from a photo request whose photos the manager ALREADY approved carries that approval with it
    select q.approved_by, q.approved_at into pre_by, pre_at from ops_photo_requests q
     where q.id = nullif(to_jsonb(new) ->> 'photo_request_id', '')::uuid and q.approved_at is not null;
    if is_user and (r is null or r not in ('admin','manager')) and not (new.media_uploaded and pre_at is not null) then
      raise exception 'Only the manager can mark the photos as ready (or not ready).';
    end if;
    if new.media_uploaded and pre_at is not null and (r is null or r not in ('admin','manager')) then
      new.media_approved_by := pre_by; new.media_approved_at := pre_at;
    elsif new.media_uploaded then
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

-- ---------------------------------------------------------------- RLS
alter table ops_photo_requests enable row level security;
revoke delete, truncate on ops_photo_requests from anon, authenticated;
revoke all on ops_photo_requests from anon;
drop policy if exists photo_requests_select on ops_photo_requests;
create policy photo_requests_select on ops_photo_requests for select to authenticated using (public.ops_is_staff());
drop policy if exists photo_requests_insert on ops_photo_requests;
create policy photo_requests_insert on ops_photo_requests for insert to authenticated
  with check (public.ops_is_mgr() or (public.ops_is_staff() and requested_by = auth.uid()));
drop policy if exists photo_requests_update on ops_photo_requests;
create policy photo_requests_update on ops_photo_requests for update to authenticated
  using (public.ops_is_mgr() or (public.ops_is_staff() and (requested_by = auth.uid() or assigned_to = auth.uid())))
  with check (public.ops_is_mgr() or (public.ops_is_staff() and (requested_by = auth.uid() or assigned_to = auth.uid())));

-- ---------------------------------------------------------------- HR KPI: an approved shoot credits the photographer (CEOs are never scored)
insert into public.kpi_metrics (code, name_en, name_ar, points_per_unit, value_points_per_million, has_value, sort, category) values
  ('ops_photo_shoot', 'Property photo shoot approved', 'تصوير وحدة معتمد', 3, 0, false, 27, 'operations')
on conflict (code) do nothing;

create or replace function public.ops_kpi_from_photo_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.approved_at is not null and old.approved_at is null and new.assigned_to is not null then
    perform public.ops_kpi_credit(new.assigned_to, 'ops_photo_shoot', new.approved_at::date,
                                  'PH-' || lpad(new.request_no::text, 4, '0') || ' · ' || new.owner_name, 'ops:shoot:' || new.id, 'HV Ops: photo shoot approved');
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    update kpi_entries set status = 'rejected', notes = coalesce(notes, '') || ' | request cancelled' where external_id = 'ops:shoot:' || new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_z_kpi on ops_photo_requests;
create trigger trg_z_kpi after update on ops_photo_requests for each row execute function public.ops_kpi_from_photo_request();

update ops_settings set updated_at = now(), value = value || '[
  {"key":"shoots_approved","label":"Photo shoots approved","unit":"count","team":"data_entry","part":"entry","better":"high"}
]'::jsonb
where key = 'user_kpi_defs' and not (value @> '[{"key":"shoots_approved"}]'::jsonb);
