/**
 * Generates bookable time slots for a rep, given their declared weekly
 * availability windows and their existing appointments (which block out
 * time). Pure function - no I/O - so it's fully unit-testable without a
 * database.
 *
 * @param {object} params
 * @param {Array<{day_of_week: number, start_time: string, end_time: string}>} params.availabilityWindows
 *   day_of_week: 0=Sunday..6=Saturday. start_time/end_time: "HH:MM" 24-hour.
 * @param {Array<{scheduled_at: string, duration_minutes: number}>} params.existingAppointments
 *   Already-booked appointments for this rep, used to exclude busy slots.
 * @param {Date} params.fromDate - don't generate slots before this
 * @param {Date} params.toDate - don't generate slots after this (the
 *   3.5-business-day cap is applied by the caller before this function runs)
 * @param {number} params.slotDurationMinutes - how long a booked slot occupies
 * @param {number} params.slotIntervalMinutes - spacing between slot start times
 * @returns {Array<string>} ISO datetime strings, one per bookable slot start
 */
function generateAvailableSlots({
  availabilityWindows,
  existingAppointments,
  fromDate,
  toDate,
  slotDurationMinutes,
  slotIntervalMinutes
}) {
  const slots = [];

  const busyRanges = existingAppointments.map((appt) => {
    const start = new Date(appt.scheduled_at).getTime();
    const end = start + appt.duration_minutes * 60 * 1000;
    return { start, end };
  });

  function overlapsBusy(slotStart, slotEnd) {
    return busyRanges.some((b) => slotStart < b.end && slotEnd > b.start);
  }

  // Walk day by day from fromDate to toDate.
  const dayCursor = new Date(fromDate);
  dayCursor.setHours(0, 0, 0, 0);
  const endBoundary = new Date(toDate);

  while (dayCursor <= endBoundary) {
    const dow = dayCursor.getDay();
    const windowsForDay = availabilityWindows.filter((w) => w.day_of_week === dow);

    for (const window of windowsForDay) {
      const [startH, startM] = window.start_time.split(':').map(Number);
      const [endH, endM] = window.end_time.split(':').map(Number);

      let slotStart = new Date(dayCursor);
      slotStart.setHours(startH, startM, 0, 0);
      const windowEnd = new Date(dayCursor);
      windowEnd.setHours(endH, endM, 0, 0);

      while (slotStart.getTime() + slotDurationMinutes * 60 * 1000 <= windowEnd.getTime()) {
        const slotEndTime = slotStart.getTime() + slotDurationMinutes * 60 * 1000;

        const inRange = slotStart.getTime() >= fromDate.getTime() && slotStart.getTime() <= toDate.getTime();
        const isFuture = slotStart.getTime() > Date.now();

        if (inRange && isFuture && !overlapsBusy(slotStart.getTime(), slotEndTime)) {
          slots.push(new Date(slotStart).toISOString());
        }

        slotStart = new Date(slotStart.getTime() + slotIntervalMinutes * 60 * 1000);
      }
    }

    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  return slots;
}

module.exports = { generateAvailableSlots };
