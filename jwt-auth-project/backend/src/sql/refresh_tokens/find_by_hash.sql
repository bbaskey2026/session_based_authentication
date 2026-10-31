-- Find refresh token by SHA-256 hash
SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
FROM refresh_tokens
WHERE token_hash = $1
LIMIT 1;
