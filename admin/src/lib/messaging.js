/**
 * Builds handoff URLs for launching the device's native Mail or Messages
 * app with a pre-filled draft. Nothing is sent automatically - these just
 * open the native app with the content already in place; the person still
 * has to review and hit send themselves in their own app.
 */

export function getMailtoUrl(email, subject, body) {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${email}?${params.toString()}`;
}

export function getSmsUrl(phone, body) {
  const ua = (typeof navigator !== 'undefined' && (navigator.userAgent || navigator.vendor)) || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  // iOS and Android use different separators before the body param on the
  // sms: scheme - a well-known quirk, not a typo.
  const separator = isIOS ? '&' : '?';
  return `sms:${phone}${separator}body=${encodeURIComponent(body)}`;
}
