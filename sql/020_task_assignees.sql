-- HV OPS — 020_task_assignees.sql   (2026-10-21)
-- A task can be given to several people. assigned_to stays the first (main) person; the others live in assigned_to_multi.
-- Every assignee sees the task, can work it, is told about it, and gets the HR task credit when it is approved.
-- Additive, safe to re-run.
alter table ops_tasks add column if not exists assigned_to_multi uuid[] not null default '{}';
create index if not exists ops_idx_tasks_multi on ops_tasks using gin (assigned_to_multi);

-- keep the two columns tidy: no nulls, no duplicates, the main person is never repeated in the list
create or replace function ops_fn_task_assignees() returns trigger
language plpgsql security definer set search_path = public as $$
declare clean uuid[];
begin
  select coalesce(array_agg(distinct u), '{}') into clean from unnest(coalesce(new.assigned_to_multi, '{}')) u where u is not null and u is distinct from new.assigned_to;
  if new.assigned_to is null and cardinality(clean) > 0 then new.assigned_to := clean[1]; clean := clean[2:]; end if;
  new.assigned_to_multi := clean;
  return new;
end $$;
drop trigger if exists trg_a_assignees on ops_tasks;
create trigger trg_a_assignees before insert or update of assigned_to, assigned_to_multi on ops_tasks for each row execute function ops_fn_task_assignees();

-- staff may update a task they are on (main or extra assignee) or created
drop policy if exists tasks_update on ops_tasks;
create policy tasks_update on ops_tasks for update to authenticated
  using (public.ops_is_mgr() or (public.ops_is_staff() and (assigned_to = auth.uid() or auth.uid() = any(assigned_to_multi) or created_by = auth.uid())))
  with check (public.ops_is_mgr() or (public.ops_is_staff() and (assigned_to = auth.uid() or auth.uid() = any(assigned_to_multi) or created_by = auth.uid())));

-- messages: every person newly put on the task
create or replace function public.ops_notify_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare p uuid; body text; url text;
begin
  if new.status in ('done', 'cancelled') then return new; end if;
  body := coalesce('Due ' || to_char(new.due_at at time zone 'Africa/Cairo', 'DD Mon HH24:MI'), 'No due date') || case when new.priority in ('high','urgent') then ' · ' || new.priority else '' end;
  url := 'https://home-vacation-ops.pages.dev/#task/' || new.id;
  for p in select u from unnest(array[new.assigned_to] || coalesce(new.assigned_to_multi, '{}')) u where u is not null loop
    if tg_op = 'INSERT' or not (p = old.assigned_to or p = any(coalesce(old.assigned_to_multi, '{}'))) then
      perform hv_notify(p, 'ops', 'task', new.id::text, 'Task: ' || new.title, body, url);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists trg_y_notify on ops_tasks;
create trigger trg_y_notify after insert or update of assigned_to, assigned_to_multi, status on ops_tasks for each row execute function public.ops_notify_task();

-- HR credit: everyone on the task (the main person keeps the old external id, so nothing is counted twice)
create or replace function public.ops_kpi_from_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare late boolean; p uuid;
begin
  if new.status = 'done' and old.status is distinct from new.status then
    late := new.due_at is not null and coalesce(new.completed_at, now()) > new.due_at;
    for p in select u from unnest(array[new.assigned_to] || coalesce(new.assigned_to_multi, '{}')) u where u is not null loop
      perform public.ops_kpi_credit(p, case when late then 'ops_task_late' else 'ops_task_on_time' end,
                                    coalesce(new.completed_at, now())::date, left(new.title, 120),
                                    'ops:task:' || new.id || case when p = new.assigned_to then '' else ':' || p end, 'HV Ops task');
    end loop;
  elsif new.status <> 'done' and old.status = 'done' then
    update kpi_entries set status = 'rejected', notes = coalesce(notes, '') || ' | task reopened' where external_id like 'ops:task:' || new.id || '%';
  end if;
  return new;
end $$;
