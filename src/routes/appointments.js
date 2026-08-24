const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { addBusinessDays } = require('../lib/businessDays');
const { generateReminderMessage } = require('../lib/busybee');
const { MAX_BUSINESS_DAYS_OUT } = require('../lib/appointmentRules');

const router = express.Router();
router.use(requireAuth);

async function leadIsOnRepRoute(leadId, repId) {
  const match = await db('route_stops')
    .join('routes', 'route_stops.route_id', 'routes.id')
    .where({ 'route_stops.lead_id': leadId, 'routes.assigned_rep_id': repId })
    .first();
  return !!match;
}

// --- Create an appointment. Reps can only book for themselves, and only
// for a lead on one of their own assigned routes; admin/manager can book
// for any rep and any lead in the tenant. The 3.5-business-day window is
// enforced against "now" at creation time and stored as originally_booked_at
// so a later reschedule can't be used to sneak the date further out.
router.post('/', async (req, res) => {
  const { lead_id, rep_id, scheduled_at, duration_minutes, notes } = req.body;
  if (!lead_id || !scheduled_at) {
    return res.status(400).json({ error: 'lead_id and scheduled_at are required' });
  }

  const lead = await db('leads').where({ id: lead_id, tenant_id: req.user.tenant_id }).first();
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  let finalRepId;
  if (req.user.role === 'rep' || req.user.role === 'senior') {
    finalRepId = req.user.id;
    const allowed = await leadIsOnRepRoute(lead_id, req.user.id);
    if (!allowed) return res.status(403).json({ error: 'Not one of your assigned stops' });
  } else {
    if (!rep_id) return res.status(400).json({ error: 'rep_id is required when booking as a manager/admin' });
    const rep = await db('users')
      .where({ id: rep_id, tenant_id: req.user.tenant_id })
      .whereIn('role', ['rep', 'senior'])
      .first();
    if (!rep) return res.status(400).json({ error: 'rep_id does not match a rep or Senior on this tenant' });
    finalRepId = rep_id;
  }

  const now = new Date();
  const scheduledDate = new Date(scheduled_at);
  if (isNaN(scheduledDate.getTime())) return res.status(400).json({ error: 'scheduled_at is not a valid date' });
  if (scheduledDate <= now) return res.status(400).json({ error: 'scheduled_at must be in the future' });

  const maxAllowed = addBusinessDays(now, MAX_BUSINESS_DAYS_OUT);
  if (scheduledDate > maxAllowed) {
    return res.status(400).json({
      error: `Appointments can only be booked up to ${MAX_BUSINESS_DAYS_OUT} business days out. Latest allowed time right now: ${maxAllowed.toISOString()}`
    });
  }

  const [appointment] = await db('appointments')
    .insert({
      tenant_id: req.user.tenant_id,
      lead_id,
      rep_id: finalRepId,
      created_by: req.user.id,
      scheduled_at: scheduledDate.toISOString(),
      duration_minutes: duration_minutes || 30,
      notes: notes || null,
      originally_booked_at: now.toISOString()
    })
    .returning('*');

  res.status(201).json(appointment);
});

// --- List appointments. Reps see only their own; admin/manager see all
// (optionally filtered to one rep for a focused view) - this same endpoint
// serves both "my appointments" (employee app) and the manager rollup
// (admin app), the caller's role determines the scope automatically.
router.get('/', async (req, res) => {
  const { rep_id, status, from, to } = req.query;

  let query = db('appointments')
    .where('appointments.tenant_id', req.user.tenant_id)
    .join('leads', 'appointments.lead_id', 'leads.id')
    .join('raw_leads', 'leads.raw_lead_id', 'raw_leads.id')
    .leftJoin('enriched_contacts', 'enriched_contacts.raw_lead_id', 'raw_leads.id')
    .join('users', 'appointments.rep_id', 'users.id')
    .select(
      'appointments.id',
      'appointments.lead_id',
      'appointments.rep_id',
      'appointments.scheduled_at',
      'appointments.duration_minutes',
      'appointments.notes',
      'appointments.status',
      'appointments.originally_booked_at',
      'appointments.created_at',
      'users.name as rep_name',
      'raw_leads.address',
      'raw_leads.city',
      'raw_leads.state',
      'raw_leads.zip',
      'enriched_contacts.full_name',
      'enriched_contacts.phone',
      'enriched_contacts.email'
    );

  // A Senior isn't a rep, so with no rep_id filter this already returns
  // every appointment across every rep - exactly what the "all rep
  // appointments" view for a Senior needs, no special-casing required.
  if (req.user.role === 'rep') {
    if (rep_id && rep_id !== req.user.id) {
      // A rep may look up a SENIOR's appointments specifically - to know
      // which closing meetings to coordinate around - but not another
      // rep's, which stays private.
      const target = await db('users').where({ id: rep_id, tenant_id: req.user.tenant_id }).first();
      if (!target || target.role !== 'senior') {
        return res.status(403).json({ error: "You can view your own appointments, or a Senior's." });
      }
      query = query.andWhere('appointments.rep_id', rep_id);
    } else {
      query = query.andWhere('appointments.rep_id', req.user.id);
    }
  } else if (rep_id) {
    query = query.andWhere('appointments.rep_id', rep_id);
  }
  if (status) query = query.andWhere('appointments.status', status);
  if (from) query = query.andWhere('appointments.scheduled_at', '>=', from);
  if (to) query = query.andWhere('appointments.scheduled_at', '<=', to);

  const appointments = await query.orderBy('appointments.scheduled_at', 'asc');
  res.json(appointments);
});

