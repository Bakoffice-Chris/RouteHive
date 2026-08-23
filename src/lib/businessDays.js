/**
 * Adds a (possibly fractional) number of business days to a date, skipping
 * weekends entirely. Used to enforce "appointments must be booked within
 * 3.5 business days of when they're created."
 *
 * Interpretation of a fractional business day (the ".5"): whole days are
 * calendar days that fall on a weekday (Sat/Sun skipped entirely, not
 * counted and not landed on); the fractional remainder is treated as that
 * fraction of 24 hours, added on top - if that lands on a weekend, it's
 * pushed forward to the equivalent time on the next weekday. This is a
 * calendar-day simplification (not an hours-of-operation model like
 * "9am-5pm business hours") - the same simplification most "N business
 * days" deadlines use (e.g. shipping estimates), not a payroll/scheduling
 * hours calculation. If a stricter definition is ever needed, this is the
 * one function to change - the 3.5 constant itself lives in
 * routes/appointments.js, not here.
 */
function addBusinessDays(fromDate, businessDays) {
  const wholeDays = Math.floor(businessDays);
  const fraction = businessDays - wholeDays;

  let current = new Date(fromDate);
  let daysAdded = 0;
  while (daysAdded < wholeDays) {
    current.setDate(current.getDate() + 1);
    const day = current.getDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) daysAdded++;
  }

  if (fraction > 0) {
    const hoursToAdd = fraction * 24;
    current = new Date(current.getTime() + hoursToAdd * 60 * 60 * 1000);
    const day = current.getDay();
    if (day === 6) current.setDate(current.getDate() + 2); // Sat -> Mon
    else if (day === 0) current.setDate(current.getDate() + 1); // Sun -> Mon
  }

  return current;
}

module.exports = { addBusinessDays };
