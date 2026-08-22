const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function loadStopScopedToUser(stopId, user) {
  const stop = await db('route_stops')
    .join('routes', 'route_stops.route_id', 'routes.id')
    .where('route_stops.id', stopId)
    .andWhere('routes.tenant_id', user.tenant_id)
    .select('route_stops.*', 'routes.assigned_rep_id', 'routes.tenant_id')
    .first();

  if (!stop) return null;
  if (user.role === 'rep' && stop.assigned_rep_id !== user.id) return null;
  return stop;
}

// --- Mark arrival at a stop
router.patch('/:id/checkin', async (req, res) => {
  const stop = await loadStopScopedToUser(req.params.id, req.user);
  if (!stop) return res.status(404).json({ error: 'Stop not found' });

  await db('route_stops').where({ id: stop.id }).update({ visited_at: db.fn.now() });
  res.json({ id: stop.id, visited_at: new Date().toISOString() });
});

// --- Log the outcome after the door knock
router.patch('/:id/outcome', async (req, res) => {
  const { outcome, rep_notes, photo_url } = req.body;
  const validOutcomes = ['no_answer', 'spoke', 'appointment', 'sold', 'skip'];
  if (!validOutcomes.includes(outcome)) {
    return res.status(400).json({ error: `outcome must be one of: ${validOutcomes.join(', ')}` });
  }

  const stop = await loadStopScopedToUser(req.params.id, req.user);
  if (!stop) return res.status(404).json({ error: 'Stop not found' });

  await db('route_stops').where({ id: stop.id }).update({
    outcome,
    rep_notes: rep_notes || null,
    photo_url: photo_url || null,
    visited_at: stop.visited_at || db.fn.now()
  });

  // Reflect the outcome back onto the lead's disposition so the manager's
  // lead browser stays in sync without a separate manual update.
  const dispositionMap = {
    no_answer: 'contacted',
    spoke: 'contacted',
    appointment: 'appointment_set',
    sold: 'sold',
    skip: undefined // leave disposition unchanged if skipped
  };
  const newDisposition = dispositionMap[outcome];
  if (newDisposition) {
    await db('leads').where({ id: stop.lead_id }).update({ disposition: newDisposition });
  }

  res.json({ id: stop.id, outcome, updated: true });
});

module.exports = router;
