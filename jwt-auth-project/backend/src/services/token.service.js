const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const RefreshTokenModel = require('../models/refreshToken.model');
const logger = require('../utils/logger');

// Access Token configuration
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes as per specification
const REFRESH_TOKEN_EXPIRY_DAYS = 7; // 7 days lifespan

class TokenService {
  /**
   * Generate short-lived JWT Access Token (stored ONLY in React memory).
   *
   * @param {Object} user - User payload { id, email, name }
   * @returns {string} Signed JWT
   */
  static generateAccessToken(user) {
    if (!process.env.ACCESS_TOKEN_SECRET) {
      throw new Error('ACCESS_TOKEN_SECRET environment variable is missing.');
    }

    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
    };

    return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'jwt-auth-project',
      audience: 'jwt-auth-client',
    });
  }

  /**
   * Verify an Access Token and return decoded claims.
   *
   * @param {string} token
   * @returns {Object} Decoded payload
   */
  static verifyAccessToken(token) {
    return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, {
      issuer: 'jwt-auth-project',
      audience: 'jwt-auth-client',
    });
  }

  /**
   * Generate an unguessable, cryptographically secure random refresh token.
   *
   * @returns {string} 80-character hex string (40 random bytes)
   */
  static generateRefreshToken() {
    return crypto.randomBytes(40).toString('hex');
  }

  /**
   * Compute deterministic SHA-256 hash of a refresh token.
   * Only the hash is stored in PostgreSQL to ensure the raw token is never leaked via database dump.
   *
   * @param {string} token
   * @returns {string} 64-character SHA-256 hex string
   */
  static hashToken(token) {
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid token format for hashing.');
    }
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Create a new refresh token and persist its SHA-256 hash to PostgreSQL.
   *
   * @param {string|number} userId
   * @param {import('pg').PoolClient} [client] - Optional active transaction client
   * @returns {Promise<{ rawToken: string, expiresAt: Date }>}
   */
  static async createAndStoreRefreshToken(userId, client = null) {
    const rawToken = this.generateRefreshToken();
    const tokenHash = this.hashToken(rawToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await RefreshTokenModel.create(
      {
        userId,
        tokenHash,
        expiresAt,
      },
      client
    );

    return { rawToken, expiresAt };
  }

  /**
   * Rotate a Refresh Token within a dedicated PostgreSQL Transaction.
   *
   * SECURITY ENFORCEMENTS:
   * 1. Row Locking (`FOR UPDATE`): Serializes concurrent refresh requests, preventing race conditions.
   * 2. Reuse Detection: If a token with revoked_at != null is presented, it indicates potential token theft.
   *    Immediately invalidates ALL active tokens for that user and rejects the request.
   * 3. Expiration Check: Expired tokens are rejected.
   * 4. Single-use Invalidation: The current token is immediately marked revoked.
   * 5. Atomicity: New refresh token insertion and old token revocation occur in the same commit.
   *
   * @param {string} rawToken - Raw refresh token from HttpOnly cookie
   * @returns {Promise<{ newRawToken: string, userId: string|number }>}
   */
  static async rotateRefreshToken(rawToken) {
    if (!rawToken) {
      const err = new Error('Refresh token is required');
      err.statusCode = 401;
      throw err;
    }

    const tokenHash = this.hashToken(rawToken);
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Lock row to prevent race conditions from concurrent duplicate refresh requests
      const tokenRecord = await RefreshTokenModel.findByTokenHash(
        tokenHash,
        client,
        true // FOR UPDATE lock
      );

      if (!tokenRecord) {
        const err = new Error('Invalid refresh token.');
        err.statusCode = 401;
        throw err;
      }

      // CRITICAL: Token Reuse Detection
      // If the token was already revoked, an attacker might be attempting to reuse a stolen token!
      if (tokenRecord.revoked_at !== null) {
        logger.warn(
          'security',
          `Token reuse detected for User ID ${tokenRecord.user_id}! Revoking all sessions.`
        );
        // Invalidate all active sessions for this compromised user
        await RefreshTokenModel.revokeAllForUser(tokenRecord.user_id, client);
        await client.query('COMMIT');

        const err = new Error(
          'Security alert: Compromised session detected. All sessions revoked. Please log in again.'
        );
        err.statusCode = 403;
        throw err;
      }

      // Check token expiration
      if (new Date(tokenRecord.expires_at) < new Date()) {
        // Mark as revoked
        await RefreshTokenModel.revokeByTokenHash(tokenHash, client);
        await client.query('COMMIT');

        const err = new Error('Refresh token has expired. Please log in again.');
        err.statusCode = 401;
        throw err;
      }

      // Step 1: Revoke the old token (single-use rotation policy)
      await RefreshTokenModel.revokeByTokenHash(tokenHash, client);

      // Step 2: Generate and save brand new refresh token
      const { rawToken: newRawToken } = await this.createAndStoreRefreshToken(
        tokenRecord.user_id,
        client
      );

      // Commit the transaction atomically
      await client.query('COMMIT');

      return {
        newRawToken,
        userId: tokenRecord.user_id,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Revoke a refresh token (e.g. upon user logout).
   *
   * @param {string} rawToken
   * @returns {Promise<boolean>}
   */
  static async revokeRefreshToken(rawToken) {
    if (!rawToken) return false;
    try {
      const tokenHash = this.hashToken(rawToken);
      await RefreshTokenModel.revokeByTokenHash(tokenHash);
      return true;
    } catch (err) {
      logger.error('token', `Error revoking token: ${err.message}`);
      return false;
    }
  }
}

module.exports = TokenService;
