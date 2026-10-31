const db = require('../config/database');
const sql = require('../sql');

/**
 * User Model
 * Executes queries defined in src/sql/users/
 * All queries strictly use parameterized statements ($1, $2, etc.) to prevent SQL injection.
 */
class UserModel {
  /**
   * Find a user by email address.
   *
   * @param {string} email
   * @returns {Promise<Object|null>} User record or null if not found
   */
  static async findByEmail(email) {
    const result = await db.query(sql.users.findByEmail, [email.trim()]);
    return result.rows[0] || null;
  }

  /**
   * Find a user by primary key ID.
   * Returns user object without password_hash for secure profile responses.
   *
   * @param {number|string} id
   * @returns {Promise<Object|null>} User record or null
   */
  static async findById(id) {
    const result = await db.query(sql.users.findById, [id]);
    return result.rows[0] || null;
  }

  /**
   * Create and insert a new user with hashed password.
   *
   * @param {Object} userData
   * @param {string} userData.name
   * @param {string} userData.email
   * @param {string} userData.passwordHash - bcrypt hashed password
   * @returns {Promise<Object>} Newly created user (excluding password_hash)
   */
  static async create({ name, email, passwordHash }) {
    const result = await db.query(sql.users.create, [
      name.trim(),
      email.trim(),
      passwordHash,
    ]);
    return result.rows[0];
  }
}

module.exports = UserModel;
