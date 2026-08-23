const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { hashKey } = require('../middleware/apiKeyAuth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('admin', 'manager'));

// ===== API Keys =====

router.get('/api-keys', async (req, res) => {
  const keys = await db('api_keys')
    .where({ tenant_id: req.user.tenant_id })
    .select('id', 'name', 'key_prefix', 'active', 'last_used_at', 'created_at')
    .orderBy('created_at', 'desc');
  res.json(keys);
});

// The raw key is returned exactly once, here, at creation time. It is never
// retrievable again afterward - only the hash is stored. If it's lost, the
// only fix is revoking this key and creating a new one.
router.post('/api-keys', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const rawKey = `rhk_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12);

  const [key] = await db('api_keys')
    .insert({
      tenant_id: req.user.tenant_id,
      name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      created_by: req.user.id
    })
    .returning('*');

  res.status(201).json({ id: key.id, name: key.name, key_prefix: key.key_prefix, raw_key: rawKey });
});

router.patch('/api-keys/:id/revoke', async (req, res) => {
  const key = await db('api_keys').where({ id: req.params.id, tenant_id: req.user.tenant_id }).first();
  if (!key) return res.status(404).json({ error: 'API key not found' });

  await db('api_keys').where({ id: key.id }).update({ active: false });
  res.json({ id: key.id, active: false });
});

// ===== Webhooks =====

router.get('/webhooks', async (req, res) => {
  const hooks = await db('webhook_endpoints')
    .where({ tenant_id: req.user.tenant_id })
    .select('id', 'url', 'secret', 'active', 'created_at')
    .orderBy('created_at', 'desc');
  res.json(hooks);
});

router.post('/webhooks', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'url must be a valid absolute URL (e.g. https://...)' });
  }

  const secret = crypto.randomBytes(24).toString('hex');
  const [hook] = await db('webhook_endpoints')
    .insert({ tenant_id: req.user.tenant_id, url, secret, created_by: req.user.id })
    .returning('*');

  res.status(201).json({ id: hook.id, url: hook.url, secret: hook.secret, active: hook.active });
});

router.patch('/webhooks/:id/toggle', async (req, res) => {
  const hook = await db('webhook_endpoints').where({ id: req.params.id, tenant_id: req.user.tenant_id }).first();
  if (!hook) return res.status(404).json({ error: 'Webhook not found' });

  await db('webhook_endpoints').where({ id: hook.id }).update({ active: !hook.active });
  res.json({ id: hook.id, active: !hook.active });
});

router.delete('/webhooks/:id', async (req, res) => {
  const hook = await db('webhook_endpoints').where({ id: req.params.id, tenant_id: req.user.tenant_id }).first();
  if (!hook) return res.status(404).json({ error: 'Webhook not found' });

  await db('webhook_endpoints').where({ id: hook.id }).delete();
  res.json({ deleted: true });
});

module.exports = router;
