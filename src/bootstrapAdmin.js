require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

/**
 * Creates the first tenant + admin account from environment variables, so
 * deploying doesn't require a manual API call or a request-building tool.
 * Safe to run on every deploy: if a tenant already exists, this does
 * nothing and exits quietly - it only ever creates the FIRST tenant.
 *
 * Required env vars (set these in Railway's Variables tab):
 *   ADMIN_EMAIL
 *   ADMIN_PASSWORD
 * Optional:
 *   ADMIN_NAME      (defaults to "Admin")
 *   TENANT_NAME     (defaults to "My Company")
 *
 * If ADMIN_EMAIL/ADMIN_PASSWORD aren't set, this script just exits without
 * doing anything - it's opt-in, not required.
 */
async function bootstrapAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, TENANT_NAME } = process.env;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log('Bootstrap: ADMIN_EMAIL / ADMIN_PASSWORD not set, skipping.');
    return;
  }

  const existingTenant = await db('tenants').first();
  if (existingTenant) {
    console.log('Bootstrap: a tenant already exists, skipping (this only creates the first one).');
    return;
  }

  const existingUser = await db('users').where({ email: ADMIN_EMAIL }).first();
  if (existingUser) {
    console.log(`Bootstrap: a user with email ${ADMIN_EMAIL} already exists, skipping.`);
    return;
  }

  const [tenant] = await db('tenants').insert({ name: TENANT_NAME || 'My Company' }).returning('*');
  const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const [user] = await db('users')
    .insert({
      tenant_id: tenant.id,
      name: ADMIN_NAME || 'Admin',
      email: ADMIN_EMAIL,
      password_hash,
      role: 'admin'
    })
    .returning('*');

  console.log(`Bootstrap: created tenant "${tenant.name}" and admin account for ${user.email}.`);
}

bootstrapAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Bootstrap failed:', err.message);
    // Don't crash the deploy over this - the app can still run and the
    // account can be created manually if something's wrong here.
    process.exit(0);
  });
