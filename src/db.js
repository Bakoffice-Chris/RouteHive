const knexConfig = require('../knexfile');
const knex = require('knex');

const env = knexConfig.activeEnv || 'development';
const db = knex(knexConfig[env]);

module.exports = db;
