-- HV OPS — 028_agency_adds_content.sql   (Daniel, 2026-11-14)
-- "The agency adds content as well — files, links, or only a title."
-- * An agency login may now INSERT content items for its own agency. The guard forces the item onto the login's own
--   agency and marks it added_by_agency (added_by stays for HV staff; no listing / project link, no "post by" deadline).
-- * A title-only item is kind 'link' with no link_url (no new kind, so the check constraint stays as it is).
-- * What the agency added itself it may also edit and delete (delete only while not posted). HV's material is unchanged:
--   an agency can still only plan the day and add the post link there.
-- * Files: an agency login may upload into its own folder of the private bucket and remove the objects it uploaded.
-- * Managers and marketing get an alert for everything an agency adds.
-- Additive, safe to re-run.

alter table ops_content_items add column if not exists added_by_agency uuid;   -- the agency login that added it (null = added by HV staff)

create or replace function public.ops_fn_content_guard() returns trigger
language plpgsql as $$
declare agency_login boolean := public.ops_agency_me() is not null and not public.ops_is_staff();
begin
  if tg_op = 'INSERT' then
    if agency_login then          -- the agency's own content: always for its own agency, marked as the agency's
      new.agency_id := public.ops_agency_me(); new.added_by := null; new.added_by_agency := auth.uid();
      new.listing_id := null; new.project_id := null; new.post_by := null;
      new.scheduled_by := null; new.scheduled_at := null; new.posted_by := null; new.posted_at := null;
    else
      new.added_by_agency := null;
    end if;
    if new.scheduled_date is not null then new.scheduled_at := coalesce(new.scheduled_at, now()); new.scheduled_by := coalesce(new.scheduled_by, auth.uid()); end if;
    if new.posted_url is not null then new.posted_at := coalesce(new.posted_at, now()); new.posted_by := coalesce(new.posted_by, auth.uid()); end if;
    return new;
  end if;
  if agency_login then
    if new.agency_id <> old.agency_id or new.added_by is distinct from old.added_by or new.added_by_agency is distinct from old.added_by_agency
       or new.post_by is distinct from old.post_by or new.listing_id is distinct from old.listing_id or new.project_id is distinct from old.project_id then
      raise exception 'That part of the item cannot be changed.';
    end if;
    -- HV's material: only the planned day and the post link. What the agency added itself it may edit.
    if old.added_by_agency is null and (new.kind <> old.kind or new.title <> old.title or new.link_url is distinct from old.link_url
       or new.file_path is distinct from old.file_path or new.file_name is distinct from old.file_name or new.notes is distinct from old.notes) then
      raise exception 'An agency account can only plan the day and add the post link.';
    end if;
  end if;
  if new.scheduled_date is distinct from old.scheduled_date then
    new.scheduled_at := case when new.scheduled_date is null then null else now() end;
    new.scheduled_by := case when new.scheduled_date is null then null else auth.uid() end;
  end if;
  if new.posted_url is distinct from old.posted_url then
    new.posted_at := case when new.posted_url is null then null else now() end;
    new.posted_by := case when new.posted_url is null then null else auth.uid() end;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- the agency added something -> managers and marketing are told
create or replace function public.ops_fn_content_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare ag text; stamp text := extract(epoch from clock_timestamp())::bigint::text;
begin
  if new.added_by_agency is null then return new; end if;
  select display_name into ag from ops_agencies where id = new.agency_id;
  insert into ops_alerts (level, title, body, entity_type, entity_id, target_role, dedupe_key)
  values ('info', coalesce(ag, 'Agency') || ' added content: ' || new.title,
          case when new.kind = 'file' then 'File: ' || coalesce(new.file_name, '') when new.link_url is not null then new.link_url else 'Title only' end
            || case when new.scheduled_date is not null then ' — planned for ' || to_char(new.scheduled_date, 'DD Mon') else '' end,
          'content', new.id, 'manager', 'content_added:' || new.id || ':' || stamp || ':m'),
         ('info', coalesce(ag, 'Agency') || ' added content: ' || new.title,
          case when new.kind = 'file' then 'File: ' || coalesce(new.file_name, '') when new.link_url is not null then new.link_url else 'Title only' end
            || case when new.scheduled_date is not null then ' — planned for ' || to_char(new.scheduled_date, 'DD Mon') else '' end,
          'content', new.id, 'marketing', 'content_added:' || new.id || ':' || stamp || ':k')
  on conflict (dedupe_key) do nothing;
  return new;
end $$;
drop trigger if exists trg_y_added on ops_content_items;
create trigger trg_y_added after insert on ops_content_items for each row execute function public.ops_fn_content_added();

-- RLS: an active agency login adds for its own agency (the guard sets agency_id before this check runs)
-- and deletes only what its agency added, while it is not posted
drop policy if exists content_insert on ops_content_items;
create policy content_insert on ops_content_items for insert to authenticated
  with check (public.ops_my_role() in ('admin','manager','marketing') or agency_id = public.ops_agency_me());
drop policy if exists content_delete on ops_content_items;
create policy content_delete on ops_content_items for delete to authenticated
  using (public.ops_my_role() in ('admin','manager','marketing')
         or (agency_id = public.ops_agency_me() and added_by_agency is not null and posted_url is null));

-- storage (skipped where there is no storage schema, e.g. the tests): upload into the own folder, remove own uploads
do $$ begin
  if to_regclass('storage.buckets') is null then return; end if;
  execute 'drop policy if exists ops_content_agency_upload on storage.objects';
  execute $p$create policy ops_content_agency_upload on storage.objects for insert to authenticated
    with check (bucket_id = 'ops-agency-content' and (storage.foldername(name))[1] = public.ops_agency_me()::text)$p$;
  execute 'drop policy if exists ops_content_agency_remove on storage.objects';
  execute $p$create policy ops_content_agency_remove on storage.objects for delete to authenticated
    using (bucket_id = 'ops-agency-content' and (storage.foldername(name))[1] = public.ops_agency_me()::text and owner_id = auth.uid()::text)$p$;
end $$;

notify pgrst, 'reload schema';
