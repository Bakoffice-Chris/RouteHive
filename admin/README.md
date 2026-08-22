# Route Platform — Admin Console

Manager-facing admin dashboard: browse leads, import CSVs, build routes, assign to reps, manage the team. React + Vite, talks to the API in `../` (route-platform-api).

Visual identity: dispatch-board aesthetic — ink navy nav, amber accent, route stops rendered as a numbered manifest. See `src/styles.css` for the full token set.

## Local setup

```bash
npm install
cp .env.example .env
# edit .env if your API isn't on localhost:3000

npm run dev   # http://localhost:5173
```

Log in with a seeded account from the API (e.g. `manager@demo.com` / `password123`).

## Pages

- `/leads` — browse/filter leads, import a CSV, select stops and build a route
- `/routes` — list of built routes
- `/routes/new` — name + date a route from selected leads (reached from Leads page)
- `/routes/build-optimized` — zip+radius or start/end-point auto-optimized route building
- `/routes/:id` — route map (Leaflet/OpenStreetMap, no API key) with numbered stop pins + connecting line + depot markers, above the stop manifest + rep assignment
- `/team` — list/create reps and managers

## Deploying to Railway

1. Push to GitHub (same repo as the API, or split it out — either works).
2. In Railway: **New Project → Deploy from GitHub repo**, point it at this `admin/` directory (Railway lets you set a root directory per service).
3. Set the build command to `npm run build` and the output directory to `dist` (Railway's static-site / Vite preset handles this, or use a simple static server — same pattern as however HourHive's frontend is served).
4. Set the environment variable `VITE_API_URL` to your deployed API's Railway URL (Vite bakes this in at build time, so it must be set before the build runs, not just at runtime).
5. Deploy. This becomes its own Railway service, same two-app pattern as HourHive's admin dashboard + employee portal.

## What's not built yet

- Route reorder UI (API supports `PATCH /routes/:id/reorder`, no drag-and-drop in the UI yet)
- Territory management UI (API exists, no page yet)
- Manual "add lead" form (CSV import only for now)
