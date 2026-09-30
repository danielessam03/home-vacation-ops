#!/bin/sh
# Builds HV Ops and publishes it to ALL its addresses through the HV kit (hv-shared/kit/publish.sh):
#   Cloudflare Pages  home-vacation-ops (main) + hvops-home-vacation (spare) — and ops.home-vacation.com once attached
#   GitHub Pages      https://danielessam03.github.io/home-vacation-ops/ (backup outside Cloudflare)
# Only index.html + the kit files are published (never this folder). Never run "wrangler deploy" / "wrangler pages
# project create" from this folder: wrangler would upload the WHOLE folder as public assets.
set -e
cd "$(dirname "$0")"
sh build.sh
sh ../hv-shared/kit/sync.sh .
sh ../hv-shared/kit/publish.sh . "home-vacation-ops hvops-home-vacation" home-vacation-ops
