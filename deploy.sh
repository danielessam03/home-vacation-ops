#!/bin/sh
# Deploys ONLY index.html to the Cloudflare Pages project "home-vacation-ops" (https://home-vacation-ops.pages.dev).
# Never run "wrangler deploy" / "wrangler pages project create" from this folder: wrangler uploads the WHOLE folder as public assets.
set -e
cd "$(dirname "$0")"
sh build.sh
OUT="$(mktemp -d)"
cp index.html "$OUT/"
export CLOUDFLARE_API_TOKEN="$(tr -d '\r\n' < ../home-vacation-hr/.cloudflare_token)" CLOUDFLARE_ACCOUNT_ID=86fec8e85ee5a22498942b31a322b56e
cd "$OUT"
# home-vacation-ops.pages.dev = main address; hvops-home-vacation.pages.dev = spare address (added 2026-09-28 because the office
# connection cannot reach two Cloudflare IPs, 188.114.96.6 / 188.114.97.6, which the main address uses). Keep both up to date.
for p in home-vacation-ops hvops-home-vacation; do npx --yes wrangler@latest pages deploy . --project-name $p --branch main --commit-dirty=true; done
