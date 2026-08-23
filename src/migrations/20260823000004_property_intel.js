exports.up = function (knex) {
  return knex.schema.alterTable('raw_leads', (t) => {
    // Valuation
    t.decimal('estimated_value', 12, 2);
    t.integer('valuation_year');
    t.string('value_type'); // 'full_cash_value' | 'limited_property_value'
    // Property characteristics
    t.integer('bedrooms');
    t.float('bathrooms');
    t.integer('square_footage');
    t.integer('year_built');
    t.string('lot_size');
    t.boolean('has_pool'); // null = unknown/not looked up, not "no pool"
    t.timestamp('property_intel_fetched_at');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('raw_leads', (t) => {
    t.dropColumn('estimated_value');
    t.dropColumn('valuation_year');
    t.dropColumn('value_type');
    t.dropColumn('bedrooms');
    t.dropColumn('bathrooms');
    t.dropColumn('square_footage');
    t.dropColumn('year_built');
    t.dropColumn('lot_size');
    t.dropColumn('has_pool');
    t.dropColumn('property_intel_fetched_at');
  });
};
