const crypto = require('crypto');
const db = require('../db');

/**
 * Fires a webhook event to every active endpoint configured for a tenant.
 * Fire-and-forget from the caller's perspective - never awaited by the
 * request that triggered it, so a slow or dead webhook URL can't slow down
 * or break the actual user-facing action (e.g. logging a door-knock outcome
 * shouldn't hang because someone's Zapier webhook is down).
 *
 * Payloads are signed with HMAC-SHA256 over the raw JSON body, using each
 * endpoint's own secret, in an `X-RouteHive-Signature` header - this is the
 * same pattern Stripe/GitHub use for webhook verification, so any
 * competent integration builder (Zapier, Make, a custom receiver) can
 * verify the payload actually came from RouteHive.
 *
 * No retry queue or delivery log yet - a failed delivery is just logged to
 * the server console and dropped. Worth adding a `webhook_deliveries` table
 * with retry/backoff if this becomes a reliability-sensitive integration
 * path (e.g. a paying customer's CRM sync silently failing is worse than a
 * missed notification).
 */
async function triggerWebhook(tenantId, eventType, payload) {
  let endpoints;
  try {
    endpoints = await db('webhook_endpoints').where({ tenant_id: tenantId, active: true });
  } catch (err) {
    console.error('Webhook lookup failed:', err.message);
    return;
  }

  const body = JSON.stringify({
    event: eventType,
    tenant_id: tenantId,
    timestamp: new Date().toISOString(),
    data: payload
  });

  for (const endpoint of endpoints) {
    if (endpoint.event_types !== '*' && endpoint.event_types !== eventType) continue;

    const signature = crypto.createHmac('sha256', endpoint.secret).update(body).digest('hex');

    fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RouteHive-Signature': signature,
        'X-RouteHive-Event': eventType
      },
      body
    }).catch((err) => {
      console.error(`Webhook delivery failed for ${endpoint.url}:`, err.message);
    });
  }
}

module.exports = { triggerWebhook };
