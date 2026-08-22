# Route Platform — Employee App

Mobile-first PWA for field reps: see assigned routes, check in at stops, log outcomes, and update the contact card (visited / has solar / no further attempt + dated notes) — the same contact card a manager sees in the admin console, kept in sync through the same API.

Rep-only: logging in with a manager/admin account is blocked client-side (and every write is enforced server-side too — a rep can only touch leads on routes assigned to them, verified end to end against the live API).

## Local setup

```bash
npm install
cp .env.example .env
npm run dev   # http://localhost:5174
```

Log in with a seeded rep account: `rep@demo.com` / `password123`.

## Screens

- **Login** — rep sign-in
- **My Routes** — every route assigned to the logged-in rep, today's route first
- **Route view** — the stop manifest for one route: sequence number, address, status tags, tap to open a stop
- **Stop detail** — one screen per stop:
  - **Check in** — marks arrival (`PATCH /stops/:id/checkin`)
  - **Outcome** — no answer / spoke / appointment / sold / skip, syncs back to the lead's disposition automatically (same behavior as the admin side)
  - **Contact card** — Visited / Has solar / No further attempt checkboxes, plus a dated note log — identical data to what a manager sees on the same lead in the admin console
- **Route view map** — a compact Leaflet/OpenStreetMap map above the stop list showing all stops as numbered pins with a connecting line, for quick orientation (no popups/detail needed there — tapping a stop card opens the full detail screen)
- **Navigate handoff** — a "Navigate" button on the stop detail screen, and a quick-nav icon on each stop card in the route list, hand off to the phone's native maps app for actual turn-by-turn (`src/lib/navigation.js`). Platform-detected: iOS opens Apple Maps, Android opens the `geo:` URI (lets the OS offer whichever maps app is installed — Google Maps, Waze, etc.), anything else falls back to Google Maps web, which works everywhere. Verified the URL-building logic against mocked iOS/Android/desktop user agents; the actual native-app handoff itself needs a real device to confirm — Apple Maps' `maps://` scheme and Android's `geo:` scheme are standard, but only a real phone browser triggers the OS-level app-open behavior.

## What's intentionally not built yet

- No offline support / service worker — `public/manifest.json` enables "Add to Home Screen" but there's no caching layer, so it needs a live connection. Worth adding if reps regularly lose signal door-to-door.
- No app icons in the manifest — add real icons before relying on the install prompt in browsers that require them.
- No push notifications for new route assignments — rep has to open the app to see a new route.
- The map shows stops in route order but doesn't do turn-by-turn navigation or live GPS "you are here" positioning — it's a static overview, not a driving app. Tapping outside the app to a maps app for actual turn-by-turn is the near-term workaround.

## Deploying to Railway

Same pattern as the admin console: separate Railway service, root directory `employee/`, build command `npm run build`, output `dist`, environment variable `VITE_API_URL` pointed at the deployed API (set before build — Vite bakes it in).
