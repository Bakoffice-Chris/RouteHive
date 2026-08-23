const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = '12h';

function signToken(user) {
  return jwt.sign(
    { id: user.id, tenant_id: user.tenant_id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

// Creates a brand new tenant plus its first admin user. Use this once per
// customer signup - subsequent users get added via an invite endpoint (not
// built yet) rather than this route, to avoid randoms creating tenants.
router.post('/register-tenant', async (req, res) => {
  const { tenant_name, admin_name, email, password } = req.body;
  if (!tenant_name || !admin_name || !email || !password) {
    return res.status(400).json({ error: 'tenant_name, admin_name, email, and password are required' });
  }

  const existing = await db('users').where({ email }).first();
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const [tenant] = await db('tenants').insert({ name: tenant_name }).returning('*');
  const password_hash = await bcrypt.hash(password, 10);
  const [user] = await db('users')
    .insert({
      tenant_id: tenant.id,
      name: admin_name,
      email,
      password_hash,
      role: 'admin'
    })
    .returning('*');

  const token = signToken(user);
  res.status(201).json({ token, user: { id: user.id, name: user.name, role: user.role, tenant_id: tenant.id } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const user = await db('users').where({ email }).first();
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  if (user.active === false) {
    return res.status(403).json({ error: 'This account has been deactivated' });
  }

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, tenant_id: user.tenant_id } });
});

module.exports = router;
