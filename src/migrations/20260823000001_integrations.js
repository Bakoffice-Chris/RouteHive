// Same client-aware UUID default used elsewhere - gen_random_uuid() is
// built into Postgres (since PG13); SQLite needs the hex/randomblob form.
function uuidDefault(knex) {
  const client = knex.client.config.client;
  if (client === 'pg' || client === 'postgresql') {
    return knex.raw('gen_random_uuid()');
  }
  return knex.raw('(lower(hex(randomblob(16))))');
}

exports.up = function (knex) {
  return knex.schema
    .createTable('api_keys', (t) => {
      t.uuid('id').primary().defaultTo(uuidDefault(knex));
      t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      t.string('name').notNullable(); // human label, e.g. "Zapier"
      t.string('key_hash').notNullable(); // sha256 hash - the raw key is never stored
      t.string('key_prefix').notNullable(); // first 8 chars, shown in the UI so admins can tell keys apart
      t.boolean('active').notNullable().defaultTo(true);
      t.timestamp('last_used_at');
      t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
      t.timestamps(true, true);
      t.index(['key_hash']);
    })
    .createTable('webhook_endpoints', (t) => {
      t.uuid('id').primary().defaultTo(uuidDefault(knex));
      t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      t.string('url').notNullable();
      t.string('secret').notNullable(); // used to HMAC-sign delivered payloads
      // Reserved for future filtering - currently every active webhook
      // receives every event type RouteHive fires (just 'lead.disposition_changed'
      // for now). Kept as a column so adding filtering later doesn't need a migration.
      t.string('event_types').notNullable().defaultTo('*');
      t.boolean('active').notNullable().defaultTo(true);
      t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
      t.timestamps(true, true);
    });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('webhook_endpoints').dropTableIfExists('api_keys');
};
