const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const territories = await db('territories').where('tenant_id', req.user.tenant_id);
  res.json(territories);
});

router.post('/', requireRole('admin', 'manager'), async (req, res) => {
  const { name, zip_codes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const [territory] = await db('territories')
    .insert({
      tenant_id: req.user.tenant_id,
      name,
      zip_codes: zip_codes ? JSON.stringify(zip_codes) : null
    })
    .returning('*');

  res.status(201).json(territory);
});

module.exports = router;
