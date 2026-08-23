const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { triggerWebhook } = require('../lib/webhooks');

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

    // Fire-and-forget - doesn't block the response to the rep even if the
    // tenant's webhook endpoint is slow or down.
    const leadForWebhook = await db('leads')
      .where({ 'leads.id': stop.lead_id })
      .join('raw_leads', 'leads.raw_lead_id', 'raw_leads.id')
      .leftJoin('enriched_contacts', 'enriched_contacts.raw_lead_id', 'raw_leads.id')
      .select(
        'leads.id',
        'raw_leads.address',
        'raw_leads.city',
        'raw_leads.state',
        'raw_leads.zip',
        'enriched_contacts.full_name',
        'enriched_contacts.phone',
        'enriched_contacts.email'
      )
      .first();

    triggerWebhook(stop.tenant_id, 'lead.disposition_changed', {
      lead_id: stop.lead_id,
      disposition: newDisposition,
      address: leadForWebhook?.address,
      city: leadForWebhook?.city,
      state: leadForWebhook?.state,
      zip: leadForWebhook?.zip,
      full_name: leadForWebhook?.full_name,
      phone: leadForWebhook?.phone,
      email: leadForWebhook?.email
    });
  }

  res.json({ id: stop.id, outcome, updated: true });
});

module.exports = router;
