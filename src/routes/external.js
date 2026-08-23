const express = require('express');
const db = require('../db');
const { requireApiKey } = require('../middleware/apiKeyAuth');

const router = express.Router();
router.use(requireApiKey);

// --- List leads for this tenant. Same shape as the internal endpoint,
// minus anything requiring a logged-in user's role/identity. Useful as a
// polling trigger for Zapier/Make, or a nightly sync script.
router.get('/leads', async (req, res) => {
  const { disposition, since } = req.query;

  let query = db('leads')
    .where('leads.tenant_id', req.tenant_id)
    .join('raw_leads', 'leads.raw_lead_id', 'raw_leads.id')
    .leftJoin('enriched_contacts', 'enriched_contacts.raw_lead_id', 'raw_leads.id')
    .select(
      'leads.id',
      'leads.disposition',
      'leads.visited',
      'leads.has_solar',
      'leads.no_further_attempt',
      'leads.updated_at',
      'raw_leads.address',
      'raw_leads.city',
      'raw_leads.state',
      'raw_leads.zip',
      'raw_leads.purchase_date',
      'raw_leads.sale_price',
      'enriched_contacts.full_name',
      'enriched_contacts.phone',
      'enriched_contacts.email'
    );

  if (disposition) query = query.where('leads.disposition', disposition);
  if (since) query = query.where('leads.updated_at', '>', since);

  const leads = await query.orderBy('leads.updated_at', 'desc').limit(500);
  res.json(leads);
});

// --- Create a lead from an external source. Same required field as CSV
// import (address); everything else optional. If phone/email/owner_name
// are given, an enriched_contacts row is created alongside it.
router.post('/leads', async (req, res) => {
  const { address, city, state, zip, purchase_date, sale_price, owner_name, phone, email } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });

  const source = await db('data_sources')
    .where({ tenant_id: req.tenant_id, provider_name: 'External API' })
    .first();

  const sourceId =
    source?.id ||
    (
      await db('data_sources')
        .insert({ tenant_id: req.tenant_id, provider_name: 'External API', type: 'csv_import' })
        .returning('*')
    )[0].id;

  const [rawLead] = await db('raw_leads')
    .insert({
      tenant_id: req.tenant_id,
      source_id: sourceId,
      address,
      city: city || null,
      state: state || null,
      zip: zip || null,
      purchase_date: purchase_date || null,
      sale_price: sale_price || null,
      owner_name_raw: owner_name || null,
      status: 'new'
    })
    .returning('*');

  const [lead] = await db('leads')
    .insert({ tenant_id: req.tenant_id, raw_lead_id: rawLead.id, disposition: 'not_contacted' })
    .returning('*');

  if (owner_name || phone || email) {
    await db('enriched_contacts').insert({
      raw_lead_id: rawLead.id,
      full_name: owner_name || null,
      phone: phone || null,
      email: email || null,
      enrichment_provider: 'external_api',
      enriched_at: db.fn.now()
    });
  }

  res.status(201).json({ id: lead.id, address: rawLead.address, disposition: lead.disposition });
});

module.exports = router;
