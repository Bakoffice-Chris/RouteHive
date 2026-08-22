require('dotenv').config();

// Local dev uses SQLite (zero setup). Railway/production uses Postgres via DATABASE_URL,
// which Railway injects automatically when you add its Postgres plugin.
const isProd = !!process.env.DATABASE_URL;

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: './data/dev.sqlite3'
    },
    useNullAsDefault: true,
    migrations: {
      directory: './src/migrations'
    }
  },
  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    },
    migrations: {
      directory: './src/migrations'
    },
    pool: { min: 2, max: 10 }
  }
};

module.exports.activeEnv = isProd ? 'production' : 'development';
