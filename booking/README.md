# Route Platform — Self-Service Booking Page

The public, unauthenticated page a homeowner lands on when they open a booking link generated from a lead's contact card in the admin or employee app. No login, no sidebar — just a slot picker and a short form.

## Local setup

```bash
npm install
cp .env.example .env
npm run dev   # http://localhost:5175
```

You need a real token to test against — generate one from the API (`POST /api/leads/:id/booking-link`, logged in as a rep or manager) and visit `http://localhost:5175/<token>`.

## How it works

- `GET /public/booking/:token` — loads the rep's available slots (their declared weekly hours minus anything already booked), grouped by day
- Pick a slot → fill in name (required) + email/phone (optional) → confirm
- `POST /public/booking/:token` — books it. The link becomes unusable immediately afterward (a 410 on any further attempt)

## What's deliberately here for abuse resistance

- A hidden `website` field (the `.hp-field` CSS class) that real users never see or reach by tab order — a bot that fills every field trips it, and the booking silently "succeeds" without anything actually being booked, rather than telling the bot it was rejected.
- Rate limiting happens server-side (`src/middleware/publicRateLimit.js` in the API), not here — this app has no protection of its own beyond what the API enforces.
- If the selected slot got taken by someone else between viewing and submitting, the booking is rejected (409) and the slot list refreshes automatically so the person can pick something that's actually still open.

## Deploying to Railway

Same pattern as the other three apps in this repo: new service, root directory `booking`, build command `npm run build`, `VITE_API_URL` pointing at the deployed API. Once deployed, set `BOOKING_PAGE_URL` on the **API service** (not this one) to this app's Railway URL, so newly generated booking links point here instead of `localhost:5175`.
