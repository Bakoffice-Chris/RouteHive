const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// --- List users on this tenant (e.g. to populate a rep-assignment dropdown)
router.get('/', requireRole('admin', 'manager'), async (req, res) => {
  const { role } = req.query;
  let query = db('users').where('tenant_id', req.user.tenant_id).select('id', 'name', 'email', 'role', 'territory_id');
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

module.exports = router;
