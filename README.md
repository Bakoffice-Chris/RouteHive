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

**ScoutHive — the review-before-import UI (admin sidebar).** Rather than the direct auto-sync above (which writes straight to the database), ScoutHive lets a manager search, see the results with "New" vs "Already in database" tags, and choose exactly which ones to bring in — nothing gets imported without an explicit selection.

- `GET /api/leads/scouthive/preview?search_term=85028&lookback_days=90` — read-only, makes no database writes. Flags each result as `already_in_database` by checking both address (case/whitespace-insensitive) and parcel number (APN) against your existing leads.
- `POST /api/leads/scouthive/import` — takes the manager's selected subset and creates them as real leads, re-checking for duplicates server-side (never trusts the client's `already_in_database` flag, since time may have passed since the preview was fetched).
- Both share the same field-extraction logic as the direct-sync path (`src/lib/maricopaSales.js`), refactored out during this build so there's exactly one place to fix if the county's actual field names ever turn out to differ from what's assumed — same untested-against-live-data caveat as above applies here too.
- Tested end to end against Postgres: dedup by both address and APN verified correct (including a case-different address match), re-importing the same records correctly skips them as duplicates, and the failure path (no token set) returns a clean error instead of crashing — same as the direct-sync endpoint.
- Defaults to a 90-day lookback window, editable per search.

