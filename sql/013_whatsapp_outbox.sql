-- HV OPS — 013_whatsapp_outbox.sql   (Daniel, 2026-09-23)
-- One message outbox for ALL Home Vacation systems: whenever a task is handed to a person, a row lands here and the worker
-- sends a WhatsApp message with a link that opens that exact task. Shared with HR (recorded there as migration_044).
--   maintenance  hv_tasks.assigned_to / assigned_to_multi           -> https://hv-maintenance-system.pages.dev/#task-<id>
--   HV Ops       ops_tasks.assigned_to                              -> https://home-vacation-ops.pages.dev/#task/<id>
--                ops_listings / ops_projects ready to publish       -> #listing/<id> / #project/<id>   (to the uploader)
--                ops_listings / ops_projects rejected               -> to the person who entered it
--                ops_photo_requests assigned / scheduled            -> #photo                          (to the photographer)
-- Messages are queued as 'pending' and go out only when the worker has WhatsApp switched on; nothing is lost meanwhile.
-- Additive, safe to re-run.

create table if not exists public.hv_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient uuid references public.app_users(id),
  phone text,                                  -- E.164 at the time of queuing
  system text not null,                        -- hr | maint | crm | ops
  entity_type text,
  entity_id text,
  title text not null,
  body text,
  url text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  skip_reason text,
  attempts int not null default 0,
  error text,
  provider_id text,                            -- WhatsApp message id
  sent_at timestamptz,
  opened_at timestamptz,                       -- the person tapped the link
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists hv_notifications_pending on public.hv_notifications(status, created_at) where status = 'pending';
create index if not exists hv_notifications_recipient on public.hv_notifications(recipient, created_at desc);

alter table public.hv_notifications enable row level security;
revoke all on public.hv_notifications from anon;
revoke insert, update, delete, truncate on public.hv_notifications from authenticated;
drop policy if exists hv_notifications_select on public.hv_notifications;
create policy hv_notifications_select on public.hv_notifications for select to authenticated
  using (recipient = auth.uid()
         or exists (select 1 from public.app_users a where a.id = auth.uid() and a.is_active
                      and (a.role in ('ceo','hr') or (a.access_ops and coalesce(a.ops_role, case when a.role = 'ceo' then 'admin' end) in ('admin','manager')))));

-- Egyptian numbers typed as 01xxxxxxxxx become +201xxxxxxxxx; anything already international keeps its +.
create or replace function public.hv_phone_e164(p text) returns text
language sql immutable as $$
  select case
    when p is null then null
    when regexp_replace(p, '[^0-9+]', '', 'g') = '' then null
    when regexp_replace(p, '[^0-9+]', '', 'g') ~ '^\+' then regexp_replace(p, '[^0-9+]', '', 'g')
    when regexp_replace(p, '[^0-9]', '', 'g') ~ '^0[0-9]{10}$' then '+20' || substr(regexp_replace(p, '[^0-9]', '', 'g'), 2)
    when regexp_replace(p, '[^0-9]', '', 'g') ~ '^20[0-9]{10}$' then '+' || regexp_replace(p, '[^0-9]', '', 'g')
    when regexp_replace(p, '[^0-9]', '', 'g') ~ '^00' then '+' || substr(regexp_replace(p, '[^0-9]', '', 'g'), 3)
    else '+' || regexp_replace(p, '[^0-9]', '', 'g') end
$$;

