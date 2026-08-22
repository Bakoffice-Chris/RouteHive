const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { syncMaricopaCounty } = require('../jobs/syncMaricopaCounty');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(requireAuth);

// --- CSV import: the MVP data path, per the build order in the spec.
// Expected columns: address,city,state,zip,purchase_date,sale_price,owner_name,lat,lng
// lat/lng, sale_price, owner_name are optional.
router.post('/import-csv', requireRole('admin', 'manager'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: file)' });

  let records;
  try {
    records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    return res.status(400).json({ error: `Could not parse CSV: ${err.message}` });
  }

  if (records.length === 0) {
    return res.status(400).json({ error: 'CSV had no rows' });
  }

  const source = await db('data_sources')
    .insert({
      tenant_id: req.user.tenant_id,
      provider_name: `CSV upload (${req.file.originalname})`,
      type: 'csv_import',
      last_synced_at: db.fn.now()
    })
    .returning('*')
    .then((rows) => rows[0]);

  const rowsToInsert = records.map((r) => ({
    tenant_id: req.user.tenant_id,
    source_id: source.id,
    address: r.address,
    city: r.city || null,
    state: r.state || null,
    zip: r.zip || null,
    lat: r.lat ? parseFloat(r.lat) : null,
    lng: r.lng ? parseFloat(r.lng) : null,
    purchase_date: r.purchase_date || null,
    sale_price: r.sale_price ? parseFloat(r.sale_price) : null,
    owner_name_raw: r.owner_name || null,
    status: 'new'
  }));

  const missingAddress = rowsToInsert.filter((r) => !r.address);
  if (missingAddress.length > 0) {
    return res.status(400).json({ error: `${missingAddress.length} row(s) missing required 'address' column` });
  }

  const inserted = await db('raw_leads').insert(rowsToInsert).returning('id');

  // Auto-create the working `leads` record for each raw_lead so it's
  // immediately visible in the lead browser, even before enrichment runs.
  const leadRows = inserted.map((row) => ({
    tenant_id: req.user.tenant_id,
    raw_lead_id: row.id || row, // sqlite returns raw id, pg returns {id}
    disposition: 'not_contacted'
  }));
  await db('leads').insert(leadRows);

  await db('audit_logs').insert({
    tenant_id: req.user.tenant_id,
    user_id: req.user.id,
    action: 'csv_import',
    entity_type: 'data_source',
    entity_id: source.id,
    details: `Imported ${rowsToInsert.length} raw leads from ${req.file.originalname}`
  });

  res.status(201).json({ imported: rowsToInsert.length, source_id: source.id });
});

