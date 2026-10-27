-- HV OPS — 021_recode_listing.sql   (2026-10-27)
-- An ADMIN may change the three locked parts of a saved listing — location, unit type, sale/rent — and the code follows:
--   the serial stays (it is the unit's number), the prefix / ending change: AH-A-1050-S -> AH-A-1050-R, or MG-A-1050-R.
--   If that exact code already belongs to another unit (website or HV Ops) the next free serial is used instead.
-- Every change is kept in code_history and in the audit trail. Works for offline properties too (OFF- prefix stays).
-- Additive, safe to re-run.
alter table ops_listings add column if not exists code_history jsonb not null default '[]'::jsonb;

-- the guard blocks code changes; it lets this function through via a transaction-local flag
do $$
declare src text;
begin
  select pg_get_functiondef('public.ops_fn_listing_guard'::regproc) into src;
  if src like '%old.reference_code then%' then
    src := replace(src, 'if new.reference_code is distinct from old.reference_code then',
                        'if new.reference_code is distinct from old.reference_code and coalesce(current_setting(''ops.recode'', true), '''') <> ''1'' then');
    execute src;
  end if;
end $$;

create or replace function public.ops_recode_listing(p_id uuid, p_location text default null, p_property_type text default null, p_deal_type text default null, p_reason text default null)
returns ops_listings language plpgsql security definer set search_path = public as $$
declare
  l ops_listings; loc text; typ text; serial text; pfx text := ''; ending text; cand text; n bigint; old_code text;
begin
  if public.ops_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can change the location, unit type or sale/rent of a saved listing.';
  end if;
  select * into l from ops_listings where id = p_id for update;
  if not found then raise exception 'Listing not found.'; end if;
  if l.status = 'archived' then raise exception 'An archived listing cannot be changed.'; end if;

  p_location      := coalesce(nullif(btrim(p_location), ''), l.location);
  p_property_type := coalesce(nullif(btrim(p_property_type), ''), l.property_type);
  p_deal_type     := coalesce(nullif(btrim(p_deal_type), ''), l.deal_type::text);
  if p_deal_type not in ('sale', 'rent') then raise exception 'Sale or rent?'; end if;
  if p_location = l.location and p_property_type = l.property_type and p_deal_type = l.deal_type::text then return l; end if;

  select value ->> p_location      into loc from ops_settings where key = 'location_codes';
  select value ->> p_property_type into typ from ops_settings where key = 'unit_type_codes';
  if loc is null then raise exception 'No location code for "%". Add it in Settings > Location codes.', p_location; end if;
  if typ is null then raise exception 'No unit type code for "%". Add it in Settings > Unit type codes.', p_property_type; end if;

  ending := case when p_deal_type = 'rent' then 'R' else 'S' end;
  serial := (regexp_match(l.reference_code, '-(\d+)-[SR]$'))[1];
  if l.is_offline then pfx := split_part(l.reference_code, '-', 1) || '-'; end if;
  cand := case when serial is null then null else upper(pfx || loc || '-' || typ || '-' || serial || '-' || ending) end;

  if cand is null or (cand <> l.reference_code and (
       exists (select 1 from ops_listings where reference_code = cand and id <> p_id)
    or exists (select 1 from ops_wp_listing_index where reference_code = cand))) then
    -- the serial is taken by another unit (or the old code has no serial): take the next free number
    if l.is_offline then
      perform pg_advisory_xact_lock(hashtext('ops_offline_serial'));
      select coalesce(max((regexp_match(reference_code, '-(\d+)-[SR]$'))[1]::bigint), 0) + 1 into n
      from ops_listings where is_offline and reference_code ~ '-\d{1,6}-[SR]$';
      loop
        cand := upper(pfx || loc || '-' || typ || '-' || lpad(n::text, 4, '0') || '-' || ending);
        exit when not exists (select 1 from ops_listings where reference_code = cand);
        n := n + 1;
      end loop;
    else
      perform pg_advisory_xact_lock(hashtext('ops_listing_serial'));
      select coalesce(max((regexp_match(reference_code, '-(\d+)-[SR]$'))[1]::bigint), 0) + 1 into n
      from (select reference_code from ops_wp_listing_index union all select reference_code from ops_listings where not is_offline) r
      where reference_code ~ '-\d{1,6}-[SR]$';
      loop
        cand := upper(loc || '-' || typ || '-' || n || '-' || ending);
        exit when not exists (select 1 from ops_listings where reference_code = cand)
              and not exists (select 1 from ops_wp_listing_index where reference_code = cand);
        n := n + 1;
      end loop;
    end if;
  end if;

  old_code := l.reference_code;
  perform set_config('ops.recode', '1', true);
  update ops_listings
     set location = p_location, property_type = p_property_type, deal_type = p_deal_type::ops_deal_type, reference_code = cand,
         code_history = code_history || jsonb_build_object('from', old_code, 'to', cand, 'at', now(), 'by', auth.uid(), 'reason', p_reason)
   where id = p_id returning * into l;
  perform set_config('ops.recode', '', true);
  return l;
end $$;
revoke all on function public.ops_recode_listing(uuid, text, text, text, text) from public, anon;
grant execute on function public.ops_recode_listing(uuid, text, text, text, text) to authenticated;
