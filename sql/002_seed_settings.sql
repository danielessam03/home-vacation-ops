-- HV OPS — 002_seed_settings.sql
-- Seeds settings + the two agencies. "on conflict do nothing" = re-running never overwrites edits made in the app.

insert into settings (key, value) values
('location_codes', '{
  "Al Dau Heights":"ADH","Arabia":"ARB","Cyprus":"CYP","El Ahyaa":"AHY","El Gouna":"EG",
  "El Helal":"HLL","El Kawther":"KWT","El Wafaa":"WFA","El Wozra":"WZR","Hadaba":"HD",
  "Intercontinental":"INT","Jabal El Hareem":"JBH","Luxor":"LXR","Magawish":"MGW",
  "Makadi Bay":"MKD","Makadina":"MKN","Mamsha Promenade":"MMP","Marsa Alam":"MSA",
  "Mubarak 2":"MB2","Mubarak 6":"MB6","Mubarak 7":"MB7","New El Kawther":"NKW",
  "Port Ghalib":"PGB","Sahl Hasheesh":"SH","Sheraton":"SHR","Sky Villas":"SKV",
  "Soma Bay":"SMB","Village Road":"VLG"
}'::jsonb),
('unit_type_codes', '{
  "Apartment":"A","Duplex":"D","Land":"L","Penthouse":"P","Shop":"SH","Studio":"ST",
  "Townhouse":"TH","Villa":"V","Chalet":"C","Compound":"CMP"
}'::jsonb),
('sla_hours', '{"warn":48,"breach":72,"incomplete_alert":24,"claim_grace":24}'::jsonb),
('required_fields', '[
  "location","property_type","deal_type","area_sqm","building_levels","floor","bedrooms","bathrooms",
  "balconies","furnished","media_images_count","media_videos_count","is_exclusive","view_type",
  "price","currency","facilities","selling_points","buyer_persona_nationality",
  "buyer_persona_age_range","buyer_persona_gender","cover_photo_belongs"
]'::jsonb),
('default_channels', '["website","property_finder","aqarmap"]'::jsonb),
('portal_labels', '{"website":"Website","property_finder":"Property Finder","aqarmap":"Aqarmap","olx":"OLX / Dubizzle","other":"Other"}'::jsonb),
('currencies', '["EUR","USD","EGP"]'::jsonb),
('view_types', '["Sea view","Pool View","Sea and Pool view","Side Sea View","Garden view","Lagoon view","Lake View","Mountain View","City View","Street View","Nile View","Other"]'::jsonb),
('facilities', '[
  "Swimming pool","Private beach","Beach access","24/7 security","Gated community","Elevator","Parking",
  "Garden","Private garden","Roof terrace","Balcony","Air conditioning","Fully equipped kitchen",
  "Gym","Spa","Kids area","Restaurant","Cafe","Supermarket","Reception","Housekeeping","Maintenance service",
  "Wi-Fi","Satellite TV","Aqua park","Tennis court","Golf course","Marina","Installment plan","Green contract"
]'::jsonb),
('age_ranges', '["18-24","25-34","35-44","45-54","55-64","65+"]'::jsonb),
('task_types', '["data_entry","portal_publish","photo_shoot","video_shoot","editing","coordination","agency_followup","other"]'::jsonb),
('deliverable_item_types', '["post","reel","story","ad_campaign","blog_article","backlink","technical_fix","report"]'::jsonb),
('metric_defs', '{
  "london_marketing_studios":[
    {"key":"reach","label":"Reach","unit":"count"},
    {"key":"impressions","label":"Impressions","unit":"count"},
    {"key":"engagement_rate","label":"Engagement rate","unit":"%"},
    {"key":"followers_gained","label":"Followers gained","unit":"count"},
    {"key":"leads","label":"Leads","unit":"count"},
    {"key":"ad_spend","label":"Ad spend","unit":"currency"},
    {"key":"cost_per_lead","label":"Cost per lead","unit":"currency"},
    {"key":"ctr","label":"CTR","unit":"%"}
  ],
  "izmi":[
    {"key":"organic_sessions","label":"Organic sessions","unit":"count"},
    {"key":"keywords_top10","label":"Keywords in top 10","unit":"count"},
    {"key":"keywords_top3","label":"Keywords in top 3","unit":"count"},
    {"key":"backlinks_new","label":"New backlinks","unit":"count"},
    {"key":"pages_published","label":"Pages published","unit":"count"},
    {"key":"technical_fixes","label":"Technical fixes","unit":"count"},
    {"key":"organic_leads","label":"Organic leads","unit":"count"}
  ]
}'::jsonb),
('user_kpi_defs', '[
  {"key":"listings_entered","label":"Listings entered","unit":"count","team":"data_entry","better":"high"},
  {"key":"avg_completeness","label":"Avg completeness","unit":"%","team":"data_entry","better":"high"},
  {"key":"avg_hours_to_publish","label":"Avg hours to publish","unit":"h","team":"data_entry","better":"low"},
  {"key":"on_time_pct","label":"Within 72h SLA","unit":"%","team":"data_entry","better":"high"},
  {"key":"rejected_count","label":"Corrections / rejected","unit":"count","team":"data_entry","better":"low"},
  {"key":"portal_coverage_pct","label":"Portal coverage","unit":"%","team":"data_entry","better":"high"},
  {"key":"claimed_not_found","label":"Claimed not found","unit":"count","team":"data_entry","better":"low"},
  {"key":"tasks_on_time_pct","label":"Tasks on time","unit":"%","team":"marketing","better":"high"},
  {"key":"tasks_completed","label":"Tasks completed","unit":"count","team":"marketing","better":"high"},
  {"key":"deliverables_logged","label":"Deliverables logged","unit":"count","team":"marketing","better":"high"},
  {"key":"shoots_completed","label":"Shoots completed","unit":"count","team":"marketing","better":"high"},
  {"key":"media_complete","label":"Listings with media complete","unit":"count","team":"marketing","better":"high"}
]'::jsonb)
on conflict (key) do nothing;

insert into agencies (name, display_name, contact_person, scope_notes) values
('london_marketing_studios', 'London Marketing Studios', null, 'Social media + paid ads (Meta / Google)'),
('izmi', 'IZMI', 'Mohamed Gheedan', 'SEO')
on conflict (name) do nothing;
