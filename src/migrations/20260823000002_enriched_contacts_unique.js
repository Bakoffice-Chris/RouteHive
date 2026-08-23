/**
 * enriched_contacts was always meant to be one row per raw_lead (the
 * name-edit and enrichment code paths both check-then-insert-or-update),
 * but nothing enforced that at the database level. Found the gap
 * empirically: a manual duplicate insert during testing caused the
 * lead-detail query's unordered LEFT JOIN + first() to nondeterministically
 * pick between rows. This closes it properly.
 *
 * If duplicates already exist in a real database (shouldn't happen via the
 * app's own code, but could from a direct DB edit), keep only the most
 * recently updated row per raw_lead_id before adding the constraint, or
 * this migration will fail.
 */
exports.up = async function (knex) {
  const client = knex.client.config.client;

  // Clean up any pre-existing duplicates first, keeping the most recently
  // updated row per raw_lead_id, so the unique constraint can actually apply.
  if (client === 'pg' || client === 'postgresql') {
    await knex.raw(`
      DELETE FROM enriched_contacts a
      USING enriched_contacts b
      WHERE a.raw_lead_id = b.raw_lead_id
        AND a.updated_at < b.updated_at
    `);
    // Handles exact ties on updated_at (e.g. rows inserted in the same
    // transaction/timestamp) by keeping the lowest id deterministically.
    await knex.raw(`
      DELETE FROM enriched_contacts a
      USING enriched_contacts b
      WHERE a.raw_lead_id = b.raw_lead_id
        AND a.updated_at = b.updated_at
        AND a.id > b.id
    `);
  } else {
    // SQLite (local dev) - simpler cleanup since local dev data is disposable.
    await knex.raw(`
      DELETE FROM enriched_contacts
      WHERE id NOT IN (
        SELECT MAX(id) FROM enriched_contacts GROUP BY raw_lead_id
      )
    `);
  }

  await knex.schema.alterTable('enriched_contacts', (t) => {
    t.unique(['raw_lead_id']);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('enriched_contacts', (t) => {
    t.dropUnique(['raw_lead_id']);
  });
};
