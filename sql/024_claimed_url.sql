-- HV OPS — 024_claimed_url.sql   (2026-11-08)
-- "I uploaded it" can carry the page link. The verifier opens that exact link, reads the File Ref / Project ID on it and,
-- when it matches, verifies the listing or project straight away — no need to wait for the crawl to reach the page.
-- claimed_url_result keeps what the verifier found at that link (ok / wrong code / page not found) for the screen.
-- Additive, safe to re-run. Re-run 003_views.sql afterwards (new columns on ops_listings).
alter table ops_listings add column if not exists claimed_url text;
alter table ops_listings add column if not exists claimed_url_result text;
alter table ops_projects add column if not exists claimed_url text;
alter table ops_projects add column if not exists claimed_url_result text;
