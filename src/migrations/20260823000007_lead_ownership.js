exports.up = function (knex) {
  return knex.schema.alterTable('leads', (t) => {
    // Direct lead "owner" - who currently has this lead. Synced
    // automatically when a route gets assigned to a rep (see
    // PATCH /routes/:id/assign), but also directly editable/clearable by a
    // manager independent of any route - a lead can have an owner without
    // necessarily being on an active route right now.
    t.uuid('assigned_rep_id').references('id').inTable('users').onDelete('SET NULL');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('leads', (t) => {
    t.dropColumn('assigned_rep_id');
  });
};
