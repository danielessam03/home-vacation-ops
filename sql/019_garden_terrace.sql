-- HV OPS — 019_garden_terrace.sql   (2026-10-20)
-- Garden / terrace on every unit (listings and offline properties): yes/no, and the size when yes — so the description can mention it.
-- Additive, safe to re-run. Re-run 003_views.sql afterwards (new columns on ops_listings).
alter table ops_listings add column if not exists has_garden  boolean;
alter table ops_listings add column if not exists garden_sqm  numeric(10,2);
alter table ops_listings add column if not exists has_terrace boolean;
alter table ops_listings add column if not exists terrace_sqm numeric(10,2);
