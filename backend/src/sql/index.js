const fs = require('fs');
const path = require('path');

/**
 * SQL Query Loader
 * Loads pure .sql files synchronously once at module initialization time,
 * providing zero-runtime-overhead cached SQL queries for models.
 */

const readQuery = (relativePath) => {
  const filePath = path.join(__dirname, relativePath);
  return fs.readFileSync(filePath, 'utf8').trim();
};

const sql = {
  // Schema initialization
  schema: readQuery('schema.sql'),

  // Users domain queries
  users: {
    findByEmail: readQuery('users/find_by_email.sql'),
    findById: readQuery('users/find_by_id.sql'),
    create: readQuery('users/create_user.sql'),
  },

  // Refresh tokens domain queries
  refreshTokens: {
    create: readQuery('refresh_tokens/create_token.sql'),
    findByHash: readQuery('refresh_tokens/find_by_hash.sql'),
    findByHashForUpdate: readQuery('refresh_tokens/find_by_hash_for_update.sql'),
    revokeByHash: readQuery('refresh_tokens/revoke_by_hash.sql'),
    revokeAllForUser: readQuery('refresh_tokens/revoke_all_for_user.sql'),
    purgeExpired: readQuery('refresh_tokens/purge_expired.sql'),
  },
};

module.exports = sql;
