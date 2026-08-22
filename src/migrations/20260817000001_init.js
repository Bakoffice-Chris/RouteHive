exports.up = function (knex) {
  return knex.schema
    .createTable('tenants', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('(lower(hex(randomblob(16))))'));
      t.string('name').notNullable();
      t.string('plan').defaultTo('trial');
      t.timestamps(true, true);
    })
    .createTable('users', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('(lower(hex(randomblob(16))))'));
      t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      t.string('name').notNullable();
      t.string('email').notNullable();
      t.string('phone');
      t.string('password_hash').notNullable();
      t.enu('role', ['admin', 'manager', 'rep']).notNullable().defaultTo('rep');
      t.uuid('territory_id'); // set after territories table exists (FK added below)
      t.timestamps(true, true);
      t.unique(['tenant_id', 'email']);
    })
    .createTable('territories', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('(lower(hex(randomblob(16))))'));
      t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      t.string('name').notNullable();
      t.text('boundary_geojson'); // optional polygon; null = zip-list based
      t.text('zip_codes'); // JSON array string, simple MVP alternative to boundary
      t.timestamps(true, true);
    })
    .createTable('data_sources', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('(lower(hex(randomblob(16))))'));
      t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      t.string('provider_name').notNullable();
      t.enu('type', ['purchase_record', 'enrichment_api', 'csv_import']).notNullable();
      t.string('credentials_ref'); // reference/key name into env vars or secret store, never raw secret
      t.timestamp('last_synced_at');
      t.timestamps(true, true);
    })
    .createTable('raw_leads', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('(lower(hex(randomblob(16))))'));
      t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      t.uuid('source_id').references('id').inTable('data_sources').onDelete('SET NULL');
      t.string('address').notNullable();
      t.string('city');
      t.string('state');
      t.string('zip');
      t.float('lat');
      t.float('lng');
      t.date('purchase_date');
      t.decimal('sale_price', 12, 2);
      t.string('owner_name_raw');
      t.enu('status', ['new', 'enriching', 'enriched', 'enrichment_failed', 'duplicate'])
        .notNullable()
        .defaultTo('new');
      t.timestamps(true, true);
      t.index(['tenant_id', 'status']);
      t.index(['tenant_id', 'zip']);
    })
    .createTable('enriched_contacts', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('(lower(hex(randomblob(16))))'));
      t.uuid('raw_lead_id').notNullable().references('id').inTable('raw_leads').onDelete('CASCADE');
      t.string('full_name');
      // Reference-only fields: not wired to any dialer/SMS/email sender by design.
      // See README for the compliance rationale before connecting these to outbound tools.
      t.string('phone');
      t.enu('phone_type', ['mobile', 'landline', 'unknown']).defaultTo('unknown');
      t.string('email');
      t.boolean('dnc_flag').defaultTo(false); // unused in MVP; reserved for future calling/texting feature
      t.timestamp('dnc_checked_at');
      t.string('tcpa_consent_basis'); // unused in MVP; reserved for future calling/texting feature
      t.float('match_confidence');
      t.string('enrichment_provider');
      t.timestamp('enriched_at');
      t.timestamps(true, true);
    })
    .createTable('leads', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('(lower(hex(randomblob(16))))'));
      t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      t.uuid('raw_lead_id').notNullable().references('id').inTable('raw_leads').onDelete('CASCADE');
      t.uuid('territory_id').references('id').inTable('territories').onDelete('SET NULL');
      t.enu('disposition', [
        'not_contacted',
        'contacted',
        'appointment_set',
        'sold',
        'not_interested',
        'do_not_contact'
      ])
        .notNullable()
        .defaultTo('not_contacted');
      t.text('notes');
      t.timestamps(true, true);
      t.index(['tenant_id', 'disposition']);
    })
    .createTable('routes', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('(lower(hex(randomblob(16))))'));
      t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      t.string('name').notNullable();
      t.date('date').notNullable();
      t.uuid('assigned_rep_id').references('id').inTable('users').onDelete('SET NULL');
      t.uuid('territory_id').references('id').inTable('territories').onDelete('SET NULL');
      t.enu('status', ['draft', 'assigned', 'in_progress', 'completed']).notNullable().defaultTo('draft');
      t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
      t.timestamps(true, true);
      t.index(['tenant_id', 'assigned_rep_id', 'date']);
    })
    .createTable('route_stops', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('(lower(hex(randomblob(16))))'));
      t.uuid('route_id').notNullable().references('id').inTable('routes').onDelete('CASCADE');
      t.uuid('lead_id').notNullable().references('id').inTable('leads').onDelete('CASCADE');
      t.integer('sequence_number').notNullable();
      t.string('planned_arrival_window');
      t.timestamp('visited_at');
      t.enu('outcome', ['no_answer', 'spoke', 'appointment', 'sold', 'skip']);
      t.text('rep_notes');
      t.string('photo_url');
      t.timestamps(true, true);
      t.index(['route_id', 'sequence_number']);
    })
    .createTable('audit_logs', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('(lower(hex(randomblob(16))))'));
      t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      t.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
      t.string('action').notNullable();
      t.string('entity_type');
      t.string('entity_id');
      t.text('details');
      t.timestamps(true, true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('audit_logs')
    .dropTableIfExists('route_stops')
    .dropTableIfExists('routes')
    .dropTableIfExists('leads')
    .dropTableIfExists('enriched_contacts')
    .dropTableIfExists('raw_leads')
    .dropTableIfExists('data_sources')
    .dropTableIfExists('territories')
    .dropTableIfExists('users')
    .dropTableIfExists('tenants');
};
