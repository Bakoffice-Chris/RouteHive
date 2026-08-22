/**
 * Builds a URL that hands off to the phone's native maps app for
 * turn-by-turn directions, rather than trying to build navigation into this
 * app. Detects platform from the user agent:
 * - iOS -> Apple Maps app (maps:// scheme)
 * - Android -> the geo: URI scheme, which lets the OS offer whichever maps
 *   app(s) the user has installed (Google Maps, Waze, etc.)
 * - Anything else (desktop, unknown) -> Google Maps web, which works
 *   everywhere as a universal fallback and still opens the native app if
 *   one happens to be installed and registered for the link.
 */
export function getDirectionsUrl(lat, lng, label) {
  const ua = (typeof navigator !== 'undefined' && (navigator.userAgent || navigator.vendor)) || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/i.test(ua);
  const encodedLabel = encodeURIComponent(label || `${lat},${lng}`);

  if (isIOS) {
    return `maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
  }
  if (isAndroid) {
    return `geo:${lat},${lng}?q=${lat},${lng}(${encodedLabel})`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
