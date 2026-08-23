const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// --- List users on this tenant (e.g. to populate a rep-assignment dropdown)
router.get('/', requireRole('admin', 'manager'), async (req, res) => {
  const { role } = req.query;
  let query = db('users')
    .where('tenant_id', req.user.tenant_id)
    .select(
      'id',
      'name',
      'email',
      'role',
      'territory_id',
      'active',
      'last_lat',
      'last_lng',
      'last_location_at',
      'location_sharing_enabled'
    );
  if (role) query = query.andWhere('role', role);
  const users = await query;
  res.json(users);
});

// --- Manager/admin creates a rep account
router.post('/', requireRole('admin', 'manager'), async (req, res) => {
  const { name, email, password, role, territory_id } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password, and role are required' });
  }
  if (!['admin', 'manager', 'rep'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin, manager, or rep' });
  }

  const existing = await db('users').where({ email }).first();
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const password_hash = await bcrypt.hash(password, 10);
  const [user] = await db('users')
    .insert({
      tenant_id: req.user.tenant_id,
      name,
      email,
      password_hash,
      role,
      territory_id: territory_id || null
    })
    .returning('*');

  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

// --- Edit an existing user: name, email, role, territory, active status,
// and optionally reset their password. Send only the fields you're changing.
router.patch('/:id', requireRole('admin', 'manager'), async (req, res) => {
  const target = await db('users').where({ id: req.params.id, tenant_id: req.user.tenant_id }).first();
  if (!target) return res.status(404).json({ error: 'User not found' });

  const { name, email, role, territory_id, active, password } = req.body;
  const updates = {};

  if (name !== undefined) updates.name = name;
  if (territory_id !== undefined) updates.territory_id = territory_id || null;
  if (active !== undefined) updates.active = !!active;

  if (email !== undefined && email !== target.email) {
    const existing = await db('users').where({ email }).andWhereNot({ id: target.id }).first();
    if (existing) return res.status(409).json({ error: 'Email already in use by another account' });
    updates.email = email;
  }

  if (role !== undefined) {
    if (!['admin', 'manager', 'rep'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin, manager, or rep' });
    }
    updates.role = role;
  }

  if (password) {
    updates.password_hash = await bcrypt.hash(password, 10);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No editable fields provided' });
  }

  await db('users').where({ id: target.id }).update(updates);
  const updated = await db('users')
    .where({ id: target.id })
    .select('id', 'name', 'email', 'role', 'territory_id', 'active')
    .first();

  res.json(updated);
});

// --- Rep updates their own last-known location. Opt-in only - the employee
// app gates this behind a toggle the rep controls, and only sends updates
// while the app is open in the foreground (no background tracking).
router.patch('/me/location', async (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng (numbers) are required' });
  }

  await db('users')
    .where({ id: req.user.id, tenant_id: req.user.tenant_id })
    .update({ last_lat: lat, last_lng: lng, last_location_at: db.fn.now(), location_sharing_enabled: true });

  res.json({ updated: true });
});

// --- Rep turns location sharing off. Clears the stored location too, so
// switching it off actually removes the last-known point rather than just
// pausing updates.
router.patch('/me/location/disable', async (req, res) => {
  await db('users')
    .where({ id: req.user.id, tenant_id: req.user.tenant_id })
    .update({ location_sharing_enabled: false, last_lat: null, last_lng: null, last_location_at: null });

  res.json({ updated: true });
});

module.exports = router;
