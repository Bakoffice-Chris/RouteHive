require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

async function seed() {
  console.log('Seeding demo data...');

  const [tenant] = await db('tenants').insert({ name: 'Demo Sales Co' }).returning('*');

  const password_hash = await bcrypt.hash('password123', 10);

  const [admin] = await db('users')
    .insert({ tenant_id: tenant.id, name: 'Alex Admin', email: 'admin@demo.com', password_hash, role: 'admin' })
    .returning('*');

  const [manager] = await db('users')
    .insert({ tenant_id: tenant.id, name: 'Morgan Manager', email: 'manager@demo.com', password_hash, role: 'manager' })
    .returning('*');

  const [rep] = await db('users')
    .insert({ tenant_id: tenant.id, name: 'Riley Rep', email: 'rep@demo.com', password_hash, role: 'rep' })
    .returning('*');

  const [territory] = await db('territories')
    .insert({ tenant_id: tenant.id, name: 'North Phoenix', zip_codes: JSON.stringify(['85028', '85032', '85050']) })
    .returning('*');

  const [source] = await db('data_sources')
    .insert({ tenant_id: tenant.id, provider_name: 'Seed script', type: 'csv_import' })
    .returning('*');

  const sampleAddresses = [
    { address: '123 E Sunnyside Dr', city: 'Phoenix', state: 'AZ', zip: '85028', lat: 33.586, lng: -112.011 },
    { address: '456 W Cactus Rd', city: 'Phoenix', state: 'AZ', zip: '85028', lat: 33.591, lng: -112.021 },
    { address: '789 N Tatum Blvd', city: 'Phoenix', state: 'AZ', zip: '85032', lat: 33.601, lng: -112.032 }
  ];

  for (const addr of sampleAddresses) {
    const [rawLead] = await db('raw_leads')
      .insert({
        tenant_id: tenant.id,
        source_id: source.id,
        ...addr,
        purchase_date: '2026-08-01',
        status: 'new'
      })
      .returning('*');

    await db('leads').insert({
      tenant_id: tenant.id,
      raw_lead_id: rawLead.id,
      territory_id: territory.id,
      disposition: 'not_contacted'
    });
  }

  console.log('Done. Login with:');
  console.log('  admin@demo.com / password123 (admin)');
  console.log('  manager@demo.com / password123 (manager)');
  console.log('  rep@demo.com / password123 (rep)');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
