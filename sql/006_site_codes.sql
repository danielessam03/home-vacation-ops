-- HV OPS — 006_site_codes.sql
-- Aligns the reference-code tables with the prefixes the website ALREADY uses (read from all 493 live ops_listings on 2026-09-19),
-- so old and new ops_listings share one convention. Only changes two ops_settings rows; affects NEW ops_listings only. Safe to re-run.
--
-- Kept from the original plan because the site has no usable example: El Wozra = WZR, Makadina = MKN.
-- Deliberate differences from the site:
--   Sheraton stays SHR  — the site uses SH for BOTH Sheraton and Sahl Hasheesh; SH is kept for Sahl Hasheesh (the majority).
--   New El Kawther = NKW — the site mixes KW / NKW / NK; KW is El Kawther.
--   Shop stays SH, Chalet stays C — the site has a single shop, coded C.

update ops_settings set updated_at = now(), value = '{
  "Al Dau Heights":"DH","Arabia":"AR","Cyprus":"CY","El Ahyaa":"AH","El Gouna":"G",
  "El Helal":"HL","El Kawther":"KW","El Wafaa":"WA","El Wozra":"WZR","Hadaba":"HD",
  "Intercontinental":"IN","Jabal El Hareem":"JH","Luxor":"LX","Magawish":"MG",
  "Makadi Bay":"MK","Makadina":"MKN","Mamsha Promenade":"MP","Marsa Alam":"MA",
  "Mubarak 2":"M2","Mubarak 6":"M6","Mubarak 7":"M7","New El Kawther":"NKW",
  "Port Ghalib":"PG","Sahl Hasheesh":"SH","Sheraton":"SHR","Sky Villas":"SV",
  "Soma Bay":"SB","Village Road":"VR"
}'::jsonb
where key = 'location_codes'
  and value ->> 'Intercontinental' = 'INT';          -- only if still the original seed (never overwrite edits made in Settings)

update ops_settings set updated_at = now(), value = jsonb_set(value, '{Studio}', '"S"')
where key = 'unit_type_codes'
  and value ->> 'Studio' = 'ST';
