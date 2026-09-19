// One-off local run of the verifier (same code as the Worker, but no 50-request limit) — used for the first backfill.
//   node worker/run-local.mjs [maxPages]
// Reads the service key from C:/Users/Essam/.hv-ops-secrets/ — secrets are kept OUTSIDE the repo folder on purpose.
import fs from 'fs';
import { runVerifier } from './verifier.js';

const here = new URL('.', import.meta.url);
const env = {
  SUPABASE_URL: `https://${fs.readFileSync(new URL('../.supabase_project', here), 'utf8').trim()}.supabase.co`,
  SUPABASE_SERVICE_KEY: fs.readFileSync('C:/Users/Essam/.hv-ops-secrets/.supabase_service_key.token', 'utf8').trim(),
  WP_BASE_URL: 'https://home-vacation.com', WP_CPT: 'unit', MAX_PAGE_FETCHES: process.argv[2] || '600', MAX_PROJECT_FETCHES: '100', WHATSAPP_ENABLED: 'false',
};
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts = {}) => { const o = { ...opts }; delete o.cf; return realFetch(url, o); };   // "cf" is Workers-only
console.log(await runVerifier(env));
