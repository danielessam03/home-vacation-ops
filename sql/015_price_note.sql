-- HV OPS — 015_price_note.sql   (2026-09-28)
-- "Price details": the words that go with the price in the office sheets ("per month, including maintenance", "negotiable" …).
-- Kept separate so they never make an empty Selling Points look filled. Not a required field.
-- Additive, safe to re-run. Re-run 003_views.sql afterwards (new column on ops_listings).
alter table ops_listings add column if not exists price_note text;
