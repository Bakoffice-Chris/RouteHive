const crypto = require('crypto');
const db = require('../db');

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Auth for external systems (Zapier, Make, a custom CRM sync script) - not
 * a logged-in user, so there's no req.user.role. Attaches req.tenant_id and
 * req.apiKeyId instead. Routes behind this middleware should treat the
 * caller as having full tenant-scoped access - same trust level as a
 * manager, since whoever holds the key presumably generated it themselves.
 */
async function requireApiKey(req, res, next) {
  const rawKey = req.headers['x-api-key'];
  if (!rawKey) return res.status(401).json({ error: 'Missing X-API-Key header' });

  const keyHash = hashKey(rawKey);
  const keyRecord = await db('api_keys').where({ key_hash: keyHash, active: true }).first();

  if (!keyRecord) return res.status(401).json({ error: 'Invalid or revoked API key' });

  db('api_keys').where({ id: keyRecord.id }).update({ last_used_at: db.fn.now() }).catch(() => {});

  req.tenant_id = keyRecord.tenant_id;
  req.apiKeyId = keyRecord.id;
  next();
}

module.exports = { requireApiKey, hashKey };
