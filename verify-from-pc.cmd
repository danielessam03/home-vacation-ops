@echo off
rem Website crawl from the office PC every 30 minutes (the website's bot protection blocks Cloudflare's servers, not this PC).
rem Registered 2026-09-26 with:  schtasks /Create /TN "HV Ops website verifier" /SC MINUTE /MO 30 /TR "C:\Users\Essam\home-vacation-ops\verify-from-pc.cmd" /F
rem Remove with:                 schtasks /Delete /TN "HV Ops website verifier" /F
cd /d C:\Users\Essam\home-vacation-ops
node worker\run-local.mjs 300 >> "%USERPROFILE%\.hv-ops-secrets\verifier.log" 2>&1