async function loadAppointmentScoped(req, res) {
  const appointment = await db('appointments').where({ id: req.params.id, tenant_id: req.user.tenant_id }).first();
  if (!appointment) {
    res.status(404).json({ error: 'Appointment not found' });
    return null;
  }
  if (req.user.role === 'rep' && appointment.rep_id !== req.user.id) {
    res.status(403).json({ error: 'Not your appointment' });
    return null;
  }
  return appointment;
}

router.get('/:id', async (req, res) => {
  const appointment = await loadAppointmentScoped(req, res);
  if (!appointment) return;
  res.json(appointment);
});

// --- Update status (complete/cancel/no-show) or reschedule. Rescheduling
// re-validates against originally_booked_at, not "now" - so you can't use a
// reschedule to push an appointment further out than the original 3.5
// business-day cap allowed.
router.patch('/:id', async (req, res) => {
  const appointment = await loadAppointmentScoped(req, res);
  if (!appointment) return;

  const { status, scheduled_at, notes, duration_minutes } = req.body;
  const updates = {};

  if (status !== undefined) {
    if (!['scheduled', 'completed', 'cancelled', 'no_show'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    updates.status = status;
  }

  if (scheduled_at !== undefined) {
    const scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime())) return res.status(400).json({ error: 'scheduled_at is not a valid date' });

    const maxAllowed = addBusinessDays(new Date(appointment.originally_booked_at), MAX_BUSINESS_DAYS_OUT);
    if (scheduledDate > maxAllowed) {
      return res.status(400).json({
        error: `Rescheduled time is still capped at ${MAX_BUSINESS_DAYS_OUT} business days from when this was originally booked (${appointment.originally_booked_at}). Latest allowed: ${maxAllowed.toISOString()}`
      });
    }
    updates.scheduled_at = scheduledDate.toISOString();
  }

  if (notes !== undefined) updates.notes = notes;
  if (duration_minutes !== undefined) updates.duration_minutes = duration_minutes;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No editable fields provided' });
  }

  await db('appointments').where({ id: appointment.id }).update(updates);
  const updated = await db('appointments').where({ id: appointment.id }).first();
  res.json(updated);
});

// --- BusyBee reminder draft for a specific appointment. Generates text
// only - the rep reviews and sends it themselves via the native app
// handoff, same as the lead-level message drafts.
router.get('/:id/reminder', async (req, res) => {
  const appointment = await loadAppointmentScoped(req, res);
  if (!appointment) return;

  const { type, channel } = req.query;
  if (type !== '24h' && type !== '1h') return res.status(400).json({ error: "type must be '24h' or '1h'" });
  if (channel !== 'email' && channel !== 'text') return res.status(400).json({ error: "channel must be 'email' or 'text'" });

  const lead = await db('leads')
    .where({ 'leads.id': appointment.lead_id })
    .join('raw_leads', 'leads.raw_lead_id', 'raw_leads.id')
    .leftJoin('enriched_contacts', 'enriched_contacts.raw_lead_id', 'raw_leads.id')
    .select(
      'raw_leads.address',
      'raw_leads.city',
      'raw_leads.state',
      'raw_leads.zip',
      'enriched_contacts.full_name',
      'enriched_contacts.phone',
      'enriched_contacts.email'
    )
    .first();

  if (channel === 'email' && !lead.email) return res.status(400).json({ error: 'No email on file for this lead' });
  if (channel === 'text' && !lead.phone) return res.status(400).json({ error: 'No phone number on file for this lead' });

  try {
    const draft = await generateReminderMessage(appointment, lead, channel, type, req.user.name);
    res.json({ channel, type, ...draft, recipient_email: lead.email, recipient_phone: lead.phone });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
