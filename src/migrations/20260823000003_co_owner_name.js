exports.up = function (knex) {
  return knex.schema.alterTable('enriched_contacts', (t) => {
    t.string('co_owner_name');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('enriched_contacts', (t) => {
    t.dropColumn('co_owner_name');
  });
};
