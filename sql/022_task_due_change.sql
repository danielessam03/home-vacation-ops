-- HV OPS — 022_task_due_change.sql   (2026-11-07)
-- Anyone on a task may move its due date, but must say why. Every move is kept on the task (due_history) and raises an alert
-- for the managers / admins (Daniel's notifications) and for the person who created the task.
-- Additive, safe to re-run.
alter table ops_tasks add column if not exists due_history jsonb not null default '[]'::jsonb;
alter table ops_tasks add column if not exists due_change_reason text;      -- written with the change, then cleared

create or replace function ops_fn_task_due_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; reason text;
begin
  if tg_op = 'UPDATE' and new.due_at is distinct from old.due_at and old.due_at is not null then
    reason := nullif(btrim(coalesce(new.due_change_reason, '')), '');
    if reason is null then raise exception 'Say why the due date is being moved.'; end if;
    select coalesce(full_name, email, 'Someone') into who from ops_profiles where id = auth.uid();
    new.due_history := new.due_history || jsonb_build_object('from', old.due_at, 'to', new.due_at, 'at', now(), 'by', auth.uid(), 'reason', reason);
    insert into ops_alerts (level, title, body, entity_type, entity_id, target_role, dedupe_key)
    values ('warning', 'Due date moved — ' || new.title,
            coalesce(who, 'Someone') || ' moved it from ' || to_char(old.due_at at time zone 'Africa/Cairo', 'DD Mon HH24:MI')
              || ' to ' || coalesce(to_char(new.due_at at time zone 'Africa/Cairo', 'DD Mon HH24:MI'), 'no date') || ' — ' || reason,
            'task', new.id, 'manager', 'taskdue-moved:' || new.id || ':' || extract(epoch from clock_timestamp())::bigint || ':' || jsonb_array_length(new.due_history));
    if new.created_by is not null and new.created_by is distinct from auth.uid() then
      insert into ops_alerts (level, title, body, entity_type, entity_id, target_user, dedupe_key)
      values ('warning', 'Due date moved — ' || new.title, coalesce(who, 'Someone') || ' moved the due date — ' || reason, 'task', new.id, new.created_by,
              'taskdue-moved:' || new.id || ':' || extract(epoch from clock_timestamp())::bigint || ':' || jsonb_array_length(new.due_history) || ':c');
    end if;
  end if;
  new.due_change_reason := null;
  return new;
end $$;
drop trigger if exists trg_b_due_change on ops_tasks;
create trigger trg_b_due_change before update on ops_tasks for each row execute function ops_fn_task_due_change();
