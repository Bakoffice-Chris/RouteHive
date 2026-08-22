# Route Platform API (v0.1)

Backend for the field sales route platform: CSV/county-data ingestion → lead browser → manual or auto-optimized route building → manager assignment → rep check-in/outcome logging → per-lead contact card. Multi-tenant, JWT auth, matches the HourHive stack pattern (Express/Postgres-or-SQLite/Railway).

**This repo now contains three apps:**
- `/` (this directory) — the API, described below
- `/admin` — manager-facing dashboard (leads, route building, assignment, team, contact cards)
- `/employee` — field rep PWA (my routes, check-in, outcome logging, contact cards)

Status: CSV import, lead browser, manual + auto-optimized route building, manager assignment, rep check-in/outcome, and the per-lead contact card (visited/solar/no-further-attempt flags + dated notes) are all built and tested end to end. Enrichment API integration is still stubbed with a TODO — wire in your chosen vendor when ready.

**Compliance note:** phone/email fields are reference-only by design (see `EnrichedContact` in the schema and `src/migrations/20260817000001_init.js` comments). Nothing in this codebase calls, texts, or emails a lead. Do not add a dialer/SMS/email integration without a compliance review first.

## Creating your first admin account

The easiest way: set two environment variables in Railway on the API service, and it creates the account automatically on deploy — no manual API calls needed.

In your API service's **Variables** tab, add:
- `ADMIN_EMAIL` — the email you'll log in with
- `ADMIN_PASSWORD` — the password you'll log in with
- `ADMIN_NAME` (optional) — your name, defaults to "Admin"
- `TENANT_NAME` (optional) — your company name, defaults to "My Company"

Redeploy. The `Procfile` runs `npm run bootstrap-admin` automatically after migrations and before the server starts — check the deploy logs for a line like `Bootstrap: created tenant "..." and admin account for ...`.

This only ever creates the **first** tenant — safe to leave the variables set permanently and redeploy repeatedly; it'll just say "a tenant already exists, skipping" every time after the first. If you don't set these variables at all, this step is silently skipped and you're back to creating an account through `POST /api/auth/register-tenant` manually.

## Local setup

```bash
npm install
cp .env.example .env
# edit .env and set JWT_SECRET to a long random string

npm run migrate   # creates ./data/dev.sqlite3 and all tables
npm run seed       # creates a demo tenant with admin/manager/rep logins + sample leads
npm run dev         # starts on http://localhost:3000
```

Demo logins after seeding (all password `password123`):
- `admin@demo.com` — admin
- `manager@demo.com` — manager
- `rep@demo.com` — rep

