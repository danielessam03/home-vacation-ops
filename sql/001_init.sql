-- HV OPS — 001_init.sql
-- Enums + tables. Additive and re-runnable: nothing here drops or truncates anything.
-- Runs on the UNIFIED Home Vacation project (plwyzkqlbzcikmuurjqg) next to HR, maintenance and CRM.
-- Every HV Ops object is prefixed ops_ so it can never collide with the other systems (HR already has tasks, profiles, audit_log, my_role()).
-- One login for all systems: people are rows in HR's app_users; HV Ops only adds two columns to it.

-- ---------------------------------------------------------------- unified login: HV Ops access is switched on from HR
alter table public.app_users add column if not exists access_ops boolean not null default false;
alter table public.app_users add column if not exists ops_role   text;       -- admin | manager | data_entry | marketing
do $$ begin
  alter table public.app_users add constraint app_users_ops_role_check check (ops_role is null or ops_role in ('admin','manager','data_entry','marketing'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- enums
do $$ begin create type ops_user_role as enum ('admin','manager','data_entry','marketing'); exception when duplicate_object then null; end $$;
do $$ begin create type ops_listing_status as enum ('draft','ready_to_publish','published_claimed','verified_live','on_hold','rejected','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type ops_listing_source as enum ('sales_agent','owner','developer','whatsapp','walk_in','other'); exception when duplicate_object then null; end $$;
do $$ begin create type ops_deal_type as enum ('sale','rent'); exception when duplicate_object then null; end $$;
do $$ begin create type ops_channel_name as enum ('website','property_finder','aqarmap','olx','other'); exception when duplicate_object then null; end $$;
do $$ begin create type ops_channel_status as enum ('not_started','in_progress','published','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type ops_task_status as enum ('todo','doing','review','done','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type ops_task_priority as enum ('low','normal','high','urgent'); exception when duplicate_object then null; end $$;
do $$ begin create type ops_agency_name as enum ('london_marketing_studios','izmi'); exception when duplicate_object then null; end $$;
do $$ begin create type ops_deliverable_status as enum ('planned','submitted','approved','revision_requested','late','missed'); exception when duplicate_object then null; end $$;
do $$ begin create type ops_alert_level as enum ('info','warning','critical'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- who am I in HV Ops?
-- NULL when not signed in, login disabled in HR, or HV Ops not ticked for this person => every policy fails.
-- A CEO with no explicit ops_role is an HV Ops admin; everyone else needs the role picked in HR.
create or replace function public.ops_role_of(a public.app_users) returns ops_user_role
language sql immutable as $$
  select coalesce(a.ops_role, case when a.role = 'ceo' then 'admin' else 'data_entry' end)::ops_user_role
$$;

create or replace function public.ops_my_role() returns ops_user_role
language sql stable security definer set search_path = public as $$
  select public.ops_role_of(a) from app_users a where a.id = auth.uid() and a.is_active and a.access_ops
$$;

create or replace function public.ops_is_staff() returns boolean
language sql stable security definer set search_path = public as $$ select public.ops_my_role() is not null $$;

create or replace function public.ops_is_mgr() returns boolean
language sql stable security definer set search_path = public as $$ select public.ops_my_role() in ('admin','manager') $$;

-- The people list HV Ops shows. Runs as its owner so it can read app_users, but only hands rows to HV Ops staff
-- (or your own row), and only the harmless columns — no salaries, nothing else from HR.
create or replace view public.ops_profiles as
select a.id,
       coalesce(nullif(a.full_name_en, ''), nullif(a.full_name_ar, ''), a.username, split_part(a.email, '@', 1)) as full_name,
       a.email, a.username, public.ops_role_of(a)::text as role, a.phone,
       (a.is_active and a.access_ops) as is_active, a.created_at,
       (select e.id from public.employees e where e.user_id = a.id limit 1) as employee_id
from public.app_users a
where (a.access_ops or a.ops_role is not null)
  and (public.ops_is_staff() or a.id = auth.uid());
revoke all on public.ops_profiles from anon;
grant select on public.ops_profiles to authenticated;

-- ---------------------------------------------------------------- ops_settings
create table if not exists ops_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- ops_listings
create sequence if not exists ops_listing_ref_seq start 2001;

create table if not exists ops_listings (
  id uuid primary key default gen_random_uuid(),
  reference_code text unique not null,           -- HD-A-1012-S, generated by trigger
  title text,
  location text not null,
  property_type text not null,
  deal_type ops_deal_type not null,
  -- The fields below are required for 100% completeness but nullable so a draft can be saved.
  area_sqm numeric,
  building_levels int,
  floor int,
  bedrooms int,
  bathrooms int,
  balconies int,
  furnished boolean,
  media_images_count int default 0,
  media_videos_count int default 0,
  media_drive_link text,
  is_exclusive boolean,
  view_type text,
  price numeric,
  currency text,                                 -- EUR | USD | EGP, never converted
  facilities text[] default '{}',
  selling_points text,
  buyer_persona_nationality text,
  buyer_persona_age_range text,
  buyer_persona_gender text,
  cover_photo_belongs boolean,
  date_received timestamptz not null default now(),   -- SLA clock start
  date_published_claimed timestamptz,
  date_published_verified timestamptz,                -- SLA clock stop (verifier only)
  source_type ops_listing_source not null,
  source_name text not null,
  source_contact text,
  entered_by uuid not null references public.app_users(id),
  assigned_to uuid references public.app_users(id),
  status ops_listing_status not null default 'draft',
  status_before_hold ops_listing_status,
  hold_reason text,
  hold_started_at timestamptz,
  paused_seconds bigint not null default 0,           -- total on_hold time, excluded from SLA
  rejection_reason text,
  completeness_pct int not null default 0,
  missing_fields text[] default '{}',
  website_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- columns added by later migrations (008-010), repeated here so a fresh install can build the views in 003 straight away
alter table ops_listings add column if not exists media_uploaded boolean;
alter table ops_listings add column if not exists media_has_logo boolean;
alter table ops_listings add column if not exists media_edited   boolean;
alter table ops_listings add column if not exists owner_name  text;
alter table ops_listings add column if not exists owner_phone text;
alter table ops_listings add column if not exists media_approved_by uuid references public.app_users(id);
alter table ops_listings add column if not exists media_approved_at timestamptz;
alter table ops_listings add column if not exists published_claimed_by uuid references public.app_users(id);
alter table ops_listings add column if not exists date_ready timestamptz;
create index if not exists ops_idx_listings_status on ops_listings(status);
create index if not exists ops_idx_listings_entered_by on ops_listings(entered_by);
create index if not exists ops_idx_listings_assigned_to on ops_listings(assigned_to);
create index if not exists ops_idx_listings_date_received on ops_listings(date_received);

create table if not exists ops_listing_channels (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references ops_listings(id),
  channel ops_channel_name not null,
  status ops_channel_status not null default 'not_started',
  published_at timestamptz,
  url text,
  notes text,
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now(),
  unique (listing_id, channel)
);
create index if not exists ops_idx_channels_listing on ops_listing_channels(listing_id);

-- ---------------------------------------------------------------- verifier tables
create table if not exists ops_wp_listing_index (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  url text,
  wp_published_at timestamptz,
  first_seen_at timestamptz not null default now(),
  method text,
  raw jsonb
);

-- one row per website page the verifier has looked at, so it never re-fetches unchanged pages
create table if not exists ops_wp_crawl_log (
  url text primary key,
  wp_published_at timestamptz,
  wp_modified_at timestamptz,
  reference_code text,
  http_status int,
  last_fetched_at timestamptz not null default now()
);

create table if not exists ops_verifier_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  method text,                                   -- 'rest+html' | 'sitemap+html'
  pages_listed int default 0,
  pages_fetched int default 0,
  refs_found int default 0,
  listings_verified int default 0,
  alerts_created int default 0,
  pending_pages int default 0,
  error text
);

-- ---------------------------------------------------------------- ops_tasks
create table if not exists ops_recurring_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  task_type text,
  assigned_to uuid references public.app_users(id),
  priority ops_task_priority not null default 'normal',
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  weekday int check (weekday between 0 and 6),   -- 0 = Sunday
  day_of_month int check (day_of_month between 1 and 31),
  due_time time not null default '17:00',
  is_active boolean not null default true,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now()
);

create table if not exists ops_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  task_type text,
  assigned_to uuid references public.app_users(id),
  created_by uuid references public.app_users(id),
  status ops_task_status not null default 'todo',
  priority ops_task_priority not null default 'normal',
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,                      -- when the work was submitted (review) or finished
  approved_by uuid references public.app_users(id),
  approved_at timestamptz,
  rejection_reason text,
  listing_id uuid references ops_listings(id),
  agency ops_agency_name,
  recurring_template_id uuid references ops_recurring_templates(id),
  recurring_for_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- not partial on purpose: the worker upserts with ON CONFLICT on these columns (NULLs never conflict)
create unique index if not exists ops_uq_tasks_recurring on ops_tasks(recurring_template_id, recurring_for_date);
create index if not exists ops_idx_tasks_assigned on ops_tasks(assigned_to);
create index if not exists ops_idx_tasks_status on ops_tasks(status);

-- ---------------------------------------------------------------- ops_agencies
create table if not exists ops_agencies (
  id uuid primary key default gen_random_uuid(),
  name ops_agency_name not null unique,
  display_name text not null,
  contact_person text,
  contact_email text,
  contact_phone text,
  contract_start date,
  contract_end date,
  monthly_fee numeric,
  currency text,
  scope_notes text,
  is_active boolean not null default true
);

create table if not exists ops_agency_deliverables (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references ops_agencies(id),
  period_month date not null,                    -- first of month
  item_type text not null,
  planned_qty int not null default 0,
  due_date date,
  delivered_qty int not null default 0,
  delivered_at timestamptz,
  status ops_deliverable_status not null default 'planned',
  revisions_count int not null default 0,
  logged_by uuid references public.app_users(id),
  approved_by uuid references public.app_users(id),
  approved_at timestamptz,
  notes text,
  proof_url text,
  created_at timestamptz not null default now()
);
create index if not exists ops_idx_deliv_agency_month on ops_agency_deliverables(agency_id, period_month);

create table if not exists ops_agency_metrics (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references ops_agencies(id),
  period_month date not null,
  metric_key text not null,
  metric_value numeric,
  unit text,
  entered_by uuid references public.app_users(id),
  source text not null default 'manual' check (source in ('manual','supermetrics','ga4')),
  created_at timestamptz not null default now(),
  unique (agency_id, period_month, metric_key)
);

create table if not exists ops_kpi_targets (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user','agency','team')),
  subject_id uuid,
  period_month date not null,
  metric_key text not null,
  target_value numeric,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists ops_uq_kpi_targets on ops_kpi_targets(subject_type, subject_id, period_month, metric_key);

-- ---------------------------------------------------------------- ops_alerts / audit / snapshots
create table if not exists ops_alerts (
  id uuid primary key default gen_random_uuid(),
  level ops_alert_level not null default 'info',
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  target_user uuid references public.app_users(id),
  target_role ops_user_role,
  is_read boolean not null default false,
  whatsapp_sent boolean not null default false,
  dedupe_key text unique,                        -- stops the hourly worker repeating the same alert
  created_at timestamptz not null default now()
);
create index if not exists ops_idx_alerts_target on ops_alerts(target_user, is_read);

create table if not exists ops_audit_log (
  id bigserial primary key,
  table_name text not null,
  record_id uuid,
  action text not null,                          -- insert | update | delete_soft
  field_name text,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  ip text
);
create index if not exists ops_idx_audit_record on ops_audit_log(table_name, record_id);

create table if not exists ops_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_type text not null,                     -- daily | weekly | monthly | custom
  period_start date not null,
  period_end date not null,
  title text,
  payload jsonb not null,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now()
);
