-- ==============================================================================
-- Schema: Secure JWT Authentication Database
-- Target Database: jwt_auth_db
-- ==============================================================================

-- 1. Users Table
-- Stores user credentials and basic account metadata.
-- Password hash must be bcrypt generated with sufficient salt rounds.
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast user lookup by email during login
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);


-- 2. Refresh Tokens Table
-- CRITICAL SECURITY RULES:
-- 1. Never store the raw refresh token string.
-- 2. Store only the cryptographically secure SHA-256 hash.
-- 3. Revoked tokens remain recorded to detect and prevent token reuse attacks.
-- 4. Foreign key with ON DELETE CASCADE ensures user deletion cleans up all sessions.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index on user_id for quick session revocation across devices
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- Index on token_hash for rapid lookup during rotation/refresh requests
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
