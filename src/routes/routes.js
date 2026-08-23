const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { optimizeOrder, haversineMiles } = require('../lib/routeOptimizer');
const { zipToCentroid, geocodeAddress } = require('../lib/geocoding');

const router = express.Router();
router.use(requireAuth);

// --- Create a route from a manually selected list of lead IDs (MVP path -
// no auto-optimization yet, manager picks stops and order manually or in
// whatever order they're passed).
router.post('/', requireRole('admin', 'manager'), async (req, res) => {
  const { name, date, territory_id, lead_ids } = req.body;
  if (!name || !date || !Array.isArray(lead_ids) || lead_ids.length === 0) {
    return res.status(400).json({ error: 'name, date, and a non-empty lead_ids array are required' });
  }

  const leads = await db('leads').whereIn('id', lead_ids).andWhere('tenant_id', req.user.tenant_id);
  if (leads.length !== lead_ids.length) {
    return res.status(400).json({ error: 'One or more lead_ids do not belong to this tenant' });
  }

  const [route] = await db('routes')
    .insert({
      tenant_id: req.user.tenant_id,
      name,
      date,
      territory_id: territory_id || null,
      status: 'draft',
      created_by: req.user.id
    })
    .returning('*');

  const stopRows = lead_ids.map((leadId, idx) => ({
    route_id: route.id,
    lead_id: leadId,
    sequence_number: idx + 1
  }));
  await db('route_stops').insert(stopRows);

  res.status(201).json({ ...route, stop_count: stopRows.length });
});

// --- Resolve a "start/end point" input, which can be given as {lat, lng},
// {zip}, or {address}. Used by build-optimized for both endpoints and
// radius modes.
async function resolvePoint(input) {
  if (!input) return null;
  if (typeof input.lat === 'number' && typeof input.lng === 'number') {
    return { lat: input.lat, lng: input.lng, label: input.label || `${input.lat}, ${input.lng}` };
  }
  if (input.zip) {
    const centroid = zipToCentroid(input.zip);
    if (!centroid) {
      throw new Error(
        `No centroid on file for zip ${input.zip}. Add it to src/lib/geocoding.js, or supply lat/lng or a full address instead.`
      );
    }
    return { ...centroid, label: `ZIP ${input.zip} centroid` };
  }
  if (input.address) {
    const geocoded = await geocodeAddress(input.address);
    return geocoded;
  }
  throw new Error('Point must include lat/lng, zip, or address');
}

