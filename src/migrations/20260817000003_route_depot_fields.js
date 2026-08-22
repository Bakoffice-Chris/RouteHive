exports.up = function (knex) {
  return knex.schema.alterTable('routes', (t) => {
    t.enu('build_mode', ['manual', 'endpoints', 'radius']).notNullable().defaultTo('manual');
    t.float('start_lat');
    t.float('start_lng');
    t.string('start_label'); // human-readable address or "ZIP 85028 centroid"
    t.float('end_lat');
    t.float('end_lng');
    t.string('end_label');
    t.string('center_zip'); // set when build_mode = 'radius'
    t.float('radius_miles'); // set when build_mode = 'radius'
    t.float('estimated_distance_miles'); // rough total from the optimizer, not a road-network distance
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('routes', (t) => {
    t.dropColumn('build_mode');
    t.dropColumn('start_lat');
    t.dropColumn('start_lng');
    t.dropColumn('start_label');
    t.dropColumn('end_lat');
    t.dropColumn('end_lng');
    t.dropColumn('end_label');
    t.dropColumn('center_zip');
    t.dropColumn('radius_miles');
    t.dropColumn('estimated_distance_miles');
  });
};
