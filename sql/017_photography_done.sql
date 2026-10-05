-- HV OPS — 017_photography_done.sql   (2026-10-05)
-- "Photography done?" on every listing (online and offline).
--   No  -> the listing is put on the Needs photography list automatically (a request linked to the listing).
--          When the manager approves those photos the listing gets "Photos ready = Yes" + logo / edited answers, and the request closes.
--   Yes -> the media questions are answered on the listing as before. An untouched open request for it is cancelled.
-- Additive, safe to re-run. Re-run 003_views.sql afterwards (new column on ops_listings).
alter table ops_listings add column if not exists photography_done boolean;

-- listings that already have media answers were obviously photographed
update ops_listings set photography_done = true
where photography_done is null and (media_uploaded is true or media_has_logo is not null or media_edited is not null or photo_request_id is not null);

-- ---------------------------------------------------------------- listing says No -> request; listing says Yes -> untouched request cancelled
create or replace function ops_fn_listing_needs_photos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.photography_done is false and (tg_op = 'INSERT' or old.photography_done is distinct from false)
     and new.status not in ('rejected', 'archived')
     and not exists (select 1 from ops_photo_requests q where q.listing_id = new.id and q.status not in ('cancelled', 'converted')) then
    insert into ops_photo_requests (owner_name, owner_phone, location, property_type, deal_type, source_type, source_name, notes, requested_by, listing_id)
    values (coalesce(nullif(btrim(new.owner_name), ''), nullif(btrim(new.source_name), ''), nullif(btrim(new.title), ''), new.reference_code),
            new.owner_phone, new.location, new.property_type, new.deal_type, new.source_type, new.source_name,
            'Listing ' || new.reference_code || ' — information entered, photos still needed.',
            coalesce(auth.uid(), new.entered_by), new.id);
  elsif tg_op = 'UPDATE' and new.photography_done is true and old.photography_done is distinct from true then
    update ops_photo_requests set status = 'cancelled', cancel_reason = 'Photography was marked as done on the listing.'
    where listing_id = new.id and status in ('requested', 'scheduled');
  end if;
  return new;
end $$;
drop trigger if exists trg_needs_photos on ops_listings;
create trigger trg_needs_photos after insert or update of photography_done on ops_listings for each row execute function ops_fn_listing_needs_photos();

-- ---------------------------------------------------------------- manager approves photos of a request that belongs to a listing
-- runs after trg_c_guard (which checked that the approver is a manager and stamped approved_by / approved_at)
create or replace function ops_fn_photo_request_to_listing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ready' and old.status <> 'ready' and new.listing_id is not null then
    update ops_listings set photography_done = true, media_uploaded = true,
           media_has_logo = coalesce(new.has_logo, media_has_logo), media_edited = coalesce(new.edited, media_edited)
    where id = new.listing_id;
    new.status := 'converted';                       -- nothing left to do on the photography list
  end if;
  return new;
end $$;
drop trigger if exists trg_d_to_listing on ops_photo_requests;
create trigger trg_d_to_listing before update on ops_photo_requests for each row execute function ops_fn_photo_request_to_listing();
