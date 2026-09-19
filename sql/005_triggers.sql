-- HV OPS — 005_triggers.sql
-- Functions + triggers. Re-runnable (create or replace / drop trigger if exists). Touches no data.
-- BEFORE triggers on listings fire in name order: trg_a_refcode -> trg_b_completeness -> trg_c_guard.

-- ---------------------------------------------------------------- 1. reference code  LOC-TYPE-SERIAL-S|R
create or replace function fn_generate_reference_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  loc_code text; type_code text; n bigint; mx bigint; candidate text;
begin
  if new.reference_code is not null and btrim(new.reference_code) <> '' then
    new.reference_code := upper(regexp_replace(new.reference_code, '\s', '', 'g'));   -- backlog import keeps the site's code
    return new;
  end if;

  select value ->> new.location      into loc_code  from settings where key = 'location_codes';
  select value ->> new.property_type into type_code from settings where key = 'unit_type_codes';
  if loc_code  is null then raise exception 'No location code for "%". Add it in Settings > Location codes.', new.location; end if;
  if type_code is null then raise exception 'No unit type code for "%". Add it in Settings > Unit type codes.', new.property_type; end if;

  -- never hand out a serial the website already uses
  select max((regexp_match(reference_code, '-(\d+)-[SR]$'))[1]::bigint) into mx
  from (select reference_code from wp_listing_index union all select reference_code from listings) r
  where reference_code ~ '-\d+-[SR]$';

  loop
    n := nextval('listing_ref_seq');
    if mx is not null and n <= mx then
      perform setval('listing_ref_seq', mx + 1, false);
      n := nextval('listing_ref_seq');
    end if;
    candidate := upper(loc_code || '-' || type_code || '-' || n || '-' || case when new.deal_type = 'rent' then 'R' else 'S' end);
    exit when not exists (select 1 from listings where reference_code = candidate);
  end loop;
  new.reference_code := candidate;
  return new;
end $$;

drop trigger if exists trg_a_refcode on listings;
create trigger trg_a_refcode before insert on listings for each row execute function fn_generate_reference_code();

-- ---------------------------------------------------------------- 2. completeness
create or replace function fn_calc_completeness() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  req jsonb; row_j jsonb := to_jsonb(new); f text; v jsonb;
  total int := 0; filled int := 0; missing text[] := '{}';
begin
  select value into req from settings where key = 'required_fields';
  if req is null or jsonb_typeof(req) <> 'array' then return new; end if;

  for f in select jsonb_array_elements_text(req) loop
    if not (row_j ? f) then continue; end if;       -- ignore names that are not columns
    total := total + 1;
    v := row_j -> f;
    if v is null or jsonb_typeof(v) = 'null'
       or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
       or (jsonb_typeof(v) = 'array'  and jsonb_array_length(v) = 0)
       or (f in ('media_images_count','media_videos_count','area_sqm','price') and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric <= 0)
    then missing := array_append(missing, f);
    else filled := filled + 1;
    end if;
  end loop;

  new.completeness_pct := case when total = 0 then 100 else floor(100.0 * filled / total)::int end;
  new.missing_fields := missing;
  return new;
end $$;

drop trigger if exists trg_b_completeness on listings;
create trigger trg_b_completeness before insert or update on listings for each row execute function fn_calc_completeness();

-- ---------------------------------------------------------------- 2b. listing guard (rules RLS cannot express)
-- auth.uid() is NULL for the service role (the verifier worker) and the SQL editor.
create or replace function fn_listing_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r user_role := public.my_role(); is_user boolean := auth.uid() is not null;
begin
  new.updated_at := now();
  if new.currency is not null then new.currency := upper(new.currency); end if;

  if tg_op = 'INSERT' then
    if new.entered_by is null then new.entered_by := auth.uid(); end if;
    if is_user and new.status = 'verified_live' then
      raise exception 'Only the website verifier can mark a listing verified_live.';
    end if;
    if new.status = 'ready_to_publish' and new.completeness_pct < 100 then new.status := 'draft'; end if;
    if new.status = 'published_claimed' and new.date_published_claimed is null then new.date_published_claimed := now(); end if;
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

drop trigger if exists trg_c_guard on listings;
create trigger trg_c_guard before insert or update on listings for each row execute function fn_listing_guard();

-- ---------------------------------------------------------------- 4. default channels
create or replace function fn_default_channels() returns trigger
language plpgsql security definer set search_path = public as $$
declare chans jsonb; c text;
begin
  select value into chans from settings where key = 'default_channels';
  if chans is null or jsonb_typeof(chans) <> 'array' then chans := '["website","property_finder","aqarmap"]'::jsonb; end if;
  for c in select jsonb_array_elements_text(chans) loop
    begin
      insert into listing_channels (listing_id, channel) values (new.id, c::channel_name) on conflict do nothing;
    exception when invalid_text_representation then null;   -- unknown portal name in settings: skip it
    end;
  end loop;
  return new;
