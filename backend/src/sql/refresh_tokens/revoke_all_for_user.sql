-- Revoke all active refresh tokens for a user
-- Invoked upon Token Reuse Detection (attempting to use an already revoked token)
UPDATE refresh_tokens
SET revoked_at = CURRENT_TIMESTAMP
WHERE user_id = $1 AND revoked_at IS NULL;