**Estimated home value** — `GET /api/leads/scouthive/valuation?apn=...`, fetched one at a time via a "Get estimate" button per row (not bulk-fetched for the whole search, to avoid multiplying requests against the county's API). **This is the county's tax-assessed value, not a market estimate like a Zillow Zestimate** — Zillow has no public API (self-serve access was shut down years ago; it's partner-only now), and the unofficial scrapers that exist for it violate their terms of service and break often, so this uses the free, official alternative already available through the same Maricopa token instead. Arizona caps the assessed "Limited Property Value" used for tax purposes, so it often understates true market value — prefers "Full Cash Value" when both are present in the county's response, since that's the closer of the two to actual value. If you need closer-to-market figures, a paid AVM provider (ATTOM, HouseCanary, Estated) is the honest next step, not a Zillow scraper.
- Verified the extraction logic (`extractLatestValuation` in `src/lib/maricopaSales.js`) against several mocked response shapes — correctly picks the most recent tax year, prefers full cash value over limited value, and returns null cleanly (not a crash) on an empty or unexpected shape. The live API call itself carries the same untested-in-this-environment caveat as the rest of the Maricopa integration.

**Property details (bed/bath, square footage, year built, pool)** — `GET /api/leads/scouthive/details?apn=...`, same on-demand per-row pattern as the valuation lookup, via a "Get details" button per row. Sourced from the county's own parcel-details data, which its public documentation confirms includes pool status as one of the tracked "basic improvement components." `has_pool` is `true`/`false` when the county has that field on file, and `null` (shown as "no details on file," not lumped in with "no pool") when it doesn't — those are meaningfully different and the code keeps them apart rather than treating an absent field as a negative answer.
- Verified `extractPropertyFeatures` against six mocked response shapes: boolean pool flag, string "Y"/"N", numeric pool-size field, no pool field present at all, and a response wrapped in a nested `Parcel` key — all extracted correctly, including the null-vs-false distinction above.

**This data now shows up in both the admin and employee apps, on any lead — not just from within ScoutHive.** Two lead-scoped endpoints, rep-accessible (unlike the ScoutHive search endpoints, which are admin/manager only):
- `GET /api/leads/:id/estimated-value`
- `GET /api/leads/:id/property-details`

Both resolve the parcel number from the lead's own record and **persist the result** — this closes a real gap: previously, anything fetched in ScoutHive only lived in the browser's temporary state and vanished the moment you left the page, even after importing the lead. Now it's saved to `raw_leads` and shows up in the contact card on both apps, with a "Look up" button if it hasn't been fetched yet. Only leads that came from Maricopa County (ScoutHive or the auto-sync) have a parcel number to look up against — a CSV-imported lead won't, and the UI says so plainly rather than showing a broken button.

Verified end to end against Postgres: a ScoutHive import with already-fetched valuation/details data correctly persists it (previously would've been silently discarded); a lead with no parcel number gets a clean 400 instead of attempting a lookup; a rep is correctly blocked (403) from looking this up for a lead not on their assigned route; and both endpoints fail cleanly (not a crash) when no API token is configured.

## Team management

- `PATCH /api/users/:id` (admin/manager) — edit name, email, role, active status, and optionally reset a password. Send only the fields you're changing.
- Deactivating a user (`active: false`) blocks their login immediately — checked in `POST /api/auth/login`. It does not delete their account or history, just blocks sign-in.
- Admin UI: Team page now has an "Edit" button per person opening a modal with these fields.

## Notes import and lead export

- `POST /api/leads/import-notes` (admin/manager) — CSV with columns `address, note, date` (date optional, defaults to today). Matches existing leads by address (case/whitespace-insensitive), adds a dated note to each match, and reports which addresses didn't match anything rather than silently dropping them.
- `GET /api/leads/export` (admin/manager) — downloads all of the tenant's leads as a CSV (address, contact info, disposition, flags). Admin UI: "Export CSV" button on the Leads page.

## Rep location sharing

Opt-in, foreground-only GPS sharing — a rep toggles it on from their own app; it is never on by default and is never something a manager can turn on remotely.

- `PATCH /api/users/me/location` — rep sends their own current lat/lng.
- `PATCH /api/users/me/location/disable` — rep turns it off; this also clears the stored point rather than just pausing updates.
- `GET /api/users` (admin/manager) — now includes `last_lat`, `last_lng`, `last_location_at`, `location_sharing_enabled` for each rep.
- Admin UI: Team page has a live map showing only reps currently sharing.
- Employee UI: a toggle in the top bar ("Location on"/"Location off").

**Why foreground-only, and why that's a real limit, not just a design choice:** this is a browser-based PWA, not a native app — it has no way to request background-location permission or run anything once the tab/app is closed. Location updates only happen while the app is open in the foreground and the toggle is on. If you need true background tracking later, that requires wrapping this in a native shell (e.g., Capacitor) and requesting the OS-level background location permission, which is a meaningfully bigger step with its own platform review requirements (both Apple and Google scrutinize background-location apps).

**Worth knowing before relying on this for real employees:** many US states have specific notice/consent requirements for employer GPS tracking of employees, and some restrict tracking to work hours only. This build doesn't include any of that compliance layer (consent logging, work-hours-only enforcement, a privacy policy) — the opt-in toggle is a reasonable default, not a substitute for checking what your state requires before rolling this out.

## Editing homeowner names, and filtering leads

- `PATCH /api/leads/:id/contact` — edit contact info on a lead: **name, co-owner name, email, phone.** Same upsert-safe behavior as before (creates an `enriched_contacts` row if the lead was never enriched, updates in place if one exists — no duplicates). Send only the fields you're changing; send an empty string to clear a field. Replaces the old name-only `/name` endpoint entirely.
- `GET /api/leads` now accepts `state`, `visited`, `has_solar`, `no_further_attempt` as additional filters, on top of the existing `territory_id`, `disposition`, `status`, `unassigned`. `state` matches case-insensitively; the three flags are `true`/omit (checking a box narrows to only that flag, unchecked shows both).
- Admin UI: name is editable inline from the contact card (click "Edit" next to the name); the Leads page toolbar has a state text filter plus the three checkboxes.
- Employee UI: name is editable the same way from the stop detail screen's contact card. The route view screen has the same state filter + three checkboxes, filtering the current route's stop list client-side (no extra API calls needed since a route's stops are already fully loaded).

## CRM integration (webhooks + API keys)

The general-purpose integration layer — connect to any CRM via Zapier/Make, or a custom script, without a native per-CRM integration.

**API keys** — `POST /api/integrations/api-keys` (admin/manager) creates a key; the raw value is shown exactly once and only a hash is stored afterward. External tools authenticate with an `X-API-Key` header against `/api/external/leads`:
- `GET /api/external/leads` — list leads (filters: `disposition`, `since`)
- `POST /api/external/leads` — create a lead (`address` required; `owner_name`/`phone`/`email` populate an `enriched_contacts` row alongside it)

**Webhooks** — `POST /api/integrations/webhooks` registers a URL; RouteHive fires a signed `POST` to it whenever a lead's disposition changes (currently the only event type — `lead.disposition_changed`). Payloads are HMAC-SHA256 signed with the endpoint's own secret, delivered in an `X-RouteHive-Signature` header, same pattern as Stripe/GitHub webhooks. Verified end to end with a real local receiver during development — signature, payload shape, and delivery all confirmed working.

**Known limitations:**
- No retry queue or delivery log — a failed delivery is logged server-side and dropped, not retried. Worth adding a `webhook_deliveries` table with backoff if a customer's CRM sync silently failing becomes a real risk.
- Only one event type exists right now. The schema has an `event_types` column on `webhook_endpoints` for future filtering, but every active webhook currently receives everything.
- Native Salesforce/HubSpot integrations (OAuth, object mapping) are a separate, larger build — this is the "connect anything via Zapier" foundation layer, not a replacement for those.

Admin UI: **Integrations** page (sidebar nav) manages both API keys and webhooks.

## BusyBee AI Assistant

A branded AI copilot, currently one capability: a short pre-visit brief generated from a lead's history right before a rep knocks. Calls the Claude API server-side — `GET /api/leads/:id/brief` (same rep-access scoping as the rest of the contact card).

**Setup:** set `ANTHROPIC_API_KEY` in your environment. Optionally set `ANTHROPIC_MODEL` to override the default (`claude-haiku-4-5-20251001` — fast and cheap, appropriate for a short summarization task; swap in a Sonnet-tier model if you want deeper analysis at higher cost).

**Honest limitation:** the request is built to match the documented Claude Messages API shape, but it's **untested against the live API** — this build environment has no Anthropic API key available to actually invoke it. Verify it works once you've set a real key; if the request shape is ever wrong, it fails closed (returns a clear error) rather than crashing anything else.

Admin UI: "Ask BusyBee" button in the contact card modal, above the notes section. Employee UI: same panel on the stop detail screen, above the check-in/outcome section — the point where a rep actually needs it, right before the door.

**Message drafting (email/text) — handoff, not sending:** BusyBee can also draft a follow-up email or text for a specific lead (`GET /api/leads/:id/draft?channel=email|text`), which the rep can edit in the app, then tap "Open in Mail" / "Open in Messages" to launch their phone's native app with the draft pre-filled — `src/lib/messaging.js` (both apps) builds a `mailto:`/`sms:` link, platform-detected the same way the maps "Navigate" handoff already works. **Nothing is ever sent automatically** — the native app opens with a draft, and a human has to review and press send themselves in their own app. This is deliberately consistent with the existing compliance stance elsewhere in this README (phone/email are reference-only, no automated dialer/SMS/email sender) — a handoff link is not an automated send.
- Draft buttons are always available now — BusyBee drafts from whatever's on the lead record (address, purchase history, disposition, flags, full note history) regardless of whether a phone/email is on file. If the recipient contact info is missing, the "To" field shows empty and editable — type it in before "Open in Mail/Messages" becomes clickable.
- **Bug found and fixed:** BusyBee was only reading the homeowner name from the enrichment record (`enriched_contacts.full_name`), missing the CSV-imported/Maricopa-sync owner name (`raw_leads.owner_name_raw`) entirely whenever a lead hadn't been through enrichment — which is most leads, since enrichment is still a stub. Verified with a real CSV import: a lead with `owner_name_raw: "Homer Simpson"` and no enrichment now correctly surfaces that name to BusyBee via a fallback.
- **Tapping "Open in Mail" / "Open in Messages" also saves the drafted message as a note on the lead**, prefixed `[BusyBee]` and labeled "opened in Mail" / "opened in Messages" — not "sent," since there's no way to confirm the rep actually pressed send afterward in their own native app. Verified end to end against Postgres: the note saves with the correct label, full message body, and shows up properly attributed in the lead's note history. If the note-save call fails for any reason, it fails silently rather than blocking the native app from opening — the rep's actual task (getting the message out) isn't held hostage by a logging failure.
- Verified: validation (missing email/phone, invalid channel), rep access scoping, and the platform-detection logic for the `sms:`/`mailto:` URLs (tested against mocked iOS/Android/desktop user agents — all produced correct URLs). The live Claude API call for generating the draft text itself carries the same untested-in-this-environment caveat as the pre-visit brief above.

**Bug found and fixed while testing this:** `enriched_contacts` had no database-level guarantee of one row per lead. The app's own code paths always checked-then-updated-or-inserted, so this never surfaced in normal use — but a migration (`20260823000002_enriched_contacts_unique.js`) now adds a proper unique constraint, with cleanup logic that keeps the most-recently-updated row if any duplicates already exist in your database. Verified against a real duplicate-data scenario during testing — cleanup correctly kept the right row, and the constraint now blocks any future duplicate.

The mascot logo (`busybee-*.png` in both apps' `public/` folders) was generated programmatically to match RouteHive's hex-badge/ink/amber visual system, not hand-illustrated — a reasonable placeholder, worth commissioning real artwork for if BusyBee becomes a bigger part of the product.

## Automated route building

Two ways to build a route now, beyond manually picking stops and order:

**Radius mode** — `POST /api/routes/build-optimized` with `{ mode: 'radius', center_zip, radius_miles, name, date }`. Automatically pulls every unassigned lead with coordinates within range of the zip's centroid, and builds a round-trip route (starts and ends at the same point) in an optimized order.

**Endpoints mode** — `{ mode: 'endpoints', lead_ids, start, end, name, date }`. You pick the stops (same selection flow as manual routes), plus a fixed start and end location — each can be `{lat, lng}`, `{zip}`, or `{address}` (address gets geocoded via OpenStreetMap Nominatim). Builds the shortest path between the two fixed points through the selected stops.

**How the ordering works:** `src/lib/routeOptimizer.js` — nearest-neighbor construction plus a 2-opt improvement pass, using straight-line (haversine) distance. This is not road-network distance; it's a fast, dependency-free approximation good enough for ordering stops in a dense residential area. Swap in Google Directions' waypoint optimizer later (see the spec's V2 note) for real road-network accuracy — the function signature (points + optional fixed start/end) is built as a drop-in replacement target.

**Known limitations:**
- Zip centroids are a small static table in `src/lib/geocoding.js` (~20 Maricopa County zips) — add more or replace with a real geocoder as you expand areas
- Radius mode silently skips leads without coordinates (common for CSV imports that didn't include lat/lng) — the response includes `skipped_no_coordinates` so you can see if that's happening
- The Nominatim geocoding call (`geocodeAddress`) is untested in this build environment — no network access to verify it live. Test it once deployed; it's free and requires no API key, but is rate-limited and requires a descriptive `User-Agent` (set `GEOCODER_USER_AGENT` in `.env`)

## Solar Fit Score

A transparent heuristic for prioritizing which leads are most likely to be good solar prospects — **not a purchased or scraped intent signal**, just a scoring layer on top of data this app already legitimately sources from the county (property records) and reps (the visited/has_solar/no_further_attempt flags). This came up directly because there's no free, legitimate dataset of "who requested solar info" — that's private commercial lead-gen data (EnergySage, Modernize, etc. sell exactly that). This is the honest alternative: score what's public against what's known to correlate with solar interest.

`src/lib/solarFit.js` (backend) and `admin/src/lib/solarFit.js` (a duplicated copy for the browser — see the comment in the file for why) implement the scoring:

- **Pool (+30)** — the single strongest signal. Pool pumps/heaters are a well-documented major driver of high electric bills, which is the most common reason homeowners actually pursue solar.
- **Home value (+12 to +20)** — higher-value homes more often have the financing profile for a system.
- **Square footage (+8 to +15)** — bigger homes mean bigger bills and more usable roof area.
- **Purchase recency (+8 to +15)** — the classic new-mover window where homeowners are actively making improvement decisions.
- **Pre-1990 construction (−5)** — a mild penalty, not an exclusion; older roofs sometimes need replacement before panels go on, which is a real objection installers run into.
- **Already has solar, or marked no further attempt → excluded entirely** (score 0, clearly labeled `excluded: true`, not just ranked low). This is computed fresh on every read rather than stored, so flipping a flag changes the score immediately — verified by testing this directly: marking a top-scoring lead `has_solar` flipped it to excluded on the very next fetch, no stale data possible.

Every score comes with a plain-English list of *why* — this is deliberately not a black box a manager has to trust blindly.

**Where it shows up:**
- Leads page — sortable "Solar fit" column, toggle button to sort best-prospects-first
- ScoutHive preview — scored live as you fetch estimated value / property details per row (a "Sort by solar fit" toggle re-ranks as more data comes in)
- Contact card, both admin and employee — score + reasons shown to the rep before they knock

**Tested:** the scoring function against 6 scenarios (strong prospect, exclusions, missing-data fallback, score ceiling) and, more importantly, through the real API end-to-end — imported a strong-prospect lead and a weak one via ScoutHive, confirmed `?sort=solar_fit` correctly ranked them, then flipped a flag mid-session and confirmed the exclusion took effect immediately.

## Appointments

Booking, a manager rollup, and BusyBee-drafted reminders — `src/routes/appointments.js`, `src/lib/businessDays.js`, `src/lib/busybee.js` (`generateReminderMessage`).

**The 3.5-business-day booking window:** enforced server-side, not just in the UI. `src/lib/businessDays.js` walks forward skipping weekends (documented in-file as a calendar-day simplification, not an hours-of-operation model — the same kind of simplification "3 business days shipping" estimates use). Tested against 4 scenarios including weekend-crossing edge cases (a Thursday-morning booking correctly skips the weekend and lands the following Tuesday, not Saturday) — all correct.

**The window is anchored to when an appointment was first created, not "now."** `originally_booked_at` is stored immutably at creation; rescheduling re-validates against that original timestamp, not the current time — otherwise a reschedule could be used to sneak an appointment further out than the cap allows. Verified directly: booked an appointment, then tried to reschedule it 10 days out — correctly rejected, capped by the original booking time.

**Who can book:** reps can book for themselves, only for a lead on one of their own assigned routes (same access-control pattern as everything else lead-scoped in this app — verified a rep gets a 403 trying to book against an unassigned lead). Admin/manager can book for any rep and any lead in the tenant.

**Where it shows up:**
- Employee: "My Appointments" (linked from the My Routes home screen) — lists upcoming appointments, flags ones with a reminder due (within the hour, or the day before) with a red tag, lets a rep mark complete/cancelled. Booking itself happens from a stop's contact card.
- Admin: **Appointments** tab in the sidebar — the manager rollup, filterable by rep and status. Booking also available from any lead's contact card.

**BusyBee reminders — 24-hour and 1-hour, email or text:** `GET /api/appointments/:id/reminder?type=24h|1h&channel=email|text`. Same generate-then-handoff pattern as the rest of BusyBee — nothing sends automatically, the rep reviews the draft and taps "Open in Mail/Messages" themselves. Kept deliberately short (2-3 sentences, one clear CTA) per spec.

**Only addressed by name if there's an actual enriched contact name on file.** The prompt explicitly instructs BusyBee not to invent or guess a name — a lead with no `full_name` gets a generic, name-free draft rather than something that reads like it knows who's home. This was a specific requirement and is enforced in the prompt itself, not just a suggestion.

Tested: full appointment lifecycle (book → appears in manager rollup → mark completed) end to end against Postgres; all four reminder-endpoint validation paths (bad type, bad channel, missing email, missing phone) return clean errors; both channels correctly reach the live-generation step once real contact data exists.

**Known gap:** unlike lead-level BusyBee messages, using a reminder draft doesn't currently log a note on the lead the way the lead-messaging flow does — worth adding for parity if reminders turn out to be heavily used.

### Part 2 (scoped, not built): self-service appointment booking page

A public-facing landing page where a homeowner picks a time from a rep's availability, without a rep manually creating the appointment. Scoped here rather than built, per your instruction — this is a meaningfully bigger piece than the manager/rep-driven booking above:

**New surface area needed:**
- A public (unauthenticated) route, e.g. `routehive.app/book/:repId` or a per-tenant branded link — this is the first genuinely public-facing page in the app; everything else requires a login.
- Rep availability model — a new table/UI for a rep (or manager, for all reps) to define recurring weekly availability windows (e.g. "Mon/Wed/Fri 9am-4pm"), plus the ability to block out specific days off.
- Real-time conflict checking against already-booked appointments — the self-service picker needs to only show genuinely open slots, which means querying existing appointments live as the page renders, not just showing raw availability.
- Same 3.5-business-day cap would need to apply here too, presumably, unless self-service bookings get their own window.
- A booking confirmation flow for the homeowner (their own email/phone captured at booking time — this is the one place in the app where a *lead*, not a rep, would be providing contact info directly, which has different validation/spam-prevention needs than everything built so far, e.g. some kind of confirmation step or rate limiting to stop the page from being spammed with fake bookings).
- Notification back to the rep/manager when a self-service booking comes in.

**Rough effort relative to what's already built:** bigger than any single feature built this session — it's not just new endpoints, it's a new *kind* of surface (public, no auth, homeowner-facing) with its own trust/abuse considerations the rest of this app hasn't needed to deal with. Worth scoping as its own focused pass rather than folding into a broader turn.

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
