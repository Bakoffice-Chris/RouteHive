exports.up = function (knex) {
  return knex.schema.alterTable('appointments', (t) => {
    // Optional second attendee - a Senior invited to a final closing
    // meeting alongside the rep. ON DELETE SET NULL (not CASCADE) so
    // deactivating/removing a Senior account doesn't destroy the
    // appointment record itself, just detaches them from it.
    t.uuid('senior_id').references('id').inTable('users').onDelete('SET NULL');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('appointments', (t) => {
    t.dropColumn('senior_id');
  });
};
