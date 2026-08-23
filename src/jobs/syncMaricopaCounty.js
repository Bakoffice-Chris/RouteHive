const db = require('../db');
const { fetchRecentSales } = require('../lib/maricopaSales');

/**
 * Pulls recently-sold residential parcels from the Maricopa County Assessor
 * API for a given search term (subdivision name, zip code, or area) and
 * loads them into raw_leads as new-home-purchase leads.
 *
 * IMPORTANT - untested against live data (see maricopaClient.js note): this
 * environment can't reach mcassessor.maricopa.gov to verify response shapes.
 * The field-extraction logic (in src/lib/maricopaSales.js) is defensive but
 * you should run this once against a real token, log the raw response, and
 * adjust it to match what actually comes back before relying on it.
 *
 * This is the direct auto-sync path (writes straight to the database, no
 * review step) - for a review-before-import flow, see the ScoutHive
 * preview/import endpoints in src/routes/leads.js, which share the same
 * fetchRecentSales() extraction logic from src/lib/maricopaSales.js.
 *
 * Usage: node src/jobs/syncMaricopaCounty.js "85028" my-tenant-id [lookbackDays]
 */

const DEFAULT_LOOKBACK_DAYS = 30;

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

  console.log(`Syncing Maricopa County records for "${searchTerm}", last ${lookbackDays} days...`);

  const sales = await fetchRecentSales(searchTerm, lookbackDays);

  let totalInserted = 0;
  let totalSkippedDuplicate = 0;

  for (const sale of sales) {
    if (sale.apn) {
      const dup = await db('raw_leads')
        .where({ tenant_id: tenantId, source_id: source.id, external_ref: sale.apn })
        .first();
      if (dup) {
        totalSkippedDuplicate++;
        continue;
      }
    }

    const [rawLead] = await db('raw_leads')
      .insert({
        tenant_id: tenantId,
        source_id: source.id,
        external_ref: sale.apn,
        address: sale.address,
        city: sale.city,
        state: sale.state,
        zip: sale.zip,
        purchase_date: sale.purchase_date,
        sale_price: sale.sale_price,
        owner_name_raw: sale.owner_name,
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

  await db('data_sources').where({ id: source.id }).update({ last_synced_at: db.fn.now() });

  const summary = { totalFound: sales.length, totalInserted, totalSkippedDuplicate };
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
