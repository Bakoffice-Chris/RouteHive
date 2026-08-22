exports.up = function (knex) {
  return knex.schema
    .alterTable('leads', (t) => {
      // These live on the lead itself (the house), not on a route_stop, so
      // they persist across however many routes/visits a house ends up on.
      t.boolean('visited').notNullable().defaultTo(false);
      t.boolean('has_solar').notNullable().defaultTo(false);
      t.boolean('no_further_attempt').notNullable().defaultTo(false);
    })
    .createTable('lead_notes', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('(lower(hex(randomblob(16))))'));
      t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      t.uuid('lead_id').notNullable().references('id').inTable('leads').onDelete('CASCADE');
      t.uuid('author_id').references('id').inTable('users').onDelete('SET NULL');
      t.text('body').notNullable();
      t.timestamps(true, true); // created_at is the "date entered" for the note
      t.index(['tenant_id', 'lead_id']);
    });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('lead_notes').alterTable('leads', (t) => {
    t.dropColumn('visited');
    t.dropColumn('has_solar');
    t.dropColumn('no_further_attempt');
  });
};
