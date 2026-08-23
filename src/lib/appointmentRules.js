// Shared between src/routes/appointments.js and src/routes/booking.js so
// the two booking paths (rep-initiated, self-service) can't drift apart on
// the core business rule.
const MAX_BUSINESS_DAYS_OUT = 3.5;
const DEFAULT_APPOINTMENT_DURATION_MINUTES = 30;
const DEFAULT_SLOT_INTERVAL_MINUTES = 30;

module.exports = { MAX_BUSINESS_DAYS_OUT, DEFAULT_APPOINTMENT_DURATION_MINUTES, DEFAULT_SLOT_INTERVAL_MINUTES };
