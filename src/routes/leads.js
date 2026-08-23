const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { syncMaricopaCounty } = require('../jobs/syncMaricopaCounty');
const { fetchRecentSales, fetchEstimatedValue, fetchPropertyDetails } = require('../lib/maricopaSales');
const { generateBrief, generateMessageDraft } = require('../lib/busybee');
const { computeSolarFitScore } = require('../lib/solarFit');

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

// --- Import historical notes/records onto EXISTING addresses (matched by
// address text), rather than creating new leads. CSV columns: address, note,
// date (optional - defaults to today if omitted). Addresses that don't match
// any existing lead are skipped and reported back, not silently dropped.
router.post('/import-notes', requireRole('admin', 'manager'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: file)' });

  let records;
  try {
    records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    return res.status(400).json({ error: `Could not parse CSV: ${err.message}` });
  }

  if (records.length === 0) return res.status(400).json({ error: 'CSV had no rows' });

  const missingFields = records.filter((r) => !r.address || !r.note);
  if (missingFields.length > 0) {
    return res.status(400).json({ error: `${missingFields.length} row(s) missing 'address' or 'note'` });
  }

  let imported = 0;
  const skippedAddresses = [];

  for (const record of records) {
    const match = await db('leads')
      .where('leads.tenant_id', req.user.tenant_id)
      .join('raw_leads', 'leads.raw_lead_id', 'raw_leads.id')
      .whereRaw('LOWER(TRIM(raw_leads.address)) = LOWER(TRIM(?))', [record.address])
      .select('leads.id')
      .first();

    if (!match) {
      skippedAddresses.push(record.address);
      continue;
    }

    const noteRow = {
      tenant_id: req.user.tenant_id,
      lead_id: match.id,
      author_id: req.user.id,
      body: record.note
    };
    // Only override created_at if a date was actually provided - otherwise
    // let the column's own default (now) apply.
    if (record.date) noteRow.created_at = record.date;

    await db('lead_notes').insert(noteRow);
    imported++;
  }

  await db('audit_logs').insert({
    tenant_id: req.user.tenant_id,
    user_id: req.user.id,
    action: 'notes_import',
    details: `Imported ${imported} notes from ${req.file.originalname}, ${skippedAddresses.length} addresses not matched`
  });

  res.status(201).json({
    imported,
    skipped_count: skippedAddresses.length,
    skipped_addresses: skippedAddresses.slice(0, 20) // cap the list so a bad file doesn't dump thousands of rows back
  });
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

// ===== ScoutHive: review-before-import Maricopa County lead sourcing =====
//
// Unlike /sync-maricopa above (which writes straight to the database), this
// pair of endpoints lets a manager preview recent county sale records,
// see which ones are already in the lead database, and choose exactly
// which ones to bring in.

// --- Preview recent sales for a search term. Read-only - makes no database
// writes. Flags each result as already_in_database if a lead with a
// matching address (or matching APN, if one's on file) already exists for
// this tenant, so ScoutHive can show which ones are genuinely new.
router.get('/scouthive/preview', requireRole('admin', 'manager'), async (req, res) => {
  const { search_term, lookback_days } = req.query;
  if (!search_term) return res.status(400).json({ error: 'search_term is required (zip code, subdivision, or area)' });

  const days = lookback_days ? parseInt(lookback_days, 10) : 90;

  try {
    const sales = await fetchRecentSales(search_term, days);

    const existingAddresses = new Set(
      (
        await db('raw_leads')
          .where('tenant_id', req.user.tenant_id)
          .select('address')
      ).map((r) => r.address.trim().toLowerCase())
    );
    const existingApns = new Set(
      (
        await db('raw_leads')
          .where('tenant_id', req.user.tenant_id)
          .whereNotNull('external_ref')
          .select('external_ref')
      ).map((r) => r.external_ref)
    );

    const results = sales.map((sale) => ({
      ...sale,
      already_in_database:
        existingAddresses.has(sale.address.trim().toLowerCase()) || (sale.apn && existingApns.has(sale.apn))
    }));

    res.json({ search_term, lookback_days: days, count: results.length, results });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Estimated home value for a single parcel (on demand, one at a time -
// not fetched in bulk during preview, to avoid multiplying the request
// count against the county's API for a search with many results).
//
// IMPORTANT: this is the county's tax-ASSESSED value, not a market
// estimate like a Zillow Zestimate. Arizona caps the assessed "Limited
// Property Value" used for tax purposes, so it often understates true
// market value - it's a free, official proxy, not a replacement for a paid
// AVM (ATTOM, HouseCanary, etc.) if you need closer-to-market figures.
router.get('/scouthive/valuation', requireRole('admin', 'manager'), async (req, res) => {
  const { apn } = req.query;
  if (!apn) return res.status(400).json({ error: 'apn is required' });

  try {
    const valuation = await fetchEstimatedValue(apn);
    res.json({ apn, ...valuation });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Property characteristics for a single parcel: bed/bath count, square
// footage, year built, and pool status. Same on-demand, one-at-a-time
// pattern as the valuation endpoint above, and for the same reason (avoid
// multiplying requests against the county's API for a search with many
// results).
router.get('/scouthive/details', requireRole('admin', 'manager'), async (req, res) => {
  const { apn } = req.query;
  if (!apn) return res.status(400).json({ error: 'apn is required' });

  try {
    const details = await fetchPropertyDetails(apn);
    res.json({ apn, ...details });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Import a manager-selected subset of previewed sales into the lead
// database. Body: { search_term, records: [...] } where records are the
// same objects returned by the preview endpoint above (or at minimum
// {apn, address, city, state, zip, purchase_date, sale_price, owner_name}).
// Re-checks for duplicates server-side rather than trusting the client's
// already_in_database flag, since time may have passed since the preview.
router.post('/scouthive/import', requireRole('admin', 'manager'), async (req, res) => {
  const { search_term, records } = req.body;
  if (!search_term) return res.status(400).json({ error: 'search_term is required' });
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'records must be a non-empty array' });
  }

  const source = await (async () => {
    const existing = await db('data_sources')
      .where({ tenant_id: req.user.tenant_id, provider_name: `Maricopa County Assessor: ${search_term}` })
      .first();
    if (existing) return existing;
    const [created] = await db('data_sources')
      .insert({
        tenant_id: req.user.tenant_id,
        provider_name: `Maricopa County Assessor: ${search_term}`,
        type: 'purchase_record',
        credentials_ref: 'MCASSESSOR_API_TOKEN'
      })
      .returning('*');
    return created;
  })();

  let imported = 0;
  let skippedDuplicate = 0;

  for (const record of records) {
    if (!record.address) continue;

    const dupQuery = db('raw_leads').where('tenant_id', req.user.tenant_id);
    if (record.apn) {
      dupQuery.andWhere(function () {
        this.where('external_ref', record.apn).orWhereRaw('LOWER(TRIM(address)) = LOWER(TRIM(?))', [record.address]);
      });
    } else {
      dupQuery.andWhereRaw('LOWER(TRIM(address)) = LOWER(TRIM(?))', [record.address]);
    }
    const dup = await dupQuery.first();
    if (dup) {
      skippedDuplicate++;
      continue;
    }

    const [rawLead] = await db('raw_leads')
      .insert({
        tenant_id: req.user.tenant_id,
        source_id: source.id,
        external_ref: record.apn || null,
        address: record.address,
        city: record.city || null,
        state: record.state || null,
        zip: record.zip || null,
        purchase_date: record.purchase_date || null,
        sale_price: record.sale_price || null,
        owner_name_raw: record.owner_name || null,
        status: 'new',
        // If the manager already fetched a valuation/property-details
        // lookup for this row during preview, carry it straight through
        // rather than losing it - see the estimated-value/property-details
        // endpoints below for the same fields fetched on demand for leads
        // that come in without this already attached.
        estimated_value: record.estimated_value || null,
        valuation_year: record.valuation_year || null,
        value_type: record.value_type || null,
        bedrooms: record.bedrooms || null,
        bathrooms: record.bathrooms || null,
        square_footage: record.square_footage || null,
        year_built: record.year_built || null,
        lot_size: record.lot_size || null,
        has_pool: record.has_pool === true || record.has_pool === false ? record.has_pool : null,
        property_intel_fetched_at: record.estimated_value || record.bedrooms || record.has_pool !== undefined ? db.fn.now() : null

      })
      .returning('*');

    await db('leads').insert({
      tenant_id: req.user.tenant_id,
      raw_lead_id: rawLead.id,
      disposition: 'not_contacted'
    });

    imported++;
  }

  await db('data_sources').where({ id: source.id }).update({ last_synced_at: db.fn.now() });

  await db('audit_logs').insert({
    tenant_id: req.user.tenant_id,
    user_id: req.user.id,
    action: 'scouthive_import',
    entity_type: 'data_source',
    entity_id: source.id,
    details: `Imported ${imported} leads via ScoutHive, ${skippedDuplicate} skipped as duplicates`
  });

  res.status(201).json({ imported, skipped_duplicate: skippedDuplicate });
});

// --- Browse leads (joins raw_leads + enriched_contacts for display)
router.get('/', async (req, res) => {
  const { territory_id, disposition, status, unassigned, state, visited, has_solar, no_further_attempt, sort } = req.query;

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
      'raw_leads.estimated_value',
      'raw_leads.square_footage',
      'raw_leads.year_built',
      'raw_leads.has_pool',
      'enriched_contacts.full_name',
      'enriched_contacts.phone',
      'enriched_contacts.email'
    );

  if (territory_id) query = query.where('leads.territory_id', territory_id);
  if (disposition) query = query.where('leads.disposition', disposition);
  if (status) query = query.where('raw_leads.status', status);
  if (state) query = query.whereRaw('UPPER(raw_leads.state) = UPPER(?)', [state]);
  if (visited === 'true') query = query.where('leads.visited', true);
  if (has_solar === 'true') query = query.where('leads.has_solar', true);
  if (no_further_attempt === 'true') query = query.where('leads.no_further_attempt', true);
  if (unassigned === 'true') {
    query = query.whereNotExists(function () {
      this.select('*').from('route_stops').whereRaw('route_stops.lead_id = leads.id');
    });
  }

  let leads = await query.orderBy('raw_leads.purchase_date', 'desc');

  // Solar Fit Score is computed here (not stored) since it's cheap and
  // depends on the has_solar/no_further_attempt flags, which can change
  // independently of the underlying property data - computing on read
  // keeps it always current rather than needing to be recalculated and
  // re-saved every time a flag changes.
  leads = leads.map((lead) => ({
    ...lead,
    solar_fit: computeSolarFitScore({
      has_pool: lead.has_pool,
      estimated_value: lead.estimated_value,
      square_footage: lead.square_footage,
      year_built: lead.year_built,
      purchase_date: lead.purchase_date,
      has_solar: lead.has_solar,
      no_further_attempt: lead.no_further_attempt
    })
  }));

  if (sort === 'solar_fit') {
    leads.sort((a, b) => b.solar_fit.score - a.solar_fit.score);
  }

  res.json(leads);
});

// --- Export all leads as a CSV download. Must be defined before GET /:id
// so Express doesn't try to match "export" as a lead id.
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  // Postgres returns date columns as JS Date objects; SQLite returns
  // strings already. Normalize both to a plain YYYY-MM-DD instead of
  // letting a Date object stringify to its verbose default format.
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

router.get('/export', requireRole('admin', 'manager'), async (req, res) => {
  const leads = await db('leads')
    .where('leads.tenant_id', req.user.tenant_id)
    .join('raw_leads', 'leads.raw_lead_id', 'raw_leads.id')
    .leftJoin('enriched_contacts', 'enriched_contacts.raw_lead_id', 'raw_leads.id')
    .select(
      'raw_leads.address',
      'raw_leads.city',
      'raw_leads.state',
      'raw_leads.zip',
      'raw_leads.purchase_date',
      'raw_leads.sale_price',
      'enriched_contacts.full_name',
      'enriched_contacts.phone',
      'enriched_contacts.email',
      'leads.disposition',
      'leads.visited',
      'leads.has_solar',
      'leads.no_further_attempt'
    )
    .orderBy('raw_leads.purchase_date', 'desc');

  const headers = [
    'address',
    'city',
    'state',
    'zip',
    'purchase_date',
    'sale_price',
    'full_name',
    'phone',
    'email',
    'disposition',
    'visited',
    'has_solar',
    'no_further_attempt'
  ];

  const rows = leads.map((lead) => headers.map((h) => csvEscape(lead[h])).join(','));
  const csv = [headers.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="routehive-leads-export-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

async function getLeadDetail(req, leadId) {
  const lead = await db('leads')
    .where({ 'leads.id': leadId, 'leads.tenant_id': req.user.tenant_id })
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
      'raw_leads.external_ref as apn',
      'raw_leads.estimated_value as estimated_value',
      'raw_leads.valuation_year as valuation_year',
      'raw_leads.value_type as value_type',
      'raw_leads.bedrooms as bedrooms',
      'raw_leads.bathrooms as bathrooms',
      'raw_leads.square_footage as square_footage',
      'raw_leads.year_built as year_built',
      'raw_leads.lot_size as lot_size',
      'raw_leads.has_pool as has_pool',
      'raw_leads.property_intel_fetched_at as property_intel_fetched_at',
      'enriched_contacts.full_name as full_name',
      'enriched_contacts.co_owner_name as co_owner_name',
      'enriched_contacts.phone as phone',
      'enriched_contacts.email as email'
    )
    .first();

  if (!lead) return null;

  if (req.user.role === 'rep') {
    const onAssignedRoute = await leadIsOnRepRoute(lead.id, req.user.id);
    if (!onAssignedRoute) return 'forbidden';
  }

  const notes = await db('lead_notes')
    .where({ lead_id: lead.id })
    .join('users', 'lead_notes.author_id', 'users.id')
    .select('lead_notes.id', 'lead_notes.body', 'lead_notes.created_at', 'users.name as author_name')
    .orderBy('lead_notes.created_at', 'desc');

  return {
    ...lead,
    visited: !!lead.visited,
    has_solar: !!lead.has_solar,
    no_further_attempt: !!lead.no_further_attempt,
    solar_fit: computeSolarFitScore({
      has_pool: lead.has_pool,
      estimated_value: lead.estimated_value,
      square_footage: lead.square_footage,
      year_built: lead.year_built,
      purchase_date: lead.purchase_date,
      has_solar: lead.has_solar,
      no_further_attempt: lead.no_further_attempt
    }),
    notes
  };
}

router.get('/:id', async (req, res) => {
  const lead = await getLeadDetail(req, req.params.id);
  if (lead === null) return res.status(404).json({ error: 'Lead not found' });
  if (lead === 'forbidden') return res.status(403).json({ error: 'Not one of your assigned stops' });
  res.json(lead);
});

// --- BusyBee pre-visit brief. Generated fresh each call, not cached - fine
// for now given Haiku's cost, but worth adding a short-TTL cache if this
// gets called often for the same lead (e.g. a rep reopening the same stop).
router.get('/:id/brief', async (req, res) => {
  const lead = await getLeadDetail(req, req.params.id);
  if (lead === null) return res.status(404).json({ error: 'Lead not found' });
  if (lead === 'forbidden') return res.status(403).json({ error: 'Not one of your assigned stops' });

  try {
    const brief = await generateBrief(lead);
    res.json({ brief });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- BusyBee message draft (email or text). Generates text only - never
// sends anything. The UI hands the result to the device's native Mail or
// Messages app for the rep to review and send themselves.
router.get('/:id/draft', async (req, res) => {
  const lead = await getLeadDetail(req, req.params.id);
  if (lead === null) return res.status(404).json({ error: 'Lead not found' });
  if (lead === 'forbidden') return res.status(403).json({ error: 'Not one of your assigned stops' });

  const { channel } = req.query;
  if (channel !== 'email' && channel !== 'text') {
    return res.status(400).json({ error: "channel must be 'email' or 'text'" });
  }
  // No longer hard-blocked on missing contact info - BusyBee still drafts
  // the message from everything else on the lead record (address, purchase
  // history, disposition, flags, full note history), and the rep can type
  // in the recipient by hand before opening their Mail/Messages app if it's
  // not already on file.

  try {
    const draft = await generateMessageDraft(lead, channel, req.user.name);
    res.json({ channel, ...draft, recipient_email: lead.email, recipient_phone: lead.phone });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
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

// --- County intel lookups, scoped to a specific lead (not admin/manager-
// only like the ScoutHive search endpoints - any rep can look this up for
// a lead on their own assigned route). Resolves the parcel number from the
// lead's own record (raw_leads.external_ref) rather than requiring it as a
// parameter, and persists the result so it's there next time without
// re-fetching. Requires the lead to have a parcel number on file, which
// only leads sourced through Maricopa County (auto-sync or ScoutHive) will
// have - a CSV-imported lead won't, and there's no way to look one up from
// just an address through this API.
router.get('/:id/estimated-value', async (req, res) => {
  const lead = await assertLeadAccess(req, res, req.params.id);
  if (!lead) return;

  const rawLead = await db('raw_leads').where({ id: lead.raw_lead_id }).first();
  if (!rawLead.external_ref) {
    return res.status(400).json({ error: "This lead has no parcel number on file - can't look up county data for it." });
  }

  try {
    const valuation = await fetchEstimatedValue(rawLead.external_ref);
    await db('raw_leads').where({ id: rawLead.id }).update({
      estimated_value: valuation.estimated_value,
      valuation_year: valuation.valuation_year,
      value_type: valuation.value_type,
      property_intel_fetched_at: db.fn.now()
    });
    res.json(valuation);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/:id/property-details', async (req, res) => {
  const lead = await assertLeadAccess(req, res, req.params.id);
  if (!lead) return;

  const rawLead = await db('raw_leads').where({ id: lead.raw_lead_id }).first();
  if (!rawLead.external_ref) {
    return res.status(400).json({ error: "This lead has no parcel number on file - can't look up county data for it." });
  }

  try {
    const details = await fetchPropertyDetails(rawLead.external_ref);
    await db('raw_leads').where({ id: rawLead.id }).update({
      bedrooms: details.bedrooms,
      bathrooms: details.bathrooms,
      square_footage: details.square_footage,
      year_built: details.year_built,
      lot_size: details.lot_size,
      has_pool: details.has_pool,
      property_intel_fetched_at: db.fn.now()
    });
    res.json(details);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});


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

// --- Edit contact info on a lead: primary name, co-owner name, email,
// phone. Works whether or not the lead has ever been through enrichment -
// if there's no enriched_contacts row yet (common for CSV-imported or
// un-enriched leads), one is created; if a row already exists, it's
// updated in place rather than creating a duplicate. Send only the fields
// you're changing - everything is optional per-request, but at least one
// field is required.
router.patch('/:id/contact', async (req, res) => {
  const lead = await assertLeadAccess(req, res, req.params.id);
  if (!lead) return;

  const { full_name, co_owner_name, email, phone } = req.body;
  const updates = {};

  if (full_name !== undefined) {
    const trimmed = String(full_name).trim();
    if (!trimmed) return res.status(400).json({ error: 'full_name cannot be blank' });
    updates.full_name = trimmed;
  }
  if (co_owner_name !== undefined) {
    updates.co_owner_name = co_owner_name ? String(co_owner_name).trim() : null;
  }
  if (email !== undefined) {
    updates.email = email ? String(email).trim() : null;
  }
  if (phone !== undefined) {
    updates.phone = phone ? String(phone).trim() : null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Provide at least one of: full_name, co_owner_name, email, phone' });
  }

  const existing = await db('enriched_contacts').where({ raw_lead_id: lead.raw_lead_id }).first();

  if (existing) {
    await db('enriched_contacts').where({ id: existing.id }).update(updates);
  } else {
    await db('enriched_contacts').insert({
      raw_lead_id: lead.raw_lead_id,
      enrichment_provider: 'manual_edit',
      enriched_at: db.fn.now(),
      ...updates
    });
  }

  const updated = await db('enriched_contacts')
    .where({ raw_lead_id: lead.raw_lead_id })
    .select('full_name', 'co_owner_name', 'email', 'phone')
    .first();

  res.json({ id: lead.id, ...updated });
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
