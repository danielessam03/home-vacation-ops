-- HV OPS — 014_email_channel.sql   (Daniel, 2026-09-23: "I don't want Meta" -> task messages by e-mail, WhatsApp optional later)
-- The outbox now carries the person's e-mail as well as the phone; the worker sends over whichever channels are switched on.
-- Placeholder logins (…@hv.local, …@hv-crm.local) are not real mailboxes and are ignored.
-- Additive, safe to re-run.

alter table public.hv_notifications add column if not exists email text;
alter table public.hv_notifications add column if not exists sent_via text;       -- 'email' | 'whatsapp' | 'email+whatsapp'

create or replace function public.hv_email_real(p text) returns text
language sql immutable as $$
  select case
    when p is null or btrim(p) = '' then null
    when lower(btrim(p)) !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then null
    when lower(btrim(p)) ~ '\.local$' then null
    else lower(btrim(p)) end
$$;

create or replace function public.hv_notify(p_recipient uuid, p_system text, p_entity_type text, p_entity_id text,
                                            p_title text, p_body text, p_url text, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare u record; k text; ph text; em text;
begin
  if p_recipient is null then return; end if;
  select id, is_active, phone, email into u from app_users where id = p_recipient;
  if u.id is null then return; end if;
  ph := hv_phone_e164(u.phone); em := hv_email_real(u.email);
  k := coalesce(p_dedupe, p_system || ':' || coalesce(p_entity_type, '') || ':' || coalesce(p_entity_id, '') || ':' || p_recipient::text || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  insert into hv_notifications (recipient, phone, email, system, entity_type, entity_id, title, body, url, status, skip_reason, dedupe_key)
  values (p_recipient, ph, em, p_system, p_entity_type, p_entity_id, left(p_title, 200), left(p_body, 500), p_url,
          case when not u.is_active then 'skipped' when auth.uid() = p_recipient then 'skipped' when ph is null and em is null then 'skipped' else 'pending' end,
          case when not u.is_active then 'login disabled' when auth.uid() = p_recipient then 'assigned to self' when ph is null and em is null then 'no real e-mail or phone in HR' end,
          k)
  on conflict (dedupe_key) do nothing;
exception when others then
  null;      -- a message must never block the task itself
end $$;
revoke all on function public.hv_notify(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
