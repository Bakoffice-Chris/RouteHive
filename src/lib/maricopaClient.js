const BASE_URL = 'https://mcassessor.maricopa.gov';

// Simple rate limiting - the county doesn't publish a documented limit, but
// hammering a public agency's API is a good way to get your token revoked.
// Adjust MARICOPA_REQUEST_DELAY_MS in .env if you get 429s or find their
// actual documented limit.
const REQUEST_DELAY_MS = parseInt(process.env.MARICOPA_REQUEST_DELAY_MS || '300', 10);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getToken() {
  const token = process.env.MCASSESSOR_API_TOKEN;
  if (!token) {
    throw new Error(
      'MCASSESSOR_API_TOKEN is not set. Request a free token at https://mcassessor.maricopa.gov/contact/ ' +
        '(select "API Question/Token"), then add it to your .env file.'
    );
  }
  return token;
}

async function mcaFetch(path) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      AUTHORIZATION: token,
      'user-agent': null
    }
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Maricopa API auth failed (${res.status}) - check MCASSESSOR_API_TOKEN`);
  }
  if (!res.ok) {
    throw new Error(`Maricopa API request failed: ${res.status} ${res.statusText} for ${path}`);
  }

  await sleep(REQUEST_DELAY_MS);
  return res.json();
}

/**
 * Search all property data points for a query string - a subdivision name,
 * zip code, address fragment, or owner name. Paginated at 25 results/page.
 *
 * NOTE: field names in the response are per the county's published API doc
 * as of Feb 2024. Verify actual field names against a live response once
 * you have a token - the doc doesn't include a full sample payload, and
 * county systems have historically changed shape without notice (they
 * mention a system migration to "AA-GAMA" as of 2026). Log one raw response
 * and adjust the field mapping in syncMaricopaCounty.js if needed.
 */
async function searchProperty(query, page = 1) {
  const encoded = encodeURIComponent(query);
  const suffix = page > 1 ? `&page=${page}` : '';
  return mcaFetch(`/search/property/?q=${encoded}${suffix}`);
}

async function getParcel(apn) {
  return mcaFetch(`/parcel/${apn}`);
}

async function getOwnerDetails(apn) {
  return mcaFetch(`/parcel/${apn}/owner-details`);
}

async function getValuations(apn) {
  return mcaFetch(`/parcel/${apn}/valuations`);
}

async function getPropertyAddress(apn) {
  return mcaFetch(`/parcel/${apn}/address`);
}

module.exports = {
  searchProperty,
  getParcel,
  getOwnerDetails,
  getValuations,
  getPropertyAddress
};
