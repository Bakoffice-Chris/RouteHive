/**
 * Adds "senior" to the set of allowed values for users.role. Confirmed
 * against a real Postgres database before writing this that the column
 * uses a plain CHECK constraint (knex's default for .enu() without
 * useNative), named users_role_check - not a native Postgres ENUM type,
 * which would need a different (ALTER TYPE ... ADD VALUE) approach.
 *
 * IF EXISTS on the drop is defensive in case a future knex/pg version ever
 * names it differently - the migration would then just add the constraint
 * fresh rather than failing outright. SQLite (local dev) doesn't enforce
 * this the same way, so nothing needed there.
 */
exports.up = async function (knex) {
  const client = knex.client.config.client;
  if (client === 'pg' || client === 'postgresql') {
    await knex.raw('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
    await knex.raw("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','manager','rep','senior'))");
  }
};

exports.down = async function (knex) {
  const client = knex.client.config.client;
  if (client === 'pg' || client === 'postgresql') {
    await knex.raw('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
    await knex.raw("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','manager','rep'))");
  }
};