## API quick reference

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/register-tenant` | public | Create a new tenant + first admin |
| POST | `/api/auth/login` | public | Get a JWT |
| POST | `/api/leads/import-csv` | admin/manager | Upload a CSV of purchase records |
| GET | `/api/leads` | any | Browse leads (filters: territory_id, disposition, status, unassigned) |
| POST | `/api/leads/:id/enrich` | admin/manager | Stub — wire your enrichment vendor here |
| POST | `/api/leads/:id/notes` | any (rep scoped to their stops) | Add a dated note to a lead's contact card |
| PATCH | `/api/leads/:id/flags` | any (rep scoped to their stops) | Set visited / has_solar / no_further_attempt |
| POST | `/api/routes` | admin/manager | Create a route from a list of lead_ids (manual order) |
| POST | `/api/routes/build-optimized` | admin/manager | Auto-build a route: zip+radius or start/end points, optimized stop order |
| GET | `/api/routes` | any | List routes (reps see only their own) |
| GET | `/api/routes/:id` | any | Route detail with ordered stops + lead info |
| PATCH | `/api/routes/:id/reorder` | admin/manager | Reorder stops (plug in Directions API here) |
| PATCH | `/api/routes/:id/assign` | admin/manager | Assign a route to a rep |
| PATCH | `/api/stops/:id/checkin` | rep | Mark arrival at a stop |
| PATCH | `/api/stops/:id/outcome` | rep | Log outcome; syncs back to lead disposition |
| GET/POST | `/api/territories` | any/admin+mgr | Manage territories |
| GET/POST | `/api/users` | admin/manager | List/create reps and managers |

CSV import expects columns: `address,city,state,zip,purchase_date,sale_price,owner_name,lat,lng` (only `address` is required).

## Maricopa County Assessor sync (new-sale lead source)

Instead of scraping the county's website (fragile, and a heavier legal/maintenance lift), this pulls from **Maricopa County Assessor's official public API**.

**One-time setup:**
1. Request a free API token at https://mcassessor.maricopa.gov/contact/ — select subject "API Question/Token." The county emails you a token, typically within a day or two.
2. Add it to `.env`: `MCASSESSOR_API_TOKEN=your-token-here`

**Run a sync:**
- Via API: `POST /api/leads/sync-maricopa` (admin/manager only) with `{ "search_term": "85028", "lookback_days": 30 }` — `search_term` can be a zip code, subdivision name, or other value the county's search accepts.
- Via CLI: `node src/jobs/syncMaricopaCounty.js "85028" <tenant_id> 30`

**Before you rely on this in production, read `src/jobs/syncMaricopaCounty.js`.** The county's published API docs describe the endpoints but don't include a full sample JSON response, and their office has publicly noted a backend migration (to "AA-GAMA") that may have changed field names. The field-extraction logic (`extractSaleInfo`, `extractAddress`, etc.) checks several likely field name variants defensively, but **you should run one sync, log the raw response, and confirm the field mapping matches** before trusting the data. This couldn't be verified from the build environment, which has no network access to `mcassessor.maricopa.gov`.

For anything beyond light testing, move this off the synchronous request path — a broad search term across many pages, rate-limited to be a good citizen of a public agency's API, can take a while. Run it as a scheduled job (Railway cron, or a queue) rather than a button a manager clicks and waits on.

This only pulls address, owner name, sale date/price, and parcel number — no phone/email. That's a separate enrichment step (still a TODO — see the spec).

## Automated route building

Two ways to build a route now, beyond manually picking stops and order:

**Radius mode** — `POST /api/routes/build-optimized` with `{ mode: 'radius', center_zip, radius_miles, name, date }`. Automatically pulls every unassigned lead with coordinates within range of the zip's centroid, and builds a round-trip route (starts and ends at the same point) in an optimized order.

**Endpoints mode** — `{ mode: 'endpoints', lead_ids, start, end, name, date }`. You pick the stops (same selection flow as manual routes), plus a fixed start and end location — each can be `{lat, lng}`, `{zip}`, or `{address}` (address gets geocoded via OpenStreetMap Nominatim). Builds the shortest path between the two fixed points through the selected stops.

**How the ordering works:** `src/lib/routeOptimizer.js` — nearest-neighbor construction plus a 2-opt improvement pass, using straight-line (haversine) distance. This is not road-network distance; it's a fast, dependency-free approximation good enough for ordering stops in a dense residential area. Swap in Google Directions' waypoint optimizer later (see the spec's V2 note) for real road-network accuracy — the function signature (points + optional fixed start/end) is built as a drop-in replacement target.

**Known limitations:**
- Zip centroids are a small static table in `src/lib/geocoding.js` (~20 Maricopa County zips) — add more or replace with a real geocoder as you expand areas
- Radius mode silently skips leads without coordinates (common for CSV imports that didn't include lat/lng) — the response includes `skipped_no_coordinates` so you can see if that's happening
- The Nominatim geocoding call (`geocodeAddress`) is untested in this build environment — no network access to verify it live. Test it once deployed; it's free and requires no API key, but is rate-limited and requires a descriptive `User-Agent` (set `GEOCODER_USER_AGENT` in `.env`)

## Deploying to Railway

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo**, select this repo.
3. **Add a plugin → PostgreSQL.** Railway auto-injects `DATABASE_URL` into your service — `knexfile.js` already switches to the `production` (pg) config whenever `DATABASE_URL` is present, so no code change needed.
4. In your service's **Variables** tab, set:
   - `JWT_SECRET` — long random string, different from your local dev one
   - (later) `ENRICHMENT_API_KEY`, `GOOGLE_DIRECTIONS_API_KEY` once you wire those in
5. Railway will run `npm install` automatically. The included `Procfile` (`web: npm run migrate && npm start`) runs migrations against the Postgres database on every deploy before starting the server, so schema stays in sync — same pattern you likely used on HourHive.
6. Once deployed, hit `POST /api/auth/register-tenant` against your Railway URL to create your first real tenant/admin, the same way you'd have bootstrapped HourHive.
7. Deploy the admin dashboard and rep PWA as separate Railway services pointing at this API's URL, same two-app pattern as HourHive.

## What's deliberately not built yet

- Live purchase-record data source sync (only CSV import right now)
- Enrichment vendor integration (`POST /leads/:id/enrich` is a stub)
- Route optimization via Google Directions (`reorder` accepts any order you give it)
- DNC scrubbing / calling-texting compliance layer (out of scope — this build is knock-only, phone/email are reference data, see compliance note above)
- Territory-based auto-distribution across multiple reps