-- Queue one message. Skips (but still records) when the person has no phone, is disabled, or handed the task to themselves.
create or replace function public.hv_notify(p_recipient uuid, p_system text, p_entity_type text, p_entity_id text,
                                            p_title text, p_body text, p_url text, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare u record; k text;
begin
  if p_recipient is null then return; end if;
  select id, is_active, phone into u from app_users where id = p_recipient;
  if u.id is null then return; end if;
  k := coalesce(p_dedupe, p_system || ':' || coalesce(p_entity_type, '') || ':' || coalesce(p_entity_id, '') || ':' || p_recipient::text || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  insert into hv_notifications (recipient, phone, system, entity_type, entity_id, title, body, url, status, skip_reason, dedupe_key)
  values (p_recipient, hv_phone_e164(u.phone), p_system, p_entity_type, p_entity_id, left(p_title, 200), left(p_body, 500), p_url,
          case when not u.is_active then 'skipped' when auth.uid() = p_recipient then 'skipped' when hv_phone_e164(u.phone) is null then 'skipped' else 'pending' end,
          case when not u.is_active then 'login disabled' when auth.uid() = p_recipient then 'assigned to self' when hv_phone_e164(u.phone) is null then 'no phone number in HR' end,
          k)
  on conflict (dedupe_key) do nothing;
exception when others then
  null;      -- a message must never block the task itself
end $$;
revoke all on function public.hv_notify(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- HV Ops: tasks
create or replace function public.ops_notify_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null and new.status not in ('done','cancelled')
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform hv_notify(new.assigned_to, 'ops', 'task', new.id::text, 'Task: ' || new.title,
      coalesce('Due ' || to_char(new.due_at at time zone 'Africa/Cairo', 'DD Mon HH24:MI'), 'No due date') || case when new.priority in ('high','urgent') then ' · ' || new.priority else '' end,
      'https://home-vacation-ops.pages.dev/#task/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_y_notify on ops_tasks;
create trigger trg_y_notify after insert or update of assigned_to, status on ops_tasks for each row execute function public.ops_notify_task();

-- ---------------------------------------------------------------- HV Ops: listings + projects (same shape, one function)
create or replace function public.ops_notify_listing() returns trigger
language plpgsql security definer set search_path = public as $$
declare kind text := tg_argv[0]; label text; url text; j jsonb := to_jsonb(new);   -- listings have title, projects have name
begin
  label := case when kind = 'project' then 'Project ' || new.reference_code || ' — ' || coalesce(j ->> 'name', '') else 'Listing ' || new.reference_code || coalesce(' — ' || (j ->> 'title'), '') end;
  url := 'https://home-vacation-ops.pages.dev/#' || kind || '/' || new.id;
  -- ready to publish => the uploader has a job
  if new.status = 'ready_to_publish' and new.assigned_to is not null
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
drop trigger if exists trg_y_notify on ops_listings;
create trigger trg_y_notify after insert or update of status, assigned_to, media_uploaded on ops_listings for each row execute function public.ops_notify_listing('listing');
drop trigger if exists trg_y_notify on ops_projects;
create trigger trg_y_notify after insert or update of status, assigned_to, media_uploaded on ops_projects for each row execute function public.ops_notify_listing('project');

-- ---------------------------------------------------------------- HV Ops: photo shoots
create or replace function public.ops_notify_photo() returns trigger
language plpgsql security definer set search_path = public as $$
declare label text := 'Photo shoot PH-' || lpad(new.request_no::text, 4, '0') || ' — ' || new.owner_name || ', ' || new.location;
begin
  if new.assigned_to is not null and new.status in ('requested','scheduled')
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to or new.scheduled_at is distinct from old.scheduled_at
          or (new.status = 'scheduled' and old.status = 'shot')) then
    perform hv_notify(new.assigned_to, 'ops', 'photo', new.id::text, label,
      coalesce('Shoot: ' || to_char(new.scheduled_at at time zone 'Africa/Cairo', 'DD Mon HH24:MI'), 'Date not set yet') || coalesce(' · ' || new.revision_note, ''),
      'https://home-vacation-ops.pages.dev/#photo');
  end if;
  return new;
end $$;
drop trigger if exists trg_y_notify on ops_photo_requests;
create trigger trg_y_notify after insert or update of assigned_to, scheduled_at, status on ops_photo_requests for each row execute function public.ops_notify_photo();

-- ---------------------------------------------------------------- Maintenance: hv_tasks (only where that system exists)
do $outer$
begin
  if to_regclass('public.hv_tasks') is null then return; end if;
  execute $fn$
    create or replace function public.hv_notify_maint_task() returns trigger
    language plpgsql security definer set search_path = public as $$
    declare new_ids bigint[]; old_ids bigint[] := '{}'; hid bigint; au uuid; tt text; pname text; when_txt text;
    begin
      new_ids := case when jsonb_typeof(new.assigned_to_multi) = 'array' and jsonb_array_length(new.assigned_to_multi) > 0
                      then (select array_agg((x #>> '{}')::bigint) from jsonb_array_elements(new.assigned_to_multi) x)
                      else array_remove(array[new.assigned_to], null) end;
      if tg_op = 'UPDATE' then
        old_ids := case when jsonb_typeof(old.assigned_to_multi) = 'array' and jsonb_array_length(old.assigned_to_multi) > 0
                        then (select array_agg((x #>> '{}')::bigint) from jsonb_array_elements(old.assigned_to_multi) x)
                        else array_remove(array[old.assigned_to], null) end;
      end if;
      if new.actual_completion_date is not null then return new; end if;
      select title into tt from hv_task_types where id = new.task_type_id;
      select name into pname from hv_properties where id = new.property_id;
      when_txt := coalesce(to_char(coalesce(new.start_date, new.task_date), 'DD Mon'), '') || case when new.end_date is not null and new.end_date <> coalesce(new.start_date, new.task_date) then ' → ' || to_char(new.end_date, 'DD Mon') else '' end;
      foreach hid in array coalesce(new_ids, '{}') loop
        if hid = any(old_ids) then continue; end if;
        select auth_user_id into au from hv_users where id = hid and is_active;
        if au is null then continue; end if;
        perform hv_notify(au, 'maint', 'task', new.id::text, 'مهمة T-' || lpad(new.id::text, 4, '0') || ': ' || coalesce(tt, ''),
          trim(coalesce(pname || ' · ', '') || when_txt), 'https://hv-maintenance-system.pages.dev/#task-' || new.id);
      end loop;
      return new;
    end $$;
  $fn$;
  execute 'drop trigger if exists trg_y_notify on hv_tasks';
  execute 'create trigger trg_y_notify after insert or update of assigned_to, assigned_to_multi on hv_tasks for each row execute function public.hv_notify_maint_task()';
end $outer$;

-- phones typed in HR are stored in E.164 from now on (01xxxxxxxxx -> +201xxxxxxxxx)
create or replace function public.hv_phone_normalise() returns trigger language plpgsql as $$
begin new.phone := hv_phone_e164(new.phone); return new; end $$;
drop trigger if exists trg_phone_e164 on public.app_users;
create trigger trg_phone_e164 before insert or update of phone on public.app_users for each row execute function public.hv_phone_normalise();

-- tidy the phones already in HR once
update public.app_users set phone = hv_phone_e164(phone) where phone is not null and phone <> '' and hv_phone_e164(phone) is distinct from phone;
