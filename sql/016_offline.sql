-- HV OPS — 016_offline.sql   (2026-10-04)
-- OFFLINE properties: kept and marketed by the company but NEVER listed on the website.
--   * same table as listings (ops_listings.is_offline = true), shown in their own "Offline" page
--   * their own code and their own serial:  OFF-LOC-TYPE-0001-S|R   (prefix from Settings key offline_code_prefix, default OFF)
--   * no website stage: draft -> ready (status ready_to_publish means "Ready — offline"), never published_claimed / verified_live
--   * no publishing channels, no website check, no 72h SLA alerts (ops_vw_listing_sla leaves them out — re-run 003 after this file)
-- Additive, safe to re-run.
alter table ops_listings add column if not exists is_offline boolean not null default false;
create index if not exists ops_idx_listings_offline on ops_listings(is_offline);

-- ---------------------------------------------------------------- codes: online serial ignores offline rows; offline has its own
create or replace function ops_fn_generate_reference_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  loc_code text; type_code text; n bigint; candidate text; pfx text;
begin
  if new.reference_code is not null and btrim(new.reference_code) <> '' then
    new.reference_code := upper(regexp_replace(new.reference_code, '\s', '', 'g'));   -- backlog import keeps the site's code
    return new;
  end if;

  select value ->> new.location      into loc_code  from ops_settings where key = 'location_codes';
  select value ->> new.property_type into type_code from ops_settings where key = 'unit_type_codes';
  if loc_code  is null then raise exception 'No location code for "%". Add it in Settings > Location codes.', new.location; end if;
  if type_code is null then raise exception 'No unit type code for "%". Add it in Settings > Unit type codes.', new.property_type; end if;

  if new.is_offline then
    select coalesce(nullif(btrim(value #>> '{}'), ''), 'OFF') into pfx from ops_settings where key = 'offline_code_prefix';
    pfx := upper(coalesce(pfx, 'OFF'));
    perform pg_advisory_xact_lock(hashtext('ops_offline_serial'));
    select coalesce(max((regexp_match(reference_code, '-(\d+)-[SR]$'))[1]::bigint), 0) + 1 into n
    from ops_listings where is_offline and reference_code ~ '-\d{1,6}-[SR]$';
    loop
      candidate := upper(pfx || '-' || loc_code || '-' || type_code || '-' || lpad(n::text, 4, '0') || '-' || case when new.deal_type = 'rent' then 'R' else 'S' end);
      exit when not exists (select 1 from ops_listings where reference_code = candidate);
      n := n + 1;
    end loop;
    new.reference_code := candidate;
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('ops_listing_serial'));      -- two people saving at once still get different numbers
  select coalesce(max((regexp_match(reference_code, '-(\d+)-[SR]$'))[1]::bigint), 0) + 1 into n
  from (select reference_code from ops_wp_listing_index
        union all select reference_code from ops_listings where not is_offline) r
  where reference_code ~ '-\d{1,6}-[SR]$';

  loop
    candidate := upper(loc_code || '-' || type_code || '-' || n || '-' || case when new.deal_type = 'rent' then 'R' else 'S' end);
    exit when not exists (select 1 from ops_listings where reference_code = candidate)
          and not exists (select 1 from ops_wp_listing_index where reference_code = candidate);
    n := n + 1;
  end loop;
  new.reference_code := candidate;
  return new;
end $$;

-- ---------------------------------------------------------------- offline rules
create or replace function ops_fn_offline_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.is_offline is distinct from old.is_offline then
    raise exception 'A property cannot be moved between Offline and Listings — its code belongs to one of them. Create it again on the other page.';
  end if;
  if new.is_offline then
    if new.status in ('published_claimed', 'verified_live') then
      raise exception 'Offline properties are never published on the website.';
    end if;
    new.assigned_to := coalesce(new.entered_by, new.assigned_to);     -- there is no uploader
  end if;
  return new;
end $$;
drop trigger if exists trg_a0_offline on ops_listings;
create trigger trg_a0_offline before insert or update on ops_listings for each row execute function ops_fn_offline_rules();

-- ---------------------------------------------------------------- no publishing channels for offline properties
create or replace function ops_fn_default_channels() returns trigger
language plpgsql security definer set search_path = public as $$
declare chans jsonb; c text;
begin
  if new.is_offline then return new; end if;
  select value into chans from ops_settings where key = 'default_channels';
  if chans is null or jsonb_typeof(chans) <> 'array' then chans := '["website","property_finder","aqarmap"]'::jsonb; end if;
  for c in select jsonb_array_elements_text(chans) loop
    begin
      insert into ops_listing_channels (listing_id, channel) values (new.id, c::ops_channel_name) on conflict do nothing;
    exception when invalid_text_representation then null;   -- unknown portal name in ops_settings: skip it
    end;
  end loop;
  return new;
end $$;

-- ---------------------------------------------------------------- messages: nobody is told to "upload" an offline property
create or replace function public.ops_notify_listing() returns trigger
language plpgsql security definer set search_path = public as $$
declare kind text := tg_argv[0]; label text; url text; j jsonb := to_jsonb(new);   -- listings have title, projects have name
begin
  label := case when kind = 'project' then 'Project ' || new.reference_code || ' — ' || coalesce(j ->> 'name', '') else 'Listing ' || new.reference_code || coalesce(' — ' || (j ->> 'title'), '') end;
  url := 'https://home-vacation-ops.pages.dev/#' || kind || '/' || new.id;
  -- ready to publish => the uploader has a job
  if new.status = 'ready_to_publish' and new.assigned_to is not null and coalesce((j ->> 'is_offline')::boolean, false) = false
     and (tg_op = 'INSERT' or old.status is distinct from new.status or new.assigned_to is distinct from old.assigned_to) then
    perform hv_notify(new.assigned_to, 'ops', kind, new.id::text, label || ' is ready — upload it to the website', 'Entered complete; the 72h clock is running.', url);
  end if;
  -- rejected => the person who entered it has work to redo
  if tg_op = 'UPDATE' and new.status = 'rejected' and old.status is distinct from 'rejected' then
    perform hv_notify(new.entered_by, 'ops', kind, new.id::text, label || ' was rejected', coalesce('Reason: ' || new.rejection_reason, ''), url);
  end if;
  -- manager asked for photos to be redone (was ready, now not)
  if tg_op = 'UPDATE' and old.media_uploaded is true and new.media_uploaded is false then
    perform hv_notify(new.entered_by, 'ops', kind, new.id::text, label || ' — photos need work', 'The manager unmarked the photos as ready.', url);
  end if;
  return new;
end $$;
