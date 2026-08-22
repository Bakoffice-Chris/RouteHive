/**
 * Static centroid table for a starter set of Maricopa County zip codes, so
 * radius-mode route building works offline with zero API dependency. This
 * is intentionally small - expand it, or better, replace zipToCentroid with
 * a real geocoder call (see geocodeAddress below) once you're deployed
 * somewhere with live internet access. This build environment can't reach
 * external geocoding APIs to fetch a fuller table or verify these values -
 * treat them as approximate and spot-check before relying on them.
 */
const ZIP_CENTROIDS = {
  '85003': { lat: 33.4536, lng: -112.0819 }, // Downtown Phoenix
  '85004': { lat: 33.4519, lng: -112.0672 },
  '85006': { lat: 33.4667, lng: -112.0499 },
  '85008': { lat: 33.4762, lng: -112.0068 },
  '85012': { lat: 33.4939, lng: -112.0631 },
  '85014': { lat: 33.5058, lng: -112.0598 },
  '85016': { lat: 33.5058, lng: -112.0219 },
  '85018': { lat: 33.4939, lng: -111.9862 },
  '85020': { lat: 33.5619, lng: -112.0596 },
  '85022': { lat: 33.6237, lng: -112.0526 },
  '85024': { lat: 33.6473, lng: -112.0526 },
  '85027': { lat: 33.6473, lng: -112.1024 },
  '85028': { lat: 33.5859, lng: -112.0110 },
  '85032': { lat: 33.6087, lng: -112.0317 },
  '85050': { lat: 33.6767, lng: -112.0110 },
  '85254': { lat: 33.6237, lng: -111.9694 },
  '85251': { lat: 33.4942, lng: -111.9261 }, // Scottsdale
  '85260': { lat: 33.5806, lng: -111.8987 },
  '85281': { lat: 33.4152, lng: -111.9312 }, // Tempe
  '85282': { lat: 33.3861, lng: -111.9647 },
  '85301': { lat: 33.5387, lng: -112.1859 }, // Glendale
  '85308': { lat: 33.6423, lng: -112.1859 },
  '85345': { lat: 33.5981, lng: -112.2129 } // Peoria
};

function zipToCentroid(zip) {
  const clean = String(zip).trim().slice(0, 5);
  return ZIP_CENTROIDS[clean] || null;
}

/**
 * Geocodes a free-text address using OpenStreetMap's Nominatim (free, no
 * API key required, but rate-limited and requires a descriptive User-Agent
 * per their usage policy: https://operations.osmfoundation.org/policies/nominatim/).
 *
 * UNTESTED in this build environment - no network access to
 * nominatim.openstreetmap.org here. Verify this works once deployed, and
 * respect their 1 req/sec limit if you're geocoding in bulk (this function
 * handles one address at a time, so bulk callers must add their own delay).
 */
async function geocodeAddress(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': process.env.GEOCODER_USER_AGENT || 'route-platform-app (contact: set GEOCODER_USER_AGENT in .env)'
    }
  });

  if (!res.ok) throw new Error(`Geocoding request failed: ${res.status}`);
  const results = await res.json();
  if (!results || results.length === 0) {
    throw new Error(`Could not geocode address: "${query}"`);
  }

  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), label: results[0].display_name };
}

module.exports = { zipToCentroid, geocodeAddress, ZIP_CENTROIDS };
