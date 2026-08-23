const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function isValidTime(str) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(str);
}

async function resolveTargetRepId(req, bodyRepId) {
  if (req.user.role === 'rep') return req.user.id; // reps can only ever manage their own
  if (!bodyRepId) return null;
  const rep = await db('users').where({ id: bodyRepId, tenant_id: req.user.tenant_id, role: 'rep' }).first();
  return rep ? rep.id : null;
}

// --- List availability windows. Reps see only their own; admin/manager can
// filter to a specific rep with ?rep_id= or see everyone's.
router.get('/', async (req, res) => {
  let query = db('rep_availability').where({ tenant_id: req.user.tenant_id, active: true });

  if (req.user.role === 'rep') {
    query = query.andWhere('rep_id', req.user.id);
  } else if (req.query.rep_id) {
    query = query.andWhere('rep_id', req.query.rep_id);
  }

  const windows = await query.orderBy(['rep_id', 'day_of_week', 'start_time']);
  res.json(windows);
});

// --- Add a weekly availability window.
router.post('/', async (req, res) => {
  const { day_of_week, start_time, end_time, rep_id } = req.body;

  if (day_of_week === undefined || day_of_week < 0 || day_of_week > 6) {
    return res.status(400).json({ error: 'day_of_week must be 0 (Sunday) through 6 (Saturday)' });
  }
  if (!isValidTime(start_time) || !isValidTime(end_time)) {
    return res.status(400).json({ error: 'start_time and end_time must be "HH:MM" 24-hour format' });
  }
  if (start_time >= end_time) {
    return res.status(400).json({ error: 'start_time must be before end_time' });
  }

  const targetRepId = await resolveTargetRepId(req, rep_id);
  if (!targetRepId) return res.status(400).json({ error: 'rep_id is required and must be a valid rep on this tenant' });

  const [window] = await db('rep_availability')
    .insert({ tenant_id: req.user.tenant_id, rep_id: targetRepId, day_of_week, start_time, end_time })
    .returning('*');

  res.status(201).json(window);
});

// --- Remove an availability window.
router.delete('/:id', async (req, res) => {
  const window = await db('rep_availability').where({ id: req.params.id, tenant_id: req.user.tenant_id }).first();
  if (!window) return res.status(404).json({ error: 'Availability window not found' });
  if (req.user.role === 'rep' && window.rep_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your availability window' });
  }

  await db('rep_availability').where({ id: window.id }).delete();
  res.json({ deleted: true });
});

module.exports = router;
