# Tests

`sql.test.mjs` runs sql/001–005 twice in PGlite (real Postgres compiled to WASM, with Supabase's `auth` schema stubbed) and then checks the
triggers, guards, RLS and views: 45 checks. Run after touching anything in `sql/`:

    npm install --no-save @electric-sql/pglite
    node tests/sql.test.mjs
