-- Cleanup old expired or revoked tokens older than 30 days
DELETE FROM refresh_tokens
WHERE expires_at < NOW() - INTERVAL '30 days'
   OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days');
