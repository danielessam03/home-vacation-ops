// Builds harness-<role>.html in the repo root: the real index.html with supabase-js swapped for tests/harness/mock.js.
//   node tests/harness/mkharness.js admin        then serve the repo folder and open /harness-admin.html?nosw=1#tasks
// The file is git-ignored and never published (deploy.sh publishes index.html + the kit only).
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'sql', '002_seed_settings.sql'), 'utf8');
const settings = []; for (const m of sql.matchAll(/\('(\w+)',\s*'([\s\S]*?)'::jsonb\)/g)) settings.push({ key: m[1], value: JSON.parse(m[2]) });
const role = process.argv[2] || 'admin';
const mockSrc = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8').replace('__ROLE__', role).replace('__SETTINGS__', JSON.stringify(settings));
html = html.replace(/<script src="vendor\/supabase[^>]*><\/script>/, () => '<script>' + mockSrc + '</script>')
  .replace(/<script>window\.supabase\|\|document\.write[^\n]*\n/, () => '')
  .replace(/<script src="hv-core\.js"[^>]*><\/script>/, () => '');
if (!html.includes('window.__mockDb')) throw new Error('mock not injected — did the head change?');
fs.writeFileSync(path.join(root, 'harness-' + role + '.html'), html); console.log('ok harness-' + role + '.html', settings.length, 'settings');
