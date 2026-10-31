-- Revoke single refresh token by marking revoked_at timestamp
-- Used upon successful rotation and single session logout
UPDATE refresh_tokens
SET revoked_at = CURRENT_TIMESTAMP
WHERE token_hash = $1 AND revoked_at IS NULL
RETURNING id, user_id, token_hash, expires_at, revoked_at;
