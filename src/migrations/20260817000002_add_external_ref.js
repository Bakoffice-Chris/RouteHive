exports.up = function (knex) {
  return knex.schema.alterTable('raw_leads', (t) => {
    t.string('external_ref'); // e.g. Maricopa APN - used to dedupe re-syncs
    t.index(['tenant_id', 'source_id', 'external_ref']);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('raw_leads', (t) => {
    t.dropColumn('external_ref');
  });
};
