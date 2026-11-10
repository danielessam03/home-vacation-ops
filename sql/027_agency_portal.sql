-- HV OPS — 027_agency_portal.sql   (Daniel, 2026-11-10)
-- Agency accounts + the weekly content calendar.
-- * An agency requests its account from the login screen ("Marketing agency? Request an account": a Supabase sign-up
--   carrying hv_kind = 'agency'). HR's sign-up trigger runs first and makes a pending HR user out of every sign-up;
--   zz_ops_agency_signup (runs after it) takes that row out of app_users again and records the login in
--   ops_agency_users as 'pending'. An admin / manager approves it in Settings → Agencies. An agency login never
--   becomes an HR user, has no HV Ops role, and sees only its own portal (ops_agency_me()).
-- * ops_content_items: the material we want an agency to post — a zip file (Supabase storage, private bucket
--   ops-agency-content, path <agency id>/<item id>/<file>) or a link (a property page or anything else).
--   Staff add the material; the agency drags each item onto the day it will post it (scheduled_date) and, once posted,
--   pastes the post link (posted_url). Colour on the calendar: grey = not planned, blue = planned, red = late
--   (the planned day or the "post by" deadline passed without a link), green = posted.
-- Additive, safe to re-run.

-- ---------------------------------------------------------------- agency logins
create table if not exists ops_agency_users (
  id uuid primary key references auth.users(id) on delete cascade,
  agency_id uuid references ops_agencies(id),
  email text not null,
  full_name text,
  status text not null default 'pending' check (status in ('pending','active','disabled','rejected')),
  decided_by uuid references public.app_users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table ops_agency_users enable row level security;
revoke all on ops_agency_users from anon;
grant select, update on ops_agency_users to authenticated;

-- which agency am I? (null for staff and for pending / disabled / rejected accounts)
create or replace function public.ops_agency_me() returns uuid
language sql stable security definer set search_path = public as $$
  select agency_id from ops_agency_users where id = auth.uid() and status = 'active'
$$;

-- the agencies offered on the "request an account" form (names only, before sign-in)
create or replace function public.ops_agency_list() returns table (id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select id, display_name from ops_agencies where is_active order by display_name
$$;
grant execute on function public.ops_agency_list() to anon, authenticated;

create or replace function public.ops_fn_agency_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  if coalesce(new.raw_user_meta_data ->> 'hv_kind', '') <> 'agency' then return new; end if;
  begin aid := nullif(new.raw_user_meta_data ->> 'agency_id', '')::uuid; exception when others then aid := null; end;
  if aid is not null and not exists (select 1 from ops_agencies where id = aid) then aid := null; end if;
  insert into ops_agency_users (id, agency_id, email, full_name)
  values (new.id, aid, coalesce(new.email, ''), nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  -- HR's sign-up trigger (runs before this one) made an HR user out of the sign-up — with sign-ups auto-confirmed it even
  -- counts as admin-created: approved, active, and with a fresh employee card. An agency is none of that:
  -- the card made in this same transaction goes, a pre-existing card it may have adopted (same name) is only unlinked,
  -- then the HR user row goes. If anything blocks that, the HR user is at least switched off.
  begin
    delete from public.employees where user_id = new.id and created_at >= now();
    update public.employees set user_id = null where user_id = new.id;
    delete from public.app_users where id = new.id;
  exception when others then
    update public.app_users set is_active = false where id = new.id;
  end;
  return new;
end $$;
drop trigger if exists zz_ops_agency_signup on auth.users;
create trigger zz_ops_agency_signup after insert on auth.users for each row execute function public.ops_fn_agency_signup();

drop policy if exists agency_users_select on ops_agency_users;
create policy agency_users_select on ops_agency_users for select to authenticated using (public.ops_is_staff() or id = auth.uid());
drop policy if exists agency_users_update on ops_agency_users;
create policy agency_users_update on ops_agency_users for update to authenticated using (public.ops_is_mgr()) with check (public.ops_is_mgr());

-- an agency reads its own agency row (name, contact) — nothing else of the staff tables
drop policy if exists agencies_select_own on ops_agencies;
create policy agencies_select_own on ops_agencies for select to authenticated using (id = public.ops_agency_me());

-- ---------------------------------------------------------------- content items (the calendar)
create table if not exists ops_content_items (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references ops_agencies(id),
  kind text not null check (kind in ('file','link')),
  title text not null,
  link_url text,
  listing_id uuid references ops_listings(id),
  project_id uuid references ops_projects(id),
  file_path text,                                 -- storage object: <agency id>/<item id>/<file name>
  file_name text,
  file_size bigint,
  notes text,
  post_by date,                                   -- optional deadline set by HV
  scheduled_date date,                            -- the day the agency plans to post it
  scheduled_by uuid,
  scheduled_at timestamptz,
  posted_url text,                                -- the published post — makes the item green
  posted_at timestamptz,
  posted_by uuid,
  added_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ops_idx_content_agency on ops_content_items(agency_id, scheduled_date);
alter table ops_content_items enable row level security;
revoke all on ops_content_items from anon;
grant select, insert, update, delete on ops_content_items to authenticated;

create or replace function public.ops_content_state(i ops_content_items) returns text
language sql stable as $$
  select case when i.posted_url is not null then 'posted'
              when (i.scheduled_date is not null and i.scheduled_date < current_date)
                or (i.post_by is not null and i.post_by < current_date) then 'late'
              when i.scheduled_date is not null then 'scheduled'
              else 'pool' end
$$;

-- stamps + what an agency account may change (only the planned day and the post link)
create or replace function public.ops_fn_content_guard() returns trigger
language plpgsql as $$
declare agency_login boolean := public.ops_agency_me() is not null and not public.ops_is_staff();
begin
  if tg_op = 'INSERT' then
    if new.scheduled_date is not null then new.scheduled_at := coalesce(new.scheduled_at, now()); new.scheduled_by := coalesce(new.scheduled_by, auth.uid()); end if;
    if new.posted_url is not null then new.posted_at := coalesce(new.posted_at, now()); new.posted_by := coalesce(new.posted_by, auth.uid()); end if;
    return new;
  end if;
  if agency_login and (new.agency_id <> old.agency_id or new.kind <> old.kind or new.title <> old.title
       or new.link_url is distinct from old.link_url or new.file_path is distinct from old.file_path or new.file_name is distinct from old.file_name
       or new.post_by is distinct from old.post_by or new.notes is distinct from old.notes
       or new.listing_id is distinct from old.listing_id or new.project_id is distinct from old.project_id or new.added_by is distinct from old.added_by) then
    raise exception 'An agency account can only plan the day and add the post link.';
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
drop trigger if exists trg_a_guard on ops_content_items;
create trigger trg_a_guard before insert or update on ops_content_items for each row execute function public.ops_fn_content_guard();

-- the post link arrived -> managers (and marketing) are told
create or replace function public.ops_fn_content_posted() returns trigger
language plpgsql security definer set search_path = public as $$
declare ag text; stamp text := extract(epoch from clock_timestamp())::bigint::text;
begin
  if new.posted_url is not null and old.posted_url is null then
    select display_name into ag from ops_agencies where id = new.agency_id;
    insert into ops_alerts (level, title, body, entity_type, entity_id, target_role, dedupe_key)
    values ('info', 'Posted — ' || coalesce(ag, 'agency') || ': ' || new.title,
            'Planned for ' || coalesce(to_char(new.scheduled_date, 'DD Mon'), 'no day') || ' — ' || new.posted_url,
            'content', new.id, 'manager', 'content_posted:' || new.id || ':' || stamp || ':m'),
           ('info', 'Posted — ' || coalesce(ag, 'agency') || ': ' || new.title,
            'Planned for ' || coalesce(to_char(new.scheduled_date, 'DD Mon'), 'no day') || ' — ' || new.posted_url,
            'content', new.id, 'marketing', 'content_posted:' || new.id || ':' || stamp || ':k')
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_y_posted on ops_content_items;
create trigger trg_y_posted after update of posted_url on ops_content_items for each row execute function public.ops_fn_content_posted();

drop policy if exists content_select on ops_content_items;
create policy content_select on ops_content_items for select to authenticated using (public.ops_is_staff() or agency_id = public.ops_agency_me());
drop policy if exists content_insert on ops_content_items;
create policy content_insert on ops_content_items for insert to authenticated with check (public.ops_my_role() in ('admin','manager','marketing'));
drop policy if exists content_update on ops_content_items;
create policy content_update on ops_content_items for update to authenticated
  using (public.ops_my_role() in ('admin','manager','marketing') or agency_id = public.ops_agency_me())
  with check (public.ops_my_role() in ('admin','manager','marketing') or agency_id = public.ops_agency_me());
drop policy if exists content_delete on ops_content_items;
create policy content_delete on ops_content_items for delete to authenticated using (public.ops_my_role() in ('admin','manager','marketing'));

-- ---------------------------------------------------------------- storage: the zip files (skipped where there is no storage schema, e.g. the tests)
do $$ begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit) values ('ops-agency-content', 'ops-agency-content', false, 52428800) on conflict (id) do nothing;
  execute 'drop policy if exists ops_content_staff_all on storage.objects';
  execute $p$create policy ops_content_staff_all on storage.objects for all to authenticated
    using (bucket_id = 'ops-agency-content' and public.ops_my_role() in ('admin','manager','marketing'))
    with check (bucket_id = 'ops-agency-content' and public.ops_my_role() in ('admin','manager','marketing'))$p$;
  execute 'drop policy if exists ops_content_read on storage.objects';
  execute $p$create policy ops_content_read on storage.objects for select to authenticated
    using (bucket_id = 'ops-agency-content' and (public.ops_is_staff() or (storage.foldername(name))[1] = public.ops_agency_me()::text))$p$;
end $$;

notify pgrst, 'reload schema';
