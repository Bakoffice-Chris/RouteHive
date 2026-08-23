function uuidDefault(knex) {
  const client = knex.client.config.client;
  if (client === 'pg' || client === 'postgresql') {
    return knex.raw('gen_random_uuid()');
  }
  return knex.raw('(lower(hex(randomblob(16))))');
}

exports.up = function (knex) {
  return knex.schema
    .createTable('rep_availability', (t) => {
      t.uuid('id').primary().defaultTo(uuidDefault(knex));
      t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      t.uuid('rep_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.integer('day_of_week').notNullable(); // 0 = Sunday .. 6 = Saturday
      t.string('start_time').notNullable(); // "HH:MM", 24-hour
      t.string('end_time').notNullable();
      t.boolean('active').notNullable().defaultTo(true);
      t.timestamps(true, true);
      t.index(['tenant_id', 'rep_id']);
    })
    .createTable('booking_links', (t) => {
      t.uuid('id').primary().defaultTo(uuidDefault(knex));
      t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      t.uuid('lead_id').notNullable().references('id').inTable('leads').onDelete('CASCADE');
      t.uuid('rep_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
      // Random opaque token, not the row id, so the public URL doesn't leak
      // a guessable/sequential identifier.
      t.string('token').notNullable().unique();
      t.timestamp('expires_at').notNullable();
      t.uuid('appointment_id').references('id').inTable('appointments').onDelete('SET NULL');
      t.timestamps(true, true);
      t.index(['token']);
    });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('booking_links').dropTableIfExists('rep_availability');
};
