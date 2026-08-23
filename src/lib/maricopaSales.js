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

module.exports = { fetchRecentSales, extractSaleInfo, extractAddress, extractOwnerName, extractApn, daysAgo };
