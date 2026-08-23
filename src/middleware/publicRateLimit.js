/**
 * Simple in-memory rate limiter for the public booking endpoints - the
 * first unauthenticated surface in this app, so it needs some basic abuse
 * protection even though nothing here is as sensitive as a login endpoint.
 *
 * HONEST LIMITATIONS, worth knowing before relying on this:
 * - In-memory only. Resets on every deploy/restart, and does not share
 *   state across multiple server instances if this ever runs behind a
 *   load balancer with more than one replica. Fine for a single Railway
 *   instance, not a substitute for a real rate-limit store (Redis) at
 *   meaningful scale or under real attack.
 * - IP-based. A determined abuser behind a shared/rotating IP (or a
 *   botnet) isn't meaningfully slowed down by this.
 * - No CAPTCHA/challenge - just a request-count ceiling and a honeypot
 *   field (see routes/booking.js). If spam/abuse becomes a real problem,
 *   a proper service (Cloudflare Turnstile, hCaptcha) is the next step,
 *   not a bigger version of this file.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 20;

const hits = new Map(); // ip -> array of timestamps

function publicRateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const timestamps = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  hits.set(ip, timestamps);

  if (timestamps.length > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Please try again in a few minutes.' });
  }

  next();
}

// Prevent unbounded memory growth - sweep old entries periodically rather
// than on every request.
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of hits.entries()) {
    const kept = timestamps.filter((t) => now - t < WINDOW_MS);
    if (kept.length === 0) hits.delete(ip);
    else hits.set(ip, kept);
  }
}, WINDOW_MS).unref();

module.exports = { publicRateLimit };
