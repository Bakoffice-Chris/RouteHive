const express = require('express');
const db = require('../db');
const { publicRateLimit } = require('../middleware/publicRateLimit');
const { addBusinessDays } = require('../lib/businessDays');
const { generateAvailableSlots } = require('../lib/availabilitySlots');
const {
  MAX_BUSINESS_DAYS_OUT,
  DEFAULT_APPOINTMENT_DURATION_MINUTES,
  DEFAULT_SLOT_INTERVAL_MINUTES
} = require('../lib/appointmentRules');

const router = express.Router();
router.use(publicRateLimit);

async function loadValidLink(token) {
  const link = await db('booking_links').where({ token }).first();
  if (!link) return { error: 'not_found' };
  if (link.appointment_id) return { error: 'already_used' };
  if (new Date(link.expires_at) < new Date()) return { error: 'expired' };
  return { link };
}

// --- Look up a booking link and return the rep's available slots. No
// contact info is returned here beyond what's needed to book (rep's first
// name) - this is a public endpoint, kept deliberately minimal about what
// a stranger with the link could learn.
router.get('/:token', async (req, res) => {
  const { link, error } = await loadValidLink(req.params.token);
  if (error === 'not_found') return res.status(404).json({ error: 'This booking link is not valid.' });
  if (error === 'already_used') return res.status(410).json({ error: 'This booking link has already been used.' });
  if (error === 'expired') return res.status(410).json({ error: 'This booking link has expired.' });

  const rep = await db('users').where({ id: link.rep_id }).first();
  const windows = await db('rep_availability').where({ rep_id: link.rep_id, tenant_id: link.tenant_id, active: true });

  const existingAppointments = await db('appointments')
    .where({ rep_id: link.rep_id, tenant_id: link.tenant_id })
    .andWhere('status', 'scheduled')
    .andWhere('scheduled_at', '>', new Date().toISOString())
    .select('scheduled_at', 'duration_minutes');

  // The self-service window is anchored to when the link was CREATED, not
  // "now" that the homeowner happens to be viewing it - same principle as
  // the reschedule protection on rep-booked appointments: the cap can't be
  // extended just because someone waits longer to open the link.
  const now = new Date();
  const maxAllowed = addBusinessDays(new Date(link.created_at), MAX_BUSINESS_DAYS_OUT);

  const slots = generateAvailableSlots({
    availabilityWindows: windows,
    existingAppointments,
    fromDate: now,
    toDate: maxAllowed,
    slotDurationMinutes: DEFAULT_APPOINTMENT_DURATION_MINUTES,
    slotIntervalMinutes: DEFAULT_SLOT_INTERVAL_MINUTES
  });

  res.json({
    rep_first_name: rep.name.split(' ')[0],
    duration_minutes: DEFAULT_APPOINTMENT_DURATION_MINUTES,
    available_slots: slots
  });
});

// --- Book a slot. Body: { scheduled_at, name, email, phone, website }.
// `website` is a honeypot field - real users never see or fill it (hidden
// via CSS on the booking page); if it's non-empty, silently pretend
// success without actually booking anything, rather than telling a bot
// its submission was rejected (which just teaches it to adapt).
router.post('/:token', async (req, res) => {
  const { scheduled_at, name, email, phone, website } = req.body;

  if (website) {
    return res.status(201).json({ confirmed: true }); // honeypot tripped - fake success, no-op
  }

  const { link, error } = await loadValidLink(req.params.token);
  if (error === 'not_found') return res.status(404).json({ error: 'This booking link is not valid.' });
  if (error === 'already_used') return res.status(410).json({ error: 'This booking link has already been used.' });
  if (error === 'expired') return res.status(410).json({ error: 'This booking link has expired.' });

  if (!scheduled_at) return res.status(400).json({ error: 'scheduled_at is required' });
  const scheduledDate = new Date(scheduled_at);
  if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
    return res.status(400).json({ error: 'scheduled_at must be a valid time in the future' });
  }

  const maxAllowed = addBusinessDays(new Date(link.created_at), MAX_BUSINESS_DAYS_OUT);
  if (scheduledDate > maxAllowed) {
    return res.status(400).json({ error: 'That time is outside the allowed booking window.' });
  }

  // Re-check availability server-side rather than trusting the slot came
  // from the list this server itself generated a moment ago - someone
  // could construct a POST directly without ever calling the GET.
  const windows = await db('rep_availability').where({ rep_id: link.rep_id, tenant_id: link.tenant_id, active: true });
  const existingAppointments = await db('appointments')
    .where({ rep_id: link.rep_id, tenant_id: link.tenant_id })
    .andWhere('status', 'scheduled')
    .select('scheduled_at', 'duration_minutes');

  const validSlots = generateAvailableSlots({
    availabilityWindows: windows,
    existingAppointments,
    fromDate: new Date(),
    toDate: maxAllowed,
    slotDurationMinutes: DEFAULT_APPOINTMENT_DURATION_MINUTES,
    slotIntervalMinutes: DEFAULT_SLOT_INTERVAL_MINUTES
  });

  if (!validSlots.includes(scheduledDate.toISOString())) {
    return res.status(409).json({ error: 'That time is no longer available. Please pick another slot.' });
  }

  const [appointment] = await db('appointments')
    .insert({
      tenant_id: link.tenant_id,
      lead_id: link.lead_id,
      rep_id: link.rep_id,
      created_by: link.created_by,
      scheduled_at: scheduledDate.toISOString(),
      duration_minutes: DEFAULT_APPOINTMENT_DURATION_MINUTES,
      notes: 'Booked via self-service link',
      originally_booked_at: link.created_at
    })
    .returning('*');

  await db('booking_links').where({ id: link.id }).update({ appointment_id: appointment.id });

  // If the homeowner gave contact info and there's no enriched_contacts row
  // yet, save it - same upsert-safe pattern as the rest of the app, so this
  // doesn't create a duplicate contact record for the lead.
  if (name || email || phone) {
    const lead = await db('leads').where({ id: link.lead_id }).first();
    const existingContact = await db('enriched_contacts').where({ raw_lead_id: lead.raw_lead_id }).first();
    const updates = {};
    if (name) updates.full_name = name;
    if (email) updates.email = email;
    if (phone) updates.phone = phone;

    if (existingContact) {
      await db('enriched_contacts').where({ id: existingContact.id }).update(updates);
    } else {
      await db('enriched_contacts').insert({
        raw_lead_id: lead.raw_lead_id,
        enrichment_provider: 'self_service_booking',
        enriched_at: db.fn.now(),
        ...updates
      });
    }
  }

  res.status(201).json({ confirmed: true, scheduled_at: appointment.scheduled_at });
});

module.exports = router;
