function uuidDefault(knex) {
  const client = knex.client.config.client;
  if (client === 'pg' || client === 'postgresql') {
    return knex.raw('gen_random_uuid()');
  }
  return knex.raw('(lower(hex(randomblob(16))))');
}

exports.up = function (knex) {
  return knex.schema.createTable('appointments', (t) => {
    t.uuid('id').primary().defaultTo(uuidDefault(knex));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.uuid('lead_id').notNullable().references('id').inTable('leads').onDelete('CASCADE');
    t.uuid('rep_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('scheduled_at').notNullable();
    t.integer('duration_minutes').notNullable().defaultTo(30);
    t.text('notes');
    t.enu('status', ['scheduled', 'completed', 'cancelled', 'no_show']).notNullable().defaultTo('scheduled');
    // The 3.5-business-day booking window is enforced against created_at at
    // creation time - stored here explicitly (rather than relying on the
    // timestamps() created_at below) so a later reschedule can be
    // re-validated against the ORIGINAL booking time, not extended by
    // editing. See routes/appointments.js.
    t.timestamp('originally_booked_at').notNullable();
    t.timestamps(true, true);
    t.index(['tenant_id', 'rep_id', 'scheduled_at']);
    t.index(['tenant_id', 'scheduled_at']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('appointments');
};
