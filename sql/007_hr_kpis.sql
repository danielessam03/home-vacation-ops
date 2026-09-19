-- HV OPS — 007_hr_kpis.sql
-- HV Ops results flow into the HR KPI module (kpi_metrics / kpi_entries), exactly like CRM bookings and maintenance tasks already do:
-- automatic, pre-approved entries with source = 'ops' and a unique external_id so nothing is ever counted twice.
-- HR owns the points: change them in HR -> KPIs -> Metrics. Additive; safe to re-run.
--
-- Touches two HR constraints (adds one allowed value to each; nothing is removed).

alter table public.kpi_metrics drop constraint if exists kpi_metrics_category_check;
alter table public.kpi_metrics add constraint kpi_metrics_category_check
  check (category in ('sales','property','maintenance','attendance','general','operations'));

alter table public.kpi_entries drop constraint if exists kpi_entries_source_check;
alter table public.kpi_entries add constraint kpi_entries_source_check
  check (source in ('app','engaz','manual','crm','maintenance','ops'));

insert into public.kpi_metrics (code, name_en, name_ar, points_per_unit, value_points_per_million, has_value, sort, category) values
  ('ops_listing_live',    'Listing verified live on website', 'وحدة منشورة ومؤكدة على الموقع',   3, 0, false, 20, 'operations'),
  ('ops_listing_on_time', 'Listing published within SLA',     'وحدة منشورة خلال المهلة (72 ساعة)', 2, 0, false, 21, 'operations'),
  ('ops_task_on_time',    'Ops task approved, on time',       'مهمة تشغيل معتمدة في موعدها',      2, 0, false, 22, 'operations'),
  ('ops_task_late',       'Ops task approved, late',          'مهمة تشغيل معتمدة متأخرة',         1, 0, false, 23, 'operations')
on conflict (code) do nothing;

-- employee behind a login (HR links them with employees.user_id). No employee => nothing to credit, silently.
create or replace function public.ops_employee_of(p_user uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from employees where user_id = p_user order by (status = 'active') desc limit 1
$$;

create or replace function public.ops_kpi_credit(p_user uuid, p_code text, p_date date, p_ref text, p_ext text, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare emp uuid; metric uuid;
begin
  emp := public.ops_employee_of(p_user);
  select id into metric from kpi_metrics where code = p_code and is_active;
  if emp is null or metric is null then return; end if;
  insert into kpi_entries (employee_id, metric_id, entry_date, quantity, reference, status, source, external_id, approved_at, notes)
  values (emp, metric, coalesce(p_date, current_date), 1, p_ref, 'approved', 'ops', p_ext, now(), p_notes)
  on conflict (external_id) do update set status = 'approved', employee_id = excluded.employee_id, entry_date = excluded.entry_date;
exception when others then
  null;      -- a KPI hiccup must never block the listing / task itself
end $$;

-- Listing verified live by the website verifier => credit the person who entered it (+ bonus when inside the SLA).
create or replace function public.ops_kpi_from_listing() returns trigger
language plpgsql security definer set search_path = public as $$
declare breach numeric; hrs numeric;
begin
  if new.date_published_verified is not null and old.date_published_verified is null then
    perform public.ops_kpi_credit(new.entered_by, 'ops_listing_live', new.date_published_verified::date, new.reference_code,
                                  'ops:live:' || new.id, 'HV Ops: verified live ' || coalesce(new.website_url, ''));
    select coalesce((value ->> 'breach')::numeric, 72) into breach from ops_settings where key = 'sla_hours';
    hrs := greatest(0, extract(epoch from (new.date_published_verified - new.date_received)) - new.paused_seconds) / 3600.0;
    if hrs <= coalesce(breach, 72) then
      perform public.ops_kpi_credit(new.entered_by, 'ops_listing_on_time', new.date_published_verified::date, new.reference_code,
                                    'ops:ontime:' || new.id, 'HV Ops: published in ' || round(hrs, 1) || 'h');
    end if;
  elsif new.status = 'rejected' and old.status is distinct from new.status then
    update kpi_entries set status = 'rejected', notes = coalesce(notes, '') || ' | listing rejected'
     where external_id in ('ops:live:' || new.id, 'ops:ontime:' || new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_z_kpi on ops_listings;
create trigger trg_z_kpi after update on ops_listings for each row execute function public.ops_kpi_from_listing();

-- Task approved by the manager => credit the assignee (on time vs late are separate metrics so HR can weight them).
create or replace function public.ops_kpi_from_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare late boolean;
begin
  if new.status = 'done' and old.status is distinct from new.status and new.assigned_to is not null then
    late := new.due_at is not null and coalesce(new.completed_at, now()) > new.due_at;
    perform public.ops_kpi_credit(new.assigned_to, case when late then 'ops_task_late' else 'ops_task_on_time' end,
                                  coalesce(new.completed_at, now())::date, left(new.title, 120), 'ops:task:' || new.id, 'HV Ops task');
  elsif new.status <> 'done' and old.status = 'done' then
    update kpi_entries set status = 'rejected', notes = coalesce(notes, '') || ' | task reopened' where external_id = 'ops:task:' || new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_z_kpi on ops_tasks;
create trigger trg_z_kpi after update on ops_tasks for each row execute function public.ops_kpi_from_task();