// --- Build a route automatically: either between a fixed start/end point
// (visiting a manager-selected set of leads in an efficient order), or
// within a radius of a zip code (auto-selecting leads in range). Distances
// are straight-line estimates, not road-network - see routeOptimizer.js.
router.post('/build-optimized', requireRole('admin', 'manager'), async (req, res) => {
  const { mode, name, date, lead_ids, start, end, center_zip, radius_miles, max_stops } = req.body;

  if (!name || !date) return res.status(400).json({ error: 'name and date are required' });
  if (!['endpoints', 'radius'].includes(mode)) {
    return res.status(400).json({ error: "mode must be 'endpoints' or 'radius'" });
  }

  try {
    let candidateLeads;
    let startPoint = null;
    let endPoint = null;
    let centerZipUsed = null;
    let radiusUsed = null;

    if (mode === 'endpoints') {
      if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
        return res.status(400).json({ error: 'lead_ids is required for endpoints mode' });
      }
      if (!start || !end) {
        return res.status(400).json({ error: 'start and end points are both required for endpoints mode' });
      }

      startPoint = await resolvePoint(start);
      endPoint = await resolvePoint(end);

      candidateLeads = await db('leads')
        .whereIn('leads.id', lead_ids)
        .andWhere('leads.tenant_id', req.user.tenant_id)
        .join('raw_leads', 'leads.raw_lead_id', 'raw_leads.id')
        .select('leads.id as lead_id', 'raw_leads.lat', 'raw_leads.lng', 'raw_leads.address');
    } else {
      if (!center_zip || !radius_miles) {
        return res.status(400).json({ error: 'center_zip and radius_miles are required for radius mode' });
      }

      const centroid = await resolvePoint({ zip: center_zip });
      startPoint = centroid;
      endPoint = centroid; // round trip: rep starts and ends at the same depot
      centerZipUsed = center_zip;
      radiusUsed = radius_miles;

      // Only leads with coordinates and not already on a route are eligible.
      // Geocoding every candidate on the fly would be slow/rate-limited -
      // leads without lat/lng (e.g. from a CSV that didn't include them)
      // are silently excluded here; surfaced in the response so the manager
      // knows why the count might be lower than expected.
      const allTenantLeads = await db('leads')
        .where('leads.tenant_id', req.user.tenant_id)
        .whereNotNull('raw_leads.lat')
        .whereNotNull('raw_leads.lng')
        .whereNotExists(function () {
          this.select('*').from('route_stops').whereRaw('route_stops.lead_id = leads.id');
        })
        .join('raw_leads', 'leads.raw_lead_id', 'raw_leads.id')
        .select('leads.id as lead_id', 'raw_leads.lat', 'raw_leads.lng', 'raw_leads.address');

      candidateLeads = allTenantLeads.filter(
        (l) => haversineMiles(centroid, { lat: l.lat, lng: l.lng }) <= radius_miles
      );

      if (max_stops) candidateLeads = candidateLeads.slice(0, max_stops);
    }

    const withCoords = candidateLeads.filter((l) => l.lat != null && l.lng != null);
    const skippedNoCoords = candidateLeads.length - withCoords.length;

    if (withCoords.length === 0) {
      return res.status(400).json({
        error: 'No eligible leads with coordinates found for this route.',
        skipped_no_coordinates: skippedNoCoords
      });
    }

    const points = withCoords.map((l) => ({ id: l.lead_id, lat: l.lat, lng: l.lng }));
    const { order, distanceMiles } = optimizeOrder(points, startPoint, mode === 'endpoints' ? endPoint : null);

    const [route] = await db('routes')
      .insert({
        tenant_id: req.user.tenant_id,
        name,
        date,
        status: 'draft',
        created_by: req.user.id,
        build_mode: mode,
        start_lat: startPoint?.lat,
        start_lng: startPoint?.lng,
        start_label: startPoint?.label,
        end_lat: endPoint?.lat,
        end_lng: endPoint?.lng,
        end_label: endPoint?.label,
        center_zip: centerZipUsed,
        radius_miles: radiusUsed,
        estimated_distance_miles: distanceMiles
      })
      .returning('*');

    const stopRows = order.map((point, idx) => ({
      route_id: route.id,
      lead_id: point.id,
      sequence_number: idx + 1
    }));
    await db('route_stops').insert(stopRows);

    res.status(201).json({
      ...route,
      stop_count: stopRows.length,
      skipped_no_coordinates: skippedNoCoords,
      estimated_distance_miles: distanceMiles
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- List routes (manager's route board)
router.get('/', async (req, res) => {
  const { rep_id, date, status } = req.query;
  let query = db('routes').where('tenant_id', req.user.tenant_id);

  // Reps only ever see their own routes, regardless of query params passed.
  if (req.user.role === 'rep') {
    query = query.andWhere('assigned_rep_id', req.user.id);
  } else if (rep_id) {
    query = query.andWhere('assigned_rep_id', rep_id);
  }
  if (date) query = query.andWhere('date', date);
  if (status) query = query.andWhere('status', status);

  const routes = await query.orderBy('date', 'desc');
  res.json(routes);
});

// --- Rep's own active route for today (convenience endpoint for the PWA)
router.get('/me/today', requireRole('rep'), async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const route = await db('routes')
    .where({ tenant_id: req.user.tenant_id, assigned_rep_id: req.user.id, date: today })
    .first();
  if (!route) return res.status(404).json({ error: 'No route assigned for today' });
  res.json(route);
});

// --- Route detail with ordered stop list + lead info
router.get('/:id', async (req, res) => {
  const route = await db('routes').where({ id: req.params.id, tenant_id: req.user.tenant_id }).first();
  if (!route) return res.status(404).json({ error: 'Route not found' });
  if (req.user.role === 'rep' && route.assigned_rep_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your route' });
  }

  const stops = await db('route_stops')
    .where('route_stops.route_id', route.id)
    .join('leads', 'route_stops.lead_id', 'leads.id')
    .join('raw_leads', 'leads.raw_lead_id', 'raw_leads.id')
    .leftJoin('enriched_contacts', 'enriched_contacts.raw_lead_id', 'raw_leads.id')
    .select(
      'route_stops.id',
      'route_stops.sequence_number',
      'route_stops.planned_arrival_window',
      'route_stops.visited_at',
      'route_stops.outcome',
      'route_stops.rep_notes',
      'leads.id as lead_id',
      'leads.disposition',
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
      'enriched_contacts.full_name',
      'enriched_contacts.phone',
      'enriched_contacts.email'
    )
    .orderBy('route_stops.sequence_number', 'asc');

  res.json({ ...route, stops });
});

// --- Edit a route's name, date, or territory. Reassigning the rep happens
// through the dedicated /assign endpoint below, not here, since that one
// also has the lead-ownership-sync side effect.
router.patch('/:id', requireRole('admin', 'manager'), async (req, res) => {
  const route = await db('routes').where({ id: req.params.id, tenant_id: req.user.tenant_id }).first();
  if (!route) return res.status(404).json({ error: 'Route not found' });

  const { name, date, territory_id } = req.body;
  const updates = {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'name cannot be blank' });
    updates.name = name.trim();
  }
  if (date !== undefined) updates.date = date;
  if (territory_id !== undefined) updates.territory_id = territory_id || null;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Provide at least one of: name, date, territory_id' });
  }

  await db('routes').where({ id: route.id }).update(updates);
  const updated = await db('routes').where({ id: route.id }).first();
  res.json(updated);
});

// --- Delete a route. Cascades to its route_stops (FK ON DELETE CASCADE),
// so the stops go with it. Does NOT touch the underlying leads or their
// assigned_rep_id ownership - a deleted route just means those addresses
// are no longer scheduled on that particular run; ownership is tracked
// separately and a manager can change it explicitly if needed.
router.delete('/:id', requireRole('admin', 'manager'), async (req, res) => {
  const route = await db('routes').where({ id: req.params.id, tenant_id: req.user.tenant_id }).first();
  if (!route) return res.status(404).json({ error: 'Route not found' });

  await db('routes').where({ id: route.id }).delete();
  res.json({ deleted: true });
});

// --- Reorder stops. Body: { stop_ids_in_order: [...] }
// This is where you'd plug in Google Directions waypoint optimization later -
// for now it just accepts a manually or externally computed order.
router.patch('/:id/reorder', requireRole('admin', 'manager'), async (req, res) => {
  const { stop_ids_in_order } = req.body;
  if (!Array.isArray(stop_ids_in_order)) {
    return res.status(400).json({ error: 'stop_ids_in_order array is required' });
  }
  const route = await db('routes').where({ id: req.params.id, tenant_id: req.user.tenant_id }).first();
  if (!route) return res.status(404).json({ error: 'Route not found' });

  await Promise.all(
    stop_ids_in_order.map((stopId, idx) =>
      db('route_stops').where({ id: stopId, route_id: route.id }).update({ sequence_number: idx + 1 })
    )
  );

  res.json({ updated: stop_ids_in_order.length });
});

// --- Assign a route to a rep
router.patch('/:id/assign', requireRole('admin', 'manager'), async (req, res) => {
  const { rep_id } = req.body;
  if (!rep_id) return res.status(400).json({ error: 'rep_id is required' });

  const rep = await db('users').where({ id: rep_id, tenant_id: req.user.tenant_id, role: 'rep' }).first();
  if (!rep) return res.status(400).json({ error: 'rep_id does not match a rep on this tenant' });

  const route = await db('routes').where({ id: req.params.id, tenant_id: req.user.tenant_id }).first();
  if (!route) return res.status(404).json({ error: 'Route not found' });

  await db('routes').where({ id: route.id }).update({ assigned_rep_id: rep_id, status: 'assigned' });

  // Sync lead ownership - every lead on this route now shows this rep as
  // its owner, so "who owns this lead" stays consistent with "who's
  // supposed to be knocking on it" by default. A manager can still
  // override an individual lead's owner afterward via PATCH
  // /leads/:id/assign without affecting the route itself.
  await db('leads')
    .whereIn('id', function () {
      this.select('lead_id').from('route_stops').where('route_id', route.id);
    })
    .update({ assigned_rep_id: rep_id });

  await db('audit_logs').insert({
    tenant_id: req.user.tenant_id,
    user_id: req.user.id,
    action: 'route_assigned',
    entity_type: 'route',
    entity_id: route.id,
    details: `Assigned to rep ${rep_id}`
  });

  res.json({ ...route, assigned_rep_id: rep_id, status: 'assigned' });
});

module.exports = router;
