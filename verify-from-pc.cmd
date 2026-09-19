@echo off
rem Hourly website crawl from the office PC (the website's bot protection blocks Cloudflare's servers, not this PC).
rem Register once:  schtasks /Create /TN "HV Ops website verifier" /SC HOURLY /TR "C:\Users\Essam\home-vacation-ops\verify-from-pc.cmd" /F
cd /d C:\Users\Essam\home-vacation-ops
node worker\run-local.mjs 300 >> "%USERPROFILE%\.hv-ops-secrets\verifier.log" 2>&1
