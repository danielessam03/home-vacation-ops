-- HV OPS — 023_template_assignees.sql   (2026-11-07)
-- Recurring task templates can name several people; every task created from the template is given to all of them.
-- Additive, safe to re-run.
alter table ops_recurring_templates add column if not exists assigned_to_multi uuid[] not null default '{}';