end $$;

drop trigger if exists trg_default_channels on listings;
create trigger trg_default_channels after insert on listings for each row execute function fn_default_channels();

create or replace function fn_channel_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;

drop trigger if exists trg_channel_touch on listing_channels;
create trigger trg_channel_touch before insert or update on listing_channels for each row execute function fn_channel_touch();

-- ---------------------------------------------------------------- tasks guard: timestamps + manager-only approval
create or replace function fn_task_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r user_role := public.my_role(); is_user boolean := auth.uid() is not null;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := auth.uid(); end if;
    if is_user and new.status = 'done' and r not in ('admin','manager') then new.status := 'review'; end if;
    return new;
  end if;

  if new.status <> old.status then
    if is_user and r not in ('admin','manager') and (new.status in ('done','cancelled') or old.status = 'done') then
      raise exception 'Only a manager can approve, cancel or reopen a task.';
    end if;
    if new.status = 'doing' and new.started_at is null then new.started_at := now(); end if;
    if new.status = 'review' then new.completed_at := now(); end if;
    if new.status = 'done' then
      if new.completed_at is null then new.completed_at := now(); end if;
      new.approved_by := coalesce(auth.uid(), new.approved_by);
      new.approved_at := now();
    end if;
    if old.status = 'review' and new.status in ('todo','doing') then
      if coalesce(btrim(new.rejection_reason), '') = '' then raise exception 'A reason is required to send a task back.'; end if;
      new.completed_at := null;
    end if;
  elsif is_user and r not in ('admin','manager')
        and (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at) then
    raise exception 'Only a manager can approve.';
  end if;
  return new;
end $$;

drop trigger if exists trg_task_guard on tasks;
create trigger trg_task_guard before insert or update on tasks for each row execute function fn_task_guard();

-- ---------------------------------------------------------------- deliverables guard: approval is manager-only
create or replace function fn_deliverable_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r user_role := public.my_role(); is_user boolean := auth.uid() is not null;
begin
  if tg_op = 'INSERT' and new.logged_by is null then new.logged_by := auth.uid(); end if;
  if is_user and r not in ('admin','manager') then
    if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
      raise exception 'Only a manager can approve a deliverable.';
    end if;
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    new.approved_by := coalesce(auth.uid(), new.approved_by);
    new.approved_at := now();
  end if;
  if new.delivered_qty > 0 and new.delivered_at is null then new.delivered_at := now(); end if;
  return new;
end $$;

drop trigger if exists trg_deliverable_guard on agency_deliverables;
create trigger trg_deliverable_guard before insert or update on agency_deliverables for each row execute function fn_deliverable_guard();

-- ---------------------------------------------------------------- 3. generic audit trigger (one row per changed field)
create or replace function fn_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb := to_jsonb(new); k text; act text; rid uuid := (to_jsonb(new) ->> 'id')::uuid;
begin
  if tg_op = 'INSERT' then
    insert into audit_log (table_name, record_id, action, new_value, changed_by)
    values (tg_table_name, rid, 'insert', left(n::text, 4000), auth.uid());
    return new;
  end if;

  o := to_jsonb(old);
  for k in select jsonb_object_keys(n) loop
    if k in ('updated_at','updated_by','completeness_pct','missing_fields') then continue; end if;
    if (o -> k) is distinct from (n -> k) then
      act := case when (k = 'status' and n ->> k = 'archived') or (k = 'is_active' and n ->> k = 'false')
                  then 'delete_soft' else 'update' end;
      insert into audit_log (table_name, record_id, action, field_name, old_value, new_value, changed_by)
      values (tg_table_name, rid, act, k, left(o ->> k, 4000), left(n ->> k, 4000), auth.uid());
    end if;
  end loop;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['listings','listing_channels','tasks','agency_deliverables','agency_metrics','profiles','settings','kpi_targets','agencies']
  loop
    execute format('drop trigger if exists trg_audit on %I', t);
    execute format('create trigger trg_audit after insert or update on %I for each row execute function fn_audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- new auth user => inactive profile row
create or replace function public.fn_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    -- Created INACTIVE with the lowest role: an admin must activate the user and pick the role in Settings.
    -- (User metadata is never trusted for the role — anyone can write their own metadata.)
    insert into public.profiles (id, email, full_name, role, is_active)
    values (new.id, new.email,
            coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
            'data_entry', false)
    on conflict (id) do nothing;
  exception when others then null;   -- never block a sign-up because of the profile row
  end;
  return new;
end $$;

drop trigger if exists trg_hv_new_user on auth.users;
create trigger trg_hv_new_user after insert on auth.users for each row execute function public.fn_handle_new_user();
