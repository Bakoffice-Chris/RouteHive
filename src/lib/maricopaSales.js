const mca = require('./maricopaClient');

/**
 * Field-extraction helpers for Maricopa County Assessor search results.
 * Split out from the sync job so both the direct-sync path (syncMaricopaCounty.js)
 * and the preview/import path (used by ScoutHive) share one place to fix
 * field names if the county's response shape turns out to differ from what's
 * assumed here - see the note in maricopaClient.js about this being untested
 * against a live response.
 */

function extractSaleInfo(record) {
  const saleDateRaw =
    record.LastSaleDate || record.SaleDate || record.last_sale_date || record.RecordingDate || null;
  const salePrice = record.LastSalePrice || record.SalePrice || record.last_sale_price || null;
  const saleDate = saleDateRaw ? new Date(saleDateRaw) : null;
  return { saleDate, salePrice };
}

function extractAddress(record) {
  return {
    address: record.SitusAddress || record.situs_address || record.PropertyAddress || record.address || null,
    city: record.SitusCity || record.situs_city || record.City || null,
    state: record.SitusState || 'AZ',
    zip: record.SitusZip || record.situs_zip || record.Zip || null
  };
}

function extractOwnerName(record) {
  return record.OwnerName || record.owner_name || record.Owner || null;
}

function extractApn(record) {
  return record.APN || record.apn || record.ParcelNumber || null;
}

// Valuations response shape is undocumented the same way search results are
// (see the module-level note in maricopaClient.js) - this checks the field
// names most consistent with the Assessor's public site. The Assessor
// publishes both "Full Cash Value" and "Limited Property Value" per year;
// FCV is the closer analog to market value (LPV is capped for tax purposes
// and often understates it), so this prefers FCV when both are present.
function extractLatestValuation(valuationsResponse) {
  const rows = valuationsResponse.Valuations || valuationsResponse.valuations || valuationsResponse.results || [];
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // Assume rows are one per tax year - take the most recent by year field,
  // falling back to array order (first = latest) if no explicit year found.
  const sorted = [...rows].sort((a, b) => {
    const yearA = a.TaxYear || a.Year || a.year || 0;
    const yearB = b.TaxYear || b.Year || b.year || 0;
    return yearB - yearA;
  });
  const latest = sorted[0];

  const fullCashValue = latest.FullCashValue || latest.full_cash_value || latest.FCV || null;
  const limitedValue = latest.LimitedPropertyValue || latest.limited_property_value || latest.LPV || null;
  const year = latest.TaxYear || latest.Year || latest.year || null;

  const value = fullCashValue || limitedValue;
  if (!value) return null;

  return {
    estimated_value: parseFloat(value),
    valuation_year: year,
    value_type: fullCashValue ? 'full_cash_value' : 'limited_property_value'
  };
}

/**
 * Fetches the most recent assessed value for a single parcel. Called
 * per-parcel, on demand (not in bulk during a preview search) - the
 * valuations endpoint is a separate API call per APN, and fetching it for
 * every result in a search would multiply the request count and risk
 * hitting the county's (undocumented) rate limits.
 */
async function fetchEstimatedValue(apn) {
  if (!apn) throw new Error('No parcel number (APN) on file for this record - cannot look up a valuation.');
  const mca = require('./maricopaClient');
  const response = await mca.getValuations(apn);
  const valuation = extractLatestValuation(response);
  if (!valuation) throw new Error('No valuation data found for this parcel.');
  return valuation;
}

// The county's parcel-details endpoint carries physical property
// characteristics (bed/bath count, square footage, year built, and pool
// status) alongside the sale/valuation data covered above - confirmed via
// the county's public data-sales documentation, which lists "pool size" as
// one of the "basic improvement components" they track per parcel. Field
// names below are the best guess from the same public documentation used
// elsewhere in this file; verify against a real response the same way.
function extractPropertyFeatures(parcelResponse) {
  const p = parcelResponse.Parcel || parcelResponse.parcel || parcelResponse;

  const bedrooms = p.Bedrooms || p.bedrooms || p.BedroomsCount || null;
  const bathrooms = p.Bathrooms || p.bathrooms || p.BathroomsCount || null;
  const squareFootage = p.LivableSquareFootage || p.SquareFootage || p.LivingArea || p.living_area || null;
  const yearBuilt = p.YearBuilt || p.year_built || p.ConstructionYear || null;
  const lotSize = p.LotSize || p.lot_size || null;

  // Pool is typically a yes/no or size field - a nonzero/truthy value of
  // either shape means "has a pool."
  const poolRaw = p.Pool || p.pool || p.PoolYN || p.PoolSize || p.pool_size;
  let hasPool = null;
  if (poolRaw !== undefined && poolRaw !== null && poolRaw !== '') {
    if (typeof poolRaw === 'boolean') hasPool = poolRaw;
    else if (typeof poolRaw === 'string') hasPool = /^(y|yes|true|1)$/i.test(poolRaw.trim());
    else if (typeof poolRaw === 'number') hasPool = poolRaw > 0;
  }

  return {
    bedrooms: bedrooms ? parseInt(bedrooms, 10) : null,
    bathrooms: bathrooms ? parseFloat(bathrooms) : null,
    square_footage: squareFootage ? parseInt(squareFootage, 10) : null,
    year_built: yearBuilt ? parseInt(yearBuilt, 10) : null,
    lot_size: lotSize || null,
    has_pool: hasPool
  };
}

/**
 * Fetches physical property characteristics (bed/bath, sqft, year built,
 * pool status) for a single parcel. Same on-demand, one-at-a-time pattern
 * as fetchEstimatedValue above, and for the same reason.
 */
async function fetchPropertyDetails(apn) {
  if (!apn) throw new Error('No parcel number (APN) on file for this record - cannot look up property details.');
  const mca = require('./maricopaClient');
  const response = await mca.getParcel(apn);
  return extractPropertyFeatures(response);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Pulls matching sale records from the county API for a search term, filtered
 * to sales within the lookback window. Read-only - makes no database writes,
 * so it's safe to call repeatedly for a preview screen. Paginates through
 * every page of results the county's search endpoint returns.
 *
 * @returns {Promise<Array<{apn, address, city, state, zip, purchase_date, sale_price, owner_name}>>}
 */
async function fetchRecentSales(searchTerm, lookbackDays) {
  const cutoff = daysAgo(lookbackDays);
  const results = [];

  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await mca.searchProperty(searchTerm, page);

    const records = response.RealProperty || response.Real_Property || response.results || [];
    const total = response.Total || response.total || records.length;

    if (records.length === 0) {
      hasMore = false;
      break;
    }

    for (const record of records) {
      const { saleDate, salePrice } = extractSaleInfo(record);
      if (!saleDate || isNaN(saleDate.getTime()) || saleDate < cutoff) continue;

      const addr = extractAddress(record);
      if (!addr.address) continue;

      results.push({
        apn: extractApn(record),
        address: addr.address,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        purchase_date: saleDate.toISOString().slice(0, 10),
        sale_price: salePrice ? parseFloat(salePrice) : null,
        owner_name: extractOwnerName(record)
      });
    }

    hasMore = page * 25 < total;
    page++;
  }

  return results;
}

module.exports = {
  fetchRecentSales,
  fetchEstimatedValue,
  fetchPropertyDetails,
  extractSaleInfo,
  extractAddress,
  extractOwnerName,
  extractApn,
  extractLatestValuation,
  extractPropertyFeatures,
  daysAgo
};
