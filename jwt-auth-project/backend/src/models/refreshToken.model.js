const db = require('../config/database');
const sql = require('../sql');

/**
 * Refresh Token Model
 * Executes queries defined in src/sql/refresh_tokens/
 * All queries strictly use parameterized statements ($1, $2, etc.) to prevent SQL injection.
 * Supports passing an active PostgreSQL transaction client to ensure atomic operations.
 */
class RefreshTokenModel {
  /**
   * Insert a new hashed refresh token into the database.
   *
   * @param {Object} tokenData
   * @param {string|number} tokenData.userId - User ID foreign key
   * @param {string} tokenData.tokenHash - SHA-256 hex hash of the refresh token
   * @param {Date} tokenData.expiresAt - Expiration timestamp
   * @param {import('pg').PoolClient} [client] - Optional active transaction client
   * @returns {Promise<Object>} Created record
   */
  static async create({ userId, tokenHash, expiresAt }, client = null) {
    const params = [userId, tokenHash, expiresAt];
    const result = client
      ? await client.query(sql.refreshTokens.create, params)
      : await db.query(sql.refreshTokens.create, params);

    return result.rows[0];
  }

  /**
   * Find a refresh token record by its SHA-256 hash.
   * If client is provided and forUpdate is true, locks the row with SELECT ... FOR UPDATE
   * to serialize concurrent rotation attempts.
   *
   * @param {string} tokenHash - SHA-256 hash
   * @param {import('pg').PoolClient} [client] - Optional active transaction client
   * @param {boolean} [forUpdate=false] - Whether to apply row-level locking
   * @returns {Promise<Object|null>} Token record or null
   */
  static async findByTokenHash(tokenHash, client = null, forUpdate = false) {
    const query = forUpdate && client
      ? sql.refreshTokens.findByHashForUpdate
      : sql.refreshTokens.findByHash;

    const params = [tokenHash];
    const result = client
      ? await client.query(query, params)
      : await db.query(query, params);

    return result.rows[0] || null;
  }

  /**
   * Revoke a specific refresh token by setting revoked_at timestamp.
   *
   * @param {string} tokenHash - SHA-256 hash
   * @param {import('pg').PoolClient} [client] - Optional active transaction client
   * @returns {Promise<Object|null>} Updated record
   */
  static async revokeByTokenHash(tokenHash, client = null) {
    const params = [tokenHash];
    const result = client
      ? await client.query(sql.refreshTokens.revokeByHash, params)
      : await db.query(sql.refreshTokens.revokeByHash, params);

    return result.rows[0] || null;
  }

  /**
   * Revoke ALL refresh tokens for a user.
   * Invoked upon Token Reuse Detection (when an already revoked token is re-submitted,
   * indicating potential compromise/theft of tokens).
   *
   * @param {string|number} userId
   * @param {import('pg').PoolClient} [client] - Optional active transaction client
   * @returns {Promise<number>} Number of tokens revoked
   */
  static async revokeAllForUser(userId, client = null) {
    const params = [userId];
    const result = client
      ? await client.query(sql.refreshTokens.revokeAllForUser, params)
      : await db.query(sql.refreshTokens.revokeAllForUser, params);

    return result.rowCount;
  }

  /**
   * Clean up expired and revoked tokens older than 30 days (housekeeping).
   *
   * @returns {Promise<number>} Deleted count
   */
  static async purgeExpiredTokens() {
    const result = await db.query(sql.refreshTokens.purgeExpired);
    return result.rowCount;
  }
}

module.exports = RefreshTokenModel;
