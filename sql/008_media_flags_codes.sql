-- HV OPS — 008_media_flags_codes.sql   (Daniel's feedback, 2026-09-19)
--  1. Buyer persona is optional (no longer counts toward completeness).
--  2. Media is three yes/no answers instead of a drive link + counts: photos uploaded / have the logo / edited.
--     A listing is only complete when "photos uploaded" = yes. Old columns stay (additive), they are just no longer asked.
--  3. Reference code serial = the last serial anywhere (website or HV Ops) + 1. No gaps, no jump to 2001.
--  4. Penthouse code is PH.
-- Additive, safe to re-run.

alter table ops_listings add column if not exists media_uploaded boolean;
alter table ops_listings add column if not exists media_has_logo boolean;
alter table ops_listings add column if not exists media_edited   boolean;

-- required-field list: drop persona + counts, add media_uploaded (keeps any other edits made in Settings)
update ops_settings s set updated_at = now(), value = (
  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) ||
         case when s.value ? 'media_uploaded' then '[]'::jsonb else '["media_uploaded"]'::jsonb end
  from jsonb_array_elements_text(s.value) with ordinality as t(x, ord)
  where x not in ('buyer_persona_nationality','buyer_persona_age_range','buyer_persona_gender','media_images_count','media_videos_count'))
where s.key = 'required_fields';

update ops_settings set updated_at = now(), value = jsonb_set(value, '{Penthouse}', '"PH"')
where key = 'unit_type_codes' and value ->> 'Penthouse' = 'P';

-- ---------------------------------------------------------------- completeness: "photos uploaded" must be YES
create or replace function ops_fn_calc_completeness() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  req jsonb; row_j jsonb := to_jsonb(new); f text; v jsonb;
  total int := 0; filled int := 0; missing text[] := '{}';
begin
  select value into req from ops_settings where key = 'required_fields';
  if req is null or jsonb_typeof(req) <> 'array' then return new; end if;

  for f in select jsonb_array_elements_text(req) loop
    if not (row_j ? f) then continue; end if;
    total := total + 1;
    v := row_j -> f;
    if v is null or jsonb_typeof(v) = 'null'
       or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
       or (jsonb_typeof(v) = 'array'  and jsonb_array_length(v) = 0)
       or (f in ('media_images_count','media_videos_count','area_sqm','price') and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric <= 0)
       or (f = 'media_uploaded' and v = 'false'::jsonb)
    then missing := array_append(missing, f);
    else filled := filled + 1;
    end if;
  end loop;

  new.completeness_pct := case when total = 0 then 100 else floor(100.0 * filled / total)::int end;
  new.missing_fields := missing;
  return new;
end $$;

-- ---------------------------------------------------------------- reference code  LOC-TYPE-SERIAL-S|R , serial = last + 1
-- LOC  = the two dominant letters of the location (AH = El Ahyaa, MG = Magawish, MK = Makadi …) from Settings > Location codes
-- TYPE = A apartment, V villa, PH penthouse, S studio …                                          from Settings > Unit type codes
-- SERIAL = one company-wide running number: highest serial on the website or in HV Ops, plus 1
-- S = sale, R = rent
create or replace function ops_fn_generate_reference_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  loc_code text; type_code text; n bigint; candidate text;
begin
  if new.reference_code is not null and btrim(new.reference_code) <> '' then
    new.reference_code := upper(regexp_replace(new.reference_code, '\s', '', 'g'));   -- backlog import keeps the site's code
    return new;
  end if;

  select value ->> new.location      into loc_code  from ops_settings where key = 'location_codes';
  select value ->> new.property_type into type_code from ops_settings where key = 'unit_type_codes';
  if loc_code  is null then raise exception 'No location code for "%". Add it in Settings > Location codes.', new.location; end if;
  if type_code is null then raise exception 'No unit type code for "%". Add it in Settings > Unit type codes.', new.property_type; end if;

  perform pg_advisory_xact_lock(hashtext('ops_listing_serial'));      -- two people saving at once still get different numbers
  select coalesce(max((regexp_match(reference_code, '-(\d+)-[SR]$'))[1]::bigint), 0) + 1 into n
  from (select reference_code from ops_wp_listing_index union all select reference_code from ops_listings) r
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

-- re-score anything already entered under the new rules
update ops_listings set updated_at = now();
