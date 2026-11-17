-- HV OPS — 029_notify_phone_from_card.sql   (Daniel, 2026-11-17)
-- "You will find the phone numbers of all our team on the HR system — add them all."
-- hv_notify (the outbox behind every task / assignment message, WhatsApp and e-mail) read the phone only from the
-- LOGIN (app_users.phone). In HR most numbers are kept on the EMPLOYEE CARD (employees.phone): 5 of 11 active people
-- had a number on the card only and were skipped as "no phone". The login number still wins; when it is empty the
-- number of the person's employee card is used. Nothing in HR is changed — a number edited on the card is picked up
-- by the next message. Additive, safe to re-run.

create or replace function public.hv_notify(p_recipient uuid, p_system text, p_entity_type text, p_entity_id text,
                                            p_title text, p_body text, p_url text, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare u record; k text; ph text; em text;
begin
  if p_recipient is null then return; end if;
  select id, is_active, phone, email into u from app_users where id = p_recipient;
  if u.id is null then return; end if;
  ph := hv_phone_e164(coalesce(nullif(btrim(u.phone), ''),
          (select nullif(btrim(e.phone), '') from employees e where e.user_id = u.id and nullif(btrim(e.phone), '') is not null order by (e.status = 'active') desc limit 1)));
  em := hv_email_real(u.email);
  k := coalesce(p_dedupe, p_system || ':' || coalesce(p_entity_type, '') || ':' || coalesce(p_entity_id, '') || ':' || p_recipient::text || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  insert into hv_notifications (recipient, phone, email, system, entity_type, entity_id, title, body, url, status, skip_reason, dedupe_key)
  values (p_recipient, ph, em, p_system, p_entity_type, p_entity_id, left(p_title, 200), left(p_body, 500), p_url,
          case when not u.is_active then 'skipped' when auth.uid() = p_recipient then 'skipped' when ph is null and em is null then 'skipped' else 'pending' end,
          case when not u.is_active then 'login disabled' when auth.uid() = p_recipient then 'assigned to self' when ph is null and em is null then 'no real e-mail or phone in HR' end,
          k)
  on conflict (dedupe_key) do nothing;
exception when others then
  null;      -- a message must never block the action that caused it
end $$;

-- messages still waiting that were queued without a number: give them the card number too
update hv_notifications n
   set phone = hv_phone_e164((select nullif(btrim(e.phone), '') from employees e where e.user_id = n.recipient and nullif(btrim(e.phone), '') is not null order by (e.status = 'active') desc limit 1))
 where n.status = 'pending' and n.phone is null
   and exists (select 1 from employees e where e.user_id = n.recipient and nullif(btrim(e.phone), '') is not null);
