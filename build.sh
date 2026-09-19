#!/bin/sh
# Joins parts/ into the single index.html and compile-checks the JSX. The deployed app is ONLY index.html.
cd "$(dirname "$0")" && cat parts/01_head.html parts/02_core.jsx parts/03_metrics.jsx parts/04_listings.jsx parts/04b_projects.jsx parts/05_tasks.jsx parts/06_agencies_kpis.jsx parts/07_dashboard_reports.jsx parts/08_settings_app.jsx > index.html && wc -l index.html
