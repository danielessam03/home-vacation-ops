-- HV OPS — 018_offline_required_fields.sql   (2026-10-05)
-- Offline properties get their OWN required-field list (Settings > Required fields > Offline properties).
-- It starts as a copy of the listings list; from then on the two are edited separately.
-- Additive, safe to re-run.
insert into ops_settings (key, value)
select 'offline_required_fields', value from ops_settings where key = 'required_fields'
on conflict (key) do nothing;

create or replace function ops_fn_calc_completeness() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  req jsonb; row_j jsonb := to_jsonb(new); f text; v jsonb;
  total int := 0; filled int := 0; missing text[] := '{}';
  list_key text := coalesce(tg_argv[0], 'required_fields');
begin
  if list_key = 'required_fields' and coalesce((row_j ->> 'is_offline')::boolean, false) then
    select value into req from ops_settings where key = 'offline_required_fields';
  end if;
  if req is null or jsonb_typeof(req) <> 'array' then
    select value into req from ops_settings where key = list_key;
  end if;
  if req is null or jsonb_typeof(req) <> 'array' then return new; end if;

  for f in select jsonb_array_elements_text(req) loop
    if not (row_j ? f) then continue; end if;
    total := total + 1;
    v := row_j -> f;
    if v is null or jsonb_typeof(v) = 'null'
       or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
       or (jsonb_typeof(v) = 'array'  and jsonb_array_length(v) = 0)
       or (f in ('media_images_count','media_videos_count','area_sqm','price','starting_price') and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric <= 0)
       or (f = 'media_uploaded' and v = 'false'::jsonb)
    then missing := array_append(missing, f);
    else filled := filled + 1;
    end if;
  end loop;

  new.completeness_pct := case when total = 0 then 100 else floor(100.0 * filled / total)::int end;
  new.missing_fields := missing;
  return new;
end $$;