// --- Sync new-sale parcels from Maricopa County Assessor's public API.
// searchTerm can be a zip code, subdivision name, or area - whatever the
// county's /search/property endpoint accepts.
//
// NOTE: this runs synchronously and can take a while for a broad search term
// (rate-limited to avoid hammering a public agency's API - see
// maricopaClient.js). For anything beyond a quick test, move this to a
// background job/queue (e.g. BullMQ, or a Railway cron service hitting this
// endpoint) rather than leaving the manager's browser tab waiting.
router.post('/sync-maricopa', requireRole('admin', 'manager'), async (req, res) => {
  const { search_term, lookback_days } = req.body;
  if (!search_term) return res.status(400).json({ error: 'search_term is required (zip code, subdivision, or area)' });

  try {
    const summary = await syncMaricopaCounty(req.user.tenant_id, search_term, lookback_days);
    await db('audit_logs').insert({
      tenant_id: req.user.tenant_id,
      user_id: req.user.id,
      action: 'maricopa_sync',
      entity_type: 'data_source',
      details: JSON.stringify({ search_term, ...summary })
    });
    res.json(summary);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Browse leads (joins raw_leads + enriched_contacts for display)
router.get('/', async (req, res) => {
  const { territory_id, disposition, status, unassigned } = req.query;

  let query = db('leads')
    .where('leads.tenant_id', req.user.tenant_id)
    .join('raw_leads', 'leads.raw_lead_id', 'raw_leads.id')
    .leftJoin('enriched_contacts', 'enriched_contacts.raw_lead_id', 'raw_leads.id')
    .select(
      'leads.id',
      'leads.disposition',
      'leads.notes',
      'leads.territory_id',
      'leads.visited',
      'leads.has_solar',
      'leads.no_further_attempt',
      'raw_leads.address',
      'raw_leads.city',
      'raw_leads.state',
      'raw_leads.zip',
      'raw_leads.lat',
      'raw_leads.lng',
      'raw_leads.purchase_date',
      'raw_leads.status as enrichment_status',
      'enriched_contacts.full_name',
      'enriched_contacts.phone',
      'enriched_contacts.email'
    );

  if (territory_id) query = query.where('leads.territory_id', territory_id);
  if (disposition) query = query.where('leads.disposition', disposition);
  if (status) query = query.where('raw_leads.status', status);
  if (unassigned === 'true') {
    query = query.whereNotExists(function () {
      this.select('*').from('route_stops').whereRaw('route_stops.lead_id = leads.id');
    });
  }

  const leads = await query.orderBy('raw_leads.purchase_date', 'desc');
  res.json(leads);
});

router.get('/:id', async (req, res) => {
  const lead = await db('leads')
    .where({ 'leads.id': req.params.id, 'leads.tenant_id': req.user.tenant_id })
    .join('raw_leads', 'leads.raw_lead_id', 'raw_leads.id')
    .leftJoin('enriched_contacts', 'enriched_contacts.raw_lead_id', 'raw_leads.id')
    .select(
      'leads.id as id',
      'leads.tenant_id as tenant_id',
      'leads.raw_lead_id as raw_lead_id',
      'leads.territory_id as territory_id',
      'leads.disposition as disposition',
      'leads.visited as visited',
      'leads.has_solar as has_solar',
      'leads.no_further_attempt as no_further_attempt',
      'raw_leads.address as address',
      'raw_leads.city as city',
      'raw_leads.state as state',
      'raw_leads.zip as zip',
      'raw_leads.lat as lat',
      'raw_leads.lng as lng',
      'raw_leads.purchase_date as purchase_date',
      'raw_leads.sale_price as sale_price',
      'raw_leads.owner_name_raw as owner_name_raw',
      'raw_leads.status as enrichment_status',
      'enriched_contacts.full_name as full_name',
      'enriched_contacts.phone as phone',
      'enriched_contacts.email as email'
    )
    .first();

  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  if (req.user.role === 'rep') {
    const onAssignedRoute = await leadIsOnRepRoute(lead.id, req.user.id);
    if (!onAssignedRoute) return res.status(403).json({ error: 'Not one of your assigned stops' });
  }

  const notes = await db('lead_notes')
    .where({ lead_id: lead.id })
    .join('users', 'lead_notes.author_id', 'users.id')
    .select('lead_notes.id', 'lead_notes.body', 'lead_notes.created_at', 'users.name as author_name')
    .orderBy('lead_notes.created_at', 'desc');

  res.json({
    ...lead,
    visited: !!lead.visited,
    has_solar: !!lead.has_solar,
    no_further_attempt: !!lead.no_further_attempt,
    notes
  });
});

// --- Rep access to a lead is scoped to stops on routes assigned to them.
// Managers/admins can touch any lead in the tenant.
async function leadIsOnRepRoute(leadId, repId) {
  const match = await db('route_stops')
    .join('routes', 'route_stops.route_id', 'routes.id')
    .where({ 'route_stops.lead_id': leadId, 'routes.assigned_rep_id': repId })
    .first();
  return !!match;
}

async function assertLeadAccess(req, res, leadId) {
  const lead = await db('leads').where({ id: leadId, tenant_id: req.user.tenant_id }).first();
  if (!lead) {
    res.status(404).json({ error: 'Lead not found' });
    return null;
  }
  if (req.user.role === 'rep') {
    const allowed = await leadIsOnRepRoute(leadId, req.user.id);
    if (!allowed) {
      res.status(403).json({ error: 'Not one of your assigned stops' });
      return null;
    }
  }
  return lead;
}

// --- The "abbreviated contact page" flags: visited / has_solar / no_further_attempt.
// Partial update - send only the fields you're changing.
router.patch('/:id/flags', async (req, res) => {
  const lead = await assertLeadAccess(req, res, req.params.id);
  if (!lead) return;

  const { visited, has_solar, no_further_attempt } = req.body;
  const updates = {};
  if (typeof visited === 'boolean') updates.visited = visited;
  if (typeof has_solar === 'boolean') updates.has_solar = has_solar;
  if (typeof no_further_attempt === 'boolean') updates.no_further_attempt = no_further_attempt;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Provide at least one of: visited, has_solar, no_further_attempt (booleans)' });
  }

  await db('leads').where({ id: lead.id }).update(updates);
  const updated = await db('leads').where({ id: lead.id }).first();
  res.json({
    id: updated.id,
    visited: !!updated.visited,
    has_solar: !!updated.has_solar,
    no_further_attempt: !!updated.no_further_attempt
  });
});

// --- Add a dated note to a lead's contact card. Notes are never edited or
// deleted through this API - it's a log, not a single mutable text field -
// so the history of contact attempts stays intact.
router.post('/:id/notes', async (req, res) => {
  const lead = await assertLeadAccess(req, res, req.params.id);
  if (!lead) return;

  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });

  const [note] = await db('lead_notes')
    .insert({ tenant_id: req.user.tenant_id, lead_id: lead.id, author_id: req.user.id, body: body.trim() })
    .returning('*');

  const author = await db('users').where({ id: req.user.id }).first();
  res.status(201).json({ id: note.id, body: note.body, created_at: note.created_at, author_name: author.name });
});

// --- Enrichment stub: wire your chosen vendor's API call in here.
// Deliberately left as a stub with a TODO rather than a guessed integration,
// since it depends on which vendor you pick (DataZapp, etc).
router.post('/:id/enrich', requireRole('admin', 'manager'), async (req, res) => {
  const lead = await db('leads').where({ id: req.params.id, tenant_id: req.user.tenant_id }).first();
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const rawLead = await db('raw_leads').where({ id: lead.raw_lead_id }).first();

  // TODO: replace with a real call to your enrichment vendor, e.g.:
  // const result = await enrichmentClient.lookup({ address: rawLead.address, ... });
  // For now this just marks the lead as needing manual enrichment so the
  // rest of the pipeline (route building, assignment) can be built and
  // tested without a live vendor account.
  await db('raw_leads').where({ id: rawLead.id }).update({ status: 'enrichment_failed' });

  res.status(501).json({
    error: 'Enrichment provider not configured yet',
    note: 'Wire your vendor API call into POST /leads/:id/enrich in src/routes/leads.js'
  });
});

module.exports = router;
