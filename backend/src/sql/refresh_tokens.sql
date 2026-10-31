-- ==============================================================================
-- SQL Queries: Refresh Token Operations
-- ==============================================================================

-- 1. Create Refresh Token
-- Stores SHA-256 hash of newly generated token
INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
VALUES ($1, $2, $3)
RETURNING id, user_id, token_hash, expires_at, revoked_at, created_at;

-- 2. Find Refresh Token by Hash
SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
FROM refresh_tokens
WHERE token_hash = $1
LIMIT 1;

-- 3. Find Refresh Token by Hash (With FOR UPDATE Row Lock)
-- Applied during rotation to serialize concurrent refresh requests
SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
FROM refresh_tokens
WHERE token_hash = $1
LIMIT 1
FOR UPDATE;

-- 4. Revoke Refresh Token by Hash
UPDATE refresh_tokens
SET revoked_at = CURRENT_TIMESTAMP
WHERE token_hash = $1 AND revoked_at IS NULL
RETURNING id, user_id, token_hash, expires_at, revoked_at;

-- 5. Revoke ALL Refresh Tokens for User (Token Reuse Detection)
UPDATE refresh_tokens
SET revoked_at = CURRENT_TIMESTAMP
WHERE user_id = $1 AND revoked_at IS NULL;

-- 6. Purge Expired and Revoked Tokens Older Than 30 Days
DELETE FROM refresh_tokens
WHERE expires_at < NOW() - INTERVAL '30 days'
   OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days');
