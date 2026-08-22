const db = require('../db');
const mca = require('../lib/maricopaClient');

/**
 * Pulls recently-sold residential parcels from the Maricopa County Assessor
 * API for a given search term (subdivision name, zip code, or area) and
 * loads them into raw_leads as new-home-purchase leads.
 *
 * IMPORTANT - untested against live data (see maricopaClient.js note): this
 * environment can't reach mcassessor.maricopa.gov to verify response shapes.
 * The field-extraction logic below is defensive (checks several likely key
 * names) but you should run this once against a real token, log the raw
 * response, and adjust `extractSaleInfo` / `extractAddress` to match what
 * actually comes back before relying on it.
 *
 * Usage: node src/jobs/syncMaricopaCounty.js "85028" my-tenant-id [lookbackDays]
 */

const DEFAULT_LOOKBACK_DAYS = 30;

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Search results are undocumented in full by the county's PDF (it only
// gives endpoint shapes, not a sample payload). This checks the field names
// most consistent with the Assessor's public site and other integrations
// against this API. Verify against a real response and adjust as needed.
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

async function ensureDataSource(tenantId, searchTerm) {
  const existing = await db('data_sources')
    .where({ tenant_id: tenantId, provider_name: `Maricopa County Assessor: ${searchTerm}` })
    .first();
  if (existing) return existing;

  const [source] = await db('data_sources')
    .insert({
      tenant_id: tenantId,
      provider_name: `Maricopa County Assessor: ${searchTerm}`,
      type: 'purchase_record',
      credentials_ref: 'MCASSESSOR_API_TOKEN'
    })
    .returning('*');
  return source;
}

async function syncMaricopaCounty(tenantId, searchTerm, lookbackDays = DEFAULT_LOOKBACK_DAYS) {
  const source = await ensureDataSource(tenantId, searchTerm);
  const cutoff = daysAgo(lookbackDays);

  let page = 1;
  let totalFound = 0;
  let totalInserted = 0;
  let totalSkippedOld = 0;
  let totalSkippedDuplicate = 0;
  let hasMore = true;

  console.log(`Syncing Maricopa County records for "${searchTerm}", sales after ${cutoff.toISOString().slice(0, 10)}...`);

  while (hasMore) {
    const results = await mca.searchProperty(searchTerm, page);

    // Response shape per the search endpoint doc: a structured result set
    // with categories (Real Property, BPP, MH, Rentals, Subdivisions) plus
    // totals. Adjust this destructure once you've seen a real response.
    const records = results.RealProperty || results.Real_Property || results.results || [];
    const total = results.Total || results.total || records.length;

    if (records.length === 0) {
      hasMore = false;
      break;
    }

    for (const record of records) {
      totalFound++;
      const { saleDate, salePrice } = extractSaleInfo(record);
      const apn = extractApn(record);

      if (!saleDate || isNaN(saleDate.getTime()) || saleDate < cutoff) {
        totalSkippedOld++;
        continue;
      }

      if (apn) {
        const dup = await db('raw_leads')
          .where({ tenant_id: tenantId, source_id: source.id, external_ref: apn })
          .first();
        if (dup) {
          totalSkippedDuplicate++;
          continue;
        }
      }

      const addr = extractAddress(record);
      if (!addr.address) continue; // can't create a lead without an address

      const [rawLead] = await db('raw_leads')
        .insert({
          tenant_id: tenantId,
          source_id: source.id,
          external_ref: apn,
          address: addr.address,
          city: addr.city,
          state: addr.state,
          zip: addr.zip,
          purchase_date: saleDate.toISOString().slice(0, 10),
          sale_price: salePrice ? parseFloat(salePrice) : null,
          owner_name_raw: extractOwnerName(record),
          status: 'new'
        })
        .returning('*');

      await db('leads').insert({
        tenant_id: tenantId,
        raw_lead_id: rawLead.id,
        disposition: 'not_contacted'
      });

      totalInserted++;
    }

    hasMore = page * 25 < total;
    page++;
  }

  await db('data_sources').where({ id: source.id }).update({ last_synced_at: db.fn.now() });

  const summary = { totalFound, totalInserted, totalSkippedOld, totalSkippedDuplicate };
  console.log('Sync complete:', summary);
  return summary;
}

module.exports = { syncMaricopaCounty };

// Allow running directly: node src/jobs/syncMaricopaCounty.js "85028" <tenant_id> [lookbackDays]
if (require.main === module) {
  require('dotenv').config();
  const [searchTerm, tenantId, lookbackDays] = process.argv.slice(2);
  if (!searchTerm || !tenantId) {
    console.error('Usage: node src/jobs/syncMaricopaCounty.js "<search term>" <tenant_id> [lookbackDays]');
    process.exit(1);
  }
  syncMaricopaCounty(tenantId, searchTerm, lookbackDays ? parseInt(lookbackDays, 10) : undefined)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
