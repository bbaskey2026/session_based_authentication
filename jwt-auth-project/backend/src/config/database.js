const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Ensure .env is loaded regardless of whether node is run from /backend or /backend/src
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const logger = require('../utils/logger');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('[Database Config Error] DATABASE_URL is missing in environment variables. Please check your .env file.');
}
// Initialize PostgreSQL connection pool
const pool = new Pool({
  connectionString: databaseUrl,
  max: 20, // Max clients in connection pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Return an error after 5s if connection cannot be established
});

// Pool event listeners for monitoring connection health
pool.on('connect', () => {
  // Client connected successfully
});

pool.on('error', (err) => {
  logger.error('db', `Unexpected idle client error: ${err.message}`);
});

/**
 * Execute a parameterized SQL query using the connection pool.
 * Parameterized queries prevent SQL injection by separating code from data.
 *
 * @param {string} text - SQL query string with parameter placeholders ($1, $2, etc.)
 * @param {Array} params - Array of parameter values matching placeholders
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      // Optional query performance logging
      // logger.info('sql', `Executed in ${duration}ms: ${text.slice(0, 60)}...`);
    }
    return result;
  } catch (error) {
    logger.error('sql', `Failed executing query: ${error.message}`);
    throw error;
  }
};

/**
 * Acquire a dedicated client from the pool for manual transactions (BEGIN, COMMIT, ROLLBACK).
 * NOTE: The caller MUST release the client in a finally block: client.release().
 *
 * @returns {Promise<import('pg').PoolClient>}
 */
const getClient = async () => {
  const client = await pool.connect();
  return client;
};

module.exports = {
  pool,
  query,
  getClient,
};
