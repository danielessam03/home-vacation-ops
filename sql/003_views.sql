-- HV OPS — 003_views.sql
-- Views run with the caller's permissions (security_invoker) so RLS still applies.
-- Re-run this file after any migration that adds columns to ops_listings: the SLA view selects l.*, and Postgres cannot
-- "replace" a view whose column order changed, so the views are dropped and rebuilt (views hold no data — nothing is lost).

drop view if exists ops_vw_user_kpis;
drop view if exists ops_vw_listing_sla;

create or replace view ops_vw_listing_sla with (security_invoker = true) as
with cfg as (
  select coalesce((select (value->>'warn')::numeric        from ops_settings where key = 'sla_hours'), 48) as warn_h,
         coalesce((select (value->>'breach')::numeric      from ops_settings where key = 'sla_hours'), 72) as breach_h,
         coalesce((select (value->>'claim_grace')::numeric from ops_settings where key = 'sla_hours'), 24) as claim_h
),
base as (
  select l.*,
         greatest(0, extract(epoch from (
             coalesce(l.date_published_verified, now()) - l.date_received
           )) - l.paused_seconds
             - case when l.status = 'on_hold' and l.hold_started_at is not null and l.date_published_verified is null
                    then extract(epoch from (now() - l.hold_started_at)) else 0 end
         ) / 3600.0 as hours_elapsed
  from ops_listings l
)
select b.*,
       case when b.date_published_verified is not null then round(b.hours_elapsed::numeric, 2) end as hours_to_publish,
       case when b.status in ('rejected','archived') then 'none'
            when b.hours_elapsed <  cfg.warn_h   then 'green'
            when b.hours_elapsed <= cfg.breach_h then 'yellow'
            else 'red' end as sla_state,
       (b.date_published_verified is not null and b.hours_elapsed <= cfg.breach_h) as is_on_time,
       (b.status = 'published_claimed' and b.date_published_verified is null
          and b.date_published_claimed < now() - make_interval(hours => cfg.claim_h::int)) as claimed_not_found
from base b cross join cfg;

create or replace view ops_vw_user_kpis with (security_invoker = true) as
-- Two stages, two people: ENTRY KPIs belong to entered_by, UPLOAD KPIs to whoever put the listing online.
with l as (
  select entered_by as user_id, date_trunc('month', date_received)::date as period_month,
         count(*)                                                   as listings_entered,
         round(avg(completeness_pct), 1)                            as avg_completeness,
         round(avg(extract(epoch from (date_ready - date_received)) / 3600.0)::numeric, 1) as avg_hours_to_ready,
         count(*) filter (where status = 'rejected')                as rejected_count
  from ops_listings
  where status <> 'archived'
  group by 1, 2
),
u as (
  select coalesce(published_claimed_by, assigned_to, entered_by) as user_id, date_trunc('month', date_received)::date as period_month,
         count(*)                                                   as listings_uploaded,
         round(avg(hours_to_publish), 1)                            as avg_hours_to_publish,
         round(avg(extract(epoch from (date_published_verified - date_ready)) / 3600.0)::numeric, 1) as avg_hours_ready_to_live,
         round(100.0 * count(*) filter (where is_on_time)
               / nullif(count(*) filter (where date_published_verified is not null), 0), 1) as on_time_pct,
         count(*) filter (where claimed_not_found)                  as claimed_not_found_count
  from ops_vw_listing_sla
  where status in ('published_claimed','verified_live')
  group by 1, 2
),
c as (
  select coalesce(li.published_claimed_by, li.assigned_to, li.entered_by) as user_id, date_trunc('month', li.date_received)::date as period_month,
         round(100.0 * count(*) filter (where ch.status = 'published') / nullif(count(*), 0), 1) as portal_coverage_pct
  from ops_listing_channels ch join ops_listings li on li.id = ch.listing_id
  where li.status not in ('archived','rejected')
  group by 1, 2
),
t as (
  select assigned_to as user_id, date_trunc('month', coalesce(due_at, created_at))::date as period_month,
         count(*) filter (where status = 'done')                                             as tasks_completed,
         count(*) filter (where status = 'done' and (due_at is null or completed_at <= due_at)) as tasks_on_time,
         count(*) filter (where due_at is not null and (
              (status = 'done' and completed_at > due_at) or
              (status not in ('done','cancelled') and due_at < now())))                      as tasks_late
  from ops_tasks
  where assigned_to is not null
  group by 1, 2
),
k as (select user_id, period_month from l union select user_id, period_month from u union select user_id, period_month from t)
select k.user_id, p.full_name, p.role, k.period_month,
       coalesce(l.listings_entered, 0)        as listings_entered,
       l.avg_completeness, l.avg_hours_to_ready,
       coalesce(l.rejected_count, 0)          as rejected_count,
       coalesce(u.listings_uploaded, 0)       as listings_uploaded,
       u.avg_hours_to_publish, u.avg_hours_ready_to_live, u.on_time_pct,
       coalesce(u.claimed_not_found_count, 0) as claimed_not_found_count,
       c.portal_coverage_pct,
       coalesce(t.tasks_completed, 0)         as tasks_completed,
       coalesce(t.tasks_on_time, 0)           as tasks_on_time,
       coalesce(t.tasks_late, 0)              as tasks_late
from k
join ops_profiles p on p.id = k.user_id
left join l on l.user_id = k.user_id and l.period_month = k.period_month
left join u on u.user_id = k.user_id and u.period_month = k.period_month
left join c on c.user_id = k.user_id and c.period_month = k.period_month
left join t on t.user_id = k.user_id and t.period_month = k.period_month;

create or replace view ops_vw_agency_scorecard with (security_invoker = true) as
select d.agency_id, a.display_name, d.period_month,
       sum(d.planned_qty)   as planned_qty,
       sum(d.delivered_qty) as delivered_qty,
       round(100.0 * sum(d.delivered_qty) / nullif(sum(d.planned_qty), 0), 1) as delivery_rate_pct,
       round(100.0 * count(*) filter (where d.delivered_at is not null and d.due_date is not null and d.delivered_at::date <= d.due_date)
             / nullif(count(*) filter (where d.delivered_at is not null), 0), 1) as on_time_pct,
       sum(d.revisions_count) as revisions,
       round(100.0 * sum(d.revisions_count) / nullif(sum(d.delivered_qty), 0), 1) as revision_rate_pct
from ops_agency_deliverables d join ops_agencies a on a.id = d.agency_id
group by 1, 2, 3;

-- grants live here too, because re-creating a view resets them
grant select on ops_vw_listing_sla, ops_vw_user_kpis, ops_vw_agency_scorecard to authenticated;
revoke all on ops_vw_listing_sla, ops_vw_user_kpis, ops_vw_agency_scorecard from anon;
