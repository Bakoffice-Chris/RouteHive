/**
 * Formats a date-only value (purchase_date, route.date - anything with no
 * meaningful time component) as DD/MM/YYYY. The API already strips these
 * down to plain "YYYY-MM-DD" strings server-side, but this is defensive
 * against any value shape (a Date object, an ISO timestamp with a T in it,
 * or already-clean "YYYY-MM-DD") so a stray unformatted date never leaks a
 * timestamp into the UI.
 */
export function formatDateOnly(value) {
  if (!value) return '';
  const isoPart = String(value).slice(0, 10); // "YYYY-MM-DD" whether or not there's a time suffix
  const [year, month, day] = isoPart.split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}
