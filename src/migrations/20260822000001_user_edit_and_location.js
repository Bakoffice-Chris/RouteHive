exports.up = function (knex) {
  return knex.schema.alterTable('users', (t) => {
    t.boolean('active').notNullable().defaultTo(true);
    // Last known location - only ever populated if the rep has opted in via
    // the toggle in the employee app. Foreground-only (see employee app
    // README) - this is not silent background tracking.
    t.float('last_lat');
    t.float('last_lng');
    t.timestamp('last_location_at');
    t.boolean('location_sharing_enabled').notNullable().defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('users', (t) => {
    t.dropColumn('active');
    t.dropColumn('last_lat');
    t.dropColumn('last_lng');
    t.dropColumn('last_location_at');
    t.dropColumn('location_sharing_enabled');
  });
};
